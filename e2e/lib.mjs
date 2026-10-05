import { chromium } from 'playwright-core';
export const BASE = 'http://localhost:8301';
export const API = 'http://localhost:3100';
export const GOTRUE = 'http://localhost:9999';
let browser;
export async function newPage(viewport = { width: 420, height: 900 }) {
  browser ??= await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport, acceptDownloads: true });
  const p = await ctx.newPage();
  p.logs = []; p.reqs = [];
  p.on('console', (m) => { if (m.type() === 'error') p.logs.push(m.text().slice(0, 220)); });
  p.on('pageerror', (e) => p.logs.push('PAGEERROR ' + e.message.slice(0, 250)));
  p.on('response', (r) => { if (r.url().startsWith(API)) { const u = new URL(r.url()); p.reqs.push(`${r.request().method()} ${u.pathname}${u.search} -> ${r.status()}`); } });
  return p;
}
export async function login(p, email, password = 'Stemri@2026') {
  await p.goto(BASE + '/login', { waitUntil: 'networkidle', timeout: 120000 });
  await p.locator('input[placeholder="email"]:visible').fill(email);
  await p.locator('input[placeholder="password"]:visible').fill(password);
  await p.keyboard.press('Enter');
  await p.waitForTimeout(6000);
}
export const closeBrowser = () => browser?.close();
let pass = 0, fail = 0; const failures = [];
export function check(name, ok, detail = '') { if (ok) { pass++; console.log('  PASS', name); } else { fail++; failures.push(name); console.log('  FAIL', name, detail); } }
export const summary = () => { console.log(`\nRESULT: ${pass} passed, ${fail} failed${fail ? ' -> ' + failures.join('; ') : ''}`); return fail; };
export async function dbq(sql) { const { execSync } = await import('node:child_process'); return execSync(`podman exec stem-pg psql -U postgres -d stem_e2e -Atc "${sql.replace(/"/g, '\\"')}"`).toString().trim(); }
export async function mockPassword(email) { return (await (await fetch(`${GOTRUE}/__password?email=${encodeURIComponent(email)}`)).json()); }
export async function tokenFor(email, password = 'Stemri@2026') {
  const r = await fetch(`${GOTRUE}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
  return (await r.json()).access_token;
}
export async function api(token, method, path, body) {
  const r = await fetch(`${API}${path}`, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await r.json(); } catch { /* empty */ }
  return { status: r.status, json };
}
export const chip = (p, text) => p.locator(`text=${text} >> visible=true`).last();
export async function openQuestions(p) { await p.getByRole('tab', { name: /Questions/ }).click(); await p.waitForTimeout(2500); }
export async function pickTopic(p, name = 'Magnetic Field and Field Lines') {
  await p.locator('[aria-label^="Topic"]:visible').first().click(); await p.waitForTimeout(700);
  await p.locator(`text=${name} >> visible=true`).last().click(); await p.waitForTimeout(500);
}
