import { spawn } from 'child_process';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DEBUG_PORT = 9338;

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
      throw new Error(`Eval error: ${JSON.stringify(res.exceptionDetails)}`);
    }
    return res.result?.value;
  }
}

async function run() {
  console.log('🚀 Testing Login with admin@mineazy.com in Headless Chrome...');
  const chromeProcess = spawn(CHROME_PATH, [
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--user-data-dir=C:\\Users\\Tt\\AppData\\Local\\Temp\\chrome-test-mineazy'
  ]);

  try {
    const wsUrl = await getWebSocketDebuggerUrl();
    const ws = new WebSocket(wsUrl);
    await new Promise(res => { ws.onopen = res; });
    const cdp = new CDPClient(ws);

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    console.log('🌐 1. Navigating to http://localhost:3001...');
    await cdp.send('Page.navigate', { url: 'http://localhost:3001' });
    await sleep(3000);

    // Check if App Test & Demo Account banner is visible
    const bannerVisible = await cdp.eval(`
      document.body.innerText.includes('App Test & Demo Account') &&
      document.body.innerText.includes('admin@mineazy.com')
    `);
    console.log('  App Test & Demo Account banner visible:', bannerVisible);
    if (!bannerVisible) throw new Error('Demo banner not visible!');

    // Click "Quick Fill" button
    console.log('🖱️ 2. Clicking "Quick Fill" button...');
    await cdp.eval(`
      (() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Quick Fill'));
        if (btn) btn.click();
      })()
    `);
    await sleep(500);

    const emailValue = await cdp.eval(`document.querySelector('input[type=text]')?.value || ''`);
    console.log('  Populated email field:', emailValue);
    if (emailValue !== 'admin@mineazy.com') {
      throw new Error(`Expected admin@mineazy.com but got "${emailValue}"`);
    }

    // Click "Sign In to Workspace"
    console.log('🔐 3. Clicking "Sign In to Workspace"...');
    await cdp.eval(`
      (() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Sign In to Workspace'));
        if (btn) btn.click();
      })()
    `);
    await sleep(3500);

    const loggedInStatus = await cdp.eval(`
      (() => {
        const text = document.body.innerText;
        return {
          hasDashboard: text.includes('Fleet Dashboard') || text.includes('Hardware') || text.includes('Overview'),
          hasMineazy: text.includes('Mineazy') || text.includes('MZ-HQ-01'),
          hasAdmin: text.includes('Mineazy Admin') || text.includes('ADMIN')
        };
      })()
    `);
    console.log('  Post-login state:', loggedInStatus);

    if (!loggedInStatus.hasMineazy && !loggedInStatus.hasDashboard) {
      throw new Error('Dashboard not reached after logging in');
    }

    console.log('\n================================================================');
    console.log('🎉 BROWSER LOGIN FOR admin@mineazy.com PASSED 100%!');
    console.log('================================================================');
  } finally {
    chromeProcess.kill();
  }
}

run().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
