# TeloPlay InnerTube Cloudflare Worker

## Live URL

`https://teloplay-stream-worker.teloplay-verify.workers.dev`

## Endpoints

- `GET /api/ping` - health check
- `GET /api/search?q=arijit%20singh&limit=25` - YouTube Music search
- `GET /api/suggest?q=arijit` - search suggestions
- `GET /api/resolve?id=VIDEO_ID` - resolves a direct YouTube audio URL
- `GET /api/stream/VIDEO_ID` - range-aware fallback proxy
- `GET /api/errors` - recent in-memory errors for the current Worker isolate

## Deploy

From this directory:

```powershell
npx wrangler deploy
```

## Live terminal logs

Run this in a separate terminal after deployment:

```powershell
npx wrangler tail teloplay-stream-worker --format pretty
```

Then use the app or call an endpoint. `console.log` entries are `INFO` lines and `console.error` entries are `ERROR` lines.

The `/api/errors` endpoint is only a short in-memory ring buffer. Cloudflare Workers can use different isolates, so use `wrangler tail` for reliable live debugging.

## Local API server

For local development only:

```powershell
node server.js
```

It listens on `http://localhost:3000` and prints request/error logs in that terminal.
