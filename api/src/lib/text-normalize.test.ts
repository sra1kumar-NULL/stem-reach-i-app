import { test } from "node:test";
import assert from "node:assert/strict";
import { isSimilar, normalizeQuestionText, tokenSetSimilarity } from "./text-normalize.js";

test("normalizeQuestionText: lowercases, strips punctuation, collapses whitespace", () => {
  assert.equal(normalizeQuestionText("  What  is   Force?! "), "what is force");
  assert.equal(normalizeQuestionText("Newton's  law, (first)"), "newtons law first");
});

test("normalizeQuestionText: NFC makes composed and decomposed forms equal", () => {
  assert.equal(normalizeQuestionText("café"), normalizeQuestionText("café"));
});

test("normalizeQuestionText: keeps Kannada letters and combining vowel signs", () => {
  assert.equal(normalizeQuestionText("ಬಲ ಎಂದರೇನು?"), "ಬಲ ಎಂದರೇನು");
});

test("isSimilar: exact normalised match", () => {
  assert.equal(isSimilar("What is force?", "what is FORCE"), true);
  assert.equal(isSimilar("ಬಲ ಎಂದರೇನು?", "ಬಲ ಎಂದರೇನು"), true);
});

test("isSimilar: token-set Jaccard threshold is 0.85", () => {
  const base = "a b c d e f g h i j k l m n o p q r s t"; // 20 tokens
  assert.equal(isSimilar(base, base + " u"), true); // 20/21 = 0.95
  const threeMissing = "a b c d e f g h i j k l m n o p q"; // 17/20 = 0.85
  assert.equal(tokenSetSimilarity(base, threeMissing), 0.85);
  assert.equal(isSimilar(base, threeMissing), true);
  assert.equal(isSimilar(base, "a b c d e f g h i j k l m n o p"), false); // 16/20 = 0.8
});

test("isSimilar: different questions and empty strings are not similar", () => {
  assert.equal(isSimilar("What is force?", "What is energy?"), false);
  assert.equal(isSimilar("???", "!!!"), false);
  assert.equal(isSimilar("", "x"), false);
});

test("isSimilar: Kannada token-set similarity", () => {
  const nineWords = "ಭೂಮಿಯ ಮೇಲೆ ಗುರುತ್ವಾಕರ್ಷಣೆ ಬಲ ಎಂದರೇನು ಎಂದು ವಿವರಿಸಿ ಸರಳವಾಗಿ ಉದಾಹರಣೆ";
  assert.equal(isSimilar(nineWords, nineWords + " ದಯವಿಟ್ಟು?"), true, "9/10 shared words = 0.9");
  assert.equal(isSimilar(nineWords, "ಸಂಪೂರ್ಣ ಬೇರೆ ಪ್ರಶ್ನೆ ಇದು"), false);
});
