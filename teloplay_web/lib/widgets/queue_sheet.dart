import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../models/track.dart';
import '../services/audio_player_service.dart';

class QueueSheet extends StatelessWidget {
  const QueueSheet({super.key});

  @override
  Widget build(BuildContext context) {
    final audio = AudioPlayerService();

    return Container(
      height: MediaQuery.of(context).size.height * 0.7,
      decoration: const BoxDecoration(
        color: Color(0xFF14141E),
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: Column(
        children: [
          // Drag handle & Header
          Center(
            child: Container(
              margin: const EdgeInsets.only(top: 12, bottom: 8),
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: Colors.white24,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text(
                  'Playing Queue',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                TextButton.icon(
                  onPressed: () {
                    audio.clearQueue();
                    Navigator.pop(context);
                  },
                  icon: const Icon(Icons.clear_all, color: Colors.white60, size: 18),
                  label: const Text('Clear', style: TextStyle(color: Colors.white60)),
                ),
              ],
            ),
          ),
          const Divider(color: Colors.white12, height: 1),

          // Queue List
          Expanded(
            child: StreamBuilder<List<Track>>(
              stream: audio.queueStream,
              builder: (context, snapshot) {
                final queue = snapshot.data ?? [];
                if (queue.isEmpty) {
                  return const Center(
                    child: Text(
                      'Queue is empty',
                      style: TextStyle(color: Colors.white38),
                    ),
                  );
                }

                return StreamBuilder<Track?>(
                  stream: audio.currentTrackStream,
                  builder: (context, trackSnap) {
                    final currentTrack = trackSnap.data;
                    return ListView.builder(
                      itemCount: queue.length,
                      itemBuilder: (context, index) {
                        final item = queue[index];
                        final isCurrent = item.id == currentTrack?.id;

                        return ListTile(
                          leading: ClipRRect(
                            borderRadius: BorderRadius.circular(6),
                            child: CachedNetworkImage(
                              imageUrl: item.albumArt,
                              width: 44,
                              height: 44,
                              fit: BoxFit.cover,
                            ),
                          ),
                          title: Text(
                            item.title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              color: isCurrent ? const Color(0xFFFF3B5C) : Colors.white,
                              fontWeight: isCurrent ? FontWeight.bold : FontWeight.normal,
                              fontSize: 14,
                            ),
                          ),
                          subtitle: Text(
                            item.artist,
                            maxLines: 1,
                            style: const TextStyle(color: Colors.white38, fontSize: 12),
                          ),
                          trailing: IconButton(
                            icon: const Icon(Icons.close, color: Colors.white38, size: 18),
                            onPressed: () => audio.removeFromQueue(index),
                          ),
                          onTap: () => audio.playTrack(item),
                        );
                      },
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
