// Drives headless Chrome via CDP to log in and screenshot every sidebar tab.
// Usage: node scripts/ui-tour.mjs   (requires dev server on :3000)
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://localhost:3000';
const OUT = 'shots';
const PORT = 9222;

const TABS = [
  ['tape-chart', null], // default landing tab
  ['staff-copilot', 'Staff AI Copilot'],
  ['guest-cdp', 'Unified Guest CDP'],
  ['reservations', 'Reservations & Folios'],
  ['housekeeping', 'Housekeeping Dispatch'],
  ['maintenance', 'Engineering CMMS'],
  ['guest-portal', 'Guest Mobile & AI Concierge'],
  ['ai-revenue', 'AI Revenue Engine'],
  ['channel-manager', 'OTA Channel Manager'],
  ['pos-charges', 'POS Charge Posting'],
  ['analytics', 'Financials & RevPAR'],
  ['accounting', 'Finance & GL'],
  ['procurement', 'Procurement & Stock'],
  ['hr', 'Staff & Shifts'],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getTarget() {
  for (let i = 0; i < 30; i++) {
    try {
      const list = await (await fetch(`http://localhost:${PORT}/json`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page;
    } catch {}
    await sleep(500);
  }
  throw new Error('Chrome DevTools endpoint never came up');
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const chrome = spawn(CHROME, [
    '--headless', '--disable-gpu', '--window-size=1600,1000',
    `--remote-debugging-port=${PORT}`, 'about:blank',
  ], { stdio: 'ignore' });

  const target = await getTarget();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let id = 0;
  const pending = new Map();
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  };
  const send = (method, params = {}) => new Promise((res) => {
    const mid = ++id;
    pending.set(mid, res);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
    return r.result?.result?.value;
  };
  const shot = async (name) => {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    const { writeFileSync } = await import('node:fs');
    writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.result.data, 'base64'));
    console.log(`saved ${OUT}/${name}.png`);
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });

  // Login through the real API, store the session like the app does
  await send('Page.navigate', { url: BASE });
  await sleep(2500);
  const loggedIn = await evaluate(`
    fetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'gm@aura.com', password: 'admin123' })
    }).then(r => r.json()).then(d => {
      if (!d.token) return 'LOGIN FAILED: ' + JSON.stringify(d);
      localStorage.setItem('aura_token', d.token);
      localStorage.setItem('aura_user', JSON.stringify(d.user));
      return 'ok';
    })
  `);
  if (loggedIn !== 'ok') throw new Error(loggedIn);
  await send('Page.navigate', { url: BASE });
  await sleep(3500);

  for (const [name, label] of TABS) {
    if (label) {
      const clicked = await evaluate(`
        (() => {
          const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes(${JSON.stringify(label)}));
          if (btn) { btn.click(); return true; }
          return false;
        })()
      `);
      if (!clicked) { console.log(`!! nav button not found for ${label}`); continue; }
      await sleep(1800);
    }
    await shot(name);
  }

  ws.close();
  chrome.kill();
  console.log('done');
}

main().catch((e) => { console.error(e); process.exit(1); });
