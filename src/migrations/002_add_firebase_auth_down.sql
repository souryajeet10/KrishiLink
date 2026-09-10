-- 002_add_firebase_auth_down.sql
-- Revert firebase_uid column and index

DROP INDEX IF EXISTS idx_users_firebase_uid;
ALTER TABLE users DROP COLUMN IF EXISTS firebase_uid;
ALTER TABLE users ALTER COLUMN password SET NOT NULL;
