// DGC Staff Tracker — Add Staff (logged-in users only)
// Basics go in dgc_staff (name, role, start_date, rate, active — anon-readable,
// needed by the Hours page). Everything else — bank details, NI number, next
// of kin, medical info — goes in dgc_staff_profile, which has no anon access
// at all, only authenticated.

const REST = SUPABASE_URL + '/rest/v1';
let session = null;

const SKILLS = ['Groundworker', 'Digger Driver (Competent)', 'Digger Driver (Not Confident)',
  'Building Works', 'Concrete', 'Drainage', 'Management', 'NRV'];

const FIELDS = [
  { section: 'Basics', fields: [
    ['first_name', 'First name(s)', 'text', true], ['surname', 'Surname', 'text', true],
    ['gender', 'Gender', 'text'], ['marital_status', 'Marital status', 'text'],
    ['dob', 'Date of birth', 'date'], ['role', 'Job title / role', 'text'],
    ['phone', 'Phone', 'text'], ['email', 'Email', 'email'],
  ]},
  { section: 'Employment', fields: [
    ['start_date', 'Start date', 'date'], ['contracted_hours', 'Contracted hours', 'text'],
    ['rate', 'Pay rate (£/hr)', 'number'], ['pay_type', 'Pay type', 'text'],
    ['line_manager', 'Line manager', 'text'], ['contract_date', 'Contract date', 'date'],
  ]},
  { section: 'Statutory / ID', fields: [
    ['ni_number', 'NI number', 'text'], ['tax_number', 'Tax ID number', 'text'],
    ['work_permit_number', 'Work permit number', 'text'], ['visa_required', 'Visa required?', 'text'],
  ]},
  { section: 'Bank details', fields: [
    ['bank_name', 'Bank name', 'text'], ['bank_branch', 'Bank branch', 'text'],
    ['account_name', 'Account name', 'text'], ['sort_code', 'Sort code', 'text'],
    ['account_number', 'Account number', 'text'],
  ]},
  { section: 'Next of kin & health', fields: [
    ['next_of_kin', 'Next of kin (name & phone)', 'text'], ['medical_conditions', 'Medical conditions / allergies', 'text'],
  ]},
];

async function sbGet(path, useAuth) {
  const headers = useAuth ? authedHeaders(session) : { apikey: SUPABASE_KEY };
  const r = await fetch(REST + path, { headers });
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

function fieldsHtml(existing) {
  existing = existing || {};
  return FIELDS.map(sec => `
    <section>
      <h3>${sec.section}</h3>
      <div class="grid2">
        ${sec.fields.map(([name, label, type, required]) => `
          <label>${label}${required ? ' *' : ''}
            <input name="${name}" type="${type}" ${required ? 'required' : ''} value="${existing[name] != null ? existing[name] : ''}">
          </label>`).join('')}
      </div>
    </section>`).join('') + `
    <section>
      <h3>Skills</h3>
      <div class="skills-row">
        ${SKILLS.map(s => `<label class="checkbox"><input type="checkbox" name="skills" value="${s}" ${(existing.skills || '').includes(s) ? 'checked' : ''}> ${s}</label>`).join('')}
      </div>
      <label class="full">Other skill <input name="skills_other" value="${existing.skills_other || ''}"></label>
      <label class="full">Bio <textarea name="bio" rows="3">${existing.bio || ''}</textarea></label>
      <label class="full">Notes <textarea name="notes" rows="2">${existing.notes || ''}</textarea></label>
    </section>`;
}

function readForm(form) {
  const fd = new FormData(form);
  const out = {};
  FIELDS.forEach(sec => sec.fields.forEach(([name]) => { out[name] = fd.get(name) || null; }));
  out.skills_other = fd.get('skills_other') || null;
  out.bio = fd.get('bio') || null;
  out.notes = fd.get('notes') || null;
  out.skills = fd.getAll('skills').join(', ');
  return out;
}

async function renderApp() {
  const app = document.getElementById('app');
  const staff = await sbGet('/dgc_staff?select=*,dgc_staff_profile(*)&order=name', true);

  app.innerHTML = `
    <header class="topbar" style="position:static">
      <h1 style="margin:0">Add Staff</h1>
      <button id="logoutBtn" class="secondary-btn">Log out (${session.email})</button>
    </header>
    <div style="padding:16px">
      <button id="newBtn" class="primary-btn" style="margin-bottom:14px">+ Add Person</button>
      <p id="formStatus" class="form-status"></p>
      <div id="formHost"></div>
      <div id="roster" class="staff-list"></div>
    </div>`;

  document.getElementById('logoutBtn').addEventListener('click', logout);

  const roster = document.getElementById('roster');
  roster.innerHTML = staff.map(s => {
    const p = s.dgc_staff_profile;
    return `<div class="list-row ${s.active ? '' : 'off-work'}" data-id="${s.id}" style="cursor:pointer">
      <div class="row-main"><div class="row-name">${s.name}</div></div>
      <div class="row-role">${s.role || ''}</div>
      <div class="row-spacer"></div>
      ${s.active ? '' : '<span class="badge-offwork">LEFT</span>'}
    </div>`;
  }).join('') || '<p class="empty-msg">No one here yet.</p>';

  roster.querySelectorAll('.list-row').forEach(row => {
    row.addEventListener('click', () => {
      const s = staff.find(x => x.id === row.dataset.id);
      openForm(s);
    });
  });

  document.getElementById('newBtn').addEventListener('click', () => openForm(null));
}

function openForm(existingStaff) {
  const host = document.getElementById('formHost');
  const p = existingStaff ? Object.assign({}, existingStaff.dgc_staff_profile, { role: existingStaff.role, start_date: existingStaff.start_date, rate: existingStaff.rate }) : {};
  host.innerHTML = `
    <form id="staffForm" class="modal-body" style="background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:18px;margin-bottom:16px">
      ${fieldsHtml(p)}
      <div class="modal-actions" style="display:flex;gap:10px">
        <button type="submit" class="primary-btn">${existingStaff ? 'Save changes' : 'Save & Add'}</button>
        ${existingStaff ? `<button type="button" id="toggleLeftBtn" class="secondary-btn">${existingStaff.active ? 'Mark as Left' : 'Mark as Working'}</button>` : ''}
        <button type="button" id="cancelFormBtn" class="secondary-btn">Cancel</button>
      </div>
    </form>`;
  host.querySelector('#cancelFormBtn').addEventListener('click', () => { host.innerHTML = ''; });

  if (existingStaff) {
    host.querySelector('#toggleLeftBtn').addEventListener('click', async () => {
      await sbPatch('dgc_staff', 'id=eq.' + existingStaff.id, { active: !existingStaff.active });
      host.innerHTML = '';
      renderApp();
    });
  }

  host.querySelector('#staffForm').addEventListener('submit', async e => {
    e.preventDefault();
    const status = document.getElementById('formStatus');
    status.textContent = 'Saving…';
    status.className = 'form-status';
    try {
      const data = readForm(e.target);
      const name = [data.first_name, data.surname].filter(Boolean).join(' ');
      let staffId = existingStaff && existingStaff.id;
      if (existingStaff) {
        await sbPatch('dgc_staff', 'id=eq.' + staffId, { name, role: data.role, start_date: data.start_date, rate: data.rate ? Number(data.rate) : null });
      } else {
        const [row] = await sbPost('dgc_staff', { name, role: data.role, start_date: data.start_date, rate: data.rate ? Number(data.rate) : null, active: true });
        staffId = row.id;
      }
      const profile = Object.assign({}, data, { staff_id: staffId });
      delete profile.role; delete profile.start_date; delete profile.rate;
      const profRes = await fetch(REST + '/dgc_staff_profile?on_conflict=staff_id', {
        method: 'POST',
        headers: authedHeaders(session, { Prefer: 'resolution=merge-duplicates,return=representation' }),
        body: JSON.stringify(profile),
      });
      if (!profRes.ok) throw new Error(await profRes.text());
      status.textContent = 'Saved ✓';
      status.className = 'form-status success';
      document.getElementById('formHost').innerHTML = '';
      renderApp();
    } catch (err) {
      status.textContent = 'Error: ' + err.message;
      status.className = 'form-status error';
      console.error(err);
    }
  });
}

(async () => {
  const app = document.getElementById('app');
  session = await ensureLoggedIn();
  if (!session) session = await showLoginForm(app, 'Add Staff');
  renderApp();
})();
