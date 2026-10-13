-- Admin Panel RBAC, MFA, and Audit logging enhancements
ALTER TABLE admins ADD COLUMN IF NOT EXISTS role VARCHAR(32) NOT NULL DEFAULT 'admin';
ALTER TABLE admins ADD COLUMN IF NOT EXISTS is_active TINYINT(1) NOT NULL DEFAULT 1;
ALTER TABLE admins ADD COLUMN IF NOT EXISTS totp_secret_encrypted TEXT NULL DEFAULT NULL;
ALTER TABLE admins ADD COLUMN IF NOT EXISTS totp_enabled TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE admins ADD COLUMN IF NOT EXISTS totp_last_step BIGINT NULL DEFAULT NULL;

-- Ensure earliest admin is super_admin if any admins exist
UPDATE admins SET role = 'super_admin' WHERE id = (SELECT id FROM (SELECT id FROM admins ORDER BY created_at ASC LIMIT 1) AS sub);

-- Admin actions enhancement for audit trail
ALTER TABLE admin_actions ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45) NULL DEFAULT NULL;
ALTER TABLE admin_actions ADD COLUMN IF NOT EXISTS target_type VARCHAR(32) NULL DEFAULT 'user';
ALTER TABLE admin_actions ADD INDEX IF NOT EXISTS idx_admin_actions_action (action, created_at);
