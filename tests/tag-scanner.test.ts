import { resolveAssetFromScan } from '../src/components/QuickScannerModal';
import { Asset } from '../src/types';

const mockAssets: Asset[] = [
  {
    id: 'ast-101',
    orgId: 'org-demo',
    branchId: 'br-1',
    branchName: 'Johannesburg HQ',
    categoryId: 'cat-laptops',
    categoryName: 'Laptops',
    assetCode: 'OMNI-LPT-901',
    name: 'MacBook Pro 16" M3 Max',
    model: 'Apple A2991',
    serialNumber: 'C02G8010MD6M',
    macAddress: 'F0:18:98:3A:4B:5C',
    status: 'ACTIVE',
    condition: 'NEW',
    purchaseDate: '2025-01-15',
    purchaseCost: 3499,
    warrantyExpiry: '2027-01-15',
    currentValue: 3200,
    imageUrl: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8',
    notes: '64GB RAM / 1TB SSD / Liquid Retina XDR'
  },
  {
    id: 'ast-102',
    orgId: 'org-demo',
    branchId: 'br-2',
    branchName: 'Cape Town Office',
    categoryId: 'cat-phones',
    categoryName: 'Smartphones',
    assetCode: 'OMNI-PHN-204',
    name: 'iPhone 15 Pro Max',
    model: 'Apple A3106',
    serialNumber: 'DN6W8091N8F3',
    imeiNumber: '354891091234567',
    phoneNumber: '+27-82-555-0199',
    status: 'ACTIVE',
    condition: 'GOOD',
    purchaseDate: '2024-11-20',
    purchaseCost: 1199,
    warrantyExpiry: '2026-11-20',
    currentValue: 950,
    assignedToUserId: 'usr-44',
    assignedToUserName: 'Sarah Connor',
    assignedAt: '2025-02-01',
    imageUrl: 'https://images.unsplash.com/photo-1592750475338-74b7b21085ab'
  }
];

function runTests() {
  console.log('--- RUNNING ASSET TAG & SCANNER RESOLVER TEST SUITE ---');
  let passed = 0;
  let total = 0;

  function assert(condition: boolean, desc: string) {
    total++;
    if (condition) {
      console.log(`  ✓ [PASS] ${desc}`);
      passed++;
    } else {
      console.error(`  ✗ [FAIL] ${desc}`);
    }
  }

  // 1. Direct Asset Code scan
  const r1 = resolveAssetFromScan('OMNI-LPT-901', mockAssets);
  assert(r1.asset?.id === 'ast-101' && r1.extractedCode === 'OMNI-LPT-901', 'Direct Asset Tag match');

  // 2. Case-insensitive Asset Code
  const r2 = resolveAssetFromScan('omni-lpt-901', mockAssets);
  assert(r2.asset?.id === 'ast-101', 'Case-insensitive Asset Tag match');

  // 3. Web URL QR sticker format (?asset=...)
  const r3 = resolveAssetFromScan('https://it-asset-management-system-orpin.vercel.app/?asset=OMNI-LPT-901', mockAssets);
  assert(r3.asset?.id === 'ast-101' && r3.extractedCode === 'OMNI-LPT-901', 'Web URL with ?asset= query param match');

  // 4. Hash query URL QR format (#/?asset=...)
  const r4 = resolveAssetFromScan('https://it-asset-management-system-orpin.vercel.app/#/?asset=OMNI-PHN-204', mockAssets);
  assert(r4.asset?.id === 'ast-102' && r4.extractedCode === 'OMNI-PHN-204', 'Hash URL with #/?asset= query param match');

  // 5. Alternate query param (?code=...)
  const r5 = resolveAssetFromScan('https://omnicorp.internal/?code=OMNI-PHN-204', mockAssets);
  assert(r5.asset?.id === 'ast-102', 'Alternate ?code= param match');

  // 6. Legacy JSON QR payload
  const jsonPayload = JSON.stringify({ code: 'OMNI-LPT-901', sn: 'C02G8010MD6M' });
  const r6 = resolveAssetFromScan(jsonPayload, mockAssets);
  assert(r6.asset?.id === 'ast-101' && r6.extractedCode === 'OMNI-LPT-901', 'Legacy JSON string payload match');

  // 7. Manufacturer Serial Number scan (1D barcode)
  const r7 = resolveAssetFromScan('C02G8010MD6M', mockAssets);
  assert(r7.asset?.id === 'ast-101', 'Hardware Serial Number match');

  // 8. Cellular IMEI barcode scan (15 digits)
  const r8 = resolveAssetFromScan('354891091234567', mockAssets);
  assert(r8.asset?.id === 'ast-102', 'Cellular IMEI barcode match');

  // 9. Network MAC Address with colons
  const r9 = resolveAssetFromScan('F0:18:98:3A:4B:5C', mockAssets);
  assert(r9.asset?.id === 'ast-101', 'MAC Address with colons match');

  // 10. Network MAC Address without delimiters
  const r10 = resolveAssetFromScan('f018983a4b5c', mockAssets);
  assert(r10.asset?.id === 'ast-101', 'Normalized MAC Address without delimiters match');

  // 11. Phone SIM Line match
  const r11 = resolveAssetFromScan('+27-82-555-0199', mockAssets);
  assert(r11.asset?.id === 'ast-102', 'Phone line barcode/number match');

  // 12. Non-existent / unregistered tag
  const r12 = resolveAssetFromScan('UNKNOWN-TAG-404', mockAssets);
  assert(r12.asset === null && r12.extractedCode === 'UNKNOWN-TAG-404', 'Graceful non-match with tag extraction preserved');

  // 13. Empty / whitespace scan
  const r13 = resolveAssetFromScan('   ', mockAssets);
  assert(r13.asset === null && r13.extractedCode === '', 'Safe empty input handling');

  console.log(`\nTEST RESULTS: ${passed}/${total} assertions passed.`);
  if (passed !== total) {
    process.exit(1);
  }
}

runTests();
