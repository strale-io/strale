-- Add data classification column to capabilities for audit trail compliance
ALTER TABLE capabilities ADD COLUMN data_classification TEXT;
