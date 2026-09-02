class Track {
  final String id;
  final String title;
  final String artist;
  final String artistId;
  final String albumArt;
  final String streamUrl;
  final Duration duration;
  final String artistArt;
  final String albumName;

  Track({
    required this.id,
    required this.title,
    required this.artist,
    this.artistId = '',
    required this.albumArt,
    this.streamUrl = '',
    required this.duration,
    this.artistArt = '',
    this.albumName = '',
  });

  Track copyWith({
    String? id,
    String? title,
    String? artist,
    String? artistId,
    String? albumArt,
    String? streamUrl,
    Duration? duration,
    String? artistArt,
    String? albumName,
  }) {
    return Track(
      id: id ?? this.id,
      title: title ?? this.title,
      artist: artist ?? this.artist,
      artistId: artistId ?? this.artistId,
      albumArt: albumArt ?? this.albumArt,
      streamUrl: streamUrl ?? this.streamUrl,
      duration: duration ?? this.duration,
      artistArt: artistArt ?? this.artistArt,
      albumName: albumName ?? this.albumName,
    );
  }

  factory Track.fromJson(Map<String, dynamic> json) {
    final videoId = json['videoId'] as String? ?? json['id'] as String? ?? '';
    final durationSec = (json['duration'] as num?)?.toInt() ?? 0;
    return Track(
      id: videoId,
      title: json['title'] as String? ?? 'Unknown Title',
      artist: json['author'] as String? ?? json['artist'] as String? ?? 'Unknown Artist',
      artistId: json['artistId'] as String? ?? '',
      albumArt: json['thumbnail'] as String? ?? json['albumArt'] as String? ?? 'https://i.ytimg.com/vi/$videoId/hqdefault.jpg',
      streamUrl: json['streamUrl'] as String? ?? '',
      duration: Duration(seconds: durationSec),
      artistArt: json['artistArt'] as String? ?? '',
      albumName: json['albumName'] as String? ?? '',
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'videoId': id,
      'title': title,
      'author': artist,
      'artistId': artistId,
      'thumbnail': albumArt,
      'streamUrl': streamUrl,
      'duration': duration.inSeconds,
      'artistArt': artistArt,
      'albumName': albumName,
    };
  }

  String get formattedDuration {
    if (duration.inSeconds == 0) return '--:--';
    final minutes = duration.inMinutes;
    final seconds = duration.inSeconds % 60;
    return '$minutes:${seconds.toString().padLeft(2, '0')}';
  }
}
