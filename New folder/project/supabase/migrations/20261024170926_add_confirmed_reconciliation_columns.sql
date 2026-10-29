/*
# Snapshot reconciliation results at confirmation time

## Problem
The reconciliation status (matched/shortage/overage) for confirmed entries
was being recalculated live against the current `system_stock` table. When
new system stock was uploaded (which deletes and replaces all rows), the
status of already-confirmed entries would retroactively change.

## Solution
Add two columns to `inventory_entries`:
- `confirmed_system_qty` (numeric, nullable): the system quantity at the
  moment the entry was confirmed/moved to the log.
- `confirmed_difference` (numeric, nullable): the difference (total_units -
  system_qty) at the moment of confirmation.

These are populated during the confirmation step and then used by the log
and monitoring screens instead of live recalculation. Confirmed entries
become immutable snapshots.

## Columns added
1. `inventory_entries.confirmed_system_qty` — numeric, nullable, default NULL
2. `inventory_entries.confirmed_difference` — numeric, nullable, default NULL

## Security
No RLS or policy changes — existing policies on `inventory_entries` already
cover SELECT, INSERT, UPDATE, DELETE for anon + authenticated. The new
columns are writable under the existing UPDATE policy.
*/

ALTER TABLE inventory_entries
  ADD COLUMN IF NOT EXISTS confirmed_system_qty numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS confirmed_difference numeric DEFAULT NULL;