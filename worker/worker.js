import { searchYouTubeMusic, getVisitorData } from './search.js';
import { resolveStreamUrl, handleStreamProxy, STREAM_CACHE } from './stream.js';

const ERROR_LOG = [];
const MAX_LOG = 50;

function logError(endpoint, error, extra = {}) {
  const entry = {
    ts: new Date().toISOString(),
    endpoint,
    error: error?.message || String(error),
    stack: error?.stack?.split('\n').slice(0, 3).join(' | ') || '',
    ...extra,
  };
  ERROR_LOG.push(entry);
  if (ERROR_LOG.length > MAX_LOG) ERROR_LOG.shift();
  console.error(`[ERROR] [${entry.ts}] ${endpoint}: ${entry.error}`, extra);
  return entry;
}

function logInfo(endpoint, msg, extra = {}) {
  console.log(`[INFO] [${new Date().toISOString()}] ${endpoint}: ${msg}`, extra);
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
  async fetch(request, env, ctx) {
    const startTime = Date.now();

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // 1. Ping / Health check
      if (path === '/api/ping') {
        return jsonRes({ ok: true, pong: true, runtime: 'cloudflare-workers' });
      }

      // 2. Diagnostics & Cache Stats
      if (path === '/api/errors') {
        return jsonRes({
          ok: true,
          errorCount: ERROR_LOG.length,
          cachedStreams: STREAM_CACHE.size,
          errors: ERROR_LOG,
        });
      }

      // 3. Search YouTube Music
      if (path === '/api/search') {
        const q = url.searchParams.get('q') || '';
        const limit = parseInt(url.searchParams.get('limit') || '25', 10);
        if (!q.trim()) return jsonRes({ ok: false, error: 'Missing query parameter ?q=' }, 400);

        const results = await searchYouTubeMusic(q, limit);
        logInfo('/api/search', `Done in ${Date.now() - startTime}ms - ${results.length} results`);
        return jsonRes({ ok: true, results });
      }

      // Test JioSaavn full details and stream extraction
      if (path === '/api/debug-jiosaavn-stream') {
        const q = url.searchParams.get('q') || 'Sohena Jatona';
        try {
          const autoRes = await fetch(`https://www.jiosaavn.com/api.php?__call=autocomplete.get&_format=json&_marker=0&cc=in&includeMetaTags=1&query=${encodeURIComponent(q)}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
          });
          const autoJson = await autoRes.json();
          const firstSong = autoJson.songs?.data?.[0];
          if (!firstSong) return jsonRes({ ok: false, error: 'No song found in search' });

          const detailsRes = await fetch(`https://www.jiosaavn.com/api.php?__call=song.getDetails&cc=in&_marker=0%3F_marker%3D0&_format=json&pids=${firstSong.id}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
          });
          const detailsJson = await detailsRes.json();
          const details = detailsJson[firstSong.id];

          return jsonRes({
            ok: true,
            title: details?.song,
            singers: details?.singers,
            encrypted_media_url: details?.encrypted_media_url,
            media_preview_url: details?.media_preview_url,
            vlink: firstSong.more_info?.vlink
          });
        } catch(e) {
          return jsonRes({ error: e.message });
        }
      }

      // 4. Search Suggestions
      if (path === '/api/suggest') {
        const q = url.searchParams.get('q') || '';
        if (!q.trim()) return jsonRes({ ok: true, suggestions: [] });

        try {
          const sugUrl = `https://suggestqueries.google.com/complete/search?client=youtube&ds=yt&q=${encodeURIComponent(q)}`;
          const sugRes = await fetch(sugUrl);
          const sugText = await sugRes.text();
          const m = sugText.match(/\((.*)\)/);
          const suggestions = m ? JSON.parse(m[1])[1].map(s => s[0]) : [];
          return jsonRes({ ok: true, suggestions });
        } catch (e) {
          logError('/api/suggest', e, { q });
          return jsonRes({ ok: true, suggestions: [] });
        }
      }

      // 5. Resolve Stream URL
      if (path === '/api/resolve') {
        const id = url.searchParams.get('id') || url.searchParams.get('videoId') || '';
        if (!id) return jsonRes({ ok: false, error: 'Missing ?id= parameter' }, 400);

        const data = await resolveStreamUrl(id);
        logInfo('/api/resolve', `Done in ${Date.now() - startTime}ms - ${data.ok ? 'OK' : data.error}`);
        return jsonRes(data);
      }

      // 6. Audio Streaming Proxy (Range, CORS & Partial Content)
      if (path.startsWith('/api/stream/')) {
        const videoId = path.replace('/api/stream/', '');
        if (!videoId) return jsonRes({ ok: false, error: 'Missing videoId' }, 400);
        return await handleStreamProxy(request, videoId, CORS);
      }

      return jsonRes({
        error: 'Endpoint not found',
        availableEndpoints: ['/api/ping', '/api/search', '/api/suggest', '/api/resolve', '/api/stream/:id', '/api/errors']
      }, 404);

    } catch (e) {
      logError('global', e, { path, method: request.method });
      return jsonRes({ ok: false, error: e.message, endpoint: path }, 500);
    }
  },
};
