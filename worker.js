// Fast-first targets. Tried in order; the first one that answers is streamed back.
// Groq is used first if GROQ_API_KEY is set (fastest). OpenRouter free models are the fallback.
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODELS_URL = "https://api.groq.com/openai/v1/models";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

// Preferences only. Model names change often, so the real list is fetched live from the
// providers (see liveGroqModels / liveFreeOpenRouterModels) and these are just sort hints.
const GROQ_SMART_HINTS = ["llama-3.3-70b", "llama-4", "qwen", "gpt-oss-120b", "kimi", "deepseek"];
const GROQ_FAST_HINTS = ["llama-3.1-8b", "gpt-oss-20b", "llama-3.2"];
const GROQ_SKIP = /whisper|tts|guard|prompt-guard|playai|orpheus|embed|distil-whisper/i;
const OR_HINTS = ["qwen3-coder", "nemotron", "gpt-oss", "deepseek", "llama-3.3", "gemma", "qwen"];
const MAX_OR_TRIES = 6;
const MODEL_CACHE_MS = 10 * 60 * 1000;

// Limits. The website sends the uploaded project inside the system prompt, so these are larger
// than a plain chat needs.
const MAX_BODY = 520000;      // whole request, in characters
const MAX_SYSTEM = 300000;    // system prompt (includes the project files)
const MAX_MESSAGES = 40;
const MAX_MESSAGE = 80000;
const MAX_TOKENS = 12000;      // length of the AI's answer (full files need room)

// GitHub Pages website origin from the supplied screenshot.
const ALLOWED_ORIGINS = ["https://bhimmajhi.github.io"];

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  const allowed = ALLOWED_ORIGINS.includes(origin);
  return {
    "Access-Control-Allow-Origin": allowed ? origin : "null",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Expose-Headers": "X-Model",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function jsonResponse(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...headers
    }
  });
}

const cache = {};
async function cached(name, loader) {
  const hit = cache[name];
  if (hit && Date.now() - hit.t < MODEL_CACHE_MS) return hit.v;
  const v = await loader();
  if (v && v.length) cache[name] = { t: Date.now(), v };
  return v;
}

function rank(id, hints) {
  const i = hints.findIndex(h => id.toLowerCase().includes(h));
  return i === -1 ? hints.length : i;
}

// Chat models this Groq key can really use.
async function liveGroqModels(key) {
  return cached("groq:" + key.slice(-6), async () => {
    const r = await fetch(GROQ_MODELS_URL, { headers: { Authorization: `Bearer ${key}` } });
    if (!r.ok) throw new Error(`Groq model list (${r.status})`);
    const d = await r.json();
    return (d.data || []).filter(m => m.active !== false && !GROQ_SKIP.test(m.id)).map(m => m.id);
  });
}

// Currently free text models on OpenRouter (the public list needs no key).
async function liveFreeOpenRouterModels() {
  return cached("or", async () => {
    const r = await fetch(OPENROUTER_MODELS_URL);
    if (!r.ok) throw new Error(`OpenRouter model list (${r.status})`);
    const d = await r.json();
    return (d.data || [])
      .filter(m => String(m.id).endsWith(":free")
        && Number(m.pricing?.prompt) === 0 && Number(m.pricing?.completion) === 0
        && (m.architecture?.output_modalities || ["text"]).includes("text")
        && (m.context_length || 0) >= 16000)
      .sort((a, b) => rank(a.id, OR_HINTS) - rank(b.id, OR_HINTS) || (b.context_length || 0) - (a.context_length || 0))
      .map(m => m.id);
  });
}

export default {
  async fetch(request, env) {
    const headers = corsHeaders(request);
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    if (url.pathname === "/health" && request.method === "GET") {
      return jsonResponse({ ok: true, service: "Code Agent API" }, 200, headers);
    }

    if (url.pathname !== "/chat") {
      return jsonResponse({ error: "Not found" }, 404, headers);
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405, headers);
    }

    const origin = request.headers.get("Origin") || "";
    if (!ALLOWED_ORIGINS.includes(origin)) {
      return jsonResponse({ error: "Origin not allowed. Check ALLOWED_ORIGINS in worker.js." }, 403, headers);
    }

    if (!env.NVIDIA_API_KEY && !env.OPENROUTER_API_KEY && !env.GROQ_API_KEY) {
      return jsonResponse({ error: "Add NVIDIA_API_KEY (recommended), OPENROUTER_API_KEY, or GROQ_API_KEY secret in Cloudflare." }, 500, headers);
    }

    let body;
    try {
      const raw = await request.text();
      if (raw.length > MAX_BODY) {
        return jsonResponse({ error: "Request too large. Close the project or upload a smaller ZIP." }, 413, headers);
      }
      body = JSON.parse(raw);
    } catch {
      return jsonResponse({ error: "Invalid JSON request." }, 400, headers);
    }

    if (!Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > MAX_MESSAGES) {
      return jsonResponse({ error: "Send between 1 and " + MAX_MESSAGES + " messages." }, 400, headers);
    }

    const messages = [];
    for (const item of body.messages) {
      if (!item || !["user", "assistant"].includes(item.role) || typeof item.content !== "string") {
        return jsonResponse({ error: "Invalid message format." }, 400, headers);
      }
      if (item.content.length > MAX_MESSAGE) {
        return jsonResponse({ error: "Message is too long." }, 413, headers);
      }
      messages.push({ role: item.role, content: item.content });
    }

    const systemText = typeof body.system === "string" ? body.system.trim().slice(0, MAX_SYSTEM) : "";
    const systemPrompt = "You are Code Agent, a helpful AI coding assistant, built by Bhim. Never claim to be ChatGPT, GPT-4 or made by OpenAI; you run on an underlying model chosen in settings. Reply in the user's language. Help users write, understand, debug, and improve code. Give complete, clearly formatted examples when asked. Explain setup steps simply. Be honest: you cannot run commands, test code, or reach the network. When the instructions describe a project workspace, you may propose complete file contents in the file: block format they describe; the website applies those blocks to the user's project.";

    const fullMessages = [
      { role: "system", content: systemText ? systemText + "\n\n" + systemPrompt : systemPrompt },
      ...messages
    ];

    // Auto switch: short chat question with no project loaded -> fast model, otherwise smart model.
    const last = messages[messages.length - 1].content;
    const hasProject = systemText.length > 3000;
    const wantsBig = hasProject || last.length > 600 || /```|\bfile:|\b(fix|build|create|write|refactor|debug|project|app|website|script)\b/i.test(last);

    const errors = [];
    const targets = [];

    // NVIDIA NIM is the preferred provider when its secret is configured.
    if (env.NVIDIA_API_KEY) {
      const nvidiaModel = (typeof body.model === "string" && body.model.trim() && !body.model.endsWith(":free"))
        ? body.model.trim() : (env.NVIDIA_MODEL || "meta/llama-3.3-70b-instruct");
      targets.push({ url: "https://integrate.api.nvidia.com/v1/chat/completions", key: env.NVIDIA_API_KEY, model: nvidiaModel, name: "NVIDIA NIM" });
    }

    // Model picked in the website settings. Only ":free" OpenRouter models are accepted so
    // nobody can spend the owner's credits through the proxy.
    const picked = typeof body.model === "string" ? body.model.trim() : "";
    if (env.OPENROUTER_API_KEY && /^[\w.\-\/]+:free$/.test(picked)) {
      targets.push({ url: OPENROUTER_URL, key: env.OPENROUTER_API_KEY, model: picked, name: "OpenRouter", or: true });
    }

    if (env.GROQ_API_KEY) {
      try {
        const live = await liveGroqModels(env.GROQ_API_KEY);
        const hints = wantsBig ? GROQ_SMART_HINTS : GROQ_FAST_HINTS;
        const other = wantsBig ? GROQ_FAST_HINTS : GROQ_SMART_HINTS;
        const ordered = [...live].sort((x, y) => rank(x, hints) - rank(y, hints) || rank(x, other) - rank(y, other));
        for (const m of ordered.slice(0, 2)) targets.push({ url: GROQ_URL, key: env.GROQ_API_KEY, model: m, name: "Groq" });
      } catch (e) {
        errors.push(String(e.message || e).slice(0, 120));
      }
    }

    if (env.OPENROUTER_API_KEY) {
      try {
        const free = await liveFreeOpenRouterModels();
        for (const m of free) {
          if (targets.length >= MAX_OR_TRIES + 3) break;
          if (!targets.some(t => t.model === m)) targets.push({ url: OPENROUTER_URL, key: env.OPENROUTER_API_KEY, model: m, name: "OpenRouter", or: true });
        }
      } catch (e) {
        errors.push(String(e.message || e).slice(0, 120));
      }
    }

    for (const t of targets) {
      try {
        const h = { "Authorization": `Bearer ${t.key}`, "Content-Type": "application/json" };
        if (t.or) { h["HTTP-Referer"] = "https://bhimmajhi.github.io"; h["X-Title"] = "Code Agent"; }
        const response = await fetch(t.url, {
          method: "POST",
          headers: h,
          body: JSON.stringify({ model: t.model, messages: fullMessages, temperature: 0.3, max_tokens: MAX_TOKENS, stream: true })
        });
        if (!response.ok || !response.body) {
          const data = await response.json().catch(() => ({}));
          errors.push(`${t.name} ${t.model} (${response.status}): ${String(data?.error?.message || data?.message || "failed").slice(0, 120)}`);
          continue;
        }
        return new Response(response.body, {
          status: 200,
          headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache", "X-Model": t.model, ...headers }
        });
      } catch {
        errors.push(`Could not connect to ${t.name} (${t.model}).`);
      }
    }
    const lastError = errors.length ? errors.slice(-4).join(" | ") : "No provider answered.";
    return jsonResponse({ error: lastError }, 502, headers);
  }
};
