/**
 * Permission Routes — Namespace Access Control
 *
 * Before any app (web, desktop, mobile) can read/write to a namespace,
 * it must request permission. This mirrors MCP's capability negotiation
 * but applies to app-level data access.
 */

const express = require('express');
const router = express.Router();
const permissions = require('../permissions');

// POST /uhp/v1/permissions/request — Request access to a namespace
router.post('/request', (req, res) => {
    const { namespace, capabilities } = req.body;
    const origin = req.get('Origin') || req.get('Referer') || req.body.origin || 'unknown';

    if (!namespace) {
        return res.status(400).json({
            error: 'INVALID_REQUEST',
            message: 'Missing required field: namespace',
        });
    }

    try {
        const result = permissions.requestPermission(origin, namespace, capabilities);
        res.json({ success: true, ...result });
    } catch (err) {
        console.error('[UHP Permissions] Request error:', err);
        res.status(500).json({ error: 'PERMISSION_ERROR', message: err.message });
    }
});

// GET /uhp/v1/permissions/list — List all granted permissions
router.get('/list', (req, res) => {
    const origin = req.query.origin || null;

    try {
        const grants = permissions.listPermissions(origin);
        res.json({ success: true, permissions: grants });
    } catch (err) {
        console.error('[UHP Permissions] List error:', err);
        res.status(500).json({ error: 'PERMISSION_ERROR', message: err.message });
    }
});

// POST /uhp/v1/permissions/revoke — Revoke a permission grant
router.post('/revoke', (req, res) => {
    const { namespace } = req.body;
    const origin = req.get('Origin') || req.get('Referer') || req.body.origin || 'unknown';

    if (!namespace) {
        return res.status(400).json({
            error: 'INVALID_REQUEST',
            message: 'Missing required field: namespace',
        });
    }

    try {
        const result = permissions.revokePermission(origin, namespace);
        res.json({ success: true, ...result });
    } catch (err) {
        console.error('[UHP Permissions] Revoke error:', err);
        res.status(500).json({ error: 'PERMISSION_ERROR', message: err.message });
    }
});

module.exports = router;
