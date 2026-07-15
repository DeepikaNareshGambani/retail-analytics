const cds = require('@sap/cds')
const log = cds.log('ai')

/**
 * Task 4 — LLM provider abstraction.
 *
 * One chat() entry point, three backends tried in order of preference:
 *   1. SAP Generative AI Hub (RPT-1 / orchestration) — used when deployed with a
 *      bound aicore service. Lazy-loaded so the app runs without the SDK locally.
 *   2. OpenAI-compatible HTTP API — used when LLM_API_KEY is set (local dev / any
 *      provider, incl. GenAI Hub's OpenAI-compatible proxy).
 *   3. Deterministic local fallback — no external call. chat() returns
 *      { text: null, provider: 'fallback' } and the caller renders a grounded,
 *      templated answer from the KPI snapshot, so every feature still works.
 *
 * This keeps Tasks 4 fully functional and demoable locally, and "just works"
 * against real RPT-1 once the service binding is present in Cloud Foundry.
 */
async function chat({ system, user, maxTokens = 1200, temperature = 0.2 }) {
  if (hasGenAIHub()) {
    try { return await viaGenAIHub({ system, user, maxTokens, temperature }) }
    catch (e) { log.warn('GenAI Hub call failed, trying next provider:', e.message) }
  }
  if (process.env.LLM_API_KEY) {
    try { return await viaOpenAICompatible({ system, user, maxTokens, temperature }) }
    catch (e) { log.warn('LLM API call failed, falling back:', e.message) }
  }
  return { text: null, provider: 'fallback' }
}

// True when a Generative AI Hub / AI Core binding looks present (deployed).
function hasGenAIHub() {
  if (process.env.AICORE_SERVICE_KEY) return true
  try {
    const xsenv = require('@sap/xsenv')
    const svc = xsenv.filterServices ? xsenv.filterServices({ label: 'aicore' }) : []
    return Array.isArray(svc) && svc.length > 0
  } catch { return false }
}

// SAP Generative AI Hub via the AI SDK orchestration client (RPT-1 capable).
// Lazily required — absent locally, present once added for deployment.
async function viaGenAIHub({ system, user, maxTokens, temperature }) {
  let orchestration
  try { orchestration = require('@sap-ai-sdk/orchestration') }
  catch { throw new Error('@sap-ai-sdk/orchestration not installed') }

  const { OrchestrationClient } = orchestration
  const model = process.env.GENAI_MODEL || 'gpt-4o'
  const client = new OrchestrationClient({
    llm: { model_name: model, model_params: { max_tokens: maxTokens, temperature } },
    templating: {
      template: [
        { role: 'system', content: '{{?system}}' },
        { role: 'user', content: '{{?user}}' },
      ],
    },
  })
  const res = await client.chatCompletion({ inputParams: { system, user } })
  return { text: res.getContent(), provider: `genai-hub:${model}` }
}

// Any OpenAI-compatible /chat/completions endpoint.
async function viaOpenAICompatible({ system, user, maxTokens, temperature }) {
  const base  = (process.env.LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')
  const model = process.env.LLM_MODEL || 'gpt-4o-mini'
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.LLM_API_KEY}` },
    body: JSON.stringify({
      model, max_tokens: maxTokens, temperature,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    }),
  })
  if (!res.ok) throw new Error(`LLM ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const j = await res.json()
  const text = j.choices?.[0]?.message?.content
  if (!text) throw new Error('LLM returned no content')
  return { text, provider: `openai:${model}` }
}

module.exports = { chat, hasGenAIHub }
