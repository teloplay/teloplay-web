import 'dart:convert';
import 'package:http/http.dart' as http;

/// Supplies a short-lived Spotify OAuth access token.
///
/// Obtain this token using Spotify's official OAuth flow. Do not put a Spotify
/// client secret inside a mobile or desktop application.
typedef SpotifyAccessTokenProvider = Future<String?> Function();

/// Rich metadata engine reusable by Android, Windows, and desktop clients.
///
/// If [spotifyAccessTokenProvider] is supplied, Spotify's official Web API is
/// queried first. Apple/iTunes is a no-login fallback when Spotify is not
/// configured or has no match. It never affects audio-stream resolution.
class SpotifyMetadataExtractor {
  SpotifyMetadataExtractor({http.Client? client}) : _client = client ?? http.Client();

  final http.Client _client;

  Future<SpotifyTrackMetadata?> searchTrack(
    String query, {
    SpotifyAccessTokenProvider? spotifyAccessTokenProvider,
  }) async {
    final cleanQuery = query.trim();
    if (cleanQuery.isEmpty) return null;

    if (spotifyAccessTokenProvider != null) {
      try {
        final token = await spotifyAccessTokenProvider();
        if (token != null && token.isNotEmpty) {
          final spotify = await _searchSpotify(cleanQuery, token);
          if (spotify != null) return spotify;
        }
      } catch (_) {
        // Metadata failure must not interrupt playback or search.
      }
    }
    return _searchAppleMusic(cleanQuery);
  }

  Future<SpotifyTrackMetadata?> _searchSpotify(String query, String token) async {
    final uri = Uri.https('api.spotify.com', '/v1/search', {
      'q': query,
      'type': 'track',
      'limit': '1',
      'market': 'US',
    });
    final response = await _client.get(uri, headers: {
      'Authorization': 'Bearer $token',
    }).timeout(const Duration(seconds: 6));
    if (response.statusCode != 200) return null;

    final root = jsonDecode(response.body) as Map<String, dynamic>;
    final items = ((root['tracks'] as Map?)?['items'] as List?) ?? const [];
    if (items.isEmpty || items.first is! Map) return null;
    final track = Map<String, dynamic>.from(items.first as Map);
    final album = Map<String, dynamic>.from(track['album'] as Map? ?? const {});
    final images = (album['images'] as List? ?? const [])
        .whereType<Map>()
        .map((image) => image['url']?.toString() ?? '')
        .where((url) => url.isNotEmpty)
        .toList();
    final artist = (track['artists'] as List? ?? const [])
        .whereType<Map>()
        .map((item) => item['name']?.toString() ?? '')
        .where((name) => name.isNotEmpty)
        .join(', ');

    return SpotifyTrackMetadata(
      title: track['name']?.toString() ?? '',
      artist: artist,
      albumName: album['name']?.toString() ?? '',
      releaseDate: album['release_date']?.toString() ?? '',
      coverHd: images.isEmpty ? '' : images.first,
      coverMedium: images.length > 1 ? images[1] : (images.isEmpty ? '' : images.first),
      durationSec: ((track['duration_ms'] as num?)?.toInt() ?? 0) ~/ 1000,
      provider: 'spotify',
      spotifyTrackId: track['id']?.toString() ?? '',
      spotifyUri: track['uri']?.toString() ?? '',
      explicit: track['explicit'] == true,
    );
  }

  Future<SpotifyTrackMetadata?> _searchAppleMusic(String query) async {
    try {
      final uri = Uri.https('itunes.apple.com', '/search', {
        'term': query,
        'entity': 'song',
        'limit': '1',
      });
      final response = await _client.get(uri).timeout(const Duration(seconds: 6));
      if (response.statusCode != 200) return null;
      final root = jsonDecode(response.body) as Map<String, dynamic>;
      final results = root['results'] as List? ?? const [];
      if (results.isEmpty || results.first is! Map) return null;
      final track = Map<String, dynamic>.from(results.first as Map);
      final cover = track['artworkUrl100']?.toString() ?? '';
      return SpotifyTrackMetadata(
        title: track['trackName']?.toString() ?? '',
        artist: track['artistName']?.toString() ?? '',
        albumName: track['collectionName']?.toString() ?? '',
        releaseDate: track['releaseDate']?.toString() ?? '',
        coverHd: cover.replaceAll('100x100bb', '600x600bb'),
        coverMedium: cover,
        durationSec: ((track['trackTimeMillis'] as num?)?.toInt() ?? 0) ~/ 1000,
        genre: track['primaryGenreName']?.toString() ?? '',
        provider: 'apple_music',
        explicit: track['trackExplicitness'] == 'explicit',
      );
    } catch (_) {
      return null;
    }
  }

  void dispose() => _client.close();
}

class SpotifyTrackMetadata {
  const SpotifyTrackMetadata({
    required this.title,
    required this.artist,
    required this.albumName,
    required this.releaseDate,
    required this.coverHd,
    required this.coverMedium,
    required this.durationSec,
    required this.provider,
    this.genre = '',
    this.spotifyTrackId = '',
    this.spotifyUri = '',
    this.explicit = false,
  });

  final String title;
  final String artist;
  final String albumName;
  final String releaseDate;
  final String coverHd;
  final String coverMedium;
  final int durationSec;
  final String genre;
  final String provider;
  final String spotifyTrackId;
  final String spotifyUri;
  final bool explicit;

  Map<String, dynamic> toJson() => {
        'title': title,
        'artist': artist,
        'albumName': albumName,
        'releaseDate': releaseDate,
        'coverHd': coverHd,
        'coverMedium': coverMedium,
        'durationSec': durationSec,
        'genre': genre,
        'provider': provider,
        'spotifyTrackId': spotifyTrackId,
        'spotifyUri': spotifyUri,
        'explicit': explicit,
      };
}
