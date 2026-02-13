# 🔗 UHP — User-Hosted Protocol

> **A standardized REST API on `localhost` that lets any application store, query, and manage user-owned data locally.**

UHP flips the cloud model. Instead of your data living on someone else's servers, apps connect to a lightweight agent running on *your* machine. Your data never leaves your device.

## The Problem

Every app you use stores your data on their servers. Your Twitter bookmarks, your Notion notes, your Spotify playlists — all held hostage by companies who can change terms, shut down, get breached, or sell your data.

**What if apps could store data on YOUR machine instead?**

## How UHP Works

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Twitter.com │     │  Notion.com  │     │  Any App     │
│  (browser)   │     │  (desktop)   │     │  (CLI/mobile)│
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                    │
       │         REST API (localhost:21000)      │
       └────────────────────┼────────────────────┘
                            │
                   ┌────────▼────────┐
                   │   UHP Agent     │
                   │   ─────────     │
                   │  • SQLite DB    │
                   │  • Permissions  │
                   │  • Full-text    │
                   │    search       │
                   └─────────────────┘
                     YOUR machine
```

1. **App discovers** the local agent via handshake (`GET /uhp/v1/handshake`)
2. **App requests permission** to a namespace (e.g., `twitter.com`)
3. **App reads/writes** data through standard REST endpoints
4. **Data stays local** — zero network latency, full privacy, works offline

## UHP vs MCP

UHP shares architectural DNA with the [Model Context Protocol](https://modelcontextprotocol.io), but serves a completely different audience:

| | MCP | UHP |
|---|---|---|
| **Connects** | AI models ↔ Tools/Data | Any app ↔ User's local machine |
| **Transport** | JSON-RPC 2.0 (stdio / SSE) | REST over HTTP |
| **Primitives** | Tools, Resources, Prompts | Storage, Permissions, Search |
| **Runs on** | Developer machines | End-user machines |
| **Goal** | Give AI context | Give users data ownership |

MCP standardized how AI talks to tools. **UHP standardizes how apps talk to YOUR machine.**

## Quick Start

```bash
# Install dependencies
npm install

# Start the agent (localhost:21000)
npm start

# In another terminal — start the demo app (localhost:3210)
npm run demo
```

Open [http://localhost:3210](http://localhost:3210) to see the Twitter Bookmarks demo.

## API Overview

All endpoints live under `/uhp/v1/`:

### Discovery
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/handshake` | Discover agent, negotiate capabilities |
| `GET` | `/health` | Liveness check |

### Storage
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/storage/write` | Write/upsert an item |
| `POST` | `/storage/query` | Query items with filters, sort, pagination |
| `POST` | `/storage/update` | Partial update (merge) |
| `POST` | `/storage/delete` | Delete an item |
| `POST` | `/storage/search` | Full-text search across stored data |

### Permissions
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/permissions/request` | Request access to a namespace |
| `GET` | `/permissions/list` | List granted permissions |
| `POST` | `/permissions/revoke` | Revoke namespace access |

## Client SDK

A universal JavaScript SDK works in any runtime — Browser, Node.js, Electron, React Native, Deno:

```javascript
import UHPClient from './client/uhp-client.js';

const uhp = new UHPClient();
await uhp.connect();

// Request permission
await uhp.permissions.request('myapp.com');

// Store data locally
await uhp.store.add('myapp.com', 'notes', {
  title: 'Meeting notes',
  content: 'Discussed the UHP roadmap...'
});

// Query
const notes = await uhp.store.query('myapp.com', 'notes');

// Full-text search
const results = await uhp.store.search('myapp.com', 'notes', 'roadmap');
```

## Project Structure

```
├── agent/                  # UHP Agent (Express.js + SQLite)
│   ├── index.js            # Server entry point
│   ├── storage.js          # SQLite storage engine
│   ├── permissions.js      # Permission system
│   └── routes/
│       ├── handshake.js    # Discovery & health
│       ├── storage.js      # CRUD + search endpoints
│       └── permissions.js  # Permission management
├── client/
│   └── uhp-client.js       # Universal JavaScript SDK
├── demo/
│   └── index.html          # Twitter Bookmarks demo app
└── PROTOCOL.md             # Full protocol specification
```

## Why This Matters

**For users:**
- 🔒 **Privacy** — Data never leaves your machine
- ⚡ **Speed** — Zero network latency (it's localhost)
- 📴 **Offline** — Works without internet
- 🗂️ **Ownership** — Export, delete, control your data

**For developers:**
- 💰 **Cost** — No servers to run, no databases to maintain
- ⚖️ **Liability** — No user data to protect, no GDPR headaches
- 🔌 **Simple** — Standard REST API, any language, any platform

## Security Model

- **Localhost only** — Agent only binds to `127.0.0.1`
- **Namespace isolation** — Apps can only access their own namespace
- **Origin-based permissions** — Each origin must explicitly request access
- **No cloud sync** (v1) — Data stays on-device

## Roadmap

- [x] Core agent with SQLite storage
- [x] Universal JavaScript SDK
- [x] Permission system
- [x] Full-text search
- [x] Demo application
- [x] Protocol specification
- [ ] Native permission dialogs (OS-level consent)
- [ ] Encrypted sync layer (multi-device via "dumb relay")
- [ ] Desktop tray app
- [ ] SDKs for Python, Swift, Kotlin

## License

MIT

---

*UHP is a protocol, not a product. Any developer can build a compliant agent, any app can connect to it. The goal is a world where users own their data by default.*
