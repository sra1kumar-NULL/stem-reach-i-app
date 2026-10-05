-- Round 3: indexes for the foreign-key lookups and aggregates added in Rounds 2-3. Idempotent.
--
--  * idx_submissions_question     GET /questions (per-row submission_count), the in-use checks on
--                                 PATCH/DELETE question, and the FK submissions.question_id.
--  * idx_submissions_set          reports (participation), calendar day/month, feed lookups by set;
--                                 the existing (student_id, daily_set_id) index cannot serve a lookup
--                                 by set alone.
--  * idx_review_states_question   FK review_states.question_id and the question delete/in-use checks.
--
-- Safe to run on a live database (brief write lock per index). On a large submissions table, run each
-- statement separately with CREATE INDEX CONCURRENTLY instead (cannot run inside a transaction).
CREATE INDEX IF NOT EXISTS idx_submissions_question ON submissions (question_id);
CREATE INDEX IF NOT EXISTS idx_submissions_set ON submissions (daily_set_id);
CREATE INDEX IF NOT EXISTS idx_review_states_question ON review_states (question_id);
