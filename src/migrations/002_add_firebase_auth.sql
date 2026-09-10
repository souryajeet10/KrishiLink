-- 002_add_firebase_auth.sql
-- Add firebase_uid to users and allow password to be nullable since Firebase manages auth

DO $$
BEGIN
  -- Add firebase_uid column if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'firebase_uid'
  ) THEN
    ALTER TABLE users ADD COLUMN firebase_uid VARCHAR(128) UNIQUE;
    CREATE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid);
  END IF;

  -- Allow password to be nullable (Firebase handles credential storage)
  ALTER TABLE users ALTER COLUMN password DROP NOT NULL;
END $$;
