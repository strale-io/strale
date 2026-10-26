// Open Flow specimen behaviour: theme switch, disclosures, tabs, copy, tool states, catalogue filter, sorting, motion replay.
(function () {
  var root = document.documentElement;

  // Theme: system (no attribute) | light | dark. Stored per viewer; the page works without storage.
  function applyTheme(choice) {
    if (choice === 'light' || choice === 'dark') root.setAttribute('data-theme', choice);
    else root.removeAttribute('data-theme');
    document.querySelectorAll('[data-theme-choice]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.themeChoice === (choice || 'system'))); });
    try { if (choice === 'light' || choice === 'dark') localStorage.setItem('open-flow-theme', choice); else localStorage.removeItem('open-flow-theme'); } catch (e) {}
  }
  applyTheme(root.getAttribute('data-theme'));
  document.querySelectorAll('[data-theme-choice]').forEach(function (b) { b.addEventListener('click', function () { applyTheme(b.dataset.themeChoice); }); });

  // Disclosures (nav dropdown, mobile menu): Escape closes and returns focus; outside click closes.
  var triggers = Array.prototype.slice.call(document.querySelectorAll('[data-disclosure]'));
  function setOpen(t, open) {
    var panel = document.getElementById(t.getAttribute('aria-controls'));
    t.setAttribute('aria-expanded', String(open));
    if (panel) panel.hidden = !open;
    if (t.hasAttribute('data-mobile-menu')) t.firstChild.textContent = open ? 'Close ' : 'Menu ';
  }
  triggers.forEach(function (t) {
    t.addEventListener('click', function (e) { e.stopPropagation(); setOpen(t, t.getAttribute('aria-expanded') !== 'true'); });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    triggers.forEach(function (t) { if (t.getAttribute('aria-expanded') === 'true') { setOpen(t, false); t.focus(); } });
  });
  document.addEventListener('click', function (e) {
    triggers.forEach(function (t) {
      var panel = document.getElementById(t.getAttribute('aria-controls'));
      if (t.getAttribute('aria-expanded') === 'true' && panel && !panel.contains(e.target)) setOpen(t, false);
    });
  });
  document.querySelectorAll('.mobile-menu a, .nav-dropdown a').forEach(function (a) {
    a.addEventListener('click', function () { triggers.forEach(function (t) { setOpen(t, false); }); });
  });

  // Tabs: roving tabindex, arrow keys, Home/End.
  document.querySelectorAll('[data-tabs]').forEach(function (group) {
    var tabs = Array.prototype.slice.call(group.querySelectorAll('[role="tab"]')).filter(function (t) { return !t.disabled; });
    function select(tab) {
      tabs.forEach(function (t) {
        var on = t === tab, panel = document.getElementById(t.getAttribute('aria-controls'));
        t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1;
        if (panel) panel.hidden = !on;
      });
    }
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { select(t); });
      t.addEventListener('keydown', function (e) {
        var n = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
        if (n === undefined) return;
        e.preventDefault(); var next = tabs[(n + tabs.length) % tabs.length]; select(next); next.focus();
      });
    });
  });

  // Copy: confirm in words (or say it failed), announce through a separate status region, then reset.
  document.querySelectorAll('[data-copy]').forEach(function (b) {
    b.addEventListener('click', function () {
      var block = b.closest('.code'), status = block.querySelector('[data-copy-status]');
      var panel = block.querySelector('[role="tabpanel"]:not([hidden]) pre') || block.querySelector('pre');
      var finish = function (ok) {
        var label = ok ? 'Copied' : 'Copy failed';
        b.classList.toggle('is-copied', ok); b.querySelector('span').textContent = label;
        b.querySelector('use').setAttribute('href', ok ? '#i-check' : '#i-error');
        if (status) status.textContent = ok ? 'Code copied to clipboard' : 'Could not copy; select the code and copy it manually';
        setTimeout(function () { b.classList.remove('is-copied'); b.querySelector('span').textContent = 'Copy'; b.querySelector('use').setAttribute('href', '#i-copy'); if (status) status.textContent = ''; }, 1800);
      };
      try { navigator.clipboard.writeText(panel.textContent).then(function () { finish(true); }, function () { finish(false); }); } catch (e) { finish(false); }
    });
  });

  // Tool view: idle → loading → success | error. Local fixture only.
  var view = document.getElementById('tool-view');
  if (view) {
    var show = function (state) { view.querySelectorAll('.result-state').forEach(function (s) { s.hidden = s.dataset.state !== state; }); };
    view.querySelectorAll('[data-run]').forEach(function (b) {
      b.addEventListener('click', function () {
        // aria-disabled, not disabled: the focused button keeps keyboard focus while the run is in progress.
        var target = b.dataset.run, primary = view.querySelector('[data-run="success"]');
        if (primary.getAttribute('aria-disabled') === 'true') return;
        primary.setAttribute('aria-busy', 'true'); primary.setAttribute('aria-disabled', 'true'); show('loading');
        setTimeout(function () { primary.removeAttribute('aria-busy'); primary.removeAttribute('aria-disabled'); show(target); }, 900);
      });
    });
  }

  // Catalogue filter: chips + search; empty state when nothing matches.
  var cat = document.getElementById('catalogue');
  if (cat) {
    var chips = cat.querySelectorAll('[data-filter]'), cards = cat.querySelectorAll('[data-cat]'), empty = cat.querySelector('[data-empty]'), search = cat.querySelector('#cat-search'), count = cat.querySelector('#cat-count'), active = 'all';
    var apply = function () {
      var q = (search.value || '').trim().toLowerCase(), n = 0;
      cards.forEach(function (c) { var ok = (active === 'all' || c.dataset.cat === active) && (!q || c.textContent.toLowerCase().indexOf(q) >= 0); c.hidden = !ok; if (ok) n++; });
      empty.hidden = n > 0; count.textContent = n + (n === 1 ? ' tool' : ' tools');
    };
    chips.forEach(function (c) { c.addEventListener('click', function () { active = c.dataset.filter; chips.forEach(function (x) { x.setAttribute('aria-pressed', String(x === c)); }); apply(); }); });
    search.addEventListener('input', apply);
    cat.querySelector('[data-clear]').addEventListener('click', function () { search.value = ''; chips[0].click(); });
  }

  // Sortable table headers.
  var table = document.getElementById('sort-table');
  if (table) {
    table.querySelectorAll('.sort-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        var th = b.closest('th'), idx = Array.prototype.indexOf.call(th.parentNode.children, th);
        var dir = th.getAttribute('aria-sort') === 'ascending' ? 'descending' : 'ascending';
        table.querySelectorAll('thead th').forEach(function (h) { h.removeAttribute('aria-sort'); });
        th.setAttribute('aria-sort', dir);
        var body = table.tBodies[0], rows = Array.prototype.slice.call(body.rows);
        var key = function (r) { var t = r.cells[idx].textContent.replace(/[^0-9.a-zA-Z ]/g, ''); var n = parseFloat(t.replace(/[^0-9.]/g, '')); return isNaN(n) ? t : n; };
        rows.sort(function (a, z) { var x = key(a), y = key(z); return (x > y ? 1 : x < y ? -1 : 0) * (dir === 'ascending' ? 1 : -1); });
        rows.forEach(function (r) { body.appendChild(r); });
      });
    });
  }

  // Motion replay: restart the in-place reveal (reduced motion shows the settled frame instantly).
  document.querySelectorAll('[data-replay]').forEach(function (b) {
    b.addEventListener('click', function () { var s = document.getElementById(b.dataset.replay); s.classList.remove('is-playing'); void s.offsetWidth; s.classList.add('is-playing'); });
  });
})();
