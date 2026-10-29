/*
# Add confirmed column to inventory_entries

Adds a boolean `confirmed` column (default false) to track which inventory entries
have been confirmed/matched by staff and moved to the log.
Also adds a `confirmed_at` timestamp.
*/

ALTER TABLE inventory_entries ADD COLUMN IF NOT EXISTS confirmed boolean NOT NULL DEFAULT false;
ALTER TABLE inventory_entries ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;
