-- Admin history is listed newest first; millisecond times keep quick successive actions in order.
ALTER TABLE admin_actions MODIFY created_at DATETIME(3) NOT NULL;
