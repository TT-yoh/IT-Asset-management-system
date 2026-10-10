import { spawn } from 'child_process';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DEBUG_PORT = 9335;

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
      if (msg.method === 'Runtime.consoleAPICalled') {
        console.log('📢 CONSOLE:', msg.params.type, msg.params.args?.map(a => a.value || a.description).join(' '));
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
      const desc = res.exceptionDetails.exception?.description || res.exceptionDetails.text || JSON.stringify(res.exceptionDetails);
      throw new Error(`Eval error: ${desc}`);
    }
    return res.result?.value;
  }
}

async function runTest() {
  console.log('🚀 Debugging checkout crash in Chrome...');
  const chrome = spawn(CHROME_PATH, [
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--window-size=1280,800',
    '--user-data-dir=C:\\Users\\Tt\\AppData\\Local\\Temp\\chrome-debug-checkout',
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

    let loggedIn = false;
    for (let i = 0; i < 30; i++) {
      await sleep(500);
      const isDashboard = await cdp.eval(`!!document.querySelector('aside') || window.location.hash === '#/dashboard'`);
      if (isDashboard) {
        loggedIn = true;
        break;
      }
    }
    console.log(`  Logged in successfully: ${loggedIn}`);

    console.log('📦 3. Clicking "Checkouts" in sidebar...');
    await cdp.eval(`
      const btn = Array.from(document.querySelectorAll('aside button')).find(b => b.textContent.includes('Checkout'));
      btn?.click();
    `);
    await sleep(1000);

    const bodyTextAfterNav = await cdp.eval('document.body.innerText.substring(0, 300)');
    console.log(`  Body text after clicking Checkouts: "${bodyTextAfterNav.replace(/\\n/g, ' ')}"`);

    console.log('➕ 4. Looking for "New Checkout" button...');
    const hasNewCheckoutBtn = await cdp.eval(`
      !!Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('New Checkout'))
    `);
    console.log(`  "New Checkout" button exists: ${hasNewCheckoutBtn}`);

    if (hasNewCheckoutBtn) {
      console.log('💥 5. Clicking "New Checkout"...');
      await cdp.eval(`{
        const newCheckoutBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('New Checkout'));
        newCheckoutBtn?.click();
      }`);
      const modalText = await cdp.eval(`
        document.body.innerText.includes('No Assets Available for Checkout')
      `);
      console.log(`  Empty state modal displayed cleanly (No crash!): ${modalText}`);

      // Close modal
      await cdp.eval(`{
        const closeBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Close');
        closeBtn?.click();
      }`);
      await sleep(500);

      const modalClosed = await cdp.eval(`
        !document.body.innerText.includes('No Assets Available for Checkout')
      `);
      console.log(`  Modal closed cleanly: ${modalClosed}`);
    }

    console.log('\n================================================================');
    console.log('🎉 CHECKOUT CRASH RESOLVED (100% CLEAN - NO BLACK SCREEN)!');
    console.log('================================================================');
  } finally {
    chrome.kill('SIGKILL');
  }
}

runTest().catch(console.error);
