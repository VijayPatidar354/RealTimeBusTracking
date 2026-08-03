require('dotenv').config();
const pool = require('./config/db');

(async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS pending_registrations (
                id          SERIAL PRIMARY KEY,
                role        VARCHAR(20)   NOT NULL CHECK (role IN ('passenger','driver','owner')),
                email       VARCHAR(150)  NOT NULL,
                data        JSONB         NOT NULL,
                otp_code    VARCHAR(6)    NOT NULL,
                otp_expires TIMESTAMPTZ   NOT NULL,
                attempts    INTEGER       NOT NULL DEFAULT 0,
                created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
                UNIQUE (email, role)
            )
        `);
        console.log('OK: pending_registrations table created');

        await pool.query(`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS email VARCHAR(150) UNIQUE`);
        console.log('OK: email column added to drivers');

        process.exit(0);
    } catch (e) {
        console.error('FAIL:', e.message);
        process.exit(1);
    }
})();
