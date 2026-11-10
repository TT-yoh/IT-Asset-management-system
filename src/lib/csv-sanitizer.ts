/**
 * CSV / Excel Formula Injection Sanitizer (CWE-1236)
 * Prepend a single quote (') to any string beginning with formula execution triggers:
 * '=', '+', '-', '@', '\t', or '\r'.
 */
export function sanitizeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/^[=+\-@\t\r]/.test(str)) {
    return `'${str}`;
  }
  return str;
}

/**
 * Formats a single CSV row, escaping cells with quotes and sanitizing against formula injection.
 */
export function escapeCsvRow(row: unknown[]): string {
  return row
    .map(cell => {
      const sanitized = sanitizeCsvCell(cell);
      if (sanitized.includes(',') || sanitized.includes('"') || sanitized.includes('\n') || sanitized.includes('\r')) {
        return `"${sanitized.replace(/"/g, '""')}"`;
      }
      return sanitized;
    })
    .join(',');
}
