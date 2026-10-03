-- Round 2: question authoring (draft/published, edit tracking, revisions).
-- Idempotent. Apply manually in the Supabase SQL editor; not applied by any script.

ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'published',
  ADD COLUMN IF NOT EXISTS edited_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS updated_by uuid NULL REFERENCES profiles(id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'questions_status_check'
  ) THEN
    ALTER TABLE questions
      ADD CONSTRAINT questions_status_check CHECK (status IN ('draft', 'published'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS question_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  revision_no integer NOT NULL,
  snapshot jsonb NOT NULL,
  edited_by uuid NULL REFERENCES profiles(id),
  edited_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT question_revisions_question_no_unique UNIQUE (question_id, revision_no)
);

ALTER TABLE question_revisions ENABLE ROW LEVEL SECURITY;
-- No policies: only the API (service connection) reads/writes, like the other tables.
