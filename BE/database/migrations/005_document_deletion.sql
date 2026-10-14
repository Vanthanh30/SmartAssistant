ALTER TABLE processing_jobs MODIFY type ENUM('extract_pdf','prepare_source','delete_pdf') NOT NULL;
