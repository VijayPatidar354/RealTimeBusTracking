require('dotenv').config();

// ── 1. Validate required environment variables before anything else ──
const REQUIRED_ENV = ['JWT_SECRET', 'DB_USER', 'DB_HOST', 'DB_NAME', 'DB_PASSWORD', 'DB_PORT'];
const missingEnv   = REQUIRED_ENV.filter(k => !process.env[k]);
if (missingEnv.length > 0) {
  console.error(`[Startup] Missing required environment variables: ${missingEnv.join(', ')}`);
  process.exit(1);
}

const express    = require('express');
const http       = require('http');
const path       = require('path');
const cors       = require('cors');
const { initSocket } = require('./socket');

const app    = express();
const server = http.createServer(app);

// ── 2. Test DB connection at startup ──────────────────────────────
const pool = require('./config/db');
pool.connect()
  .then(client => {
    console.log('[DB] PostgreSQL connected successfully');
    client.release();
  })
  .catch(err => {
    console.error('[DB] Connection failed:', err.message);
    process.exit(1);   // hard exit — no point running without a DB
  });

// ── Middleware ────────────────────────────────────────────────────
app.use(express.json());

// Parse CLIENT_ORIGIN as comma-separated list so multiple origins are supported
// e.g. CLIENT_ORIGIN=http://localhost:3000,https://your-app.com
const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:3000')
  .split(',')
  .map(o => o.trim());

app.use(cors({
  origin: (origin, callback) => {
    // Allow same-origin requests (origin is undefined) and listed origins
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true
}));
app.use(express.static(path.join(__dirname, 'public')));

// ── API Routes ────────────────────────────────────────────────────
const adminRoutes     = require('./routes/adminRoutes');
const driverRoutes    = require('./routes/driverRoutes');
const ownerRoutes     = require('./routes/ownerRoutes');
const passengerRoutes = require('./routes/passengerRoutes');

app.use('/api/admin',     adminRoutes);
app.use('/api/driver',    driverRoutes);
app.use('/api/owner',     ownerRoutes);
app.use('/api/passenger', passengerRoutes);

// ── Tracking UI Pages ─────────────────────────────────────────────
// Driver opens this page on their phone to broadcast GPS live
app.get('/driver-map', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'driver.html'));
});

// Passenger opens this to see all live buses on a map
app.get('/passenger-map', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'passenger.html'));
});

// ── Socket.io ─────────────────────────────────────────────────────
initSocket(server);

// ── 5. Global error handler ───────────────────────────────────────
// Catches any error passed to next(err) from routes/middleware
app.use((err, req, res, next) => {
  console.error('[Error]', err.stack || err.message);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error'
  });
});

// ── Start ─────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
// 9. Handle port-in-use (EADDRINUSE) and other listen errors gracefully
server.listen(PORT, () => {
  console.log(`Server running  →  http://localhost:${PORT}`);
  console.log(`Driver map      →  http://localhost:${PORT}/driver-map`);
  console.log(`Passenger map   →  http://localhost:${PORT}/passenger-map`);
}).on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[Server] Port ${PORT} is already in use. Change PORT in .env.`);
  } else {
    console.error('[Server] Failed to start:', err.message);
  }
  process.exit(1);
});