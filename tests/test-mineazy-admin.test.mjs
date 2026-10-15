// Node 18+ native fetch test

async function testApiLogin() {
  console.log('🧪 1. Testing POST /api/auth/login with admin@mineazy.com...');
  const res = await fetch('http://localhost:3001/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@mineazy.com',
      password: 'Mineazy123!'
    })
  });

  const data = await res.json();
  console.log('Login Response Status:', res.status);
  console.log('Login User Data:', data.user);

  if (res.status !== 200 || data.user?.email !== 'admin@mineazy.com' || data.user?.role !== 'ADMIN') {
    throw new Error(`API Login failed: ${JSON.stringify(data)}`);
  }

  const cookie = res.headers.get('set-cookie');
  console.log('Session Cookie received:', !!cookie);

  console.log('\n🧪 2. Testing GET /api/init with session cookie...');
  const initRes = await fetch('http://localhost:3001/api/init', {
    headers: {
      Cookie: cookie || ''
    }
  });

  const initData = await initRes.json();
  console.log('Init Response Status:', initRes.status);
  console.log('Current User from Init:', initData.currentUser);
  console.log('Branches returned:', initData.branches?.length);

  if (initRes.status !== 200 || initData.currentUser?.email !== 'admin@mineazy.com') {
    throw new Error(`Init failed: ${JSON.stringify(initData)}`);
  }

  console.log('\n================================================================');
  console.log('🎉 MINEAZY ADMIN AUTHENTICATION TESTS PASSED 100%!');
  console.log('================================================================');
}

testApiLogin().catch((err) => {
  console.error('❌ Test failed:', err.message);
  process.exit(1);
});
