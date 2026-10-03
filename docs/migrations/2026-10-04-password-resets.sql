-- Audit table for teacher-set student password resets (Round 2, student-reset).
-- Idempotent. RLS on with no policies: only the API (service connection) touches it.
CREATE TABLE IF NOT EXISTS password_resets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES profiles(id),
  reset_by uuid NOT NULL REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_password_resets_student ON password_resets (student_id);
ALTER TABLE password_resets ENABLE ROW LEVEL SECURITY;
