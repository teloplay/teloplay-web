/**
 * YouTube Music Rich Metadata & Lyrics Engine
 * Provides rich artist profiles, descriptions, album details,
 * explore page (trending, new releases) and synced lyrics (LRCLib + YouTube Music).
 */

import { YT_HDRS, getVisitorData, findItems, rendererToTrack } from './search.js';

/**
 * Fetch lyrics: combines YouTube Music official lyrics and LRCLib time-synced lyrics
 */
export async function getSongLyrics(videoId, title = '', artist = '', duration = 0) {
  let plainLyrics = null;
  let syncedLyrics = null;
  const vd = await getVisitorData();

  // 1. YouTube Music Lyrics Tab
  if (videoId) {
    try {
      const nextRes = await fetch('https://music.youtube.com/youtubei/v1/next?prettyPrint=false', {
        method: 'POST',
        headers: {
          ...YT_HDRS,
          'Content-Type': 'application/json',
          'X-YouTube-Client-Name': '67',
          'X-YouTube-Client-Version': '1.20260114.01.00',
        },
        body: JSON.stringify({
          context: {
            client: {
              clientName: 'WEB_REMIX',
              clientVersion: '1.20260114.01.00',
              gl: 'US',
              hl: 'en',
              visitorData: vd || undefined,
            },
          },
          videoId,
        }),
      });

      if (nextRes.ok) {
        const nextJson = await nextRes.json();
        const tabs = nextJson.contents?.singleColumnMusicWatchNextResultsRenderer?.tabbedRenderer?.watchNextTabbedResultsRenderer?.tabs || [];
        const lyricsTab = tabs.find(t => t.tabRenderer?.title === 'Lyrics' || t.tabRenderer?.endpoint?.browseEndpoint?.browseId?.startsWith('MPLY'));
        const lyricsBrowseId = lyricsTab?.tabRenderer?.endpoint?.browseEndpoint?.browseId;

        if (lyricsBrowseId) {
          const browseRes = await fetch('https://music.youtube.com/youtubei/v1/browse?prettyPrint=false', {
            method: 'POST',
            headers: {
              ...YT_HDRS,
              'Content-Type': 'application/json',
              'X-YouTube-Client-Name': '67',
              'X-YouTube-Client-Version': '1.20260114.01.00',
            },
            body: JSON.stringify({
              context: {
                client: {
                  clientName: 'WEB_REMIX',
                  clientVersion: '1.20260114.01.00',
                  gl: 'US',
                  hl: 'en',
                  visitorData: vd || undefined,
                },
              },
              browseId: lyricsBrowseId,
            }),
          });

          if (browseRes.ok) {
            const browseJson = await browseRes.json();
            plainLyrics = browseJson.contents?.sectionListRenderer?.contents?.[0]?.musicDescriptionShelfRenderer?.description?.runs?.map(r => r.text).join('') || null;
          }
        }
      }
    } catch (e) {}
  }

  // 2. LRCLib Synced Lyrics (OpenTune method)
  if (title && artist) {
    try {
      const cleanTitle = title.replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '').trim();
      const cleanArtist = artist.split(/[,&•]/)[0].trim();
      const lrcUrl = `https://lrclib.net/api/get?track_name=${encodeURIComponent(cleanTitle)}&artist_name=${encodeURIComponent(cleanArtist)}${duration > 0 ? `&duration=${duration}` : ''}`;
      
      const lrcRes = await fetch(lrcUrl, {
        headers: { 'User-Agent': 'TeloPlay/1.0 (https://github.com/teloplay)' },
        signal: AbortSignal.timeout(4000),
      });

      if (lrcRes.ok) {
        const lrcData = await lrcRes.json();
        syncedLyrics = lrcData.syncedLyrics || null;
        if (!plainLyrics && lrcData.plainLyrics) {
          plainLyrics = lrcData.plainLyrics;
        }
      }
    } catch (e) {}
  }

  return {
    videoId,
    title,
    artist,
    plainLyrics,
    syncedLyrics,
    hasSynced: !!syncedLyrics,
  };
}

/**
 * Fetch Artist Details: bio, header image, subscriber count, top songs
 */
export async function getArtistDetails(browseId) {
  const vd = await getVisitorData();
  const cleanId = browseId.startsWith('UC') || browseId.startsWith('FEmusic_') ? browseId : `UC${browseId}`;

  try {
    const res = await fetch('https://music.youtube.com/youtubei/v1/browse?prettyPrint=false', {
      method: 'POST',
      headers: {
        ...YT_HDRS,
        'Content-Type': 'application/json',
        'X-YouTube-Client-Name': '67',
        'X-YouTube-Client-Version': '1.20260114.01.00',
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'WEB_REMIX',
            clientVersion: '1.20260114.01.00',
            gl: 'US',
            hl: 'en',
            visitorData: vd || undefined,
          },
        },
        browseId: cleanId,
      }),
    });

    if (!res.ok) return { error: 'Failed to fetch artist details' };
    const json = await res.json();

    const header = json.header?.musicImmersiveHeaderRenderer || json.header?.musicVisualHeaderRenderer || json.header?.musicHeaderRenderer;
    const name = header?.title?.runs?.map(r => r.text).join('') || '';
    const description = header?.description?.runs?.map(r => r.text).join('') || '';
    const thumbs = header?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails ||
                   header?.foregroundThumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
    const thumbnail = thumbs.length > 0 ? thumbs[thumbs.length - 1].url : '';
    const subscriberCount = header?.subscriptionButton?.subscribeButtonRenderer?.subscriberCountText?.runs?.map(r => r.text).join('') || '';

    // Extract top songs from the artist page
    const renderers = findItems(json, 'musicResponsiveListItemRenderer');
    const topSongs = renderers.map(rendererToTrack).filter(Boolean).slice(0, 15);

    return {
      id: cleanId,
      name,
      description,
      thumbnail,
      subscriberCount,
      topSongs,
    };
  } catch (e) {
    return { error: e.message };
  }
}

/**
 * Fetch Explore Page: Trending music, New Releases, Moods & Genres
 */
export async function getExplorePage() {
  const vd = await getVisitorData();

  try {
    const res = await fetch('https://music.youtube.com/youtubei/v1/browse?prettyPrint=false', {
      method: 'POST',
      headers: {
        ...YT_HDRS,
        'Content-Type': 'application/json',
        'X-YouTube-Client-Name': '67',
        'X-YouTube-Client-Version': '1.20260114.01.00',
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'WEB_REMIX',
            clientVersion: '1.20260114.01.00',
            gl: 'US',
            hl: 'en',
            visitorData: vd || undefined,
          },
        },
        browseId: 'FEmusic_explore',
      }),
    });

    if (!res.ok) return { sections: [] };
    const json = await res.json();

    const shelves = findItems(json, 'musicCarouselShelfRenderer');
    const sections = shelves.map(s => {
      const title = s.header?.musicCarouselShelfBasicHeaderRenderer?.title?.runs?.map(r => r.text).join('') || 'Featured';
      const items = (s.contents || []).map(item => {
        if (item.musicResponsiveListItemRenderer) {
          return rendererToTrack(item.musicResponsiveListItemRenderer);
        }
        if (item.musicTwoRowItemRenderer) {
          const r = item.musicTwoRowItemRenderer;
          const videoId = r.navigationEndpoint?.watchEndpoint?.videoId;
          const title = r.title?.runs?.map(x => x.text).join('') || '';
          const author = r.subtitle?.runs?.map(x => x.text).join('') || '';
          const thumbs = r.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
          return {
            videoId: videoId || '',
            title,
            author,
            thumbnail: thumbs.length > 0 ? thumbs[thumbs.length - 1].url : '',
          };
        }
        return null;
      }).filter(Boolean);

      return { title, items };
    });

    return { sections };
  } catch (e) {
    return { sections: [], error: e.message };
  }
}

/**
 * Fetch Song Details: credits, description, related songs
 */
export async function getSongDetails(videoId) {
  const vd = await getVisitorData();

  try {
    const nextRes = await fetch('https://music.youtube.com/youtubei/v1/next?prettyPrint=false', {
      method: 'POST',
      headers: {
        ...YT_HDRS,
        'Content-Type': 'application/json',
        'X-YouTube-Client-Name': '67',
        'X-YouTube-Client-Version': '1.20260114.01.00',
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'WEB_REMIX',
            clientVersion: '1.20260114.01.00',
            gl: 'US',
            hl: 'en',
            visitorData: vd || undefined,
          },
        },
        videoId,
      }),
    });

    if (!nextRes.ok) return { videoId };
    const json = await nextRes.json();

    const tabs = json.contents?.singleColumnMusicWatchNextResultsRenderer?.tabbedRenderer?.watchNextTabbedResultsRenderer?.tabs || [];
    const relatedTab = tabs.find(t => t.tabRenderer?.title === 'Related');
    const relatedBrowseId = relatedTab?.tabRenderer?.endpoint?.browseEndpoint?.browseId;

    let relatedSongs = [];
    let artistBio = '';

    if (relatedBrowseId) {
      const browseRes = await fetch('https://music.youtube.com/youtubei/v1/browse?prettyPrint=false', {
        method: 'POST',
        headers: {
          ...YT_HDRS,
          'Content-Type': 'application/json',
          'X-YouTube-Client-Name': '67',
          'X-YouTube-Client-Version': '1.20260114.01.00',
        },
        body: JSON.stringify({
          context: {
            client: {
              clientName: 'WEB_REMIX',
              clientVersion: '1.20260114.01.00',
              gl: 'US',
              hl: 'en',
              visitorData: vd || undefined,
            },
          },
          browseId: relatedBrowseId,
        }),
      });

      if (browseRes.ok) {
        const browseJson = await browseRes.json();
        const renderers = findItems(browseJson, 'musicResponsiveListItemRenderer');
        relatedSongs = renderers.map(rendererToTrack).filter(Boolean).slice(0, 15);
        const descShelf = findItems(browseJson, 'musicDescriptionShelfRenderer')[0];
        artistBio = descShelf?.description?.runs?.map(r => r.text).join('') || '';
      }
    }

    return {
      videoId,
      artistBio,
      relatedSongs,
    };
  } catch (e) {
    return { videoId, error: e.message };
  }
}
