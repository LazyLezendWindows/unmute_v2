-- Deleting an account keeps two kinds of records, unlinked from the person:
--  * payment orders (plan, amount, Razorpay ids, dates), which tax law requires us to keep;
--  * reports the member made about others, so moderators can still act on them.
-- Both now outlive the user with the user column set to NULL. Re-runnable: information_schema checks.
-- MySQL & MariaDB compatible idempotent schema update using information_schema checks.

SET @sql = (SELECT IF(COUNT(*) > 0, 'ALTER TABLE billing_orders DROP FOREIGN KEY fk_billing_user', 'DO 0')
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_orders' AND CONSTRAINT_NAME = 'fk_billing_user' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

ALTER TABLE billing_orders MODIFY user_id VARCHAR(64) NULL;

SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE billing_orders ADD CONSTRAINT fk_billing_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL', 'DO 0')
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'billing_orders' AND CONSTRAINT_NAME = 'fk_billing_user' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) > 0, 'ALTER TABLE reports DROP FOREIGN KEY fk_reports_reporter', 'DO 0')
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reports' AND CONSTRAINT_NAME = 'fk_reports_reporter' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

ALTER TABLE reports MODIFY reporter_id VARCHAR(64) NULL;

SET @sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE reports ADD CONSTRAINT fk_reports_reporter FOREIGN KEY (reporter_id) REFERENCES users (id) ON DELETE SET NULL', 'DO 0')
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reports' AND CONSTRAINT_NAME = 'fk_reports_reporter' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

