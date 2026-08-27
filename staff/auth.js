// Shared login/session helper for pages that need a real logged-in user
// (not just the public anon key) — Add Staff and Fuel Usage. Session is
// stored in localStorage, which is shared across every page on this origin
// (planner/, staff/ — all github.io/dgc-ballasalla/*), so logging in once
// on any of them keeps you logged in on the others too, until the refresh
// token itself expires (weeks), not just the short-lived access token.

const AUTH_SESSION_KEY = 'dgc_auth_session';

function authHeaders(extra) {
  return Object.assign({ apikey: SUPABASE_KEY, 'Content-Type': 'application/json' }, extra || {});
}

function getStoredSession() {
  try { return JSON.parse(localStorage.getItem(AUTH_SESSION_KEY)); } catch (e) { return null; }
}
function storeSession(s) {
  localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(s));
}
function clearSession() {
  localStorage.removeItem(AUTH_SESSION_KEY);
}

async function login(email, password) {
  const r = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
    method: 'POST', headers: authHeaders(), body: JSON.stringify({ email, password }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error_description || data.msg || 'Login failed');
  storeSession({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (data.expires_in - 60) * 1000, // refresh a minute early
    email: data.user && data.user.email,
  });
  return data;
}

async function refreshSession(session) {
  const r = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=refresh_token', {
    method: 'POST', headers: authHeaders(), body: JSON.stringify({ refresh_token: session.refresh_token }),
  });
  const data = await r.json();
  if (!r.ok) { clearSession(); return null; }
  const updated = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (data.expires_in - 60) * 1000,
    email: data.user && data.user.email || session.email,
  };
  storeSession(updated);
  return updated;
}

// Returns a valid access token, refreshing silently if needed, or null if
// there's no session / it can't be refreshed (refresh token itself expired
// or was revoked) — caller should show the login form in that case.
async function ensureLoggedIn() {
  let session = getStoredSession();
  if (!session) return null;
  if (Date.now() >= session.expires_at) session = await refreshSession(session);
  return session;
}

function logout() {
  clearSession();
  location.reload();
}

// Headers for a request that should act as the logged-in user (RLS sees
// auth.role() = 'authenticated'), not just the public anon key.
function authedHeaders(session, extra) {
  return Object.assign({
    apikey: SUPABASE_KEY,
    Authorization: 'Bearer ' + session.access_token,
    'Content-Type': 'application/json',
  }, extra || {});
}

// Renders a login form into `container` and resolves with the session once
// logged in. Call this when ensureLoggedIn() returns null.
function showLoginForm(container, appName) {
  return new Promise(resolve => {
    container.innerHTML = `
      <div style="max-width:340px;margin:60px auto;padding:24px;background:var(--panel);border:1px solid var(--border);border-radius:12px">
        <h2 style="margin:0 0 4px;font-size:1.1rem">${appName} — Login required</h2>
        <p class="hours-hint" style="margin-bottom:16px">This section holds sensitive records, so it's locked to logged-in accounts only.</p>
        <form id="loginForm" style="display:flex;flex-direction:column;gap:10px">
          <input type="email" id="loginEmail" placeholder="Email" required autocomplete="username">
          <input type="password" id="loginPassword" placeholder="Password" required autocomplete="current-password">
          <button type="submit" class="primary-btn">Log in</button>
          <p id="loginStatus" class="form-status error"></p>
        </form>
      </div>`;
    container.querySelector('#loginForm').addEventListener('submit', async e => {
      e.preventDefault();
      const status = container.querySelector('#loginStatus');
      status.textContent = 'Logging in…';
      status.className = 'form-status';
      try {
        await login(container.querySelector('#loginEmail').value, container.querySelector('#loginPassword').value);
        resolve(getStoredSession());
      } catch (err) {
        status.textContent = err.message;
        status.className = 'form-status error';
      }
    });
  });
}
