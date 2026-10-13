// Step 4: the weekly email. Defensive formatting: every field is optional here,
// so one incomplete idea can never crash the send.

const { Resend } = require('resend');

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const dots = (n) => {
  const v = Math.max(0, Math.min(5, Number(n) || 0));
  return '●'.repeat(v) + '○'.repeat(5 - v);
};

function ideaCard(idea, i) {
  const r = idea.review || {};
  const row = (label, value) =>
    value ? `<tr><td style="padding:4px 12px 4px 0;color:#6b6b6b;vertical-align:top;white-space:nowrap;font-size:13px">${label}</td><td style="padding:4px 0;font-size:14px;line-height:1.5">${esc(value)}</td></tr>` : '';
  return `
  <div style="border:1px solid #e4e1da;border-radius:10px;padding:20px 22px;margin:0 0 18px;background:#ffffff">
    <div style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#a0522d;margin-bottom:6px">#${i + 1} · ${esc(idea.genre)}</div>
    <div style="font-size:20px;font-weight:700;color:#1d1d1d;margin-bottom:6px">${esc(idea.title)}</div>
    <div style="font-size:15px;line-height:1.55;color:#1d1d1d;margin-bottom:10px">${esc(idea.logline)}</div>
    <div style="font-size:14px;font-style:italic;color:#4a4a4a;margin-bottom:14px">${esc(idea.friends_pitch)}</div>
    <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%">
      ${row('Why now', idea.why_now)}
      ${row('Every episode', idea.mechanic)}
      ${row('Episode arc', idea.episode_arc)}
      ${row('Season arc', idea.season_arc)}
      ${row('Cast', idea.cast)}
      ${row('Closest format', r.closest_format ? `${r.closest_format} — ${r.difference || ''}` : '')}
      ${row('Commissioner', r.commissioner && r.commissioner !== 'none' ? `${r.commissioner} — ${r.commissioner_fit || ''}` : r.commissioner_fit)}
      ${r.invented_facts ? row('⚠ Check facts', 'The why-now may contain details that were not in the source signal — verify before pitching') : ''}
      ${idea.consent_flag ? row('⚠ Consent', idea.consent_note || 'Relies on deception or third parties — needs a consent plan') : ''}
    </table>
    <div style="font-size:12px;color:#6b6b6b;margin-top:12px;font-family:monospace">
      repeatable ${dots(idea.repeatability)} &nbsp; castable ${dots(idea.castability)} &nbsp; feasible ${dots(idea.feasibility)}${r.fit_score ? ` &nbsp; commissioner fit ${dots(r.fit_score)}` : ''}
    </div>
    <div style="font-size:12px;color:#8a8a8a;margin-top:6px">Source: ${esc(idea.engine_title)} · ${esc(idea.signal_source)}: ${esc(idea.signal_title)}</div>
  </div>`;
}

function renderEmail({ ideas, dropped = [], sourcesOk = {}, date = new Date() }) {
  const day = date.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Amsterdam' });
  const sourceLine = `Google Trends ${sourcesOk.googleTrends ?? 0} · Google News ${sourcesOk.googleNews ?? 0} · calendar ${sourcesOk.calendar ?? 0}`;
  const droppedHtml = dropped.length
    ? `<div style="font-size:13px;color:#6b6b6b;margin-top:8px"><strong>Filtered out (${dropped.length}):</strong> ${dropped
        .map((d) => `${esc(d.idea.title)} (${esc(d.reason)})`)
        .join(' · ')}</div>`
    : '';
  const html = `<!doctype html><html><body style="margin:0;background:#f6f4ef;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1d1d1d">
  <div style="max-width:680px;margin:0 auto;padding:28px 16px">
    <div style="font-size:26px;font-weight:800;margin-bottom:2px">Ross</div>
    <div style="font-size:14px;color:#6b6b6b;margin-bottom:22px">Every reality show is secretly a Friends episode · ${esc(day)}</div>
    ${ideas.length ? ideas.map(ideaCard).join('') : '<p>No ideas passed the gates this week.</p>'}
    <div style="border-top:1px solid #e4e1da;padding-top:12px;font-size:12px;color:#8a8a8a">Signals this week: ${esc(sourceLine)}</div>
    ${droppedHtml}
  </div></body></html>`;
  const text = ideas
    .map((i, n) => `${n + 1}. ${i.title}\n${i.logline}\n${i.friends_pitch}\nEvery episode: ${i.mechanic}\n`)
    .join('\n');
  return { subject: `Ross — ${ideas.length} Friends-powered format ideas (${day})`, html, text };
}

async function sendEmail({ subject, html, text }) {
  const key = process.env.RESEND_API_KEY;
  const to = (process.env.EMAIL_TO || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!key || !to.length) throw new Error('RESEND_API_KEY or EMAIL_TO missing');
  const from = process.env.FROM_EMAIL || 'Ross <onboarding@resend.dev>';
  const { data, error } = await new Resend(key).emails.send({ from, to, subject, html, text });
  if (error) throw new Error(`Resend: ${error.message || JSON.stringify(error)}`);
  return data;
}

module.exports = { renderEmail, sendEmail };
