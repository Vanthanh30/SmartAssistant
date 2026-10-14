CREATE TABLE IF NOT EXISTS learning_sets (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 course_id BIGINT UNSIGNED NOT NULL, user_id BIGINT UNSIGNED NOT NULL,
 kind ENUM('quiz','flashcards') NOT NULL, title VARCHAR(150) NOT NULL,
 model VARCHAR(200) NOT NULL, source_count INT UNSIGNED NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 KEY ix_learning_owner(user_id,course_id,id),
 CONSTRAINT fk_learning_owner FOREIGN KEY(course_id,user_id) REFERENCES courses(id,user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS learning_items (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, set_id BIGINT UNSIGNED NOT NULL,
 position INT UNSIGNED NOT NULL, prompt TEXT NOT NULL, answer TEXT NOT NULL,
 choices JSON NULL, correct_index TINYINT UNSIGNED NULL, explanation TEXT NULL,
 UNIQUE KEY uq_learning_position(set_id,position),
 CONSTRAINT fk_learning_item_set FOREIGN KEY(set_id) REFERENCES learning_sets(id) ON DELETE CASCADE,
 CONSTRAINT ck_learning_correct CHECK(correct_index IS NULL OR correct_index < 4)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS learning_citations (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, item_id BIGINT UNSIGNED NOT NULL,
 chunk_id CHAR(64) NULL, document_id BIGINT UNSIGNED NULL,
 file_name VARCHAR(255) NOT NULL, page_from INT UNSIGNED NOT NULL, page_to INT UNSIGNED NOT NULL,
 excerpt MEDIUMTEXT NOT NULL,
 CONSTRAINT fk_learning_citation_item FOREIGN KEY(item_id) REFERENCES learning_items(id) ON DELETE CASCADE,
 CONSTRAINT fk_learning_citation_chunk FOREIGN KEY(chunk_id) REFERENCES chunks(id) ON DELETE SET NULL,
 CONSTRAINT fk_learning_citation_document FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS learning_attempts (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, set_id BIGINT UNSIGNED NOT NULL, user_id BIGINT UNSIGNED NOT NULL,
 request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 score DECIMAL(5,2) NULL, correct_count INT UNSIGNED NULL, total_questions INT UNSIGNED NOT NULL,
 submission_hash CHAR(64) NULL,
 started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), completed_at DATETIME(3) NULL,
 UNIQUE KEY uq_learning_attempt(user_id,request_id),
 CONSTRAINT fk_learning_attempt_set FOREIGN KEY(set_id) REFERENCES learning_sets(id) ON DELETE CASCADE,
 CONSTRAINT fk_learning_attempt_user FOREIGN KEY(user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS learning_answers (
 attempt_id BIGINT UNSIGNED NOT NULL, item_id BIGINT UNSIGNED NOT NULL,
 choice TINYINT UNSIGNED NULL, is_correct BOOLEAN NOT NULL,
 PRIMARY KEY(attempt_id,item_id),
 CONSTRAINT fk_learning_answer_attempt FOREIGN KEY(attempt_id) REFERENCES learning_attempts(id) ON DELETE CASCADE,
 CONSTRAINT fk_learning_answer_item FOREIGN KEY(item_id) REFERENCES learning_items(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS learning_generation_requests (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, user_id BIGINT UNSIGNED NOT NULL, course_id BIGINT UNSIGNED NOT NULL,
 request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, payload_hash CHAR(64) NOT NULL,
 state ENUM('processing','completed','failed') NOT NULL, set_id BIGINT UNSIGNED NULL,
 error_code VARCHAR(80) NULL, error_status SMALLINT UNSIGNED NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY uq_learning_generation(user_id,request_id), KEY ix_learning_quota(user_id,created_at),
 CONSTRAINT fk_learning_generation_owner FOREIGN KEY(course_id,user_id) REFERENCES courses(id,user_id),
 CONSTRAINT fk_learning_generation_set FOREIGN KEY(set_id) REFERENCES learning_sets(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
