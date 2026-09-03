import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../models/track.dart';
import '../services/audio_player_service.dart';
import 'queue_sheet.dart';

class PlayerBottomBar extends StatefulWidget {
  const PlayerBottomBar({super.key});

  @override
  State<PlayerBottomBar> createState() => _PlayerBottomBarState();
}

class _PlayerBottomBarState extends State<PlayerBottomBar> {
  final AudioPlayerService _audio = AudioPlayerService();
  double _dragValue = -1;

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<Track?>(
      stream: _audio.currentTrackStream,
      builder: (context, trackSnap) {
        final track = trackSnap.data;
        if (track == null) return const SizedBox.shrink();

        return Container(
          decoration: BoxDecoration(
            color: const Color(0xFF161622).withOpacity(0.95),
            border: const Border(top: BorderSide(color: Colors.white10, width: 1)),
          ),
          child: SafeArea(
            top: false,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                _buildProgressBar(),
                _buildControlsRow(track),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildProgressBar() {
    return StreamBuilder<Duration>(
      stream: _audio.positionStream,
      builder: (context, posSnap) {
        final position = posSnap.data ?? Duration.zero;
        final duration = _audio.duration;
        final totalMs = duration.inMilliseconds;
        final currentMs = position.inMilliseconds;
        final progress = (totalMs > 0) ? (currentMs / totalMs).clamp(0.0, 1.0) : 0.0;

        return SliderTheme(
          data: SliderTheme.of(context).copyWith(
            trackHeight: 2.5,
            thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 4),
            overlayShape: const RoundSliderOverlayShape(overlayRadius: 8),
            activeTrackColor: const Color(0xFFFF3B5C),
            inactiveTrackColor: Colors.white12,
            thumbColor: const Color(0xFFFF3B5C),
          ),
          child: Slider(
            value: _dragValue >= 0 ? _dragValue : progress,
            onChanged: (v) => setState(() => _dragValue = v),
            onChangeEnd: (v) {
              if (totalMs > 0) {
                _audio.seek(Duration(milliseconds: (v * totalMs).toInt()));
              }
              setState(() => _dragValue = -1);
            },
          ),
        );
      },
    );
  }

  Widget _buildControlsRow(Track track) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 6),
      child: Row(
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: CachedNetworkImage(
              imageUrl: track.albumArt,
              width: 44,
              height: 44,
              fit: BoxFit.cover,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  track.title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 2),
                Text(
                  track.artist,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: Colors.white60, fontSize: 11),
                ),
              ],
            ),
          ),
          IconButton(
            icon: const Icon(Icons.skip_previous_rounded, color: Colors.white, size: 26),
            onPressed: _audio.hasPrevious ? _audio.previous : null,
          ),
          _buildPlayPauseButton(),
          IconButton(
            icon: const Icon(Icons.skip_next_rounded, color: Colors.white, size: 26),
            onPressed: _audio.hasNext ? _audio.next : null,
          ),
          IconButton(
            icon: const Icon(Icons.queue_music_rounded, color: Colors.white70, size: 22),
            onPressed: () {
              showModalBottomSheet(
                context: context,
                backgroundColor: Colors.transparent,
                isScrollControlled: true,
                builder: (_) => const QueueSheet(),
              );
            },
          ),
        ],
      ),
    );
  }

  Widget _buildPlayPauseButton() {
    return StreamBuilder<bool>(
      stream: _audio.isLoadingStream,
      builder: (context, loadSnap) {
        if (loadSnap.data ?? false) {
          return IconButton(
            tooltip: 'Cancel loading',
            icon: const Icon(
              Icons.close_rounded,
              color: Color(0xFFFF3B5C),
              size: 30,
            ),
            onPressed: _audio.cancelPendingLoad,
          );
        }
        return StreamBuilder<bool>(
          stream: _audio.isPlayingStream,
          builder: (context, playSnap) {
            final isPlaying = playSnap.data ?? false;
            return IconButton(
              icon: Icon(
                isPlaying ? Icons.pause_circle_filled_rounded : Icons.play_circle_fill_rounded,
                color: const Color(0xFFFF3B5C),
                size: 38,
              ),
              onPressed: _audio.togglePlayPause,
            );
          },
        );
      },
    );
  }
}
