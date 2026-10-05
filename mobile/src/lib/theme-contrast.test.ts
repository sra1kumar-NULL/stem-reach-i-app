/// <reference types="node" />
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// theme.ts imports react-native and CSS, so read the literal values out of the source.
const theme = readFileSync(new URL('../constants/theme.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('../global.css', import.meta.url), 'utf8');

const hex = (re: RegExp): string => {
  const m = re.exec(theme);
  assert.ok(m, `not found: ${re}`);
  return m[1]!;
};
const lum = (h: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(h.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
};
const cssRgbToHex = (v: string) => '#' + v.split(' ').map((n) => Number(n).toString(16).padStart(2, '0')).join('');

test('Accents.primary fill matches CSS --primary and carries a 4.5:1 label', () => {
  const primary = hex(/primary: '(#[0-9A-Fa-f]{6})'/);
  const cssPrimary = [...css.matchAll(/--primary: (\d+ \d+ \d+);/g)].map((m) => cssRgbToHex(m[1]!));
  assert.ok(cssPrimary.length >= 2);
  for (const c of cssPrimary) assert.equal(c.toLowerCase(), primary.toLowerCase());
  assert.ok(ratio('#ECEFF4', primary) >= 4.5, 'nord6 on primary');
  assert.ok(ratio('#FFFFFF', primary) >= 4.5, 'white on primary');
});

test('destructive fill matches CSS --destructive and carries a 4.5:1 white label', () => {
  const d = hex(/destructive: '(#[0-9A-Fa-f]{6})'/);
  for (const m of css.matchAll(/--destructive: (\d+ \d+ \d+);/g)) assert.equal(cssRgbToHex(m[1]!).toLowerCase(), d.toLowerCase());
  assert.ok(ratio('#FFFFFF', d) >= 4.5);
  assert.ok(ratio('#ECEFF4', d) >= 4.5);
});

test('dark error text is readable on the dark card and background', () => {
  const t = hex(/dangerText: '(#[0-9A-Fa-f]{6})',\n    purpleText: '#D2BBCD'/);
  assert.ok(ratio(t, '#3B4252') >= 4.5);
  assert.ok(ratio(t, '#2E3440') >= 4.5);
});
