/**
 * UHP Permission System
 *
 * Inspired by MCP's capability negotiation, but applied to web origins.
 * Each origin must request access to a namespace before any storage operation.
 *
 * For this PoC, permissions are auto-granted (user approves via the agent UI).
 * In production, a system-level prompt would appear.
 */

const Database = require('better-sqlite3');
const path = require('path');

let db;

function init(database) {
    db = database;

    db.exec(`
        CREATE TABLE IF NOT EXISTS permissions (
            origin TEXT NOT NULL,
            namespace TEXT NOT NULL,
            capabilities TEXT NOT NULL DEFAULT '["storage.local","storage.query","storage.search"]',
            granted_at INTEGER NOT NULL,
            PRIMARY KEY (origin, namespace)
        );
    `);
}

function requestPermission(origin, namespace, capabilities) {
    const now = Date.now();
    const caps = JSON.stringify(capabilities || ['storage.local', 'storage.query', 'storage.search']);

    // Auto-grant for PoC — in production this would trigger a system dialog
    db.prepare(`
        INSERT OR REPLACE INTO permissions (origin, namespace, capabilities, granted_at)
        VALUES (?, ?, ?, ?)
    `).run(origin, namespace, caps, now);

    console.log(`[UHP Permissions] Granted "${namespace}" to origin "${origin}"`);
    return { granted: true, namespace, origin, capabilities: JSON.parse(caps) };
}

function checkPermission(origin, namespace) {
    const row = db.prepare(
        `SELECT * FROM permissions WHERE origin = ? AND namespace = ?`
    ).get(origin, namespace);

    return row ? {
        granted: true,
        capabilities: JSON.parse(row.capabilities),
        granted_at: row.granted_at,
    } : { granted: false };
}

function listPermissions(origin) {
    let rows;
    if (origin) {
        rows = db.prepare(`SELECT * FROM permissions WHERE origin = ?`).all(origin);
    } else {
        rows = db.prepare(`SELECT * FROM permissions`).all();
    }

    return rows.map(r => ({
        origin: r.origin,
        namespace: r.namespace,
        capabilities: JSON.parse(r.capabilities),
        granted_at: r.granted_at,
    }));
}

function revokePermission(origin, namespace) {
    const result = db.prepare(
        `DELETE FROM permissions WHERE origin = ? AND namespace = ?`
    ).run(origin, namespace);
    return { revoked: result.changes > 0 };
}

// Express middleware: check that the origin has permission for the namespace
function requirePermission(req, res, next) {
    const origin = req.get('Origin') || req.get('Referer') || 'unknown';
    const namespace = req.body?.namespace;

    if (!namespace) {
        return next(); // Namespace not in body, let route handler validate
    }

    const perm = checkPermission(origin, namespace);

    // Also allow localhost origins in development
    const isLocalhost = origin.includes('localhost') || origin.includes('127.0.0.1') || origin === 'unknown';

    if (!perm.granted && !isLocalhost) {
        return res.status(403).json({
            error: 'Permission denied',
            message: `Origin "${origin}" has not been granted access to namespace "${namespace}". Call /uhp/v1/permissions/request first.`,
        });
    }

    next();
}

module.exports = { init, requestPermission, checkPermission, listPermissions, revokePermission, requirePermission };
