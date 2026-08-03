import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../../data/repositories/game_repository.dart';
import '../../../domain/models.dart';

class GameViewModel extends ChangeNotifier {
  GameViewModel(this._repository, {required this.gameId});

  final GameRepository _repository;
  final String gameId;

  GameState? state;
  List<ChatMessage> messages = const [];
  ThinkingEvent? thinking;
  bool busy = false;
  bool botBusy = false;
  String? error;
  DateTime now = DateTime.now();

  final List<StreamSubscription<Object?>> _subscriptions = [];
  Timer? _pollTimer;
  Timer? _clockTimer;
  bool _chatLoadInFlight = false;

  Future<void> start() async {
    try {
      await _repository.joinGame(gameId);
    } catch (_) {
      // A full room is still watchable.
    }
    await Future.wait([refresh(), _loadChat()]);
    await _subscribe();
    _pollTimer = Timer.periodic(const Duration(seconds: 3), (_) {
      unawaited(refresh());
      unawaited(_loadChat());
    });
    _clockTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      now = DateTime.now();
      notifyListeners();
    });
  }

  Future<void> refresh() async {
    try {
      final fresh = await _repository.getState(gameId);
      if (state == null || fresh.version >= state!.version) state = fresh;
      if (messages.isEmpty) messages = _messagesFromLog(fresh);
      error = null;
      notifyListeners();
      unawaited(_driveBotIfNeeded());
    } catch (exception) {
      error = _message(exception);
      notifyListeners();
    }
  }

  Future<void> takeAction(String action) async {
    if (!isMyTurn || busy) return;
    busy = true;
    error = null;
    notifyListeners();
    try {
      state = await _repository.takeAction(gameId, action);
    } catch (exception) {
      error = _message(exception);
    } finally {
      busy = false;
      notifyListeners();
      unawaited(_driveBotIfNeeded());
    }
  }

  Future<void> startWithAi() async {
    busy = true;
    notifyListeners();
    try {
      await _repository.startWithAi(gameId);
      await refresh();
    } catch (exception) {
      error = _message(exception);
    } finally {
      busy = false;
      notifyListeners();
    }
  }

  Future<void> sendChat(String text) async {
    if (text.trim().isEmpty) return;
    final message = ChatMessage(
      timestamp: -DateTime.now().millisecondsSinceEpoch,
      who: state?.me?.name ?? 'You',
      text: text.trim(),
      kind: 'say',
    );
    messages = [...messages, message];
    notifyListeners();
    try {
      await _repository.sendChat(gameId, text.trim());
      await _loadChat();
    } catch (exception) {
      messages = messages
          .where((item) => item.timestamp != message.timestamp)
          .toList(growable: false);
      error = _message(exception);
      notifyListeners();
    }
  }

  bool get isMyTurn {
    final value = state;
    if (value == null || value.roomPhase != 'live' || value.phase != 'player') {
      return false;
    }
    return value.current?.userId == value.viewerUserId && !value.spectator;
  }

  Duration? get remaining {
    final end = state?.endsAt;
    if (end == null) return null;
    final value = end.difference(now);
    return value.isNegative ? Duration.zero : value;
  }

  String get status {
    final value = state;
    if (value == null) return 'Entering the dungeon...';
    if (value.roomPhase == 'ended') return 'The adventure has ended';
    if (value.roomPhase == 'lobby') return 'Gathering the party';
    if (value.spectator) {
      return 'Watching ${value.current?.name ?? 'the party'}';
    }
    if (busy) return 'Resolving your action...';
    if (value.phase != 'player') return '${value.dmName} is narrating...';
    if (isMyTurn) return 'Your turn - choose an action';
    return '${value.current?.name ?? 'The party'} is taking a turn';
  }

  Future<void> _loadChat() async {
    if (_chatLoadInFlight) return;
    _chatLoadInFlight = true;
    try {
      final history = await _repository.getChat(gameId);
      if (history.isNotEmpty) {
        messages = history;
      } else if (state != null && messages.isEmpty) {
        messages = _messagesFromLog(state!);
      }
      notifyListeners();
    } catch (exception) {
      if (state != null && messages.isEmpty) {
        messages = _messagesFromLog(state!);
        notifyListeners();
      }
      debugPrint('Chat history unavailable: $exception');
    } finally {
      _chatLoadInFlight = false;
    }
  }

  Future<void> _subscribe() async {
    try {
      final stream = await _repository.stateEvents(gameId);
      _subscriptions.add(stream.listen((_) => unawaited(refresh())));
    } catch (_) {}
    try {
      final stream = await _repository.chatEvents(gameId);
      _subscriptions.add(
        stream.listen(
          (message) {
            final duplicate = messages.any(
              (item) =>
                  item.timestamp == message.timestamp &&
                  item.who == message.who,
            );
            if (!duplicate) {
              messages = [
                ...messages.where(
                  (item) =>
                      item.timestamp >= 0 ||
                      item.who != message.who ||
                      item.text != message.text,
                ),
                message,
              ];
              notifyListeners();
            }
          },
          onError: (Object exception) {
            debugPrint('Realtime chat unavailable: $exception');
            unawaited(_loadChat());
          },
        ),
      );
    } catch (_) {}
    try {
      final stream = await _repository.thinkingEvents(gameId);
      _subscriptions.add(
        stream.listen((event) {
          if (event.phase == 'start') {
            thinking = event;
          } else if (event.phase == 'delta') {
            thinking = ThinkingEvent(
              who: event.who,
              phase: event.phase,
              text: '${thinking?.text ?? ''}${event.text}',
            );
          } else {
            thinking = null;
          }
          notifyListeners();
        }),
      );
    } catch (_) {}
  }

  List<ChatMessage> _messagesFromLog(GameState value) {
    return value.log.indexed
        .map(
          (entry) => ChatMessage(
            timestamp: entry.$1,
            who: entry.$2.who,
            text: entry.$2.text,
            kind: entry.$2.kind,
          ),
        )
        .toList(growable: false);
  }

  Future<void> _driveBotIfNeeded() async {
    final value = state;
    if (value == null || botBusy || busy || !value.isHost) return;
    if (value.roomPhase != 'live' ||
        value.phase != 'player' ||
        value.current?.seat != SeatKind.ai) {
      return;
    }
    botBusy = true;
    notifyListeners();
    await Future<void>.delayed(const Duration(milliseconds: 700));
    try {
      state = await _repository.advanceBotTurn(gameId);
    } catch (exception) {
      error = _message(exception);
    } finally {
      botBusy = false;
      thinking = null;
      notifyListeners();
      unawaited(_driveBotIfNeeded());
    }
  }

  String _message(Object exception) => exception.toString().replaceFirst(
    RegExp(r'^(Exception|StateError):\s*'),
    '',
  );

  @override
  void dispose() {
    _pollTimer?.cancel();
    _clockTimer?.cancel();
    for (final subscription in _subscriptions) {
      unawaited(subscription.cancel());
    }
    super.dispose();
  }
}
