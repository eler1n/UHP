const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 21000;
const STORAGE_FILE = path.join(__dirname, 'uhp-storage.json');

// Middleware
app.use(cors()); // Allow any origin to connect (browsers connecting to localhost)
app.use(bodyParser.json());

// Initialize Storage
if (!fs.existsSync(STORAGE_FILE)) {
    fs.writeFileSync(STORAGE_FILE, JSON.stringify({}));
}

// Helper: Load/Save DB
function getDB() {
    try {
        return JSON.parse(fs.readFileSync(STORAGE_FILE, 'utf8'));
    } catch (e) {
        return {};
    }
}
function saveDB(data) {
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(data, null, 2));
}

// --- UHP Protocol Implementation ---

// 1. Discovery / Handshake
app.get('/uhp/v1/handshake', (req, res) => {
    res.json({
        protocol: 'uhp',
        version: '1.0.0',
        capabilities: ['storage.local', 'storage.query'],
        agent: 'Clawdbot-UHP-Agent/1.0'
    });
});

// 2. Storage: Write (Simulates saving a bookmark locally)
app.post('/uhp/v1/storage/write', (req, res) => {
    const { namespace, collection, id, data } = req.body;
    
    if (!namespace || !collection || !data) {
        return res.status(400).json({ error: "Missing required fields: namespace, collection, data" });
    }

    const db = getDB();
    
    // Create namespace/collection structure if missing
    if (!db[namespace]) db[namespace] = {};
    if (!db[namespace][collection]) db[namespace][collection] = [];

    const store = db[namespace][collection];
    
    // Check if item exists (update) or push new (create)
    // If 'id' provided, use it for uniqueness
    const existingIndex = id ? store.findIndex(item => item.id === id) : -1;
    
    const entry = {
        id: id || Date.now().toString(),
        timestamp: Date.now(),
        data
    };

    if (existingIndex >= 0) {
        store[existingIndex] = entry; // Update
    } else {
        store.push(entry); // Insert
    }

    saveDB(db);
    
    console.log(`[UHP] Wrote item to ${namespace}/${collection}`);
    res.json({ success: true, id: entry.id });
});

// 3. Storage: Read (Simulates fetching bookmarks locally)
app.post('/uhp/v1/storage/query', (req, res) => {
    const { namespace, collection, query } = req.body;

    if (!namespace || !collection) {
        return res.status(400).json({ error: "Missing required fields: namespace, collection" });
    }

    const db = getDB();
    const store = (db[namespace] && db[namespace][collection]) || [];

    // Simple filtering (exact match on data properties)
    let results = store;
    if (query) {
        results = store.filter(item => {
            // Check if item.data contains all keys/values from query
            return Object.keys(query).every(key => item.data[key] === query[key]);
        });
    }

    // Sort by timestamp desc by default
    results.sort((a, b) => b.timestamp - a.timestamp);

    console.log(`[UHP] Read ${results.length} items from ${namespace}/${collection}`);
    res.json({ success: true, items: results });
});

// Start Server
app.listen(PORT, () => {
    console.log(`
🚀 UHP Agent Running on http://localhost:${PORT}
   - Handshake: GET /uhp/v1/handshake
   - Write:     POST /uhp/v1/storage/write
   - Read:      POST /uhp/v1/storage/query
    `);
});
