import { test } from "node:test";
import assert from "node:assert/strict";

import { addDaysIso, isValidIsoDate, isValidTimeZone, todayInTz } from "./dates.ts";

test("todayInTz uses the school timezone, not UTC", () => {
  // 2026-10-03 20:00 UTC is already 2026-10-04 01:30 in IST.
  const lateUtc = new Date(Date.UTC(2026, 9, 3, 20, 0));
  assert.equal(todayInTz("Asia/Kolkata", lateUtc), "2026-10-04");
  assert.equal(todayInTz("UTC", lateUtc), "2026-10-03");
  // Just before IST midnight (18:29 UTC) it is still the 3rd.
  assert.equal(todayInTz("Asia/Kolkata", new Date(Date.UTC(2026, 9, 3, 18, 29))), "2026-10-03");
});

test("addDaysIso rolls months, years and leap days", () => {
  assert.equal(addDaysIso("2026-10-31", 1), "2026-11-01");
  assert.equal(addDaysIso("2027-01-01", -1), "2026-12-31");
  assert.equal(addDaysIso("2028-02-28", 1), "2028-02-29");
});

test("isValidIsoDate rejects impossible calendar dates", () => {
  assert.equal(isValidIsoDate("2026-10-03"), true);
  assert.equal(isValidIsoDate("2028-02-29"), true);
  assert.equal(isValidIsoDate("2026-02-30"), false);
  assert.equal(isValidIsoDate("2026-13-01"), false);
  assert.equal(isValidIsoDate("2026-1-1"), false);
  assert.equal(isValidIsoDate("not-a-date"), false);
});

test("isValidTimeZone", () => {
  assert.equal(isValidTimeZone("Asia/Kolkata"), true);
  assert.equal(isValidTimeZone("Mars/Olympus"), false);
});
