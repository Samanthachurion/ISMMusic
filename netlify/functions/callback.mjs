// Suno requires a callBackUrl on every task. The app polls for results instead,
// so this endpoint only acknowledges the callback.
export default async () => new Response(JSON.stringify({ code: 200, msg: "ok" }), {
  headers: { "content-type": "application/json" },
});
