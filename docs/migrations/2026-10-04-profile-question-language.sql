-- Round 2 (profile): student's preferred question language. Idempotent.
-- Not applied automatically; the owner runs this in the Supabase SQL editor.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS question_language text NOT NULL DEFAULT 'en';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_question_language_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_question_language_check
      CHECK (question_language IN ('en', 'kn', 'both'));
  END IF;
END $$;
