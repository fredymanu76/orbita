-- Add processing_error column to memory_items for tracking failed processing
alter table memory_items add column if not exists processing_error text;

-- Add primary_thread_id for linking memories to their primary thread (Sprint 2)
alter table memory_items add column if not exists primary_thread_id uuid;

-- Store extraction confidence so downstream systems can gate on it
alter table memory_items add column if not exists extraction_confidence float;
