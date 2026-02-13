# UHP — User-Hosted Protocol v1.1.0

> A standardized REST API running on `localhost` that any application can discover and use to store, query, and manage user-owned data locally.

## Philosophy

UHP is inspired by the [Model Context Protocol (MCP)](https://modelcontextprotocol.io) but serves a different audience:

| | MCP | UHP |
|---|---|---|
| **Connects** | AI models ↔ Tools/Data | Any app ↔ User's local machine |
| **Transport** | JSON-RPC 2.0 (stdio / HTTP) | REST over HTTP |
| **Primitives** | Tools, Resources, Prompts | Storage, Permissions, Search |
| **Runs on** | Developer machines | End-user machines |
| **Goal** | Give AI context | Give users data ownership |

Both share the same architecture pattern: **discover → negotiate capabilities → interact**.

---

## 1. Discovery & Handshake

Any app begins by probing a well-known local port.

### `GET /uhp/v1/handshake`

**Response:**
```json
{
  "protocol": "uhp",
  "version": "1.0.0",
  "capabilities": [
    "storage.write",
    "storage.query",
    "storage.delete",
    "storage.update",
    "storage.search",
    "permissions.manage"
  ],
  "agent": {
    "name": "UHP-Agent",
    "version": "1.0.0",
    "runtime": "darwin"
  },
  "stats": {
    "namespaces": ["twitter.com"],
    "totalItems": 42
  }
}
```

### `GET /uhp/v1/health`

Lightweight liveness probe.

```json
{ "status": "ok", "uptime": 3600.5 }
```

**Well-known port:** `21000` (configurable via `UHP_PORT` env var).

---

## 2. Permissions

Before any storage operation, an app must request access to a namespace.

### `POST /uhp/v1/permissions/request`

```json
{
  "namespace": "twitter.com",
  "capabilities": ["storage.write", "storage.query"]
}
```

**Response:**
```json
{
  "success": true,
  "granted": true,
  "namespace": "twitter.com",
  "origin": "https://twitter.com",
  "capabilities": ["storage.write", "storage.query"]
}
```

### `GET /uhp/v1/permissions/list?origin=...`

Returns all granted permissions, optionally filtered by origin.

### `POST /uhp/v1/permissions/revoke`

```json
{ "namespace": "twitter.com" }
```

---

## 3. Storage

All storage is organized as **namespace → collection → items**.

- **Namespace**: Identifies the app (e.g., `twitter.com`, `my-desktop-app`, `com.example.ios`)
- **Collection**: Groups items (e.g., `bookmarks`, `preferences`, `history`)
- **Item**: A JSON document with a unique `id`

### `POST /uhp/v1/storage/write` — Create / Upsert

```json
{
  "namespace": "twitter.com",
  "collection": "bookmarks",
  "id": "optional-custom-id",
  "data": {
    "text": "Great tweet",
    "author": "@someone"
  }
}
```

**Response:**
```json
{ "success": true, "id": "tweet-123", "created_at": 1707850000000 }
```

### `POST /uhp/v1/storage/query` — Read with filters

```json
{
  "namespace": "twitter.com",
  "collection": "bookmarks",
  "query": { "author": "@someone" },
  "sort": "desc",
  "limit": 20,
  "offset": 0
}
```

### `POST /uhp/v1/storage/update` — Partial update

```json
{
  "namespace": "twitter.com",
  "collection": "bookmarks",
  "id": "tweet-123",
  "data": { "note": "my annotation" }
}
```

Merges `data` into the existing item.

### `POST /uhp/v1/storage/delete` — Remove item

```json
{
  "namespace": "twitter.com",
  "collection": "bookmarks",
  "id": "tweet-123"
}
```

### `POST /uhp/v1/storage/search` — Full-text search

```json
{
  "namespace": "twitter.com",
  "collection": "bookmarks",
  "term": "great tweet",
  "limit": 50
}
```

---

## 4. Error Format

All errors follow a consistent shape:

```json
{
  "error": "INVALID_REQUEST",
  "message": "Missing required fields: namespace, collection, data"
}
```

**Error codes:**
| Code | HTTP Status | Meaning |
|------|-------------|---------|
| `INVALID_REQUEST` | 400 | Missing or invalid parameters |
| `NOT_FOUND` | 404 | Item or endpoint not found |
| `PERMISSION_DENIED` | 403 | Namespace access not granted |
| `STORAGE_ERROR` | 500 | Database operation failed |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

---

## 5. Security Model

- **Localhost-only**: The agent only listens on `127.0.0.1` (or `localhost`).
- **Origin-checked**: Each request's `Origin` header is validated against the permission grants.
- **Namespace isolation**: Apps can only access their own namespace.
- **Sync layer**: When enabled, all data is encrypted locally before leaving the machine (see Section 7).

### Future
- System-level permission dialogs (OS-native)
- mTLS for agent ↔ client auth

---

## 6. Client SDK

A universal JavaScript SDK is provided at `client/uhp-client.js`:

```js
// Works in Browser, Node.js, Electron, React Native, Deno
const uhp = new UHPClient({ port: 21000 });

await uhp.connect();
await uhp.permissions.request('twitter.com');

await uhp.store.add('twitter.com', 'bookmarks', { text: 'Hello' });
const items = await uhp.store.query('twitter.com', 'bookmarks');
await uhp.store.search('twitter.com', 'bookmarks', 'hello');
await uhp.store.delete('twitter.com', 'bookmarks', 'item-id');
```

For non-JS apps, use any HTTP client — the protocol is plain REST.

---

## 7. Sync Layer — Encrypted Dumb Relay

The sync layer solves data durability and multi-device access while preserving the core UHP guarantee: **no third party can read your data.**

### 7.1 Architecture

```
  Device A                              Device B
  ┌──────────┐                          ┌──────────┐
  │ UHP Agent│                          │ UHP Agent│
  │ (SQLite) │                          │ (SQLite) │
  └────┬─────┘                          └────┬─────┘
       │ AES-256-GCM encrypted               │
       │         ┌──────────────┐             │
       └────────▶│  Dumb Relay  │◀────────────┘
                 │              │
                 │ Sees ONLY    │
                 │ opaque blobs │
                 └──────────────┘
                 (iCloud / GDrive /
                  S3 / NAS / USB)
```

The relay is a **zero-knowledge storage backend**. It holds encrypted blobs it cannot read, decrypt, or interpret. All cryptographic operations happen on-device in the UHP agent.

### 7.2 Concepts

| Term | Definition |
|---|---|
| **Sync Passphrase** | User-chosen secret used to derive encryption keys. Never leaves the device. |
| **Master Key** | Derived from passphrase via PBKDF2. Used to encrypt/decrypt change entries. |
| **Change Log** | Append-only log of all storage mutations (write, update, delete) with sequence numbers. |
| **Change Entry** | A single encrypted mutation: `{ seq, op, namespace, collection, id, data, timestamp }` |
| **Relay** | Any dumb storage backend (file system, cloud drive, S3 bucket). |
| **Device ID** | Random UUID assigned to each agent instance. Used for conflict attribution. |

### 7.3 Cryptography

#### Key Derivation

```
passphrase (user input)
    │
    ▼
PBKDF2-SHA256 (600,000 iterations, 32-byte salt)
    │
    ▼
master_key (256-bit)
    │
    ├──▶ HKDF-Expand("uhp-encryption") ──▶ encryption_key (AES-256)
    └──▶ HKDF-Expand("uhp-signing")    ──▶ signing_key (HMAC-SHA256)
```

- **Salt** is generated once per sync setup and stored alongside the encrypted data on the relay.
- **Iterations** are configurable (minimum 600,000) for future-proofing.

#### Encryption

Each change entry is encrypted independently:

```
plaintext = JSON.stringify(change_entry)
nonce = random(12 bytes)  // unique per entry
ciphertext = AES-256-GCM(encryption_key, nonce, plaintext)
mac = HMAC-SHA256(signing_key, nonce || ciphertext)

blob = { nonce, ciphertext, mac, seq, device_id, timestamp }
```

- **AES-256-GCM**: Authenticated encryption (confidentiality + integrity in one pass).
- **HMAC envelope**: Additional authentication layer so tampering is detected before decryption.
- **Unique nonce per entry**: Prevents nonce reuse attacks.

### 7.4 Change Log

Every storage mutation generates a change entry:

```json
{
  "seq": 42,
  "op": "write",
  "namespace": "twitter.com",
  "collection": "bookmarks",
  "id": "tweet-123",
  "data": { "text": "Great tweet", "author": "@someone" },
  "timestamp": 1707850000000,
  "device_id": "d1a2b3c4-..."
}
```

| Operation | `op` value | `data` contents |
|---|---|---|
| Create/Upsert | `write` | Full item data |
| Partial update | `update` | Merge patch only |
| Delete | `delete` | `null` |

Sequence numbers are **per-device** and monotonically increasing. The global order is resolved during pull via timestamps + device priority.

### 7.5 Sync Endpoints

#### `POST /uhp/v1/sync/setup` — Configure sync

```json
{
  "passphrase": "user-chosen-secret",
  "relay": {
    "type": "filesystem",
    "path": "/Users/me/Library/Mobile Documents/com~apple~CloudDocs/UHP"
  }
}
```

**Response:**
```json
{
  "success": true,
  "device_id": "d1a2b3c4-5e6f-7a8b-9c0d-e1f2a3b4c5d6",
  "relay": { "type": "filesystem", "status": "connected" },
  "salt": "base64-encoded-salt"
}
```

**Relay types:**

| `type` | `path` / `config` | Description |
|---|---|---|
| `filesystem` | Absolute path to a folder | Local dir, iCloud Drive, Google Drive, Dropbox |
| `s3` | `{ bucket, region, accessKey, secretKey }` | AWS S3 or compatible (MinIO, R2) |
| `webdav` | `{ url, username, password }` | WebDAV server or NAS |

#### `GET /uhp/v1/sync/status` — Sync health

```json
{
  "enabled": true,
  "device_id": "d1a2b3c4-...",
  "relay": { "type": "filesystem", "status": "connected" },
  "local_seq": 42,
  "relay_seq": 40,
  "pending_changes": 2,
  "last_push": 1707850000000,
  "last_pull": 1707849000000,
  "devices": [
    { "id": "d1a2b3c4-...", "name": "MacBook", "last_seen": 1707850000000 },
    { "id": "e2b3c4d5-...", "name": "iPhone", "last_seen": 1707840000000 }
  ]
}
```

#### `POST /uhp/v1/sync/push` — Push changes to relay

Pushes all pending local changes (since last push) to the relay as encrypted blobs.

```json
{ "force": false }
```

**Response:**
```json
{
  "success": true,
  "pushed": 5,
  "local_seq": 42,
  "relay_seq": 42
}
```

The agent:
1. Reads unsynced changes from the local change log
2. Encrypts each entry with AES-256-GCM
3. Writes encrypted blobs to the relay
4. Updates the sync cursor

#### `POST /uhp/v1/sync/pull` — Pull changes from relay

Pulls encrypted changes from the relay that were pushed by other devices.

```json
{ "since_seq": 35 }
```

**Response:**
```json
{
  "success": true,
  "pulled": 3,
  "applied": 3,
  "conflicts": 0,
  "relay_seq": 42
}
```

The agent:
1. Reads encrypted blobs from the relay (since last pull)
2. Verifies HMAC, decrypts with AES-256-GCM
3. Replays operations into local SQLite
4. Resolves conflicts (see 7.6)

#### `POST /uhp/v1/sync/restore` — Full restore from relay

Restores all data from the relay onto a fresh device.

```json
{
  "passphrase": "user-chosen-secret",
  "relay": {
    "type": "filesystem",
    "path": "/Users/me/Library/Mobile Documents/com~apple~CloudDocs/UHP"
  }
}
```

**Response:**
```json
{
  "success": true,
  "restored_entries": 142,
  "namespaces": ["twitter.com", "notion.com"],
  "device_id": "f3c4d5e6-..."
}
```

### 7.6 Conflict Resolution

Conflicts occur when two devices modify the same item before syncing.

**Strategy: Last-Write-Wins (LWW) with timestamp ordering.**

```
Device A writes tweet-123 at T=1000
Device B writes tweet-123 at T=1002

→ Device B's version wins (higher timestamp)
→ Device A's version is preserved in conflict log (recoverable)
```

**Conflict log entry:**
```json
{
  "item_id": "tweet-123",
  "winning_device": "e2b3c4d5-...",
  "losing_device": "d1a2b3c4-...",
  "winning_data": { ... },
  "losing_data": { ... },
  "resolved_at": 1707850000000
}
```

Conflicts can be reviewed via `GET /uhp/v1/sync/conflicts` and manually resolved if needed. For most use cases (bookmarks, notes, preferences), LWW is entirely sufficient.

### 7.7 Relay File Layout

The relay stores a simple, flat structure:

```
uhp-sync/
  ├── manifest.json          # Salt, device registry, metadata (encrypted)
  ├── changes/
  │   ├── 000001.enc         # Encrypted change entry
  │   ├── 000002.enc
  │   ├── ...
  │   └── 000142.enc
  └── snapshots/
      └── snapshot-20260213.enc  # Periodic full snapshot (encrypted)
```

- **Changes** are append-only. Each file is one encrypted change entry.
- **Snapshots** are periodic compacted state for faster restores (optional optimization).
- File names are sequence numbers — no metadata is leaked through filenames.

### 7.8 Security Guarantees

| Property | Guarantee |
|---|---|
| **Confidentiality** | AES-256-GCM — relay cannot read data |
| **Integrity** | HMAC-SHA256 — tampered blobs are rejected |
| **Authenticity** | Only devices with the passphrase can produce valid entries |
| **Forward secrecy** | Key rotation via `POST /uhp/v1/sync/rotate-key` re-encrypts all data |
| **Zero knowledge** | Relay sees only opaque blobs, timestamps, and sequence numbers |
| **Deletion** | `POST /uhp/v1/sync/purge` wipes all relay data irrecoverably |

### 7.9 User Experience

```
┌─────────────────────────────────────────┐
│  First device setup:                     │
│                                          │
│  "Choose a sync passphrase"              │
│  ┌──────────────────────────────────┐    │
│  │ ••••••••••••••••                 │    │
│  └──────────────────────────────────┘    │
│                                          │
│  "Where should we sync?"                 │
│  ○ iCloud Drive (recommended)            │
│  ○ Google Drive                          │
│  ○ Custom folder                         │
│                                          │
│              [ Enable Sync ]             │
│                                          │
│  New device / recovery:                  │
│                                          │
│  "Enter your sync passphrase"            │
│  ┌──────────────────────────────────┐    │
│  │ ••••••••••••••••                 │    │
│  └──────────────────────────────────┘    │
│                                          │
│              [ Restore ]                 │
│                                          │
│  No accounts. No emails. No cloud.       │
└─────────────────────────────────────────┘
```
