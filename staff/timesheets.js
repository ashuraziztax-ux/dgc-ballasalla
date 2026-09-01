// DGC Timesheets — PM view of all worker-submitted daily hours
// Reads from dgc_timesheets table (populated by worker app)
// Requires authenticated session — redirects to index.html if not logged in

const REST = SUPABASE_URL + '/rest/v1';
let session = null;
let records = [];
let filterDays = 14;
let refreshTimer = null;

function ah(extra) {
  return Object.assign({
    apikey: SUPABASE_KEY,
    Authorization: 'Bearer ' + session.access_token,
    'Content-Type': 'application/json',
  }, extra || {});
}

async function loadData() {
  const since = new Date();
  since.setDate(since.getDate() - filterDays);
  const isoSince = since.toISOString().slice(0, 10);
  const r = await fetch(
    REST + '/dgc_timesheets?work_date=gte.' + isoSince + '&order=staff_name.asc,work_date.desc',
    { headers: ah() }
  );
  if (!r.ok) throw new Error(await r.text());
  records = await r.json();
}

function fmtDate(iso) {
  const d = new Date(iso + 'T12:00:00Z');
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function fmtHours(h) {
  const total = Math.round(parseFloat(h || 0) * 60);
  const hrs = Math.floor(total / 60);
  const mins = total % 60;
  return mins === 0 ? hrs + 'h' : hrs + 'h ' + mins + 'm';
}

function initials(name) {
  const parts = (name || '?').trim().split(/\s+/);
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : (name || '?').slice(0, 2).toUpperCase();
}

function getMonday() {
  const now = new Date();
  const dow = now.getDay();
  const mon = new Date(now);
  mon.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));
  mon.setHours(0, 0, 0, 0);
  return mon.toISOString().slice(0, 10);
}

function render() {
  const app = document.getElementById('app');

  const filterHtml = `
    <header class="topbar" style="position:sticky;top:0">
      <h1 style="margin:0">Timesheets</h1>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <select id="filterSel" style="background:var(--panel2);border:1px solid var(--border);color:var(--text);padding:7px 10px;border-radius:8px;font-size:0.9rem">
          <option value="7" ${filterDays===7?'selected':''}>Last 7 days</option>
          <option value="14" ${filterDays===14?'selected':''}>Last 14 days</option>
          <option value="30" ${filterDays===30?'selected':''}>Last 30 days</option>
          <option value="90" ${filterDays===90?'selected':''}>Last 3 months</option>
        </select>
        <button id="refreshBtn" class="secondary-btn">Refresh</button>
        <button id="logoutBtn" class="secondary-btn">Sign out</button>
      </div>
    </header>`;

  if (records.length === 0) {
    app.innerHTML = filterHtml + '<p class="hours-hint" style="padding:32px;text-align:center">No timesheet entries in the last ' + filterDays + ' days.</p>';
    bindControls();
    return;
  }

  const monday = getMonday();

  // Group by person
  const byPerson = {};
  for (const rec of records) {
    if (!byPerson[rec.staff_name]) byPerson[rec.staff_name] = [];
    byPerson[rec.staff_name].push(rec);
  }

  let bodyHtml = '<div style="padding:20px;display:flex;flex-direction:column;gap:16px">';

  for (const [name, entries] of Object.entries(byPerson)) {
    const inits = initials(name);
    const weekHours = entries
      .filter(e => e.work_date >= monday)
      .reduce((s, e) => s + parseFloat(e.hours || 0), 0);
    const totalHours = entries.reduce((s, e) => s + parseFloat(e.hours || 0), 0);

    bodyHtml += `
      <div style="background:var(--panel);border:1px solid var(--border);border-radius:12px;overflow:hidden">
        <div style="display:flex;align-items:center;gap:12px;padding:14px 18px;border-bottom:1px solid var(--border);background:var(--panel2)">
          <span style="width:38px;height:38px;border-radius:50%;background:var(--accent);color:#1a1a1a;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.9rem;flex-shrink:0">${inits}</span>
          <span style="font-weight:600;font-size:1rem;flex:1">${name}</span>
          <span style="font-size:0.8rem;color:var(--muted)">
            <span style="color:var(--accent);font-weight:600">${fmtHours(weekHours)}</span> this week
            &nbsp;·&nbsp; ${fmtHours(totalHours)} shown
          </span>
        </div>
        <div>`;

    for (const e of entries) {
      const isThisWeek = e.work_date >= monday;
      bodyHtml += `
        <div style="padding:12px 18px;border-bottom:1px solid var(--border);display:grid;grid-template-columns:90px 1fr auto;gap:8px 16px;align-items:start">
          <div style="font-size:0.85rem;color:var(--muted);padding-top:2px">${fmtDate(e.work_date)}${isThisWeek ? ' <span style="color:var(--accent);font-size:0.75rem">●</span>' : ''}</div>
          <div>
            <div style="font-weight:600;font-size:0.95rem;margin-bottom:2px">${e.site}</div>
            ${e.description ? `<div style="font-size:0.85rem;color:var(--muted);margin-bottom:2px">${e.description}</div>` : ''}
            ${e.notes ? `<div style="font-size:0.8rem;color:var(--muted);font-style:italic">Note: ${e.notes}</div>` : ''}
          </div>
          <div style="text-align:right;flex-shrink:0">
            <div style="font-size:1.05rem;font-weight:700;color:var(--accent)">${fmtHours(e.hours)}</div>
            <div style="font-size:0.78rem;color:var(--muted)">${e.start_time || ''} – ${e.finish_time || ''}</div>
            ${e.lunch_mins ? `<div style="font-size:0.75rem;color:var(--muted)">${e.lunch_mins}m lunch</div>` : ''}
          </div>
        </div>`;
    }

    bodyHtml += `</div></div>`;
  }

  bodyHtml += '</div>';
  app.innerHTML = filterHtml + bodyHtml;
  bindControls();
}

function bindControls() {
  document.getElementById('logoutBtn').addEventListener('click', () => { logout(); });
  document.getElementById('refreshBtn').addEventListener('click', () => refresh());
  document.getElementById('filterSel').addEventListener('change', e => {
    filterDays = parseInt(e.target.value);
    refresh();
  });
}

async function refresh() {
  try {
    await loadData();
    render();
  } catch (err) {
    const app = document.getElementById('app');
    app.innerHTML += `<p style="color:var(--danger);padding:16px">Error: ${err.message}</p>`;
  }
}

function scheduleAutoRefresh() {
  clearInterval(refreshTimer);
  refreshTimer = setInterval(refresh, 60000); // refresh every minute
}

// ── Boot ──────────────────────────────────────────────────────────────────────
(async () => {
  const app = document.getElementById('app');
  session = await ensureLoggedIn();
  if (!session) { window.location.replace('index.html'); return; }
  try {
    await loadData();
    render();
    scheduleAutoRefresh();
  } catch (err) {
    app.innerHTML = `<div style="padding:24px;color:#f85149">Error loading timesheets: ${err.message}</div>`;
  }
})();
