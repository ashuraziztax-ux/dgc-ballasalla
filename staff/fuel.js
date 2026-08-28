// DGC Staff Tracker — Fuel Usage (logged-in users only)

const REST = SUPABASE_URL + '/rest/v1';
let session = null;
let vehicles = [];
let fillups = [];
let selectedMonth = null;

async function sbGet(path) {
  const r = await fetch(REST + path, { headers: authedHeaders(session) });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
async function sbPost(table, body) {
  const r = await fetch(REST + '/' + table, { method: 'POST', headers: authedHeaders(session, { Prefer: 'return=representation' }), body: JSON.stringify(body) });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
async function sbPatch(table, filter, body) {
  const r = await fetch(REST + '/' + table + '?' + filter, { method: 'PATCH', headers: authedHeaders(session, { Prefer: 'return=representation' }), body: JSON.stringify(body) });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
async function sbDelete(table, filter) {
  const r = await fetch(REST + '/' + table + '?' + filter, { method: 'DELETE', headers: authedHeaders(session) });
  if (!r.ok) throw new Error(await r.text());
}

function mk(iso) { return (iso || '').slice(0, 7); }
function fmtMonth(ym) {
  if (!ym) return '';
  const [y, m] = ym.split('-');
  return new Date(+y, +m - 1, 1).toLocaleString('en-GB', { month: 'long', year: 'numeric' });
}

async function loadAll() {
  const app = document.getElementById('app');
  try {
    vehicles = await sbGet('/dgc_vehicles?select=*&order=nickname');
    fillups = await sbGet('/dgc_fuel_fillups?select=*&order=fill_date.desc');
    // Default to most recent month with data
    if (!selectedMonth) {
      const months = [...new Set(fillups.map(f => mk(f.fill_date)))].sort().reverse();
      selectedMonth = months[0] || mk(new Date().toISOString());
    }
    render();
  } catch (err) {
    app.innerHTML = `<div style="padding:24px;color:#f85149">Error loading fuel data: ${err.message}</div>`;
    console.error(err);
  }
}

function render() {
  const app = document.getElementById('app');
  const vehicleById = {};
  vehicles.forEach(v => vehicleById[v.id] = v);

  // All months with data, sorted newest first
  const allMonths = [...new Set(fillups.map(f => mk(f.fill_date)))].sort().reverse();

  // Fillups for the selected month
  const monthFillups = fillups.filter(f => mk(f.fill_date) === selectedMonth);

  // Aggregate by vehicle
  const byVehicle = {};
  monthFillups.forEach(f => {
    if (!byVehicle[f.vehicle_id]) byVehicle[f.vehicle_id] = { cost: 0, litres: 0, count: 0 };
    byVehicle[f.vehicle_id].cost += Number(f.cost || 0);
    byVehicle[f.vehicle_id].litres += Number(f.litres || 0);
    byVehicle[f.vehicle_id].count++;
  });

  const totalCost = monthFillups.reduce((s, f) => s + Number(f.cost || 0), 0);
  const totalLitres = monthFillups.reduce((s, f) => s + Number(f.litres || 0), 0);
  const activeVehicleCount = Object.keys(byVehicle).length;

  // Vehicle rows sorted by cost desc
  const vehicleRows = Object.entries(byVehicle)
    .map(([vid, stats]) => ({ v: vehicleById[vid], ...stats }))
    .filter(r => r.v)
    .sort((a, b) => b.cost - a.cost);

  app.innerHTML = `
    <header class="topbar" style="position:static">
      <h1 style="margin:0">Fuel Usage</h1>
      <button id="logoutBtn" class="secondary-btn">Log out (${session.email})</button>
    </header>
    <div style="padding:16px;max-width:860px">

      <section style="margin-bottom:24px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <h3 style="margin:0;text-transform:uppercase;font-size:0.75rem;letter-spacing:0.08em;color:var(--accent)">Monthly Fuel Spend</h3>
          <select id="monthPicker" style="background:var(--panel);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:4px 8px;font-size:0.85rem">
            ${allMonths.length ? allMonths.map(m => `<option value="${m}" ${m === selectedMonth ? 'selected' : ''}>${fmtMonth(m)}</option>`).join('') : `<option value="${selectedMonth}">${fmtMonth(selectedMonth)}</option>`}
          </select>
        </div>

        ${totalCost > 0 ? `<p style="color:var(--muted);font-size:0.85rem;margin:0 0 12px">£${totalCost.toFixed(2)} total, ${totalLitres.toFixed(1)} litres across ${activeVehicleCount} vehicle(s)</p>` : ''}

        <div class="staff-list">
          ${vehicleRows.length ? vehicleRows.map(row => `
            <div class="list-row" style="cursor:default">
              <div class="row-main" style="min-width:160px"><div class="row-name">${row.v.nickname}</div></div>
              <div class="row-role" style="min-width:100px">${row.v.registration || ''}</div>
              <div class="row-spacer"></div>
              <span style="font-variant-numeric:tabular-nums;color:var(--text);font-weight:600;margin-right:16px">£${row.cost.toFixed(2)}</span>
              <span style="color:var(--muted);margin-right:16px">${row.litres.toFixed(1)}L</span>
              <span style="color:var(--muted);font-size:0.8rem">${row.count} fill-up${row.count !== 1 ? 's' : ''}</span>
            </div>`).join('') : '<p class="empty-msg">No fill-ups logged for this month.</p>'}
        </div>
      </section>

      <section style="margin-bottom:24px">
        <h3 style="text-transform:uppercase;font-size:0.75rem;letter-spacing:0.08em;color:var(--accent);margin-bottom:4px">Vehicles &amp; Registrations</h3>
        <p style="color:var(--muted);font-size:0.8rem;margin:0 0 10px">Click a vehicle to edit its nickname, registration or card number.</p>
        <div id="vehiclesList" class="staff-list">
          ${vehicles.map(v => `
            <div class="list-row ${v.status === 'Retired' ? 'off-work' : ''}" data-edit-vehicle="${v.id}" style="cursor:pointer">
              <div class="row-main"><div class="row-name">${v.nickname || '(unnamed)'}</div></div>
              <div class="row-role">${v.registration || ''}${v.card_number ? ' · Card ' + v.card_number : ''}</div>
              <div class="row-spacer"></div>
              ${v.status === 'Retired' ? '<span class="badge-offwork">RETIRED</span>' : ''}
            </div>`).join('') || '<p class="empty-msg">No vehicles yet.</p>'}
        </div>
        <div id="vehicleEditHost"></div>
        <details style="margin-top:12px">
          <summary style="cursor:pointer;color:var(--muted);font-size:0.85rem">+ Add Vehicle (registration, fuel card &amp; driver/name)</summary>
          <form id="vehicleForm" class="advance-form" style="margin-top:10px">
            <input type="text" name="nickname" placeholder="Nickname / driver" required>
            <input type="text" name="registration" placeholder="Registration">
            <input type="text" name="card_number" placeholder="Fuel card number">
            <button type="submit" class="primary-btn">Add Vehicle</button>
          </form>
        </details>
      </section>

      <section>
        <h3 style="text-transform:uppercase;font-size:0.75rem;letter-spacing:0.08em;color:var(--accent);margin-bottom:10px">Log a Fill-up</h3>
        <form id="fillupForm" class="advance-form">
          <select name="vehicle_id" required>
            <option value="">Vehicle…</option>
            ${vehicles.filter(v => v.status !== 'Retired').map(v => `<option value="${v.id}">${v.nickname}</option>`).join('')}
          </select>
          <input type="date" name="fill_date" required value="${new Date().toISOString().slice(0,10)}">
          <input type="number" step="0.01" name="litres" placeholder="Litres">
          <input type="number" step="0.01" name="cost" placeholder="Cost £" required>
          <input type="text" name="garage" placeholder="Garage / station">
          <button type="submit" class="primary-btn">Add Fill-up</button>
        </form>
        <p id="fillupStatus" class="form-status"></p>
      </section>
    </div>`;

  document.getElementById('logoutBtn').addEventListener('click', logout);

  document.getElementById('monthPicker').addEventListener('change', e => {
    selectedMonth = e.target.value;
    render();
  });

  // Vehicle edit on click
  app.querySelectorAll('[data-edit-vehicle]').forEach(row => {
    row.addEventListener('click', () => {
      const vid = row.dataset.editVehicle;
      const v = vehicles.find(x => x.id === vid);
      if (!v) return;
      const host = document.getElementById('vehicleEditHost');
      if (host.dataset.open === vid) { host.innerHTML = ''; host.dataset.open = ''; return; }
      host.dataset.open = vid;
      host.innerHTML = `
        <form id="veForm" class="advance-form" style="margin-top:8px;background:var(--panel);border:1px solid var(--border);border-radius:8px;padding:12px">
          <input type="text" name="nickname" value="${v.nickname || ''}" placeholder="Nickname / driver" required>
          <input type="text" name="registration" value="${v.registration || ''}" placeholder="Registration">
          <input type="text" name="card_number" value="${v.card_number || ''}" placeholder="Fuel card number">
          <button type="submit" class="primary-btn">Save</button>
          <button type="button" id="veCancelBtn" class="secondary-btn">Cancel</button>
          <button type="button" id="veRetireBtn" class="secondary-btn" style="color:#f85149">${v.status === 'Retired' ? 'Mark as Active' : 'Retire'}</button>
        </form>`;
      host.querySelector('#veCancelBtn').addEventListener('click', () => { host.innerHTML = ''; host.dataset.open = ''; });
      host.querySelector('#veRetireBtn').addEventListener('click', async () => {
        await sbPatch('dgc_vehicles', 'id=eq.' + vid, { status: v.status === 'Retired' ? 'Active' : 'Retired' });
        await loadAll();
      });
      host.querySelector('#veForm').addEventListener('submit', async e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        await sbPatch('dgc_vehicles', 'id=eq.' + vid, { nickname: fd.get('nickname'), registration: fd.get('registration') || null, card_number: fd.get('card_number') || null });
        await loadAll();
      });
    });
  });

  document.getElementById('vehicleForm').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    await sbPost('dgc_vehicles', { nickname: fd.get('nickname'), registration: fd.get('registration') || null, card_number: fd.get('card_number') || null, status: 'Active' });
    await loadAll();
  });

  document.getElementById('fillupForm').addEventListener('submit', async e => {
    e.preventDefault();
    const status = document.getElementById('fillupStatus');
    const fd = new FormData(e.target);
    try {
      await sbPost('dgc_fuel_fillups', {
        vehicle_id: fd.get('vehicle_id'), fill_date: fd.get('fill_date'),
        litres: fd.get('litres') ? Number(fd.get('litres')) : null,
        cost: Number(fd.get('cost')), garage: fd.get('garage') || null,
      });
      // Switch to the month of the new fill-up
      selectedMonth = mk(fd.get('fill_date'));
      status.textContent = 'Saved ✓';
      status.className = 'form-status success';
      await loadAll();
    } catch (err) {
      status.textContent = 'Error: ' + err.message;
      status.className = 'form-status error';
    }
  });
}

(async () => {
  const app = document.getElementById('app');
  session = await ensureLoggedIn();
  if (!session) session = await showLoginForm(app, 'Fuel Usage');
  await loadAll();
})();
