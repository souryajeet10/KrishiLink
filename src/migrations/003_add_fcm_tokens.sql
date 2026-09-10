-- 003_add_fcm_tokens.sql
-- Add fcm_token and device tracking for Firebase Cloud Messaging push notifications

DO $$
BEGIN
  -- 1. Add fcm_token to users table if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'fcm_token'
  ) THEN
    ALTER TABLE users ADD COLUMN fcm_token VARCHAR(512);
    CREATE INDEX IF NOT EXISTS idx_users_fcm_token ON users(fcm_token);
  END IF;

  -- 2. Add device_type column to users table
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'device_type'
  ) THEN
    ALTER TABLE users ADD COLUMN device_type VARCHAR(50) DEFAULT 'web';
  END IF;
END $$;

-- 3. Dedicated user_device_tokens table for multi-device support
CREATE TABLE IF NOT EXISTS user_device_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(512) NOT NULL UNIQUE,
  device_type VARCHAR(50) DEFAULT 'web',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_device_tokens_user_id ON user_device_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_user_device_tokens_token ON user_device_tokens(token);
