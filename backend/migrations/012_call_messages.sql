-- Calls appear in the chat history as messages of kind 'call' ("Missed video call",
-- "Voice call · 3:12"). Text messages are kind 'text'; the call_* columns are only set for calls.
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS kind VARCHAR(16) NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS call_mode VARCHAR(8) NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS call_outcome VARCHAR(12) NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS call_seconds INT NULL DEFAULT NULL;
