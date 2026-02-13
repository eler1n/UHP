/**
 * UHP Agent — User-Hosted Protocol Local Agent
 *
 * A standardized REST API running on localhost that any application
 * (web, desktop, mobile, CLI) can discover and offload tasks to.
 *
 * Think of it as "MCP for Apps" — but instead of connecting AI models
 * to tools, it connects any application to user-owned local storage.
 */

const express = require('express');
const cors = require('cors');

const path = require('path');

// --- Initialize Storage & Permissions ---
const storage = require('./storage');
const permissions = require('./permissions');
const db = storage.init();
permissions.init(db);

// --- Express App ---
const app = express();
const PORT = process.env.UHP_PORT || 21000;

// Middleware
app.use(cors({
    origin: true,           // Reflect any origin (any app can connect)
    credentials: true,
}));
app.use(express.json());

// Request logging (skip static files)
app.use((req, res, next) => {
    if (!req.path.startsWith('/demo') && req.path !== '/' && req.path !== '/favicon.ico') {
        const origin = req.get('Origin') || req.get('User-Agent') || 'unknown';
        console.log(`[UHP] ${req.method} ${req.path} ← ${origin}`);
    }
    next();
});

// --- Serve Demo App ---
const demoPath = path.join(__dirname, '..', 'demo');
app.use('/demo', express.static(demoPath));

// Root → redirect to demo
app.get('/', (req, res) => {
    res.redirect('/demo');
});

// --- Mount Routes ---
const handshakeRoutes = require('./routes/handshake');
const storageRoutes = require('./routes/storage');
const permissionRoutes = require('./routes/permissions');

app.use('/uhp/v1', handshakeRoutes);
app.use('/uhp/v1/storage', storageRoutes);
app.use('/uhp/v1/permissions', permissionRoutes);

// --- 404 Handler ---
app.use((req, res) => {
    res.status(404).json({
        error: 'NOT_FOUND',
        message: `Unknown endpoint: ${req.method} ${req.path}`,
        hint: 'Try GET /uhp/v1/handshake to discover capabilities.',
    });
});

// --- Error Handler ---
app.use((err, req, res, next) => {
    console.error('[UHP] Unhandled error:', err);
    res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: err.message,
    });
});

// --- Start ---
app.listen(PORT, () => {
    const stats = storage.getStats();
    console.log(`
╔══════════════════════════════════════════════════╗
║               UHP Agent v1.0.0                   ║
║         User-Hosted Protocol — Local Agent       ║
╠══════════════════════════════════════════════════╣
║                                                  ║
║  🌐  http://localhost:${PORT}                     ║
║                                                  ║
║  Endpoints:                                      ║
║    GET  /uhp/v1/handshake          Discovery      ║
║    GET  /uhp/v1/health             Health check   ║
║    POST /uhp/v1/storage/write      Write item     ║
║    POST /uhp/v1/storage/query      Query items    ║
║    POST /uhp/v1/storage/delete     Delete item    ║
║    POST /uhp/v1/storage/update     Update item    ║
║    POST /uhp/v1/storage/search     Search items   ║
║    POST /uhp/v1/permissions/request  Grant access ║
║    GET  /uhp/v1/permissions/list   List grants    ║
║    POST /uhp/v1/permissions/revoke Revoke grant   ║
║                                                  ║
║  Storage: ${String(stats.totalItems).padEnd(5)} items across ${String(stats.namespaces.length).padEnd(3)} namespaces   ║
║  Any app (web, desktop, mobile, CLI) can connect ║
║                                                  ║
╚══════════════════════════════════════════════════╝
    `);
});
