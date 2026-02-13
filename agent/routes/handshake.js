/**
 * Handshake Route — Discovery & Capability Negotiation
 *
 * Similar to MCP's lifecycle management: clients discover the agent,
 * learn its capabilities, and negotiate the protocol version.
 *
 * Any app (web, desktop, mobile, CLI) can call this endpoint.
 */

const express = require('express');
const router = express.Router();
const storage = require('../storage');

const PROTOCOL_VERSION = '1.0.0';

// GET /uhp/v1/handshake
router.get('/handshake', (req, res) => {
    const stats = storage.getStats();

    res.json({
        protocol: 'uhp',
        version: PROTOCOL_VERSION,
        capabilities: [
            'storage.write',
            'storage.query',
            'storage.delete',
            'storage.update',
            'storage.search',
            'permissions.manage',
        ],
        agent: {
            name: 'UHP-Agent',
            version: '1.0.0',
            runtime: process.platform,
        },
        stats: {
            namespaces: stats.namespaces,
            totalItems: stats.totalItems,
        },
    });
});

// GET /uhp/v1/health — lightweight liveness check
router.get('/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
});

module.exports = router;
