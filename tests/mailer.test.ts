/**
 * Mailer unit tests: message content, link building, and delivery behaviour.
 * No network access: delivery runs against nodemailer's in-memory JSON transport
 * and a deliberately failing transport.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import nodemailer from 'nodemailer';
import {
  buildInviteMessage,
  buildPasswordResetMessage,
  clearTestMailbox,
  deliverMail,
  getLatestTestInviteToken,
  getLatestTestPasswordResetToken,
  resolveAppBaseUrl,
  sendInviteEmail,
  sendPasswordResetEmail
} from '../server/mailer';

const TOKEN = 'rst_abc123+/=XYZ';

test('resolveAppBaseUrl prefers APP_BASE_URL and strips trailing slashes', () => {
  assert.equal(resolveAppBaseUrl('https://assets.example.com/', ['https://other.example.com']), 'https://assets.example.com');
});

test('resolveAppBaseUrl falls back to the first explicit CORS origin', () => {
  assert.equal(resolveAppBaseUrl(undefined, ['*', 'https://app.example.com']), 'https://app.example.com');
  assert.equal(resolveAppBaseUrl(undefined, ['*']), undefined);
  assert.equal(resolveAppBaseUrl(undefined, []), undefined);
});

test('password reset message links to the reset screen with the token in the URL fragment', () => {
  const msg = buildPasswordResetMessage('user@example.com', TOKEN, 'https://assets.example.com');
  const expectedLink = `https://assets.example.com/#/reset?token=${encodeURIComponent(TOKEN)}`;
  assert.equal(msg.to, 'user@example.com');
  assert.match(msg.subject, /reset/i);
  assert.ok(msg.text.includes(expectedLink), 'plain text contains the reset link');
  assert.ok(msg.text.includes(`Reset code: ${TOKEN}`), 'plain text contains the raw code for manual entry');
  assert.ok(msg.html.includes(expectedLink.replace(/&/g, '&amp;')), 'html contains the reset link');
  assert.match(msg.text, /30 minutes/);
  // Token must sit after the "#" so it is never sent to a server in a request line or Referer.
  assert.ok(expectedLink.indexOf('#') < expectedLink.indexOf('token='));
});

test('invite message links to the activation screen', () => {
  const msg = buildInviteMessage('new@example.com', 'inv_tok', 'https://assets.example.com');
  assert.ok(msg.text.includes('https://assets.example.com/#activate?token=inv_tok'));
  assert.ok(msg.text.includes('Invitation code: inv_tok'));
  assert.match(msg.subject, /invited/i);
});

test('messages still carry the code when no base URL is known', () => {
  const msg = buildPasswordResetMessage('user@example.com', TOKEN, null);
  assert.ok(!msg.text.includes('http'), 'no link without a base URL');
  assert.ok(msg.text.includes(TOKEN));
  assert.ok(!msg.html.includes('<a href'));
});

test('html output escapes interpolated values', () => {
  const msg = buildPasswordResetMessage('a"<b>@example.com', '<script>x</script>', 'https://assets.example.com');
  assert.ok(!msg.html.includes('<script>x</script>'));
  assert.ok(msg.html.includes('&lt;script&gt;x&lt;/script&gt;'));
  assert.ok(!msg.html.includes('a"<b>@example.com'));
});

test('deliverMail sends through the transport and reports delivered', async () => {
  const transport = nodemailer.createTransport({ jsonTransport: true });
  const msg = buildPasswordResetMessage('user@example.com', TOKEN, 'https://assets.example.com');
  const sent: any[] = [];
  const original = transport.sendMail.bind(transport);
  (transport as any).sendMail = async (options: any) => {
    sent.push(options);
    return original(options);
  };

  const result = await deliverMail(msg, 'reset', transport, 'OmniAsset <no-reply@example.com>');
  assert.deepEqual(result, { delivered: true });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].from, 'OmniAsset <no-reply@example.com>');
  assert.equal(sent[0].to, 'user@example.com');
  assert.ok(sent[0].text.includes(TOKEN));
});

test('deliverMail reports unconfigured instead of throwing when there is no transport or sender', async () => {
  const msg = buildInviteMessage('new@example.com', 'inv_tok', null);
  assert.deepEqual(await deliverMail(msg, 'invite', null, 'no-reply@example.com'), { delivered: false, reason: 'unconfigured' });
  const transport = nodemailer.createTransport({ jsonTransport: true });
  assert.deepEqual(await deliverMail(msg, 'invite', transport, undefined), { delivered: false, reason: 'unconfigured' });
});

test('deliverMail never throws and never logs the token when SMTP fails', async () => {
  const failing: any = {
    sendMail: async () => {
      const err: any = new Error(`connect failed while sending ${TOKEN}`);
      err.code = 'ECONNREFUSED';
      throw err;
    }
  };
  const logged: string[] = [];
  const originalError = console.error;
  console.error = (...args: any[]) => { logged.push(args.join(' ')); };
  try {
    const msg = buildPasswordResetMessage('user@example.com', TOKEN, 'https://assets.example.com');
    const result = await deliverMail(msg, 'reset', failing, 'no-reply@example.com');
    assert.deepEqual(result, { delivered: false, reason: 'failed' });
  } finally {
    console.error = originalError;
  }
  assert.equal(logged.length, 1);
  assert.ok(logged[0]!.includes('ECONNREFUSED'));
  assert.ok(!logged[0]!.includes(TOKEN), 'token must not appear in logs');
  assert.ok(!logged[0]!.includes('user@example.com'), 'recipient must not appear in logs');
});

test('in test mode, send functions capture tokens in the test mailbox and send nothing', async () => {
  clearTestMailbox();
  const reset = await sendPasswordResetEmail('  User@Example.com ', 'rst_1');
  const invite = await sendInviteEmail('new@example.com', 'inv_1');
  assert.deepEqual(reset, { delivered: false, reason: 'test-mailbox' });
  assert.deepEqual(invite, { delivered: false, reason: 'test-mailbox' });
  assert.equal(getLatestTestPasswordResetToken('user@example.com'), 'rst_1');
  assert.equal(getLatestTestInviteToken('new@example.com'), 'inv_1');
  clearTestMailbox();
});
