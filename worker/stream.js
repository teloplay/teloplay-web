/**
 * Exact YouTube Audio Stream Resolver & Proxy for TeloPlay Backend
 * Powered by InnerTube engine (VISIONOS / ANDROID_VR / IOS)
 */

import { Innertube, ClientType } from 'youtubei.js';
import { trySaavnResolver } from './saavn.js';
import { getVideoMetadata } from './search.js';

export const STREAM_CACHE = new Map();
export const IN_FLIGHT = new Map();
// Short negative cache: don't hammer upstreams (rate-limit risk) when a
// video is currently unresolvable. 60s only — outages shouldn't stick.
const NEG_CACHE = new Map();
const NEG_TTL_MS = 60_000;

const CACHE_TTL_MS = 3 * 60 * 60 * 1000;

const innertubeInstances = new Map();

async function getInnertubeInstance(clientType = ClientType.VISIONOS) {
  if (innertubeInstances.has(clientType)) {
    return innertubeInstances.get(clientType);
  }
  const yt = await Innertube.create({ client_type: clientType });
  innertubeInstances.set(clientType, yt);
  return yt;
}

const CLIENT_CANDIDATES = [
  ClientType.VISIONOS,
  ClientType.ANDROID_VR,
  ClientType.IOS,
];

export async function resolveStreamUrl(videoId, meta = {}) {
  if (!videoId) return { ok: false, error: 'Missing videoId' };

  const cached = STREAM_CACHE.get(videoId);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return { ...cached.data, cached: true };
  }

  const neg = NEG_CACHE.get(videoId);
  if (neg && Date.now() - neg.ts < NEG_TTL_MS) {
    return { ok: false, error: neg.error, negativeCached: true };
  }

  if (IN_FLIGHT.has(videoId)) {
    return IN_FLIGHT.get(videoId);
  }

  const promise = (async () => {
    let lastError = null;

    // One client attempt with a hard timeout — youtubei calls can hang
    // for minutes behind IP-based bot checks; never let one stall resolve.
    async function attemptWithTimeout(clientType, ms) {
      let timer = null;
      try {
        const task = (async () => {
          const yt = await getInnertubeInstance(clientType);
          const info = await yt.getBasicInfo(videoId);
          const format = info.chooseFormat({ type: 'audio', quality: 'best' });
          if (!format) return null;
          const streamUrl = await format.decipher(yt.session.player);
          if (!streamUrl || typeof streamUrl !== 'string' || !streamUrl.startsWith('http')) return null;
          return {
            ok: true,
            provider: 'innertube_' + clientType.toLowerCase(),
            url: streamUrl,
            directUrl: streamUrl,
            mimeType: format.mime_type || 'audio/mp4',
            itag: format.itag || 140,
            bitrate: format.bitrate || 128000,
            contentLength: format.content_length ? Number.parseInt(format.content_length, 10) : undefined,
            duration: Number.parseInt(info.basic_info.duration || '0', 10),
            title: info.basic_info.title || 'Unknown',
            author: info.basic_info.author || 'Unknown',
          };
        })();
        const timeout = new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('client-timeout')), ms);
        });
        return await Promise.race([task, timeout]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    }

    for (const clientType of CLIENT_CANDIDATES) {
      try {
        const result = await attemptWithTimeout(clientType, 4000);
        if (result) {
          STREAM_CACHE.set(videoId, { ts: Date.now(), data: result });
          return result;
        }
      } catch (err) {
        lastError = (err && err.message) || String(err);
        innertubeInstances.delete(clientType);
      }
    }

    // ── Tier 2: JioSaavn 320kbps Lossless Studio Fallback ───────────
    try {
      let title = meta.title || '';
      let artist = meta.artist || '';
      const duration = meta.duration || 0;

      if (!title) {
        const oembed = await getVideoMetadata(videoId);
        if (oembed) {
          title = oembed.title;
          artist = oembed.author;
        }
      }

      if (title) {
        const saavnRes = await trySaavnResolver(title, artist, duration);
        if (saavnRes && saavnRes.ok && saavnRes.url) {
          STREAM_CACHE.set(videoId, { ts: Date.now(), data: saavnRes });
          return saavnRes;
        }
      }
    } catch (e) {}

    const errText = 'Could not resolve stream for ' + videoId
      + (lastError ? ': ' + String(lastError).slice(0, 120) : '');
    NEG_CACHE.set(videoId, { ts: Date.now(), error: errText });
    return { ok: false, error: errText };
  })();

  IN_FLIGHT.set(videoId, promise);
  try {
    return await promise;
  } finally {
    IN_FLIGHT.delete(videoId);
  }
}

export async function handleStreamProxy(request, videoId, corsHeaders = {}) {
  try {
    const info = await resolveStreamUrl(videoId);
    if (!info.ok || !info.url) {
      return new Response(JSON.stringify(info), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const rangeHeader = request.headers.get('Range') || request.headers.get('range');
    const upstreamHeaders = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
    };

    if (rangeHeader) {
      upstreamHeaders['Range'] = rangeHeader;
    }

    const streamResponse = await fetch(info.url, {
      method: 'GET',
      headers: upstreamHeaders,
    });

    if (!streamResponse.ok && streamResponse.status !== 206) {
      STREAM_CACHE.delete(videoId);
      const freshInfo = await resolveStreamUrl(videoId);
      if (freshInfo.ok && freshInfo.url) {
        const retryRes = await fetch(freshInfo.url, {
          method: 'GET',
          headers: upstreamHeaders,
        });
        const retryHeaders = new Headers(corsHeaders);
        retryHeaders.set('Content-Type', freshInfo.mimeType || 'audio/mp4');
        retryHeaders.set('Accept-Ranges', 'bytes');
        retryHeaders.set('Cache-Control', 'public, max-age=14400');

        for (const h of ['content-length', 'content-range']) {
          const val = retryRes.headers.get(h);
          if (val) retryHeaders.set(h, val);
        }

        return new Response(retryRes.body, {
          status: retryRes.status,
          headers: retryHeaders,
        });
      }

      return new Response(JSON.stringify({ ok: false, error: 'Upstream error ' + streamResponse.status }), {
        status: streamResponse.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const responseHeaders = new Headers(corsHeaders);
    responseHeaders.set('Content-Type', streamResponse.headers.get('content-type') || info.mimeType || 'audio/mp4');
    responseHeaders.set('Accept-Ranges', 'bytes');
    responseHeaders.set('Cache-Control', 'public, max-age=14400');

    for (const h of ['content-length', 'content-range']) {
      const val = streamResponse.headers.get(h);
      if (val) responseHeaders.set(h, val);
    }

    return new Response(streamResponse.body, {
      status: streamResponse.status,
      headers: responseHeaders,
    });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

export function prewarmStreamUrl(videoId) {
  if (!videoId) return Promise.resolve(null);
  if (STREAM_CACHE.has(videoId)) return Promise.resolve(STREAM_CACHE.get(videoId).data);
  if (IN_FLIGHT.has(videoId)) return IN_FLIGHT.get(videoId);
  return resolveStreamUrl(videoId).catch(() => null);
}