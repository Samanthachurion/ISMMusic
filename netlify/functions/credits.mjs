import { json, checkAccess, suno } from "../lib/suno.mjs";

// GET /api/credits  → remaining Suno API credits
export default async (req) => {
  const denied = checkAccess(req);
  if (denied) return denied;
  const result = await suno("/api/v1/generate/credit");
  return json(result, result.code === 200 ? 200 : 502);
};
