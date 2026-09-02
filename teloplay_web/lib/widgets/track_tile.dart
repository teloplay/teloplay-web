import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../models/track.dart';

class TrackTile extends StatelessWidget {
  final Track track;
  final VoidCallback onTap;
  final bool isPlaying;
  final VoidCallback? onAddToQueue;

  const TrackTile({
    super.key,
    required this.track,
    required this.onTap,
    this.isPlaying = false,
    this.onAddToQueue,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      decoration: BoxDecoration(
        color: isPlaying ? const Color(0xFF1E1E28) : const Color(0xFF14141A),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: isPlaying ? const Color(0xFFFF3B5C).withOpacity(0.5) : Colors.white.withOpacity(0.05),
          width: 1,
        ),
      ),
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(12),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            child: Row(
              children: [
                // Thumbnail with glow & play indicator
                Stack(
                  alignment: Alignment.center,
                  children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(8),
                      child: CachedNetworkImage(
                        imageUrl: track.albumArt,
                        width: 52,
                        height: 52,
                        fit: BoxFit.cover,
                        placeholder: (_, __) => Container(
                          width: 52,
                          height: 52,
                          color: const Color(0xFF22222E),
                          child: const Icon(Icons.music_note, color: Colors.white24, size: 24),
                        ),
                        errorWidget: (_, __, ___) => Container(
                          width: 52,
                          height: 52,
                          color: const Color(0xFF22222E),
                          child: const Icon(Icons.music_note, color: Colors.white24, size: 24),
                        ),
                      ),
                    ),
                    if (isPlaying)
                      Container(
                        width: 52,
                        height: 52,
                        decoration: BoxDecoration(
                          color: Colors.black.withOpacity(0.45),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: const Icon(Icons.equalizer, color: Color(0xFFFF3B5C), size: 26),
                      ),
                  ],
                ),
                const SizedBox(width: 14),

                // Title and Artist
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        track.title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: isPlaying ? const Color(0xFFFF3B5C) : Colors.white,
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        track.artist,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: Colors.white.withOpacity(0.6),
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),

                // Duration & Menu
                Text(
                  track.formattedDuration,
                  style: TextStyle(
                    color: Colors.white.withOpacity(0.4),
                    fontSize: 12,
                  ),
                ),
                const SizedBox(width: 4),
                PopupMenuButton<String>(
                  icon: Icon(Icons.more_vert, color: Colors.white.withOpacity(0.6), size: 20),
                  color: const Color(0xFF22222E),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  onSelected: (val) {
                    if (val == 'queue') {
                      onAddToQueue?.call();
                    }
                  },
                  itemBuilder: (ctx) => [
                    PopupMenuItem(
                      value: 'queue',
                      child: Row(
                        children: const [
                          Icon(Icons.playlist_add, color: Colors.white, size: 18),
                          SizedBox(width: 10),
                          Text('Add to Queue', style: TextStyle(color: Colors.white, fontSize: 13)),
                        ],
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
