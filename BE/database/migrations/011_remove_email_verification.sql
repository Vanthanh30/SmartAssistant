-- Remove only verification data, retaining document notifications and cloud assets.
DELETE FROM mail_outbox WHERE kind='verification';
SET @drop_mail_fk = IF(EXISTS(SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='mail_outbox' AND CONSTRAINT_NAME='fk_mail_token'), 'ALTER TABLE mail_outbox DROP FOREIGN KEY fk_mail_token', 'SELECT 1');
PREPARE remove_verification FROM @drop_mail_fk;
EXECUTE remove_verification;
DEALLOCATE PREPARE remove_verification;
SET @drop_mail_token = IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='mail_outbox' AND COLUMN_NAME='token_hash'), 'ALTER TABLE mail_outbox DROP COLUMN token_hash', 'SELECT 1');
PREPARE remove_verification FROM @drop_mail_token;
EXECUTE remove_verification;
DEALLOCATE PREPARE remove_verification;
ALTER TABLE mail_outbox MODIFY kind ENUM('document') NOT NULL;
DROP TABLE IF EXISTS email_verifications;
DROP TABLE IF EXISTS email_accounts;
