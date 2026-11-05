#!/usr/bin/env bash
# SYNCED FROM wow-core — edit there. Ubuntu 24.04 Codex universal image.
# Setup is diagnostic, never a test verdict. No log or plan is written to git.
set +e
set +u
set +x
set +o pipefail
trap 'trap - EXIT; exit 0' EXIT
LOG=/tmp/cloud-setup.log
log() { printf 'cloud-setup: %s\n' "$*" | tee -a "$LOG"; }
# Hard ceiling for the WHOLE script, including unbounded steps (node, corepack):
# a consumer's CI environment still ERRORed at ~1 h with per-step limits and a step budget.
# Re-exec once under timeout; the inner run does the work.
if [[ -z ${WOW_SETUP_WRAPPED:-} && " $* " != *" --dry-run "* && "$(uname -s)" == Linux ]] && command -v timeout >/dev/null 2>&1; then
  ceiling=$(( ${CLOUD_SETUP_BUDGET:-1500} + 300 ))
  WOW_SETUP_WRAPPED=1 timeout --kill-after=15s "${ceiling}s" bash "${BASH_SOURCE[0]}" "$@"
  status=$?
  if [[ $status == 124 || $status == 137 ]]; then log "setup FAILED (hard ceiling ${ceiling}s reached; see /tmp/cloud-setup.log)"; fi
  exit 0
fi
dry_run=false
for arg in "$@"; do
  case "$arg" in
    --dry-run) dry_run=true ;;
    *) log 'arguments FAILED (only --dry-run is supported)'; exit 0 ;;
  esac
done

# Read the shared declaration once. Explicit CLOUD_* values, including empty
# opt-outs, beat project configuration; old repositories need no declaration.
scripts_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
node_override=${CLOUD_NODE_VERSION+x}; node_explicit=${CLOUD_NODE_VERSION:-}
pg_override=${CLOUD_POSTGRES+x}; pg_explicit=${CLOUD_POSTGRES:-}
db_override=${CLOUD_POSTGRES_DBS+x}; db_explicit=${CLOUD_POSTGRES_DBS:-}
prepare_override=${CLOUD_PREPARE+x}; prepare_explicit=${CLOUD_PREPARE:-}
WOW_CLOUD_ENV_LIBRARY=1 source "$scripts_dir/cloud-env.sh"
wow_cloud_proxy
if [[ -n ${NODE_USE_ENV_PROXY:-} ]]; then log 'proxy ok (Node/npm routed through HTTPS_PROXY)'; fi
# apt ignores HTTPS_PROXY and sudo drops proxy variables, so apt downloads went
# direct and waited out long timeouts until Codex killed setup (a consumer CI environment
# 2026-10-05, ERROR after ~1 h). Configure apt itself, with short timeouts.
apt_proxy() {
  local conf=/etc/apt/apt.conf.d/99wow-cloud-proxy proxy=${https_proxy:-${HTTPS_PROXY:-}}
  [[ -d /etc/apt/apt.conf.d ]] || return 0
  {
    if [[ -n "$proxy" ]]; then
      printf 'Acquire::http::Proxy "%s";\n' "${http_proxy:-${HTTP_PROXY:-$proxy}}"
      printf 'Acquire::https::Proxy "%s";\n' "$proxy"
    fi
    printf 'Acquire::Retries "2";\nAcquire::http::Timeout "30";\nAcquire::https::Timeout "30";\n'
  } | if [[ $(id -u) == 0 ]]; then tee "$conf" >/dev/null; else sudo -n tee "$conf" >/dev/null; fi
}
if ! wow_cloud_load; then log 'cloud.json FAILED (using overrides and auto-detection)'; fi

# Resolve the lowest satisfying major without installing a dependency. Common
# npm engine ranges: comparisons, caret, tilde, wildcards, hyphens and unions.
# Unsupported syntax fails visibly instead of guessing a runtime.
engine_major() {
  node <<'NODE'
const fs = require('fs');
try {
  const range = JSON.parse(fs.readFileSync('package.json', 'utf8')).engines?.node;
  if (!range) process.exit(0);
  const cmp = (a,b) => a[0]-b[0] || a[1]-b[1] || a[2]-b[2];
  const bounds = [];
  const groups = range.split('||').map(part => {
    part = part.trim().replace(/(\d+(?:\.\d+){0,2})\s+-\s+(\d+(?:\.\d+){0,2})/g,
      (_,a,b) => `>=${a} ${b.split('.').length === 3 ? '<=' + b : '<' + (b.split('.').length === 1 ? (+b+1) : b.split('.')[0]+'.'+(+b.split('.')[1]+1))}`);
    const tokens = part.replace(/([<>]=?|[~^=])\s+/g, '$1').split(/\s+/).filter(Boolean);
    return tokens.flatMap(token => {
      if (/^(\*|x)$/i.test(token)) return [];
      const m = token.match(/^(>=|<=|>|<|=|\^|~)?v?(\d+)(?:\.(\d+|x|\*))?(?:\.(\d+|x|\*))?$/i);
      if (!m) throw Error('unsupported range');
      const op=m[1] || '', n=[+m[2], /^\d+$/.test(m[3]||'') ? +m[3] : 0, /^\d+$/.test(m[4]||'') ? +m[4] : 0];
      const count = 1 + Number(/^\d+$/.test(m[3]||'')) + Number(/^\d+$/.test(m[4]||''));
      bounds.push(n);
      if (op==='^' || op==='~' || op==='' || op==='=') {
        if ((op==='' || op==='=') && count===3) return [v=>cmp(v,n)===0];
        const upper = op==='^' ? (count===1 || n[0]>0 ? [n[0]+1,0,0] : count===2 || n[1]>0 ? [0,n[1]+1,0] : [0,0,n[2]+1])
          : count===1 ? [n[0]+1,0,0] : [n[0],n[1]+1,0];
        bounds.push(upper);
        return [v=>cmp(v,n)>=0 && cmp(v,upper)<0];
      }
      if (op==='>' && count<3) {
        const next=count===1 ? [n[0]+1,0,0] : [n[0],n[1]+1,0]; bounds.push(next);
        return [v=>cmp(v,next)>=0];
      }
      if (op==='<=' && count<3) {
        const next=count===1 ? [n[0]+1,0,0] : [n[0],n[1]+1,0]; bounds.push(next);
        return [v=>cmp(v,next)<0];
      }
      return [v=>({'>=':cmp(v,n)>=0,'<=':cmp(v,n)<=0,'>':cmp(v,n)>0,'<':cmp(v,n)<0})[op]];
    });
  });
  // Every range boundary, plus its next patch, is enough to find a witness.
  for (let major=0; major<=200; major++) {
    const candidates=[[major,0,0], ...bounds.filter(v=>v[0]===major).flatMap(v=>[v,[v[0],v[1],v[2]+1]])];
    if (candidates.some(v=>groups.some(g=>g.every(test=>test(v))))) { console.log(major); process.exit(0); }
  }
  process.exit(1);
} catch { process.exit(1); }
NODE
}

node_target=${WOW_CLOUD_NODE:-}
node_source=cloud.json
if [[ -n "$node_override" ]]; then node_target=$node_explicit; node_source=CLOUD_NODE_VERSION; fi
if [[ -z "$node_target" && -f .nvmrc ]]; then
  node_target=$(tr -d '\r' < .nvmrc | sed -e 's/#.*//' -e '/^[[:space:]]*$/d' | head -n 1 | xargs)
  node_source=.nvmrc
fi
if [[ -z "$node_target" && -f package.json ]]; then
  node_target=$(engine_major)
  if [[ $? != 0 ]]; then log 'node-detect FAILED (cannot resolve package.json engines.node)'; fi
  node_source=engines.node
fi
if [[ -z "$node_target" ]]; then node_source=current; fi
if [[ -n "$node_target" && ! "$node_target" =~ ^(v?[0-9]+(\.[0-9]+){0,2}|lts/\*|lts/[a-z]+|node|stable)$ ]]; then
  log 'node-detect FAILED (invalid Node version)'; node_target=; node_source=current
fi
descriptor=
if [[ -f package.json ]]; then
  descriptor=$(node -e 'try{console.log(JSON.parse(require("fs").readFileSync("package.json","utf8")).packageManager||"")}catch{process.exit(1)}' 2>/dev/null)
  if [[ $? != 0 ]]; then log 'package-manager-detect FAILED (package.json unreadable or Node unavailable)'; fi
fi
manager=none
if [[ -f pnpm-lock.yaml || "$descriptor" == pnpm@* ]]; then manager=pnpm
elif [[ -f package-lock.json ]]; then manager=npm
elif [[ -f yarn.lock ]]; then manager=yarn
fi
install_plan=none
case "$manager" in
  pnpm) install_plan='pnpm install --frozen-lockfile' ;;
  npm) install_plan='npm ci' ;;
  yarn)
    if [[ "$descriptor" =~ ^yarn@([2-9]|[1-9][0-9])\. || -f .yarnrc.yml ]]; then install_plan='yarn install --immutable'
    else install_plan='yarn install --frozen-lockfile'; fi ;;
esac
pg_major=${WOW_CLOUD_POSTGRES:-}
pg_dbs=${WOW_CLOUD_POSTGRES_DBS:-}
prepare=${WOW_CLOUD_PREPARE:-}
need_pwsh=false
if [[ -f .claude/cloud.json ]] && grep -Eq '"(testCommand|lintCommand|typecheckCommand|prepare)"[[:space:]]*:[[:space:]]*"[^"]*pwsh|"requires"[[:space:]]*:[^]]*"pwsh"' .claude/cloud.json; then need_pwsh=true; fi
if [[ -n "$pg_override" ]]; then pg_major=$pg_explicit; fi
if [[ -n "$db_override" ]]; then pg_dbs=$db_explicit; fi
if [[ -n "$prepare_override" ]]; then prepare=$prepare_explicit; fi
if $dry_run; then
  log "plan node=${node_target:-current} source=$node_source ok"
  log 'plan corepack enable ok'
  $need_pwsh && log 'plan pwsh install-if-missing ok' || log 'plan pwsh=not-required ok'
  if [[ -f playwright.config.ts || -f playwright.config.js ]] || grep -q '"@playwright/test"\|"playwright"' package.json 2>/dev/null; then
    log 'plan playwright browsers install-if-missing ok'
  fi
  log "plan package-manager=$manager install=$install_plan ok"
  if [[ -n "$pg_major" ]]; then
    if [[ "$pg_major" =~ ^[0-9]+$ ]]; then log "plan postgres=$pg_major host=local-socket port=5432 databases=${pg_dbs:-none} password=redacted ok"
    else log 'plan postgres FAILED (CLOUD_POSTGRES must be a major number)'; fi
  else log 'plan postgres=disabled ok'; fi
  # Commands can contain credentials; the plan deliberately does not echo them.
  log "plan prepare=$([[ -n "$prepare" ]] && printf configured || printf disabled) ok"
  log 'plan environment=cloud.json exports + nvm PATH persisted ok'
  exit 0
fi

setup_node() {
  local current target_major
  target_major=${node_target#v}; target_major=${target_major%%.*}
  if [[ -z "$node_target" ]]; then command -v node >/dev/null; return; fi
  # nvm is part of the universal image; never download an installer into a shell.
  if [[ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]]; then . "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
  elif [[ -s "$HOME/.nvm/nvm.sh" ]]; then . "$HOME/.nvm/nvm.sh"; fi
  command -v nvm >/dev/null || return 1
  # Sourcing nvm can select its old default, so inspect Node after sourcing it.
  current=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null)
  if [[ "$current" != "$target_major" ]]; then nvm install "$node_target" || return; nvm use "$node_target" || return; fi
  # An exact patch pin is a real requirement, even when its major is active.
  if [[ "$node_target" =~ ^v?[0-9]+\.[0-9]+\.[0-9]+$ && "$(node --version)" != "v${node_target#v}" ]]; then
    nvm install "$node_target" || return; nvm use "$node_target" || return
  fi
  nvm alias default "$(node --version)"
}
run_step() {
  local step=$1 result; shift
  "$@" >> "$LOG" 2>&1; result=$?
  if [[ "$result" == 0 ]]; then log "$step ok"
  else log "$step FAILED (exit $result; details in /tmp/cloud-setup.log)"; fi
  return "$result"
}
# Steps that can block on the network or a database (install, Postgres, prepare)
# run in their own process group under a time limit. A step with no limit turned
# one failure into a silent 50-minute hang (a consumer, 2026-10-05).
# Only for steps that need no stdin and set no variables in this shell.
bounded_step() {
  local step=$1 limit=${CLOUD_STEP_TIMEOUT:-600} result marker pid dog remaining; shift
  # Whole-setup budget: Codex appears to kill tasks near ~1 h including setup
  # (a consumer: ERROR 3x at 50-60 min even with per-step limits). Once the budget
  # is spent, skip the remaining heavy steps so the agent phase still starts and
  # its receipt can report what happened.
  remaining=$(( ${CLOUD_SETUP_BUDGET:-1500} - SECONDS ))
  if (( remaining <= 0 )); then log "$step FAILED (skipped: setup budget ${CLOUD_SETUP_BUDGET:-1500}s spent)"; return 125; fi
  if (( remaining < limit )); then limit=$remaining; fi
  marker=$(mktemp 2>/dev/null || printf '/tmp/cloud-setup-step.%s' "$$")
  : > "$marker"
  set -m
  ( "$@" ) >> "$LOG" 2>&1 < /dev/null &
  pid=$!
  # The watchdog polls and exits within a second of the step ending, so no
  # long sleep outlives the step (an orphaned sleep held the caller's pipe open).
  (
    elapsed=0
    while kill -0 "$pid" 2>/dev/null; do
      if (( elapsed >= limit )); then
        printf timeout > "$marker"
        kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null
        sleep 5
        kill -KILL -- "-$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null
        break
      fi
      sleep 1; elapsed=$((elapsed + 1))
    done
  ) < /dev/null >/dev/null 2>&1 &
  dog=$!
  set +m
  wait "$pid"; result=$?
  wait "$dog" 2>/dev/null
  if [[ -s "$marker" ]]; then
    rm -f "$marker"
    log "$step FAILED (timed out after ${limit}s; details in /tmp/cloud-setup.log)"
    return 124
  fi
  rm -f "$marker"
  if [[ "$result" == 0 ]]; then log "$step ok"
  else log "$step FAILED (exit $result; details in /tmp/cloud-setup.log)"; fi
  return "$result"
}
if [[ $dry_run == false && "$(uname -s)" == Linux ]]; then run_step apt-proxy apt_proxy; fi
run_step node setup_node
persist_environment() {
  local destination=${HOME}/.wow-cloud-env content
  if [[ $(id -u) == 0 ]]; then destination=/etc/profile.d/wow-cloud.sh; fi
  content=$(wow_cloud_read --env-only) || return 1
  # Only non-secret env entries from git, never the full process environment.
  (umask 077; {
    printf '%s\n' '# Generated by wow-core cloud setup; non-secret project env only.'
    printf '%s\n' "$content"
    printf 'export NVM_DIR=%q\n' "${NVM_DIR:-$HOME/.nvm}"
    if [[ -n ${NODE_USE_ENV_PROXY:-} ]]; then printf 'export NODE_USE_ENV_PROXY=%q\n' "$NODE_USE_ENV_PROXY"; fi
    # The proxy bypass must reach agent shells too, or the loopback fix only works in setup.
    if [[ -n ${NO_PROXY:-} ]]; then printf 'export NO_PROXY=%q no_proxy=%q\n' "$NO_PROXY" "${no_proxy:-$NO_PROXY}"; fi
    # Use the selected binary directory, not setup's entire inherited PATH.
    if [[ -n ${NVM_BIN:-} ]]; then printf 'export PATH=%q:"$PATH"\n' "$NVM_BIN"; fi
  } > "$destination") || return
  # Non-root login shells do not automatically read ~/.wow-cloud-env.
  if [[ $destination != /etc/profile.d/wow-cloud.sh ]]; then
    local profile=$HOME/.bash_profile
    if ! grep -Fq '# wow-core:cloud-env' "$profile" 2>/dev/null; then
      if [[ ! -f "$profile" && -f "$HOME/.profile" ]]; then printf '[ ! -f "$HOME/.profile" ] || . "$HOME/.profile"\n' >> "$profile" || return; fi
      printf '\n# wow-core:cloud-env\n[ ! -f "$HOME/.wow-cloud-env" ] || . "$HOME/.wow-cloud-env"\n' >> "$profile" || return
    fi
  fi
}
run_step environment persist_environment
run_step corepack corepack enable
root_cmd() {
  if [[ $(id -u) == 0 ]]; then "$@"; else sudo -n "$@"; fi
}
install_pwsh() (
  command -v pwsh >/dev/null 2>&1 && exit 0
  . /etc/os-release || exit
  [[ $ID == ubuntu ]] || exit 1
  root_cmd apt-get update -qq || exit
  root_cmd env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq wget apt-transport-https software-properties-common || exit
  wget -q "https://packages.microsoft.com/config/ubuntu/${VERSION_ID}/packages-microsoft-prod.deb" -O /tmp/wow-msprod.deb || exit
  root_cmd dpkg -i /tmp/wow-msprod.deb >/dev/null || exit
  root_cmd apt-get update -qq || exit
  root_cmd env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq powershell
)
# PowerShell and browser binaries belong to the cached image, never SessionStart.
install_packages() {
  case "$manager" in
    pnpm) pnpm install --frozen-lockfile ;;
    npm)
      # corepack does not normally shim npm; honour its explicit project pin.
      if [[ "$descriptor" =~ ^npm@([0-9]+\.[0-9]+\.[0-9]+)$ ]]; then npm install --global "npm@${BASH_REMATCH[1]}" || return; fi
      npm ci ;;
    yarn)
      local version; version=$(yarn --version) || return
      if [[ "${version%%.*}" == 1 ]]; then yarn install --frozen-lockfile; else yarn install --immutable; fi ;;
    none) return 0 ;;
  esac
}
bounded_step "packages ($manager)" install_packages && wow_cloud_record_lock
install_browsers() {
  if command -v pnpm >/dev/null 2>&1; then pnpm exec playwright install --with-deps chromium
  elif command -v npx >/dev/null 2>&1; then npx playwright install --with-deps chromium
  else return 1; fi
}
if [[ -f playwright.config.ts || -f playwright.config.js ]] || grep -q '"@playwright/test"\|"playwright"' package.json 2>/dev/null; then
  bounded_step playwright-browsers install_browsers
fi

install_postgres() (
  # Explicit checks: Bash suppresses errexit inside functions used by if/&&.
  . /etc/os-release || exit
  [[ "$ID" == ubuntu && -n "$VERSION_CODENAME" ]] || exit 1
  root_cmd apt-get update -qq || exit
  root_cmd env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq curl ca-certificates postgresql-common || exit
  root_cmd install -d /usr/share/postgresql-common/pgdg || exit
  root_cmd curl --fail --silent --show-error --location https://www.postgresql.org/media/keys/ACCC4CF8.asc -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc || exit
  printf 'deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt %s-pgdg main\n' "$VERSION_CODENAME" | root_cmd tee /etc/apt/sources.list.d/pgdg.list >/dev/null || exit
  root_cmd apt-get update -qq || exit
  root_cmd env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "postgresql-$pg_major" || exit
)
start_postgres() (
  local other name port
  if ! pg_lsclusters --no-header | awk -v v="$pg_major" '$1==v && $2=="main" {found=1} END{exit !found}'; then
    root_cmd pg_createcluster "$pg_major" main || exit
  fi
  # A preinstalled cluster can hold 5432 and make apt assign the new one 5433.
  while read -r other name port status _; do
    # Only stop an ONLINE cluster holding 5432; stopping a down one exits 2 and aborted the
    # requested cluster's start (Claude cloud probe 2026-10-07: down 16 on 5432, 17 requested).
    if [[ "$port" == 5432 && "$other/$name" != "$pg_major/main" && "$status" == online* ]]; then root_cmd pg_ctlcluster "$other" "$name" stop || exit; fi
  done < <(pg_lsclusters --no-header)
  root_cmd pg_ctlcluster "$pg_major" main stop || true
  root_cmd pg_conftool "$pg_major" main set port 5432 || exit
  root_cmd pg_conftool "$pg_major" main set listen_addresses localhost || exit
  # Claude's image includes PostgreSQL 16, stopped. Prefer its service when
  # all installed clusters have the requested major; avoid starting other ones.
  if [[ ${CLAUDE_CODE_REMOTE:-} == true ]] &&
      ! pg_lsclusters --no-header | awk -v v="$pg_major" '$1!=v {found=1} END{exit !found}'; then
    root_cmd service postgresql start || exit
  else
    root_cmd pg_ctlcluster "$pg_major" main start || exit
  fi
  root_cmd runuser -u postgres -- env -u PGHOST -u PGHOSTADDR -u PGPORT -u PGSERVICE -u PGSERVICEFILE -u PGOPTIONS \
    psql -X -h /var/run/postgresql -p 5432 -U postgres -d postgres -v ON_ERROR_STOP=1 -c 'SELECT 1'
)
local_psql() {
  root_cmd runuser -u postgres -- env -u PGHOST -u PGHOSTADDR -u PGPORT -u PGSERVICE -u PGSERVICEFILE -u PGOPTIONS \
    psql -X -h /var/run/postgresql -p 5432 -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"
}
if [[ -n "$pg_major" ]]; then
  if [[ ! "$pg_major" =~ ^[0-9]+$ || "$(uname -s)" != Linux ]]; then
    log 'postgres FAILED (requires Linux and CLOUD_POSTGRES major number)'
  else
    if [[ ! -x "/usr/lib/postgresql/$pg_major/bin/postgres" ]]; then
      if ! bounded_step postgres-install install_postgres; then
        fallback=$(pg_lsclusters --no-header 2>/dev/null | awk 'NR==1{print $1}')
        if [[ -z "$fallback" ]]; then
          bounded_step postgres-default-install root_cmd env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql
          fallback=$(pg_lsclusters --no-header 2>/dev/null | awk 'NR==1{print $1}')
        fi
        log "postgres-version FAILED (requested $pg_major; fallback ${fallback:-unavailable})"
        pg_major=$fallback
      fi
    else log "postgres-install ($pg_major already installed) ok"; fi
    if [[ -n "$pg_major" ]] && bounded_step postgres-start start_postgres; then
      # psql quotes values/identifiers, so passwords and names cannot become SQL.
      run_step postgres-password local_psql -v "password=${CLOUD_POSTGRES_PASSWORD:-postgres}" <<'SQL'
SELECT format('ALTER ROLE postgres PASSWORD %L', :'password') \gexec
SQL
      IFS=',' read -r -a databases <<< "$pg_dbs"
      for db in "${databases[@]}"; do
        db=$(printf '%s' "$db" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
        if [[ -z "$db" ]]; then continue; fi
        if [[ ! "$db" =~ ^[a-zA-Z_][a-zA-Z0-9_-]*$ ]]; then log 'postgres-database FAILED (invalid database name)'; continue; fi
        run_step "postgres-database ($db)" local_psql -v "db=$db" <<'SQL'
SELECT format('CREATE DATABASE %I', :'db') WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'db') \gexec
SQL
      done
    fi
  fi
else log 'postgres (disabled) ok'; fi
# Package and database setup are the common path. Only spend time installing
# PowerShell afterwards, and only for a declaration that actually invokes it.
if $need_pwsh && [[ "$(uname -s)" == Linux ]]; then bounded_step pwsh install_pwsh; fi
if [[ -n "$prepare" ]]; then bounded_step prepare bash -c "$prepare"; else log 'prepare (disabled) ok'; fi
# Codex treats setup as running while any process it started is alive: every
# step logged ok, then a running cluster held setup until the 3600 s limit
# (three consumers, 2026-10-06). Stop it;
# cloud-env.sh starts the declared cluster before each command. Claude Code
# cloud sessions keep it running for the agent.
if [[ $dry_run == false && ${CLAUDE_CODE_REMOTE:-} != true && "${pg_major:-}" =~ ^[0-9]+$ ]] &&
    command -v pg_ctlcluster >/dev/null 2>&1; then
  # The started major (after any fallback) is what cloud-env.sh must restart.
  printf '%s\n' "$pg_major" > "$HOME/.wow-cloud-pg" 2>/dev/null || true
  run_step postgres-stop root_cmd timeout 60 pg_ctlcluster "$pg_major" main stop
fi
exit 0
