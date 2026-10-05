// Minimal local stand-in for Supabase Auth (GoTrue) — just what the app and API call.
// Test-only. Users live in memory; JWTs are HS256 with a throwaway secret (the API never verifies locally, it asks /auth/v1/user).
import http from 'node:http';
import crypto from 'node:crypto';

const PORT = Number(process.env.MOCK_PORT || 9999);
const SECRET = 'mock-secret';
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
const sign = (payload) => {
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64(payload);
  const sig = crypto.createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
};
const decode = (jwt) => { try { return JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString()); } catch { return null; } };

const users = new Map(); // id -> { id, email, password, app_metadata, user_metadata }
const refresh = new Map(); // refresh_token -> id
const log = [];

// Fixed demo users (ids match the profiles rows the test setup inserts).
const SEED = [
  ['b2c48512-5bc1-4a33-a1cc-9c56c09fd8b9', 'teacher@stemri.local'],
  ['2881f8ca-3197-4a65-be6b-8bf1cdd953d0', 's1@stemri.local'],
  ['3a1f0c11-0000-4000-8000-000000000002', 's2@stemri.local'],
  ['3a1f0c11-0000-4000-8000-000000000003', 's3@stemri.local'],
];
for (const [id, email] of SEED) users.set(id, { id, email, password: 'Stemri@2026', app_metadata: {}, user_metadata: {} });

const publicUser = (u) => ({
  id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, email_confirmed_at: new Date().toISOString(),
  app_metadata: { provider: 'email', providers: ['email'], ...u.app_metadata }, user_metadata: u.user_metadata,
  created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
});
function session(u) {
  const now = Math.floor(Date.now() / 1000);
  const pu = publicUser(u);
  const access_token = sign({ sub: u.id, email: u.email, aud: 'authenticated', role: 'authenticated', exp: now + 3600, iat: now, app_metadata: pu.app_metadata, user_metadata: pu.user_metadata });
  const refresh_token = crypto.randomUUID();
  refresh.set(refresh_token, u.id);
  return { access_token, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token, user: pu };
}
const bearerUser = (req) => {
  const claims = decode((req.headers.authorization || '').replace(/^Bearer /i, ''));
  return claims && users.get(claims.sub);
};

const server = http.createServer(async (req, res) => {
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS', 'content-type': 'application/json' };
  const send = (code, body) => { res.writeHead(code, cors); res.end(body === undefined ? '' : JSON.stringify(body)); };
  if (req.method === 'OPTIONS') return send(204);
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let body = {};
  if (req.method !== 'GET') { const chunks = []; for await (const c of req) chunks.push(c); try { body = JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch { body = {}; } }
  const path = url.pathname;
  log.push(`${req.method} ${path}${url.search}`);

  if (path === '/__users') return send(200, [...users.values()].map(({ password, ...u }) => ({ ...u, has_password_len: password?.length })));
  if (path === '/__password') { const u = [...users.values()].find((x) => x.email === url.searchParams.get('email')); return send(200, { password: u?.password ?? null, app_metadata: u?.app_metadata ?? null }); }
  if (path === '/__log') return send(200, log.slice(-300));
  if (path === '/auth/v1/token' && req.method === 'POST') {
    const grant = url.searchParams.get('grant_type');
    if (grant === 'password') {
      const u = [...users.values()].find((x) => x.email === String(body.email || '').toLowerCase());
      if (!u || u.password !== body.password) return send(400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
      return send(200, session(u));
    }
    if (grant === 'refresh_token') {
      const id = refresh.get(body.refresh_token);
      const u = id && users.get(id);
      if (!u) return send(400, { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' });
      return send(200, session(u));
    }
  }
  if (path === '/auth/v1/user' && req.method === 'GET') { const u = bearerUser(req); return u ? send(200, publicUser(u)) : send(401, { code: 401, msg: 'invalid JWT' }); }
  if (path === '/auth/v1/user' && req.method === 'PUT') {
    const u = bearerUser(req); if (!u) return send(401, { code: 401, msg: 'invalid JWT' });
    if (body.password) { if (body.password === u.password) return send(422, { code: 422, error_code: 'same_password', msg: 'New password should be different from the old password.' }); u.password = body.password; }
    if (body.data) u.user_metadata = { ...u.user_metadata, ...body.data };
    return send(200, publicUser(u)); // a user cannot change app_metadata
  }
  if (path === '/auth/v1/logout') return send(204);
  if (path === '/auth/v1/recover') return send(200, {});
  if (path === '/auth/v1/admin/users' && req.method === 'POST') {
    const email = String(body.email || '').toLowerCase();
    if ([...users.values()].some((x) => x.email === email)) return send(422, { code: 422, error_code: 'email_exists', msg: 'A user with this email address has already been registered' });
    const u = { id: crypto.randomUUID(), email, password: body.password, app_metadata: body.app_metadata || {}, user_metadata: body.user_metadata || {} };
    users.set(u.id, u); return send(200, publicUser(u));
  }
  const m = path.match(/^\/auth\/v1\/admin\/users\/([^/]+)$/);
  if (m && req.method === 'PUT') {
    const u = users.get(m[1]); if (!u) return send(404, { code: 404, msg: 'User not found' });
    if (body.password) u.password = body.password;
    if (body.app_metadata) u.app_metadata = { ...u.app_metadata, ...body.app_metadata };
    return send(200, publicUser(u));
  }
  if (m && req.method === 'DELETE') { users.delete(m[1]); return send(200, {}); }
  return send(404, { code: 404, msg: `mock: no route ${req.method} ${path}` });
});
server.listen(PORT, () => console.log(`mock gotrue on :${PORT}`));
