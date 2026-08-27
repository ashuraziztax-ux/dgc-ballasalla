// DGC Staff Tracker — Hours (Supabase-backed live version)
// Reads/writes dgc_staff, dgc_staff_hours, dgc_staff_advances, dgc_staff_leave directly.
// SUPABASE_URL / SUPABASE_KEY come from config.js.

const REST = SUPABASE_URL + '/rest/v1';

const BANK_HOLIDAYS = new Set([
  '2025-01-01','2025-04-18','2025-04-21','2025-05-05','2025-06-06','2025-07-07','2025-08-25','2025-12-25','2025-12-26',
  '2026-01-01','2026-04-03','2026-04-06','2026-05-04','2026-06-05','2026-07-06','2026-08-31','2026-12-25','2026-12-28',
  '2027-01-01','2027-03-26','2027-03-29','2027-05-03','2027-06-04','2027-07-05','2027-08-30','2027-12-27','2027-12-28',
]);

const ANCHOR_VAL = Date.UTC(2026, 7, 1); // Sat 1 Aug 2026 — fortnight grid anchor
const PERIOD_DAYS = 14;

function sbHeaders(extra) {
  return Object.assign({ apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' }, extra || {});
}
async function sbGet(path) {
  const r = await fetch(REST + path, { headers: sbHeaders() });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
async function sbPost(table, body) {
  const r = await fetch(REST + '/' + table, { method: 'POST', headers: sbHeaders({ Prefer: 'return=representation' }), body: JSON.stringify(body) });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
async function sbPatch(table, filter, body) {
  const r = await fetch(REST + '/' + table + '?' + filter, { method: 'PATCH', headers: sbHeaders({ Prefer: 'return=representation' }), body: JSON.stringify(body) });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
async function sbDelete(table, filter) {
  const r = await fetch(REST + '/' + table + '?' + filter, { method: 'DELETE', headers: sbHeaders() });
  if (!r.ok) throw new Error(await r.text());
  return true;
}

function isoFromVal(t) { return new Date(t).toISOString().slice(0, 10); }
function valFromIso(iso) { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d); }
function addDaysVal(t, n) { return t + n * 86400000; }
function todayVal() { const d = new Date(); return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()); }
function isWeekday(iso) { const dow = new Date(valFromIso(iso)).getUTCDay(); return dow >= 1 && dow <= 5; }
function periodStartValFor(t) {
  const days = Math.floor((t - ANCHOR_VAL) / 86400000);
  const idx = Math.floor(days / PERIOD_DAYS);
  return ANCHOR_VAL + idx * PERIOD_DAYS * 86400000;
}
function fmtShort(iso) {
  const d = new Date(valFromIso(iso));
  return d.getUTCDate() + ' ' + d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
}

let periodStartVal = periodStartValFor(todayVal());
let periodDates = [];
let staff = [];
let staffById = {};
let hoursCache = {}; // `${staff_id}_${date}` -> {id, hours}
let leaveCache = [];
let advancesCache = [];
let fillActive = false;
let fillSnapshot = null;
let rowFillSnapshots = {}; // staffId -> {date: originalValue}, per-row fill undo
const saveTimers = {};

function computePeriodDates() {
  periodDates = [];
  for (let i = 0; i < PERIOD_DAYS; i++) periodDates.push(isoFromVal(addDaysVal(periodStartVal, i)));
}

async function loadAll() {
  computePeriodDates();
  const from = periodDates[0], to = periodDates[PERIOD_DAYS - 1];
  document.getElementById('hoursPeriodLabel').textContent =
    fmtShort(from) + ' — ' + fmtShort(to) + ' ' + String(new Date(valFromIso(to)).getUTCFullYear()).slice(2);

  const [staffRows, hourRows, leaveRows, advRows] = await Promise.all([
    sbGet('/dgc_staff?select=id,name,role,rate,active&order=name'),
    sbGet('/dgc_staff_hours?select=id,staff_id,work_date,hours&work_date=gte.' + from + '&work_date=lte.' + to),
    sbGet('/dgc_staff_leave?select=*&from_date=lte.' + to + '&to_date=gte.' + from),
    sbGet('/dgc_staff_advances?select=*&entry_date=gte.' + from + '&entry_date=lte.' + to + '&order=entry_date.desc'),
  ]);

  staffById = {};
  staffRows.forEach(s => staffById[s.id] = s);

  // Show everyone active, plus anyone inactive who still has activity logged
  // in this specific fortnight (e.g. left partway through it) — a leaver's
  // final pay period must still show their real hours.
  const activeIds = new Set();
  hourRows.forEach(h => activeIds.add(h.staff_id));
  leaveRows.forEach(b => activeIds.add(b.staff_id));
  advRows.forEach(a => activeIds.add(a.staff_id));
  staff = staffRows.filter(s => s.active || activeIds.has(s.id));

  hoursCache = {};
  hourRows.forEach(h => hoursCache[h.staff_id + '_' + h.work_date] = { id: h.id, hours: h.hours });

  leaveCache = leaveRows;
  advancesCache = advRows;

  fillActive = false;
  fillSnapshot = null;
  rowFillSnapshots = {};

  renderStaffSelects();
  renderHours();
  renderAdvances();
  renderHolidays();
}

function renderStaffSelects() {
  for (const selId of ['advStaff', 'holStaff']) {
    const sel = document.getElementById(selId);
    const current = sel.value;
    sel.innerHTML = '<option value="">Staff member…</option>' +
      staff.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    sel.value = current;
  }
}

function overtimeFor(staffId) {
  return advancesCache.filter(a => a.staff_id === staffId && a.entry_type === 'Overtime')
    .reduce((sum, a) => sum + Number(a.amount), 0);
}
function moneyFor(staffId, type) {
  return advancesCache.filter(a => a.staff_id === staffId && a.entry_type === type)
    .reduce((sum, a) => sum + Number(a.amount), 0);
}
function leaveCovering(staffId, date) {
  return leaveCache.find(b => b.staff_id === staffId && date >= b.from_date && date <= b.to_date);
}
function cellFor(staffId, date) {
  const hourEntry = hoursCache[staffId + '_' + date];
  if (hourEntry && hourEntry.hours !== null && hourEntry.hours !== undefined) {
    return { kind: 'hours', value: hourEntry.hours };
  }
  if (!isWeekday(date)) return { kind: 'weekend' };
  if (BANK_HOLIDAYS.has(date)) return { kind: 'BH' };
  const leave = leaveCovering(staffId, date);
  if (leave) return { kind: leave.leave_type === 'Holiday' ? 'H' : 'U' };
  return { kind: 'blank' };
}
function rowTotal(staffId) {
  let total = 0;
  periodDates.forEach(date => {
    const c = cellFor(staffId, date);
    if (c.kind === 'hours') total += Number(c.value) || 0;
    else if (c.kind === 'BH' || c.kind === 'H') total += 8;
  });
  return total + overtimeFor(staffId);
}

function renderHours() {
  const table = document.getElementById('hoursTable');
  const todayIso = isoFromVal(todayVal());
  let head = '<tr><th class="hours-name">Name</th>';
  periodDates.forEach(date => {
    const d = new Date(valFromIso(date));
    const isToday = date === todayIso;
    head += `<th class="${isToday ? 'today-col' : ''}"><div class="day-head"><span class="day-name">${d.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' })}</span><span class="day-num">${d.getUTCDate()} ${d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })}</span></div></th>`;
  });
  head += '<th>Fill</th><th>OT</th><th>Total</th></tr>';

  let body = '';
  const dayTotals = periodDates.map(() => 0);
  let footOT = 0, footTotal = 0, footAdv = 0, footBonus = 0;

  staff.forEach(s => {
    const ot = overtimeFor(s.id);
    const total = rowTotal(s.id);
    footOT += ot; footTotal += total; footAdv += moneyFor(s.id, 'Advance'); footBonus += moneyFor(s.id, 'Bonus');

    body += `<tr data-staff="${s.id}"><td class="hours-name">${s.name}</td>`;
    periodDates.forEach((date, i) => {
      const c = cellFor(s.id, date);
      const todayCls = date === todayIso ? 'today-col' : '';
      if (c.kind === 'hours') {
        dayTotals[i] += Number(c.value) || 0;
        body += `<td class="${todayCls}"><input class="hours-cell" type="number" step="0.5" min="0" data-date="${date}" value="${c.value}"></td>`;
      } else if (c.kind === 'weekend') {
        body += `<td class="${todayCls}"></td>`;
      } else if (c.kind === 'blank') {
        body += `<td class="${todayCls}"><input class="hours-cell" type="number" step="0.5" min="0" data-date="${date}" value=""></td>`;
      } else {
        if (c.kind === 'BH' || c.kind === 'H') dayTotals[i] += 8;
        body += `<td class="hours-readonly ${todayCls}">${c.kind}</td>`;
      }
    });
    body += `<td><button class="row-fill-btn${s.id in rowFillSnapshots ? ' active' : ''}" data-staff="${s.id}">→8</button></td>`;
    body += `<td class="hours-readonly clickable" data-jump="${s.id}" data-jump-type="Overtime">${ot || 0}h</td>`;
    body += `<td class="hours-readonly">${total}</td>`;
    body += '</tr>';
  });

  let foot = '<tr class="hours-footer-row"><td>TEAM TOTALS</td>';
  dayTotals.forEach(t => foot += `<td>${t || ''}</td>`);
  foot += `<td></td><td>${footOT}h</td><td>${footTotal}</td></tr>`;
  foot += `<tr class="hours-footer-row"><td colspan="${PERIOD_DAYS + 1}" style="text-align:right">Advances £${footAdv.toFixed(2)} · Bonuses £${footBonus.toFixed(2)}</td><td colspan="2"></td></tr>`;

  table.innerHTML = head + body + foot;
}

function scheduleSave(staffId, date, input) {
  const key = staffId + '_' + date;
  clearTimeout(saveTimers[key]);
  saveTimers[key] = setTimeout(() => flushCell(staffId, date, input), 1500);
}
async function flushCell(staffId, date, input) {
  clearTimeout(saveTimers[staffId + '_' + date]);
  const raw = input.value.trim();
  const key = staffId + '_' + date;
  const existing = hoursCache[key];
  document.getElementById('hoursStatus').textContent = 'Saving…';
  try {
    if (raw === '') {
      if (existing) { await sbDelete('dgc_staff_hours', 'id=eq.' + existing.id); delete hoursCache[key]; }
    } else {
      const hours = Number(raw);
      if (existing) {
        await sbPatch('dgc_staff_hours', 'id=eq.' + existing.id, { hours });
        hoursCache[key] = { id: existing.id, hours };
      } else {
        const [row] = await sbPost('dgc_staff_hours', { staff_id: staffId, work_date: date, hours });
        hoursCache[key] = { id: row.id, hours };
      }
    }
    document.getElementById('hoursStatus').textContent = 'Saved ✓ ' + new Date().toLocaleTimeString('en-GB');
  } catch (e) {
    document.getElementById('hoursStatus').textContent = 'Save failed — check connection';
    console.error(e);
  }
}

document.getElementById('hoursTable').addEventListener('input', e => {
  if (!e.target.classList.contains('hours-cell')) return;
  const tr = e.target.closest('tr');
  const staffId = tr.dataset.staff;
  const date = e.target.dataset.date;
  scheduleSave(staffId, date, e.target);
});

document.getElementById('hoursTable').addEventListener('click', e => {
  if (e.target.classList.contains('row-fill-btn')) {
    toggleFillOnePerson(e.target.dataset.staff);
  }
  if (e.target.dataset.jump) {
    document.getElementById('advStaff').value = e.target.dataset.jump;
    document.getElementById('advType').value = e.target.dataset.jumpType || 'Overtime';
    updateAmountUnit();
    document.getElementById('advAmount').focus();
  }
});

async function toggleFillOnePerson(staffId) {
  const tr = document.querySelector(`tr[data-staff="${staffId}"]`);
  const inputs = tr.querySelectorAll('.hours-cell');
  if (staffId in rowFillSnapshots) {
    const snap = rowFillSnapshots[staffId];
    for (const input of inputs) {
      const date = input.dataset.date;
      if (date in snap) {
        input.value = snap[date];
        await flushCell(staffId, date, input);
      }
    }
    delete rowFillSnapshots[staffId];
  } else {
    const snap = {};
    for (const input of inputs) {
      if (!isWeekday(input.dataset.date)) continue;
      snap[input.dataset.date] = input.value;
      if (input.value.trim() === '') {
        input.value = '8';
        await flushCell(staffId, input.dataset.date, input);
      }
    }
    rowFillSnapshots[staffId] = snap;
  }
  renderHours();
}

document.getElementById('fillWeekBtn').addEventListener('click', async () => {
  fillActive = !fillActive;
  document.getElementById('fillWeekBtn').classList.toggle('active', fillActive);
  const inputs = document.querySelectorAll('#hoursTable .hours-cell');
  if (fillActive) {
    fillSnapshot = {};
    for (const input of inputs) {
      if (!isWeekday(input.dataset.date)) continue;
      const tr = input.closest('tr');
      fillSnapshot[tr.dataset.staff + '_' + input.dataset.date] = input.value;
      if (input.value.trim() === '') {
        input.value = '8';
        await flushCell(tr.dataset.staff, input.dataset.date, input);
      }
    }
  } else if (fillSnapshot) {
    for (const input of inputs) {
      const tr = input.closest('tr');
      const key = tr.dataset.staff + '_' + input.dataset.date;
      if (key in fillSnapshot) {
        input.value = fillSnapshot[key];
        await flushCell(tr.dataset.staff, input.dataset.date, input);
      }
    }
    fillSnapshot = null;
  }
  renderHours();
});

document.getElementById('saveHoursBtn').addEventListener('click', async () => {
  const inputs = document.querySelectorAll('#hoursTable .hours-cell');
  for (const input of inputs) {
    const tr = input.closest('tr');
    await flushCell(tr.dataset.staff, input.dataset.date, input);
  }
  renderHours();
});

document.getElementById('prevPeriodBtn').addEventListener('click', () => { periodStartVal -= PERIOD_DAYS * 86400000; loadAll(); });
document.getElementById('nextPeriodBtn').addEventListener('click', () => { periodStartVal += PERIOD_DAYS * 86400000; loadAll(); });
document.getElementById('todayBtn').addEventListener('click', () => { periodStartVal = periodStartValFor(todayVal()); loadAll(); });

// ---- Advances / Bonuses / Overtime ----
function updateAmountUnit() {
  const type = document.getElementById('advType').value;
  const amt = document.getElementById('advAmount');
  amt.placeholder = type === 'Overtime' ? 'Hours' : 'Amount £';
  amt.step = type === 'Overtime' ? '0.25' : '0.01';
}
document.getElementById('advType').addEventListener('change', updateAmountUnit);
document.getElementById('advDate').valueAsDate = new Date();

function renderAdvances() {
  const list = document.getElementById('advancesList');
  if (!advancesCache.length) { list.innerHTML = '<p class="hours-hint">Nothing logged this fortnight yet.</p>'; return; }
  list.innerHTML = advancesCache.map(a => {
    const s = staffById[a.staff_id];
    const typeCls = a.entry_type.toLowerCase();
    const amount = a.entry_type === 'Overtime' ? Number(a.amount) + 'h' : '£' + Number(a.amount).toFixed(2);
    return `<div class="advance-row">
      <div class="row-fields">
        <span class="advance-date">${fmtShort(a.entry_date)}</span>
        <span class="advance-name">${s ? s.name : '(unknown)'}</span>
        <span class="advance-type ${typeCls}">${a.entry_type}</span>
        <span class="advance-amount">${amount}</span>
        <span class="advance-notes">${a.notes || ''}</span>
      </div>
      <button class="advance-del-btn" data-table="dgc_staff_advances" data-id="${a.id}" title="Delete">&times;</button>
    </div>`;
  }).join('');
}

document.getElementById('advanceForm').addEventListener('submit', async e => {
  e.preventDefault();
  const status = document.getElementById('advanceStatus');
  status.textContent = 'Saving…';
  try {
    await sbPost('dgc_staff_advances', {
      staff_id: document.getElementById('advStaff').value,
      entry_type: document.getElementById('advType').value,
      amount: Number(document.getElementById('advAmount').value),
      entry_date: document.getElementById('advDate').value,
      notes: document.getElementById('advNotes').value || null,
    });
    e.target.reset();
    document.getElementById('advDate').valueAsDate = new Date();
    updateAmountUnit();
    status.textContent = 'Added ✓';
    await loadAll();
  } catch (err) {
    status.textContent = 'Failed to save';
    console.error(err);
  }
});

// ---- Holidays & Leave ----
function weekdayCountClipped(fromIso, toIso) {
  const from = Math.max(valFromIso(fromIso), periodStartVal);
  const to = Math.min(valFromIso(toIso), addDaysVal(periodStartVal, PERIOD_DAYS - 1));
  let count = 0;
  for (let t = from; t <= to; t += 86400000) {
    const dow = new Date(t).getUTCDay();
    if (dow >= 1 && dow <= 5) count++;
  }
  return count;
}

function renderHolidays() {
  const list = document.getElementById('holidayList');
  if (!leaveCache.length) { list.innerHTML = '<p class="hours-hint">No bookings touching this fortnight.</p>'; return; }
  list.innerHTML = leaveCache.map(b => {
    const s = staffById[b.staff_id];
    const days = weekdayCountClipped(b.from_date, b.to_date);
    const typeCls = b.leave_type === 'Holiday' ? 'bonus' : 'leave-type';
    const typeLabel = b.leave_type === 'Holiday' ? 'Paid' : 'Unpaid';
    return `<div class="advance-row">
      <div class="row-fields">
        <span class="advance-date">${fmtShort(b.from_date)} → ${fmtShort(b.to_date)}</span>
        <span class="advance-name">${s ? s.name : '(unknown)'}</span>
        <span class="advance-type ${typeCls}">${typeLabel}</span>
        <span class="advance-amount">${days}d</span>
        <span class="advance-notes">${b.notes || ''}</span>
      </div>
      <button class="advance-del-btn" data-table="dgc_staff_leave" data-id="${b.id}" title="Delete">&times;</button>
    </div>`;
  }).join('');
}

document.getElementById('holidayForm').addEventListener('submit', async e => {
  e.preventDefault();
  const status = document.getElementById('holidayStatus');
  status.textContent = 'Saving…';
  try {
    await sbPost('dgc_staff_leave', {
      staff_id: document.getElementById('holStaff').value,
      leave_type: document.getElementById('holType').value,
      from_date: document.getElementById('holFrom').value,
      to_date: document.getElementById('holTo').value,
      notes: document.getElementById('holNotes').value || null,
    });
    e.target.reset();
    status.textContent = 'Added ✓';
    await loadAll();
  } catch (err) {
    status.textContent = 'Failed to save';
    console.error(err);
  }
});

document.addEventListener('click', async e => {
  if (!e.target.classList.contains('advance-del-btn')) return;
  if (!confirm('Delete this entry?')) return;
  const table = e.target.dataset.table;
  const id = e.target.dataset.id;
  await sbDelete(table, 'id=eq.' + id);
  await loadAll();
});

// ---- Export to Excel ----
function buildWorkbook() {
  const hoursRows = [['Name', ...periodDates.map(fmtShort), 'OT (h)', 'Total']];
  staff.forEach(s => {
    const row = [s.name];
    periodDates.forEach(date => {
      const c = cellFor(s.id, date);
      row.push(c.kind === 'hours' ? Number(c.value) : (c.kind === 'weekend' || c.kind === 'blank') ? '' : c.kind);
    });
    row.push(overtimeFor(s.id));
    row.push(rowTotal(s.id));
    hoursRows.push(row);
  });
  const teamRow = ['TEAM TOTALS'];
  periodDates.forEach(date => {
    let t = 0;
    staff.forEach(s => {
      const c = cellFor(s.id, date);
      if (c.kind === 'hours') t += Number(c.value) || 0;
      else if (c.kind === 'BH' || c.kind === 'H') t += 8;
    });
    teamRow.push(t);
  });
  teamRow.push(staff.reduce((sum, s) => sum + overtimeFor(s.id), 0));
  teamRow.push(staff.reduce((sum, s) => sum + rowTotal(s.id), 0));
  hoursRows.push(teamRow);

  const advRows = [['Date', 'Name', 'Type', 'Amount', 'Notes']];
  advancesCache.forEach(a => {
    const s = staffById[a.staff_id];
    advRows.push([a.entry_date, s ? s.name : '(unknown)', a.entry_type, Number(a.amount), a.notes || '']);
  });

  const holRows = [['From', 'To', 'Name', 'Type', 'Days this fortnight', 'Notes']];
  leaveCache.forEach(b => {
    const s = staffById[b.staff_id];
    holRows.push([b.from_date, b.to_date, s ? s.name : '(unknown)', b.leave_type,
      weekdayCountClipped(b.from_date, b.to_date), b.notes || '']);
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(hoursRows), 'Hours');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(advRows), 'Advances Bonuses Overtime');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(holRows), 'Holidays Leave');
  return wb;
}

// Remembers the exact file the user picked (Chrome/Edge only, via the File
// System Access API) so every later click overwrites that same file with no
// dialog — point it at a OneDrive-synced folder once and Microsoft's own
// sync does the "everyone else sees it" part, nothing extra needed here.
// Safari/Firefox don't support this API — they fall back to a plain download.
const FS_SUPPORTED = 'showSaveFilePicker' in window;
const HANDLE_DB = 'dgc-staff-tracker', HANDLE_STORE = 'handles', HANDLE_KEY = 'exportFile';

function openHandleDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(HANDLE_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(HANDLE_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function getSavedHandle() {
  try {
    const db = await openHandleDB();
    return await new Promise((resolve, reject) => {
      const req = db.transaction(HANDLE_STORE, 'readonly').objectStore(HANDLE_STORE).get(HANDLE_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (e) { return null; }
}
async function saveHandle(handle) {
  try {
    const db = await openHandleDB();
    const tx = db.transaction(HANDLE_STORE, 'readwrite');
    tx.objectStore(HANDLE_STORE).put(handle, HANDLE_KEY);
  } catch (e) { /* ignore — worst case it just asks again next time */ }
}
async function clearSavedHandle() {
  try {
    const db = await openHandleDB();
    db.transaction(HANDLE_STORE, 'readwrite').objectStore(HANDLE_STORE).delete(HANDLE_KEY);
  } catch (e) { /* ignore */ }
}
function updateExportUI(handle) {
  document.getElementById('exportBtn').textContent = handle ? `Save to ${handle.name}` : 'Export to Excel';
  document.getElementById('exportChangeBtn').hidden = !handle;
}

let exportInFlight = false;
document.getElementById('exportBtn').addEventListener('click', async () => {
  // Guard against a double-click or a second click before the first write's
  // close() resolves — two concurrent writes to the same handle is exactly
  // how you get a corrupted .xlsx that Excel refuses to open.
  if (exportInFlight) return;
  exportInFlight = true;
  const btn = document.getElementById('exportBtn');
  const prevLabel = btn.textContent;
  btn.disabled = true;

  const wb = buildWorkbook();
  const from = periodDates[0], to = periodDates[PERIOD_DAYS - 1];
  const suggestedName = `Staff Hours ${from} to ${to}.xlsx`;
  const status = document.getElementById('hoursStatus');
  // Wrapped in a Blob (rather than handing the raw ArrayBuffer straight to
  // write()) so the bytes are passed unambiguously on every browser.
  const blob = new Blob([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })],
    { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

  try {
    if (!FS_SUPPORTED) {
      XLSX.writeFile(wb, suggestedName);
      return;
    }

    let handle = await getSavedHandle();
    if (handle) {
      let perm = await handle.queryPermission({ mode: 'readwrite' });
      if (perm !== 'granted') perm = await handle.requestPermission({ mode: 'readwrite' });
      if (perm !== 'granted') handle = null;
    }
    if (!handle) {
      handle = await window.showSaveFilePicker({
        suggestedName,
        types: [{ description: 'Excel Workbook', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }],
      });
      await saveHandle(handle);
      updateExportUI(handle);
    }
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    status.textContent = 'Saved to ' + handle.name + ' — ' + new Date().toLocaleTimeString('en-GB');
    status.className = 'form-status success';
  } catch (e) {
    if (e.name !== 'AbortError') {
      status.textContent = 'Export failed — try again';
      console.error(e);
    }
  } finally {
    exportInFlight = false;
    btn.disabled = false;
    btn.textContent = prevLabel;
  }
});

document.getElementById('exportChangeBtn').addEventListener('click', async () => {
  await clearSavedHandle();
  updateExportUI(null);
});

(async () => {
  if (FS_SUPPORTED) {
    const h = await getSavedHandle();
    if (h) updateExportUI(h);
  } else {
    document.getElementById('exportChangeBtn').hidden = true;
  }
})();

loadAll();
