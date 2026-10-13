// Ross — weekly reality-format hook engine.
// Collides Friends plotline engines with this week's Dutch signals and emails the best ideas.
//
// Runs as a long-lived worker with a weekly schedule (default Monday 07:50 Amsterdam).
//   node index.js          start the scheduler
//   node index.js --now    run once immediately, then exit
// Env: RUN_ON_START=true runs once at boot (handy for a first test on Railway), DRY_RUN=true
// writes the email to data/preview.html instead of sending and leaves memory untouched.

const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

const { collectSignals } = require('./trendFeed');
const { candidateEngines, choosePairings } = require('./pairer');
const { writeIdeas } = require('./ideaWriter');
const { review, gate, loadProfiles } = require('./reviewer');
const { renderEmail, sendEmail } = require('./email');
const memory = require('./memory');

const CONFIG = {
  schedule: process.env.SCHEDULE || '50 7 * * 1',
  timezone: process.env.TZ_SCHEDULE || 'Europe/Amsterdam',
  pairings: Number(process.env.PAIRINGS || 8),
  finalCount: Number(process.env.FINAL_COUNT || 6),
  cooldownDays: Number(process.env.COOLDOWN_DAYS || 90),
  language: process.env.OUTPUT_LANGUAGE || 'en',
  dryRun: /^(1|true|yes)$/i.test(process.env.DRY_RUN || ''),
};

const load = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, f), 'utf8'));

async function runOnce({ now = new Date() } = {}) {
  const t0 = Date.now();
  console.log(`[ross] run started ${now.toISOString()} (dryRun=${CONFIG.dryRun}, language=${CONFIG.language})`);

  const engines = load('engines.json').engines;
  const saturation = load('saturation.json');
  const formats = load('formats_tagged.json');
  const profiles = loadProfiles();
  const enginesById = new Map(engines.map((e) => [e.id, e]));
  console.log(`[ross] loaded ${engines.length} engines, ${formats.length} formats, ${profiles.length} profiles`);

  const { signals, sourcesOk } = await collectSignals({ now });
  console.log(`[ross] signals: ${JSON.stringify(sourcesOk)}`);
  if (!signals.length) throw new Error('No signals from any source');
  const signalsById = new Map(signals.map((s) => [s.id, s]));

  const mem = memory.load();
  const cooling = memory.coolingDown(mem, CONFIG.cooldownDays, now);
  const candidates = candidateEngines({ engines, saturation, cooling });
  console.log(`[ross] ${cooling.size} engines in cooldown; ${candidates.length} candidates`);

  const pairings = await choosePairings({ signals, candidates, saturation, count: CONFIG.pairings });
  console.log(`[ross] ${pairings.length} pairings`);

  const written = await writeIdeas({ pairings, enginesById, signalsById, language: CONFIG.language });
  console.log(`[ross] ${written.length} ideas written`);
  if (!written.length) throw new Error('Idea writer returned nothing');

  const reviewed = await review({ ideas: written, enginesById, formats, profiles, language: CONFIG.language });
  const { kept, dropped } = gate(reviewed, { finalCount: CONFIG.finalCount });
  for (const d of dropped) console.log(`[ross] dropped "${d.idea.title}": ${d.reason}`);

  const ideas = kept.map((i) => {
    const e = enginesById.get(i.engine_id);
    const s = signalsById.get(i.signal_id);
    return { ...i, engine_title: `${e.title} (S${e.season}E${e.episode})`, signal_title: s.title, signal_source: s.source };
  });

  const mail = renderEmail({ ideas, dropped, sourcesOk, date: now });
  if (CONFIG.dryRun) {
    const out = path.join(__dirname, 'data', 'preview.html');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, mail.html);
    console.log(`[ross] DRY RUN — email written to ${out}`);
  } else {
    const res = await sendEmail(mail);
    console.log(`[ross] email sent (${res && res.id})`);
    memory.save(memory.recordRun(mem, { ideas, sourcesOk, now }));
  }
  console.log(`[ross] done: ${ideas.length} ideas in ${Math.round((Date.now() - t0) / 1000)}s`);
  return { ideas, dropped, mail };
}

async function safeRun() {
  try {
    await runOnce();
  } catch (err) {
    console.error(`[ross] run failed: ${err.stack || err.message}`);
  }
}

if (require.main === module) {
  if (process.argv.includes('--now')) {
    runOnce().then(
      () => process.exit(0),
      (err) => {
        console.error(err.stack || err.message);
        process.exit(1);
      }
    );
  } else {
    if (!cron.validate(CONFIG.schedule)) throw new Error(`Invalid SCHEDULE: ${CONFIG.schedule}`);
    cron.schedule(CONFIG.schedule, safeRun, { timezone: CONFIG.timezone });
    console.log(`[ross] scheduler started: "${CONFIG.schedule}" (${CONFIG.timezone})`);
    if (/^(1|true|yes)$/i.test(process.env.RUN_ON_START || '')) safeRun();
  }
}

module.exports = { runOnce, CONFIG };
