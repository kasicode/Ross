// Step 2: turn each pairing into a format hook with a repeatable mechanic.

const { callTool } = require('./llm');
const { engineId, signalId, firstArray } = require('./ids');

const LANGUAGES = { en: 'English', nl: 'Dutch (Nederlands)' };

const IDEA = {
  type: 'object',
  properties: {
    engine_id: { type: 'string' },
    signal_id: { type: 'string' },
    title: { type: 'string', description: 'Working title, max 5 words' },
    logline: { type: 'string', description: 'One or two sentences a commissioner understands instantly' },
    friends_pitch: { type: 'string', description: 'Pitch-room shorthand: "It\'s The One Where ..., but ..."' },
    why_now: { type: 'string', description: 'How the signal makes this timely in the Netherlands' },
    mechanic: { type: 'string', description: 'What happens in EVERY episode, so it can run for 8+ episodes' },
    episode_arc: { type: 'string', description: 'Beginning, escalation and reveal of a typical episode' },
    season_arc: { type: 'string', description: 'What builds across the season' },
    cast: { type: 'string', description: 'Who takes part and why they are castable in NL' },
    genre: { type: 'string', description: 'e.g. docusoap, dating, social experiment, gameshow, competition reality' },
    repeatability: { type: 'integer', minimum: 1, maximum: 5 },
    castability: { type: 'integer', minimum: 1, maximum: 5 },
    feasibility: { type: 'integer', minimum: 1, maximum: 5, description: 'Budget and production realism for a Dutch broadcaster/streamer' },
    consent_flag: { type: 'boolean', description: 'True if the format relies on deceiving participants or exposing third parties' },
    consent_note: { type: 'string', description: 'If flagged: how consent and aftercare would be handled; else empty' },
  },
  required: [
    'engine_id', 'signal_id', 'title', 'logline', 'friends_pitch', 'why_now', 'mechanic', 'episode_arc',
    'season_arc', 'cast', 'genre', 'repeatability', 'castability', 'feasibility', 'consent_flag', 'consent_note',
  ],
};

const SCHEMA = { type: 'object', properties: { ideas: { type: 'array', items: IDEA } }, required: ['ideas'] };

const SYSTEM = `You are a senior unscripted format developer at Fremantle Netherlands, pitching to RTL/Videoland, DPG/SBS, NPO and streamers.
You turn a Friends plotline engine plus a current Dutch signal into an original reality format.
Hard rules:
- A Friends plot happens once; a format must repeat. The mechanic must work with a NEW set of people or a new round every episode.
- Real people, real stakes. Use Dutch settings and culture (Sinterklaas, verjaardagen in de kring, fietsen, Koningsdag, Waddeneilanden...), not American ones.
- Never build a format on humiliating a specific real person, on minors in romantic or sexual situations, or on deceiving people without a consent plan.
- Stakes: every format needs something real to win or lose (money, a prize, a home, a relationship decision with consequences) AND a reason to keep watching across episodes (elimination, a running score, a serialised cast or a season-long question). Low-stakes "nice" observational ideas are not good enough.
- Consistency: title, logline, friends_pitch and mechanic must describe the SAME format. Write the mechanic first in your head, then derive the logline from it.
- Facts: why_now may only use facts that appear in the signal text or the calendar date given. Do not add numbers, plans, protests, laws or events that are not in the signal. If the signal is thin, say what the cultural mood is without inventing specifics.
- Commissioners: aim each idea at one of the commissioner mandates below and make it fit that mandate (audience, tone, budget, episode structure). If you aim at Videoland, write for its target audience, not for a general family audience.
- Scores must discriminate. Score each idea relative to the others in this batch: across the batch, use at most two 5s, and give at least two ideas a 3 or lower on some dimension. A 5 means you would fight for it in a commissioning meeting; a 3 means it needs real work.`;

function mandateSummary(profiles) {
  if (!profiles || !profiles.length) return 'No commissioner profiles available.';
  return profiles.map((p) => `${p.id}: ${p.raw.length > 1500 ? `${p.raw.slice(0, 1500)}…` : p.raw}`).join('\n\n');
}

async function writeIdeas({ pairings, enginesById, signalsById, profiles = [], language = 'en' }) {
  const lang = LANGUAGES[language] || LANGUAGES.en;
  const blocks = pairings.map((p, i) => {
    const e = enginesById.get(p.engine_id);
    const s = signalsById.get(p.signal_id);
    return `#${i + 1}
engine_id: ${e.id}
Friends episode: ${e.title} (S${e.season}E${e.episode})
Plotline: ${e.plot}
Engine: trigger=${e.trigger}; tension=${e.tension.join(' + ')}; stakes=${e.stakes}; reveal=${e.reveal}; relationship=${e.relationship}; setting=${e.setting}
signal_id: ${s.id}
Signal (${s.source}): ${s.title}${s.detail ? ` — ${s.detail}` : ''}
Why they spark: ${p.spark}`;
  });

  const prompt = `COMMISSIONER MANDATES:
${mandateSummary(profiles)}

Write one format idea for each pairing below. Write all text fields in ${lang}.
Keep engine_id and signal_id exactly as given.

${blocks.join('\n\n')}`;

  const out = await callTool({ system: SYSTEM, prompt, name: 'format_ideas', schema: SCHEMA, maxTokens: 16000 });
  const wanted = new Set(pairings.map((p) => p.engine_id));
  const num = (v, d = 3) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.max(1, Math.min(5, n)) : d;
  };
  const ideas = firstArray(out, 'ideas')
    .filter((i) => i && typeof i === 'object')
    .map((i) => ({
      ...i,
      engine_id: engineId(i.engine_id),
      signal_id: signalId(i.signal_id),
      repeatability: num(i.repeatability),
      castability: num(i.castability),
      feasibility: num(i.feasibility),
      consent_flag: i.consent_flag === true || i.consent_flag === 'true',
    }))
    .filter((i) => wanted.has(i.engine_id) && signalsById.has(i.signal_id) && i.title);
  if (!ideas.length) console.warn(`[writer] no usable ideas; raw output: ${JSON.stringify(out).slice(0, 800)}`);
  return ideas;
}

module.exports = { writeIdeas, IDEA };
