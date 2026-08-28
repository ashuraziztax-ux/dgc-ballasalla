// DGC Auth — Supabase email/password login gate
// Loaded after app.js. Overrides sbHeaders to inject user JWT,
// then calls loadAll() once authenticated.

const _sbAuth = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let _userToken = SUPABASE_KEY;

// Override app.js sbHeaders to use the live user JWT instead of anon key
window.sbHeaders = function(extra) {
  return Object.assign({
    apikey: SUPABASE_KEY,
    Authorization: 'Bearer ' + _userToken,
    'Content-Type': 'application/json'
  }, extra || {});
};

function _showLogin() {
  document.getElementById('loginOverlay').style.display = 'flex';
}

function _hideLogin() {
  document.getElementById('loginOverlay').style.display = 'none';
}

async function _startApp(token) {
  _userToken = token;
  _hideLogin();
  await loadAll();
}

// On load — check for existing session or auth callback
(async () => {
  const { data: { session } } = await _sbAuth.auth.getSession();
  if (session) {
    await _startApp(session.access_token);
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
  await _startApp(data.session.access_token);
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
