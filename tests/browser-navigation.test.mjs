import { spawn } from 'child_process';
import http from 'http';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DEBUG_PORT = 9333;

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

async function runBrowserTest() {
  console.log('🚀 Launching headless Chrome for browser navigation verification...');
  const chrome = spawn(CHROME_PATH, [
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--window-size=1280,800',
    '--user-data-dir=C:\\Users\\Tt\\AppData\\Local\\Temp\\chrome-nav-test-profile',
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

    // Verify initial login page
    const initialUrl = await cdp.eval('window.location.href');
    const isLoginVisible = await cdp.eval('!!document.querySelector("input[type=password]")');
    const emailVal = await cdp.eval('document.querySelector("input[type=text]")?.value || ""');
    const passVal = await cdp.eval('document.querySelector("input[type=password]")?.value || ""');

    console.log(`  Initial URL: ${initialUrl}`);
    console.log(`  Login Form Rendered: ${isLoginVisible}`);
    console.log(`  Email Field Empty: ${emailVal === ''} (value: "${emailVal}")`);
    console.log(`  Password Field Empty: ${passVal === ''}`);

    if (!isLoginVisible || emailVal !== '' || passVal !== '') {
      throw new Error('Initial login state validation failed: fields must be empty.');
    }
    console.log('  ✅ Step 1 PASS: Login Portal displayed with clean, blank input fields.\n');

    // 2. Test Activate mode toggle
    console.log('🔄 2. Testing "Activate Invite" tab & back button...');
    await cdp.eval(`
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Activate Invite'));
      btn?.click();
    `);
    await sleep(500);

    const activateUrl = await cdp.eval('window.location.hash');
    const isActivateVisible = await cdp.eval('document.body.innerText.toLowerCase().includes("staff account activation")');
    console.log(`  Hash after clicking Activate: ${activateUrl}`);
    console.log(`  Staff Account Activation view visible: ${isActivateVisible}`);

    if (activateUrl !== '#/activate' || !isActivateVisible) {
      throw new Error('Failed to switch to #/activate view');
    }

    // Click back in history to return to login
    await cdp.eval('window.history.back()');
    await sleep(500);

    const backToLoginUrl = await cdp.eval('window.location.hash');
    const isLoginBack = await cdp.eval('document.body.innerText.toLowerCase().includes("corporate sign-in")');
    console.log(`  Hash after history.back(): ${backToLoginUrl}`);
    console.log(`  Returned to Corporate Sign-In: ${isLoginBack}`);
    if (backToLoginUrl !== '#/login' || !isLoginBack) {
      throw new Error('Failed to return to #/login on history.back()');
    }
    console.log('  ✅ Step 2 PASS: Switching to Activate and clicking Back returns cleanly to #/login.\n');

    // 3. Login as Super Admin
    console.log('🔐 3. Logging in as Super Admin (ishmaelt42@gmail.com)...');
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
    let loggedIn = false;
    for (let i = 0; i < 20; i++) {
      await sleep(500);
      const hash = await cdp.eval('window.location.hash');
      const hasNavbar = await cdp.eval('!!document.querySelector("nav") || document.body.innerText.includes("OmniAsset") && !document.body.innerText.includes("Corporate Sign-In")');
      if (hash === '#/dashboard' || hasNavbar) {
        loggedIn = true;
        break;
      }
    }

    const currentHash = await cdp.eval('window.location.hash');
    console.log(`  Logged in successfully, current hash: ${currentHash}`);
    if (!loggedIn) throw new Error('Login failed or did not transition to dashboard');
    console.log('  ✅ Step 3 PASS: Authentication successful, routed to 3D Dashboard (#/dashboard).\n');

    // 4. Navigate to Assets tab
    console.log('📦 4. Navigating to Assets tab in sidebar...');
    await cdp.eval(`
      const assetsBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Assets') || b.textContent.includes('Asset Inventory'));
      assetsBtn?.click();
    `);
    await sleep(500);

    const assetsHash = await cdp.eval('window.location.hash');
    console.log(`  Current Hash: ${assetsHash}`);
    if (assetsHash !== '#/assets') throw new Error(`Expected #/assets, got ${assetsHash}`);
    console.log('  ✅ Step 4 PASS: Navigated to Assets catalog (#/assets).\n');

    // 5. Navigate to Maintenance / Repair tab
    console.log('🔧 5. Navigating to Maintenance tab in sidebar...');
    await cdp.eval(`
      const repairBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Maintenance') || b.textContent.includes('Repair'));
      repairBtn?.click();
    `);
    await sleep(500);

    const repairHash = await cdp.eval('window.location.hash');
    console.log(`  Current Hash: ${repairHash}`);
    if (repairHash !== '#/repair') throw new Error(`Expected #/repair, got ${repairHash}`);
    console.log('  ✅ Step 5 PASS: Navigated to Maintenance panel (#/repair).\n');

    // 6. Test Back button: Repair -> Assets
    console.log('⬅️ 6. Testing browser Back button (Repair -> Assets)...');
    await cdp.eval('window.history.back()');
    await sleep(500);

    const back1Hash = await cdp.eval('window.location.hash');
    console.log(`  Hash after Back button: ${back1Hash}`);
    if (back1Hash !== '#/assets') throw new Error(`Expected #/assets, got ${back1Hash}`);
    console.log('  ✅ Step 6 PASS: Back button smoothly returned to Assets (#/assets).\n');

    // 7. Test Back button: Assets -> Dashboard
    console.log('⬅️ 7. Testing browser Back button (Assets -> Dashboard)...');
    await cdp.eval('window.history.back()');
    await sleep(500);

    const back2Hash = await cdp.eval('window.location.hash');
    console.log(`  Hash after Back button: ${back2Hash}`);
    if (back2Hash !== '#/dashboard') throw new Error(`Expected #/dashboard, got ${back2Hash}`);
    console.log('  ✅ Step 7 PASS: Back button smoothly returned to Dashboard (#/dashboard).\n');

    // 8. Test Back button: Dashboard -> Login Page
    console.log('⬅️ 8. Testing browser Back button (Dashboard -> Login Page)...');
    await cdp.eval('window.history.back()');
    await sleep(1000);

    const back3Hash = await cdp.eval('window.location.hash');
    const isLoggedOut = await cdp.eval('document.body.innerText.toLowerCase().includes("corporate sign-in") || !!document.querySelector("input[type=password]")');
    console.log(`  Hash after Back button: ${back3Hash}`);
    console.log(`  Returned to Login Portal (Logged Out): ${isLoggedOut}`);
    if (back3Hash !== '#/login' || !isLoggedOut) {
      throw new Error(`Expected #/login with LoginPortal, got hash: ${back3Hash}, isLoggedOut: ${isLoggedOut}`);
    }
    console.log('  ✅ Step 8 PASS: Back button returned to Login Page (#/login) and logged out cleanly!\n');

    console.log('================================================================');
    console.log('🎉 ALL BROWSER NAVIGATION & BACK-BUTTON TESTS PASSED (100%)!');
    console.log('================================================================');
  } finally {
    chrome.kill('SIGKILL');
  }
}

runBrowserTest().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
