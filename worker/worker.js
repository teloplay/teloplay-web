import { searchYouTubeMusic, getVisitorData } from './search.js';
import { resolveStreamUrl, handleStreamProxy, STREAM_CACHE, prewarmStreamUrl } from './stream.js';
import { getSongLyrics, getArtistDetails, getExplorePage, getSongDetails } from './metadata.js';

const ERROR_LOG = [];
const MAX_LOG = 50;

function logError(ep, e, x = {}) {
  ERROR_LOG.push({ ts: new Date().toISOString(), ep, error: e?.message || String(e), ...x });
  if (ERROR_LOG.length > MAX_LOG) ERROR_LOG.shift();
  console.error(`[ERROR] ${ep}: ${e?.message || e}`, x);
}

function logInfo(ep, msg) {
  console.log(`[INFO] ${ep}: ${msg}`);
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Range, Authorization',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
};

function jsonRes(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

export default {
  async fetch(request) {
    const t0 = Date.now();

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === '/api/ping') {
        return jsonRes({ ok: true, pong: true });
      }

      if (path === '/api/diag') {
        const id = url.searchParams.get('id') || 'zAiIgYOH4Ys';
        const { tryDirectResolver } = await import('./stream.js');
        const r = await tryDirectResolver(id);
        return jsonRes({ ok: r.ok, provider: r.provider, attempts: r.attempts });
      }

      if (path === '/api/errors') {
        return jsonRes({ ok: true, errorCount: ERROR_LOG.length, cachedStreams: STREAM_CACHE.size, errors: ERROR_LOG });
      }

      if (path === '/api/search') {
        const q = url.searchParams.get('q') || '';
        const limit = parseInt(url.searchParams.get('limit') || '25', 10);
        if (!q.trim()) return jsonRes({ ok: false, error: 'Missing ?q=' }, 400);
        const results = await searchYouTubeMusic(q, limit);
        // Background pre-warm the first 8 results so the first click plays instantly.
        for (const track of results.slice(0, 8)) {
          prewarmStreamUrl(track.videoId);
        }
        logInfo('/api/search', `${results.length} results in ${Date.now() - t0}ms`);
        return jsonRes({ ok: true, results });
      }

      if (path === '/api/prewarm') {
        const ids = (url.searchParams.get('ids') || '').split(',').map((s) => s.trim()).filter(Boolean);
        for (const id of ids) prewarmStreamUrl(id);
        return jsonRes({ ok: true, queued: ids.length });
      }

      if (path === '/api/suggest') {
        const q = url.searchParams.get('q') || '';
        if (!q.trim()) return jsonRes({ ok: true, suggestions: [] });
        try {
          const r = await fetch(`https://suggestqueries.google.com/complete/search?client=youtube&ds=yt&q=${encodeURIComponent(q)}`);
          const t = await r.text();
          const m = t.match(/\((.*)\)/);
          return jsonRes({ ok: true, suggestions: m ? JSON.parse(m[1])[1].map((s) => s[0]) : [] });
        } catch (e) {
          return jsonRes({ ok: true, suggestions: [] });
        }
      }

      if (path === '/api/resolve') {
        const id = url.searchParams.get('id') || url.searchParams.get('videoId') || '';
        if (!id) return jsonRes({ ok: false, error: 'Missing ?id=' }, 400);
        const data = await resolveStreamUrl(id);
        logInfo('/api/resolve', `${data.ok ? data.provider : data.error} in ${Date.now() - t0}ms`);
        return jsonRes(data);
      }

      if (path.startsWith('/api/stream/')) {
        const videoId = path.replace('/api/stream/', '');
        if (!videoId) return jsonRes({ ok: false, error: 'Missing videoId' }, 400);
        return await handleStreamProxy(request, videoId, CORS);
      }
      // ─── Rich Metadata & Lyrics Endpoints ──────────────────────────

      // 1. Lyrics endpoint: returns both YouTube Music text lyrics and LRCLib Synced Lyrics
      if (path === '/api/lyrics') {
        const id = url.searchParams.get('id') || '';
        const title = url.searchParams.get('title') || '';
        const artist = url.searchParams.get('artist') || '';
        const duration = parseInt(url.searchParams.get('duration') || '0', 10);
        if (!id && (!title || !artist)) {
          return jsonRes({ ok: false, error: 'Provide ?id= or ?title=&artist=' }, 400);
        }
        const lyrics = await getSongLyrics(id, title, artist, duration);
        return jsonRes({ ok: true, ...lyrics });
      }

      // 2. Artist profile endpoint: bio, thumbnail, subscriber count, top songs & albums
      if (path === '/api/artist') {
        const id = url.searchParams.get('id') || '';
        if (!id) return jsonRes({ ok: false, error: 'Missing ?id=' }, 400);
        const artistData = await getArtistDetails(id);
        return jsonRes({ ok: true, ...artistData });
      }

      // 3. Explore & New Releases: trending songs, new releases, moods & genres
      if (path === '/api/explore' || path === '/api/home') {
        const exploreData = await getExplorePage();
        return jsonRes({ ok: true, ...exploreData });
      }

      // 4. Song Details: description, credits, year, related songs
      if (path === '/api/song') {
        const id = url.searchParams.get('id') || '';
        if (!id) return jsonRes({ ok: false, error: 'Missing ?id=' }, 400);
        const songData = await getSongDetails(id);
        return jsonRes({ ok: true, ...songData });
      }


      return jsonRes({ error: 'Not found' }, 404);
    } catch (e) {
      logError('global', e, { path });
      return jsonRes({ ok: false, error: e.message }, 500);
    }
  },
};
