import nodemailer, { type Transporter } from 'nodemailer';

import type { KyxConfig } from './config.js';

export interface Mailer {
  sendMagicLink(to: string, verificationUrl: string): Promise<void>;
}

export function createMailer(config: KyxConfig): Mailer | null {
  const { host, port, user, pass, from } = config.mail;
  if (!user || !pass) return null;

  const transport: Transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  return {
    async sendMagicLink(to: string, verificationUrl: string): Promise<void> {
      await transport.sendMail({
        from,
        to,
        subject: 'Verify your layer402 operator email',
        text:
          'Confirm this email address to register agents with the layer402 KYX registry.\n\n' +
          `Open this link to verify: ${verificationUrl}\n\n` +
          'The link expires in 24 hours. If you did not request this, you can ignore this email.',
        html: `
          <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:480px;margin:0 auto;padding:24px">
            <h2 style="margin:0 0 8px">Verify your operator email</h2>
            <p style="color:#444;line-height:1.5">
              Confirm this email address to register agents with the <strong>layer402 KYX registry</strong>.
            </p>
            <p style="margin:24px 0">
              <a href="${verificationUrl}"
                 style="background:#111;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block">
                Verify email
              </a>
            </p>
            <p style="color:#888;font-size:13px;line-height:1.5">
              Or paste this link into your browser:<br />
              <a href="${verificationUrl}">${verificationUrl}</a><br /><br />
              The link expires in 24 hours. If you did not request this, you can ignore this email.
            </p>
          </div>`,
      });
    },
  };
}
