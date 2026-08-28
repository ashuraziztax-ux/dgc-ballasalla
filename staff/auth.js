// DGC Auth — Supabase email/password login gate
// Loaded after app.js. Overrides sbHeaders to inject user JWT,
// then calls loadAll() once authenticated.

const _sbAuth = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Data queries keep using the anon key (existing RLS policies stay unchanged).
// Auth is a login gate only — you must be signed in to see the app.

function _showLogin() {
  document.getElementById('loginOverlay').style.display = 'flex';
}

function _hideLogin() {
  document.getElementById('loginOverlay').style.display = 'none';
}

async function _startApp() {
  _hideLogin();
  await loadAll();
}

// On load — check for existing session or auth callback
(async () => {
  const { data: { session } } = await _sbAuth.auth.getSession();
  if (session) {
    await _startApp();
    return;
  }
  _showLogin();
})();

// Sign-in form submit
document.getElementById('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const email    = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const btn      = document.getElementById('loginSubmitBtn');
  const errEl    = document.getElementById('loginError');

  btn.disabled    = true;
  btn.textContent = 'Signing in…';
  errEl.textContent = '';

  const { data, error } = await _sbAuth.auth.signInWithPassword({ email, password });
  if (error) {
    errEl.textContent = error.message;
    btn.disabled    = false;
    btn.textContent = 'Sign in';
    return;
  }
  await _startApp();
});

// Sign-out button (shown in app header)
const _signOutBtn = document.getElementById('signOutBtn');
if (_signOutBtn) {
  _signOutBtn.addEventListener('click', async () => {
    await _sbAuth.auth.signOut();
    _userToken = SUPABASE_KEY;
    _showLogin();
    document.getElementById('loginPassword').value = '';
  });
}
