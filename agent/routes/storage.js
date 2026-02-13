/**
 * Storage Routes — CRUD + Search
 *
 * All operations are namespaced (e.g., "twitter.com", "my-desktop-app")
 * and collection-scoped. Any app that can POST JSON can use these.
 */

const express = require('express');
const router = express.Router();
const storage = require('../storage');
const { requirePermission } = require('../permissions');

// Apply permission middleware to all storage routes
router.use(requirePermission);

// POST /uhp/v1/storage/write — Create or upsert an item
router.post('/write', (req, res) => {
    const { namespace, collection, id, data } = req.body;

    if (!namespace || !collection || !data) {
        return res.status(400).json({
            error: 'INVALID_REQUEST',
            message: 'Missing required fields: namespace, collection, data',
        });
    }

    try {
        const result = storage.writeItem({ namespace, collection, id, data });
        console.log(`[UHP Storage] ✏️  Wrote to ${namespace}/${collection} (id: ${result.id})`);
        res.json({ success: true, ...result });
    } catch (err) {
        console.error('[UHP Storage] Write error:', err);
        res.status(500).json({ error: 'STORAGE_ERROR', message: err.message });
    }
});

// POST /uhp/v1/storage/query — Query items with filters, sort, pagination
router.post('/query', (req, res) => {
    const { namespace, collection, query, sort, limit, offset } = req.body;

    if (!namespace || !collection) {
        return res.status(400).json({
            error: 'INVALID_REQUEST',
            message: 'Missing required fields: namespace, collection',
        });
    }

    try {
        const items = storage.queryItems({ namespace, collection, query, sort, limit, offset });
        console.log(`[UHP Storage] 🔍 Query ${namespace}/${collection} → ${items.length} items`);
        res.json({ success: true, items, count: items.length });
    } catch (err) {
        console.error('[UHP Storage] Query error:', err);
        res.status(500).json({ error: 'STORAGE_ERROR', message: err.message });
    }
});

// POST /uhp/v1/storage/delete — Delete an item by id
router.post('/delete', (req, res) => {
    const { namespace, collection, id } = req.body;

    if (!namespace || !collection || !id) {
        return res.status(400).json({
            error: 'INVALID_REQUEST',
            message: 'Missing required fields: namespace, collection, id',
        });
    }

    try {
        const result = storage.deleteItem({ namespace, collection, id });
        console.log(`[UHP Storage] 🗑️  Deleted from ${namespace}/${collection} (${result.deleted} items)`);
        res.json({ success: true, ...result });
    } catch (err) {
        console.error('[UHP Storage] Delete error:', err);
        res.status(500).json({ error: 'STORAGE_ERROR', message: err.message });
    }
});

// POST /uhp/v1/storage/update — Partial update of an item's data
router.post('/update', (req, res) => {
    const { namespace, collection, id, data } = req.body;

    if (!namespace || !collection || !id || !data) {
        return res.status(400).json({
            error: 'INVALID_REQUEST',
            message: 'Missing required fields: namespace, collection, id, data',
        });
    }

    try {
        const result = storage.updateItem({ namespace, collection, id, data });
        if (!result) {
            return res.status(404).json({ error: 'NOT_FOUND', message: 'Item not found' });
        }
        console.log(`[UHP Storage] ♻️  Updated ${namespace}/${collection}/${id}`);
        res.json({ success: true, ...result });
    } catch (err) {
        console.error('[UHP Storage] Update error:', err);
        res.status(500).json({ error: 'STORAGE_ERROR', message: err.message });
    }
});

// POST /uhp/v1/storage/search — Full-text search across item data
router.post('/search', (req, res) => {
    const { namespace, collection, term, limit } = req.body;

    if (!namespace || !collection || !term) {
        return res.status(400).json({
            error: 'INVALID_REQUEST',
            message: 'Missing required fields: namespace, collection, term',
        });
    }

    try {
        const items = storage.searchItems({ namespace, collection, term, limit });
        console.log(`[UHP Storage] 🔎 Search "${term}" in ${namespace}/${collection} → ${items.length} results`);
        res.json({ success: true, items, count: items.length });
    } catch (err) {
        console.error('[UHP Storage] Search error:', err);
        res.status(500).json({ error: 'STORAGE_ERROR', message: err.message });
    }
});

module.exports = router;
