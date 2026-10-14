CREATE TABLE IF NOT EXISTS email_accounts (
 user_id BIGINT UNSIGNED PRIMARY KEY, verified_at DATETIME(3) NULL,
 CONSTRAINT fk_email_account_user FOREIGN KEY(user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
INSERT IGNORE INTO email_accounts(user_id,verified_at) SELECT id,UTC_TIMESTAMP(3) FROM users;
CREATE TABLE IF NOT EXISTS email_verifications (
 token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 user_id BIGINT UNSIGNED NOT NULL, expires_at DATETIME(3) NOT NULL, consumed_at DATETIME(3) NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 KEY ix_email_verification_user(user_id,created_at),
 CONSTRAINT fk_verification_user FOREIGN KEY(user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS mail_outbox (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, event_key VARCHAR(150) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
 user_id BIGINT UNSIGNED NOT NULL, recipient VARCHAR(254) NOT NULL,
 kind ENUM('verification','document') NOT NULL, token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
 subject VARCHAR(255) NOT NULL, body TEXT NULL,
 state ENUM('queued','sending','sent','failed','cancelled') NOT NULL DEFAULT 'queued',
 attempts INT UNSIGNED NOT NULL DEFAULT 0, locked_by CHAR(36) NULL, locked_until DATETIME(3) NULL,
 next_run_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), error_code VARCHAR(80) NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), sent_at DATETIME(3) NULL,
 KEY ix_mail_queue(state,next_run_at),
 CONSTRAINT fk_mail_user FOREIGN KEY(user_id) REFERENCES users(id),
 CONSTRAINT fk_mail_token FOREIGN KEY(token_hash) REFERENCES email_verifications(token_hash) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS cloud_assets (
 public_id VARCHAR(220) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 cloud_name VARCHAR(100) NOT NULL, resource_type ENUM('raw','image') NOT NULL,
 storage_key VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
 user_id BIGINT UNSIGNED NOT NULL, document_id BIGINT UNSIGNED NULL UNIQUE,
 size_bytes BIGINT UNSIGNED NOT NULL, sha256 CHAR(64) NOT NULL,
 state ENUM('queued','uploading','uploaded','failed','deleting','deleted') NOT NULL DEFAULT 'queued',
 attempts INT UNSIGNED NOT NULL DEFAULT 0, locked_by CHAR(36) NULL, locked_until DATETIME(3) NULL,
 next_run_at DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3), error_code VARCHAR(80) NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), uploaded_at DATETIME(3) NULL,
 KEY ix_cloud_queue(state,next_run_at),
 CONSTRAINT fk_cloud_user FOREIGN KEY(user_id) REFERENCES users(id),
 CONSTRAINT fk_cloud_document FOREIGN KEY(document_id) REFERENCES documents(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
