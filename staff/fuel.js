// DGC Staff Tracker — Fuel Usage (logged-in users only)
// Manual vehicle + fill-up tracking. PDF invoice upload/auto-matching stays
// a local-only convenience for now — this covers add-a-vehicle and log-a-fillup.

const REST = SUPABASE_URL + '/rest/v1';
let session = null;
let vehicles = [];
let fillups = [];

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
async function sbDelete(table, filter) {
  const r = await fetch(REST + '/' + table + '?' + filter, { method: 'DELETE', headers: authedHeaders(session) });
  if (!r.ok) throw new Error(await r.text());
}

function monthKey(iso) { return iso.slice(0, 7); }

async function loadAll() {
  const app = document.getElementById('app');
  try {
    vehicles = await sbGet('/dgc_vehicles?select=*&order=nickname');
    fillups = await sbGet('/dgc_fuel_fillups?select=*&order=fill_date.desc');
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

  const months = {};
  fillups.forEach(f => {
    const m = monthKey(f.fill_date);
    months[m] = (months[m] || 0) + Number(f.cost || 0);
  });
  const monthRows = Object.entries(months).sort((a, b) => b[0].localeCompare(a[0]));

  app.innerHTML = `
    <header class="topbar" style="position:static">
      <h1 style="margin:0">Fuel Usage</h1>
      <button id="logoutBtn" class="secondary-btn">Log out (${session.email})</button>
    </header>
    <div style="padding:16px">
      <section>
        <h3>Monthly Fuel Spend</h3>
        <div class="advances-list">
          ${monthRows.map(([m, total]) => `<div class="advance-row"><span class="advance-date">${m}</span><span class="advance-amount">£${total.toFixed(2)}</span></div>`).join('') || '<p class="empty-msg">No fill-ups logged yet.</p>'}
        </div>
      </section>

      <section class="vehicles-section">
        <h3>Vehicles & Registrations</h3>
        <div id="vehiclesList" class="staff-list">
          ${vehicles.map(v => `
            <div class="list-row ${v.status === 'Retired' ? 'off-work' : ''}">
              <div class="row-main"><div class="row-name">${v.nickname || '(unnamed)'}</div></div>
              <div class="row-role">${v.registration || ''} ${v.card_number ? '· card ' + v.card_number : ''}</div>
              <div class="row-spacer"></div>
              ${v.status === 'Retired' ? '<span class="badge-offwork">RETIRED</span>' : ''}
              <button class="advance-del-btn" data-del-vehicle="${v.id}" title="Delete">&times;</button>
            </div>`).join('') || '<p class="empty-msg">No vehicles yet.</p>'}
        </div>
        <form id="vehicleForm" class="advance-form" style="margin-top:10px">
          <input type="text" name="nickname" placeholder="Nickname / driver" required>
          <input type="text" name="registration" placeholder="Registration">
          <input type="text" name="card_number" placeholder="Fuel card number">
          <button type="submit" class="primary-btn">Add Vehicle</button>
        </form>
      </section>

      <section class="advances-section">
        <h3>Fill-up History</h3>
        <div class="advances-list">
          ${fillups.map(f => `
            <div class="advance-row">
              <span class="advance-date">${f.fill_date}</span>
              <span class="advance-name">${vehicleById[f.vehicle_id] ? vehicleById[f.vehicle_id].nickname : '(deleted vehicle)'}</span>
              <span class="advance-notes">${f.litres || ''}L · £${Number(f.cost || 0).toFixed(2)} · ${f.garage || ''} ${f.driver_at_time ? '· ' + f.driver_at_time : ''}</span>
              <button class="advance-del-btn" data-del-fillup="${f.id}" title="Delete">&times;</button>
            </div>`).join('') || '<p class="empty-msg">No fill-ups logged yet.</p>'}
        </div>
        <form id="fillupForm" class="advance-form" style="margin-top:10px">
          <select name="vehicle_id" required>
            <option value="">Vehicle…</option>
            ${vehicles.map(v => `<option value="${v.id}">${v.nickname}</option>`).join('')}
          </select>
          <input type="date" name="fill_date" required>
          <input type="text" name="driver_at_time" placeholder="Driver">
          <input type="number" step="0.01" name="litres" placeholder="Litres">
          <input type="number" step="0.01" name="cost" placeholder="Cost £" required>
          <input type="text" name="garage" placeholder="Garage">
          <button type="submit" class="primary-btn">Add Fill-up</button>
        </form>
      </section>
    </div>`;

  document.getElementById('logoutBtn').addEventListener('click', logout);

  document.getElementById('vehicleForm').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    await sbPost('dgc_vehicles', { nickname: fd.get('nickname'), registration: fd.get('registration') || null, card_number: fd.get('card_number') || null, status: 'Active' });
    await loadAll();
  });
  document.getElementById('fillupForm').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    await sbPost('dgc_fuel_fillups', {
      vehicle_id: fd.get('vehicle_id'), fill_date: fd.get('fill_date'), driver_at_time: fd.get('driver_at_time') || null,
      litres: fd.get('litres') ? Number(fd.get('litres')) : null, cost: Number(fd.get('cost')), garage: fd.get('garage') || null,
    });
    await loadAll();
  });
  app.querySelectorAll('[data-del-vehicle]').forEach(btn => btn.addEventListener('click', async () => {
    if (!confirm('Delete this vehicle? Its fill-up history goes too.')) return;
    await sbDelete('dgc_vehicles', 'id=eq.' + btn.dataset.delVehicle);
    await loadAll();
  }));
  app.querySelectorAll('[data-del-fillup]').forEach(btn => btn.addEventListener('click', async () => {
    if (!confirm('Delete this fill-up entry?')) return;
    await sbDelete('dgc_fuel_fillups', 'id=eq.' + btn.dataset.delFillup);
    await loadAll();
  }));
}

(async () => {
  const app = document.getElementById('app');
  session = await ensureLoggedIn();
  if (!session) session = await showLoginForm(app, 'Fuel Usage');
  await loadAll();
})();
