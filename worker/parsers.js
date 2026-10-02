/**
 * Multi-entity parsers for albums, artists, playlists
 */
import { flattenRuns, findItems } from './search.js';

export function parseAlbum(renderer) {
  const titleRuns = renderer?.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
  const albumId = renderer?.navigationEndpoint?.browseEndpoint?.browseId;
  if (!albumId || !titleRuns.length) return null;

  const title = flattenRuns(titleRuns);
  const subtitleRuns = renderer?.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
  const subtitle = flattenRuns(subtitleRuns);

  const thumbnails = renderer?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
  const thumbnail = thumbnails[thumbnails.length - 1]?.url || '';

  return {
    type: 'album',
    id: albumId,
    title,
    subtitle,
    thumbnail,
  };
}

export function parseArtist(renderer) {
  const titleRuns = renderer?.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
  const artistId = renderer?.navigationEndpoint?.browseEndpoint?.browseId;
  if (!artistId || !titleRuns.length) return null;

  const title = flattenRuns(titleRuns);
  const subtitleRuns = renderer?.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
  const subtitle = flattenRuns(subtitleRuns);

  const thumbnails = renderer?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
  const thumbnail = thumbnails[thumbnails.length - 1]?.url || '';

  return {
    type: 'artist',
    id: artistId,
    title,
    subtitle,
    thumbnail,
  };
}

export function parsePlaylist(renderer) {
  const titleRuns = renderer?.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
  const playlistId = renderer?.navigationEndpoint?.browseEndpoint?.browseId;
  if (!playlistId || !titleRuns.length) return null;

  const title = flattenRuns(titleRuns);
  const subtitleRuns = renderer?.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
  const subtitle = flattenRuns(subtitleRuns);

  const thumbnails = renderer?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
  const thumbnail = thumbnails[thumbnails.length - 1]?.url || '';

  return {
    type: 'playlist',
    id: playlistId,
    title,
    subtitle,
  };
}

export function parseSong(renderer) {
  const titleRuns = renderer?.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
  const videoId = renderer?.playlistItemData?.videoId ||
    renderer?.navigationEndpoint?.watchEndpoint?.videoId ||
    renderer?.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId ||
    titleRuns.find(run => run.navigationEndpoint?.watchEndpoint?.videoId)?.navigationEndpoint?.watchEndpoint?.videoId;
  if (!videoId) return null;

  const title = flattenRuns(titleRuns);
  const subtitleRuns = renderer?.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
  const subtitle = flattenRuns(subtitleRuns);

  const thumbnails = renderer?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
  const thumbnail = thumbnails[thumbnails.length - 1]?.url || `https://i.ytimg.com/vi/${videoId}/hq720.jpg`;

  // Extract duration from subtitle or third column
  let duration = 0;
  const durationRegex = /\d{1,2}:\d{2}(:\d{2})?/;
  const durationMatch = subtitle.match(durationRegex);
  if (durationMatch) {
    const parts = durationMatch[0].split(':').map(Number);
    duration = parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0] * 3600 + parts[1] * 60 + parts[2];
  }

  return {
    type: 'song',
    id: videoId,
    title,
    subtitle,
    thumbnail,
    duration,
  };
}

export function parseSectionItems(json, filterType) {
  const items = findItems(json, 'musicResponsiveListItemRenderer');
  const parser = filterType === 'album' ? parseAlbum :
                 filterType === 'artist' ? parseArtist :
                 filterType === 'playlist' ? parsePlaylist :
                 parseSong;

  return items.map(parser).filter(Boolean);
}
