import { newPage, login, BASE, closeBrowser, check, summary, dbq, chip } from './lib.mjs';
import fs from 'node:fs';
const p = await newPage({ width: 420, height: 1300 }); p.setDefaultTimeout(9000);
const step = (t) => console.log('\n## ' + t);
const vis = (loc) => loc.first().isVisible().catch(() => false);
const since = (n) => p.reqs.slice(n);
const attempt = async (name, fn) => { try { await fn(); } catch (e) { check(name + ' (step ran)', false, e.message.split('\n')[0]); } };
await login(p, 'teacher@stemri.local');

step('Chapters and topics');
await attempt('catalog', async () => {
  await p.goto(BASE + '/catalog', { waitUntil: 'networkidle' }); await p.waitForTimeout(2500);
  let n = p.reqs.length;
  await p.getByRole('button', { name: 'Add chapter' }).first().click(); await p.waitForTimeout(600);
  await p.locator('input[placeholder="e.g. 5"]:visible').fill('12');
  await p.locator('input[placeholder="e.g. Light and Shadows"]:visible').fill('Duplicate number');
  await chip(p, 'Physics').click();
  await chip(p, 'Add').click(); await p.waitForTimeout(1800);
  check('duplicate chapter number is refused (409)', since(n).some((r) => r.startsWith('POST /api/chapters -> 409')), since(n).join(' | '));
  await p.locator('input[placeholder="e.g. 5"]:visible').fill('13');
  await p.locator('input[placeholder="e.g. Light and Shadows"]:visible').fill('Electromagnetic Induction');
  n = p.reqs.length;
  await chip(p, 'Add').click(); await p.waitForTimeout(2000);
  check('chapter 13 created (201)', since(n).some((r) => r.startsWith('POST /api/chapters -> 201')), since(n).join(' | '));
  check('DB has chapter 13', (await dbq("select name from chapters where ncert_no=13")) === 'Electromagnetic Induction');
  await p.getByRole('button', { name: /Add a topic to Electromagnetic Induction/ }).first().click(); await p.waitForTimeout(700);
  const inputs = p.locator('input:visible');
  const cnt = await inputs.count();
  await inputs.nth(cnt - 2).fill('13.1'); await inputs.nth(cnt - 1).fill('Induced current');
  n = p.reqs.length;
  await chip(p, 'Add').click(); await p.waitForTimeout(2000);
  check('topic 13.1 created (201)', since(n).some((r) => r.startsWith('POST /api/sections -> 201')), since(n).join(' | '));
  check('DB has topic with sort_order 1', (await dbq("select sort_order from sections where section_no='13.1'")) === '1');
  check('topics with questions cannot be deleted from the UI', (await p.getByRole('button', { name: /Delete topic 12\.1.*unavailable/ }).count()) > 0);
  n = p.reqs.length;
  await p.getByRole('button', { name: /Delete topic 13\.1/ }).first().click(); await p.waitForTimeout(700);
  await p.getByRole('button', { name: /^Delete/ }).last().click(); await p.waitForTimeout(2000);
  check('empty topic deleted', since(n).some((r) => r.startsWith('DELETE /api/sections/') && r.endsWith('200')), since(n).join(' | '));
  n = p.reqs.length;
  await p.getByRole('button', { name: /Delete chapter Electromagnetic Induction/ }).first().click(); await p.waitForTimeout(700);
  await p.getByRole('button', { name: /^Delete/ }).last().click(); await p.waitForTimeout(2000);
  check('empty chapter deleted', (await dbq("select count(*) from chapters where ncert_no=13")) === '0', since(n).join(' | '));
});

step('Bulk import');
const HEADER = 'type,difficulty,language,text,option1,option2,option3,option4,correct,answer,explanation,chapter_no,section_no';
const good = [
  'flashcard,easy,en,IMPORT-1 What is 1?,,,,,,One,Because,12,12.1',
  'mcq,medium,en,IMPORT-2 pick B,A,B,C,D,2,,Because B,12,12.2',
  'flashcard,hard,kn,IMPORT-3 ಕನ್ನಡ ಪ್ರಶ್ನೆ,,,,,,ಉತ್ತರ,ವಿವರಣೆ,12,12.3',
];
const bad = 'mcq,medium,en,IMPORT-BAD no options,,,,,,,,12,12.1';
await attempt('import', async () => {
  await p.goto(BASE + '/import', { waitUntil: 'networkidle' }); await p.waitForTimeout(2000);
  const area = p.locator('textarea:visible').first();
  await area.fill([HEADER, ...good, bad].join('\n'));
  let n = p.reqs.length;
  await p.getByRole('button', { name: 'Check file', exact: true }).first().click(); await p.waitForTimeout(2500);
  const call = since(n).find((r) => r.startsWith('POST /api/questions/import'));
  check('dry run is safe (checked on-device or API 200)', !call || call.endsWith('200'), since(n).join(' | '));
  check('shows the invalid row', await vis(p.getByText(/IMPORT-BAD|invalid|row 4/i)));
  check('dry run wrote nothing', (await dbq("select count(*) from questions where question_text like 'IMPORT-%'")) === '0');
  await area.fill([HEADER, ...good].join('\n'));
  await p.getByRole('button', { name: 'Check file', exact: true }).first().click(); await p.waitForTimeout(2500);
  n = p.reqs.length;
  await p.getByRole('button', { name: /Import 3/ }).first().click(); await p.waitForTimeout(3000);
  check('import commit (200)', since(n).some((r) => r.startsWith('POST /api/questions/import -> 200')), since(n).join(' | '));
  check('3 questions created as drafts', (await dbq("select count(*) from questions where question_text like 'IMPORT-%' and status='draft'")) === '3');
  check('Kannada import kept as kn', (await dbq("select language from questions where question_text like 'IMPORT-3%'")) === 'kn');
  check('MCQ correct "2" mapped to option index 1', (await dbq("select correct_option from questions where question_text like 'IMPORT-2%'")) === '1');
  await area.fill([HEADER, ...good].join('\n')).catch(() => {});
});

step('Export');
await attempt('export', async () => {
  await p.goto(BASE + '/import', { waitUntil: 'networkidle' }); await p.waitForTimeout(2000);
  await p.locator('[aria-label^="Chapter 12"]:visible').first().click(); await p.waitForTimeout(600);
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 15000 }), p.getByRole('button', { name: /Download JSON/ }).first().click()]);
  const json = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  check('download is SeedContent for chapter 12', json.chapter?.ncert_no === 12 && Array.isArray(json.sections) && json.sections.length === 3, JSON.stringify(Object.keys(json)));
  check('export contains the imported drafts', JSON.stringify(json).includes('IMPORT-1'));
});

step('Calendar');
await attempt('calendar', async () => {
  await p.goto(BASE + '/calendar', { waitUntil: 'networkidle' }); await p.waitForTimeout(3000);
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const todayLabel = `${now.getDate()} ${now.toLocaleString('en-GB', { month: 'long' })}`;
  const cell = p.locator(`[aria-label^="${todayLabel}"]`).first();
  const label = await cell.getAttribute('aria-label');
  check('today cell reports questions added and topics activated', /questions? added/.test(label || '') && /topic/.test(label || ''), label || 'none');
  await cell.click(); await p.waitForTimeout(2000);
  check('day panel lists a question created today', await vis(p.getByText(/IMPORT-|Draft|DRAFT-Q/)));
  // plan ahead (close the day panel first)
  await p.keyboard.press('Escape'); await p.waitForTimeout(600);
  await p.getByRole('button', { name: /^Close/ }).last().click().catch(() => {}); await p.waitForTimeout(600);
  await p.getByRole('button', { name: 'Plan ahead' }).first().click(); await p.waitForTimeout(800);
  const tomorrow = new Date(now.getTime() + 86400000);
  const tLabel = `${tomorrow.getDate()} ${tomorrow.toLocaleString('en-GB', { month: 'long' })}`;
  await p.locator(`[aria-label^="${tLabel}"]`).first().click(); await p.waitForTimeout(500);
  await p.getByRole('button', { name: /Choose topics for the selected days/ }).first().click(); await p.waitForTimeout(1000);
  await p.screenshot({ path: 'plan-topics.png', fullPage: true });
  const boxes = p.getByRole('checkbox');
  check('topic checkboxes appear', (await boxes.count()) > 0);
  await boxes.first().click(); await p.waitForTimeout(400);
  const n = p.reqs.length;
  const go = p.getByRole('button', { name: /Plan|Review|Continue|Apply|Next/ }).last();
  await go.click(); await p.waitForTimeout(1200);
  await p.screenshot({ path: 'plan-confirm.png', fullPage: true });
  await p.getByRole('button', { name: /Confirm|Activate|Plan|Save/ }).last().click().catch(() => {}); await p.waitForTimeout(2500);
  check('POST /api/activations/plan 200', since(n).some((r) => r.startsWith('POST /api/activations/plan -> 200')), since(n).join(' | '));
  const tomIso = new Date(tomorrow.getTime()).toISOString().slice(0, 10);
  check('tomorrow is activated in the DB', Number(await dbq(`select count(*) from daily_sets ds join daily_set_sections dss on dss.daily_set_id=ds.id where ds.set_date >= current_date + 1`)) >= 1, tomIso);
});

console.log('\nconsole/page errors:', p.logs.filter((l) => !/useNativeDriver|pointerEvents|status of 40[0-9]/.test(l)).slice(0, 6).join(' | ') || 'none');
const failed = summary(); await closeBrowser(); process.exit(failed ? 1 : 0);
