// Thin wrapper around the Claude API that always returns structured JSON.
// Every call forces a tool with a JSON schema, so the answer arrives as a parsed
// object instead of free text — no JSON parsing of Dutch prose, no stray quotes.

const Anthropic = require('@anthropic-ai/sdk');

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
let client = null;

function getClient() {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set');
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

/**
 * Ask Claude for structured output.
 * @param {string} system   system prompt
 * @param {string} prompt   user message
 * @param {string} name     tool name
 * @param {object} schema   JSON schema for the tool input
 * @param {number} maxTokens
 * @returns {Promise<object>} the tool input object
 */
async function callTool({ system, prompt, name, schema, maxTokens = 4000 }, attempt = 1) {
  try {
    const res = await getClient().messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      tools: [{ name, description: `Return the result as ${name}.`, input_schema: schema }],
      tool_choice: { type: 'tool', name },
      messages: [{ role: 'user', content: prompt }],
    });
    const block = res.content.find((b) => b.type === 'tool_use' && b.name === name);
    if (!block) throw new Error(`No ${name} tool output (stop_reason=${res.stop_reason})`);
    return block.input;
  } catch (err) {
    const status = err && err.status;
    const retryable = !status || status === 429 || status >= 500;
    if (attempt < 3 && retryable) {
      const wait = 2000 * attempt;
      console.warn(`[llm] ${name} failed (${err.message}); retrying in ${wait}ms`);
      await new Promise((r) => setTimeout(r, wait));
      return callTool({ system, prompt, name, schema, maxTokens }, attempt + 1);
    }
    throw err;
  }
}

module.exports = { callTool, MODEL };
