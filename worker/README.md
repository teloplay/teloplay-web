# TeloPlay Backend API (Render Web Service)

This directory contains the Node.js backend server powering **TeloPlay Web**, deployed on **Render Web Services**.

- **Production URL**: `https://teloplay-web.onrender.com`
- **Render Build Command**: `cd worker && npm install`
- **Render Start Command**: `node worker/worker_runner.js`
- **Port**: Dynamically bound via `process.env.PORT` (typically `10000` on Render)

---

## Architecture & Stream Resolution

1. **`worker_runner.js`**: Node.js HTTP server wrapper for Render that translates incoming requests to standard Fetch API `Request`/`Response` and handles stream piping with backpressure management.
2. **`worker.js`**: Router handling `/api/search`, `/api/resolve`, `/api/stream/:id`, `/api/suggest`, `/api/prewarm`.
3. **`search.js`**: YouTube Music InnerTube search engine based on OpenTune (`musicCardShelfRenderer` for Top Result + `FILTER_SONG` + `FILTER_VIDEO`).
4. **`stream.js`**: Exact audio stream resolver using multi-client direct YouTube player profiles (iOS, Android VR, Web, TV) with high-speed media CDN fallback and proxy streaming.

---

## Local Development

```bash
npm start
```
Starts the server locally on `http://localhost:3000`.

