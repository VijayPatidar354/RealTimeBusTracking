-- Add lifecycle status to buses.
-- Existing buses default to ACTIVE to preserve current production behavior.
-- Run from Backend:
--   psql -U postgres -d bus_tracking -f migrations/002_add_bus_status.sql

ALTER TABLE buses
ADD COLUMN IF NOT EXISTS status VARCHAR(20);

UPDATE buses
SET status = 'ACTIVE'
WHERE status IS NULL;

ALTER TABLE buses
ALTER COLUMN status SET DEFAULT 'ACTIVE';

ALTER TABLE buses
ALTER COLUMN status SET NOT NULL;

ALTER TABLE buses
DROP CONSTRAINT IF EXISTS buses_status_check;

ALTER TABLE buses
ADD CONSTRAINT buses_status_check
CHECK (status IN ('ACTIVE', 'INACTIVE', 'MAINTENANCE', 'RETIRED'));

CREATE INDEX IF NOT EXISTS idx_buses_status ON buses(status);
CREATE INDEX IF NOT EXISTS idx_buses_active_route ON buses(route_id)
WHERE status = 'ACTIVE';
