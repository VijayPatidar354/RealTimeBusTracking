// ================================================================
//  SOCKET.IO INSTANCE — SINGLETON
//
//  This module holds the single `io` instance.
//  Usage in any controller:
//
//    const { getIO } = require('../socket');
//    getIO().to('route:3').emit('bus:location_updated', payload);
//
//  Call initSocket(server) once from app.js.
//  Call getIO() anywhere after that.
// ================================================================

const jwt = require('jsonwebtoken');
let io = null;

const initSocket = (httpServer) => {
    const { Server } = require('socket.io');

    io = new Server(httpServer, {
        cors: {
            // Dynamic origin check — matches Express CORS config.
            // Auto-allows ngrok tunnels so physical devices work without
            // manually updating CLIENT_ORIGIN every time ngrok restarts.
            origin: (origin, callback) => {
                if (!origin) return callback(null, true);
                const allowed = (process.env.CLIENT_ORIGIN || 'http://localhost:3000')
                    .split(',')
                    .map(o => o.trim());
                if (allowed.includes(origin)) return callback(null, true);
                try {
                    const host = new URL(origin).hostname;
                    if (/\.ngrok(-free)?\.(app|dev)$/.test(host) || /\.ngrok\.io$/.test(host)) {
                        return callback(null, true);
                    }
                } catch (_) {}
                callback(new Error('Socket CORS: origin not allowed'));
            },
            methods: ['GET', 'POST'],
            credentials: true
        }
    });

    // ── 12. Socket Authentication Middleware ──────────────────────
    // Sockets that provide a token are decoded and stored on socket.user.
    // Sockets without a token are allowed but treated as unauthenticated
    // (passengers browsing live map need no login).
    io.use((socket, next) => {
        const token = socket.handshake.auth?.token;
        if (!token) {
            socket.user = null;   // unauthenticated — public passenger access
            return next();
        }
        try {
            socket.user = jwt.verify(token, process.env.JWT_SECRET);
            next();
        } catch (err) {
            // Invalid token → reject the connection entirely
            next(new Error('Invalid or expired token'));
        }
    });

    io.on('connection', (socket) => {
        console.log(`[Socket] Client connected: ${socket.id}`);

        // ── JOIN ROOMS ────────────────────────────────────────────
        //  Client sends join events to subscribe to relevant rooms.

        // Passenger: join a route room to receive live bus updates (public)
        // emit: { routeId: 3 }
        socket.on('join:route', (data = {}) => {
            const { routeId } = data;
            if (!routeId) return;   // 6. safe destructuring guard
            const room = `route:${routeId}`;
            socket.join(room);
            console.log(`[Socket] ${socket.id} joined ${room}`);
        });

        // Driver: join their own private room
        // Requires a valid driver token carrying the matching id
        // emit: { driverId: 7 }
        socket.on('join:driver', (data = {}) => {
            const { driverId } = data;
            if (!driverId) return;   // 6. safe destructuring guard

            // 12. Enforce: token must belong to this driver.
            // Cast both to Number — JWT stores IDs as numbers, but the socket
            // event payload from the client may arrive as a string (e.g. parsed
            // from a URL param or localStorage). Strict !== would silently reject
            // a legitimate driver if the types differ.
            if (!socket.user || Number(socket.user.id) !== Number(driverId)) {
                socket.emit('error', { message: 'Unauthorized: driver token required' });
                return;
            }
            const room = `driver:${driverId}`;
            socket.join(room);
            console.log(`[Socket] ${socket.id} joined ${room}`);
        });

        // Owner: join their fleet room
        // Requires a valid owner token carrying the matching ownerId
        // emit: { ownerId: 2 }
        socket.on('join:owner', (data = {}) => {
            const { ownerId } = data;
            if (!ownerId) return;   // 6. safe destructuring guard

            // 12. Enforce: token must belong to this owner.
            // Same type-normalisation as join:driver — cast both sides to Number
            // before comparing so number/string mismatches never reject a valid owner.
            if (!socket.user || Number(socket.user.ownerId) !== Number(ownerId)) {
                socket.emit('error', { message: 'Unauthorized: owner token required' });
                return;
            }
            const room = `owner:${ownerId}`;
            socket.join(room);
            console.log(`[Socket] ${socket.id} joined ${room}`);
        });

        // Admin: join the platform-wide room
        // Requires a valid admin token (role === 'admin')
        socket.on('join:admin', (data = {}) => {
            // 6. safe destructuring guard (data may be undefined from old clients)

            // 12. Enforce: only tokens with role=admin may join admin room
            if (!socket.user || socket.user.role !== 'admin') {
                socket.emit('error', { message: 'Unauthorized: admin token required' });
                return;
            }
            socket.join('admin');
            console.log(`[Socket] ${socket.id} joined admin room`);
        });

        socket.on('disconnect', () => {
            console.log(`[Socket] Client disconnected: ${socket.id}`);
        });
    });

    return io;
};

const getIO = () => {
    if (!io) {
        throw new Error('Socket.io not initialized. Call initSocket(server) first.');
    }
    return io;
};

module.exports = { initSocket, getIO };
