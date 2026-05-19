/**
 * Email delivery for Orbita resurfacing.
 *
 * Supports two providers:
 *   1. RegNexus Mail (own infrastructure) — set MAIL_PROVIDER=regnexus
 *   2. Resend (fallback) — set MAIL_PROVIDER=resend
 *
 * Environment variables:
 *   MAIL_PROVIDER — "regnexus" | "resend" (default: regnexus)
 *   MAIL_FROM — sender address (default: continuity@regnexus.co.uk)
 *
 *   For RegNexus:
 *     REGNEXUS_MAIL_URL — your mail API endpoint
 *     REGNEXUS_MAIL_KEY — API key for your mail service
 *
 *   For Resend (fallback):
 *     RESEND_API_KEY — Resend API key
 */

const MAIL_PROVIDER = process.env.MAIL_PROVIDER || 'regnexus'
const MAIL_FROM = process.env.MAIL_FROM || 'Orbita <continuity@regnexus.co.uk>'

interface EmailOptions {
  to: string
  subject: string
  html: string
  text?: string
}

export async function sendEmail(options: EmailOptions): Promise<boolean> {
  if (MAIL_PROVIDER === 'regnexus') {
    return sendViaRegNexus(options)
  }
  return sendViaResend(options)
}

/**
 * Send via RegNexus own mail infrastructure.
 * Expects a REST API endpoint that accepts POST with JSON body.
 */
async function sendViaRegNexus(options: EmailOptions): Promise<boolean> {
  const mailUrl = process.env.REGNEXUS_MAIL_URL
  const mailKey = process.env.REGNEXUS_MAIL_KEY

  if (!mailUrl || !mailKey) {
    console.warn('REGNEXUS_MAIL_URL or REGNEXUS_MAIL_KEY not set — trying Resend fallback')
    return sendViaResend(options)
  }

  try {
    const response = await fetch(mailUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mailKey}`,
        'X-API-Key': mailKey,
      },
      body: JSON.stringify({
        from: MAIL_FROM,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text || '',
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('RegNexus mail send failed:', error)
      return false
    }

    return true
  } catch (error) {
    console.error('RegNexus mail delivery error:', error)
    return false
  }
}

/**
 * Fallback: Send via Resend API
 */
async function sendViaResend(options: EmailOptions): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('No mail provider configured — email delivery disabled')
    return false
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: MAIL_FROM,
        to: [options.to],
        subject: options.subject,
        html: options.html,
        text: options.text,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('Resend email send failed:', error)
      return false
    }

    return true
  } catch (error) {
    console.error('Resend email delivery error:', error)
    return false
  }
}

/**
 * Format the daily brief as an HTML email
 */
export function formatBriefEmail(briefContent: string, userName?: string): string {
  const greeting = userName ? `Good morning, ${userName}` : 'Good morning'

  // Convert markdown-style brief to HTML
  const htmlContent = briefContent
    .split('\n')
    .map(line => {
      if (line.startsWith('# ')) return `<h2 style="color:#1e293b;font-size:18px;margin:16px 0 8px">${line.slice(2)}</h2>`
      if (line.startsWith('## ')) return `<h3 style="color:#334155;font-size:15px;margin:12px 0 6px">${line.slice(3)}</h3>`
      if (line.startsWith('- ')) return `<li style="color:#475569;font-size:14px;margin:4px 0;padding-left:4px">${line.slice(2)}</li>`
      if (line.trim() === '') return '<br/>'
      return `<p style="color:#475569;font-size:14px;margin:4px 0;line-height:1.5">${line}</p>`
    })
    .join('\n')

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f8fafc;padding:32px 16px;margin:0">
  <div style="max-width:560px;margin:0 auto;background:white;border-radius:12px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.08)">
    <div style="margin-bottom:24px">
      <h1 style="color:#1e293b;font-size:20px;margin:0 0 4px">${greeting}</h1>
      <p style="color:#94a3b8;font-size:13px;margin:0">Your daily continuity brief</p>
    </div>

    <div style="border-top:1px solid #e2e8f0;padding-top:20px">
      ${htmlContent}
    </div>

    <div style="margin-top:28px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center">
      <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://continuum-web.vercel.app'}/dashboard"
         style="display:inline-block;background:#1e293b;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:500">
        Open Orbita
      </a>
    </div>

    <p style="color:#cbd5e1;font-size:11px;text-align:center;margin-top:20px">
      Orbita — cognitive continuity preservation
    </p>
  </div>
</body>
</html>`
}

/**
 * Format a follow-up/forgotten intent alert email
 */
export function formatAlertEmail(alerts: { title: string; description: string; urgency: string }[]): string {
  const items = alerts.map(a => `
    <div style="padding:12px;background:#fef3c7;border-radius:8px;margin:8px 0">
      <p style="color:#92400e;font-size:14px;font-weight:500;margin:0 0 4px">${a.title}</p>
      <p style="color:#78716c;font-size:13px;margin:0">${a.description}</p>
      <span style="color:#d97706;font-size:11px">${a.urgency}</span>
    </div>
  `).join('')

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f8fafc;padding:32px 16px;margin:0">
  <div style="max-width:560px;margin:0 auto;background:white;border-radius:12px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.08)">
    <h1 style="color:#1e293b;font-size:18px;margin:0 0 4px">Continuity Alert</h1>
    <p style="color:#94a3b8;font-size:13px;margin:0 0 16px">Items that may need your attention</p>
    ${items}
    <div style="margin-top:20px;text-align:center">
      <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://continuum-web.vercel.app'}/follow-ups"
         style="display:inline-block;background:#1e293b;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:13px">
        View in Orbita
      </a>
    </div>
  </div>
</body>
</html>`
}
