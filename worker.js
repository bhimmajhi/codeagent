
const NVIDIA_URL =
  "https://integrate.api.nvidia.com/v1/chat/completions";

const MODEL = "meta/llama-3.3-70b-instruct";

// Apne GitHub Pages origin se YOUR-USERNAME replace karo.
// Example: https://myusername.github.io
const ALLOWED_ORIGINS = [
  "https://bhimmajhi.github.io"
];

const SYSTEM_PROMPT = `
You are Code Agent, a helpful AI coding assistant.

Help users write, understand, debug, and improve code.
When asked for code, provide complete and clearly formatted examples.
Explain setup steps in simple language.

Be honest about your capabilities:
You cannot directly access GitHub repositories, local files,
or run terminal commands unless those tools are actually connected.
Never claim to have edited files, run commands, or tested code
unless you really did so.
`;

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

    // Browser CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers
      });
    }

    // Backend health check
    if (
      url.pathname === "/health" &&
      request.method === "GET"
    ) {
      return jsonResponse(
        {
          ok: true,
          service: "Code Agent API"
        },
        200,
        headers
      );
    }

    // Only /chat is supported for POST requests
    if (url.pathname !== "/chat") {
      return jsonResponse(
        { error: "Not found" },
        404,
        headers
      );
    }

    if (request.method !== "POST") {
      return jsonResponse(
        { error: "Method not allowed" },
        405,
        headers
      );
    }

    // Allow only configured website origins
    const origin = request.headers.get("Origin") || "";

    if (!ALLOWED_ORIGINS.includes(origin)) {
      return jsonResponse(
        {
          error: "Origin not allowed. Check ALLOWED_ORIGINS in worker.js."
        },
        403,
        headers
      );
    }

    // Secret must be configured in Cloudflare
    if (!env.NVIDIA_API_KEY) {
      return jsonResponse(
        {
          error: "Missing NVIDIA_API_KEY secret in Cloudflare."
        },
        500,
        headers
      );
    }

    // Parse and validate incoming JSON
    let body;

    try {
      const contentLength = Number(
        request.headers.get("Content-Length") || "0"
      );

      if (contentLength > 100000) {
        return jsonResponse(
          { error: "Request too large." },
          413,
          headers
        );
      }

      body = await request.json();
    } catch {
      return jsonResponse(
        { error: "Invalid JSON request." },
        400,
        headers
      );
    }

    if (
      !Array.isArray(body.messages) ||
      body.messages.length < 1 ||
      body.messages.length > 20
    ) {
      return jsonResponse(
        {
          error: "Send between 1 and 20 messages."
        },
        400,
        headers
      );
    }

    const messages = [];

    for (const item of body.messages) {
      if (
        !item ||
        !["user", "assistant"].includes(item.role) ||
        typeof item.content !== "string"
      ) {
        return jsonResponse(
          { error: "Invalid message format." },
          400,
          headers
        );
      }

      if (item.content.length > 12000) {
        return jsonResponse(
          { error: "Message is too long." },
          413,
          headers
        );
      }

      messages.push({
        role: item.role,
        content: item.content
      });
    }

    // Call NVIDIA API
    try {
      const response = await fetch(NVIDIA_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.NVIDIA_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            {
              role: "system",
              content: (typeof body.system === "string" && body.system.trim() ? body.system.trim() + "\n\n" : "") + SYSTEM_PROMPT
            },
            ...messages
          ],
          temperature: 0.3,
          max_tokens: 2048,
          stream: false
        })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const detail =
          data?.error?.message ||
          "NVIDIA API request failed.";

        return jsonResponse(
          {
            error:
              `NVIDIA API error (${response.status}): ` +
              String(detail).slice(0, 250)
          },
          502,
          headers
        );
      }

      const reply =
        data?.choices?.[0]?.message?.content;

      if (typeof reply !== "string" || !reply.trim()) {
        return jsonResponse(
          {
            error:
              "No reply received. Check model availability and API access."
          },
          502,
          headers
        );
      }

      return jsonResponse(
        { reply },
        200,
        headers
      );

    } catch {
      return jsonResponse(
        {
          error: "Could not connect to NVIDIA API. Try again later."
        },
        502,
        headers
      );
    }
  }
};
