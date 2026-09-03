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
const VIEWS_REGEX = /^(\d+(\.\d+)?)\s*(K|M|B|million|billion|thousand)?\s*(views|plays)$/i;
const SEPARATOR = '•';

export function extractTrackInfo(flexColumns) {
  if (!Array.isArray(flexColumns) || flexColumns.length < 2) {
    return { artist: 'Unknown Artist', albumName: '', duration: 0 };
  }

  const secondRuns = flexColumns[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
  const thirdRuns = flexColumns[2]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];

  // Split col1 runs by "•" separator into sections: [artists, album, duration]
  const sections = [];
  let current = [];
  for (const r of secondRuns) {
    const txt = (r.text || '').trim();
    if (txt === SEPARATOR) {
      if (current.length > 0) sections.push(current);
      current = [];
    } else {
      current.push(r);
    }
  }
  if (current.length > 0) sections.push(current);

  // Extract duration from last section or any section
  let durationSec = 0;
  for (const section of [...sections].reverse()) {
    for (const r of section) {
      const txt = (r.text || '').trim();
      if (DURATION_REGEX.test(txt)) {
        durationSec = parseDuration(txt);
        break;
      }
    }
    if (durationSec > 0) break;
  }

  // Also check col2 (plays/views column) for duration
  if (durationSec === 0) {
    for (const r of thirdRuns) {
      const txt = (r.text || '').trim();
      if (DURATION_REGEX.test(txt)) {
        durationSec = parseDuration(txt);
        break;
      }
    }
  }

  // A YT Music result usually uses one of these layouts:
  //   Song • Artist • Album • 3:42
  //   Video • Channel • 3:42
  // The first section is a type label, not an artist. The old parser read
  // `Song` as the artist section and consequently put the actual artist into
  // `albumName`, producing "Unknown Artist" in the app.
  const typeLabels = new Set(['Song', 'Video', 'Album', 'Single', 'Episode', 'Podcast', 'Playlist']);
  const isNonMetadata = (text) =>
    !text || DATE_REGEX.test(text) || VIEWS_REGEX.test(text) ||
    DURATION_REGEX.test(text) || /^\d{4}$/.test(text);
  const cleanSection = (section) => section
    .map(run => (run.text || '').trim())
    .filter(text => !isNonMetadata(text))
    .join('')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s*&\s*/g, ' & ')
    .replace(/\s+/g, ' ')
    .trim();

  const cleanSections = sections.map(cleanSection).filter(Boolean);
  const firstIsType = typeLabels.has(cleanSections[0]);
  const artistIndex = firstIsType ? 1 : 0;
  const artist = cleanSections[artistIndex] || 'Unknown Artist';

  // Only treat the item after artist as an album when it is not a type label,
  // duration, view count, or publication date. Music-video results often have
  // no album, which is a valid empty value.
  const albumCandidate = cleanSections[artistIndex + 1] || '';
  const albumName = typeLabels.has(albumCandidate) || isNonMetadata(albumCandidate)
    ? ''
    : albumCandidate;

  return { artist, albumName, duration: durationSec };
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

  // Try to extract author from accessibility label first (most reliable)
  let author = 'Unknown Artist';
  if (renderer.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.accessibilityPlayData?.accessibilityData?.label) {
    const label = renderer.overlay.musicItemThumbnailOverlayRenderer.content.musicPlayButtonRenderer.accessibilityPlayData.accessibilityData.label;
    // Format is usually "Play [Title] - [Artist]" or "Play [Title] - [Artist] [Additional info]"
    // Use non-greedy matching to correctly extract artist with spaces
    const match = label.match(/^Play\s+(.+?)\s*-\s*(.+?)(?:\s*$|$)/);
    if (match && match[2]) {
      author = match[2].trim();
    }
  }
  
  // Try to extract from other sources if still unknown
  if (author === 'Unknown Artist' && renderer.flexColumns?.length >= 2) {
    const secondColumn = renderer.flexColumns[1]?.musicResponsiveListItemFlexColumnRenderer;
    const secondRuns = secondColumn?.text?.runs || [];
    // Look for channel names in the second column runs
    for (const run of secondRuns) {
      const text = run.text || '';
      const trimmed = text.trim();
      // Skip empty, separators, type labels, dates, view counts, and durations
      if (!trimmed || trimmed === '•' ||
          /^(Song|Video|Album|Playlist|Episod|Podcas|Single|Episode|Play|Plays)$/i.test(trimmed) ||
          /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{4}$/i.test(trimmed) ||
          /^(\d+(\.\d+)?\s*[KMB]?\s*(views|plays))$/i.test(trimmed) ||
          /^\d{1,2}:\d{2}(:\d{2})?$/.test(trimmed)) {
        continue;
      }
      author = trimmed;
      break;
    }
  }

  // Fallback to navigation endpoint author
  if (author === 'Unknown Artist' && firstRuns.length > 0) {
    const authorRun = firstRuns.find(run => {
      const text = run.text || '';
      const trimmed = text.trim();
      return trimmed &&
        !/^(Song|Video|Album|Playlist|Episod|Podcas|Single|Episode|Play|Plays)$/i.test(trimmed) &&
        !/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{4}$/i.test(trimmed);
    });
    if (authorRun) author = authorRun.text.trim();
  }

  const info = extractTrackInfo(renderer.flexColumns || []);
  const thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  return {
    videoId,
    title,
    author: author !== 'Unknown Artist' ? author : info.artist,
    albumName: info.albumName || '',
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
    albumName: info.albumName || '',
    thumbnail,
    duration: info.duration,
  };
}

function webVideoRendererToTrack(renderer) {
  const videoId = renderer?.videoId;
  if (!videoId) return null;

  const title = flattenRuns(renderer.title?.runs) || 'Unknown Title';
  
  // Try multiple fields for artist/author
  let author = 'Unknown Artist';
  if (renderer.ownerText?.runs) {
    author = flattenRuns(renderer.ownerText.runs);
  }
  if ((author === 'Unknown Artist' || author.trim() === '') && renderer.longBylineText?.runs) {
    const longByline = flattenRuns(renderer.longBylineText.runs);
    // Only use longByline if it doesn't look like a view count or date
    if (!/^\d+(\.\d+)?\s*[KMB]?\s*(views|plays)$/i.test(longByline) && 
        !/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{4}$/i.test(longByline)) {
      author = longByline;
    }
  }
  
  // Try multiple fields for duration
  let durationText = '';
  if (renderer.lengthText?.simpleText) {
    durationText = renderer.lengthText.simpleText;
  } else if (renderer.lengthText?.runs) {
    durationText = flattenRuns(renderer.lengthText.runs);
  }
  
  // Fallback: try to extract duration from title if it's in format like "Song Title - 3:45"
  if (!durationText || !/^\d{1,2}:\d{2}(:\d{2})?$/.test(durationText)) {
    const titleMatch = title.match(/[-–—]\s*(\d{1,2}:\d{2}(:\d{2})?)\s*$/);
    if (titleMatch) {
      durationText = titleMatch[1];
    }
  }
  
  const thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  return {
    videoId,
    title,
    author,
    albumName: '',
    thumbnail,
    duration: parseDuration(durationText),
  };
}

async function searchYouTubeWeb(query) {
  const body = {
    context: {
      client: {
        clientName: 'WEB',
        clientVersion: '2.20260114.00.00',
        gl: 'US',
        hl: 'en',
      },
    },
    query,
  };
  const response = await fetch('https://www.youtube.com/youtubei/v1/search?prettyPrint=false', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': 'https://www.youtube.com',
      'Referer': 'https://www.youtube.com/',
      'User-Agent': YT_HDRS['User-Agent'],
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) return [];
  const json = await response.json();
  return findItems(json, 'videoRenderer').map(webVideoRendererToTrack).filter(Boolean);
}

function tracksFromMusicResponse(json) {
  const renderers = findItems(json, 'musicResponsiveListItemRenderer');
  const cardShelves = findItems(json, 'musicCardShelfRenderer');
  const cardTracks = cardShelves.flatMap(shelf => shelf.contents || [])
    .map(item => cardShelfToTrack(item.musicResponsiveListItemRenderer))
    .filter(Boolean);
  return [...cardTracks, ...renderers.map(rendererToTrack).filter(Boolean)];
}

function continuationTokens(json) {
  return findItems(json, 'continuationItemRenderer')
    .map(item => item?.continuationEndpoint?.continuationCommand?.token)
    .filter(Boolean);
}

async function searchYouTubeMusicPages(query, visitorData, targetCount) {
  const context = {
    client: {
      clientName: 'WEB_REMIX',
      clientVersion: '1.20260114.01.00',
      gl: 'US',
      hl: 'en',
      visitorData: visitorData || undefined,
    },
  };
  const headers = {
    ...YT_HDRS,
    'Content-Type': 'application/json',
    'X-YouTube-Client-Name': '67',
    'X-YouTube-Client-Version': '1.20260114.01.00',
  };
  const requestPage = async (body) => {
    const response = await fetch('https://music.youtube.com/youtubei/v1/search?prettyPrint=false', {
      method: 'POST', headers, body: JSON.stringify(body),
    });
    return response.ok ? response.json() : null;
  };

  const firstPage = await requestPage({ context, query });
  if (!firstPage) return [];

  let tracks = tracksFromMusicResponse(firstPage);
  let tokens = continuationTokens(firstPage);
  // Fetch at most three additional pages. This keeps latency bounded while
  // allowing the API's public limit of 100 results to be filled when available.
  for (let page = 0; page < 3 && tracks.length < targetCount && tokens.length; page += 1) {
    const token = tokens.shift();
    const nextPage = await requestPage({ context, continuation: token });
    if (!nextPage) continue;
    tracks = [...tracks, ...tracksFromMusicResponse(nextPage)];
    tokens = [...tokens, ...continuationTokens(nextPage)];
  }
  return tracks;
}

export async function searchYouTubeMusic(query, limit = 25) {
  const targetCount = Math.min(Math.max(limit, 1), 100);
  const vd = await getVisitorData();

  // Music search gives canonical songs/albums; WEB search supplements it with
  // official music videos, uploads, live performances, and trending results.
  // Both requests begin together, then Music pagination fills additional items.
  const [musicResult, webResult] = await Promise.allSettled([
    searchYouTubeMusicPages(query, vd, targetCount),
    searchYouTubeWeb(query),
  ]);

  const musicTracks = musicResult.status === 'fulfilled' ? musicResult.value : [];
  const webTracks = webResult.status === 'fulfilled' ? webResult.value : [];
  const tracks = [...musicTracks, ...webTracks];
  return tracks.filter((track, index, list) =>
    list.findIndex(item => item.videoId === track.videoId) === index
  ).slice(0, targetCount);
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
