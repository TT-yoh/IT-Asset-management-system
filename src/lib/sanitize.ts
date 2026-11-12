/**
 * Shared Scanner & Input Sanitization
 *
 * Enforces security constraints on scanned barcodes, QR codes, and manual tags:
 * 1. Truncates length to max 256 characters (prevents buffer/memory bloat).
 * 2. Strips leading CSV / spreadsheet formula injection characters (=, +, -, @, \t, \r, \n).
 * 3. Strips non-printable ASCII control characters.
 */
export function sanitizeScanInput(raw: string): string {
  if (!raw) return '';
  let sanitized = String(raw).slice(0, 256).trim();
  sanitized = sanitized.replace(/^[=+\-@\t\r\n]+/, '').trim();
  sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');
  return sanitized;
}

