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
    // Note: This is to bound each SMTP phase so an unresponsive mail server can't hang our verify-request handler indefinitely.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
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
          <div style="background:#060810;padding:40px 16px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
            <div style="max-width:480px;margin:0 auto">

              <!-- brand -->
              <div style="padding:0 4px 16px 4px">
                <span style="font-size:20px;font-weight:800;letter-spacing:-0.5px;color:#e8edf5">layer<span style="color:#00d4ff">402</span></span>
                <div style="margin-top:6px;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#6b7a99">
                  kyx registry &nbsp;&middot;&nbsp; operator verification
                </div>
              </div>

              <!-- card -->
              <div style="background:#0b0f1a;border:1px solid #1e2740;border-top:2px solid #00d4ff;padding:32px 28px">
                <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#00d4ff;margin-bottom:12px">
                  action required
                </div>
                <h2 style="margin:0 0 12px;font-size:22px;font-weight:800;color:#e8edf5;letter-spacing:-0.3px">
                  Verify your operator email
                </h2>
                <p style="margin:0 0 28px;color:#a8b4cc;font-size:14px;line-height:1.65">
                  Confirm this address to register agents with the layer402 KYX registry.
                  Your agents get an on-chain DID and a portable trust score linked to this
                  operator account.
                </p>

                <a href="${verificationUrl}"
                   style="display:inline-block;background:#00d4ff;color:#060810;text-decoration:none;padding:14px 28px;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase">
                  Verify email &rarr;
                </a>

                <div style="margin-top:28px;padding-top:20px;border-top:1px solid #1e2740">
                  <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#6b7a99;margin-bottom:8px">
                    or paste this link into your browser
                  </div>
                  <a href="${verificationUrl}"
                     style="color:#00d4ff;font-family:'SF Mono',Menlo,Consolas,monospace;font-size:11px;word-break:break-all;text-decoration:none">
                    ${verificationUrl}
                  </a>
                </div>
              </div>

              <!-- footer -->
              <div style="padding:20px 4px 0 4px;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#6b7a99;line-height:2">
                link expires in 24 hours &nbsp;&middot;&nbsp; didn't request this? ignore this email<br />
                &copy; ${new Date().getFullYear()} layer402 &nbsp;&middot;&nbsp; x402 facilitator &nbsp;&middot;&nbsp; agent trust registry
              </div>

            </div>
          </div>`,
      });
    },
  };
}
