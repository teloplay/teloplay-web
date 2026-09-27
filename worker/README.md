# TeloPlay Backend API (Render Web Service)

This directory contains the Node.js backend server powering **TeloPlay Web**, deployed on **Render Web Services**.

- **Production Base URL**: `https://teloplay-web.onrender.com`
- **Render Build Command**: `cd worker && npm install`
- **Render Start Command**: `node worker/worker_runner.js`
- **Port**: Dynamically bound via `process.env.PORT` (typically `10000` on Render)

---

## 📡 Complete Backend API Reference

All responses return standard JSON with CORS enabled (`Access-Control-Allow-Origin: *`).

### 1. YouTube Music Search
- **Endpoint**: `GET /api/search?q={query}&limit={count}`
- **Query Params**:
  - `q` (string, required): Search keyword (e.g. `safar`, `majboor`, `arijit singh`).
  - `limit` (integer, optional): Maximum results to return (default: `25`).
- **Response**:
  ```json
  {
    "ok": true,
    "results": [
      {
        "videoId": "zfWlGsiFDzk",
        "title": "Safar",
        "author": "Bayaan",
        "albumName": "Safar",
        "thumbnail": "https://i.ytimg.com/vi/zfWlGsiFDzk/hqdefault.jpg",
        "duration": 217,
        "plays": 56000000,
        "fromCardShelf": true
      }
    ]
  }
  ```

---

### 2. Synced & Plain Lyrics (OpenTune + YouTube Music Engine)
- **Endpoint**: `GET /api/lyrics?id={videoId}&title={songTitle}&artist={artistName}&duration={seconds}`
- **Query Params**:
  - `id` (string, optional): YouTube Video ID.
  - `title` (string, optional): Track title.
  - `artist` (string, optional): Artist name.
  - `duration` (integer, optional): Song duration in seconds for high-precision timestamp matching.
- **Features**:
  - **`syncedLyrics`**: Real-time karaoke timestamped LRC format (e.g. `[00:18.89] Line 1...`).
  - **`plainLyrics`**: Full official lyrics from YouTube Music tab or LRCLib.
- **Response**:
  ```json
  {
    "ok": true,
    "videoId": "zfWlGsiFDzk",
    "title": "Safar",
    "artist": "Bayaan",
    "plainLyrics": "O sanam, o jigar...\n",
    "syncedLyrics": "[00:18.89] O sanam, o jigar, tumko ho kya hi khabar\n[00:23.50] Kaise kati yeh raatein hain\n...",
    "hasSynced": true
  }
  ```

---

### 3. Artist Profile & Discography
- **Endpoint**: `GET /api/artist?id={channelOrBrowseId}`
- **Query Params**:
  - `id` (string, required): Artist Channel ID (e.g. `UCuFDzYEZaWlCzxz1B6mKduQ`).
- **Response**:
  ```json
  {
    "ok": true,
    "id": "UCuFDzYEZaWlCzxz1B6mKduQ",
    "name": "Bayaan",
    "description": "Bayaan is an alternative rock/contemporary pop band hailing from Lahore, Pakistan...",
    "thumbnail": "https://lh3.googleusercontent.com/...=w2880-h1200-p-l90-rj",
    "subscriberCount": "190K subscribers",
    "topSongs": [
      {
        "videoId": "zfWlGsiFDzk",
        "title": "Safar",
        "author": "Bayaan",
        "duration": 217
      }
    ]
  }
  ```

---

### 4. Explore, Trending & Moods
- **Endpoint**: `GET /api/explore` or `GET /api/home`
- **Response**:
  ```json
  {
    "ok": true,
    "sections": [
      {
        "title": "Moods & genres",
        "items": [ ... ]
      },
      {
        "title": "New music videos",
        "items": [ ... ]
      }
    ]
  }
  ```

---

### 5. Song Details & Related Tracks
- **Endpoint**: `GET /api/song?id={videoId}`
- **Response**:
  ```json
  {
    "ok": true,
    "videoId": "zfWlGsiFDzk",
    "artistBio": "Bayaan is an alternative rock band...",
    "relatedSongs": [ ... ]
  }
  ```

---

### 6. Audio Stream Resolution & Proxy
- `GET /api/resolve?id={videoId}`: Resolves exact YouTube audio stream without track substitution.
- `GET /api/stream/{videoId}`: Range-aware stream proxy with backpressure drain handling.
- `GET /api/suggest?q={query}`: Live search suggestions.
- `GET /api/prewarm?ids={id1,id2}`: Background stream pre-warming for upcoming tracks.

---

## Local Development

```bash
npm start
```
Starts the server locally on `http://localhost:3000`.


