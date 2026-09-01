/**
 * Auth hardening regression checks. LOCAL DATABASE ONLY — it registers users
 * and revokes sessions.
 *
 * Covers the changes made when session revocation, the password policy and the
 * legacy-role-header block went in. Every one of these is a path that, if it
 * broke, would lock real users out — so they are checked rather than assumed.
 */
const url = process.env.DATABASE_URL ?? '';
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
  console.error('check:auth refuses to run: DATABASE_URL is not a local database.');
  process.exit(2);
}

const BASE = process.env.AUTH_CHECK_BASE ?? 'http://localhost:3001';

let pass = 0, fail = 0;
const ok = (label: string, cond: boolean, extra = '') => {
  console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${label}${extra ? ' — ' + extra : ''}`);
  cond ? pass++ : fail++;
};

async function api(path: string, opts: any = {}) {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  let body: any = null;
  try { body = await res.json(); } catch { /* empty body */ }
  return { status: res.status, body };
}

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

async function main() {
  const stamp = Date.now();
  const email = `auth-probe-${stamp}@probe.test`;
  const password = 'ProbePass!2345';

  console.log('1. password policy');
  const short = await api('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'Probe', email: `s-${stamp}@probe.test`, password: 'abc123' }),
  });
  ok('a 6-character password is rejected', short.status === 400, `http=${short.status}`);

  const common = await api('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'Probe', email: `c-${stamp}@probe.test`, password: 'password123' }),
  });
  ok('a breach-list password is rejected', common.status === 400, `http=${common.status}`);

  const repetitive = await api('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'Probe', email: `r-${stamp}@probe.test`, password: 'aaaaaaaaaa' }),
  });
  ok('a repetitive password is rejected', repetitive.status === 400, `http=${repetitive.status}`);

  console.log('\n2. registration still works');
  const reg = await api('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'Auth Probe', email, password }),
  });
  ok('a strong password registers', reg.status === 200, `http=${reg.status} ${reg.body?.message ?? ''}`);
  ok('registration returns a token', typeof reg.body?.token === 'string');
  ok('self-registration yields VISITOR', reg.body?.user?.role === 'VISITOR', `role=${reg.body?.user?.role}`);

  console.log('\n3. the token works');
  const token = reg.body.token as string;
  const me = await api('/api/auth/me', { headers: auth(token) });
  ok('GET /api/auth/me accepts it', me.status === 200, `http=${me.status}`);

  console.log('\n4. login works and issues a usable token');
  const login = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  ok('login succeeds', login.status === 200, `http=${login.status}`);
  const loginToken = login.body?.token as string;
  const me2 = await api('/api/auth/me', { headers: auth(loginToken) });
  ok('the login token is accepted', me2.status === 200, `http=${me2.status}`);

  console.log('\n5. wrong credentials are indistinguishable');
  const badPass = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password: 'WrongPass!2345' }) });
  const noUser = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: `nobody-${stamp}@probe.test`, password }) });
  ok('wrong password gives 401', badPass.status === 401);
  ok('unknown email gives 401', noUser.status === 401);
  ok('both messages are identical (no user enumeration)',
     badPass.body?.message === noUser.body?.message, `"${badPass.body?.message}"`);

  console.log('\n6. logout revokes server-side');
  const logout = await api('/api/auth/logout', { method: 'POST', headers: auth(loginToken) });
  ok('logout returns 200', logout.status === 200, `http=${logout.status}`);
  ok('logout reports it revoked', logout.body?.revoked === true);

  const afterLogout = await api('/api/auth/me', { headers: auth(loginToken) });
  ok('the logged-out token is now REJECTED', afterLogout.status === 401, `http=${afterLogout.status}`);

  // The earlier token for the same account came from the same generation, so
  // it must die with it — otherwise "sign out everywhere" would be a lie.
  const siblingAfterLogout = await api('/api/auth/me', { headers: auth(token) });
  ok('every other token for that account is also revoked', siblingAfterLogout.status === 401,
     `http=${siblingAfterLogout.status}`);

  console.log('\n7. the account still works afterwards');
  const relogin = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  ok('the user can sign back in', relogin.status === 200, `http=${relogin.status}`);
  const fresh = await api('/api/auth/me', { headers: auth(relogin.body.token) });
  ok('the fresh token is accepted', fresh.status === 200, `http=${fresh.status}`);
  ok('the revoked token is still rejected', (await api('/api/auth/me', { headers: auth(loginToken) })).status === 401);

  console.log('\n8. logout is tolerant of an already-invalid token');
  const doubleLogout = await api('/api/auth/logout', { method: 'POST', headers: auth(loginToken) });
  ok('a second logout still returns 200', doubleLogout.status === 200, `http=${doubleLogout.status}`);
  ok('and reports nothing was revoked', doubleLogout.body?.revoked === false);

  console.log('\n9. garbage tokens are refused');
  ok('a forged token is rejected', (await api('/api/auth/me', { headers: auth('not.a.token') })).status === 401);
  ok('no token is rejected', (await api('/api/auth/me')).status === 401);

  console.log('\n10. the legacy role header cannot grant access');
  const legacy = await api('/api/admin/tokens', { headers: { 'X-QueueMind-Role': 'manager' } });
  ok('X-QueueMind-Role does not grant staff access', legacy.status === 401 || legacy.status === 403,
     `http=${legacy.status}`);

  console.log('\n11. a failed Google sign-in is reported, not swallowed');
  // The symptom this covers: returning from Google to the sign-in page with no
  // explanation, because the client cleared #auth_error without showing it and
  // the server collapsed every cause into one opaque code.
  const oauthCases: [string, string][] = [
    ['error=access_denied', 'access_denied'],
    ['code=', 'missing_code'],
  ];
  for (const [query, expected] of oauthCases) {
    const r = await fetch(`${BASE}/auth/google/callback?${query}`, { redirect: 'manual' });
    const loc = r.headers.get('location') ?? '';
    ok(`?${query} redirects with #auth_error=${expected}`, loc.includes(`auth_error=${expected}`), loc);
  }
  const bad = await fetch(`${BASE}/auth/google/callback?code=definitely-not-a-real-code`, { redirect: 'manual' });
  const badLoc = bad.headers.get('location') ?? '';
  ok('a bad code produces a classified reason', /#auth_error=oauth_[a-z_]+/.test(badLoc), badLoc);
  // Google's raw message can echo the client id and redirect URI; a URL
  // fragment is the wrong place for either.
  ok('no client id or secret leaks into the fragment',
     !/client_id|client_secret|GOCSPX/i.test(badLoc), badLoc);

  console.log('\n12. the user payload survives the hash round trip');
  // URLSearchParams already percent-decodes, so decoding a second time threw
  // URIError on any name containing '%' and silently dropped the sign-in.
  for (const name of ['Surya Barad', '50% Recovery', 'A & B', 'S\u00fbrya']) {
    const encoded = encodeURIComponent(JSON.stringify({ id: 'u1', name, role: 'VISITOR' }));
    const parsed = new URLSearchParams(`auth_token=T&auth_user=${encoded}`).get('auth_user');
    let round: string | null = null;
    try { round = JSON.parse(parsed!).name; } catch { /* left null */ }
    ok(`a name like "${name}" round-trips`, round === name, `got ${JSON.stringify(round)}`);
  }

  console.log('\n13. security headers are present');
  const head = await fetch(`${BASE}/api/health`);
  for (const h of ['x-content-type-options', 'x-frame-options', 'referrer-policy']) {
    ok(`${h} is set`, !!head.headers.get(h), head.headers.get(h) ?? 'missing');
  }
  ok('x-powered-by is hidden', !head.headers.get('x-powered-by'));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('check failed:', e); process.exit(1); });
