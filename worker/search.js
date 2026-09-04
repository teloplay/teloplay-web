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

// ─── Result prioritization ────────────────────────────────────────────────
// YouTube Music's default order surfaces "Top 10", "Best of", jukebox
// compilations ahead of actual individual songs, which is the wrong
// ranking for a music app. We re-rank merged results so that the most
// likely-to-be-wanted individual official track comes first.
const OFFICIAL_CHANNEL_HINTS = [
  'T-Series', 'Tseries', 'TSeries',
  'Sony Music', 'SonyMusic',
  'Zee Music', 'ZeeMusic',
  'Tips Official',
  'YRF', 'Yash Raj Films',
  'Aditya Music', 'AdityaMusic',
  'Lahari Music', 'LahariMusic', 'Lahari',
  'Saregama',
  'Universal Music', 'UniversalMusic',
  'Warner Music', 'Warner Bros',
  'Speed Records', 'SpeedRecords',
  'Venus Records', 'Venus',
  'Times Music', 'TimesMusic',
  'White Hill', 'WhiteHill',
  'Geet MP3', 'GeetMp3',
  'Shemaroo',
  'Dharma', 'Dharma Productions',
  'Excel Entertainment',
];

export const NON_MUSIC_PATTERNS = [
  /\b(?:part|episode|ep|eps)\s*\.?\s*\d+\b/i,
  /#(?:arrangemarriage|lesbian|lovestory|drama|movie|shorts|vlog)\b/i,
  /\b(?:quran|qur'aan|recitation|surah|tafsir|lecture|bayan|waz|khutbah|hadith|dars|sunnah|calamities|saut-ul-quran)\b/i,
  /\b(?:live\s*stream|live\s*now|🔴|breaking\s*news|press\s*conference|partai|suksesi)\b/i,
  /\b(?:full\s*movie|short\s*film|web\s*series|season\s*\d+)\b/i,
  /\b(?:football|goals?|skills?\s*(?:&|and)\s*goals?|highlights?|tribute\s+to|nostalgia\s*l|match\s*highlights?)\b/i,
  /\b(?:reaction|reacting|vlog)\b/i,
];

export function isNonMusic(track, query) {
  const text = ((track.title || '') + ' ' + (track.author || '')).toLowerCase();
  const q = (query || '').toLowerCase();
  for (const re of NON_MUSIC_PATTERNS) {
    if (re.test(text)) {
      const match = text.match(re);
      if (match && q.includes(match[0].toLowerCase())) continue;
      return true;
    }
  }
  if (track.duration > 900 && !/\b(hour|loop|meditation|sleep|relax|jukebox)\b/i.test(q)) {
    return true;
  }
  if (track.duration > 0 && track.duration < 40 && !/\b(ringtone|short|snippet|status)\b/i.test(q)) {
    return true;
  }
  return false;
}

export function parseViews(str) {
  if (!str) return 0;
  const m = str.match(/^([\d\.]+)\s*([KMBkmb]|million|billion|thousand)?\s*(views|plays)?/i);
  if (!m) return 0;
  let val = parseFloat(m[1]);
  const unit = (m[2] || '').toUpperCase();
  if (unit === 'B' || unit === 'BILLION') val *= 1e9;
  else if (unit === 'M' || unit === 'MILLION') val *= 1e6;
  else if (unit === 'K' || unit === 'THOUSAND') val *= 1e3;
  return val;
}

export function extractPlays(renderer) {
  if (!renderer?.flexColumns) return 0;
  for (const col of renderer.flexColumns) {
    const runs = col?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
    for (const r of runs) {
      const text = (r.text || '').trim();
      if (/(\d+(\.\d+)?)\s*(K|M|B|million|billion|thousand)?\s*(views|plays)/i.test(text)) {
        return parseViews(text);
      }
    }
  }
  return 0;
}

export function calculateScore(track, query) {
  const title = (track.title || '').toLowerCase().trim();
  const author = (track.author || '').toLowerCase().trim();
  const q = (query || '').toLowerCase().trim();
  const qEscaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let s = 0;

  // 1. Title match relevance
  const isExactTitle = title === q;
  const isFromSoundtrack = new RegExp('^' + qEscaped + '\\s*\\((?:from|feat|with)\\b', 'i').test(title);
  const isOfficialRelease = new RegExp('^' + qEscaped + '\\s*\\((?:official|original|audio|video)\\b', 'i').test(title);

  if (isExactTitle || isFromSoundtrack || isOfficialRelease) {
    s += 10000;
  } else if (title.startsWith(q + ' (') || title.startsWith(q + ' -') || title.startsWith(q + ':')) {
    s += 8000;
  } else if (title.startsWith(q)) {
    s += 6500;
  } else if (new RegExp('\\b' + qEscaped + '\\b', 'i').test(title)) {
    s += 4500;
  } else if (title.includes(q)) {
    s += 2000;
  }

  // 2. Artist match relevance
  if (author === q) {
    s += 8000;
  } else if (new RegExp('\\b' + qEscaped + '\\b', 'i').test(author) && !isExactTitle) {
    s += 3000;
  }

  // 3. YouTube Music Top Result Card boost
  if (track.fromCardShelf) s += 2500;

  // 4. Official studio audio release (has album name)
  if (track.albumName && track.albumName.trim().length > 0) s += 2000;

  // 5. Normal song duration (60s to 480s)
  if (track.duration >= 60 && track.duration <= 480) s += 1000;

  // 6. Play count / popularity boost
  if (track.plays && track.plays > 0) {
    if (track.plays >= 50e6) s += 2500;
    else if (track.plays >= 10e6) s += 2000;
    else if (track.plays >= 1e6) s += 1200;
    else if (track.plays >= 1e5) s += 600;
    else if (track.plays >= 1e4) s += 200;
  }

  // 7. Official record labels / channels
  const isOfficial = OFFICIAL_CHANNEL_HINTS.some(h => author.includes(h.toLowerCase())) ||
    author.includes('vevo') || author.includes('- topic');
  if (isOfficial) s += 1000;

  // 8. Penalties for derivatives / secondary uploads
  if (/\b(slowed|reverb|lofi|lo-fi|remix|bass boosted|8d audio|speed up|mashup)\b/i.test(title)) s -= 3500;
  if (/\b(lyrics|lyrical|female version|male version|cover|acoustic version|unplugged)\b/i.test(title)) s -= 2000;
  if (/\b(ringtone|status|bgm|instrumental)\b/i.test(title)) s -= 2500;
  if (/\b(jukebox|top\s*\d+|best of|all songs|compilation|nonstop|non stop)\b/i.test(title)) s -= 4500;

  // 9. Cleaner shorter title preference (tie-breaker)
  s -= Math.min(title.length, 80) * 10;
  return s;
}

export function rankTracks(tracks, query) {
  return tracks.slice().sort((a, b) => calculateScore(b, query) - calculateScore(a, query));
}

// Back-compat: keep trackPriority exported in case other code uses it.
export function trackPriority(track) {
  if (!track) return 99;
  return 50;
}

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
  const plays = extractPlays(renderer);

  return {
    videoId,
    title,
    author: author !== 'Unknown Artist' ? author : info.artist,
    albumName: info.albumName || '',
    thumbnail,
    duration: info.duration,
    plays,
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
  const plays = extractPlays(item);

  return {
    videoId,
    title: flattenRuns(titleRuns),
    author: info.artist,
    albumName: info.albumName || '',
    thumbnail,
    duration: info.duration,
    plays,
    fromCardShelf: true,
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

export const FILTER_SONG = 'EgWKAQIIAWoKEAkQBRAKEAMQBA%3D%3D';
export const FILTER_VIDEO = 'EgWKAQIQAWoKEAkQChAFEAMQBA%3D%3D';

async function searchYouTubeMusicEndpoint(query, params, visitorData, continuation) {
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
  const body = continuation
    ? { context, continuation }
    : { context, query, ...(params ? { params } : {}) };

  try {
    const response = await fetch('https://music.youtube.com/youtubei/v1/search?prettyPrint=false', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (!response.ok) return { json: null, tracks: [], token: null };
    const json = await response.json();
    const tracks = tracksFromMusicResponse(json);
    const token = continuationTokens(json)[0] || null;
    return { json, tracks, token };
  } catch (e) {
    return { json: null, tracks: [], token: null };
  }
}

export async function searchYouTubeMusic(query, limit = 25) {
  const targetCount = Math.min(Math.max(limit, 1), 100);
  const cleanQuery = (query || '').trim();
  if (!cleanQuery) return [];

  const vd = await getVisitorData();

  // Query YouTube Music like OpenTune / InnerTube:
  // 1. Default search (no params) -> Captures Top Result Card shelf (musicCardShelfRenderer)
  // 2. "Songs" filter (EgWKAQIIAWoKEAkQBRAKEAMQBA%3D%3D) -> Canonical songs in fresh InnerTube relevance order
  // 3. "Videos" filter (EgWKAQIQAWoKEAkQChAFEAMQBA%3D%3D) -> Official music videos
  const [defaultRes, songsRes, videosRes] = await Promise.allSettled([
    searchYouTubeMusicEndpoint(cleanQuery, undefined, vd),
    searchYouTubeMusicEndpoint(cleanQuery, FILTER_SONG, vd),
    searchYouTubeMusicEndpoint(cleanQuery, FILTER_VIDEO, vd),
  ]);

  // 1. Extract Top Result card & sub-items from default search
  const topCardTracks = [];
  if (defaultRes.status === 'fulfilled' && defaultRes.value?.json) {
    const cardShelves = findItems(defaultRes.value.json, 'musicCardShelfRenderer');
    for (const shelf of cardShelves) {
      const top = cardShelfToTrack(shelf);
      if (top) topCardTracks.push(top);
      for (const item of (shelf.contents || [])) {
        const t = cardShelfToTrack(item.musicResponsiveListItemRenderer);
        if (t) topCardTracks.push(t);
      }
    }
  }

  const songsTracks = songsRes.status === 'fulfilled' ? songsRes.value.tracks : [];
  const videosTracks = videosRes.status === 'fulfilled' ? videosRes.value.tracks : [];

  // Order: Top Result Card -> Pure Songs -> Videos
  let merged = [...topCardTracks, ...songsTracks, ...videosTracks];

  // If user requested a large limit and continuation token is available, fetch next page
  if (targetCount > 25 && songsRes.status === 'fulfilled' && songsRes.value.token) {
    try {
      const nextPage = await searchYouTubeMusicEndpoint(cleanQuery, FILTER_SONG, vd, songsRes.value.token);
      if (nextPage.tracks.length > 0) {
        merged.push(...nextPage.tracks);
      }
    } catch (e) {}
  }

  // Deduplicate by videoId while preserving the natural fresh InnerTube order
  // and merging richer metadata (duration, albumName, plays)
  const trackMap = new Map();
  for (const t of merged) {
    if (!t || !t.videoId) continue;
    if (!trackMap.has(t.videoId)) {
      trackMap.set(t.videoId, { ...t });
    } else {
      const existing = trackMap.get(t.videoId);
      if (!existing.albumName && t.albumName) existing.albumName = t.albumName;
      if ((!existing.duration || existing.duration === 0) && t.duration > 0) existing.duration = t.duration;
      if ((!existing.plays || existing.plays === 0) && t.plays > 0) existing.plays = t.plays;
      if (t.fromCardShelf) existing.fromCardShelf = true;
    }
  }

  let candidates = Array.from(trackMap.values());

  // Filter out non-music items (podcasts, religious lectures, drama episodes, sports highlights, live streams)
  const musicOnly = candidates.filter(t => !isNonMusic(t, cleanQuery));
  const finalPool = musicOnly.length > 0 ? musicOnly : candidates;

  return finalPool.slice(0, targetCount);
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
