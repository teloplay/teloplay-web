/**
 * Exact YouTube audio resolver.
 * The resolver always uses the videoId selected by the search result. It never
 * searches another provider, so returned audio cannot be silently substituted.
 */

import { getVisitorData } from './search.js';

export const STREAM_CACHE = new Map();
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const RESOLVE_TIMEOUT_MS = 12_000;

function timeoutSignal(timeoutMs) {
  return AbortSignal.timeout(timeoutMs);
}

export async function tryVisionOSResolver(videoId, visitorData) {
  try {
    const response = await fetch(
      'https://music.youtube.com/youtubei/v1/player?prettyPrint=false',
      {
        method: 'POST',
        signal: timeoutSignal(RESOLVE_TIMEOUT_MS),
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
          'X-YouTube-Client-Name': '101',
          'X-YouTube-Client-Version': '0.1',
          'Origin': 'https://music.youtube.com',
          'Referer': 'https://music.youtube.com/',
        },
        body: JSON.stringify({
          context: {
            client: {
              clientName: 'VISIONOS',
              clientVersion: '0.1',
              osName: 'visionOS',
              osVersion: '1.3.21O771',
              deviceMake: 'Apple',
              deviceModel: 'RealityDevice14,1',
              gl: 'US',
              hl: 'en',
              visitorData: visitorData || undefined,
            },
          },
          videoId,
        }),
      },
    );

    if (!response.ok) return null;

    const json = await response.json();
    if (json.playabilityStatus?.status !== 'OK') return null;

    const formats = [
      ...(json.streamingData?.adaptiveFormats || []),
      ...(json.streamingData?.formats || []),
    ];
    const audioFormats = formats.filter((format) =>
      format.mimeType?.startsWith('audio/') && typeof format.url === 'string',
    );
    const best =
      audioFormats.find((format) => format.itag === 140) ||
      audioFormats.find((format) => format.itag === 251) ||
      audioFormats[0];

    if (!best?.url) return null;

    return {
      ok: true,
      provider: 'youtube_visionos',
      url: best.url,
      mimeType: best.mimeType,
      itag: best.itag,
      bitrate: best.bitrate,
      contentLength: best.contentLength ? Number.parseInt(best.contentLength, 10) : undefined,
      duration: Number.parseInt(json.videoDetails?.lengthSeconds || '0', 10),
      title: json.videoDetails?.title || 'Unknown',
      author: json.videoDetails?.author || 'Unknown',
    };
  } catch {
    return null;
  }
}

export async function resolveStreamUrl(videoId) {
  const cached = STREAM_CACHE.get(videoId);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return { ...cached.data, cached: true };
  }

  const visitorData = await getVisitorData();
  const result = await tryVisionOSResolver(videoId, visitorData);

  if (!result) {
    return {
      ok: false,
      error: `YouTube did not provide a playable audio stream for ${videoId}`,
    };
  }

  STREAM_CACHE.set(videoId, { ts: Date.now(), data: result });
  return result;
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
