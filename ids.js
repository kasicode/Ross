// Extract clean ids from whatever the model wrote ("sig-12 | google-news" -> "sig-12").

const ENGINE_RE = /s\d{2}e\d{2}-[a-z]/i;
const SIGNAL_RE = /(sig-\d+|cal-[a-z][a-z-]*[a-z])/i;

function engineId(v) {
  const m = String(v ?? '').match(ENGINE_RE);
  return m ? m[0].toLowerCase() : '';
}

function signalId(v) {
  const m = String(v ?? '').match(SIGNAL_RE);
  return m ? m[1].toLowerCase() : '';
}

/** Find the first array in an object (handles {pairings:[...]}, {items:[...]}, or a bare array). */
function parseMaybe(v) {
  if (typeof v !== 'string' || !/^\s*[[{]/.test(v)) return v;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}

function firstArray(obj, preferred) {
  obj = parseMaybe(obj);
  if (Array.isArray(obj)) return obj;
  if (!obj || typeof obj !== 'object') return [];
  const pref = parseMaybe(obj[preferred]);
  if (Array.isArray(pref)) return pref;
  for (const v of Object.values(obj)) {
    const parsed = parseMaybe(v);
    if (Array.isArray(parsed)) return parsed;
  }
  return [];
}

module.exports = { engineId, signalId, firstArray };
