import { Resend } from 'resend';
import { config } from './config.js';

const resend = config.resendApiKey
  ? new Resend(config.resendApiKey)
  : null;

export const sendMagicLink = async (email: string, url: string): Promise<void> => {
  if (!resend) {
    console.log(`[dev] Magic link for ${email}: ${url}`);
    return;
  }

  await resend.emails.send({
    from: config.emailFrom,
    to: email,
    subject: 'Your sign-in link',
    html: `
      <p>Click the link below to sign in:</p>
      <p><a href="${url}">${url}</a></p>
      <p>This link expires in ${config.magicLinkExpiryMinutes} minutes.</p>
    `,
  });
};
