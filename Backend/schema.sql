-- ================================================================
--  REAL-TIME BUS TRACKING — FULL DATABASE SCHEMA
--  PostgreSQL 14+
--
--  Run this once on a fresh database:
--    psql -U postgres -d bus_tracking -f schema.sql
--
--  Tables (in dependency order):
--    admins, owners, drivers, passengers,
--    routes, stops, buses,
--    passenger_waiting, trip_history
-- ================================================================

-- ── Extensions ───────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS postgis;

-- ── ADMINS ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admins (
    id          SERIAL PRIMARY KEY,
    admin_name  VARCHAR(100)  NOT NULL,
    email       VARCHAR(150)  NOT NULL UNIQUE,
    password    VARCHAR(255)  NOT NULL,
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── OWNERS ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS owners (
    id          SERIAL PRIMARY KEY,
    owner_name  VARCHAR(100)  NOT NULL,
    email       VARCHAR(150)  NOT NULL UNIQUE,
    password    VARCHAR(255)  NOT NULL,
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── DRIVERS ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS drivers (
    id              SERIAL PRIMARY KEY,
    driver_name     VARCHAR(100)    NOT NULL,
    phone           VARCHAR(20)     NOT NULL UNIQUE,
    license_number  VARCHAR(50)     NOT NULL,
    email           VARCHAR(150)    UNIQUE,         -- for OTP verification during registration
    password        VARCHAR(255)    NOT NULL,
    latitude        NUMERIC(10, 7)  DEFAULT NULL,  -- live GPS lat
    longitude       NUMERIC(10, 7)  DEFAULT NULL,  -- live GPS lon
    location        GEOGRAPHY(POINT, 4326) DEFAULT NULL,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_drivers_location ON drivers USING GIST (location);

-- ── PASSENGERS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS passengers (
    id              SERIAL PRIMARY KEY,
    passenger_name  VARCHAR(100)  NOT NULL,
    phone           VARCHAR(20)   NOT NULL UNIQUE,
    email           VARCHAR(150)  NOT NULL UNIQUE,
    password        VARCHAR(255)  NOT NULL,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── ROUTES ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS routes (
    id           SERIAL PRIMARY KEY,
    route_name   VARCHAR(150)  NOT NULL,
    source       VARCHAR(150)  NOT NULL,
    destination  VARCHAR(150)  NOT NULL,
    owner_id     INTEGER       NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_routes_owner ON routes(owner_id);

-- ── STOPS ────────────────────────────────────────────────────────
-- Each stop belongs to a route and has a sequential stop_order.
-- stop_lat / stop_lon are optional — if NULL, manual marking is used.
CREATE TABLE IF NOT EXISTS stops (
    id          SERIAL PRIMARY KEY,
    route_id    INTEGER         NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    stop_name   VARCHAR(150)    NOT NULL,
    stop_order  INTEGER         NOT NULL,   -- 1-based sequential position
    stop_lat    NUMERIC(10, 7)  DEFAULT NULL,
    stop_lon    NUMERIC(10, 7)  DEFAULT NULL,
    location    GEOGRAPHY(POINT, 4326) DEFAULT NULL,
    UNIQUE (route_id, stop_order)           -- no duplicate positions on a route
);

CREATE INDEX IF NOT EXISTS idx_stops_route ON stops(route_id);
CREATE INDEX IF NOT EXISTS idx_stops_location ON stops USING GIST (location);

-- ── BUSES ────────────────────────────────────────────────────────
-- A bus belongs to an owner. A driver and route are optionally assigned.
-- current_stop_order tracks progression along the assigned route.
-- current_speed_kmph is periodically written by the ETA service.
CREATE TABLE IF NOT EXISTS buses (
    id                  SERIAL PRIMARY KEY,
    bus_number          VARCHAR(20)   NOT NULL UNIQUE,
    bus_type            VARCHAR(50)   NOT NULL,  -- e.g. 'AC', 'Non-AC', 'Mini'
    owner_id            INTEGER       NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
    driver_id           INTEGER       DEFAULT NULL REFERENCES drivers(id) ON DELETE SET NULL,
    route_id            INTEGER       DEFAULT NULL REFERENCES routes(id) ON DELETE SET NULL,
    status              VARCHAR(20)   NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'INACTIVE', 'MAINTENANCE', 'RETIRED')),
    current_stop_order  INTEGER       NOT NULL DEFAULT 1,
    current_speed_kmph  INTEGER       DEFAULT NULL,  -- smoothed speed from ETA service
    created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_buses_owner  ON buses(owner_id);
CREATE INDEX IF NOT EXISTS idx_buses_driver ON buses(driver_id);
CREATE INDEX IF NOT EXISTS idx_buses_route  ON buses(route_id);
CREATE INDEX IF NOT EXISTS idx_buses_status ON buses(status);
CREATE INDEX IF NOT EXISTS idx_buses_active_route ON buses(route_id)
    WHERE status = 'ACTIVE';

-- ── PASSENGER WAITING ─────────────────────────────────────────────
-- Passengers register here when waiting at a stop.
-- bus_arrived_at is stamped by markStopReached — triggers board-confirm prompt.
-- Auto-expire job deletes rows where bus_arrived_at is older than 5 minutes.
CREATE TABLE IF NOT EXISTS passenger_waiting (
    id              SERIAL PRIMARY KEY,
    passenger_id    INTEGER     NOT NULL REFERENCES passengers(id) ON DELETE CASCADE,
    stop_id         INTEGER     NOT NULL REFERENCES stops(id)      ON DELETE CASCADE,
    route_id        INTEGER     NOT NULL REFERENCES routes(id)     ON DELETE CASCADE,
    bus_arrived_at  TIMESTAMPTZ DEFAULT NULL,   -- NULL = bus not yet arrived
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (passenger_id, stop_id, route_id)    -- one entry per passenger per stop per route
);

CREATE INDEX IF NOT EXISTS idx_pw_passenger ON passenger_waiting(passenger_id);
CREATE INDEX IF NOT EXISTS idx_pw_stop      ON passenger_waiting(stop_id, route_id);
CREATE INDEX IF NOT EXISTS idx_pw_arrived   ON passenger_waiting(bus_arrived_at)
    WHERE bus_arrived_at IS NOT NULL;           -- partial index — speeds up auto-expire query

-- ── TRIP HISTORY ──────────────────────────────────────────────────
-- Immutable log written when a waiting entry is resolved.
-- status: 'boarded' | 'cancelled' | 'expired'
-- resolved_at: set at insert time (same as created_at — records when resolution happened).
CREATE TABLE IF NOT EXISTS trip_history (
    id           SERIAL PRIMARY KEY,
    passenger_id INTEGER      NOT NULL REFERENCES passengers(id) ON DELETE CASCADE,
    stop_id      INTEGER      NOT NULL REFERENCES stops(id)      ON DELETE CASCADE,
    route_id     INTEGER      NOT NULL REFERENCES routes(id)     ON DELETE CASCADE,
    stop_name    VARCHAR(150) NOT NULL,
    route_name   VARCHAR(150) NOT NULL,
    source       VARCHAR(150) NOT NULL,
    destination  VARCHAR(150) NOT NULL,
    status       VARCHAR(20)  NOT NULL CHECK (status IN ('boarded', 'cancelled', 'expired')),
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    resolved_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()  -- when the waiting was resolved
);

CREATE INDEX IF NOT EXISTS idx_th_passenger ON trip_history(passenger_id);
CREATE INDEX IF NOT EXISTS idx_th_resolved  ON trip_history(passenger_id, resolved_at DESC);

-- ── PENDING REGISTRATIONS ─────────────────────────────────────────
-- Temporary storage for registration data until email OTP is verified.
-- Accounts are only created in the real tables after successful verification.
-- Expired rows are cleaned up automatically every 30 minutes.
CREATE TABLE IF NOT EXISTS pending_registrations (
    id          SERIAL PRIMARY KEY,
    role        VARCHAR(20)   NOT NULL CHECK (role IN ('passenger', 'driver', 'owner')),
    email       VARCHAR(150)  NOT NULL,
    data        JSONB         NOT NULL,
    otp_code    VARCHAR(6)    NOT NULL,
    otp_expires TIMESTAMPTZ   NOT NULL,
    attempts    INTEGER       NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    UNIQUE (email, role)
);

-- ================================================================
--  SEED: Default Admin Account
--  Password: admin123  (bcrypt hash — change before production!)
--  Generate a fresh hash:
--    node -e "const b=require('bcryptjs');b.hash('yourPassword',10).then(console.log)"
-- ================================================================
-- INSERT INTO admins (admin_name, email, password)
-- VALUES (
--     'Super Admin',
--     'admin@bustracking.com',
--     '$2a$10$...'   -- replace with your bcrypt hash
-- ) ON CONFLICT (email) DO NOTHING;
