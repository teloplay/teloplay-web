/**
 * Exact YouTube audio resolver.
 * The resolver always uses the videoId selected by the search result. It never
 * searches another provider, so returned audio cannot be silently substituted.
 */

import { getVisitorData } from './search.js';

export const STREAM_CACHE = new Map();
export const IN_FLIGHT = new Map();

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const RESOLVE_TIMEOUT_MS = 9_000;
const CONVERTER_TIMEOUT_MS = 35_000;

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
  const attempts = await Promise.all(
    YT_CLIENTS.map(async (client) => {
      const attempt = await tryClientResolver(client, videoId, visitorData);
      return { client: client.name, ms: attempt.ms, ok: attempt.ok, reason: attempt.reason };
    }),
  );
  const success = attempts.find((a) => a.ok);
  if (success) {
    const result = success.result;
    if (result) return { ...result, attempts };
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
      await new Promise((resolve) => setTimeout(resolve, 700));
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
    const direct = await tryDirectResolver(videoId);
    if (direct.ok) {
      const { attempts, ...payload } = direct;
      STREAM_CACHE.set(videoId, { ts: Date.now(), data: payload });
      return payload;
    }

    const converter = await tryMediaCdnResolver(videoId);
    if (converter) {
      STREAM_CACHE.set(videoId, { ts: Date.now(), data: converter });
      return converter;
    }

    return {
      ok: false,
      error: `Could not prepare audio for the selected YouTube video ${videoId}`,
      attempts: direct.attempts,
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

    const headers = new Headers({
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
    });
    const range = request.headers.get('Range');
    if (range) headers.set('Range', range);

    const streamResponse = await fetch(info.url, { headers });
    const responseHeaders = new Headers(corsHeaders);
    responseHeaders.set(
      'Content-Type',
      streamResponse.headers.get('content-type') || info.mimeType || 'audio/mp4',
    );
    responseHeaders.set('Accept-Ranges', 'bytes');

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
