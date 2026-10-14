-- Usage contains no question/answer/source data and survives conversation deletion.
CREATE TABLE IF NOT EXISTS ask_usage (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 user_id BIGINT UNSIGNED NOT NULL,
 charged_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 legacy_message_id BIGINT UNSIGNED NULL,
 UNIQUE KEY uq_usage_legacy(legacy_message_id),
 KEY ix_usage_owner_time(user_id,charged_at),
 CONSTRAINT fk_usage_user FOREIGN KEY(user_id) REFERENCES users(id)
) ENGINE=InnoDB;
INSERT INTO ask_usage(user_id,charged_at,legacy_message_id)
SELECT c.user_id,m.created_at,m.id
FROM qa_messages m JOIN conversations c ON c.id=m.conversation_id
WHERE m.role='user'
ON DUPLICATE KEY UPDATE legacy_message_id=VALUES(legacy_message_id);
UPDATE conversations c JOIN qa_messages m ON m.id=(SELECT MIN(q.id) FROM qa_messages q WHERE q.conversation_id=c.id AND q.role='user')
SET c.title=LEFT(m.content,150) WHERE c.title='Hội thoại mới';
