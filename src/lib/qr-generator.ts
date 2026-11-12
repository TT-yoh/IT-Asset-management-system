import QRCode from 'qrcode';

/**
 * Generates an in-process local QR code Data URL (PNG).
 * Eliminates external third-party QR code image dependencies (e.g. api.qrserver.com)
 * to prevent leakage of asset identifiers, TOTP secrets, or tenant metadata.
 */
export async function generateQrDataUrl(
  text: string,
  options?: { width?: number; margin?: number; color?: { dark?: string; light?: string } }
): Promise<string> {
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: 'M',
    margin: options?.margin ?? 1,
    width: options?.width ?? 200,
    color: options?.color ?? {
      dark: '#000000',
      light: '#ffffff'
    }
  });
}

