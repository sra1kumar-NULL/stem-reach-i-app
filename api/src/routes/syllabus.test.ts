import { test } from "node:test";
import assert from "node:assert/strict";

import type { SyllabusResponse } from "@stemreach/core";
import { fakeCtx, fakeDb, harness } from "../test-utils.js";
import * as syllabus from "./syllabus.js";

const chap = (id: string, no: number, name: string) => ({ chapterId: id, ncertNo: no, chapterName: name, subject: "physics" });

test("a chapter with no topics yet is listed with sections: []", async () => {
  const { db } = fakeDb([
    [
      { ...chap("c1", 1, "Motion"), sectionId: "s1", sectionNo: "1.1", sectionName: "Speed", sectionSortOrder: 1, questionCount: 5, enabledCount: 4 },
      { ...chap("c2", 2, "Brand new"), sectionId: null, sectionNo: null, sectionName: null, sectionSortOrder: null, questionCount: 0, enabledCount: 0 },
    ],
  ]);
  const res = await harness(syllabus.routes(fakeCtx(db))).request("/");
  assert.equal(res.status, 200);
  const body = (await res.json()) as SyllabusResponse;
  assert.deepEqual(body.chapters.map((c) => [c.ncert_no, c.sections.length]), [[1, 1], [2, 0]]);
  assert.equal(body.chapters[0]!.sections[0]!.enabled_question_count, 4);
  assert.equal(body.chapters[0]!.sections[0]!.sort_order, 1);
});

test("students cannot read the syllabus (403)", async () => {
  const { db } = fakeDb([[]]);
  const res = await harness(syllabus.routes(fakeCtx(db)), "student").request("/");
  assert.equal(res.status, 403);
});
