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
    suggestedCategory: 'Mobile / Tablet',
    cpu: 'Apple M4 Chip (9-core CPU)',
    ram: '8GB Unified RAM',
    storage: '256GB NVMe',
    gpu: '10-Core GPU with Hardware Ray Tracing',
    depreciationMonths: 24,
    estimatedCostUSD: 999,
    ports: 'Thunderbolt / USB 4 (Type-C)',
    notes: 'Field engineering & mobile inspection tablet.'
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
        suggestedCategory: spec.suggestedCategory || 'Laptop',
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

  // Generic fallback if unknown
  return {
    manufacturer: cleanQuery.split(' ')[0] || 'IT Vendor',
    model: cleanQuery,
    suggestedCategory: lower.includes('monitor') ? 'Monitor' : lower.includes('server') ? 'Server' : lower.includes('switch') ? 'Networking' : 'Laptop',
    cpu: 'Intel Core i5/i7 or AMD Ryzen Enterprise',
    ram: '16GB DDR4/DDR5',
    storage: '512GB NVMe SSD',
    gpu: 'Integrated Graphics',
    depreciationMonths: 36,
    estimatedCostUSD: 1100,
    ports: 'USB-C, USB-A, HDMI, DisplayPort',
    notes: 'Auto-profiled hardware record.',
    isAiGenerated: false
  };
}
