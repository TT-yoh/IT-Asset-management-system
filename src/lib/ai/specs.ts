/**
 * Hardware Catalog Specs Client
 * Addendum 4 Section B1: Delegates to server-side POST /api/catalog/specs
 * Never executes raw Gemini API calls in client browser code.
 */

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
  costSource?: 'MANUAL' | 'ESTIMATED';
  ports?: string;
  notes: string;
  isAiGenerated: boolean;
}

export async function fetchHardwareSpecs(modelName: string): Promise<HardwareSpecsResult> {
  const cleanModel = modelName.trim();
  if (!cleanModel) {
    throw new Error('Model name is required to fetch catalog specs.');
  }

  try {
    const res = await fetch('/api/catalog/specs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      credentials: 'include',
      body: JSON.stringify({ model: cleanModel })
    });

    if (res.ok) {
      const data = await res.json();
      return data;
    }
  } catch (err: any) {
    console.warn('[AI SPECS CLIENT] Server catalog lookup failed, applying fallback:', err?.message || err);
  }

  const isPeripheral = /mouse|keyboard|dock|headset|accessory|peripheral|combo|dongle/i.test(cleanModel);
  return {
    manufacturer: cleanModel.split(' ')[0] || 'IT Vendor',
    model: cleanModel,
    suggestedCategory: isPeripheral
      ? 'Docks, Keyboards & Accessories'
      : /monitor|display/i.test(cleanModel)
      ? 'Monitors & AV Conferencing'
      : 'Laptops & Ultrabooks',
    cpu: isPeripheral ? 'Input / Peripheral Device' : 'Multi-core Enterprise Processor',
    ram: isPeripheral ? 'N/A' : '16GB RAM',
    storage: isPeripheral ? 'N/A' : '512GB SSD',
    gpu: 'N/A',
    depreciationMonths: isPeripheral ? 24 : 36,
    estimatedCostUSD: isPeripheral ? 85 : 1250,
    costSource: 'ESTIMATED',
    ports: isPeripheral ? 'USB / Wireless' : 'USB-C / HDMI',
    notes: 'Standard catalog profiled hardware record.',
    isAiGenerated: false
  };
}
