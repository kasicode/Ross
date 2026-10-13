// Run memory: which engines Ross used recently (for the cooldown) and a short
// log of past runs. Stored on the Railway volume so it survives redeploys.

const fs = require('fs');
const path = require('path');

const DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, 'data');
const FILE = path.join(DIR, 'ross_memory.json');
const MAX_RUNS = 26; // about half a year of weekly runs

function empty() {
  return { engineLastUsed: {}, runs: [] };
}

function load() {
  try {
    const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return { ...empty(), ...data };
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn(`[memory] could not read ${FILE} (${err.message}); starting fresh`);
    return empty();
  }
}

function save(mem) {
  fs.mkdirSync(DIR, { recursive: true });
  const tmp = `${FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(mem, null, 2));
  fs.renameSync(tmp, FILE);
}

function daysSince(iso, now = new Date()) {
  return (now - new Date(iso)) / 86400000;
}

/** Engine ids still in cooldown. */
function coolingDown(mem, cooldownDays, now = new Date()) {
  return new Set(
    Object.entries(mem.engineLastUsed)
      .filter(([, iso]) => daysSince(iso, now) < cooldownDays)
      .map(([id]) => id)
  );
}

function recordRun(mem, { ideas, sourcesOk, now = new Date() }) {
  const stamp = now.toISOString();
  for (const idea of ideas) mem.engineLastUsed[idea.engine_id] = stamp;
  mem.runs.unshift({
    date: stamp,
    sources: sourcesOk,
    ideas: ideas.map((i) => ({ title: i.title, engine_id: i.engine_id, signal: i.signal_title })),
  });
  mem.runs = mem.runs.slice(0, MAX_RUNS);
  return mem;
}

module.exports = { load, save, coolingDown, recordRun, FILE };
