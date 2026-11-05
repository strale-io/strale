#!/usr/bin/env bash
# SYNCED FROM wow-core — edit there. Source from the repository root.
# cloud.json is trusted project code; env values are always shell-quoted data.
wow_cloud_read() {
  [[ -f .claude/cloud.json ]] || return 0
  if command -v node >/dev/null 2>&1; then
    node - "$@" "${WOW_CLOUD_EXPLICIT_NAMES[@]}" <<'NODE'
const fs = require('fs');
try {
  const c = JSON.parse(fs.readFileSync('.claude/cloud.json', 'utf8'));
  if (!c || Array.isArray(c) || typeof c !== 'object') throw Error();
  const q = v => "'" + String(v).replaceAll("'", "'\\''") + "'";
  const lines = [];
  for (const [key, dest] of Object.entries({node:'WOW_CLOUD_NODE', postgres:'WOW_CLOUD_POSTGRES', prepare:'WOW_CLOUD_PREPARE'})) {
    if (c[key] !== undefined) {
      if (!['string','number'].includes(typeof c[key]) || String(c[key]).includes('\0')) throw Error();
      lines.push(`${dest}=${q(c[key])}`);
    }
  }
  if (c.postgresDbs !== undefined) {
    if (!Array.isArray(c.postgresDbs) || c.postgresDbs.some(v=>typeof v !== 'string' || !/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(v))) throw Error();
    lines.push(`WOW_CLOUD_POSTGRES_DBS=${q(c.postgresDbs.join(','))}`);
  }
  if (c.env !== undefined) {
    if (!c.env || Array.isArray(c.env) || typeof c.env !== 'object') throw Error();
    for (const [k,v] of Object.entries(c.env)) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k) || k.startsWith('WOW_CLOUD_') || typeof v !== 'string' || v.includes('\0')) throw Error();
      if (process.argv.includes('--keep=' + k)) continue;
      lines.push(`export ${k}=${q(v)}`);
    }
  }
  console.log(lines.filter(s=>!process.argv.includes('--env-only') || s.startsWith('export ')).join('\n'));
} catch { process.exit(1); }
NODE
  elif command -v python3 >/dev/null 2>&1; then
    python3 - "$@" "${WOW_CLOUD_EXPLICIT_NAMES[@]}" <<'PY'
import json, re, shlex, sys
try:
    with open('.claude/cloud.json', encoding='utf-8') as f: c = json.load(f)
    if not isinstance(c, dict): raise ValueError()
    lines = []
    for key, dest in {'node':'WOW_CLOUD_NODE','postgres':'WOW_CLOUD_POSTGRES','prepare':'WOW_CLOUD_PREPARE'}.items():
        if key in c:
            if type(c[key]) not in (str,int,float) or '\0' in str(c[key]): raise ValueError()
            lines.append(dest+'='+shlex.quote(str(c[key])))
    if 'postgresDbs' in c:
        if not isinstance(c['postgresDbs'], list) or any(not isinstance(v,str) or not re.fullmatch(r'[a-zA-Z_][a-zA-Z0-9_-]*',v) for v in c['postgresDbs']): raise ValueError()
        lines.append('WOW_CLOUD_POSTGRES_DBS='+shlex.quote(','.join(c['postgresDbs'])))
    if 'env' in c:
        if not isinstance(c['env'],dict): raise ValueError()
        for k,v in c['env'].items():
            if not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*',k) or k.startswith('WOW_CLOUD_') or not isinstance(v,str) or '\0' in v: raise ValueError()
            if '--keep='+k in sys.argv: continue
            lines.append('export '+k+'='+shlex.quote(v))
    print('\n'.join(s for s in lines if '--env-only' not in sys.argv or s.startswith('export ')))
except Exception: sys.exit(1)
PY
  else
    return 1
  fi
}
wow_cloud_load() {
  unset WOW_CLOUD_NODE WOW_CLOUD_POSTGRES WOW_CLOUD_POSTGRES_DBS WOW_CLOUD_PREPARE
  local assignments name
  # Retain the names that were explicitly inherited, not names this load itself
  # exports. Later profile generation must still persist git-defined CLOUD_*.
  WOW_CLOUD_EXPLICIT_NAMES=()
  while IFS= read -r name; do
    if [[ $name == CLOUD_* ]]; then WOW_CLOUD_EXPLICIT_NAMES+=("--keep=$name"); fi
  done < <(compgen -e)
  assignments=$(wow_cloud_read) || { printf '%s\n' 'cloud-env: cloud.json FAILED (invalid config or no Node/python3 parser)' >&2; return 1; }
  eval "$assignments"
}
# Cloud sandboxes reach the internet only through an HTTPS proxy. Node's own
# fetch/https (corepack, pnpm, undici clients) ignore HTTPS_PROXY unless told
# (a consumer 2026-10-05: pnpm install ENETUNREACH to the npm registry; another
# worked only because its env set NODE_USE_ENV_PROXY=1 by hand).
wow_cloud_proxy() {
  local proxy=${HTTPS_PROXY:-${https_proxy:-}}
  [[ -n "$proxy" ]] || return 0
  export NODE_USE_ENV_PROXY=${NODE_USE_ENV_PROXY:-1}
  # curl, apt and many CLIs read only the lowercase names.
  export https_proxy=${https_proxy:-$proxy}
  export http_proxy=${http_proxy:-${HTTP_PROXY:-$proxy}}
  export npm_config_https_proxy=${npm_config_https_proxy:-$proxy}
  export npm_config_proxy=${npm_config_proxy:-${HTTP_PROXY:-${http_proxy:-$proxy}}}
  # Loopback and RFC 6761 reserved names never reach the internet, so they bypass the proxy:
  # a test server on 127.0.0.1 reached by a .invalid hostname otherwise fails behind it
  # (a consumer cloud trial 2026-10-07: 3 pinned-DNS transport tests). Existing entries are kept.
  # Both IPv6 spellings: Node's http matches ::1, undici's fetch matches [::1] (review of #92).
  local bypass=localhost,127.0.0.1,::1,[::1],.localhost,.invalid,.test name current entry
  for name in NO_PROXY no_proxy; do
    current=${!name:-${NO_PROXY:-${no_proxy:-}}}
    for entry in ${bypass//,/ }; do
      [[ ",$current," == *",$entry,"* ]] || current=${current:+$current,}$entry
    done
    export "$name=$current"
  done
}
wow_cloud_activate() {
  local target=${CLOUD_NODE_VERSION-${WOW_CLOUD_NODE:-}}
  if [[ -z "$target" && -f .nvmrc ]]; then target=$(tr -d '\r' < .nvmrc | sed -e 's/#.*//' -e '/^[[:space:]]*$/d' | head -n 1 | xargs); fi
  [[ -n "$target" ]] || return 0
  [[ "$target" =~ ^(v?[0-9]+(\.[0-9]+){0,2}|lts/\*|lts/[a-z]+|node|stable)$ ]] || return 1
  export NVM_DIR=${NVM_DIR:-$HOME/.nvm}
  if [[ -s "$NVM_DIR/nvm.sh" ]]; then
    . "$NVM_DIR/nvm.sh" --no-use >/dev/null 2>&1 || return
    # An exact pin that setup did not install made `nvm use` exit 3 and the whole
    # command was skipped with an empty receipt (a consumer, 2026-10-06). Fall back to
    # the installed major, and always say why if activation still fails.
    if ! nvm use "$target" >/dev/null 2>&1; then
      local major=${target#v}; major=${major%%.*}
      if [[ "$major" =~ ^[0-9]+$ && "$major" != "${target#v}" ]] && nvm use "$major" >/dev/null 2>&1; then
        printf 'cloud-env: node %s not installed; using installed major %s (%s)\n' "$target" "$major" "$(node --version 2>/dev/null)" >&2
      else
        printf 'cloud-env: node %s activation FAILED (not installed by setup; use a major like "24" in cloud.json)\n' "$target" >&2
        return 1
      fi
    fi
  else
    local current; current=$(node --version 2>/dev/null) || return
    [[ "${current#v}" == "${target#v}" || ( "$target" =~ ^v?[0-9]+$ && "${current#v}" == "${target#v}."* ) ]] || return 1
  fi
}
# Setup uses these functions without activating a runtime before it is installed.
# Setup installs dependencies for the checkout it ran on (usually main, cached).
# A task branch with a different lockfile then ran against the wrong packages
# (a consumer, 2026-10-06). Setup records the installed lockfile hash; commands
# reinstall (frozen) only when the branch's lockfile differs.
wow_cloud_lockfile() {
  local f; for f in pnpm-lock.yaml package-lock.json npm-shrinkwrap.json yarn.lock; do [[ -f $f ]] && { printf '%s\n' "$f"; return 0; }; done; return 1
}
wow_cloud_lock_hash() { sha256sum "$1" 2>/dev/null | cut -d' ' -f1; }
wow_cloud_record_lock() {
  local lock; lock=$(wow_cloud_lockfile) || return 0
  wow_cloud_lock_hash "$lock" > "$HOME/.wow-cloud-lock" 2>/dev/null || true
}
wow_cloud_deps() {
  local lock record=$HOME/.wow-cloud-lock current; lock=$(wow_cloud_lockfile) || return 0
  current=$(wow_cloud_lock_hash "$lock")
  if [[ ! -f $record ]]; then
    printf 'cloud-env: setup lock record absent; keeping cached dependencies\n' >&2
    return 0
  fi
  [[ -n $current && $current == "$(cat "$record")" ]] && return 0
  printf 'cloud-env: %s changed since setup; reinstalling (frozen)\n' "$lock" >&2
  case $lock in
    pnpm-lock.yaml) pnpm install --frozen-lockfile >&2 ;;
    yarn.lock) if [[ $(yarn --version 2>/dev/null) == 1.* ]]; then yarn install --frozen-lockfile >&2; else yarn install --immutable >&2; fi ;;
    *) npm ci >&2 ;;
  esac || { printf 'cloud-env: dependency reinstall FAILED for %s\n' "$lock" >&2; return 1; }
  printf '%s\n' "$current" > "$record"
}
# Services started during setup do not survive into the agent phase of a cached
# container. Start the declared local cluster before commands; never fails the
# command itself (a down database then fails the tests visibly, fast).
wow_cloud_db_start() {
  local major=${CLOUD_POSTGRES-${WOW_CLOUD_POSTGRES:-}} started
  [[ "$major" =~ ^[0-9]+$ ]] && command -v pg_ctlcluster >/dev/null 2>&1 || return 0
  # Setup records the major it actually started (a fallback can differ from the
  # declared one); restarting the declared major would leave the DB down.
  started=$(cat "$HOME/.wow-cloud-pg" 2>/dev/null)
  [[ "$started" =~ ^[0-9]+$ ]] && major=$started
  pg_lsclusters --no-header 2>/dev/null | awk -v v="$major" '$1==v && $2=="main" && $4=="online" {up=1} END{exit !up}' && return 0
  local run=; [[ $(id -u) == 0 ]] || run='sudo -n'
  timeout 60 $run pg_ctlcluster "$major" main start >/dev/null 2>&1 ||
    printf 'cloud-env: postgres %s start FAILED\n' "$major" >&2
  return 0
}
if [[ ${WOW_CLOUD_ENV_LIBRARY:-} != 1 ]]; then
  wow_cloud_proxy
  wow_cloud_load
  load_result=$?
  if [[ $load_result == 0 ]]; then
    if wow_cloud_activate; then
      wow_cloud_deps
      deps_result=$?
      wow_cloud_db_start
      [[ $deps_result == 0 ]]
    else
      # Keep activation distinguishable from dependency/readiness failures so
      # SessionStart retries setup only when setup can actually repair it.
      return 20 2>/dev/null || exit 20
    fi
  else
    return "$load_result" 2>/dev/null || exit "$load_result"
  fi
fi
