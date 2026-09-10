-- 003_add_fcm_tokens_down.sql
-- Rollback FCM tokens and device registration

DROP TABLE IF EXISTS user_device_tokens CASCADE;
ALTER TABLE users DROP COLUMN IF EXISTS fcm_token;
ALTER TABLE users DROP COLUMN IF EXISTS device_type;
