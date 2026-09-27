import { searchYouTubeMusic, getVisitorData, YT_HDRS } from './search.js';
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

      // Temporary network diagnosis: which YouTube endpoints are reachable
      // from this host, with timing + error type. Remove after debugging.
      if (path === '/api/netprobe') {
        const YT_UA = YT_HDRS['User-Agent'];
        const id = url.searchParams.get('id') || 'BSJa1UytM8w';
        const out = {};
        async function timedFetch(label, target, body) {
          const t = Date.now();
          try {
            const ctl = new AbortController();
            const to = setTimeout(() => ctl.abort(), 12000);
            const res = await fetch(target, {
              method: 'POST',
              signal: ctl.signal,
              headers: { 'Content-Type': 'application/json', Origin: 'https://music.youtube.com', 'User-Agent': YT_UA },
              body: JSON.stringify(body),
            });
            clearTimeout(to);
            const ms = Date.now() - t;
            let extra = { http: res.status };
            if (res.ok) {
              const j = await res.json();
              const af = [...(j.streamingData?.adaptiveFormats || [])].filter(
                (f) => (f.mimeType || '').startsWith('audio/') && typeof f.url === 'string',
              );
              extra = { http: res.status, playability: j.playabilityStatus?.status, audioUrls: af.length };
            } else {
              extra.text = (await res.text()).slice(0, 80);
            }
            out[label] = { ms, ...extra };
          } catch (e) {
            out[label] = { ms: Date.now() - t, error: e?.message || String(e) };
          }
        }
        const vd = await getVisitorData();
        const base = (name, ver) => ({ context: { client: { clientName: name, clientVersion: ver, gl: 'US', hl: 'en', visitorData: vd || undefined } }, videoId: id });
        await timedFetch('www_ios', 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false', base('IOS', '19.29.1'));
        await timedFetch('music_remix', 'https://music.youtube.com/youtubei/v1/player?prettyPrint=false', base('WEB_REMIX', '1.20260114.01.00'));
        await timedFetch('www_web', 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false', base('WEB', '2.20260114.00.00'));
        // Control: search endpoint (known working) for comparison.
        const t = Date.now();
        try {
          const ctl = new AbortController();
          const to = setTimeout(() => ctl.abort(), 12000);
          const res = await fetch('https://music.youtube.com/youtubei/v1/search?prettyPrint=false', {
            method: 'POST', signal: ctl.signal,
            headers: { 'Content-Type': 'application/json', Origin: 'https://music.youtube.com', 'User-Agent': YT_UA },
            body: JSON.stringify({ context: { client: { clientName: 'WEB_REMIX', clientVersion: '1.20260114.01.00', gl: 'US', hl: 'en', visitorData: vd || undefined } }, query: 'test', params: 'EgWKAQIIAWoKEAkQBRAKEAMQBA%3D%3D' }),
          });
          clearTimeout(to);
          out.music_search = { ms: Date.now() - t, http: res.status };
        } catch (e) {
          out.music_search = { ms: Date.now() - t, error: e?.message || String(e) };
        }
        return jsonRes({ ok: true, out });
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
        // Converter (savenow) links are IP-locked: they serve audio to the
        // server but HTML to end-user networks. Force those through our
        // /api/stream proxy (verified: proxy returns 200 audio/mpeg) so the
        // app never receives an unplayable direct link. Direct googlevideo
        // URLs are untouched (no proxy bandwidth cost).
        if (data.ok && data.provider === 'media_cdn_exact_video' && data.url) {
          data.directUrl = data.url;
          data.url = `${url.origin}/api/stream/${encodeURIComponent(id)}`;
          data.proxied = true;
        }
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
