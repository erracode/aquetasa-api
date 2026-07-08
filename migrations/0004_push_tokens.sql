-- Migration: Add push_tokens table for Expo Push Notifications
-- Created: 2026-02-13

CREATE TABLE IF NOT EXISTS push_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL CHECK(platform IN ('ios', 'android')),
  registered_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Index for efficient token lookups
CREATE INDEX IF NOT EXISTS idx_push_tokens_token ON push_tokens(token);

-- Index for cleaning up old tokens
CREATE INDEX IF NOT EXISTS idx_push_tokens_registered_at ON push_tokens(registered_at);

-- Note: recipient_count column will be added manually if needed
-- ALTER TABLE notification_log ADD COLUMN recipient_count INTEGER DEFAULT 0;
