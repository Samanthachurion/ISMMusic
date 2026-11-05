# ISM Music

An AI song generator. Users describe a song (or write their own lyrics) and get two finished tracks they can play and download. Built on [Suno API](https://docs.sunoapi.org).

## How it works

- **`public/`** — the website (plain HTML, CSS and JavaScript, no build step).
- **`netlify/functions/`** — small server functions that call Suno API. The API key stays on the server and is never sent to the browser.
  - `generate` — starts a song (`POST /api/v1/generate`)
  - `status` — checks progress (`GET /api/v1/generate/record-info`)
  - `lyrics` — AI lyric writer (`POST /api/v1/lyrics`, `GET /api/v1/lyrics/record-info`)
  - `credits` — shows remaining credits (`GET /api/v1/generate/credit`)
  - `callback` — required by Suno; the app polls for results instead

Features: simple mode (describe a vibe), custom mode (title, style, lyrics, voice, styles to avoid, length, style strength, weirdness, variety), instrumental toggle, V6 / V6 Wild / V6 Mini models, AI lyric writer, in-browser song library with play + download.

## Deploy on Netlify

1. In Netlify, **Add new site → Import an existing project** and pick this repo.
   Build settings come from `netlify.toml` (publish `public`, functions `netlify/functions`). No build command is needed.
2. Go to **Site configuration → Environment variables** and add:
   - `SUNO_API_KEY` — your key from https://sunoapi.org/api-key
   - `APP_PASSWORD` *(optional, recommended)* — if set, visitors must enter this password before they can create songs. Without it, anyone with the link can spend your credits.
3. Redeploy (**Deploys → Trigger deploy**) so the functions pick up the variables.

## Run locally

```bash
npm install -g netlify-cli
```

```bash
SUNO_API_KEY=your_key netlify dev
```

Notes: generated files are kept by Suno for 14 days, so download tracks you want to keep. The song list is saved in each visitor's browser.
