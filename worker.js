const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "nvidia/nemotron-3-ultra-550b-a55b:free";

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

    if (!env.OPENROUTER_API_KEY) {
      return jsonResponse({ error: "Missing OPENROUTER_API_KEY secret in Cloudflare." }, 500, headers);
    }

    let body;
    try {
      const contentLength = Number(request.headers.get("Content-Length") || "0");
      if (contentLength > 100000) {
        return jsonResponse({ error: "Request too large." }, 413, headers);
      }
      body = await request.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON request." }, 400, headers);
    }

    if (!Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > 20) {
      return jsonResponse({ error: "Send between 1 and 20 messages." }, 400, headers);
    }

    const messages = [];
    for (const item of body.messages) {
      if (!item || !["user", "assistant"].includes(item.role) || typeof item.content !== "string") {
        return jsonResponse({ error: "Invalid message format." }, 400, headers);
      }
      if (item.content.length > 12000) {
        return jsonResponse({ error: "Message is too long." }, 413, headers);
      }
      messages.push({ role: item.role, content: item.content });
    }

    const systemText = typeof body.system === "string" ? body.system.trim() : "";
    const systemPrompt = "You are Code Agent, a helpful AI coding assistant. Help users write, understand, debug, and improve code. Give complete, clearly formatted examples when asked. Explain setup steps simply. Be honest: do not claim to access repositories, edit files, run commands, or test code unless those tools are actually connected.";

    try {
      const response = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://bhimmajhi.github.io",
          "X-Title": "Code Agent"
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: "system", content: systemText ? systemText + "\n\n" + systemPrompt : systemPrompt },
            ...messages
          ],
          temperature: 0.3,
          max_tokens: 2048,
          stream: false
        })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = data?.error?.message || data?.message || "OpenRouter API request failed.";
        return jsonResponse({ error: `OpenRouter API error (${response.status}): ${String(detail).slice(0, 250)}` }, 502, headers);
      }

      const reply = data?.choices?.[0]?.message?.content;
      if (typeof reply !== "string" || !reply.trim()) {
        return jsonResponse({ error: "No reply received. Check model availability and API access." }, 502, headers);
      }
      return jsonResponse({ reply }, 200, headers);
    } catch {
      return jsonResponse({ error: "Could not connect to OpenRouter API. Try again later." }, 502, headers);
    }
  }
};
