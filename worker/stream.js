/**
 * Exact YouTube audio resolver.
 * The resolver always uses the videoId selected by the search result. It never
 * searches another provider, so returned audio cannot be silently substituted.
 */

import { getVisitorData } from './search.js';

export const STREAM_CACHE = new Map();
export const IN_FLIGHT = new Map();

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const RESOLVE_TIMEOUT_MS = 5_000;
const CONVERTER_TIMEOUT_MS = 25_000;

const YT_CLIENTS = [
  {
    name: 'ios',
    clientName: '5',
    clientVersion: '20.10.4',
    deviceMake: 'Apple',
    deviceModel: 'iPad16,3',
    osName: 'iPadOS',
    osVersion: '18.0.1.22A350',
    userAgent: 'com.google.ios.youtube/20.10.4 (iPad16,3; U; CPU iPadOS 18_0_1 like Mac OS X;)',
    origin: 'https://www.youtube.com',
    referer: 'https://www.youtube.com/',
  },
  {
    name: 'android_vr',
    clientName: '28',
    clientVersion: '1.60.19',
    deviceMake: 'Google',
    deviceModel: 'Quest 3',
    osName: 'Android',
    osVersion: '14',
    userAgent: 'com.google.android.apps.youtube.vr.oculus/1.60.19 (Linux; U; Android 14; en_US; Quest 3; Build/UP1A.231005.007.A1;)',
    origin: 'https://www.youtube.com',
    referer: 'https://www.youtube.com/',
  },
  {
    name: 'web',
    clientName: 'WEB',
    clientVersion: '2.20240101.00.00',
    deviceMake: '',
    deviceModel: '',
    osName: 'Windows',
    osVersion: '10.0',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    origin: 'https://www.youtube.com',
    referer: 'https://www.youtube.com/',
  },
  {
    name: 'tv_embedded',
    clientName: '85',
    clientVersion: '2.0.0',
    deviceMake: 'Google',
    deviceModel: 'ATV',
    osName: 'Android',
    osVersion: '14',
    userAgent: 'Mozilla/5.0 (PlayStation; PlayStation 4/12.00) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
    origin: 'https://www.youtube.com',
    referer: 'https://www.youtube.com/',
  },
  {
    name: 'visionos',
    clientName: '101',
    clientVersion: '0.1',
    deviceMake: 'Apple',
    deviceModel: 'RealityDevice14,1',
    osName: 'visionOS',
    osVersion: '1.3.21O771',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
    origin: 'https://music.youtube.com',
    referer: 'https://music.youtube.com/',
  },
];

function timeoutSignal(timeoutMs) {
  return AbortSignal.timeout(timeoutMs);
}

function tryExtractAudioUrl(json) {
  const formats = [
    ...(json.streamingData?.adaptiveFormats || []),
    ...(json.streamingData?.formats || []),
  ];
  const audioFormats = formats.filter(
    (format) => format.mimeType?.startsWith('audio/') && typeof format.url === 'string',
  );
  if (audioFormats.length === 0) return null;
  return (
    audioFormats.find((format) => format.itag === 140) ||
    audioFormats.find((format) => format.itag === 251) ||
    audioFormats[0]
  );
}

async function tryClientResolver(client, videoId, visitorData) {
  const start = Date.now();
  try {
    const response = await fetch(
      'https://www.youtube.com/youtubei/v1/player?prettyPrint=false',
      {
        method: 'POST',
        signal: timeoutSignal(RESOLVE_TIMEOUT_MS),
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': client.userAgent,
          'X-YouTube-Client-Name': client.clientName,
          'X-YouTube-Client-Version': client.clientVersion,
          'Origin': client.origin,
          'Referer': client.referer,
        },
        body: JSON.stringify({
          context: {
            client: {
              clientName: client.clientName,
              clientVersion: client.clientVersion,
              deviceMake: client.deviceMake,
              deviceModel: client.deviceModel,
              osName: client.osName,
              osVersion: client.osVersion,
              gl: 'US',
              hl: 'en',
              visitorData: visitorData || undefined,
            },
          },
          videoId,
        }),
      },
    );

    if (!response.ok) {
      return { ok: false, ms: Date.now() - start, reason: `HTTP ${response.status}` };
    }

    const json = await response.json();
    if (json.playabilityStatus?.status !== 'OK') {
      return {
        ok: false,
        ms: Date.now() - start,
        reason: json.playabilityStatus?.status || 'unplayable',
      };
    }

    const best = tryExtractAudioUrl(json);
    if (!best?.url) return { ok: false, ms: Date.now() - start, reason: 'no audio url' };

    return {
      ok: true,
      ms: Date.now() - start,
      result: {
        ok: true,
        provider: `youtube_${client.name}`,
        url: best.url,
        mimeType: best.mimeType,
        itag: best.itag,
        bitrate: best.bitrate,
        contentLength: best.contentLength ? Number.parseInt(best.contentLength, 10) : undefined,
        duration: Number.parseInt(json.videoDetails?.lengthSeconds || '0', 10),
        title: json.videoDetails?.title || 'Unknown',
        author: json.videoDetails?.author || 'Unknown',
      },
    };
  } catch (error) {
    return { ok: false, ms: Date.now() - start, reason: error?.message || 'error' };
  }
}

export async function tryDirectResolver(videoId) {
  const visitorData = await getVisitorData();
  const rawAttempts = await Promise.all(
    YT_CLIENTS.map(async (client) => {
      const attempt = await tryClientResolver(client, videoId, visitorData);
      return { client: client.name, ms: attempt.ms, ok: attempt.ok, reason: attempt.reason, result: attempt.result };
    }),
  );
  const attempts = rawAttempts.map(({ client, ms, ok, reason }) => ({ client, ms, ok, reason }));
  const success = rawAttempts.find((a) => a.ok);
  if (success?.result) {
    return { ...success.result, attempts };
  }
  return { ok: false, attempts };
}

export async function tryMediaCdnResolver(videoId) {
  try {
    const sourceUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
    const initUrl = `https://loader.to/ajax/download.php?button=1&start=1&end=1&format=mp3&url=${encodeURIComponent(sourceUrl)}`;
    const initResponse = await fetch(initUrl, {
      signal: timeoutSignal(8_000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json, text/plain, */*',
      },
    });
    if (!initResponse.ok) return null;

    const init = await initResponse.json();
    const progressUrl = init.progress_url ||
      (init.id ? `https://lto2.affadaffa.com/api/progress?id=${encodeURIComponent(init.id)}` : null);
    if (!progressUrl) return null;

    const deadline = Date.now() + CONVERTER_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      const progressResponse = await fetch(progressUrl, {
        signal: timeoutSignal(6_000),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json, text/plain, */*',
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
          title: progress.title || init.title || 'Audio Track',
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

  if (IN_FLIGHT.has(videoId)) {
    return IN_FLIGHT.get(videoId);
  }

  const promise = (async () => {
    // Start direct resolver AND media converter concurrently at millisecond 0.
    const directPromise = tryDirectResolver(videoId);
    const cdnPromise = tryMediaCdnResolver(videoId);

    // Fast check: if direct resolver succeeds within 1.2s, return it immediately.
    const directFast = await Promise.race([
      directPromise,
      new Promise((resolve) => setTimeout(() => resolve(null), 1200)),
    ]);

    if (directFast?.ok) {
      const { attempts, ...payload } = directFast;
      STREAM_CACHE.set(videoId, { ts: Date.now(), data: payload });
      return payload;
    }

    // Otherwise, wait for the converter (which was already launched at t=0).
    const converter = await cdnPromise;
    if (converter?.ok) {
      STREAM_CACHE.set(videoId, { ts: Date.now(), data: converter });
      return converter;
    }

    // In case converter finished or failed and direct finished later:
    const directLate = await directPromise;
    if (directLate?.ok) {
      const { attempts, ...payload } = directLate;
      STREAM_CACHE.set(videoId, { ts: Date.now(), data: payload });
      return payload;
    }

    return {
      ok: false,
      error: `Could not prepare audio for the selected YouTube video ${videoId}`,
      attempts: directLate?.attempts || [],
    };
  })();

IN_FLIGHT.set(videoId, promise);
  try {
    return await promise;
  } finally {
    IN_FLIGHT.delete(videoId);
  }
}

export function prewarmStreamUrl(videoId) {
  if (!videoId) return Promise.resolve(null);
  if (STREAM_CACHE.has(videoId)) return Promise.resolve(STREAM_CACHE.get(videoId).data);
  if (IN_FLIGHT.has(videoId)) return IN_FLIGHT.get(videoId);
  resolveStreamUrl(videoId).catch(() => null);
  return Promise.resolve(null);
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
    const totalLength = info.contentLength || 0;
    const isGoogleVideo = info.url.includes('googlevideo.com');

    // Handle GoogleVideo URL (requires bounded chunks; open-ended ranges return 403 Forbidden)
    if (isGoogleVideo && totalLength > 0) {
      let start = 0;
      let end = totalLength - 1;

      if (rangeHeader) {
        const m = rangeHeader.match(/bytes=(\d+)-(\d*)/);
        if (m) {
          start = parseInt(m[1], 10);
          if (m[2]) {
            end = parseInt(m[2], 10);
          } else {
            // Unbounded range (e.g. bytes=0- or bytes=65536-)
            // Serve in chunks of 1MB (1,048,576 bytes) so GoogleVideo returns 200/206 instead of 403
            end = Math.min(start + 1048576 - 1, totalLength - 1);
          }
        }
      } else {
        // No range requested: default to first 1MB chunk
        end = Math.min(1048575, totalLength - 1);
      }

      const chunkUrl = `${info.url}&range=${start}-${end}`;
      const chunkRes = await fetch(chunkUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      if (!chunkRes.ok) {
        return new Response(null, { status: chunkRes.status, headers: corsHeaders });
      }

      const chunkSize = end - start + 1;
      const responseHeaders = new Headers(corsHeaders);
      responseHeaders.set('Content-Type', info.mimeType || 'audio/mp4');
      responseHeaders.set('Content-Length', chunkSize.toString());
      responseHeaders.set('Content-Range', `bytes ${start}-${end}/${totalLength}`);
      responseHeaders.set('Accept-Ranges', 'bytes');
      responseHeaders.set('Cache-Control', 'public, max-age=86400');

      return new Response(chunkRes.body, {
        status: 206,
        headers: responseHeaders,
      });
    }

    // Standard media CDN / direct stream fallback
    const headers = new Headers({
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    });
    if (rangeHeader) headers.set('Range', rangeHeader);

    const streamResponse = await fetch(info.url, { headers });
    const responseHeaders = new Headers(corsHeaders);
    responseHeaders.set(
      'Content-Type',
      streamResponse.headers.get('content-type') || info.mimeType || 'audio/mp4',
    );
    responseHeaders.set('Accept-Ranges', 'bytes');
    responseHeaders.set('Cache-Control', 'public, max-age=86400');

    for (const header of ['content-length', 'content-range']) {
      const value = streamResponse.headers.get(header);
      if (value) responseHeaders.set(header, value);
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
