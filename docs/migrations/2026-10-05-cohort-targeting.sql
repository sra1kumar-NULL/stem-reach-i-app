-- Adds cohort-targeting to daily sets.
-- 0 rows for a daily_set_id = unrestricted (all students). Backward-compatible.
CREATE TABLE IF NOT EXISTS daily_set_cohorts (
  daily_set_id  UUID    NOT NULL REFERENCES daily_sets(id) ON DELETE CASCADE,
  class_section TEXT    NOT NULL,
  PRIMARY KEY (daily_set_id, class_section)
);
CREATE INDEX IF NOT EXISTS idx_daily_set_cohorts_set ON daily_set_cohorts(daily_set_id);
