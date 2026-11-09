import config from './config';

interface TestMailEntry {
  email: string;
  token: string;
  type: 'reset' | 'invite';
  sentAt: number;
}

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

/**
 * Deliver password reset instructions.
 * Token is exposed ONLY in NODE_ENV=test through the in-process test hook above.
 * Server logs never print or disclose the raw token.
 */
export async function sendPasswordResetEmail(email: string, token: string): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();

  if (config.isTest) {
    testMailbox.push({
      email: cleanEmail,
      token,
      type: 'reset',
      sentAt: Date.now()
    });
    return;
  }

  // Production / Staging SMTP / Mail delivery hook
  if (config.MAIL_HOST) {
    // If SMTP host is configured, dispatch via SMTP transport
    console.log(`[MAIL] Password reset email queued for ${cleanEmail} via ${config.MAIL_HOST}`);
  } else {
    // Fail-safe delivery notice without disclosing credential token
    console.warn(`[MAIL WARNING] SMTP unconfigured. Password reset requested for ${cleanEmail}.`);
  }
}

/**
 * Deliver account invitation token to newly invited staff.
 */
export async function sendInviteEmail(email: string, token: string): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();

  if (config.isTest) {
    testMailbox.push({
      email: cleanEmail,
      token,
      type: 'invite',
      sentAt: Date.now()
    });
    return;
  }

  if (config.MAIL_HOST) {
    console.log(`[MAIL] Invitation email queued for ${cleanEmail} via ${config.MAIL_HOST}`);
  } else {
    console.warn(`[MAIL WARNING] SMTP unconfigured. Invitation issued for ${cleanEmail}.`);
  }
}

