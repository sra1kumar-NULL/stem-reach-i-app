import { test } from "node:test";
import assert from "node:assert/strict";
import { generatePassword, GENERATED_PASSWORD_LENGTH, PASSWORD_ALPHABET } from "./password-gen.js";

test("generated passwords are 10 chars from the unambiguous alphabet", () => {
  for (let i = 0; i < 200; i++) {
    const p = generatePassword();
    assert.equal(p.length, GENERATED_PASSWORD_LENGTH);
    assert.match(p, /^[A-HJ-NP-Za-km-z2-9]+$/);
    assert.doesNotMatch(p, /[0O1lIo]/);
    assert.match(p, /[0-9]/);
    assert.match(p, /[a-zA-Z]/);
  }
});

test("alphabet has no ambiguous characters and no duplicates", () => {
  assert.doesNotMatch(PASSWORD_ALPHABET, /[0O1lIo]/);
  assert.equal(new Set(PASSWORD_ALPHABET).size, PASSWORD_ALPHABET.length);
});

test("1000 draws are all unique", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 1000; i++) seen.add(generatePassword());
  assert.equal(seen.size, 1000);
});
