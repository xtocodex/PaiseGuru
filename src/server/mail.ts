// Outgoing mail through Resend's HTTP API. Without RESEND_API_KEY (dev) and always in tests, mail is
// logged and kept in `outbox` instead, so tests can follow the links.

export type Mail = { to: string; subject: string; text: string; html: string }

const FROM = 'PaiseGuru <noreply@paiseguru.xtocodex.in>'

export const outbox: Mail[] = []

export async function sendMail(mail: Mail) {
  const key = process.env.RESEND_API_KEY
  if (!key || process.env.NODE_ENV === 'test') {
    if (process.env.NODE_ENV === 'production') throw new Error('RESEND_API_KEY is not set')
    outbox.push(mail)
    if (process.env.NODE_ENV !== 'test') console.log(JSON.stringify({ level: 'info', msg: 'mail not sent (no RESEND_API_KEY)', to: mail.to, subject: mail.subject, text: mail.text }))
    return
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: FROM, reply_to: SUPPORT, ...mail }),
  })
  if (!res.ok) throw new Error(`mail failed: ${res.status} ${await res.text()}`)
}

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`)

/** Replies reach a person (forwarded to the team's inbox). */
export const SUPPORT = 'support@xtocodex.in'

// Brand colours from the PaiseGuru logo; email clients ignore CSS variables, so they are repeated here.
const C = { paper: '#f3f5fa', card: '#ffffff', ink: '#0b1f5c', text: '#121a33', body: '#353d55', muted: '#687089', brand: '#2447d6', line: '#e1e6ef' }
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'IBM Plex Sans', Arial, sans-serif"

/**
 * A branded PaiseGuru email: wordmark, a heading, a few plain lines, optional numbered steps, one button,
 * then a footer with how to reach us. All text is plain and escaped for the HTML part; tables keep it
 * readable in Gmail and Outlook.
 */
export function message(o: {
  to: string
  subject: string
  heading?: string
  /** Shown by inbox lists next to the subject. */
  preheader?: string
  lines: string[]
  steps?: { title: string; text: string }[]
  button: string
  url: string
  /** Why they got it / what to do if it wasn't them. */
  footer?: string
}): Mail {
  const footer = o.footer ?? "If you didn't ask for this, you can ignore this email."
  const text = [
    ...(o.heading ? [o.heading, ''] : []),
    ...o.lines,
    ...(o.steps ? ['', ...o.steps.map((st, i) => `${i + 1}. ${st.title}: ${st.text}`)] : []),
    '',
    `${o.button}: ${o.url}`,
    '',
    footer,
    `Questions? Reply to this email or write to ${SUPPORT}.`,
    '',
    'PaiseGuru · a product of xtocodex',
  ].join('\n')
  const p = (t: string) => `<p style="margin:0 0 14px;font-size:16px;line-height:1.55;color:${C.body}">${esc(t)}</p>`
  const steps = (o.steps ?? [])
    .map(
      (st, i) => `<tr>
<td valign="top" style="padding:0 12px 14px 0;width:28px"><div style="width:28px;height:28px;border-radius:14px;background:#e8edfe;color:${C.brand};font-weight:700;font-size:14px;line-height:28px;text-align:center">${i + 1}</div></td>
<td valign="top" style="padding:3px 0 14px;font-size:15px;line-height:1.5;color:${C.body}"><strong style="color:${C.text}">${esc(st.title)}</strong><br>${esc(st.text)}</td>
</tr>`,
    )
    .join('')
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${esc(o.subject)}</title></head>
<body style="margin:0;padding:0;background:${C.paper};font-family:${FONT}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(o.preheader ?? o.lines[0] ?? '')}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.paper}"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px">
<tr><td style="padding:0 4px 18px;font-size:24px;font-weight:800;letter-spacing:-0.02em"><span style="color:${C.ink}">Paise</span><span style="color:${C.brand}">Guru</span></td></tr>
<tr><td style="background:${C.card};border:1px solid ${C.line};border-radius:18px;padding:28px 24px">
${o.heading ? `<h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;font-weight:700;color:${C.text}">${esc(o.heading)}</h1>` : ''}
${o.lines.map(p).join('\n')}
${steps ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 8px">${steps}</table>` : ''}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:10px 0 4px"><tr><td style="border-radius:12px;background:${C.brand}"><a href="${esc(o.url)}" style="display:inline-block;padding:14px 24px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px">${esc(o.button)}</a></td></tr></table>
<p style="margin:18px 0 0;font-size:13px;line-height:1.5;color:${C.muted}">${esc(footer)}</p>
</td></tr>
<tr><td style="padding:18px 4px 0;font-size:13px;line-height:1.6;color:${C.muted}">Questions? Reply to this email or write to <a href="mailto:${SUPPORT}" style="color:${C.brand}">${SUPPORT}</a>.<br>PaiseGuru · a product of xtocodex · <a href="https://paiseguru.xtocodex.in" style="color:${C.muted}">paiseguru.xtocodex.in</a></td></tr>
</table></td></tr></table>
</body></html>`
  return { to: o.to, subject: o.subject, text, html }
}

/** Fire-and-forget for mails that must never break the action that triggered them. */
export const notify = (mail: Mail) =>
  sendMail(mail).catch((err) => console.log(JSON.stringify({ level: 'error', msg: 'mail failed', subject: mail.subject, error: String(err) })))
