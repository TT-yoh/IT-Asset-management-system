export interface HardwareSpecsResult {
  manufacturer: string;
  model: string;
  suggestedCategory: string;
  cpu: string;
  ram: string;
  storage: string;
  gpu?: string;
  depreciationMonths: number;
  estimatedCostUSD: number;
  ports?: string;
  notes: string;
  isAiGenerated: boolean;
}

/**
 * Fallback knowledge base for offline/unconfigured environment
 */
const KNOWN_HARDWARE_SPECS: Record<string, Partial<HardwareSpecsResult>> = {
  'macbook pro 16': {
    manufacturer: 'Apple',
    suggestedCategory: 'Laptop',
    cpu: 'Apple M3 Max (16-Core)',
    ram: '36GB Unified Memory',
    storage: '1TB NVMe PCIe 4.0 SSD',
    gpu: '40-Core GPU',
    depreciationMonths: 36,
    estimatedCostUSD: 3499,
    ports: '3x Thunderbolt 4 / USB-C, HDMI, SDXC, MagSafe 3',
    notes: 'Enterprise high-performance workstation for software engineering and creative teams.'
  },
  'macbook pro 14': {
    manufacturer: 'Apple',
    suggestedCategory: 'Laptop',
    cpu: 'Apple M3 Pro (12-Core)',
    ram: '18GB Unified Memory',
    storage: '512GB NVMe SSD',
    gpu: '18-Core GPU',
    depreciationMonths: 36,
    estimatedCostUSD: 1999,
    ports: '3x Thunderbolt 4 / USB-C, HDMI, MagSafe 3',
    notes: 'Standard developer / executive fleet notebook.'
  },
  'dell xps 15': {
    manufacturer: 'Dell',
    suggestedCategory: 'Laptop',
    cpu: 'Intel Core i7-13700H (14 Cores, 20 Threads)',
    ram: '32GB DDR5-5200MHz',
    storage: '1TB M.2 PCIe NVMe SSD',
    gpu: 'NVIDIA GeForce RTX 4060 8GB',
    depreciationMonths: 36,
    estimatedCostUSD: 2199,
    ports: '2x Thunderbolt 4, 1x USB-C 3.2, SD card reader',
    notes: 'Enterprise engineering powerhouse with OLED display.'
  },
  'dell latitude': {
    manufacturer: 'Dell',
    suggestedCategory: 'Laptop',
    cpu: 'Intel Core i5-1345U vPro',
    ram: '16GB DDR5',
    storage: '512GB PCIe NVMe SSD',
    gpu: 'Intel Iris Xe Graphics',
    depreciationMonths: 36,
    estimatedCostUSD: 1350,
    ports: '2x Thunderbolt 4, 2x USB-A 3.2, HDMI 2.0, RJ45',
    notes: 'Fleet standard corporate laptop with vPro remote management.'
  },
  'thinkpad t14': {
    manufacturer: 'Lenovo',
    suggestedCategory: 'Laptop',
    cpu: 'AMD Ryzen 7 PRO 7840U / Intel i7-1365U',
    ram: '32GB LPDDR5X',
    storage: '512GB PCIe Gen4 SSD',
    gpu: 'Integrated Radeon 780M / Intel Iris Xe',
    depreciationMonths: 36,
    estimatedCostUSD: 1450,
    ports: '2x Thunderbolt 4/USB4, 2x USB 3.2, HDMI 2.1, RJ-45 Gigabit',
    notes: 'Mil-spec rugged enterprise productivity laptop.'
  },
  'cisco catalyst': {
    manufacturer: 'Cisco',
    suggestedCategory: 'Networking',
    cpu: 'Multicore x86 Enterprise CPU',
    ram: '16GB System RAM',
    storage: '16GB Flash Storage',
    gpu: 'N/A',
    depreciationMonths: 60,
    estimatedCostUSD: 4800,
    ports: '48x 1G/10G SFP+ PoE+ Ports + 4x 40G Uplinks',
    notes: 'Layer 3 Enterprise Core/Distribution Switch.'
  },
  'ipad pro': {
    manufacturer: 'Apple',
    suggestedCategory: 'Smartphones & Mobile Fleet',
    cpu: 'Apple M4 Chip (9-core CPU)',
    ram: '8GB Unified RAM',
    storage: '256GB NVMe',
    gpu: '10-Core GPU with Hardware Ray Tracing',
    depreciationMonths: 24,
    estimatedCostUSD: 999,
    ports: 'Thunderbolt / USB 4 (Type-C)',
    notes: 'Field engineering & mobile inspection tablet.'
  },
  'mx master': {
    manufacturer: 'Logitech',
    suggestedCategory: 'Docks, Keyboards & Accessories',
    cpu: 'Darkfield High-Precision Optical Sensor (8000 DPI)',
    ram: 'N/A (Input Peripheral)',
    storage: 'Internal Rechargeable Li-Po (500 mAh)',
    gpu: 'N/A',
    depreciationMonths: 24,
    estimatedCostUSD: 99,
    ports: 'Bluetooth Low Energy / Logi Bolt USB Receiver, USB-C Fast Charge',
    notes: 'Flagship ergonomic wireless mouse with MagSpeed electromagnetic scrolling.'
  },
  'mx keys': {
    manufacturer: 'Logitech',
    suggestedCategory: 'Docks, Keyboards & Accessories',
    cpu: 'Spherically Dished Scissor Key Switches',
    ram: 'N/A (Input Peripheral)',
    storage: 'Internal Rechargeable Li-Po',
    gpu: 'N/A',
    depreciationMonths: 24,
    estimatedCostUSD: 119,
    ports: 'Bluetooth Low Energy / Logi Bolt USB Receiver, USB-C Charge',
    notes: 'Master series wireless keyboard with smart ambient proximity backlighting.'
  },
  'dell premier': {
    manufacturer: 'Dell',
    suggestedCategory: 'Docks, Keyboards & Accessories',
    cpu: 'Multi-Device 2.4GHz RF & Dual Bluetooth 5.0 Sensor',
    ram: 'N/A',
    storage: 'N/A',
    gpu: 'N/A',
    depreciationMonths: 24,
    estimatedCostUSD: 99,
    ports: 'USB Wireless Dongle / Dual Bluetooth 5.0 Channels',
    notes: 'Enterprise executive multi-device wireless keyboard and precision mouse combo.'
  },
  'dell pro wireless': {
    manufacturer: 'Dell',
    suggestedCategory: 'Docks, Keyboards & Accessories',
    cpu: '2.4GHz RF Optical Sensor (4000 DPI)',
    ram: 'N/A',
    storage: 'N/A',
    gpu: 'N/A',
    depreciationMonths: 24,
    estimatedCostUSD: 55,
    ports: '2.4GHz USB Dongle',
    notes: 'Standard office desktop wireless keyboard and optical mouse bundle.'
  },
  'magic keyboard': {
    manufacturer: 'Apple',
    suggestedCategory: 'Docks, Keyboards & Accessories',
    cpu: 'Touch ID Biometric Sensor & Scissor Mechanism',
    ram: 'N/A',
    storage: 'N/A',
    gpu: 'N/A',
    depreciationMonths: 24,
    estimatedCostUSD: 149,
    ports: 'Bluetooth, USB-C / Lightning Port',
    notes: 'Apple Magic Keyboard with Touch ID for Mac workstations.'
  },
  'magic mouse': {
    manufacturer: 'Apple',
    suggestedCategory: 'Docks, Keyboards & Accessories',
    cpu: 'Multi-Touch Surface Laser Tracking',
    ram: 'N/A',
    storage: 'N/A',
    gpu: 'N/A',
    depreciationMonths: 24,
    estimatedCostUSD: 79,
    ports: 'Bluetooth, Lightning / USB-C Port',
    notes: 'Wireless rechargeable multi-touch gesture mouse.'
  },
  'thunderbolt dock': {
    manufacturer: 'Dell',
    suggestedCategory: 'Docks, Keyboards & Accessories',
    cpu: 'Intel Thunderbolt 4 Controller',
    ram: 'N/A',
    storage: 'N/A',
    gpu: 'N/A',
    depreciationMonths: 36,
    estimatedCostUSD: 280,
    ports: '2x Thunderbolt 4, 3x USB-A 3.2, 2x DisplayPort 1.4, 1x HDMI 2.0, Gigabit Ethernet RJ45, 130W Power Delivery',
    notes: 'Enterprise high-speed modular Thunderbolt 4 docking station.'
  }
};

/**
 * Fetch hardware specs using the fast built-in Enterprise Hardware Catalog
 */
export async function fetchHardwareSpecs(modelName: string): Promise<HardwareSpecsResult> {
  const cleanQuery = modelName.trim();
  const lower = cleanQuery.toLowerCase();

  // Fallback heuristic matching
  for (const [key, spec] of Object.entries(KNOWN_HARDWARE_SPECS)) {
    if (lower.includes(key)) {
      return {
        manufacturer: spec.manufacturer || 'Enterprise Vendor',
        model: cleanQuery,
        suggestedCategory: spec.suggestedCategory || 'Laptops & Ultrabooks',
        cpu: spec.cpu || 'Intel Core i7 / AMD Ryzen 7',
        ram: spec.ram || '16GB RAM',
        storage: spec.storage || '512GB NVMe SSD',
        gpu: spec.gpu || 'Integrated Graphics',
        depreciationMonths: spec.depreciationMonths || 36,
        estimatedCostUSD: spec.estimatedCostUSD || 1400,
        ports: spec.ports || 'USB-C / HDMI / Audio',
        notes: spec.notes || 'Enterprise fleet hardware specification.',
        isAiGenerated: false
      };
    }
  }

  // Is this an accessory / peripheral device?
  const isPeripheral = lower.includes('mouse') || lower.includes('keyboard') || lower.includes('dock') || lower.includes('headset') || lower.includes('accessory') || lower.includes('peripheral') || lower.includes('combo') || lower.includes('dongle');

  // Generic fallback if unknown
  return {
    manufacturer: cleanQuery.split(' ')[0] || 'IT Vendor',
    model: cleanQuery,
    suggestedCategory: isPeripheral
      ? 'Docks, Keyboards & Accessories'
      : lower.includes('monitor') || lower.includes('display')
      ? 'Monitors & AV Conferencing'
      : lower.includes('server')
      ? 'Enterprise Servers & Compute'
      : lower.includes('switch') || lower.includes('router') || lower.includes('firewall')
      ? 'Networking & Security Gear'
      : lower.includes('printer')
      ? 'Printers & Fleet Scanners'
      : 'Laptops & Ultrabooks',
    cpu: isPeripheral ? 'Input / Peripheral Device' : 'Intel Core i5/i7 or AMD Ryzen Enterprise',
    ram: isPeripheral ? 'N/A' : '16GB DDR4/DDR5',
    storage: isPeripheral ? 'N/A' : '512GB NVMe SSD',
    gpu: 'N/A',
    depreciationMonths: isPeripheral ? 24 : 36,
    estimatedCostUSD: lower.includes('mouse') ? 60 : lower.includes('keyboard') ? 80 : lower.includes('combo') ? 65 : lower.includes('dock') ? 220 : 1100,
    ports: isPeripheral ? 'USB-C / Bluetooth Wireless' : 'USB-C, USB-A, HDMI, DisplayPort',
    notes: isPeripheral ? 'Enterprise input peripheral / workstation accessory.' : 'Auto-profiled hardware record.',
    isAiGenerated: false
  };
}
