/**
 * Exact YouTube Audio Stream Resolver & Proxy for TeloPlay Backend
 * Pure YouTube Resolution Pipeline:
 * Tier 1: Direct InnerTube Resolver (VISIONOS / ANDROID_VR / IOS)
 * Tier 2: Exact-Video Media CDN Converter (loader.to -> savenow.to exact MP3/M4A)
 * ZERO track substitution — every stream is the exact YouTube video requested.
 */

import { Innertube, ClientType } from 'youtubei.js';
import { getVisitorData } from './search.js';

export const STREAM_CACHE = new Map();
export const IN_FLIGHT = new Map();
const NEG_CACHE = new Map();
const NEG_TTL_MS = 60_000;
const CACHE_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours

const innertubeInstances = new Map();

async function getInnertubeInstance(clientType = ClientType.VISIONOS) {
  if (innertubeInstances.has(clientType)) {
    return innertubeInstances.get(clientType);
  }
  const vd = await getVisitorData();
  const yt = await Innertube.create({
    client_type: clientType,
    visitor_data: vd || undefined,
  });
  innertubeInstances.set(clientType, yt);
  return yt;
}

const CLIENT_CANDIDATES = [
  ClientType.VISIONOS,
  ClientType.ANDROID_VR,
  ClientType.IOS,
];

/**
 * Exact-Video Media CDN Converter (loader.to -> savenow.to).
 * Resolves the exact YouTube video ID without substitution.
 */
export async function tryMediaCdnResolver(videoId, timeoutMs = 28000) {
  try {
    const sourceUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
    const initUrl = `https://loader.to/ajax/download.php?button=1&start=1&end=1&format=mp3&url=${encodeURIComponent(sourceUrl)}`;
    const initResponse = await fetch(initUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        'Referer': 'https://loader.to/',
        'Accept': 'application/json, text/plain, */*',
      },
    });
    if (!initResponse.ok) return null;

    const init = await initResponse.json();
    const progressUrl = init.progress_url ||
      (init.id ? `https://lto2.affadaffa.com/api/progress?id=${encodeURIComponent(init.id)}` : null);
    if (!progressUrl) return null;

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 600));
      const progressResponse = await fetch(progressUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://loader.to/',
        },
      });
      if (!progressResponse.ok) continue;
      const progress = await progressResponse.json();
      if (progress.success === 1 && progress.download_url) {
        return {
          ok: true,
          provider: 'media_cdn_exact_video',
          url: progress.download_url,
          mimeType: 'audio/mpeg',
          format: 'mp3',
          bitrate: 192000,
          title: progress.title || init.title || 'Audio Track',
          author: 'YouTube Audio',
        };
      }
      if (String(progress.text || '').toLowerCase().includes('error')) return null;
    }
  } catch {
    return null;
  }
  return null;
}

export async function resolveStreamUrl(videoId) {
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

    // Launch direct InnerTube (VISIONOS) and exact Media CDN concurrently
    const directPromise = attemptWithTimeout(ClientType.VISIONOS, 3500);
    const cdnPromise = tryMediaCdnResolver(videoId, 28000);

    // Fast path: if direct YouTube stream resolves within 2.5s, use it!
    const directFast = await Promise.race([
      directPromise,
      new Promise((resolve) => setTimeout(() => resolve(null), 2500)),
    ]);

    if (directFast) {
      STREAM_CACHE.set(videoId, { ts: Date.now(), data: directFast });
      return directFast;
    }

    // Secondary path: wait for exact Media CDN converter
    const converter = await cdnPromise;
    if (converter?.ok) {
      STREAM_CACHE.set(videoId, { ts: Date.now(), data: converter });
      return converter;
    }

    // If converter failed, try secondary YouTube clients (ANDROID_VR, IOS)
    for (const clientType of [ClientType.ANDROID_VR, ClientType.IOS]) {
      try {
        const result = await attemptWithTimeout(clientType, 2500);
        if (result) {
          STREAM_CACHE.set(videoId, { ts: Date.now(), data: result });
          return result;
        }
      } catch (err) {
        lastError = (err && err.message) || String(err);
        innertubeInstances.delete(clientType);
      }
    }

    const errText = 'Could not resolve exact YouTube stream for ' + videoId
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
    const targetUrl = info?.directUrl || info?.url;
    if (!info?.ok || !targetUrl || targetUrl.includes('/api/stream/')) {
      return new Response(JSON.stringify(info || { ok: false, error: 'Not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const rangeHeader = request.headers.get('Range') || request.headers.get('range');
    const upstreamHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    };

    if (info.provider === 'media_cdn_exact_video' || targetUrl.includes('savenow.to')) {
      upstreamHeaders['Referer'] = 'https://loader.to/';
    }

    if (rangeHeader) {
      upstreamHeaders['Range'] = rangeHeader;
    }

    const streamResponse = await fetch(targetUrl, {
      method: 'GET',
      headers: upstreamHeaders,
    });

    if (!streamResponse.ok && streamResponse.status !== 206) {
      STREAM_CACHE.delete(videoId);
      const freshInfo = await resolveStreamUrl(videoId);
      const freshTarget = freshInfo?.directUrl || freshInfo?.url;
      if (freshInfo?.ok && freshTarget && !freshTarget.includes('/api/stream/')) {
        if (freshInfo.provider === 'media_cdn_exact_video' || freshTarget.includes('savenow.to')) {
          upstreamHeaders['Referer'] = 'https://loader.to/';
        }
        const retryRes = await fetch(freshTarget, {
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