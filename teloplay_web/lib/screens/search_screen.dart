import 'package:flutter/material.dart';
import '../models/track.dart';
import '../services/api_service.dart';
import '../services/audio_player_service.dart';
import '../widgets/track_tile.dart';
import '../widgets/player_bottom_bar.dart';

class SearchScreen extends StatefulWidget {
  const SearchScreen({super.key});

  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen> {
  final ApiService _api = ApiService();
  final AudioPlayerService _audio = AudioPlayerService();
  final TextEditingController _controller = TextEditingController();

  List<Track> _results = [];
  List<String> _suggestions = [];
  bool _isLoading = false;
  bool _hasSearched = false;

  Future<void> _performSearch(String query) async {
    final clean = query.trim();
    if (clean.isEmpty) return;

    setState(() {
      _isLoading = true;
      _hasSearched = true;
      _suggestions = [];
    });

    final tracks = await _api.searchTracks(clean, limit: 50);

    if (mounted) {
      setState(() {
        _results = tracks;
        _isLoading = false;
      });
    }
  }

  Future<void> _onQueryChanged(String val) async {
    if (val.trim().isEmpty) {
      setState(() {
        _suggestions = [];
        _hasSearched = false;
      });
      return;
    }

    final list = await _api.getSuggestions(val);
    if (mounted && _controller.text == val) {
      setState(() => _suggestions = list);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0C0C12),
      appBar: AppBar(
        backgroundColor: const Color(0xFF14141E),
        elevation: 0,
        title: TextField(
          controller: _controller,
          autofocus: true,
          style: const TextStyle(color: Colors.white, fontSize: 16),
          decoration: InputDecoration(
            hintText: 'Search songs, artists, albums...',
            hintStyle: const TextStyle(color: Colors.white38),
            border: InputBorder.none,
            suffixIcon: _controller.text.isNotEmpty
                ? IconButton(
                    icon: const Icon(Icons.close, color: Colors.white60),
                    onPressed: () {
                      _controller.clear();
                      setState(() {
                        _suggestions = [];
                        _hasSearched = false;
                        _results = [];
                      });
                    },
                  )
                : null,
          ),
          onChanged: _onQueryChanged,
          onSubmitted: _performSearch,
        ),
      ),
      body: Column(
        children: [
          Expanded(child: _buildBody()),
          const PlayerBottomBar(),
        ],
      ),
    );
  }

  Widget _buildBody() {
    if (_isLoading) {
      return const Center(
        child: CircularProgressIndicator(color: Color(0xFFFF3B5C)),
      );
    }

    if (!_hasSearched && _suggestions.isNotEmpty) {
      return ListView.builder(
        itemCount: _suggestions.length,
        itemBuilder: (context, index) {
          final s = _suggestions[index];
          return ListTile(
            leading: const Icon(Icons.search, color: Colors.white38, size: 20),
            title: Text(s, style: const TextStyle(color: Colors.white, fontSize: 14)),
            trailing: const Icon(Icons.north_west, color: Colors.white24, size: 16),
            onTap: () {
              _controller.text = s;
              _performSearch(s);
            },
          );
        },
      );
    }

    if (_hasSearched && _results.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.search_off, color: Colors.white24, size: 56),
            const SizedBox(height: 12),
            Text(
              'No results found for "${_controller.text}"',
              style: const TextStyle(color: Colors.white60, fontSize: 15),
            ),
          ],
        ),
      );
    }

    return StreamBuilder<Track?>(
      stream: _audio.currentTrackStream,
      builder: (context, trackSnap) {
        final currentTrack = trackSnap.data;
        return ListView.builder(
          padding: const EdgeInsets.symmetric(vertical: 8),
          itemCount: _results.length,
          itemBuilder: (context, index) {
            final track = _results[index];
            final isPlaying = currentTrack?.id == track.id;

            return TrackTile(
              track: track,
              isPlaying: isPlaying,
              onTap: () => _audio.playTrack(track, newQueue: _results),
              onAddToQueue: () => _audio.addToQueue(track),
            );
          },
        );
      },
    );
  }
}
