// Sends the two confirmation emails (one to you, one to her) through the EmailJS REST API.
// It runs on Vercel (function at /api/send-confirmation), so the EmailJS keys and your
// email address never reach the browser.
//
// Environment variables (Vercel → Project → Settings → Environment Variables):
//   EMAILJS_PUBLIC_KEY, EMAILJS_PRIVATE_KEY, EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, MY_EMAIL
//   HER_EMAIL (optional): when set, her copy only ever goes to this address.
//
// The EmailJS template only needs: Subject {{subject}}, Content {{{html}}},
// To Email {{to_email}}, From Name {{from_name}}, Reply To {{reply_to}}.

const EMAILJS_URL = 'https://api.emailjs.com/api/v1.0/email/send';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const POSTER_RE = /^\/[\w-]+\.(jpe?g|png|webp)$/i;
const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = 'Helvetica, Arial, sans-serif';

export async function POST(request) {

  const env = (name) => String(process.env[name] || '').trim();
  const missing = ['EMAILJS_PUBLIC_KEY', 'EMAILJS_SERVICE_ID', 'EMAILJS_TEMPLATE_ID', 'MY_EMAIL'].filter((name) => !env(name));
  if (missing.length) return json(500, { code: 'config', error: `Missing environment variables: ${missing.join(', ')}` });

  let input;
  try {
    input = await request.json();
  } catch (err) {
    return json(400, { error: 'Invalid JSON' });
  }
  if (!input || typeof input !== 'object') return json(400, { error: 'Invalid JSON' });
  const data = readInput(input);
  if (data.error) return json(400, { error: data.error });

  const myEmail = env('MY_EMAIL');
  const herEmail = env('HER_EMAIL') || data.herEmail;
  if (data.send.includes('her') && !EMAIL_RE.test(herEmail)) return json(400, { error: "Her email address doesn't look right" });

  const sent = {};
  for (const [i, who] of data.send.entries()) {
    if (i > 0) await sleep(1100); // EmailJS allows one request per second
    const email = buildEmail(data, who);
    const body = {
      service_id: env('EMAILJS_SERVICE_ID'),
      template_id: env('EMAILJS_TEMPLATE_ID'),
      user_id: env('EMAILJS_PUBLIC_KEY'),
      template_params: {
        to_email: who === 'me' ? myEmail : herEmail,
        reply_to: who === 'me' ? herEmail : myEmail,
        from_name: data.myName,
        subject: email.subject,
        html: email.html,
      },
    };
    if (env('EMAILJS_PRIVATE_KEY')) body.accessToken = env('EMAILJS_PRIVATE_KEY');
    try {
      const res = await fetch(EMAILJS_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const detail = (await res.text()).slice(0, 300);
        return json(502, { sent, error: `EmailJS replied ${res.status}: ${detail}` });
      }
    } catch (err) {
      return json(502, { sent, error: 'Could not reach EmailJS' });
    }
    sent[who] = true;
  }
  return json(200, { sent });
}

/* ---------- Input: everything from the page is capped and checked ---------- */
function readInput(input) {
  const requested = Array.isArray(input.send) ? input.send : ['me', 'her'];
  const send = ['me', 'her'].filter((who) => requested.includes(who));
  if (!send.length) return { error: 'Nothing to send' };
  const start = new Date(clean(input.start, 40));
  return {
    send,
    herEmail: clean(input.herEmail, 120),
    herName: clean(input.herName, 60) || 'You',
    myName: clean(input.myName, 40) || 'Me',
    platform: clean(input.platform, 200),
    type: clean(input.type, 60),
    genres: clean(input.genres, 200),
    countries: clean(input.countries, 200),
    dateText: clean(input.dateText, 60),
    timeText: clean(input.timeText, 20),
    start: Number.isNaN(start.getTime()) ? null : start,
    snacks: clean(input.snacks, 300),
    cozy: clean(input.cozy, 80),
    note: clean(input.note, 500, true),
    picks: (Array.isArray(input.picks) ? input.picks : []).slice(0, 3).map((p) => {
      const pick = p && typeof p === 'object' ? p : {};
      return {
        title: clean(pick.title, 120) || 'Untitled',
        year: /^\d{4}$/.test(String(pick.year)) ? String(pick.year) : '',
        mediaType: pick.mediaType === 'tv' ? 'tv' : 'movie',
        rating: Math.max(0, Math.min(10, Number(pick.rating) || 0)),
        poster: POSTER_RE.test(String(pick.poster)) ? String(pick.poster) : '',
        winner: pick.winner === true,
      };
    }),
  };
}

function clean(value, max, keepNewlines) {
  let s = String(value == null ? '' : value).replace(/\r\n?/g, '\n');
  s = keepNewlines ? s.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, ' ').replace(/\n{3,}/g, '\n\n') : s.replace(/[\u0000-\u001F\u007F]/g, ' ');
  return s.replace(/[ \t]+/g, ' ').trim().slice(0, max);
}

/* ---------- The email itself ---------- */
function buildEmail(d, who) {
  const forMe = who === 'me';
  const when = [d.dateText, d.timeText].filter(Boolean).join(' at ');
  const subject = (forMe ? `${d.herName} said yes` : 'Our date night') + (when ? `: ${when}` : '');
  const preheader = forMe ? `Here's everything ${d.herName} picked for your date night.` : "Thank you for saying yes. Here's everything we planned.";
  const intro = forMe
    ? `${d.herName} said yes 🥹 Here's everything she picked for your date night:`
    : "Thank you for saying yes 💕 Here's everything we planned, so it's all in one place:";
  const rows = [
    ['When', when],
    ['Streaming on', d.platform],
    ['Watching', d.type],
    ['Genres', d.genres],
    ['Vibe', d.countries],
    ['Snacks', d.snacks],
    ['Cozy level', d.cozy],
    ['Note', d.note === '—' ? '' : d.note],
  ].filter(([, value]) => value);
  const calUrl = calendarUrl(d, forMe);

  const rowHtml = rows.map(([label, value], i) => `
        <tr><td style="padding:12px 18px;${i < rows.length - 1 ? 'border-bottom:1px dashed #ead8bd;' : ''}">
          <div style="font-family:${SANS};font-size:10px;line-height:14px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:#a3385b;">${esc(label)}</div>
          <div style="font-family:${SANS};font-size:15px;line-height:22px;color:#3a1622;padding-top:3px;">${esc(value).replace(/\n/g, '<br>')}</div>
        </td></tr>`).join('');

  const pickHtml = d.picks.map((p) => {
    const meta = [p.year, p.mediaType === 'tv' ? 'Series' : 'Movie', p.rating ? `★ ${p.rating.toFixed(1)}` : ''].filter(Boolean).join(' · ');
    const poster = p.poster
      ? `<img src="https://image.tmdb.org/t/p/w154${p.poster}" width="60" height="90" alt="${esc(p.title)}" style="display:block;width:60px;height:90px;border:0;border-radius:8px;">`
      : '<div style="width:60px;height:90px;border-radius:8px;background-color:#6c1d39;font-size:26px;line-height:90px;text-align:center;">🎬</div>';
    return `
        <tr>
          <td width="60" valign="top" style="padding:8px 14px 8px 0;">${poster}</td>
          <td valign="middle" style="padding:8px 0;">
            <div style="font-family:${SERIF};font-size:17px;line-height:23px;font-weight:bold;color:#3a1622;">${esc(p.title)}</div>
            <div style="font-family:${SANS};font-size:13px;line-height:19px;color:#7a5260;padding-top:2px;">${esc(meta)}</div>
            ${p.winner ? `<div style="font-family:${SANS};font-size:12px;line-height:18px;color:#b07a2a;padding-top:3px;">👑 The wheel picked this one</div>` : ''}
          </td>
        </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f7e1e6;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${esc(preheader)}${'&#8204;&nbsp;'.repeat(40)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f7e1e6;">
<tr><td align="center" style="padding:28px 12px 32px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#fffaf3;border-radius:18px;">
    <tr><td align="center" style="background-color:#4e1328;border-radius:18px 18px 0 0;padding:30px 24px 26px;">
      <div style="font-family:${SANS};font-size:11px;line-height:14px;font-weight:bold;letter-spacing:4px;text-transform:uppercase;color:#e8c07c;">Admit two</div>
      <div style="font-family:${SERIF};font-size:30px;line-height:38px;font-weight:bold;color:#fffaf3;padding-top:10px;">It's a date 💕</div>
      ${when ? `<div style="font-family:${SANS};font-size:15px;line-height:22px;color:#f8cfd9;padding-top:6px;">${esc(when)}</div>` : ''}
    </td></tr>
    <tr><td style="padding:28px 28px 6px;font-family:${SANS};font-size:16px;line-height:25px;color:#3a1622;">
      <p style="margin:0 0 8px;">Hi ${esc(forMe ? d.myName : d.herName)},</p>
      <p style="margin:0;">${esc(intro)}</p>
    </td></tr>
    <tr><td style="padding:18px 28px 4px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#fdf3e6;border:1px dashed #e2c9a8;border-radius:14px;">${rowHtml}
      </table>
    </td></tr>${pickHtml ? `
    <tr><td style="padding:24px 28px 4px;">
      <div style="font-family:${SERIF};font-size:20px;line-height:26px;font-weight:bold;color:#3a1622;padding-bottom:6px;">Our picks 🍿</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${pickHtml}
      </table>
    </td></tr>` : ''}${calUrl ? `
    <tr><td align="center" style="padding:24px 28px 4px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td align="center" bgcolor="#e8456f" style="border-radius:999px;">
          <a href="${esc(calUrl)}" target="_blank" style="display:inline-block;padding:13px 28px;font-family:${SANS};font-size:15px;line-height:18px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:999px;">Add it to my calendar 📅</a>
        </td>
      </tr></table>
    </td></tr>` : ''}
    <tr><td align="center" style="padding:24px 28px 32px;">
      <div style="font-family:${SERIF};font-size:20px;line-height:28px;font-style:italic;color:#a3385b;">${forMe ? 'Go make it special 💕' : "Can't wait to see you 💕"}</div>${forMe ? '' : `
      <div style="font-family:${SERIF};font-size:17px;line-height:24px;color:#3a1622;padding-top:4px;">${esc(d.myName)}</div>`}
    </td></tr>
  </table>
  <div style="font-family:${SANS};font-size:12px;line-height:18px;color:#9a7480;padding-top:16px;">Sent from our little date-night invitation.</div>
</td></tr>
</table>
</body>
</html>`;
  return { subject, html };
}

function calendarUrl(d, forMe) {
  if (!d.start) return '';
  const end = new Date(d.start.getTime() + 3 * 3600 * 1000);
  const stamp = (date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const details = [
    d.platform && `Streaming on: ${d.platform}`,
    d.type && `Watching: ${d.type}`,
    ...d.picks.map((p, i) => `${i + 1}. ${p.title}`),
  ].filter(Boolean).join('\n');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `Date night with ${forMe ? d.herName : d.myName} 💕`,
    dates: `${stamp(d.start)}/${stamp(end)}`,
    details,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

/* ---------- Helpers ---------- */
function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function json(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}
