/**
 * YouTube Music InnerTube Search & Metadata Parser
 */

export const YT_HDRS = {
  'X-Goog-Api-Format-Version': '1',
  'Origin': 'https://music.youtube.com',
  'Referer': 'https://music.youtube.com/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
};

export async function getVisitorData() {
  try {
    const res = await fetch('https://music.youtube.com/sw.js_data', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    const text = await res.text();
    const clean = text.startsWith(")]}'") ? text.substring(5) : text;
    const parsed = JSON.parse(clean);
    const vd = parsed[0][2].find(i => typeof i === 'string' && (i.startsWith('Cg') || i.startsWith('Cgs')));
    return vd || null;
  } catch (e) {
    return null;
  }
}

export function findItems(obj, key, res = []) {
  if (!obj || typeof obj !== 'object') return res;
  if (Array.isArray(obj)) { for (const i of obj) findItems(i, key, res); return res; }
  for (const [k, v] of Object.entries(obj)) {
    if (k === key) res.push(v); else findItems(v, key, res);
  }
  return res;
}

export function flattenRuns(runs) {
  return Array.isArray(runs) ? runs.map(run => run?.text || '').join('') : '';
}

export function parseDuration(text) {
  if (!text || !text.includes(':')) return 0;
  const parts = text.split(':').map(value => Number.parseInt(value, 10));
  if (parts.some(Number.isNaN)) return 0;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

const DATE_REGEX = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4}$/i;
const DURATION_REGEX = /^\d{1,2}:\d{2}(:\d{2})?$/;
const VIEWS_REGEX = /^\d+(\.\d+)?(K|M|B)?\s+(views|plays)$/i;

export function extractTrackInfo(flexColumns) {
  if (!Array.isArray(flexColumns) || flexColumns.length < 2) {
    return { artist: 'Unknown Artist', duration: 0 };
  }

  const firstRuns = flexColumns[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
  const secondRuns = flexColumns[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
  const thirdRuns = flexColumns[2]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
  const allRuns = [...secondRuns, ...thirdRuns];

  let durationSec = 0;
  // Look for exact duration (e.g. "2:51" or "03:45")
  for (const r of allRuns) {
    const txt = (r.text || '').trim();
    if (DURATION_REGEX.test(txt)) {
      durationSec = parseDuration(txt);
      break;
    }
  }

  // Look for artists (ignore Date, views, duration, song/album type)
  const artistParts = [];
  for (const r of secondRuns) {
    const txt = (r.text || '').trim();
    if (!txt || txt === '•' || txt === '|' || txt === 'Song' || txt === 'Video' || txt === 'Album' || txt === 'Single') continue;
    if (DATE_REGEX.test(txt) || DURATION_REGEX.test(txt) || VIEWS_REGEX.test(txt)) continue;
    // Don't include text that ends with duration or date
    if (/^\d{4}$/.test(txt)) continue;
    artistParts.push(txt);
  }

  let artist = artistParts.join('').trim();
  if (!artist || artist.length === 0) {
    artist = 'Unknown Artist';
  }

  return { artist, duration: durationSec };
}

export function rendererToTrack(renderer) {
  const firstColumn = renderer.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer;
  const firstRuns = firstColumn?.text?.runs || [];
  const videoId = renderer.playlistItemData?.videoId ||
    renderer.navigationEndpoint?.watchEndpoint?.videoId ||
    renderer.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId ||
    firstRuns.find(run => run.navigationEndpoint?.watchEndpoint?.videoId)?.navigationEndpoint?.watchEndpoint?.videoId;
  if (!videoId) return null;

  const title = flattenRuns(firstRuns) || 'Unknown Title';
  const info = extractTrackInfo(renderer.flexColumns || []);
  const thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  return {
    videoId,
    title,
    author: info.artist,
    thumbnail,
    duration: info.duration,
  };
}

export function cardShelfToTrack(item) {
  const titleRuns = item?.title?.runs || [];
  const videoId = item?.onTap?.watchEndpoint?.videoId ||
    item?.onTap?.watchPlaylistEndpoint?.videoId;
  if (!videoId || titleRuns.length === 0) return null;

  const subtitleGroups = item?.subtitle?.runs || [];
  const info = extractTrackInfo([{ musicResponsiveListItemFlexColumnRenderer: { text: { runs: titleRuns } } }, { musicResponsiveListItemFlexColumnRenderer: { text: { runs: subtitleGroups } } }]);
  const thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  return {
    videoId,
    title: flattenRuns(titleRuns),
    author: info.artist,
    thumbnail,
    duration: info.duration,
  };
}

export async function searchYouTubeMusic(query, limit = 25) {
  const vd = await getVisitorData();
  const body = {
    context: { client: { clientName: 'WEB_REMIX', clientVersion: '1.20260114.01.00', gl: 'US', hl: 'en', visitorData: vd || undefined } },
    query,
  };

  const res = await fetch('https://music.youtube.com/youtubei/v1/search?prettyPrint=false', {
    method: 'POST',
    headers: { ...YT_HDRS, 'Content-Type': 'application/json', 'X-YouTube-Client-Name': '67', 'X-YouTube-Client-Version': '1.20260114.01.00' },
    body: JSON.stringify(body),
  });

  if (!res.ok) return [];

  const json = await res.json();
  const renderers = findItems(json, 'musicResponsiveListItemRenderer');
  const cardShelves = findItems(json, 'musicCardShelfRenderer');
  const cardTracks = cardShelves.flatMap(shelf => shelf.contents || [])
    .map(item => cardShelfToTrack(item.musicResponsiveListItemRenderer))
    .filter(Boolean);
  const tracks = [...cardTracks, ...renderers.map(rendererToTrack).filter(Boolean)];
  return tracks.filter((track, index, list) =>
    list.findIndex(item => item.videoId === track.videoId) === index
  ).slice(0, limit);
}

export async function getVideoMetadata(videoId) {
  try {
    const oembedRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
    if (oembedRes.ok) {
      const oembed = await oembedRes.json();
      return { title: oembed.title || '', author: oembed.author_name || '' };
    }
  } catch (e) {}
  return null;
}
