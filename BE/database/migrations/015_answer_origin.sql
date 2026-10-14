-- Historical rows remain unknown. Never infer origin from model/citations/text.
SET @origin_column = IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='qa_messages' AND COLUMN_NAME='answer_origin'), 'SELECT 1', 'ALTER TABLE qa_messages ADD COLUMN answer_origin ENUM(''grounded'',''general'',''unknown'') NOT NULL DEFAULT ''unknown''');
PREPARE add_answer_origin FROM @origin_column;
EXECUTE add_answer_origin;
DEALLOCATE PREPARE add_answer_origin;
