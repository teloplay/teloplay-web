import { searchYouTubeMusic, getVisitorData } from './search.js';
import { resolveStreamUrl, handleStreamProxy, STREAM_CACHE } from './stream.js';

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

      if (path === '/api/errors') {
        return jsonRes({ ok: true, errorCount: ERROR_LOG.length, cachedStreams: STREAM_CACHE.size, errors: ERROR_LOG });
      }

      if (path === '/api/search') {
        const q = url.searchParams.get('q') || '';
        const limit = parseInt(url.searchParams.get('limit') || '25', 10);
        if (!q.trim()) return jsonRes({ ok: false, error: 'Missing ?q=' }, 400);
        const results = await searchYouTubeMusic(q, limit);
        logInfo('/api/search', `${results.length} results in ${Date.now() - t0}ms`);
        return jsonRes({ ok: true, results });
      }

      if (path === '/api/suggest') {
        const q = url.searchParams.get('q') || '';
        if (!q.trim()) return jsonRes({ ok: true, suggestions: [] });
        try {
          const r = await fetch(`https://suggestqueries.google.com/complete/search?client=youtube&ds=yt&q=${encodeURIComponent(q)}`);
          const t = await r.text();
          const m = t.match(/\((.*)\)/);
          return jsonRes({ ok: true, suggestions: m ? JSON.parse(m[1])[1].map(s => s[0]) : [] });
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

      return jsonRes({ error: 'Not found' }, 404);
    } catch (e) {
      logError('global', e, { path });
      return jsonRes({ ok: false, error: e.message }, 500);
    }
  },
};
