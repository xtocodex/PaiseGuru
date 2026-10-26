// Outgoing mail through Resend's HTTP API. Without RESEND_API_KEY (dev) and always in tests, mail is
// logged and kept in `outbox` instead, so tests can follow the links.

export type Mail = { to: string; subject: string; text: string; html: string }

const FROM = 'PaiseGuru <noreply@paiseguru.xtocodex.in>'
const REPLY_TO = 'xtocodex@gmail.com'

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
    body: JSON.stringify({ from: FROM, reply_to: REPLY_TO, ...mail }),
  })
  if (!res.ok) throw new Error(`mail failed: ${res.status} ${await res.text()}`)
}

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`)

/** One short message with one button. `lines` are plain text; they are escaped for the HTML part. */
export function message(o: { to: string; subject: string; lines: string[]; button: string; url: string; footer?: string }): Mail {
  const footer = o.footer ?? "If you didn't ask for this, you can ignore this email."
  return {
    to: o.to,
    subject: o.subject,
    text: [...o.lines, '', `${o.button}: ${o.url}`, '', footer, '', '— PaiseGuru, a product of xtocodex'].join('\n'),
    html: `<div style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.5;color:#1c1917;max-width:480px">
${o.lines.map((l) => `<p>${esc(l)}</p>`).join('\n')}
<p><a href="${esc(o.url)}" style="display:inline-block;background:#23306e;color:#fff;padding:12px 20px;border-radius:12px;text-decoration:none;font-weight:600">${esc(o.button)}</a></p>
<p style="font-size:13px;color:#78716c">${esc(footer)}<br>— PaiseGuru, a product of xtocodex</p>
</div>`,
  }
}
