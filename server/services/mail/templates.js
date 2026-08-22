'use strict';

/**
 * Transactional email templates.
 *
 * Every template returns `{ subject, html, text }`. HTML is inline-styled and
 * table-based so it survives the major email clients (Gmail/Outlook/Apple Mail);
 * a plain-text alternative always ships alongside it for deliverability and for
 * clients that refuse HTML.
 *
 * These builders are pure — they take everything they need as arguments and
 * touch no I/O — so they are trivial to unit-test and reuse.
 */

const esc = (s) =>
  String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** A bulletproof-ish, centered call-to-action button. */
function button(url, label, color) {
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:28px 0;">
      <tr>
        <td align="center" bgcolor="${esc(color)}" style="border-radius:8px;">
          <a href="${esc(url)}"
             style="display:inline-block;padding:13px 30px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px;">
            ${esc(label)}
          </a>
        </td>
      </tr>
    </table>`;
}

/** Wraps body HTML in a consistent, responsive shell. */
function layout({ appName, brandColor, bodyHtml, preheader = '' }) {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="x-apple-disable-message-reformatting">
  <title>${esc(appName)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f5f7;">
  <span style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;">${esc(preheader)}</span>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f4f5f7;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
          <tr>
            <td style="background-color:${esc(brandColor)};padding:22px 32px;">
              <span style="font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:bold;color:#ffffff;">${esc(appName)}</span>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#2d2d2d;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #ededed;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#9a9a9a;">
              You are receiving this email because of activity related to your ${esc(appName)} account.<br>
              &copy; ${year} ${esc(appName)}. All rights reserved.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** "there" is a safe fallback greeting when we have no name. */
const greet = (name) => esc(String(name || '').trim().split(/\s+/)[0] || 'there');

/* ------------------------------------------------------------------ *
 * Welcome (sent on portal sign-up when no verification is required)
 * ------------------------------------------------------------------ */
function welcome({ name, appName, brandColor, loginUrl }) {
  const body = `
    <h1 style="margin:0 0 16px;font-size:22px;color:#1a1a1a;">Welcome to ${esc(appName)}, ${greet(name)}! 🎉</h1>
    <p style="margin:0 0 12px;">Your account is ready. You can now sign in to access your products, training, and support any time.</p>
    ${button(loginUrl, 'Go to your account', brandColor)}
    <p style="margin:0;color:#6b6b6b;font-size:13px;">If you didn't create this account, you can safely ignore this email.</p>`;
  return {
    subject: `Welcome to ${appName} 🎉`,
    html: layout({ appName, brandColor, bodyHtml: body, preheader: `Your ${appName} account is ready.` }),
    text: `Welcome to ${appName}, ${String(name || 'there').trim().split(/\s+/)[0] || 'there'}!\n\nYour account is ready. Sign in here:\n${loginUrl}\n\nIf you didn't create this account, you can ignore this email.`,
  };
}

/* ------------------------------------------------------------------ *
 * Email verification (sent on sign-up when verification is required)
 * ------------------------------------------------------------------ */
function verifyEmail({ name, appName, brandColor, verifyUrl, expiresMinutes }) {
  const body = `
    <h1 style="margin:0 0 16px;font-size:22px;color:#1a1a1a;">Confirm your email</h1>
    <p style="margin:0 0 12px;">Hi ${greet(name)}, thanks for signing up for ${esc(appName)}. Please confirm this email address to activate your account.</p>
    ${button(verifyUrl, 'Verify email address', brandColor)}
    <p style="margin:0 0 8px;color:#6b6b6b;font-size:13px;">This link expires in ${esc(expiresMinutes)} minutes.</p>
    <p style="margin:0;color:#6b6b6b;font-size:13px;">If the button doesn't work, copy and paste this link into your browser:<br>
    <a href="${esc(verifyUrl)}" style="color:${esc(brandColor)};word-break:break-all;">${esc(verifyUrl)}</a></p>`;
  return {
    subject: `Confirm your email for ${appName}`,
    html: layout({ appName, brandColor, bodyHtml: body, preheader: `Confirm your email to activate your ${appName} account.` }),
    text: `Hi ${String(name || 'there').trim().split(/\s+/)[0] || 'there'},\n\nConfirm your email to activate your ${appName} account:\n${verifyUrl}\n\nThis link expires in ${expiresMinutes} minutes.`,
  };
}

/* ------------------------------------------------------------------ *
 * Password reset
 * ------------------------------------------------------------------ */
function passwordReset({ name, appName, brandColor, resetUrl, expiresMinutes }) {
  const body = `
    <h1 style="margin:0 0 16px;font-size:22px;color:#1a1a1a;">Reset your password</h1>
    <p style="margin:0 0 12px;">Hi ${greet(name)}, we received a request to reset the password for your ${esc(appName)} account. Click below to choose a new one.</p>
    ${button(resetUrl, 'Reset password', brandColor)}
    <p style="margin:0 0 8px;color:#6b6b6b;font-size:13px;">This link expires in ${esc(expiresMinutes)} minutes. If you didn't request this, you can safely ignore this email — your password will not change.</p>
    <p style="margin:0;color:#6b6b6b;font-size:13px;">If the button doesn't work, copy and paste this link into your browser:<br>
    <a href="${esc(resetUrl)}" style="color:${esc(brandColor)};word-break:break-all;">${esc(resetUrl)}</a></p>`;
  return {
    subject: `Reset your ${appName} password`,
    html: layout({ appName, brandColor, bodyHtml: body, preheader: `Reset the password for your ${appName} account.` }),
    text: `Hi ${String(name || 'there').trim().split(/\s+/)[0] || 'there'},\n\nReset your ${appName} password here:\n${resetUrl}\n\nThis link expires in ${expiresMinutes} minutes. If you didn't request this, ignore this email.`,
  };
}

/* ------------------------------------------------------------------ *
 * Access granted (sent to every customer in a JVZoo CSV import)
 * ------------------------------------------------------------------ */
function accessGranted({ name, appName, brandColor, productName, actionUrl, hasPortalAccount }) {
  const product = productName ? esc(productName) : 'your product';
  const cta = hasPortalAccount ? 'Sign in to your account' : 'Create your account';
  const nextLine = hasPortalAccount
    ? `Sign in with this email address to get started.`
    : `Create your account using <strong>this email address</strong> to unlock everything.`;
  const body = `
    <h1 style="margin:0 0 16px;font-size:22px;color:#1a1a1a;">You've got access to ${product}! 🚀</h1>
    <p style="margin:0 0 12px;">Hi ${greet(name)}, great news — your purchase of <strong>${product}</strong> is confirmed and access is now active on ${esc(appName)}.</p>
    <p style="margin:0 0 4px;">${nextLine}</p>
    ${button(actionUrl, cta, brandColor)}
    <p style="margin:0;color:#6b6b6b;font-size:13px;">Need a hand? Just reply to this email and our support team will help.</p>`;
  return {
    subject: `Your access to ${productName || appName} is ready 🚀`,
    html: layout({ appName, brandColor, bodyHtml: body, preheader: `Your access to ${productName || appName} is now active.` }),
    text: `Hi ${String(name || 'there').trim().split(/\s+/)[0] || 'there'},\n\nYour purchase of ${productName || 'your product'} is confirmed and access is now active on ${appName}.\n\n${hasPortalAccount ? 'Sign in' : 'Create your account'} with this email address:\n${actionUrl}\n\nNeed help? Just reply to this email.`,
  };
}

module.exports = { welcome, verifyEmail, passwordReset, accessGranted, layout, button };
