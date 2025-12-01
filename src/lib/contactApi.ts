/**
 * Contact Form API Handler
 *
 * Accepts contact form submissions and forwards them to all configured admins
 * via email. Supports both JSON and URL-encoded form data.
 *
 * Spam Prevention:
 * - Honeypot field: hidden field that bots fill out, humans don't see
 * - Time-based check: reject submissions faster than MIN_SUBMISSION_TIME_MS
 * - IP rate limiting: max RATE_LIMIT_MAX submissions per RATE_LIMIT_WINDOW_MS
 */

import type http from 'node:http';
import { z } from 'zod';
import { loadAdminsConfig, getClientIp } from './auth.js';
import type { EmailConfig } from './emailService.js';
import type { Logger } from './logger.js';

// ---------------------------------------------------------------------------
// Spam Prevention Configuration
// ---------------------------------------------------------------------------

/** Minimum time (ms) between form load and submission. Bots submit instantly. */
const MIN_SUBMISSION_TIME_MS = 3000; // 3 seconds

/** Rate limit window in milliseconds */
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

/** Maximum submissions per IP within the rate limit window */
const RATE_LIMIT_MAX = 5;

/** In-memory rate limit store (IP -> timestamps of recent submissions) */
const rateLimitStore = new Map<string, number[]>();

/** Clean up old rate limit entries periodically */
const cleanupRateLimitStore = (): void => {
  const now = Date.now();
  for (const [ip, timestamps] of rateLimitStore.entries()) {
    const valid = timestamps.filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);
    if (valid.length === 0) {
      rateLimitStore.delete(ip);
    } else {
      rateLimitStore.set(ip, valid);
    }
  }
};

// Run cleanup every 10 minutes
setInterval(cleanupRateLimitStore, 10 * 60 * 1000);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ContactSubmission = {
  readonly name: string;
  readonly email: string;
  readonly message: string;
  readonly pageUrl?: string;
  readonly pageTitle?: string;
  readonly referrer?: string;
  readonly clientIp: string;
  readonly timestamp: string;
};

export type ContactResult = {
  readonly success: boolean;
  readonly provider: 'resend' | 'log';
  readonly messageId?: string;
  readonly error?: string;
};

type SpamCheckResult = {
  readonly isSpam: boolean;
  readonly reason?: string;
};

// ---------------------------------------------------------------------------
// Spam Prevention
// ---------------------------------------------------------------------------

/**
 * Check if honeypot field was filled (indicates bot).
 * The honeypot field should be hidden via CSS and left empty by humans.
 */
const checkHoneypot = (data: Record<string, unknown>): SpamCheckResult => {
  const honeypot = data._gotcha ?? data.website ?? data.url_field;
  if (honeypot && String(honeypot).trim().length > 0) {
    return { isSpam: true, reason: 'honeypot' };
  }
  return { isSpam: false };
};

/**
 * Check if form was submitted too quickly (indicates bot).
 * The form includes a hidden timestamp field set on page load.
 */
const checkSubmissionTime = (data: Record<string, unknown>): SpamCheckResult => {
  const loadedAt = data._loaded_at;
  if (!loadedAt) {
    // No timestamp - could be non-JS submission, allow but log
    return { isSpam: false };
  }

  const loadTime = parseInt(String(loadedAt), 10);
  if (isNaN(loadTime)) {
    return { isSpam: true, reason: 'invalid_timestamp' };
  }

  const elapsed = Date.now() - loadTime;
  if (elapsed < MIN_SUBMISSION_TIME_MS) {
    return { isSpam: true, reason: 'too_fast' };
  }

  return { isSpam: false };
};

/**
 * Check IP-based rate limiting.
 * Returns spam if IP has exceeded max submissions in the window.
 */
const checkRateLimit = (clientIp: string): SpamCheckResult => {
  const now = Date.now();
  const timestamps = rateLimitStore.get(clientIp) ?? [];

  // Filter to only recent submissions within the window
  const recent = timestamps.filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);

  if (recent.length >= RATE_LIMIT_MAX) {
    return { isSpam: true, reason: 'rate_limited' };
  }

  return { isSpam: false };
};

/**
 * Record a submission for rate limiting.
 */
const recordSubmission = (clientIp: string): void => {
  const now = Date.now();
  const timestamps = rateLimitStore.get(clientIp) ?? [];
  timestamps.push(now);
  rateLimitStore.set(clientIp, timestamps);
};

/**
 * Run all spam checks.
 */
const runSpamChecks = (
  data: Record<string, unknown>,
  clientIp: string,
  logger: Logger,
): SpamCheckResult => {
  // Check honeypot first (most definitive)
  const honeypotResult = checkHoneypot(data);
  if (honeypotResult.isSpam) {
    logger.warn(`[contact] Spam blocked: honeypot triggered from ${clientIp}`);
    return honeypotResult;
  }

  // Check submission timing
  const timingResult = checkSubmissionTime(data);
  if (timingResult.isSpam) {
    logger.warn(`[contact] Spam blocked: ${timingResult.reason} from ${clientIp}`);
    return timingResult;
  }

  // Check rate limit
  const rateLimitResult = checkRateLimit(clientIp);
  if (rateLimitResult.isSpam) {
    logger.warn(`[contact] Spam blocked: rate limited ${clientIp}`);
    return rateLimitResult;
  }

  return { isSpam: false };
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const ContactFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  email: z.string().email('Invalid email address').max(254),
  message: z.string().min(1, 'Message is required').max(10000),
  pageUrl: z.string().max(2000).optional(),
  pageTitle: z.string().max(500).optional(),
  // Spam prevention fields (not validated, just passed through)
  _gotcha: z.string().optional(),
  _loaded_at: z.string().optional(),
});

type ContactFormInput = z.infer<typeof ContactFormSchema>;

// ---------------------------------------------------------------------------
// Email Templates
// ---------------------------------------------------------------------------

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const createContactEmailHtml = (
  submission: ContactSubmission,
  siteName: string,
): string => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Contact Form Submission</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1a1a1a; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
  <div style="background: linear-gradient(135deg, #c4a77d, #8b8178); padding: 24px; border-radius: 12px 12px 0 0;">
    <h1 style="font-size: 20px; font-weight: 600; color: #fff; margin: 0;">
      New Message from ${escapeHtml(siteName)}
    </h1>
  </div>

  <div style="background: #faf8f5; padding: 24px; border: 1px solid #e5e5e5; border-top: none; border-radius: 0 0 12px 12px;">
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 8px 0; color: #6a6a6a; font-size: 13px; width: 100px;">From</td>
        <td style="padding: 8px 0; font-weight: 500;">${escapeHtml(submission.name)}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #6a6a6a; font-size: 13px;">Email</td>
        <td style="padding: 8px 0;">
          <a href="mailto:${escapeHtml(submission.email)}" style="color: #4f46e5;">${escapeHtml(submission.email)}</a>
        </td>
      </tr>
      ${submission.pageUrl ? `
      <tr>
        <td style="padding: 8px 0; color: #6a6a6a; font-size: 13px;">Page</td>
        <td style="padding: 8px 0;">
          <a href="${escapeHtml(submission.pageUrl)}" style="color: #4f46e5; word-break: break-all;">${escapeHtml(submission.pageTitle || submission.pageUrl)}</a>
        </td>
      </tr>
      ` : ''}
      <tr>
        <td style="padding: 8px 0; color: #6a6a6a; font-size: 13px;">Time</td>
        <td style="padding: 8px 0;">${escapeHtml(submission.timestamp)}</td>
      </tr>
    </table>

    <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 20px 0;">

    <div style="background: #fff; padding: 16px; border-radius: 8px; border: 1px solid #e5e5e5;">
      <p style="margin: 0; white-space: pre-wrap;">${escapeHtml(submission.message)}</p>
    </div>

    <div style="margin-top: 24px; text-align: center;">
      <a href="mailto:${escapeHtml(submission.email)}?subject=Re: Your message to ${escapeHtml(siteName)}"
         style="display: inline-block; background: #2d2926; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 500; font-size: 14px;">
        Reply to ${escapeHtml(submission.name)}
      </a>
    </div>
  </div>

  <p style="color: #9a9a9a; font-size: 11px; text-align: center; margin-top: 24px;">
    Submitted from IP ${escapeHtml(submission.clientIp)}${submission.referrer ? ` · Referrer: ${escapeHtml(submission.referrer)}` : ''}
  </p>
</body>
</html>
`;

const createContactEmailText = (
  submission: ContactSubmission,
  siteName: string,
): string => `New Contact Form Submission — ${siteName}

From: ${submission.name}
Email: ${submission.email}
${submission.pageUrl ? `Page: ${submission.pageTitle || submission.pageUrl}` : ''}
Time: ${submission.timestamp}

---

${submission.message}

---
IP: ${submission.clientIp}${submission.referrer ? ` | Referrer: ${submission.referrer}` : ''}
`;

// ---------------------------------------------------------------------------
// Email Sending
// ---------------------------------------------------------------------------

const sendContactEmail = async (
  config: EmailConfig,
  recipients: ReadonlyArray<string>,
  submission: ContactSubmission,
): Promise<ContactResult> => {
  const htmlContent = createContactEmailHtml(submission, config.siteName);
  const textContent = createContactEmailText(submission, config.siteName);
  const subject = `[${config.siteName}] Message from ${submission.name}`;

  // Development fallback: log to console
  if (!config.resendApiKey) {
    console.log(`[contact] New submission from ${submission.email}:`);
    console.log(`  Name: ${submission.name}`);
    console.log(`  Message: ${submission.message.slice(0, 100)}${submission.message.length > 100 ? '...' : ''}`);
    console.log(`  Would send to: ${recipients.join(', ')}`);
    return { success: true, provider: 'log' };
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
        to: recipients,
        reply_to: submission.email,
        subject,
        html: htmlContent,
        text: textContent,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[contact] Resend API error: ${response.status} ${errorBody}`);
      return {
        success: false,
        provider: 'resend',
        error: `Email delivery failed: ${response.status}`,
      };
    }

    const result = (await response.json()) as { id: string };
    console.log(`[contact] Email sent to ${recipients.length} admin(s) via Resend (id: ${result.id})`);

    return {
      success: true,
      provider: 'resend',
      messageId: result.id,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[contact] Failed to send via Resend: ${message}`);
    return {
      success: false,
      provider: 'resend',
      error: message,
    };
  }
};

// ---------------------------------------------------------------------------
// Request Parsing
// ---------------------------------------------------------------------------

const parseUrlEncoded = (body: string): Record<string, string> => {
  const params = new URLSearchParams(body);
  const result: Record<string, string> = {};
  for (const [key, value] of params) {
    result[key] = value;
  }
  return result;
};

const readBody = async (req: http.IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    const maxBytes = 64 * 1024; // 64KB limit for form data

    req.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
      total += chunk.length;
      if (total > maxBytes) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });

// ---------------------------------------------------------------------------
// HTTP Handler
// ---------------------------------------------------------------------------

const respondJson = (
  res: http.ServerResponse,
  status: number,
  payload: unknown,
): void => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
};

const respondRedirect = (
  res: http.ServerResponse,
  location: string,
  status: 'success' | 'error',
): void => {
  const separator = location.includes('?') ? '&' : '?';
  const target = `${location}${separator}contact=${status}`;
  res.statusCode = 303;
  res.setHeader('Location', target);
  res.end();
};

export type ContactApiOptions = {
  readonly contentDir: string;
  readonly emailConfig: EmailConfig;
  readonly logger: Logger;
};

export const handleContactApi = async (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  requestUrl: URL,
  options: ContactApiOptions,
): Promise<boolean> => {
  if (requestUrl.pathname !== '/__ual/api/contact') {
    return false;
  }

  const method = req.method ?? 'GET';

  // Only POST allowed
  if (method !== 'POST') {
    respondJson(res, 405, { error: 'Method not allowed' });
    return true;
  }

  const { contentDir, emailConfig, logger } = options;

  // Determine content type
  const contentType = req.headers['content-type'] ?? '';
  const isJson = contentType.includes('application/json');
  const isForm = contentType.includes('application/x-www-form-urlencoded');
  const acceptsJson = (req.headers.accept ?? '').includes('application/json');

  // Parse body
  let rawData: Record<string, unknown>;
  try {
    const body = await readBody(req);
    if (isJson) {
      rawData = JSON.parse(body) as Record<string, unknown>;
    } else if (isForm) {
      rawData = parseUrlEncoded(body);
    } else {
      // Try JSON first, fall back to form-encoded
      try {
        rawData = JSON.parse(body) as Record<string, unknown>;
      } catch {
        rawData = parseUrlEncoded(body);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid request body';
    logger.error('[contact] Failed to parse body:', error);
    if (acceptsJson || isJson) {
      respondJson(res, 400, { error: message });
    } else {
      respondRedirect(res, req.headers.referer ?? '/', 'error');
    }
    return true;
  }

  // Get client IP early for spam checks
  const clientIp = getClientIp(
    req.headers as Record<string, string | string[] | undefined>,
    req.socket.remoteAddress,
  );

  // Run spam prevention checks BEFORE validation
  const spamResult = runSpamChecks(rawData, clientIp, logger);
  if (spamResult.isSpam) {
    // Return success to not reveal spam detection to bots
    // but don't actually send the email
    if (acceptsJson || isJson) {
      respondJson(res, 200, { success: true });
    } else {
      respondRedirect(res, req.headers.referer ?? '/', 'success');
    }
    return true;
  }

  // Validate input
  const parsed = ContactFormSchema.safeParse(rawData);
  if (!parsed.success) {
    const errors = parsed.error.errors.map((e) => e.message).join(', ');
    logger.warn(`[contact] Validation failed: ${errors}`);
    if (acceptsJson || isJson) {
      respondJson(res, 400, { error: errors, fields: parsed.error.flatten().fieldErrors });
    } else {
      respondRedirect(res, req.headers.referer ?? '/', 'error');
    }
    return true;
  }

  const input: ContactFormInput = parsed.data;

  // Load admin recipients
  const adminsConfig = await loadAdminsConfig(contentDir);
  const recipients = adminsConfig.admins.map((a) => a.email);

  if (recipients.length === 0) {
    logger.error('[contact] No admin recipients configured (UAL_ADMIN_EMAILS)');
    if (acceptsJson || isJson) {
      respondJson(res, 503, { error: 'Contact form is not configured' });
    } else {
      respondRedirect(res, req.headers.referer ?? '/', 'error');
    }
    return true;
  }

  // Record this submission for rate limiting
  recordSubmission(clientIp);

  // Build submission object
  const submission: ContactSubmission = {
    name: input.name,
    email: input.email,
    message: input.message,
    pageUrl: input.pageUrl,
    pageTitle: input.pageTitle,
    referrer: req.headers.referer,
    clientIp,
    timestamp: new Date().toISOString(),
  };

  logger.info(`[contact] Submission from ${submission.email} (${submission.name})`);

  // Send email
  const result = await sendContactEmail(emailConfig, recipients, submission);

  if (!result.success) {
    logger.error(`[contact] Failed to deliver: ${result.error}`);
    if (acceptsJson || isJson) {
      respondJson(res, 500, { error: 'Failed to send message. Please try again later.' });
    } else {
      respondRedirect(res, req.headers.referer ?? '/', 'error');
    }
    return true;
  }

  logger.info(`[contact] Delivered to ${recipients.length} admin(s) via ${result.provider}`);

  if (acceptsJson || isJson) {
    respondJson(res, 200, { success: true, provider: result.provider });
  } else {
    respondRedirect(res, req.headers.referer ?? '/', 'success');
  }

  return true;
};

