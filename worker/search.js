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

const SKIP_WORDS = new Set(['Song', 'Album', 'Video', 'Single', 'EP', 'plays', 'views', '•', '|']);

export function extractArtists(runs) {
  if (!Array.isArray(runs) || runs.length === 0) return 'Unknown Artist';
  const valid = [];
  for (const r of runs) {
    const txt = (r.text || '').trim();
    if (!txt || SKIP_WORDS.has(txt) || txt.includes('plays') || txt.includes('views')) continue;
    valid.push(txt);
  }
  const result = valid.join('').trim();
  return result.length > 0 ? result : 'Unknown Artist';
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
  const groups = (renderer.flexColumns || []).slice(1).map(column =>
    column.musicResponsiveListItemFlexColumnRenderer?.text?.runs || []
  );
  const metadataRuns = groups.flat();

  const artist = extractArtists(groups[0] || metadataRuns);
  const durationRun = [...metadataRuns].reverse().find(run => parseDuration(run?.text) > 0);
  const thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  return {
    videoId,
    title,
    author: artist,
    thumbnail,
    duration: parseDuration(durationRun?.text),
  };
}

export function cardShelfToTrack(item) {
  const titleRuns = item?.title?.runs || [];
  const videoId = item?.onTap?.watchEndpoint?.videoId ||
    item?.onTap?.watchPlaylistEndpoint?.videoId;
  if (!videoId || titleRuns.length === 0) return null;

  const subtitleGroups = item?.subtitle?.runs || [];
  const durationText = subtitleGroups.at(-1)?.text;
  const artist = extractArtists(subtitleGroups);
  const thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  return {
    videoId,
    title: flattenRuns(titleRuns),
    author: artist,
    thumbnail,
    duration: parseDuration(durationText),
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
