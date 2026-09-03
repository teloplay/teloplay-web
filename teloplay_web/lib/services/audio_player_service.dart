import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:just_audio/just_audio.dart';
import 'package:rxdart/rxdart.dart';
import '../models/track.dart';
import 'api_service.dart';

enum LoopModeState { off, all, one }

class AudioPlayerService {
  static final AudioPlayerService _instance = AudioPlayerService._internal();
  factory AudioPlayerService() => _instance;
  AudioPlayerService._internal();

  final AudioPlayer _player = AudioPlayer();
  final ApiService _apiService = ApiService();
  Future<void>? _playPending;
  String? _pendingToken;

  final List<Track> _queue = [];
  int _currentIndex = -1;
  bool _isShuffle = false;
  LoopModeState _loopMode = LoopModeState.off;

  final _currentTrackController = BehaviorSubject<Track?>.seeded(null);
  final _isPlayingController = BehaviorSubject<bool>.seeded(false);
  final _positionController = BehaviorSubject<Duration>.seeded(Duration.zero);
  final _durationController = BehaviorSubject<Duration>.seeded(Duration.zero);
  final _queueController = BehaviorSubject<List<Track>>.seeded([]);
  final _isLoadingController = BehaviorSubject<bool>.seeded(false);
  final _volumeController = BehaviorSubject<double>.seeded(1.0);
  final _shuffleController = BehaviorSubject<bool>.seeded(false);
  final _loopModeController = BehaviorSubject<LoopModeState>.seeded(LoopModeState.off);

  Stream<Track?> get currentTrackStream => _currentTrackController.stream;
  Stream<bool> get isPlayingStream => _isPlayingController.stream;
  Stream<Duration> get positionStream => _positionController.stream;
  Stream<Duration> get durationStream => _durationController.stream;
  Stream<List<Track>> get queueStream => _queueController.stream;
  Stream<bool> get isLoadingStream => _isLoadingController.stream;
  Stream<double> get volumeStream => _volumeController.stream;
  Stream<bool> get shuffleStream => _shuffleController.stream;
  Stream<LoopModeState> get loopModeStream => _loopModeController.stream;

  Track? get currentTrack => _currentTrackController.valueOrNull;
  bool get isPlaying => _isPlayingController.value;
  Duration get position => _positionController.value;
  Duration get duration => _durationController.value;
  List<Track> get queue => List.unmodifiable(_queue);
  int get currentIndex => _currentIndex;
  bool get hasNext => _queue.isNotEmpty && (_loopMode != LoopModeState.off || _currentIndex < _queue.length - 1);
  bool get hasPrevious => _queue.isNotEmpty && (_currentIndex > 0);
  bool get isShuffle => _isShuffle;
  LoopModeState get loopMode => _loopMode;

  Future<void> init() async {
    _player.playerStateStream.listen((state) {
      _isPlayingController.add(state.playing);
      if (state.processingState == ProcessingState.completed) {
        _handleTrackCompleted();
      }
    });

    _player.positionStream.listen((pos) {
      _positionController.add(pos);
    });

    _player.durationStream.listen((dur) {
      if (dur != null && dur > Duration.zero) {
        _durationController.add(dur);
      }
    });

    _player.volumeStream.listen((vol) {
      _volumeController.add(vol);
    });
  }

  void _handleTrackCompleted() {
    if (_loopMode == LoopModeState.one) {
      seek(Duration.zero);
      resume();
    } else if (hasNext) {
      next();
    } else {
      _isPlayingController.add(false);
    }
  }

  Future<void> playTrack(Track track, {List<Track>? newQueue}) async {
    final token = '${track.id}-${DateTime.now().microsecondsSinceEpoch}';
    _pendingToken = token;
    final previous = _playPending ?? Future.value();
    final completer = Completer<void>();
    _playPending = completer.future;
    try {
      await previous;
      if (_pendingToken != token) return;
      await _playTrackImpl(track, newQueue: newQueue);
    } finally {
      if (identical(_playPending, completer.future)) {
        _playPending = null;
        _pendingToken = null;
      }
      completer.complete();
    }
  }

  Future<void> _playTrackImpl(Track track, {List<Track>? newQueue}) async {
    try {
      _isLoadingController.add(true);

      if (newQueue != null && newQueue.isNotEmpty) {
        _queue.clear();
        _queue.addAll(newQueue);
        _currentIndex = _queue.indexWhere((t) => t.id == track.id);
        if (_currentIndex == -1) {
          _queue.insert(0, track);
          _currentIndex = 0;
        }
      } else {
        if (!_queue.any((t) => t.id == track.id)) {
          _queue.add(track);
          _currentIndex = _queue.length - 1;
        } else {
          _currentIndex = _queue.indexWhere((t) => t.id == track.id);
        }
      }

      _queueController.add(List.from(_queue));
      _currentTrackController.add(track);

      String? streamUrl = track.streamUrl.isNotEmpty ? track.streamUrl : null;
      streamUrl ??= await _apiService.resolveStreamUrl(track.id, title: track.title, artist: track.artist);

      if (streamUrl == null || streamUrl.isEmpty) {
        throw Exception('Stream URL could not be resolved by the Worker');
      }

      final updatedTrack = track.copyWith(streamUrl: streamUrl);
      _currentTrackController.add(updatedTrack);

      try {
        await _player.stop();
      } catch (_) {}

      try {
        await _player.setUrl(streamUrl);
        await _player.play();

        // Background pre-warm next track in queue so next track switch is instant
        final nextIdx = _currentIndex + 1;
        if (nextIdx < _queue.length) {
          unawaited(_apiService.prewarmTracks([_queue[nextIdx].id]));
        }
      } catch (playErr) {
        debugPrint('[AudioPlayerService] Play failed: $playErr');
      }
    } catch (e) {
      debugPrint('[AudioPlayerService] Play track error: $e');
      _isPlayingController.add(false);
    } finally {
      _isLoadingController.add(false);
    }
  }
  /// Cancels an unresolved stream request. This is safe to call while the
  /// player is loading, and lets the user immediately choose another track.
  Future<void> cancelPendingLoad() async {
    _pendingToken = null;
    _isLoadingController.add(false);
    try {
      await _player.stop();
    } catch (_) {}
  }

  Future<void> pause() async {
    await _player.pause();
  }

  Future<void> resume() async {
    await _player.play();
  }

  Future<void> togglePlayPause() async {
    if (isPlaying) {
      await pause();
    } else {
      await resume();
    }
  }

  Future<void> stop() async {
    await _player.stop();
    _currentTrackController.add(null);
  }

  Future<void> seek(Duration position) async {
    await _player.seek(position);
  }

  Future<void> next() async {
    if (_queue.isEmpty) return;

    if (_loopMode == LoopModeState.one) {
      seek(Duration.zero);
      resume();
      return;
    }

    if (_currentIndex < _queue.length - 1) {
      _currentIndex++;
    } else if (_loopMode == LoopModeState.all) {
      _currentIndex = 0;
    } else {
      return;
    }

    final nextTrack = _queue[_currentIndex];
    await playTrack(nextTrack);
  }

  Future<void> previous() async {
    if (_queue.isEmpty) return;

    if (position.inSeconds > 3) {
      await seek(Duration.zero);
      return;
    }

    if (_currentIndex > 0) {
      _currentIndex--;
      final prevTrack = _queue[_currentIndex];
      await playTrack(prevTrack);
    } else {
      await seek(Duration.zero);
    }
  }

  void addToQueue(Track track) {
    _queue.add(track);
    _queueController.add(List.from(_queue));
  }

  void removeFromQueue(int index) {
    if (index >= 0 && index < _queue.length) {
      _queue.removeAt(index);
      if (_currentIndex >= index && _currentIndex > 0) {
        _currentIndex--;
      }
      _queueController.add(List.from(_queue));
    }
  }

  void clearQueue() {
    _queue.clear();
    _currentIndex = -1;
    _queueController.add([]);
  }

  void toggleShuffle() {
    _isShuffle = !_isShuffle;
    _shuffleController.add(_isShuffle);
  }

  void toggleLoopMode() {
    switch (_loopMode) {
      case LoopModeState.off:
        _loopMode = LoopModeState.all;
        break;
      case LoopModeState.all:
        _loopMode = LoopModeState.one;
        break;
      case LoopModeState.one:
        _loopMode = LoopModeState.off;
        break;
    }
    _loopModeController.add(_loopMode);
  }

  Future<void> setVolume(double volume) async {
    final clamped = volume.clamp(0.0, 1.0);
    await _player.setVolume(clamped);
    _volumeController.add(clamped);
  }

  void dispose() {
    _player.dispose();
    _currentTrackController.close();
    _isPlayingController.close();
    _positionController.close();
    _durationController.close();
    _queueController.close();
    _isLoadingController.close();
    _volumeController.close();
    _shuffleController.close();
    _loopModeController.close();
  }

}
