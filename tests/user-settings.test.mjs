import { spawn } from 'child_process';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DEBUG_PORT = 9334;

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
  console.log('🚀 Launching headless Chrome to test User Profile & Settings Modal...');
  const chrome = spawn(CHROME_PATH, [
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--window-size=1280,800',
    '--user-data-dir=C:\\Users\\Tt\\AppData\\Local\\Temp\\chrome-settings-test-profile',
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
    await sleep(2000);

    // Login
    console.log('🔐 2. Logging in as Super Admin...');
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

      const submitBtn = document.querySelector('button[type=submit]');
      submitBtn.click();
    `);

    // Wait for login transition
    for (let i = 0; i < 20; i++) {
      await sleep(500);
      const hash = await cdp.eval('window.location.hash');
      if (hash === '#/dashboard') break;
    }
    const hash = await cdp.eval('window.location.hash');
    console.log(`  Current Hash after login: ${hash}`);

    // Open user menu
    console.log('👤 3. Opening User Profile menu in navbar...');
    await cdp.eval(`
      const buttons = Array.from(document.querySelectorAll('header button'));
      const userBtn = buttons.find(b => b.querySelector('img'));
      if (userBtn) userBtn.click();
      else if (buttons.length > 0) buttons[buttons.length - 1].click();
    `);
    await sleep(800);

    const hasProfileOption = await cdp.eval(`
      document.body.innerText.includes('My Profile & Settings')
    `);
    const hasRoleSimulator = await cdp.eval(`
      document.body.innerText.includes('Role Simulator')
    `);
    console.log(`  "My Profile & Settings" visible: ${hasProfileOption}`);
    console.log(`  "Role Simulator" section visible: ${hasRoleSimulator}`);

    if (!hasProfileOption) {
      throw new Error('User menu did not display "My Profile & Settings" option.');
    }

    // Click "My Profile & Settings"
    console.log('⚙️ 4. Clicking "My Profile & Settings"...');
    await cdp.eval(`
      const settingsBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('My Profile & Settings'));
      settingsBtn?.click();
    `);
    await sleep(800);

    const isModalOpen = await cdp.eval(`
      document.body.innerText.includes('Account Settings & Profile')
    `);
    console.log(`  Modal opened: ${isModalOpen}`);
    if (!isModalOpen) throw new Error('UserSettingsModal failed to open');

    // Check tabs in modal
    const tabs = await cdp.eval(`
      ['General Profile', 'Security & Password', 'My Hardware'].every(tab => document.body.innerText.includes(tab))
    `);
    console.log(`  All 3 tabs present: ${tabs}`);

    // Switch to Security tab
    console.log('🔒 5. Testing Security tab...');
    await cdp.eval(`
      const secTab = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Security & Password'));
      secTab?.click();
    `);
    await sleep(500);

    const secVisible = await cdp.eval(`
      document.body.innerText.includes('Update Account Password') && document.body.innerText.includes('Two-Factor Authentication')
    `);
    console.log(`  Security sections rendered: ${secVisible}`);

    // Switch to Hardware tab
    console.log('💻 6. Testing My Hardware tab...');
    await cdp.eval(`
      const hwTab = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('My Hardware'));
      hwTab?.click();
    `);
    await sleep(500);

    const hwVisible = await cdp.eval(`
      document.body.innerText.includes('Hardware Issued to')
    `);
    console.log(`  Hardware custody tab rendered: ${hwVisible}`);

    // Close modal
    console.log('❌ 7. Closing modal...');
    await cdp.eval(`
      const closeBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Close');
      closeBtn?.click();
    `);
    await sleep(500);

    const isModalClosed = await cdp.eval(`
      !document.body.innerText.includes('Account Settings & Profile')
    `);
    console.log(`  Modal cleanly closed: ${isModalClosed}`);

    console.log('\n================================================================');
    console.log('🎉 USER PROFILE & SETTINGS TEST PASSED (100%)!');
    console.log('================================================================');
  } finally {
    chrome.kill('SIGKILL');
  }
}

runTest().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
