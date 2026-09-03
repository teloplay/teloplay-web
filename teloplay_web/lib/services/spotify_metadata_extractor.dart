import 'dart:convert';
import 'package:http/http.dart' as http;

/// Spotify & Apple Music Rich Metadata Engine
/// Used on Android & Windows apps for getting full rich metadata
class SpotifyMetadataExtractor {
  static final SpotifyMetadataExtractor _instance = SpotifyMetadataExtractor._internal();
  factory SpotifyMetadataExtractor() => _instance;
  SpotifyMetadataExtractor._internal();

  /// Search for a track and get rich metadata from Apple Music / Spotify engine
  Future<SpotifyTrackMetadata?> searchTrack(String query) async {
    try {
      final uri = Uri.parse('https://itunes.apple.com/search').replace(queryParameters: {
        'term': query,
        'entity': 'song',
        'limit': '1',
      });

      final res = await http.get(uri).timeout(const Duration(seconds: 6));
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        final list = data['results'] as List? ?? [];
        if (list.isNotEmpty) {
          final t = list[0];
          final rawArt = t['artworkUrl100'] as String? ?? '';
          final hdArt = rawArt.replaceAll('100x100bb', '600x600bb');

          return SpotifyTrackMetadata(
            title: t['trackName'] ?? '',
            artist: t['artistName'] ?? '',
            albumName: t['collectionName'] ?? '',
            releaseDate: t['releaseDate'] ?? '',
            coverHd: hdArt,
            coverMedium: rawArt,
            durationSec: (t['trackTimeMillis'] as int? ?? 0) ~/ 1000,
            genre: t['primaryGenreName'] ?? '',
          );
        }
      }
    } catch (_) {}
    return null;
  }
}

class SpotifyTrackMetadata {
  final String title;
  final String artist;
  final String albumName;
  final String releaseDate;
  final String coverHd;
  final String coverMedium;
  final int durationSec;
  final String genre;

  SpotifyTrackMetadata({
    required this.title,
    required this.artist,
    required this.albumName,
    required this.releaseDate,
    required this.coverHd,
    required this.coverMedium,
    required this.durationSec,
    this.genre = '',
  });

  Map<String, dynamic> toJson() => {
    'title': title,
    'artist': artist,
    'albumName': albumName,
    'releaseDate': releaseDate,
    'coverHd': coverHd,
    'coverMedium': coverMedium,
    'durationSec': durationSec,
    'genre': genre,
  };
}