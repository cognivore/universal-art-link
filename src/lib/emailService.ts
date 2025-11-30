/**
 * Email Service for Magic Link Authentication
 *
 * Implements email sending via Resend API with fallback to logging
 * when no email provider is configured (development mode).
 */

export type EmailConfig = {
  readonly resendApiKey: string | null;
  readonly fromAddress: string;
  readonly siteName: string;
};

export type SendMagicLinkResult = {
  readonly sent: boolean;
  readonly provider: 'resend' | 'log';
  readonly messageId?: string;
  readonly error?: string;
};

export type EmailService = {
  readonly sendMagicLink: (
    recipientEmail: string,
    magicLinkUrl: string,
    adminName: string,
  ) => Promise<SendMagicLinkResult>;
  readonly isConfigured: () => boolean;
};

const createMagicLinkHtml = (
  adminName: string,
  magicLinkUrl: string,
  siteName: string,
): string => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sign in to ${siteName}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1a1a1a; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
  <div style="text-align: center; margin-bottom: 32px;">
    <div style="display: inline-block; width: 48px; height: 48px; background: linear-gradient(135deg, #7c3aed, #4f46e5); border-radius: 12px;"></div>
  </div>

  <h1 style="font-size: 24px; font-weight: 600; text-align: center; margin-bottom: 24px;">
    Sign in to ${siteName}
  </h1>

  <p style="color: #4a4a4a; margin-bottom: 24px;">
    Hi ${adminName},
  </p>

  <p style="color: #4a4a4a; margin-bottom: 32px;">
    Click the button below to sign in to your admin panel. This link will expire in 15 minutes.
  </p>

  <div style="text-align: center; margin-bottom: 32px;">
    <a href="${magicLinkUrl}"
       style="display: inline-block; background: linear-gradient(135deg, #7c3aed, #4f46e5); color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 500; font-size: 16px;">
      Sign in to Admin
    </a>
  </div>

  <p style="color: #6a6a6a; font-size: 14px; margin-bottom: 16px;">
    If you didn't request this link, you can safely ignore this email.
  </p>

  <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 32px 0;">

  <p style="color: #9a9a9a; font-size: 12px; text-align: center;">
    If the button doesn't work, copy and paste this link into your browser:<br>
    <a href="${magicLinkUrl}" style="color: #4f46e5; word-break: break-all;">${magicLinkUrl}</a>
  </p>
</body>
</html>
`;

const createMagicLinkText = (
  adminName: string,
  magicLinkUrl: string,
  siteName: string,
): string => `Sign in to ${siteName}

Hi ${adminName},

Click the link below to sign in to your admin panel. This link will expire in 15 minutes.

${magicLinkUrl}

If you didn't request this link, you can safely ignore this email.
`;

/**
 * Create an email service with the given configuration.
 *
 * If RESEND_API_KEY is provided, emails are sent via Resend.
 * Otherwise, magic links are logged to console (development mode).
 */
export const createEmailService = (config: EmailConfig): EmailService => {
  const isConfigured = (): boolean => config.resendApiKey !== null;

  const sendMagicLink = async (
    recipientEmail: string,
    magicLinkUrl: string,
    adminName: string,
  ): Promise<SendMagicLinkResult> => {
    const htmlContent = createMagicLinkHtml(adminName, magicLinkUrl, config.siteName);
    const textContent = createMagicLinkText(adminName, magicLinkUrl, config.siteName);

    // If Resend is not configured, fall back to logging
    if (!config.resendApiKey) {
      console.log(`[email] Magic link for ${recipientEmail}: ${magicLinkUrl}`);
      return {
        sent: true,
        provider: 'log',
      };
    }

    // Send via Resend API
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: config.fromAddress,
          to: [recipientEmail],
          subject: `Sign in to ${config.siteName}`,
          html: htmlContent,
          text: textContent,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`[email] Resend API error: ${response.status} ${errorBody}`);
        return {
          sent: false,
          provider: 'resend',
          error: `Resend API error: ${response.status}`,
        };
      }

      const result = (await response.json()) as { id: string };
      console.log(`[email] Magic link sent to ${recipientEmail} via Resend (id: ${result.id})`);

      return {
        sent: true,
        provider: 'resend',
        messageId: result.id,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[email] Failed to send via Resend: ${message}`);
      return {
        sent: false,
        provider: 'resend',
        error: message,
      };
    }
  };

  return {
    sendMagicLink,
    isConfigured,
  };
};

/**
 * Create email config from environment variables.
 */
export const createEmailConfig = (siteName?: string): EmailConfig => ({
  resendApiKey: process.env.RESEND_API_KEY ?? null,
  fromAddress: process.env.EMAIL_FROM ?? 'UAL Admin <noreply@example.com>',
  siteName: siteName ?? process.env.UAL_SITE_NAME ?? 'UAL Admin',
});

