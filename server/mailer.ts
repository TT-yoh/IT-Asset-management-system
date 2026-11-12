import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import config from './config';

interface TestMailEntry {
  email: string;
  token: string;
  type: 'reset' | 'invite';
  sentAt: number;
}

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface MailDeliveryResult {
  /** True only when the SMTP server accepted the message. */
  delivered: boolean;
  /** Why the message was not delivered. Never contains the token. */
  reason?: 'test-mailbox' | 'unconfigured' | 'failed';
}

const RESET_TOKEN_TTL_MINUTES = 30;

// In-process test mailbox hook (active strictly in NODE_ENV === 'test')
const testMailbox: TestMailEntry[] = [];

export function getLatestTestPasswordResetToken(email: string): string | undefined {
  if (!config.isTest) return undefined;
  const cleanEmail = email.trim().toLowerCase();
  for (let i = testMailbox.length - 1; i >= 0; i--) {
    if (testMailbox[i]!.email === cleanEmail && testMailbox[i]!.type === 'reset') {
      return testMailbox[i]!.token;
    }
  }
  return undefined;
}

export function getLatestTestInviteToken(email: string): string | undefined {
  if (!config.isTest) return undefined;
  const cleanEmail = email.trim().toLowerCase();
  for (let i = testMailbox.length - 1; i >= 0; i--) {
    if (testMailbox[i]!.email === cleanEmail && testMailbox[i]!.type === 'invite') {
      return testMailbox[i]!.token;
    }
  }
  return undefined;
}

export function clearTestMailbox(): void {
  testMailbox.length = 0;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Public base URL of the web app, used to build links in emails.
 * APP_BASE_URL wins; otherwise the first explicit CORS origin is used.
 */
export function resolveAppBaseUrl(
  appBaseUrl: string | undefined = config.APP_BASE_URL,
  corsOrigins: readonly string[] = config.CORS_ORIGINS
): string | undefined {
  const candidate = appBaseUrl || corsOrigins.find((origin) => /^https?:\/\//i.test(origin));
  return candidate ? candidate.replace(/\/+$/, '') : undefined;
}

/**
 * Links carry the token in the URL fragment, which browsers never send to the
 * server and which the client strips from the address bar on load.
 */
function buildFragmentLink(baseUrl: string | null | undefined, route: string, token: string): string | undefined {
  if (!baseUrl) return undefined;
  return `${baseUrl}/#${route}?token=${encodeURIComponent(token)}`;
}

function renderHtml(heading: string, intro: string, actionLabel: string, link: string | undefined, codeLabel: string, token: string, footer: string): string {
  const button = link
    ? `<p style="margin:24px 0"><a href="${escapeHtml(link)}" style="background:#059669;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">${escapeHtml(actionLabel)}</a></p>
       <p style="font-size:13px;color:#475569">If the button does not work, copy this link into your browser:<br><span style="word-break:break-all">${escapeHtml(link)}</span></p>`
    : '';
  return `<!doctype html>
<html lang="en"><body style="margin:0;padding:24px;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:28px">
    <h1 style="font-size:18px;margin:0 0 12px">${escapeHtml(heading)}</h1>
    <p style="font-size:14px;line-height:1.6;margin:0">${escapeHtml(intro)}</p>
    ${button}
    <p style="font-size:13px;color:#475569;margin:20px 0 6px">${escapeHtml(codeLabel)}</p>
    <p style="font-family:Consolas,Menlo,monospace;font-size:14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px;word-break:break-all;margin:0">${escapeHtml(token)}</p>
    <p style="font-size:12px;color:#64748b;line-height:1.6;margin:24px 0 0">${escapeHtml(footer)}</p>
  </div>
</body></html>`;
}

export function buildPasswordResetMessage(email: string, token: string, baseUrl: string | null | undefined = resolveAppBaseUrl()): MailMessage {
  const link = buildFragmentLink(baseUrl, '/reset', token);
  const intro = `We received a request to reset the OmniAsset password for ${email}. This reset code expires in ${RESET_TOKEN_TTL_MINUTES} minutes and can be used once.`;
  const footer = 'If you did not request this, you can ignore this email. Your password will not change.';
  const text = [
    intro,
    '',
    link ? `Reset your password: ${link}` : 'Open the OmniAsset sign-in page, choose "Forgot password?" and then "I already have a reset code".',
    '',
    `Reset code: ${token}`,
    '',
    footer
  ].join('\n');
  return {
    to: email,
    subject: 'Reset your OmniAsset password',
    text,
    html: renderHtml('Reset your password', intro, 'Reset password', link, 'Or enter this reset code on the sign-in page:', token, footer)
  };
}

export function buildInviteMessage(email: string, token: string, baseUrl: string | null | undefined = resolveAppBaseUrl()): MailMessage {
  const link = buildFragmentLink(baseUrl, 'activate', token);
  const intro = `You have been invited to join your organization's OmniAsset workspace as ${email}. Activate your account to choose a password and sign in.`;
  const footer = 'If you were not expecting this invitation, you can ignore this email.';
  const text = [
    intro,
    '',
    link ? `Activate your account: ${link}` : 'Open the OmniAsset sign-in page and choose "Activate Invite".',
    '',
    `Invitation code: ${token}`,
    '',
    footer
  ].join('\n');
  return {
    to: email,
    subject: 'You have been invited to OmniAsset',
    text,
    html: renderHtml('Activate your OmniAsset account', intro, 'Activate account', link, 'Or enter this invitation code on the sign-in page:', token, footer)
  };
}

let cachedTransport: Transporter | null = null;

function getSender(): string | undefined {
  return config.MAIL_FROM || config.MAIL_USER;
}

function getTransport(): Transporter | null {
  if (!config.MAIL_HOST || !getSender()) return null;
  if (!cachedTransport) {
    const port = config.MAIL_PORT || 587;
    cachedTransport = nodemailer.createTransport({
      host: config.MAIL_HOST,
      port,
      secure: port === 465,
      // Tokens travel in these messages: never fall back to plaintext SMTP in production.
      requireTLS: config.isProduction && port !== 465,
      auth: config.MAIL_USER ? { user: config.MAIL_USER, pass: config.MAIL_PASS || '' } : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000
    });
  }
  return cachedTransport;
}

/**
 * Send one message. Never throws and never logs message content, so callers
 * cannot leak account existence through errors and tokens stay out of logs.
 */
export async function deliverMail(
  message: MailMessage,
  kind: 'reset' | 'invite',
  transport: Transporter | null = getTransport(),
  from: string | undefined = getSender()
): Promise<MailDeliveryResult> {
  if (!transport || !from) {
    console.warn(`[MAIL WARNING] SMTP is not configured (set MAIL_HOST and MAIL_FROM). ${kind} email was NOT sent.`);
    return { delivered: false, reason: 'unconfigured' };
  }
  try {
    await transport.sendMail({ from, to: message.to, subject: message.subject, text: message.text, html: message.html });
    console.log(`[MAIL] ${kind} email accepted by SMTP server.`);
    return { delivered: true };
  } catch (err: any) {
    console.error(`[MAIL ERROR] ${kind} email could not be sent: ${err?.code || err?.name || 'unknown error'}`);
    return { delivered: false, reason: 'failed' };
  }
}

/**
 * Deliver password reset instructions.
 * Token is exposed ONLY in NODE_ENV=test through the in-process test hook above.
 * Server logs never print or disclose the raw token or the recipient.
 */
export async function sendPasswordResetEmail(email: string, token: string): Promise<MailDeliveryResult> {
  const cleanEmail = email.trim().toLowerCase();

  if (config.isTest) {
    testMailbox.push({ email: cleanEmail, token, type: 'reset', sentAt: Date.now() });
    return { delivered: false, reason: 'test-mailbox' };
  }

  return deliverMail(buildPasswordResetMessage(cleanEmail, token), 'reset');
}

/**
 * Deliver account invitation token to newly invited staff.
 */
export async function sendInviteEmail(email: string, token: string): Promise<MailDeliveryResult> {
  const cleanEmail = email.trim().toLowerCase();

  if (config.isTest) {
    testMailbox.push({ email: cleanEmail, token, type: 'invite', sentAt: Date.now() });
    return { delivered: false, reason: 'test-mailbox' };
  }

  return deliverMail(buildInviteMessage(cleanEmail, token), 'invite');
}
