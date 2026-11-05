import { json, checkAccess, suno, callbackUrl } from "../lib/suno.mjs";

// POST /api/lyrics { prompt }   → starts a lyrics task, returns { taskId }
// GET  /api/lyrics?taskId=...   → lyrics task status + results
export default async (req) => {
  const denied = checkAccess(req);
  if (denied) return denied;

  if (req.method === "GET") {
    const taskId = new URL(req.url).searchParams.get("taskId");
    if (!taskId) return json({ code: 400, msg: "taskId is required" }, 400);
    const result = await suno(`/api/v1/lyrics/record-info?taskId=${encodeURIComponent(taskId)}`);
    return json(result, result.code === 200 ? 200 : 502);
  }

  if (req.method !== "POST") return json({ code: 405, msg: "Use GET or POST" }, 405);

  let input;
  try {
    input = await req.json();
  } catch {
    return json({ code: 400, msg: "Invalid JSON body" }, 400);
  }
  const prompt = typeof input.prompt === "string" ? input.prompt.trim().slice(0, 200) : "";
  if (!prompt) return json({ code: 400, msg: "Tell us what the lyrics should be about." }, 400);

  const result = await suno("/api/v1/lyrics", {
    method: "POST",
    body: { prompt, callBackUrl: callbackUrl(req) },
  });
  return json(result, result.code === 200 ? 200 : 502);
};
