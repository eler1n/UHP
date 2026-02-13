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

### Option 1: One command (recommended)

```bash
npx uhp start
```

That's it. The agent starts, the demo opens in your browser. Press `Ctrl+C` to stop.

### Option 2: Clone and run

```bash
git clone https://github.com/eler1n/UHP.git
cd UHP
npm install
npm start
```

Open [http://localhost:21000](http://localhost:21000) — the demo app loads automatically.

### CLI Commands

| Command | What it does |
|---|---|
| `uhp start` | Start the agent, open the demo |
| `uhp stop` | Stop the running agent |
| `uhp status` | Show health, stored items, namespaces |
| `uhp demo` | Open the demo app in your browser |
| `uhp help` | Show all options |

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
- **Encrypted sync** — When enabled, all data is encrypted on-device before syncing (AES-256-GCM)

## Data Durability & Multi-Device Sync

> *"If my computer dies, my data dies"* — not with UHP.

UHP v1.1 specifies an **Encrypted Dumb Relay** — a sync layer where your data is encrypted on your machine before being stored on any cloud service. The relay (iCloud Drive, Google Drive, S3, a USB stick) sees only opaque blobs it cannot read.

```
MacBook → encrypt → iCloud Drive ← encrypt ← iPhone
                    (sees nothing)
```

**Key properties:**
- 🔐 **Zero-knowledge** — Relay cannot read, mine, or monetize your data
- 🔄 **Multi-device** — All devices with your passphrase stay in sync
- 💀 **Machine dies?** — New machine + passphrase = full restore
- 🔑 **No accounts** — Just a passphrase, no email, no sign-up

See [`PROTOCOL.md` §7](PROTOCOL.md#7-sync-layer--encrypted-dumb-relay) for the full specification.

## How Apps Integrate

UHP integration is lightweight — about **20 lines of code** for any web app. No SDK required, no dependencies, just `fetch()`.

### Step 1: Detect the agent (zero impact if absent)

```javascript
let uhpAvailable = false;
try {
    const res = await fetch('http://localhost:21000/uhp/v1/handshake');
    const agent = await res.json();
    uhpAvailable = agent.protocol === 'uhp';
} catch (_) {
    // No agent → continue normally, nothing changes
}
```

### Step 2: Request permission (once)

```javascript
await fetch('http://localhost:21000/uhp/v1/permissions/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ namespace: 'x.com', capabilities: ['storage.write', 'storage.query'] })
});
```

### Step 3: Store data locally

```javascript
// When a user bookmarks a tweet, save it locally too
if (uhpAvailable) {
    await fetch('http://localhost:21000/uhp/v1/storage/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            namespace: 'x.com',
            collection: 'bookmarks',
            id: tweet.id,
            data: { text: tweet.text, author: tweet.author }
        })
    });
}
```

**That's the entire integration.** If the user doesn't have UHP, nothing changes. Zero disruption.

### What a company gains by integrating

| Before UHP | After UHP |
|---|---|
| Store millions of users' data on their servers | UHP users store their own data |
| Pay for storage + compute for every query | Queries run on user's machine ($0) |
| Liable for data breaches | No liability — data isn't on their servers |
| GDPR compliance headaches | User owns their data |
| Everything breaks if servers go down | Bookmarks work offline |

## Adoption Paths

UHP doesn't depend on companies adopting it. There are three paths to mainstream adoption:

### Path 1: Native Integration (companies add UHP support)

Apps add ~20 lines of code to detect the agent and offload data locally. This can be **additive** — save data locally AND on their servers — making it zero risk:

```
Phase 1: Mirror   → save locally as well as on server
Phase 2: Local-first → query local first, fallback to server
Phase 3: Offload  → stop storing on server for UHP users
```

### Path 2: Browser Extension (no company cooperation needed)

A UHP browser extension acts as a **bridge** between websites that don't know about UHP and the local agent:

```
User visits x.com → extension detects bookmarks →
saves them locally via UHP → no X cooperation needed
```

| What it captures | How |
|---|---|
| Bookmarks | Watches DOM for bookmark actions, captures content |
| Reading history | Logs URLs visited (with user consent) |
| Saved articles | Extracts content from Medium, Substack, etc. |
| Shopping carts | Captures product data from Amazon, etc. |

**No company needs to change anything.** The extension is a personal data collector that stores everything locally via UHP.

### Path 3: Desktop Menubar App (for non-technical users)

The agent ships as a native app — no terminal, no npm:

```
Download UHP.dmg → drag to Applications → it runs silently
```

The browser extension auto-connects. Zero configuration.

### The Full Picture

```
                  ┌──────────────────────┐
                  │  UHP Browser Extension│  ← captures data from ANY site
                  └──────────┬───────────┘
                             │
    ┌────────────┐    ┌──────▼──────┐    ┌────────────┐
    │ Apps that   │    │             │    │ Desktop    │
    │ integrate   │───▶│  UHP Agent  │◀───│ Menubar App│
    │ natively    │    │  (localhost) │    │ (auto-run) │
    └────────────┘    └──────┬──────┘    └────────────┘
                             │
                      ┌──────▼──────┐
                      │   SQLite    │
                      │  Your data  │
                      └─────────────┘
```

## Roadmap

### ✅ v1 — Foundation (done)
- [x] Core agent with SQLite storage
- [x] Universal JavaScript SDK
- [x] Permission system & full-text search
- [x] Demo application (Twitter Bookmarks)
- [x] Protocol specification
- [x] CLI (`uhp start/stop/status`)

### ✅ v1.1 — Sync Protocol Spec (done)
- [x] Encrypted Dumb Relay protocol design
- [x] Cryptography spec (PBKDF2 + AES-256-GCM)
- [x] Sync endpoints (setup/push/pull/restore)

### 🔲 v2 — Sync Implementation
- [ ] Sync layer implementation (crypto + relay adapters)
- [ ] Filesystem relay (iCloud Drive, Google Drive, Dropbox)
- [ ] S3 / WebDAV relay adapters
- [ ] Conflict resolution (LWW + conflict log)

### 🔲 v3 — Mainstream Adoption
- [ ] Browser extension (capture data from any website)
- [ ] Desktop menubar app (macOS, Windows, Linux)
- [ ] Native permission dialogs (OS-level consent)
- [ ] SDKs for Python, Swift, Kotlin

## License

MIT

---

*UHP is a protocol, not a product. Any developer can build a compliant agent, any app can connect to it. The goal is a world where users own their data by default.*
