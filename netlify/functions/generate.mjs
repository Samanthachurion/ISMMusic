import { json, checkAccess, suno, callbackUrl } from "../lib/suno.mjs";

const MODELS = ["V6", "V6_WILD", "V6_MINI"];

const clampNum = (v, min, max) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : undefined;
};
const str = (v, max) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);

// POST /api/generate  → starts a music generation task, returns { taskId }
export default async (req) => {
  if (req.method !== "POST") return json({ code: 405, msg: "Use POST" }, 405);
  const denied = checkAccess(req);
  if (denied) return denied;

  let input;
  try {
    input = await req.json();
  } catch {
    return json({ code: 400, msg: "Invalid JSON body" }, 400);
  }

  const customMode = Boolean(input.customMode);
  const instrumental = Boolean(input.instrumental);
  const model = MODELS.includes(input.model) ? input.model : "V6";

  const body = { customMode, instrumental, model, callBackUrl: callbackUrl(req) };

  if (customMode) {
    body.title = str(input.title, 80);
    body.style = str(input.style, 1000);
    body.negativeTags = str(input.negativeTags, 1000);
    if (!instrumental) body.lyrics = str(input.lyrics, 5000);
    if (input.vocalGender === "m" || input.vocalGender === "f") body.vocalGender = input.vocalGender;
    if (input.duration != null && input.duration !== "") body.duration = Math.round(clampNum(input.duration, 10, 360));
    for (const k of ["styleWeight", "weirdnessConstraint"]) {
      if (input[k] != null && input[k] !== "") body[k] = Math.round(clampNum(input[k], 0, 1) * 100) / 100;
    }
    if (input.variety != null && input.variety !== "") body.variety = Math.round(clampNum(input.variety, 0, 4));
    if (!body.style && !body.lyrics && !body.negativeTags) {
      return json({ code: 400, msg: "Custom mode needs at least a style, lyrics, or tags to avoid." }, 400);
    }
  } else {
    body.prompt = str(input.prompt, 3000);
    body.style = str(input.style, 1000);
    if (!body.prompt && !body.style) {
      return json({ code: 400, msg: "Describe the song you want." }, 400);
    }
  }

  // Drop empty fields
  for (const k of Object.keys(body)) if (body[k] === undefined) delete body[k];

  const result = await suno("/api/v1/generate", { method: "POST", body });
  return json(result, result.code === 200 ? 200 : 502);
};
