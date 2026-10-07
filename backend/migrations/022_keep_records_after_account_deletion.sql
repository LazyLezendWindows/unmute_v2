-- Deleting an account keeps two kinds of records, unlinked from the person:
--  * payment orders (plan, amount, Razorpay ids, dates), which tax law requires us to keep;
--  * reports the member made about others, so moderators can still act on them.
-- Both now outlive the user with the user column set to NULL. Re-runnable: DROP ... IF EXISTS.
ALTER TABLE billing_orders DROP FOREIGN KEY IF EXISTS fk_billing_user;
ALTER TABLE billing_orders MODIFY user_id VARCHAR(64) NULL;
ALTER TABLE billing_orders ADD CONSTRAINT fk_billing_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE reports DROP FOREIGN KEY IF EXISTS fk_reports_reporter;
ALTER TABLE reports MODIFY reporter_id VARCHAR(64) NULL;
ALTER TABLE reports ADD CONSTRAINT fk_reports_reporter FOREIGN KEY (reporter_id) REFERENCES users (id) ON DELETE SET NULL;
