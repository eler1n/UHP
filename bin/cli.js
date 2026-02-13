#!/usr/bin/env node

/**
 * UHP CLI — One command to rule them all
 *
 * Usage:
 *   uhp start     Start the UHP agent (+ demo server)
 *   uhp stop      Stop the running agent
 *   uhp status    Show agent health & stats
 *   uhp demo      Open the demo app in your browser
 *   uhp help      Show this help message
 */

const { execSync, spawn } = require('child_process');
const path = require('path');
const http = require('http');
const os = require('os');

// ── Colors (no dependencies) ─────────────────────────────────────────

const c = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    green: '\x1b[32m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    magenta: '\x1b[35m',
};

// ── Config ───────────────────────────────────────────────────────────

const PORT = process.env.UHP_PORT || 21000;
const AGENT_URL = `http://localhost:${PORT}`;
const DEMO_URL = `${AGENT_URL}/demo`;
const ROOT = path.resolve(__dirname, '..');

// ── Helpers ──────────────────────────────────────────────────────────

function logo() {
    console.log(`
${c.blue}${c.bold}  ╔═══════════════════════════════════════╗
  ║         ${c.cyan}🔗  UHP${c.blue}  —  User-Hosted Protocol  ║
  ║         ${c.dim}Your data, your machine${c.reset}${c.blue}${c.bold}         ║
  ╚═══════════════════════════════════════╝${c.reset}
`);
}

function openBrowser(url) {
    const cmd = process.platform === 'darwin' ? 'open'
        : process.platform === 'win32' ? 'start'
            : 'xdg-open';
    try {
        execSync(`${cmd} ${url}`, { stdio: 'ignore' });
    } catch (_) { /* ignore if no browser */ }
}

async function fetchJSON(path) {
    return new Promise((resolve, reject) => {
        const req = http.get(`${AGENT_URL}${path}`, { timeout: 2000 }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(new Error('Invalid response')); }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    });
}

async function isAgentRunning() {
    try {
        const data = await fetchJSON('/uhp/v1/health');
        return data.status === 'ok';
    } catch (_) {
        return false;
    }
}

// ── Commands ─────────────────────────────────────────────────────────

async function cmdStart() {
    logo();

    // Check if already running
    if (await isAgentRunning()) {
        console.log(`  ${c.green}●${c.reset} Agent is already running on ${c.cyan}${AGENT_URL}${c.reset}`);
        console.log(`  ${c.dim}Opening demo...${c.reset}\n`);
        openBrowser(DEMO_URL);
        return;
    }

    console.log(`  ${c.yellow}◐${c.reset} Starting UHP Agent...`);

    // Start the agent as a child process
    const agent = spawn('node', [path.join(ROOT, 'agent', 'index.js')], {
        cwd: ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, UHP_PORT: PORT },
        detached: false,
    });

    // Forward output
    agent.stdout.on('data', (data) => {
        const line = data.toString().trim();
        if (line) console.log(`  ${c.dim}${line}${c.reset}`);
    });

    agent.stderr.on('data', (data) => {
        const line = data.toString().trim();
        if (line) console.error(`  ${c.red}${line}${c.reset}`);
    });

    // Wait for agent to be ready
    let ready = false;
    for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 500));
        if (await isAgentRunning()) {
            ready = true;
            break;
        }
    }

    if (!ready) {
        console.log(`\n  ${c.red}✖${c.reset} Agent failed to start. Check the output above.\n`);
        process.exit(1);
    }

    // Fetch stats
    try {
        const handshake = await fetchJSON('/uhp/v1/handshake');
        const stats = handshake.stats || {};

        console.log(`
  ${c.green}✔${c.reset} ${c.bold}Agent running${c.reset}

  ${c.cyan}Agent${c.reset}    ${AGENT_URL}
  ${c.cyan}Demo${c.reset}     ${DEMO_URL}
  ${c.cyan}Items${c.reset}    ${stats.totalItems || 0} across ${(stats.namespaces || []).length} namespaces

  ${c.dim}Press ${c.bold}Ctrl+C${c.reset}${c.dim} to stop${c.reset}
`);
    } catch (_) {
        console.log(`\n  ${c.green}✔${c.reset} Agent running at ${c.cyan}${AGENT_URL}${c.reset}\n`);
    }

    // Open browser
    openBrowser(DEMO_URL);

    // Handle Ctrl+C gracefully
    const shutdown = () => {
        console.log(`\n  ${c.yellow}⏻${c.reset} Shutting down UHP Agent...`);
        agent.kill('SIGTERM');
        setTimeout(() => process.exit(0), 1000);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // Keep alive
    agent.on('close', (code) => {
        if (code !== null && code !== 0) {
            console.log(`\n  ${c.red}✖${c.reset} Agent exited with code ${code}\n`);
        }
        process.exit(code || 0);
    });
}

async function cmdStop() {
    logo();

    if (!(await isAgentRunning())) {
        console.log(`  ${c.dim}●${c.reset} Agent is not running.\n`);
        return;
    }

    // Find and kill the process on the port
    try {
        const result = execSync(`lsof -ti:${PORT}`, { encoding: 'utf8' }).trim();
        if (result) {
            const pids = result.split('\n');
            pids.forEach(pid => {
                try { process.kill(parseInt(pid), 'SIGTERM'); } catch (_) { }
            });
            console.log(`  ${c.green}✔${c.reset} Agent stopped (PID: ${pids.join(', ')})\n`);
        }
    } catch (_) {
        console.log(`  ${c.yellow}!${c.reset} Could not find agent process. It may have already stopped.\n`);
    }
}

async function cmdStatus() {
    logo();

    if (!(await isAgentRunning())) {
        console.log(`  ${c.red}●${c.reset} Agent is ${c.bold}offline${c.reset}`);
        console.log(`  ${c.dim}Run ${c.cyan}uhp start${c.dim} to start the agent.${c.reset}\n`);
        return;
    }

    try {
        const handshake = await fetchJSON('/uhp/v1/handshake');
        const health = await fetchJSON('/uhp/v1/health');
        const stats = handshake.stats || {};
        const agent = handshake.agent || {};

        const uptime = health.uptime || 0;
        const hours = Math.floor(uptime / 3600);
        const mins = Math.floor((uptime % 3600) / 60);
        const uptimeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

        console.log(`  ${c.green}●${c.reset} Agent is ${c.bold}${c.green}online${c.reset}`);
        console.log();
        console.log(`  ${c.cyan}URL${c.reset}          ${AGENT_URL}`);
        console.log(`  ${c.cyan}Version${c.reset}      ${agent.version || '?'}`);
        console.log(`  ${c.cyan}Uptime${c.reset}       ${uptimeStr}`);
        console.log(`  ${c.cyan}Items${c.reset}        ${stats.totalItems || 0}`);
        console.log(`  ${c.cyan}Namespaces${c.reset}   ${(stats.namespaces || []).join(', ') || 'none'}`);
        console.log(`  ${c.cyan}Demo${c.reset}         ${DEMO_URL}`);
        console.log();
    } catch (err) {
        console.log(`  ${c.yellow}!${c.reset} Agent is running but returned unexpected data.\n`);
    }
}

async function cmdDemo() {
    if (!(await isAgentRunning())) {
        console.log(`\n  ${c.red}●${c.reset} Agent is not running. Start it first:\n`);
        console.log(`  ${c.cyan}$${c.reset} uhp start\n`);
        return;
    }
    console.log(`\n  ${c.green}●${c.reset} Opening demo at ${c.cyan}${DEMO_URL}${c.reset}\n`);
    openBrowser(DEMO_URL);
}

function cmdHelp() {
    logo();
    console.log(`  ${c.bold}Usage:${c.reset}  uhp ${c.cyan}<command>${c.reset}
  
  ${c.bold}Commands:${c.reset}
    ${c.cyan}start${c.reset}     Start the UHP agent and open the demo app
    ${c.cyan}stop${c.reset}      Stop the running agent
    ${c.cyan}status${c.reset}    Show agent health, stats, and stored data
    ${c.cyan}demo${c.reset}      Open the demo app in your browser

  ${c.bold}Options:${c.reset}
    ${c.cyan}--port${c.reset}    Set agent port (default: 21000, or UHP_PORT env)
    ${c.cyan}--help${c.reset}    Show this help message

  ${c.bold}Examples:${c.reset}
    ${c.dim}$${c.reset} uhp start            ${c.dim}# Start agent + open demo${c.reset}
    ${c.dim}$${c.reset} uhp status            ${c.dim}# Check what's stored${c.reset}
    ${c.dim}$${c.reset} UHP_PORT=3000 uhp start  ${c.dim}# Custom port${c.reset}

  ${c.bold}Learn more:${c.reset}  ${c.cyan}https://github.com/eler1n/UHP${c.reset}
`);
}

// ── Main ─────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const command = args[0] || 'help';

// Parse --port flag
const portIdx = args.indexOf('--port');
if (portIdx !== -1 && args[portIdx + 1]) {
    process.env.UHP_PORT = args[portIdx + 1];
}

switch (command) {
    case 'start': cmdStart().catch(console.error); break;
    case 'stop': cmdStop().catch(console.error); break;
    case 'status': cmdStatus().catch(console.error); break;
    case 'demo': cmdDemo().catch(console.error); break;
    case 'help':
    case '--help':
    case '-h': cmdHelp(); break;
    default:
        console.log(`\n  ${c.red}Unknown command:${c.reset} ${command}`);
        cmdHelp();
        process.exit(1);
}
