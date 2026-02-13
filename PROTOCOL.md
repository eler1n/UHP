# UHP — User-Hosted Protocol v1.0.0

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
- **No cloud sync** (v1): All data stays on the local machine.

### Future (v2+)
- Encrypted sync via "dumb relay" (iCloud, Google Drive, generic S3)
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
