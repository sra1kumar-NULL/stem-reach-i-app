import { newPage, login, BASE, closeBrowser, check, summary, dbq, tokenFor, api, mockPassword, chip } from './lib.mjs';
import fs from 'node:fs';
const p = await newPage({ width: 420, height: 1300 }); p.setDefaultTimeout(9000);
const step = (t) => console.log('\n## ' + t);
const vis = (loc) => loc.first().isVisible().catch(() => false);
const since = (n) => p.reqs.slice(n);
const attempt = async (name, fn) => { try { await fn(); } catch (e) { check(name + ' (step ran)', false, e.message.split('\n')[0]); } };
const S2 = '3a1f0c11-0000-4000-8000-000000000002';
let temp = '';

await login(p, 'teacher@stemri.local');

step('Students roster');
await attempt('roster', async () => {
  await p.goto(BASE + '/students', { waitUntil: 'networkidle' }); await p.waitForTimeout(2500);
  check('lists all three students', (await vis(p.getByText('Bhavya'))) && (await vis(p.getByText('Chetan'))) && (await vis(p.getByText(/Ananya/))));
  check('teachers are not in the roster', !(await vis(p.getByText('Mrs. Kavya'))));
  await p.getByRole('button', { name: 'Class 10B' }).first().click(); await p.waitForTimeout(1800);
  check('class filter works', (await vis(p.getByText('Chetan'))) && !(await vis(p.getByText('Bhavya'))));
  await p.getByRole('button', { name: 'All classes' }).first().click(); await p.waitForTimeout(1200);
  await p.getByPlaceholder('Search by name').fill('bha'); await p.waitForTimeout(1500);
  check('search by name works', (await vis(p.getByText('Bhavya'))) && !(await vis(p.getByText('Chetan'))));
  await p.getByPlaceholder('Search by name').fill(''); await p.waitForTimeout(1200);
});

step('Teacher-set password');
await attempt('reset', async () => {
  let n = p.reqs.length;
  await p.getByRole('button', { name: 'Reset password for Bhavya' }).first().click(); await p.waitForTimeout(800);
  check('asks for confirmation first', await vis(p.getByText(/choose a new password when they sign in/i)));
  check('nothing reset before confirming', (await dbq('select count(*) from password_resets')) === '0');
  await p.getByRole('button', { name: /^Reset password$|^Reset$/ }).last().click(); await p.waitForTimeout(2500);
  check('POST reset-password 200', since(n).some((r) => /POST \/api\/students\/.+\/reset-password -> 200/.test(r)), since(n).join(' | '));
  temp = await p.evaluate(() => (document.body.innerText.match(/\b[A-HJ-NP-Za-km-z2-9]{10}\b/g) || []).find((t) => /[A-Za-z]/.test(t) && /\d/.test(t)) || '');
  check('temporary password shown once (10 chars)', temp.length === 10, temp);
  await p.screenshot({ path: 'result-sheet.png' });
  const m = await mockPassword('s2@stemri.local');
  check('auth account now has that password', m.password === temp);
  check('flagged must_change_password', m.app_metadata?.must_change_password === true);
  check('audit row written', (await dbq(`select count(*) from password_resets where student_id='${S2}'`)) === '1');
  const logText = fs.readFileSync(process.env.API_LOG || '/tmp/stem-e2e/api.log', 'utf8');
  check('password never appears in the API log', !logText.includes(temp));
  await p.getByRole('button', { name: /^Done|^Close/ }).last().click().catch(() => {}); await p.waitForTimeout(800);
  check('password gone from the screen after closing', !(await p.evaluate((t) => document.body.innerText.includes(t), temp)));
  const tt = await tokenFor('teacher@stemri.local');
  const ownId = await dbq("select id from profiles where role='teacher' limit 1");
  check('a teacher cannot be reset (404)', (await api(tt, 'POST', `/api/students/${ownId}/reset-password`, {})).status === 404);
});

step('Student signs in with the temporary password');
await attempt('forced change', async () => {
  const sp = await newPage({ width: 420, height: 1000 }); sp.setDefaultTimeout(9000);
  await login(sp, 's2@stemri.local', temp);
  check('lands on the forced change-password screen', new URL(sp.url()).pathname === '/change-password', sp.url());
  await sp.goto(BASE + '/', { waitUntil: 'networkidle' }); await sp.waitForTimeout(2500);
  check('cannot reach the app until password is changed', new URL(sp.url()).pathname === '/change-password');
  const tok = await tokenFor('s2@stemri.local', temp);
  const feed = await api(tok, 'GET', '/api/feed/today');
  check('API refuses the feed (403 password_change_required)', feed.status === 403 && JSON.stringify(feed.json).includes('password_change_required'), `${feed.status}`);
  check('but allows GET /api/me', (await api(tok, 'GET', '/api/me')).status === 200);
  const f = sp.locator('input[type=password]:visible');
  await f.nth(0).fill('short'); await f.nth(1).fill('short');
  await sp.getByRole('button', { name: /Update|Change|Save|Continue/ }).first().click(); await sp.waitForTimeout(800);
  check('short password rejected', await vis(sp.getByText(/at least 8/)));
  await f.nth(0).fill('Fresh#Pass2026'); await f.nth(1).fill('Fresh#Pass2026');
  await sp.getByRole('button', { name: /Update|Change|Save|Continue/ }).first().click(); await sp.waitForTimeout(5000);
  check('after changing, the student reaches the app', new URL(sp.url()).pathname !== '/change-password', sp.url());
  const m = await mockPassword('s2@stemri.local');
  check('new password stored, flag cleared', m.password === 'Fresh#Pass2026' && m.app_metadata?.must_change_password === false, JSON.stringify(m));
  check('temporary password no longer works', !(await tokenFor('s2@stemri.local', temp)));
  check('feed works again', (await api(await tokenFor('s2@stemri.local', 'Fresh#Pass2026'), 'GET', '/api/feed/today')).status === 200);
  await sp.context().close();
});

step('Teacher signup with invite code');
await attempt('signup', async () => {
  const sp = await newPage({ width: 420, height: 1100 }); sp.setDefaultTimeout(9000);
  await sp.goto(BASE + '/signup', { waitUntil: 'networkidle' }); await sp.waitForTimeout(2000);
  const inputs = await sp.locator('input:visible').evaluateAll((els) => els.map((e) => e.getAttribute('placeholder') || e.getAttribute('aria-label')));
  console.log('  signup inputs:', JSON.stringify(inputs));
  await sp.locator('text=Teacher >> visible=true').first().click(); await sp.waitForTimeout(500);
  check('invite code field appears for teachers', await vis(sp.locator('input[placeholder*="invite" i]:visible')));
  await sp.locator('input[placeholder*="name" i]:visible').first().fill('New Teacher');
  await sp.locator('input[placeholder*="email" i]:visible').first().fill('newteacher@stemri.local');
  await sp.locator('input[type=password]:visible').first().fill('Teach#1234');
  await sp.locator('input[placeholder*="invite" i]:visible').fill('wrong-code');
  let n = sp.reqs.length;
  await sp.getByRole('button', { name: /Sign up|Create/ }).last().click(); await sp.waitForTimeout(2500);
  check('wrong code refused (403)', sp.reqs.slice(n).some((r) => r.startsWith('POST /api/auth/signup -> 403')), sp.reqs.slice(n).join(' | '));
  check('wrong code shows a clear message', await vis(sp.getByText(/invite code/i)));
  check('no account was created', (await dbq("select count(*) from profiles where full_name='New Teacher'")) === '0');
  await sp.locator('input[placeholder*="invite" i]:visible').fill('e2e-invite-code');
  n = sp.reqs.length;
  await sp.getByRole('button', { name: /Sign up|Create/ }).last().click(); await sp.waitForTimeout(6000);
  check('right code creates the account (201)', sp.reqs.slice(n).some((r) => r.startsWith('POST /api/auth/signup -> 201')), sp.reqs.slice(n).join(' | '));
  check('DB profile is a teacher', (await dbq("select role from profiles where full_name='New Teacher'")) === 'teacher');
  const tabs = await sp.getByRole('tab').allTextContents();
  check('new teacher is signed in with teacher tabs', tabs.some((t) => t.includes('Questions')), JSON.stringify(tabs));
  await sp.context().close();
});

step('Teacher profile');
await attempt('teacher profile', async () => {
  await p.goto(BASE + '/profile', { waitUntil: 'networkidle' }); await p.waitForTimeout(2500);
  check('teacher sees no Question language section', !(await vis(p.getByText(/Question language/i))));
  check('teacher sees no student stats', !(await vis(p.getByText(/My stats/i))));
  const n = p.reqs.length;
  await p.getByRole('button', { name: 'Edit name' }).first().click(); await p.waitForTimeout(500);
  await p.locator('input:visible').first().fill('Mrs. Kavya Rao');
  await p.getByRole('button', { name: /^Save/ }).first().click(); await p.waitForTimeout(2000);
  check('teacher can rename themself', since(n).some((r) => r.startsWith('PATCH /api/me -> 200')) && (await dbq("select full_name from profiles where role='teacher' and full_name like 'Mrs.%'")) === 'Mrs. Kavya Rao');
  const bad = await api(await tokenFor('teacher@stemri.local'), 'PATCH', '/api/me', { role: 'student' });
  check('role can never be changed via PATCH /api/me', bad.status === 400 && (await dbq("select role from profiles where full_name='Mrs. Kavya Rao'")) === 'teacher');
});

console.log('\nconsole/page errors:', p.logs.filter((l) => !/useNativeDriver|pointerEvents|status of 40[0-9]/.test(l)).slice(0, 6).join(' | ') || 'none');
const failed = summary(); await closeBrowser(); process.exit(failed ? 1 : 0);
