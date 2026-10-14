CREATE TABLE IF NOT EXISTS conversations (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 course_id BIGINT UNSIGNED NOT NULL, user_id BIGINT UNSIGNED NOT NULL,
 title VARCHAR(150) NOT NULL DEFAULT 'Hội thoại mới',
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 CONSTRAINT fk_conversation_owner FOREIGN KEY(course_id,user_id) REFERENCES courses(id,user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS qa_messages (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 conversation_id BIGINT UNSIGNED NOT NULL,
 request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 payload_hash CHAR(64) NOT NULL,
 role ENUM('user','assistant') NOT NULL,
 content MEDIUMTEXT NOT NULL,
 status ENUM('processing','answered','insufficient_context','failed') NOT NULL,
 error_code VARCHAR(80) NULL, error_status SMALLINT UNSIGNED NULL,
 model VARCHAR(200) NULL, latency_ms INT UNSIGNED NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY uq_qa_request(conversation_id,request_id,role),
 KEY ix_qa_created(created_at),
 CONSTRAINT fk_message_conversation FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS citations (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 message_id BIGINT UNSIGNED NOT NULL,
 chunk_id CHAR(64) NULL, document_id BIGINT UNSIGNED NULL,
 file_name VARCHAR(255) NOT NULL, page_from INT UNSIGNED NOT NULL, page_to INT UNSIGNED NOT NULL,
 excerpt MEDIUMTEXT NOT NULL, score DOUBLE NOT NULL,
 CONSTRAINT fk_citation_message FOREIGN KEY(message_id) REFERENCES qa_messages(id) ON DELETE CASCADE,
 CONSTRAINT fk_citation_chunk FOREIGN KEY(chunk_id) REFERENCES chunks(id) ON DELETE SET NULL,
 CONSTRAINT fk_citation_document FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
