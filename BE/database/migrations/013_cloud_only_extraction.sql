CREATE TABLE IF NOT EXISTS document_extractions (
 document_id BIGINT UNSIGNED PRIMARY KEY,
 payload LONGTEXT NOT NULL,
 CONSTRAINT fk_extraction_document FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
