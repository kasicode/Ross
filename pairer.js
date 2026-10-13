// Step 1 of a run: pick which Friends engines to collide with which signals.
// Engines are sampled with a bias toward under-used ones (saturation weight),
// engines in cooldown are skipped, then Claude chooses the strongest pairings.

const { callTool } = require('./llm');
const { engineId, signalId, firstArray } = require('./ids');

function weightedSample(items, weightOf, n, rand = Math.random) {
  // Efraimidis–Spirakis: key = u^(1/w), take the n largest keys
  return items
    .map((it) => ({ it, key: Math.pow(rand(), 1 / Math.max(weightOf(it), 1e-6)) }))
    .sort((a, b) => b.key - a.key)
    .slice(0, n)
    .map((x) => x.it);
}

function candidateEngines({ engines, saturation, cooling, poolSize = 45, rand }) {
  const eligible = engines.filter((e) => !cooling.has(e.id));
  const weightOf = (e) => {
    const s = saturation.engines[e.id];
    let w = s ? s.weight : 0.3;
    if (e.verify) w *= 0.5; // plot details less certain — use less often
    return w;
  };
  return weightedSample(eligible, weightOf, poolSize, rand);
}

const SCHEMA = {
  type: 'object',
  properties: {
    pairings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          signal_id: { type: 'string' },
          engine_id: { type: 'string' },
          spark: { type: 'string', description: 'One sentence: why this signal and this engine ignite together' },
        },
        required: ['signal_id', 'engine_id', 'spark'],
      },
    },
  },
  required: ['pairings'],
};

const SYSTEM = `You are a format developer at Fremantle Netherlands. Your thesis: every reality show is secretly a Friends episode.
Each Friends plotline has a social engine: a trigger, a tension, stakes and a reveal. Your job is to collide those engines
with what is happening in the Netherlands right now, so the result is both timeless (the engine) and timely (the signal).
Prefer pairings where the signal changes the engine into something new, not where it just decorates it.
Avoid signals about death, crime victims, disasters or individual private people; prefer cultural, social, economic and lifestyle signals.`;

function engineLine(e, sat) {
  const level = sat?.level ? ` [${sat.level}]` : '';
  return `${e.id} | ${e.title} | ${e.plot} | trigger=${e.trigger} tension=${e.tension.join('+')} rel=${e.relationship}${level}`;
}

async function choosePairingsOnce({ signals, candidates, saturation, count = 8 }) {
  const prompt = `THIS WEEK'S SIGNALS (Dutch trends, news and calendar moments):
${signals.map((s) => `${s.id} | ${s.source} | ${s.title}${s.detail ? ` | ${s.detail}` : ''}`).join('\n')}

FRIENDS ENGINES (id | episode | plotline | tags [how crowded this engine already is in existing formats]):
${candidates.map((e) => engineLine(e, saturation.engines[e.id])).join('\n')}

Choose exactly ${count} pairings of one signal and one engine.
Rules:
- Each engine at most once. Each signal at most twice.
- Use a calendar moment in at most two pairings; the rest must use Google Trends or Google News signals.
- Favour engines marked [open] or [light]; use [saturated] only when the signal twists it into something genuinely different.
- Skip signals that are too narrow, too dark or about named private individuals.`;

  const out = await callTool({ system: SYSTEM, prompt, name: 'pairings', schema: SCHEMA, maxTokens: 4000 });
  const sigIds = new Set(signals.map((s) => s.id));
  const engIds = new Set(candidates.map((e) => e.id));
  const usedEngines = new Set();
  const valid = [];
  let calendarUsed = 0;
  // Cap calendar moments at 2, unless the trend/news feeds delivered nothing this week
  const calendarCap = signals.some((s) => !s.id.startsWith('cal-')) ? 2 : Infinity;
  const raw = firstArray(out, 'pairings');
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const p = {
      signal_id: signalId(item.signal_id ?? item.signal ?? item.signalId),
      engine_id: engineId(item.engine_id ?? item.engine ?? item.engineId),
      spark: String(item.spark ?? item.reason ?? item.why ?? ''),
    };
    if (!sigIds.has(p.signal_id) || !engIds.has(p.engine_id) || usedEngines.has(p.engine_id)) continue;
    if (p.signal_id.startsWith('cal-')) {
      if (calendarUsed >= calendarCap) continue;
      calendarUsed++;
    }
    usedEngines.add(p.engine_id);
    valid.push(p);
  }
  if (!valid.length) {
    console.warn(`[pairer] no valid pairings; raw output: ${JSON.stringify(out).slice(0, 800)}`);
    throw new Error('Pairer returned no valid pairings');
  }
  return valid.slice(0, count);
}

async function choosePairings(args) {
  try {
    return await choosePairingsOnce(args);
  } catch (err) {
    console.warn(`[pairer] ${err.message}; retrying once`);
    return choosePairingsOnce(args);
  }
}

module.exports = { candidateEngines, choosePairings, weightedSample };
