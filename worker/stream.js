/**
 * 100% YouTube Native Audio Stream Resolver
 * VisionOS InnerTube Engine -> Media CDN Fallback
 * No SoundCloud - Exact same song that user clicked
 */

import { getVisitorData } from './search.js';

export const STREAM_CACHE = new Map();

// ─── Tier 1: YouTube VisionOS InnerTube (Exact Match, ~1s) ───
export async function tryVisionOSResolver(videoId, visitorData) {
  try {
    const res = await fetch('https://music.youtube.com/youtubei/v1/player?prettyPrint=false', {
      method: 'POST',
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
    });

    if (!res.ok) return null;
    const json = await res.json();
    if (json.playabilityStatus?.status !== 'OK') return null;

    const adaptive = (json.streamingData?.adaptiveFormats || []).concat(json.streamingData?.formats || []);
    const audioFormats = adaptive.filter(f => f.mimeType && f.mimeType.startsWith('audio/') && f.url);
    const best = audioFormats.find(f => f.itag === 140) || audioFormats.find(f => f.itag === 251) || audioFormats[0];

    if (best?.url) {
      return {
        ok: true,
        provider: 'youtube_visionos',
        url: best.url,
        mimeType: best.mimeType,
        itag: best.itag,
        bitrate: best.bitrate,
        contentLength: best.contentLength ? parseInt(best.contentLength, 10) : undefined,
        duration: parseInt(json.videoDetails?.lengthSeconds || '0', 10),
        title: json.videoDetails?.title || 'Unknown',
        author: json.videoDetails?.author || 'Unknown',
      };
// ─── Tier 2: Media CDN Fallback (Exact YT video, ~10-15s) ───
export async function tryMediaCdnResolver(videoId) {
  try {
    const initRes = await fetch(`https://loader.to/ajax/download.php?button=1&start=1&end=1&format=mp3&url=${encodeURIComponent('https://www.youtube.com/watch?v=' + videoId)}`);
    if (!initRes.ok) return null;
    const initData = await initRes.json();
    const progressUrl = initData.progress_url || (initData.id ? `https://lto2.affadaffa.com/api/progress?id=${initData.id}` : null);
    if (!progressUrl) return null;

    for (let i = 0; i < 25; i++) {
      await new Promise(r => setTimeout(r, 500));
      const progRes = await fetch(progressUrl);
      if (progRes.ok) {
        const progData = await progRes.json();
        if (progData.success === 1 && progData.download_url) {
          return {
            ok: true,
            provider: 'media_cdn',
            url: progData.download_url,
            mimeType: 'audio/mpeg',
            format: 'mp3',
            title: progData.title || initData.title || 'Audio Track',
          };
        }
        if (progData.text && String(progData.text).toLowerCase().includes('error')) break;
      }
    }
  } catch (e) {}
  return null;
}

// ─── Master Resolver ───
export async function resolveStreamUrl(videoId) {
  // Check cache first (12 hour TTL)
  if (STREAM_CACHE.has(videoId)) {
    const cached = STREAM_CACHE.get(videoId);
    if (Date.now() - cached.ts < 12 * 3600 * 1000) {
      return { ...cached.data, cached: true };
    }
  }

  const visitorData = await getVisitorData();

  // 1. YouTube VisionOS - exact same song from YouTube (works on Render IP)
  const yt = await tryVisionOSResolver(videoId, visitorData);
  if (yt && yt.ok) {
    STREAM_CACHE.set(videoId, { ts: Date.now(), data: yt });
    return yt;
  }

  // 2. Media CDN - exact same YouTube video converted to MP3
  const cdn = await tryMediaCdnResolver(videoId);
  if (cdn && cdn.ok) {
    STREAM_CACHE.set(videoId, { ts: Date.now(), data: cdn });
    return cdn;
  }

  return { ok: false, error: `Could not resolve audio stream for ${videoId}` };
}

// ─── Range & CORS Stream Proxy ───
export async function handleStreamProxy(request, videoId, corsHeaders = {}) {
  try {
    const info = await resolveStreamUrl(videoId);
    if (!info.ok || !info.url) {
      return new Response(JSON.stringify({ ok: false, error: info.error || 'Stream not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
    };
    const rangeHeader = request.headers.get('Range');
    if (rangeHeader) headers['Range'] = rangeHeader;

    const streamRes = await fetch(info.url, { headers });

    const responseHeaders = new Headers(corsHeaders);
    responseHeaders.set('Content-Type', streamRes.headers.get('content-type') || info.mimeType || 'audio/mp4');
    responseHeaders.set('Accept-Ranges', 'bytes');
    if (streamRes.headers.get('content-length')) {
      responseHeaders.set('Content-Length', streamRes.headers.get('content-length'));
    }
    if (streamRes.headers.get('content-range')) {
      responseHeaders.set('Content-Range', streamRes.headers.get('content-range'));
    }

    return new Response(streamRes.body, {
      status: streamRes.status,
      headers: responseHeaders,
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

    }
  } catch (e) {}
  return null;
}
