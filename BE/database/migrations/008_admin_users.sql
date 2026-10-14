CREATE TABLE IF NOT EXISTS audit_logs (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 actor_id BIGINT UNSIGNED NOT NULL,
 action VARCHAR(80) NOT NULL,
 entity_type VARCHAR(40) NOT NULL,
 entity_id BIGINT UNSIGNED NOT NULL,
 metadata_json JSON NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 KEY ix_audit_entity(entity_type,entity_id,created_at),
 CONSTRAINT fk_audit_actor FOREIGN KEY(actor_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- Transactional mutex: all account-status writers take this row before user/session rows.
CREATE TABLE IF NOT EXISTS admin_status_guard (id TINYINT UNSIGNED PRIMARY KEY) ENGINE=InnoDB;
INSERT IGNORE INTO admin_status_guard(id) VALUES(1);
