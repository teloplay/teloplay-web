/**
 * Multi-entity search (songs/albums/artists/playlists) for web backend
 */
import { getVisitorData, YT_HDRS, FILTER_SONG, FILTER_VIDEO, FILTER_ALBUM, FILTER_ARTIST, FILTER_COMMUNITY_PLAYLIST, FILTER_FEATURED_PLAYLIST } from './search.js';
import { parseSectionItems } from './parsers.js';

async function searchFilter(query, filter, visitorData) {
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
  const body = { context, query, params: filter };

  try {
    const response = await fetch('https://music.youtube.com/youtubei/v1/search?prettyPrint=false', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (!response.ok) return { json: null, items: [] };
    const json = await response.json();
    return { json, items: [] };
  } catch (e) {
    return { json: null, items: [] };
  }
}

export async function searchSections(query, limitPerSection = 0) {
  const cleanQuery = (query || '').trim();
  if (!cleanQuery) return [];

  const vd = await getVisitorData();

  const filters = [
    { filter: FILTER_SONG, title: 'Songs', type: 'song' },
    { filter: FILTER_VIDEO, title: 'Videos', type: 'song' },
    { filter: FILTER_ALBUM, title: 'Albums', type: 'album' },
    { filter: FILTER_ARTIST, title: 'Artists', type: 'artist' },
    { filter: FILTER_COMMUNITY_PLAYLIST, title: 'Community playlists', type: 'playlist' },
    { filter: FILTER_FEATURED_PLAYLIST, title: 'Featured playlists', type: 'playlist' },
  ];

  const results = await Promise.allSettled(
    filters.map(f => searchFilter(cleanQuery, f.filter, vd))
  );

  const sections = [];
  for (let i = 0; i < filters.length; i++) {
    if (results[i].status !== 'fulfilled' || !results[i].value.json) continue;

    const items = parseSectionItems(results[i].value.json, filters[i].type);
    if (items.length === 0) continue;

    const limited = limitPerSection > 0 ? items.slice(0, limitPerSection) : items;
    sections.push({
      title: filters[i].title,
      items: limited,
    });
  }

  return sections;
}

export async function searchSuggestionsRich(query) {
  const cleanQuery = (query || '').trim();
  if (!cleanQuery) return { queries: [], items: [] };

  try {
    // Get text suggestions
    const suggestRes = await fetch(
      `https://suggestqueries.google.com/complete/search?client=youtube&ds=yt&q=${encodeURIComponent(cleanQuery)}`,
      { signal: AbortSignal.timeout(3000) }
    );
    const suggestText = await suggestRes.text();
    const suggestMatch = suggestText.match(/\((.*)\)/);
    const queries = suggestMatch ? JSON.parse(suggestMatch[1])[1].map(s => s[0]) : [];

    // Get song previews (top 5 songs)
    const vd = await getVisitorData();
    const songsRes = await searchFilter(cleanQuery, FILTER_SONG, vd);
    const items = songsRes.json ? parseSectionItems(songsRes.json, 'song').slice(0, 5) : [];

    return { queries, items };
  } catch (e) {
    return { queries: [], items: [] };
  }
}
