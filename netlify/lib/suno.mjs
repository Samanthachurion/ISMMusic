// Shared helpers for talking to Suno API (https://docs.sunoapi.org).
// The API key lives only in the Netlify env var SUNO_API_KEY — never in the browser.

export const SUNO_BASE = "https://api.sunoapi.org";

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

// Optional gate: if APP_PASSWORD is set in Netlify, every request must send it.
// Stops strangers from spending your credits.
export function checkAccess(req) {
  const required = process.env.APP_PASSWORD;
  if (!required) return null;
  if (req.headers.get("x-app-password") === required) return null;
  return json({ code: 401, msg: "Wrong or missing app password." }, 401);
}

export async function suno(path, { method = "GET", body } = {}) {
  const key = process.env.SUNO_API_KEY;
  if (!key) {
    return { code: 500, msg: "Server is missing SUNO_API_KEY. Add it in Netlify → Site configuration → Environment variables." };
  }
  const res = await fetch(SUNO_BASE + path, {
    method,
    headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  try {
    return await res.json();
  } catch {
    return { code: res.status, msg: `Suno API returned HTTP ${res.status}` };
  }
}

// Suno requires a callBackUrl. We poll for results instead, so this just points
// at a function that acknowledges the call.
export function callbackUrl(req) {
  const base = process.env.URL || new URL(req.url).origin;
  return `${base}/.netlify/functions/callback`;
}
