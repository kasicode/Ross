// Step 3: quality gates.
//  - local shortlist of the most similar existing formats (tags + word overlap)
//  - one Claude review call: is it too close to an existing format, and which
//    commissioner profile (if any) fits best
//  - drop weak or derivative ideas and rank the rest

const fs = require('fs');
const path = require('path');
const { callTool } = require('./llm');

const STOP = new Set(
  ('the and for with that this from into their they them are was were has have who what when where which while ' +
    'een het van de en in op met voor die dat zijn niet ook maar als bij naar aan over door hun zij wie wat wordt worden ' +
    'show series format each every episode contestants participants people').split(' ')
);

function words(s) {
  return new Set(
    String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 3 && !STOP.has(w))
  );
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return inter / (a.size + b.size - inter);
}

function tagScore(engine, f) {
  let s = engine.tension.filter((t) => f.tension.includes(t)).length * 2;
  if (engine.relationship === f.relationship) s += 1;
  if (engine.trigger === f.trigger) s += 1;
  return s;
}

/** Top-k existing formats most similar to an idea. */
function shortlist(idea, engine, formats, k = 8) {
  const iw = words(`${idea.title} ${idea.logline} ${idea.mechanic} ${idea.genre}`);
  return formats
    .map((f) => ({ f, score: jaccard(iw, f._words) * 10 + tagScore(engine, f) * 0.5 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((x) => x.f);
}

// Commissioner profiles live at the repo root as profile_<name>.json
// (e.g. profile_videoland.json), so the repo stays completely flat.
// A profiles/ folder is still read too, if one exists.
function loadProfiles(root = __dirname) {
  const files = [];
  for (const f of fs.readdirSync(root)) {
    const m = f.match(/^profile_(.+)\.json$/i);
    if (m) files.push({ id: m[1].toLowerCase(), file: path.join(root, f) });
  }
  const sub = path.join(root, 'profiles');
  if (fs.existsSync(sub)) {
    for (const f of fs.readdirSync(sub)) {
      if (f.endsWith('.json')) files.push({ id: path.basename(f, '.json').toLowerCase(), file: path.join(sub, f) });
    }
  }
  const seen = new Set();
  return files
    .filter(({ id }) => (seen.has(id) ? false : seen.add(id)))
    .map(({ id, file }) => {
      try {
        const raw = fs.readFileSync(file, 'utf8');
        JSON.parse(raw); // validate
        return { id, raw: raw.length > 6000 ? raw.slice(0, 6000) : raw };
      } catch (err) {
        console.warn(`[review] skipping profile ${path.basename(file)}: ${err.message}`);
        return null;
      }
    })
    .filter(Boolean);
}

const SCHEMA = {
  type: 'object',
  properties: {
    reviews: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          engine_id: { type: 'string' },
          too_close: { type: 'boolean', description: 'True if a listed existing format has essentially the same mechanic' },
          closest_format: { type: 'string', description: 'Title of the most similar listed format' },
          difference: { type: 'string', description: 'What makes this idea different from that format (or why it is not)' },
          commissioner: { type: 'string', description: 'Best-fitting profile id, or "none"' },
          commissioner_fit: { type: 'string', description: 'One sentence on why it fits that mandate, or why none do' },
          fit_score: { type: 'integer', minimum: 1, maximum: 5, description: 'How strongly the best commissioner would want this: 1 = no fit, 3 = moderate, 5 = squarely in mandate' },
          coherent: { type: 'boolean', description: 'False if title, logline, pitch and mechanic describe different formats or contradict each other' },
          invented_facts: { type: 'boolean', description: 'True if why_now states specific facts (numbers, plans, events, laws) that are not in the signal text' },
        },
        required: ['engine_id', 'too_close', 'closest_format', 'difference', 'commissioner', 'commissioner_fit', 'fit_score', 'coherent', 'invented_facts'],
      },
    },
  },
  required: ['reviews'],
};

async function review({ ideas, enginesById, signalsById = new Map(), formats, profiles, language = 'en' }) {
  for (const f of formats) if (!f._words) f._words = words(`${f.title} ${f.syn} ${f.genre}`);
  const lists = ideas.map((idea) => shortlist(idea, enginesById.get(idea.engine_id), formats));

  const profileText = profiles.length
    ? profiles.map((p) => `PROFILE ${p.id}:\n${p.raw}`).join('\n\n')
    : 'No commissioner profiles available — answer "none" for commissioner.';

  const prompt = `Review these new format ideas. Write text fields in ${language === 'nl' ? 'Dutch' : 'English'}.

COMMISSIONER PROFILES:
${profileText}

IDEAS (each with the most similar formats from our 1,085-title database):
${ideas
  .map(
    (idea, i) => `#${i + 1} engine_id: ${idea.engine_id}
Title: ${idea.title}
Logline: ${idea.logline}
Friends pitch: ${idea.friends_pitch}
Mechanic: ${idea.mechanic}
Genre: ${idea.genre}
Why now: ${idea.why_now}
Signal it was based on: ${(() => { const sg = signalsById.get(idea.signal_id); return sg ? `${sg.title}${sg.detail ? ` — ${sg.detail}` : ''}` : 'unknown'; })()}
Similar existing formats:
${lists[i].map((f) => `- ${f.title} (${f.genre}): ${String(f.syn || '').slice(0, 220)}`).join('\n')}`
  )
  .join('\n\n')}

For each idea: mark too_close only when an existing format already delivers the same repeatable mechanic with the same kind of cast — a shared genre or setting is not enough.
Pick the commissioner whose mandate fits best and respect any rules written in the profiles. Be strict with fit_score: a 4 or 5 only when the idea squarely matches that commissioner's stated audience and needs.
Mark coherent=false when title, logline, Friends pitch and mechanic do not describe one and the same format.
Mark invented_facts=true when why_now contains specific facts that are not in the signal text.`;

  const out = await callTool({ system: 'You are a rigorous format-acquisitions reviewer at Fremantle.', prompt, name: 'reviews', schema: SCHEMA, maxTokens: 4000 });
  const byEngine = new Map((out.reviews || []).map((r) => [r.engine_id, r]));
  return ideas.map((idea) => ({ ...idea, review: byEngine.get(idea.engine_id) || null }));
}

function score(idea) {
  const fit = idea.review && Number.isInteger(idea.review.fit_score) ? idea.review.fit_score : 2;
  return idea.repeatability * 2 + idea.castability + idea.feasibility + fit * 2;
}

/** Apply hard gates and rank. Returns { kept, dropped }. */
function gate(ideas, { finalCount = 6, minRepeatability = 3 } = {}) {
  const kept = [];
  const dropped = [];
  for (const idea of ideas) {
    if (idea.repeatability < minRepeatability) dropped.push({ idea, reason: `repeatability ${idea.repeatability}/5` });
    else if (idea.review && idea.review.too_close) dropped.push({ idea, reason: `too close to ${idea.review.closest_format}` });
    else if (idea.review && idea.review.coherent === false) dropped.push({ idea, reason: 'logline and mechanic contradict each other' });
    else kept.push(idea);
  }
  kept.sort((a, b) => score(b) - score(a));
  return { kept: kept.slice(0, finalCount), dropped };
}

module.exports = { review, gate, shortlist, loadProfiles, words, score };
