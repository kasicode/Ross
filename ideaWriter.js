// Step 2: turn each pairing into a format hook with a repeatable mechanic.

const { callTool } = require('./llm');

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
- Be honest in the scores: a 5 means you would fight for it in a commissioning meeting.`;

async function writeIdeas({ pairings, enginesById, signalsById, language = 'en' }) {
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

  const prompt = `Write one format idea for each pairing below. Write all text fields in ${lang}.
Keep engine_id and signal_id exactly as given.

${blocks.join('\n\n')}`;

  const out = await callTool({ system: SYSTEM, prompt, name: 'format_ideas', schema: SCHEMA, maxTokens: 9000 });
  const wanted = new Set(pairings.map((p) => p.engine_id));
  return (out.ideas || []).filter((i) => wanted.has(i.engine_id) && signalsById.has(i.signal_id));
}

module.exports = { writeIdeas, IDEA };
