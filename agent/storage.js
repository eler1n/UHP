/**
 * UHP Storage Engine — SQLite-backed local storage
 *
 * Schema mirrors MCP's "resources" primitive but for user-owned data:
 *   items(id, namespace, collection, data, created_at, updated_at)
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'uhp.db');

let db;

function init() {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    db.exec(`
        CREATE TABLE IF NOT EXISTS items (
            id TEXT NOT NULL,
            namespace TEXT NOT NULL,
            collection TEXT NOT NULL,
            data TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            PRIMARY KEY (namespace, collection, id)
        );

        CREATE INDEX IF NOT EXISTS idx_items_ns_col
            ON items(namespace, collection);

        CREATE INDEX IF NOT EXISTS idx_items_updated
            ON items(updated_at DESC);
    `);

    return db;
}

// --- CRUD Operations ---

function writeItem({ namespace, collection, id, data }) {
    const itemId = id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();
    const jsonData = JSON.stringify(data);

    const upsert = db.prepare(`
        INSERT INTO items (id, namespace, collection, data, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(namespace, collection, id) DO UPDATE SET
            data = excluded.data,
            updated_at = excluded.updated_at
    `);

    upsert.run(itemId, namespace, collection, jsonData, now, now);
    return { id: itemId, created_at: now };
}

function queryItems({ namespace, collection, query, sort = 'desc', limit = 100, offset = 0 }) {
    let sql = `SELECT * FROM items WHERE namespace = ? AND collection = ?`;
    const params = [namespace, collection];

    // Simple filter: exact match on JSON data keys
    if (query && typeof query === 'object') {
        for (const [key, value] of Object.entries(query)) {
            sql += ` AND json_extract(data, '$.' || ?) = ?`;
            params.push(key, value);
        }
    }

    const orderDir = sort === 'asc' ? 'ASC' : 'DESC';
    sql += ` ORDER BY updated_at ${orderDir} LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const rows = db.prepare(sql).all(...params);
    return rows.map(row => ({
        id: row.id,
        namespace: row.namespace,
        collection: row.collection,
        data: JSON.parse(row.data),
        created_at: row.created_at,
        updated_at: row.updated_at,
    }));
}

function deleteItem({ namespace, collection, id }) {
    const result = db.prepare(
        `DELETE FROM items WHERE namespace = ? AND collection = ? AND id = ?`
    ).run(namespace, collection, id);
    return { deleted: result.changes };
}

function updateItem({ namespace, collection, id, data }) {
    // Merge: read existing, deep-merge with incoming data
    const existing = db.prepare(
        `SELECT data FROM items WHERE namespace = ? AND collection = ? AND id = ?`
    ).get(namespace, collection, id);

    if (!existing) return null;

    const merged = { ...JSON.parse(existing.data), ...data };
    const now = Date.now();

    db.prepare(
        `UPDATE items SET data = ?, updated_at = ? WHERE namespace = ? AND collection = ? AND id = ?`
    ).run(JSON.stringify(merged), now, namespace, collection, id);

    return { id, updated_at: now, data: merged };
}

function searchItems({ namespace, collection, term, limit = 50 }) {
    // Full-text search across JSON data values
    const rows = db.prepare(`
        SELECT * FROM items
        WHERE namespace = ? AND collection = ? AND data LIKE ?
        ORDER BY updated_at DESC
        LIMIT ?
    `).all(namespace, collection, `%${term}%`, limit);

    return rows.map(row => ({
        id: row.id,
        namespace: row.namespace,
        collection: row.collection,
        data: JSON.parse(row.data),
        created_at: row.created_at,
        updated_at: row.updated_at,
    }));
}

function getStats() {
    const namespaces = db.prepare(
        `SELECT DISTINCT namespace FROM items`
    ).all().map(r => r.namespace);

    const totalItems = db.prepare(
        `SELECT COUNT(*) as count FROM items`
    ).get().count;

    return { namespaces, totalItems };
}

module.exports = { init, writeItem, queryItems, deleteItem, updateItem, searchItems, getStats };
