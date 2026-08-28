-- Add PostGIS spatial columns while preserving existing latitude/longitude fields.
-- Run from Backend:
--   psql -U postgres -d bus_tracking -f migrations/001_add_postgis_locations.sql

CREATE EXTENSION IF NOT EXISTS postgis;

ALTER TABLE drivers
ADD COLUMN IF NOT EXISTS location GEOGRAPHY(POINT, 4326);

ALTER TABLE stops
ADD COLUMN IF NOT EXISTS location GEOGRAPHY(POINT, 4326);

UPDATE drivers
SET location = ST_SetSRID(
    ST_MakePoint(longitude::DOUBLE PRECISION, latitude::DOUBLE PRECISION),
    4326
)::geography
WHERE latitude IS NOT NULL
  AND longitude IS NOT NULL
  AND location IS NULL;

UPDATE stops
SET location = ST_SetSRID(
    ST_MakePoint(stop_lon::DOUBLE PRECISION, stop_lat::DOUBLE PRECISION),
    4326
)::geography
WHERE stop_lat IS NOT NULL
  AND stop_lon IS NOT NULL
  AND location IS NULL;

CREATE INDEX IF NOT EXISTS idx_drivers_location
ON drivers
USING GIST (location);

CREATE INDEX IF NOT EXISTS idx_stops_location
ON stops
USING GIST (location);
