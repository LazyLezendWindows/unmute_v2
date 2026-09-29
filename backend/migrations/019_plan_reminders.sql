-- Reminders about the free trial or a plan ending, each sent once per end date (a renewal moves the
-- end date, so its reminders are sent again later).
CREATE TABLE IF NOT EXISTS plan_reminders (
  user_id VARCHAR(64) NOT NULL,
  kind VARCHAR(20) NOT NULL,
  ends_at DATETIME NOT NULL,
  sent_at DATETIME NOT NULL,
  PRIMARY KEY (user_id, kind, ends_at),
  CONSTRAINT fk_plan_rem_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
