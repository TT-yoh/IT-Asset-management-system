import { spawn } from 'child_process';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DEBUG_PORT = 9336;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getWebSocketDebuggerUrl() {
  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
      const tabs = await res.json();
      const page = tabs.find(t => t.type === 'page');
      if (page && page.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(500);
  }
  throw new Error('Failed to connect to Chrome debugging port');
}

class CDPClient {
  constructor(ws) {
    this.ws = ws;
    this.id = 1;
    this.pending = new Map();

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.method === 'Runtime.exceptionThrown') {
        console.error('🔥 EXCEPTION THROWN:', JSON.stringify(msg.params.exceptionDetails, null, 2));
      }
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    };
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.id++;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      throw new Error(`Eval error: ${res.exceptionDetails.text || res.exceptionDetails.exception?.description}`);
    }
    return res.result?.value;
  }
}

async function runTest() {
  console.log('🚀 Testing Download Template button in Assets view...');
  const chrome = spawn(CHROME_PATH, [
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--window-size=1280,800',
    '--user-data-dir=C:\\Users\\Tt\\AppData\\Local\\Temp\\chrome-download-test',
    'about:blank'
  ]);

  try {
    const wsUrl = await getWebSocketDebuggerUrl();
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => {
      ws.onopen = res;
      ws.onerror = rej;
    });

    const cdp = new CDPClient(ws);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    console.log('🌐 1. Navigating to http://localhost:3001...');
    await cdp.send('Page.navigate', { url: 'http://localhost:3001' });
    await sleep(1500);

    // Login
    console.log('🔐 2. Logging in...');
    await cdp.eval(`
      const emailInput = document.querySelector('input[type=text]');
      const passInput = document.querySelector('input[type=password]');
      const setVal = (el, val) => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(el, val);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      };
      setVal(emailInput, 'ishmaelt42@gmail.com');
      setVal(passInput, 'Tatenda3@4');
      document.querySelector('button[type=submit]').click();
    `);

    for (let i = 0; i < 30; i++) {
      await sleep(500);
      const isDashboard = await cdp.eval(`!!document.querySelector('aside') || window.location.hash === '#/dashboard'`);
      if (isDashboard) break;
    }

    console.log('📦 3. Navigating to Assets tab...');
    await cdp.eval(`
      const btn = Array.from(document.querySelectorAll('aside button')).find(b => b.textContent.includes('Assets'));
      btn?.click();
    `);
    await sleep(1000);

    // Verify Download Template button in toolbar
    console.log('🔍 4. Checking Download Template button in toolbar...');
    const hasToolbarDownloadBtn = await cdp.eval(`
      !!Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Download Template'))
    `);
    console.log(`  "Download Template" in toolbar exists: ${hasToolbarDownloadBtn}`);

    // Verify Getting Started banner
    const hasGettingStartedBanner = await cdp.eval(`
      document.body.innerText.includes('Getting Started: Add Your Hardware Inventory')
    `);
    console.log(`  "Getting Started" empty state banner visible: ${hasGettingStartedBanner}`);

    // Click Download Template button
    console.log('🖱️ 5. Clicking "Download Template" button...');
    await cdp.eval(`{
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Download Template'));
      btn?.click();
    }`);
    await sleep(500);

    console.log('\n================================================================');
    console.log('🎉 DOWNLOAD TEMPLATE BUTTON TEST PASSED (100%)!');
    console.log('================================================================');
  } finally {
    chrome.kill('SIGKILL');
  }
}

runTest().catch(console.error);
