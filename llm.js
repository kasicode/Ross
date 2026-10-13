// Thin wrapper around the Claude API that always returns structured JSON.
//
// Preferred path: force the model to call a tool whose input schema is the shape we want,
// so the answer arrives as a parsed object. Some models don't allow forcing a tool
// (400 "tool_choice ... not supported for this model"). In that case Ross switches to
// tool_choice "auto" with an explicit instruction to call the tool, and as a last resort
// reads JSON from a plain-text answer.

const Anthropic = require('@anthropic-ai/sdk');

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
let client = null;
let forcedToolSupported = true; // flips to false after the first "not supported" error

function getClient() {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set');
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

function extractJson(text) {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function request({ system, prompt, name, schema, maxTokens, forced }) {
  const tool = { name, description: `Return the result as ${name}.`, input_schema: schema };
  const params = {
    model: MODEL,
    max_tokens: maxTokens,
    system: forced
      ? system
      : `${system}\n\nIMPORTANT: respond ONLY by calling the tool "${name}" exactly once with the complete result. Do not write any other text.`,
    tools: [tool],
    tool_choice: forced ? { type: 'tool', name } : { type: 'auto' },
    messages: [{ role: 'user', content: prompt }],
  };
  const res = await getClient().messages.create(params);
  const block = res.content.find((b) => b.type === 'tool_use' && b.name === name);
  if (block) return block.input;

  // Fallback: the model answered in text — try to read JSON from it
  const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  const parsed = extractJson(text);
  if (parsed) return parsed;
  throw new Error(`No ${name} output (stop_reason=${res.stop_reason})`);
}

/**
 * Ask Claude for structured output.
 * @returns {Promise<object>} an object matching `schema`
 */
async function callTool({ system, prompt, name, schema, maxTokens = 4000 }, attempt = 1) {
  try {
    return await request({ system, prompt, name, schema, maxTokens, forced: forcedToolSupported });
  } catch (err) {
    const msg = String((err && err.message) || '');
    if (forcedToolSupported && err && err.status === 400 && /tool_choice/i.test(msg)) {
      console.warn(`[llm] model ${MODEL} does not support forced tool use; switching to auto tool choice`);
      forcedToolSupported = false;
      return callTool({ system, prompt, name, schema, maxTokens }, attempt);
    }
    const status = err && err.status;
    const retryable = !status || status === 429 || status >= 500 || /No .* output/.test(msg);
    if (attempt < 3 && retryable) {
      const wait = 2000 * attempt;
      console.warn(`[llm] ${name} failed (${msg}); retrying in ${wait}ms`);
      await new Promise((r) => setTimeout(r, wait));
      return callTool({ system, prompt, name, schema, maxTokens }, attempt + 1);
    }
    throw err;
  }
}

module.exports = { callTool, MODEL, extractJson };
