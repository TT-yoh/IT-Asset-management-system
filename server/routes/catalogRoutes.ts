import { Router, Request, Response } from 'express';
import { z } from 'zod';
import config from '../config';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';

export const catalogRouter = Router();

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
  costSource: 'ESTIMATED';
  ports?: string;
  notes: string;
  isAiGenerated: boolean;
}

const SpecsQuerySchema = z.object({
  model: z.string().trim().min(1, 'Model name is required').max(200, 'Model name exceeds 200 characters'),
  category: z.string().trim().max(100).optional(),
  manufacturer: z.string().trim().max(100).optional()
});

/**
 * Sanitizes untrusted text by stripping HTML tags, control characters,
 * collapsing redundant whitespace, and enforcing maximum length.
 */
function sanitizeUntrustedText(val: unknown, maxLength: number): string {
  if (typeof val !== 'string') return '';
  return val
    .replace(/<[^>]*>/g, '')
    .replace(/[\x00-\x1F\x7F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

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
    notes: 'Enterprise high-performance workstation for engineering.'
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
    notes: 'Standard developer and management fleet notebook.'
  },
  'macbook air': {
    manufacturer: 'Apple',
    suggestedCategory: 'Laptop',
    cpu: 'Apple M3 (8-Core)',
    ram: '16GB Unified Memory',
    storage: '512GB SSD',
    gpu: '10-Core GPU',
    depreciationMonths: 36,
    estimatedCostUSD: 1299,
    ports: '2x Thunderbolt 4, MagSafe 3, 3.5mm Headphone',
    notes: 'Standard enterprise business laptop.'
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
    notes: 'Enterprise engineering powerhouse with high-res display.'
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
  'thinkpad x1 carbon': {
    manufacturer: 'Lenovo',
    suggestedCategory: 'Laptop',
    cpu: 'Intel Core Ultra 7 165U',
    ram: '32GB LPDDR5X',
    storage: '1TB PCIe Gen4 SSD',
    gpu: 'Intel Graphics',
    depreciationMonths: 36,
    estimatedCostUSD: 1850,
    ports: '2x Thunderbolt 4, 2x USB-A 3.2, HDMI 2.1, Audio combo',
    notes: 'Ultralight executive enterprise laptop.'
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
    ports: 'Thunderbolt / USB 4',
    notes: 'Field telemetry and executive mobile computing unit.'
  },
  'iphone': {
    manufacturer: 'Apple',
    suggestedCategory: 'Smartphones & Mobile Fleet',
    cpu: 'Apple A17 Pro / A18 Bionic',
    ram: '8GB RAM',
    storage: '256GB NVMe',
    gpu: 'Apple 6-Core GPU',
    depreciationMonths: 24,
    estimatedCostUSD: 1099,
    ports: 'USB-C (USB 3 10Gbps)',
    notes: 'Enterprise fleet corporate mobile phone.'
  },
  'dell ultrasharp': {
    manufacturer: 'Dell',
    suggestedCategory: 'Monitors & AV Conferencing',
    cpu: 'N/A',
    ram: 'N/A',
    storage: 'N/A',
    gpu: 'N/A',
    depreciationMonths: 48,
    estimatedCostUSD: 650,
    ports: '1x Thunderbolt 4 upstream, 1x Thunderbolt 4 downstream, 1x HDMI 2.1, 1x DisplayPort 1.4, RJ-45 Gigabit Ethernet',
    notes: 'Hub monitor with power delivery and network pass-through.'
  },
  'thunderbolt dock': {
    manufacturer: 'CalDigit / Dell',
    suggestedCategory: 'Docks, Keyboards & Accessories',
    cpu: 'Intel Goshen Ridge Controller',
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
 * Addendum 4 Section B1: Server-side AI Catalog Specs Lookup
 * POST /api/catalog/specs
 * Authenticated, Zod-validated input, Gemini key protected on the server.
 */
catalogRouter.post('/specs', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const parseResult = SpecsQuerySchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: 'Invalid request payload',
      details: parseResult.error.flatten().fieldErrors
    });
    return;
  }

  const { model: rawModel } = parseResult.data;
  const cleanQuery = sanitizeUntrustedText(rawModel, 200);
  const lower = cleanQuery.toLowerCase();

  // 1. Check local authoritative enterprise hardware specs cache
  for (const [key, spec] of Object.entries(KNOWN_HARDWARE_SPECS)) {
    if (lower.includes(key)) {
      const result: HardwareSpecsResult = {
        manufacturer: sanitizeUntrustedText(spec.manufacturer || 'Enterprise Vendor', 100),
        model: cleanQuery,
        suggestedCategory: sanitizeUntrustedText(spec.suggestedCategory || 'Laptops & Ultrabooks', 100),
        cpu: sanitizeUntrustedText(spec.cpu || 'Intel Core i7 / AMD Ryzen 7', 150),
        ram: sanitizeUntrustedText(spec.ram || '16GB RAM', 100),
        storage: sanitizeUntrustedText(spec.storage || '512GB NVMe SSD', 100),
        gpu: sanitizeUntrustedText(spec.gpu || 'Integrated Graphics', 100),
        depreciationMonths: spec.depreciationMonths || 36,
        estimatedCostUSD: Number(spec.estimatedCostUSD || 1400),
        costSource: 'ESTIMATED',
        ports: sanitizeUntrustedText(spec.ports || 'USB-C / HDMI / Audio', 200),
        notes: sanitizeUntrustedText(spec.notes || 'Enterprise fleet hardware specification.', 500),
        isAiGenerated: false
      };

      res.json(result);
      return;
    }
  }

  // 2. If Gemini API key is configured on server, query Gemini
  if (config.GEMINI_API_KEY && config.GEMINI_API_KEY.trim().length > 10) {
    try {
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });
      const prompt = `Analyze this IT hardware model: "${cleanQuery}".
Return strict JSON matching this exact structure:
{
  "manufacturer": "string",
  "suggestedCategory": "Laptop" | "Desktop Workstation" | "Server" | "Networking" | "Mobile" | "Display" | "Peripherals",
  "cpu": "string",
  "ram": "string",
  "storage": "string",
  "gpu": "string",
  "depreciationMonths": number,
  "estimatedCostUSD": number,
  "ports": "string",
  "notes": "string"
}`;

      const aiResponse = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: prompt
      });

      if (aiResponse && aiResponse.text) {
        const jsonMatch = aiResponse.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          const result: HardwareSpecsResult = {
            manufacturer: sanitizeUntrustedText(parsed.manufacturer || cleanQuery.split(' ')[0] || 'IT Vendor', 100),
            model: cleanQuery,
            suggestedCategory: sanitizeUntrustedText(parsed.suggestedCategory || 'Laptops & Ultrabooks', 100),
            cpu: sanitizeUntrustedText(parsed.cpu || 'Multi-core Enterprise Processor', 150),
            ram: sanitizeUntrustedText(parsed.ram || '16GB RAM', 100),
            storage: sanitizeUntrustedText(parsed.storage || '512GB SSD', 100),
            gpu: sanitizeUntrustedText(parsed.gpu || 'Integrated', 100),
            depreciationMonths: Number(parsed.depreciationMonths) || 36,
            estimatedCostUSD: Math.max(0, Number(parsed.estimatedCostUSD) || 1200),
            costSource: 'ESTIMATED',
            ports: sanitizeUntrustedText(parsed.ports || 'Standard I/O', 200),
            notes: sanitizeUntrustedText(parsed.notes || 'AI-generated catalog specifications.', 500),
            isAiGenerated: true
          };

          res.json(result);
          return;
        }
      }
    } catch (err: any) {
      console.warn('[SERVER AI LOOKUP] Gemini query failed, using rule-based profile:', err.message);
    }
  }

  // 3. Fallback heuristic profile
  const isPeripheral = /mouse|keyboard|dock|headset|accessory|peripheral|combo|dongle/i.test(lower);
  const fallbackResult: HardwareSpecsResult = {
    manufacturer: sanitizeUntrustedText(cleanQuery.split(' ')[0] || 'IT Vendor', 100),
    model: cleanQuery,
    suggestedCategory: isPeripheral
      ? 'Docks, Keyboards & Accessories'
      : /monitor|display/i.test(lower)
      ? 'Monitors & AV Conferencing'
      : /server/i.test(lower)
      ? 'Enterprise Servers & Compute'
      : /switch|router|firewall/i.test(lower)
      ? 'Networking & Security Gear'
      : /printer/i.test(lower)
      ? 'Printers & Fleet Scanners'
      : 'Laptops & Ultrabooks',
    cpu: isPeripheral ? 'Input / Peripheral Device' : 'Intel Core i5/i7 or AMD Ryzen Enterprise',
    ram: isPeripheral ? 'N/A' : '16GB DDR4/DDR5',
    storage: isPeripheral ? 'N/A' : '512GB NVMe SSD',
    gpu: 'N/A',
    depreciationMonths: isPeripheral ? 24 : 36,
    estimatedCostUSD: isPeripheral ? 85 : 1250,
    costSource: 'ESTIMATED',
    ports: isPeripheral ? 'USB / Wireless' : 'USB-C, USB-A, HDMI',
    notes: 'Standard catalog profiled hardware record.',
    isAiGenerated: false
  };

  res.json(fallbackResult);
}));

/**
 * Addendum 4 Section B1: Server-side AI Assistant Endpoint
 * POST /api/catalog/chat
 * Authenticated chat endpoint that shields client from Gemini keys.
 */
catalogRouter.post('/chat', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const { prompt } = req.body;
  if (!prompt || typeof prompt !== 'string') {
    res.status(400).json({ error: 'Prompt is required.' });
    return;
  }

  const cleanPrompt = sanitizeUntrustedText(prompt, 1000);

  if (config.GEMINI_API_KEY && config.GEMINI_API_KEY.trim().length > 10) {
    try {
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });
      const systemPrompt = `You are OmniAsset AI, an intelligent IT asset management assistant.
Answer concisely with professional IT recommendations regarding asset maintenance, lifecycle, procurement, and diagnostics.
Never generate raw HTML or script tags. Length max 1000 characters.`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: `${systemPrompt}\n\nUser Question: ${cleanPrompt}`
      });

      if (response && response.text) {
        res.json({ reply: sanitizeUntrustedText(response.text, 1000) });
        return;
      }
    } catch (err: any) {
      console.warn('[SERVER AI CHAT] Gemini failed, using rule-based reply:', err.message);
    }
  }

  // Built-in rule-based expert assistance when GEMINI_API_KEY is not configured
  const lower = cleanPrompt.toLowerCase();
  let defaultReply = 'OmniAsset Telemetry: Operating in enterprise rule-based intelligence mode. All asset records are tracked in TiDB Cloud with tamper-evident audit hashing.';

  if (lower.includes('macbook') || lower.includes('apple')) {
    defaultReply = 'Apple silicon devices (M1-M4) generally experience 36-month straight-line depreciation with strong residual salvage value (~15-20%). Ensure FileVault and MDM enrollment.';
  } else if (lower.includes('replace') || lower.includes('lifecycle')) {
    defaultReply = 'Recommended lifecycle threshold: 3 years for developer laptops, 4-5 years for network switches and monitors. Devices older than 48 months should be flagged for write-off or refresh.';
  } else if (lower.includes('maintenance') || lower.includes('repair')) {
    defaultReply = 'For hardware undergoing repair, transition asset status to "REPAIR" to pause checkout availability. Record repair costs and technician details upon completion.';
  } else if (lower.includes('audit')) {
    defaultReply = 'OmniAsset implements cryptographic SHA-256 / HMAC audit chaining. Every physical scan, state mutation, and branch transfer is permanently anchored to the ledger.';
  }

  res.json({ reply: defaultReply });
}));

