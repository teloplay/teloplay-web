/**
 * Ultra-Fast & Bot-Proof Multi-Provider Stream Resolver & Range Proxy
 */

import { getVideoMetadata } from './search.js';

export const STREAM_CACHE = new Map();

let cachedScClientId = 'Pb72ranhoyt6gw7hM7TkzUItXlMWSNSo';
let scClientIdExpiry = Date.now() + 24 * 3600 * 1000;

export async function getSoundCloudClientId() {
  if (cachedScClientId && Date.now() < scClientIdExpiry) return cachedScClientId;

  try {
    const scHtmlRes = await fetch('https://soundcloud.com/', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    const scHtml = await scHtmlRes.text();
    const scripts = scHtml.match(/src="(https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+\.js)"/g) || [];

    for (let i = scripts.length - 1; i >= 0 && i >= scripts.length - 8; i--) {
      const srcMatch = scripts[i].match(/src="([^"]+)"/);
      if (!srcMatch) continue;
      const jsRes = await fetch(srcMatch[1]);
      const js = await jsRes.text();
      const m = js.match(/client_id[:=]["']([a-zA-Z0-9]{32})["']/);
      if (m) {
        cachedScClientId = m[1];
        scClientIdExpiry = Date.now() + 24 * 3600 * 1000;
        return cachedScClientId;
      }
    }
  } catch (e) {}

  return cachedScClientId || 'Pb72ranhoyt6gw7hM7TkzUItXlMWSNSo';
}

// ─── Tier 1: Instant SoundCloud Direct CDN Stream Resolver (500-800ms) ───
export async function resolveViaSoundCloud(query) {
  try {
    const clientId = await getSoundCloudClientId();
    if (!clientId) return null;

    const searchUrl = `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(query)}&client_id=${clientId}&limit=5`;
    const res = await fetch(searchUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    });
    if (!res.ok) return null;

    const data = await res.json();
    const tracks = data.collection || [];
    if (!tracks.length) return null;

    for (const track of tracks) {
      const transcodings = track.media?.transcodings || [];
      const fullProg = transcodings.find(t => t.format?.protocol === 'progressive' && !t.url.includes('/preview/'));
      const prog = fullProg || transcodings.find(t => t.format?.protocol === 'progressive') || transcodings[0];

      if (prog?.url) {
        const streamInfoRes = await fetch(`${prog.url}?client_id=${clientId}`);
        if (streamInfoRes.ok) {
          const streamInfo = await streamInfoRes.json();
          if (streamInfo.url) {
            return {
              ok: true,
              provider: 'soundcloud_cdn',
              url: streamInfo.url,
              mimeType: 'audio/mpeg',
              format: 'mp3',
              title: track.title,
              author: track.user?.username || 'Unknown',
              duration: Math.round((track.duration || 0) / 1000),
              thumbnail: track.artwork_url || track.user?.avatar_url,
            };
          }
        }
      }
    }
  } catch (e) {}
  return null;
}

// ─── Tier 2: YouTube Native VisionOS InnerTube Engine ───
export async function tryVisionOSResolver(videoId, visitorData) {
  try {
    const body = {
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
      videoId: videoId,
    };

    const res = await fetch('https://music.youtube.com/youtubei/v1/player?prettyPrint=false', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
        'X-YouTube-Client-Name': '101',
        'X-YouTube-Client-Version': '0.1',
        'Origin': 'https://music.youtube.com',
        'Referer': 'https://music.youtube.com/',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) return null;

    const json = await res.json();
    if (json.playabilityStatus?.status === 'OK') {
      const adaptive = (json.streamingData?.adaptiveFormats || []).concat(json.streamingData?.formats || []);
      const audioFormats = adaptive.filter(f => f.mimeType && f.mimeType.startsWith('audio/') && f.url);

      const best = audioFormats.find(f => f.itag === 140) ||
                   audioFormats.find(f => f.itag === 251) ||
                   audioFormats[0];

      if (best?.url) {
        return {
          ok: true,
          provider: 'youtube_visionos',
          url: best.url,
          mimeType: best.mimeType,
          itag: best.itag,
          bitrate: best.bitrate,
          duration: parseInt(json.videoDetails?.lengthSeconds || '0', 10),
          title: json.videoDetails?.title || 'Unknown',
          author: json.videoDetails?.author || 'Unknown',
        };
      }
    }
  } catch (e) {}
  return null;
}

// ─── Tier 3: Media CDN Converter Mirror ───
export async function tryMediaCdnResolver(videoId) {
  try {
    const initRes = await fetch(`https://loader.to/ajax/download.php?button=1&start=1&end=1&format=mp3&url=${encodeURIComponent('https://www.youtube.com/watch?v=' + videoId)}`);
    if (!initRes.ok) return null;
    const initData = await initRes.json();
    const progressUrl = initData.progress_url || (initData.id ? `https://lto2.affadaffa.com/api/progress?id=${initData.id}` : null);
    if (!progressUrl) return null;

    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 600));
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

export async function resolveStreamUrl(videoId, optionalQuery = '') {
  if (STREAM_CACHE.has(videoId)) {
    const cached = STREAM_CACHE.get(videoId);
    if (Date.now() - cached.ts < 12 * 3600 * 1000) {
      return { ...cached.data, cached: true };
    }
  }

  let songQuery = optionalQuery.trim();
  if (!songQuery) {
    const meta = await getVideoMetadata(videoId);
    if (meta && meta.title) {
      songQuery = `${meta.title} ${meta.author || ''}`.trim();
    }
  }
  if (!songQuery) {
    songQuery = videoId;
  }

  // 1. Instant SoundCloud Stream (Resolves in < 1 second!)
  const sc = await resolveViaSoundCloud(songQuery);
  if (sc && sc.ok) {
    STREAM_CACHE.set(videoId, { ts: Date.now(), data: sc });
    return sc;
  }

  // 2. VisionOS Engine
  const yt = await tryVisionOSResolver(videoId);
  if (yt && yt.ok) {
    STREAM_CACHE.set(videoId, { ts: Date.now(), data: yt });
    return yt;
  }

  // 3. Media CDN Resolver
  const cdn = await tryMediaCdnResolver(videoId);
  if (cdn && cdn.ok) {
    STREAM_CACHE.set(videoId, { ts: Date.now(), data: cdn });
    return cdn;
  }

  return { ok: false, error: `Could not resolve audio stream for ${videoId}` };
}

// ─── Range Streaming Proxy ───
export async function handleStreamProxy(request, videoId, corsHeaders = {}) {
  try {
    const url = new URL(request.url);
    const q = url.searchParams.get('q') || '';
    const info = await resolveStreamUrl(videoId, q);
    if (!info.ok || !info.url) {
      return new Response(JSON.stringify({ ok: false, error: info.error || 'Stream not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    };
    const rangeHeader = request.headers.get('Range');
    if (rangeHeader) headers['Range'] = rangeHeader;

    const streamRes = await fetch(info.url, { headers });

    const responseHeaders = new Headers(corsHeaders);
    responseHeaders.set('Content-Type', streamRes.headers.get('content-type') || info.mimeType || 'audio/mpeg');
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
