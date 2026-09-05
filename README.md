# TeloPlay Web

A modern music streaming web application with Flutter Web frontend and a high-performance Node.js backend hosted on **Render Web Services**.

---

## 🏗️ Architecture Overview

```text
┌─────────────────────────────────────────────────────────┐
│              TeloPlay Flutter Web Frontend              │
│        (Dart / Flutter Web, CanvasKit / HTML Renderer)   │
└───────────────────────────┬─────────────────────────────┘
                            │ HTTP REST / Streams
                            ▼
┌─────────────────────────────────────────────────────────┐
│          Render Web Service (Node.js Backend)           │
│           Host: https://teloplay-web.onrender.com        │
│          Directory: worker/ (Entry: worker_runner.js)    │
│          Auto-deploys from GitHub 'main' branch         │
└───────────────────────────┬─────────────────────────────┘
                            │
       ┌────────────────────┴────────────────────┐
       ▼                                         ▼
┌───────────────────────────┐     ┌───────────────────────────┐
│ YouTube Music InnerTube   │     │  Exact Stream Resolution  │
│ (Songs, Videos, Top Card) │     │  (Direct Clients + Proxy) │
└───────────────────────────┘     └───────────────────────────┘
```

> **Note on `worker/` directory name:**  
> The backend server code resides in the `worker/` directory. On Render, the build command is configured as:
> ```bash
> cd worker && npm install
> ```
> and the start command is:
> ```bash
> node worker/worker_runner.js
> ```
> This Node.js service listens on the port dynamically assigned by Render (`PORT` env variable, typically port 10000).

---

## 🔍 How Search Works (OpenTune / InnerTube Engine)

Search queries (e.g. `/api/search?q=safar&limit=25`) use YouTube Music's InnerTube API (`WEB_REMIX` client):

1. **Top Result Shelf (`musicCardShelfRenderer`)**:  
   Captures the canonical top result card from YouTube Music and places it at the very top.
2. **Songs Filter (`FILTER_SONG` = `EgWKAQIIAWoKEAkQBRAKEAMQBA%3D%3D`)**:  
   Queries official studio audio tracks in their natural relevance order (identical to OpenTune / ViMusic).
3. **Videos Filter (`FILTER_VIDEO` = `EgWKAQIQAWoKEAkQChAFEAMQBA%3D%3D`)**:  
   Supplements songs with official music videos.
4. **Non-Music Noise Elimination**:  
   Removes political live streams, religious lectures, drama web series episodes, sports highlights, and fan edits.

---

## 🎧 How Audio / Video Stream Resolution Works

To provide instant, buffer-free, uninterrupted playback with zero CORS issues and no silent track substitutions:

### 1. Multi-Client InnerTube Direct Audio Resolver (`tryDirectResolver`)
The backend queries YouTube's player endpoint concurrently across multiple client profiles:
- **iOS Client** (`com.google.ios.youtube`)
- **Android VR Client** (`com.google.android.apps.youtube.vr.oculus`)
- **Web Client** (`WEB`)
- **TV Embedded Client** (`PlayStation / ATV`)
- **visionOS Client**

If a direct audio URL (ITAG 140 / 251) is resolved within milliseconds, it is returned immediately.

### 2. High-Speed Exact-Video CDN Converter Fallback (`tryMediaCdnResolver`)
If YouTube client restrictions (PO token / bot detection) prevent direct player streams, a concurrent high-speed CDN resolver fetches the exact video stream matching the video ID.

### 3. Range-Aware Stream Proxying (`/api/stream/:videoId`)
Instead of having client browsers fetch directly from Google/YouTube media servers (which often triggers 403 Forbidden, CORS blocks, or 2-second audio stutters), the Flutter app streams audio via the Render backend:
```
GET /api/stream/:videoId
```
- **Byte Range Forwarding (`Range: bytes=0-`)**: Allows instant seeking and scrub controls.
- **Node.js Backpressure Piping**: Handled in `worker_runner.js` with `res.write` and `res.once('drain')` to ensure smooth streaming without memory leaks.
- **Prewarming (`/api/prewarm`)**: Pre-resolves audio streams in the background when search results load, making first taps play instantly.

### 4. Zero Server Bandwidth & Anti-Bot Strategy
- **Direct CDN Client Streaming**: Audio links resolved from high-speed CDNs are routed directly to the client player, reducing Render egress bandwidth to near zero (saving the 5 GB free limit).
- **In-Memory 24-Hour RAM Cache (`STREAM_CACHE`)**: Keeps resolved stream URLs cached in server RAM (`Map<string, StreamData>`) for 24 hours. Repeating searches or popular songs return in **0 ms** with zero CPU overhead.
- **Background Prewarming (`/api/prewarm`)**: Automatically pre-resolves top search results and upcoming queue items in the background, making clicks feel instantaneous without triggering YouTube datacenter bot blocks.
- **Keep-Alive Cron**: Render free instances are kept active 24/7 via regular cron ping intervals (e.g. every 10 mins), preserving in-memory cache and preventing cold starts.

---

## 📡 Backend API Endpoints (Render)

Base URL: `https://teloplay-web.onrender.com`

- `GET /api/ping` — Health check
- `GET /api/search?q=:query&limit=25` — Search songs & official music videos
- `GET /api/suggest?q=:query` — Real-time search query suggestions
- `GET /api/resolve?id=:videoId` — Resolves stream URL for a specific video ID
- `GET /api/stream/:videoId` — Range-aware stream proxy for playback
- `GET /api/prewarm?ids=:id1,:id2` — Prewarms audio cache for upcoming tracks
- `GET /api/errors` — Server diagnostics and in-memory error logs
- `GET /api/lyrics?id=:videoId&title=:title&artist=:artist&duration=:seconds` — Real-time synced LRC lyrics + official text lyrics
- `GET /api/artist?id=:channelId` — Artist profile, bio, subscribers, and top songs
- `GET /api/explore` / `GET /api/home` — Featured new releases, trending videos, and moods & genres
- `GET /api/song?id=:videoId` — Song credits, artist bio, and related songs

