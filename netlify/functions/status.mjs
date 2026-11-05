import { json, checkAccess, suno } from "../lib/suno.mjs";

// GET /api/status?taskId=...  → music generation progress + tracks
export default async (req) => {
  const denied = checkAccess(req);
  if (denied) return denied;
  const taskId = new URL(req.url).searchParams.get("taskId");
  if (!taskId) return json({ code: 400, msg: "taskId is required" }, 400);

  const result = await suno(`/api/v1/generate/record-info?taskId=${encodeURIComponent(taskId)}`);
  return json(result, result.code === 200 ? 200 : 502);
};
