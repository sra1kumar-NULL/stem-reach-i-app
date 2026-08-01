# Daily Revision App — Product Requirements Document (Prototype)

> Original PRD provided by the team. Retained as the source of truth for intent.
> Companion docs: [HLD](03-HLD.md) · [LLD](04-LLD.md) · [Roadmap](05-ROADMAP.md)

## 1. Executive Summary & Objective

- **Target School/Context:** MES School, Lakkere — Class 10 Physics / Science (STEMRI initiative).
- **Problem:** Students forget concepts taught in Saturday sessions due to a lack of daily revision, leaving them blank when checked the following week.
- **Solution:** A bite-sized, daily micro-learning flashcard/MCQ app with a **vertical scroll interface** (TikTok/Reels-style) that engages students in 5–10 minutes of active recall every day, based on the syllabus the teacher marks as "taught."

## 2. User Roles

1. **Teacher / Administrator:** Selects topics covered in class; views student activity and performance reports.
2. **Student:** Sees daily revision cards/questions, submits responses, tracks own streak/score.

## 3. Core Feature Requirements

### Module A — Teacher Interface (Topic Management & Dashboard)

- **A.1 Topic Marking (Daily Trigger):** Checklist interface mapped to the textbook curriculum (e.g., *Ch.12 Magnetic Effects of Electric Current → 12.1, 12.2*). Teacher selects the section(s) taught that day → "Activate Revision."
- **A.2 Teacher Analytics:** Participation tracker (who completed today's revision vs. missed) and performance overview (avg score per student, accuracy per topic).

### Module B — Student Experience (Feed & Engagement)

- **B.1 Reels-style Vertical Feed:** Feed populates with questions tagged strictly to active sections. One question per screen; swipe up → next.
- **B.2 Question Formats:**
  - **Mode 1 (MCQ):** Question → select option → instant feedback + brief explanation.
  - **Mode 2 (Active Recall):** Question shown → think/write on paper → tap "Show Answer" → self-evaluate ("Got it right" / "Need practice").
  - *(V2 optional)* Image upload of hand-written working for teacher review.

### Module C — Backend & Content Management

- **C.1 Question Bank:** Pre-loaded questions tagged hierarchically: Chapter → Section → Question. Types: MCQ, Flashcard.
- **C.2 Automated Scoring:** MCQs auto-graded, daily score logged, daily completion status computed (e.g., 4/4 attempted = "Daily Revision Complete").

## 4. Curriculum Reference (10th STEMRI Modules — NCERT)

Extracted from the Notion doc (July 2026 version). This is the syllabus tree the app will map to.

| # | Module | Subject |
|---|--------|---------|
| 1 | Chemical Reactions and Equations | Chemistry |
| 2 | Acids, Bases & Salts | Chemistry |
| 3 | Metals and Non-metals | Chemistry |
| 4 | Carbon and its compounds | Chemistry |
| 5 | Life Processes | Biology |
| 6 | Control and Coordination | Biology |
| 7 | How do Organisms Reproduce? | Biology |
| 8 | Heredity | Biology |
| 9 | Light – Reflection and Refraction | Physics |
| 10 | The human eye and the colorful world | Physics |
| 11 | Electricity | Physics |
| 11 | ವಿದ್ಯುಚ್ಛಕ್ತಿ (Electricity, Kannada) | Physics |
| 12 | Magnetic Effects of Electric Current | Physics |
| 13 | Our Environment | General |

**Notes for the app:**
- Module numbering follows NCERT chapters; module 11 has a bilingual (Kannada) variant → schema must support a `language` field on content.
- Pilot scope (per PRD Step 1): Ch.12 Magnetic Effects — pick 2–3 sections, draft 10–15 quick MCQs per section with 1-sentence explanations.
