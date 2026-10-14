ALTER TABLE processing_jobs MODIFY type ENUM('extract_pdf','prepare_source') NOT NULL;
CREATE TABLE chunks (
  id CHAR(64) NOT NULL PRIMARY KEY,
  document_id BIGINT UNSIGNED NOT NULL,
  chunk_order INT UNSIGNED NOT NULL,
  content MEDIUMTEXT NOT NULL,
  page_from INT UNSIGNED NOT NULL,
  page_to INT UNSIGNED NOT NULL,
  token_count INT UNSIGNED NOT NULL,
  source_start INT UNSIGNED NOT NULL,
  source_end INT UNSIGNED NOT NULL,
  page_map JSON NOT NULL,
  embedding_model VARCHAR(200) NOT NULL,
  embedding_revision CHAR(40) NOT NULL,
  vector_key VARCHAR(200) NULL,
  UNIQUE KEY uq_chunk_document_order(document_id,chunk_order),
  CONSTRAINT fk_chunk_document FOREIGN KEY(document_id) REFERENCES documents(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE course_indexes (
  course_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  version CHAR(64) NOT NULL,
  model VARCHAR(200) NOT NULL,
  model_revision CHAR(40) NOT NULL,
  dimension INT UNSIGNED NOT NULL,
  metric VARCHAR(20) NOT NULL,
  manifest_key VARCHAR(200) NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_index_course_owner FOREIGN KEY(course_id,user_id) REFERENCES courses(id,user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
INSERT INTO processing_jobs(document_id,type)
SELECT id,'prepare_source' FROM documents WHERE extraction_completed_at IS NOT NULL AND deleted_at IS NULL
AND status='extracting' AND id NOT IN (SELECT document_id FROM processing_jobs WHERE type='prepare_source');
