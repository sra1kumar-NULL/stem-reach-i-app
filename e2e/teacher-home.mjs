// Teacher "Today's revision" home screen: topic cards, select-all, activation, status line.
// Run after `e2e/stack.sh reset`. E2E_BASE overrides the web URL (default: the shared stack).
import { newPage, BASE as DEFAULT_BASE, closeBrowser, check, summary, dbq } from './lib.mjs';
const BASE = process.env.E2E_BASE || DEFAULT_BASE;
const p = await newPage({ width: 420, height: 1300 }); p.setDefaultTimeout(9000);
const step = (t) => console.log('\n## ' + t);
const vis = (loc) => loc.first().isVisible().catch(() => false);
const since = (n) => p.reqs.slice(n);
const attempt = async (name, fn) => { try { await fn(); } catch (e) { check(name + ' (step ran)', false, e.message.split('\n')[0]); } };
const TODAY = "(now() at time zone 'Asia/Kolkata')::date";
const todayRows = () => dbq(`select count(*) from daily_set_sections dss join daily_sets d on d.id=dss.daily_set_id where d.set_date=${TODAY}`);
const topic = (no) => p.getByRole('checkbox', { name: new RegExp('^' + no.replace('.', '\\.') + ' ') });
const checked = async (no) => (await topic(no).first().getAttribute('aria-checked')) === 'true';
const summaryText = () => p.locator('[aria-live="polite"]').allInnerTexts().then((a) => a.join(' | '));
const action = () => p.getByRole('button', { name: /^(Activate|Update)/ }).last();

await p.goto(BASE + '/login', { waitUntil: 'networkidle', timeout: 120000 });
await p.locator('input[placeholder="email"]:visible').fill('teacher@stemri.local');
await p.locator('input[placeholder="password"]:visible').fill('Stemri@2026');
await p.keyboard.press('Enter'); await p.waitForTimeout(6000);

step('Layout');
await attempt('layout', async () => {
  await p.goto(BASE + '/', { waitUntil: 'networkidle' }); await p.waitForTimeout(3000);
  check('header says Today\'s revision', await vis(p.getByText("Today's revision", { exact: true })));
  check('three topic checkboxes', (await p.getByRole('checkbox').count()) === 3, String(await p.getByRole('checkbox').count()));
  check('cards are titled with the topic name', await vis(p.getByText('Magnetic Field and Field Lines', { exact: true })));
  check('cards show the topic number as a label', await vis(p.getByText('12.1', { exact: true })));
  const body = await p.locator('body').innerText();
  check('no "chapter — 12.1" style titles', !/Current\s*—\s*12\.\d/.test(body));
  check('chapter shows "x of y selected"', /\d of 3 selected/.test(body), body.slice(0, 200));
  check('sign out is not in the header', (await p.getByRole('button', { name: 'Sign out' }).count()) === 0);
  check('class overview section has 3 links', (await p.getByRole('link', { name: /Participation today|Students\.|Performance\./ }).count()) === 3);
  check('no horizontal scroll at 420', await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
});

step('Select, deselect, select all');
await attempt('selection', async () => {
  await p.getByRole('button', { name: /^Clear topics in/ }).click().catch(async () => p.getByRole('button', { name: /^Select all topics in/ }).click());
  await p.waitForTimeout(400);
  if (await checked('12.1')) await p.getByRole('button', { name: /^Clear topics in/ }).click();
  await p.waitForTimeout(400);
  check('Clear unchecks every topic', !(await checked('12.1')) && !(await checked('12.2')) && !(await checked('12.3')));
  check('summary says no topics selected', /No topics selected/.test(await p.locator('body').innerText()));
  check('action button is disabled with nothing selected', await action().isDisabled());
  await topic('12.1').click(); await p.waitForTimeout(300);
  check('tap selects one topic', (await checked('12.1')) && !(await checked('12.2')));
  check('summary shows 1 topic · 15 questions', /1 topic selected/.test(await p.locator('body').innerText()) && /15 live questions/.test(await p.locator('body').innerText()));
  check('chapter shows 1 of 3 topics selected', await vis(p.getByText(/1 of 3 selected/)));
  await topic('12.1').click(); await p.waitForTimeout(300);
  check('tap again deselects', !(await checked('12.1')));
  await p.getByRole('button', { name: /^Select all topics in/ }).click(); await p.waitForTimeout(400);
  check('Select all checks all three', (await checked('12.1')) && (await checked('12.2')) && (await checked('12.3')));
  check('summary shows 3 topics · 49 questions', /3 topics selected/.test(await p.locator('body').innerText()) && /49 live questions/.test(await p.locator('body').innerText()));
  check('action button enabled', !(await action().isDisabled()));
});

step('Activate');
await attempt('activate', async () => {
  // Start from a clean day so the first activation is an "Activate" (not "Update").
  await dbq(`delete from daily_set_sections where daily_set_id in (select id from daily_sets where set_date=${TODAY})`);
  await p.goto(BASE + '/', { waitUntil: 'networkidle' }); await p.waitForTimeout(3000);
  check('nothing activated yet is shown', await vis(p.getByText('Nothing activated yet')));
  check('button says Activate', await vis(p.getByRole('button', { name: /^Activate for students$/ })));
  await p.getByRole('button', { name: /^Select all topics in/ }).click(); await p.waitForTimeout(300);
  await topic('12.3').click(); await p.waitForTimeout(300);
  let n = p.reqs.length;
  await action().click(); await p.waitForTimeout(600);
  await p.getByRole('button', { name: /^Yes, activate/ }).click(); await p.waitForTimeout(2500);
  check('POST /api/activations -> 200', since(n).some((r) => r.startsWith('POST /api/activations -> 200')), since(n).join(' | '));
  check('DB has 2 daily_set_sections rows today', (await todayRows()) === '2', await todayRows());
  check('status line updates', await vis(p.getByText('2 topics activated today · 32 live questions')), (await p.locator('body').innerText()).slice(0, 160));
  check('button now says Update', await vis(p.getByRole('button', { name: /^Update today's topics$/ })));
  check('deselected earlier topic hints "active today" only when it was active', !(await vis(p.getByText(/active today/))));

  // Update to all three.
  await topic('12.3').click(); await p.waitForTimeout(300);
  n = p.reqs.length;
  await action().click(); await p.waitForTimeout(600);
  await p.getByRole('button', { name: /^Yes, update/ }).click(); await p.waitForTimeout(2500);
  check('update POST -> 200', since(n).some((r) => r.startsWith('POST /api/activations -> 200')), since(n).join(' | '));
  check('DB has 3 rows today', (await todayRows()) === '3', await todayRows());
  check('status line shows 3 topics · 49 questions', await vis(p.getByText('3 topics activated today · 49 live questions')));

  // Cancel in the confirm dialog does not write.
  await topic('12.2').click(); await p.waitForTimeout(300);
  check('deselected active topic is hinted', await vis(p.getByText(/active today/)));
  n = p.reqs.length;
  await action().click(); await p.waitForTimeout(600);
  await p.getByRole('button', { name: 'Cancel' }).click(); await p.waitForTimeout(800);
  check('Cancel sends no request', !since(n).some((r) => r.startsWith('POST /api/activations')), since(n).join(' | '));
  check('DB unchanged after Cancel', (await todayRows()) === '3');

  await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(3000);
  check('reload restores the active selection', (await checked('12.1')) && (await checked('12.2')) && (await checked('12.3')));
});

step('Class overview and collapse');
await attempt('overview', async () => {
  await p.getByRole('link', { name: /^Students\./ }).click(); await p.waitForTimeout(1500);
  check('Students link navigates', /\/students/.test(p.url()), p.url());
  await p.goto(BASE + '/', { waitUntil: 'networkidle' }); await p.waitForTimeout(2500);
  await p.getByRole('button', { name: /^Magnetic Effects of Electric Current, .*topics selected/ }).click(); await p.waitForTimeout(400);
  check('chapter collapses', (await p.getByRole('checkbox').count()) === 0);
  await p.getByRole('button', { name: /^Magnetic Effects of Electric Current, .*topics selected/ }).click(); await p.waitForTimeout(400);
  check('chapter expands again', (await p.getByRole('checkbox').count()) === 3);
});

step('Error and retry');
await attempt('error', async () => {
  await p.route('**/api/syllabus*', (r) => r.abort());
  await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(3000);
  check('error state with Retry', await vis(p.getByRole('button', { name: 'Retry' })));
  await p.unroute('**/api/syllabus*');
  await p.getByRole('button', { name: 'Retry' }).click(); await p.waitForTimeout(2500);
  check('Retry recovers', (await p.getByRole('checkbox').count()) === 3);
});

check('no console errors', p.logs.filter((l) => !/Failed to load resource|ERR_FAILED|net::/.test(l)).length === 0, p.logs.join(' | '));
const failed = summary();
await closeBrowser();
process.exit(failed ? 1 : 0);
