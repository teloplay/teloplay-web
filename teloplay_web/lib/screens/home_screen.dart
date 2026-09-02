import 'package:flutter/material.dart';
import 'dart:async';
import '../models/track.dart';
import '../services/api_service.dart';
import '../services/audio_player_service.dart';
import '../widgets/track_tile.dart';
import '../widgets/player_bottom_bar.dart';
import 'search_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final ApiService _api = ApiService();
  final AudioPlayerService _audio = AudioPlayerService();

  List<Track> _trendingTracks = [];
  bool _isLoading = true;
  String _activeCategory = 'Trending';

  final List<String> _categories = [
    'Trending',
    'Pop',
    'Hip-Hop',
    'EDM',
    'Rock',
    'Chill',
    'Bangla',
  ];

  @override
  void initState() {
    super.initState();
    _loadTracksForCategory('Trending');
  }

  Future<void> _loadTracksForCategory(String category) async {
    setState(() {
      _isLoading = true;
      _activeCategory = category;
    });

    String query = 'Trending Music Hits 2026';
    if (category != 'Trending') {
      query = '$category Music Hits';
    }

    final tracks = await _api.searchTracks(query, limit: 25);

    if (tracks.isNotEmpty) {
      unawaited(_api.prewarmTracks(tracks.take(8).map((t) => t.id).toList()));
    }

    if (mounted) {
      setState(() {
        _trendingTracks = tracks;
        _isLoading = false;
      });
    }
  }

  void _showSettingsDialog() {
    final controller = TextEditingController(text: _api.baseUrl);
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1A1A26),
        title: const Text('Server / Worker API URL', style: TextStyle(color: Colors.white, fontSize: 16)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Default is local runner (http://localhost:3000) or your deployed Cloudflare Worker URL.',
              style: TextStyle(color: Colors.white60, fontSize: 12),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: controller,
              style: const TextStyle(color: Colors.white, fontSize: 14),
              decoration: const InputDecoration(
                hintText: 'http://localhost:3000',
                hintStyle: TextStyle(color: Colors.white24, fontSize: 12),
                border: OutlineInputBorder(),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel', style: TextStyle(color: Colors.white60)),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFFFF3B5C)),
            onPressed: () {
              final newUrl = controller.text.trim();
              if (newUrl.isNotEmpty) {
                _api.setBaseUrl(newUrl);
                _loadTracksForCategory(_activeCategory);
              }
              Navigator.pop(ctx);
            },
            child: const Text('Save', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0C0C12),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0C0C12),
        elevation: 0,
        title: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(6),
              decoration: BoxDecoration(
                gradient: const LinearGradient(colors: [Color(0xFFFF3B5C), Color(0xFFFF6B8B)]),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(Icons.music_note_rounded, color: Colors.white, size: 20),
            ),
            const SizedBox(width: 10),
            const Text(
              'TeloPlay',
              style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 20),
            ),
            const SizedBox(width: 6),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: const Color(0xFFFF3B5C).withOpacity(0.15),
                borderRadius: BorderRadius.circular(4),
              ),
              child: const Text(
                'WEB',
                style: TextStyle(color: Color(0xFFFF3B5C), fontSize: 10, fontWeight: FontWeight.bold),
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.settings_outlined, color: Colors.white70),
            onPressed: _showSettingsDialog,
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 10),
            child: InkWell(
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const SearchScreen()),
                );
              },
              borderRadius: BorderRadius.circular(14),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                decoration: BoxDecoration(
                  color: const Color(0xFF1A1A26),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: Colors.white10),
                ),
                child: Row(
                  children: const [
                    Icon(Icons.search, color: Color(0xFFFF3B5C), size: 22),
                    SizedBox(width: 12),
                    Text(
                      'Search songs, artists, playlists...',
                      style: TextStyle(color: Colors.white38, fontSize: 14),
                    ),
                  ],
                ),
              ),
            ),
          ),
          SizedBox(
            height: 38,
            child: ListView.builder(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              itemCount: _categories.length,
              itemBuilder: (context, index) {
                final cat = _categories[index];
                final isSelected = cat == _activeCategory;
                return Container(
                  margin: const EdgeInsets.only(right: 8),
                  child: FilterChip(
                    label: Text(
                      cat,
                      style: TextStyle(
                        color: isSelected ? Colors.white : Colors.white70,
                        fontSize: 12,
                        fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                      ),
                    ),
                    selected: isSelected,
                    selectedColor: const Color(0xFFFF3B5C),
                    backgroundColor: const Color(0xFF1A1A26),
                    showCheckmark: false,
                    padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 0),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(20),
                      side: BorderSide(color: isSelected ? Colors.transparent : Colors.white10),
                    ),
                    onSelected: (_) => _loadTracksForCategory(cat),
                  ),
                );
              },
            ),
          ),
          const SizedBox(height: 8),
          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator(color: Color(0xFFFF3B5C)))
                : RefreshIndicator(
                    color: const Color(0xFFFF3B5C),
                    backgroundColor: const Color(0xFF1A1A26),
                    onRefresh: () => _loadTracksForCategory(_activeCategory),
                    child: StreamBuilder<Track?>(
                      stream: _audio.currentTrackStream,
                      builder: (context, trackSnap) {
                        final currentTrack = trackSnap.data;
                        return ListView.builder(
                          padding: const EdgeInsets.only(top: 4, bottom: 12),
                          itemCount: _trendingTracks.length,
                          itemBuilder: (context, index) {
                            final track = _trendingTracks[index];
                            final isPlaying = currentTrack?.id == track.id;

                            return TrackTile(
                              track: track,
                              isPlaying: isPlaying,
                              onTap: () => _audio.playTrack(track, newQueue: _trendingTracks),
                              onAddToQueue: () => _audio.addToQueue(track),
                            );
                          },
                        );
                      },
                    ),
                  ),
          ),
          const PlayerBottomBar(),
        ],
      ),
    );
  }

}
