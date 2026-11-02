// Fast-first targets. Tried in order; the first one that answers is streamed back.
// Groq is used first if GROQ_API_KEY is set (fastest). OpenRouter free models are the fallback.
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODELS = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "google/gemma-3-27b-it:free",
  "deepseek/deepseek-chat-v3.1:free"
];

// Limits. The website sends the uploaded project inside the system prompt, so these are larger
// than a plain chat needs.
const MAX_BODY = 400000;      // whole request, in characters
const MAX_SYSTEM = 150000;    // system prompt (includes the project files)
const MAX_MESSAGES = 40;
const MAX_MESSAGE = 50000;
const MAX_TOKENS = 4096;      // length of the AI's answer

// GitHub Pages website origin from the supplied screenshot.
const ALLOWED_ORIGINS = ["https://bhimmajhi.github.io"];

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  const allowed = ALLOWED_ORIGINS.includes(origin);
  return {
    "Access-Control-Allow-Origin": allowed ? origin : "null",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
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

    if (!env.OPENROUTER_API_KEY && !env.GROQ_API_KEY) {
      return jsonResponse({ error: "Add OPENROUTER_API_KEY or GROQ_API_KEY secret in Cloudflare." }, 500, headers);
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
    const systemPrompt = "You are Code Agent, a helpful AI coding assistant. Help users write, understand, debug, and improve code. Give complete, clearly formatted examples when asked. Explain setup steps simply. Be honest: you cannot run commands, test code, or reach the network. When the instructions describe a project workspace, you may propose complete file contents in the file: block format they describe; the website applies those blocks to the user's project.";

    const fullMessages = [
      { role: "system", content: systemText ? systemText + "\n\n" + systemPrompt : systemPrompt },
      ...messages
    ];

    const targets = [];
    if (env.GROQ_API_KEY) targets.push({ url: GROQ_URL, key: env.GROQ_API_KEY, model: GROQ_MODEL, name: "Groq" });
    if (env.OPENROUTER_API_KEY) {
      for (const m of OPENROUTER_MODELS) targets.push({ url: OPENROUTER_URL, key: env.OPENROUTER_API_KEY, model: m, name: "OpenRouter", or: true });
    }

    let lastError = "No provider answered.";
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
          lastError = `${t.name} (${response.status}): ${String(data?.error?.message || data?.message || "failed").slice(0, 200)}`;
          continue;
        }
        return new Response(response.body, {
          status: 200,
          headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache", ...headers }
        });
      } catch {
        lastError = `Could not connect to ${t.name}.`;
      }
    }
    return jsonResponse({ error: lastError }, 502, headers);
  }
};
