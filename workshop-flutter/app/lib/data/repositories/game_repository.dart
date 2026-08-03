import 'dart:async';
import 'dart:convert';

import 'package:web_socket_channel/web_socket_channel.dart';

import '../../blocks.blocks.dart';
import '../../domain/models.dart';
import '../services/blocks_game_service.dart';

class GameRepository {
  GameRepository(this._service);

  final BlocksGameService _service;

  Future<AppUser?> restoreSession() async {
    final state = await _service.authApi.getAuthState();
    return _user(state.user);
  }

  Future<AppUser> authenticate({
    required String username,
    required String password,
    required bool createAccount,
  }) async {
    final input = createAccount
        ? SignUpInput(username: username, password: password)
        : SignInInput(username: username, password: password);
    final state = await _service.authApi.setAuthState(input: input);
    final user = _user(state.user);
    if (user == null) {
      throw StateError(
        state.error ?? state.errorName ?? 'Could not authenticate.',
      );
    }
    return user;
  }

  Future<void> signOut() async {
    await _service.authApi.setAuthState(input: const SignOutInput());
  }

  Future<Character?> getCharacter() async {
    final result = await _service.gameApi.getCharacter();
    return result == null ? null : _character(result);
  }

  Future<Character> saveCharacter({
    required String name,
    required HeroChoice choice,
  }) async {
    final result = await _service.gameApi.saveCharacter(
      input: ApiSaveCharacterInput(
        name: name,
        classKey: choice.classKey,
        spriteId: choice.id,
        sprite: choice.backendPath,
      ),
    );
    return _character(result);
  }

  Future<List<GameSummary>> listGames() async {
    final games = await _service.gameApi.listGames();
    return games
        .map(
          (game) => GameSummary(
            id: game.id,
            name: game.name,
            note: game.note,
            dmLevel: game.dmLevel,
            party: game.party.toInt(),
            maxParty: game.maxParty.toInt(),
            finished: game.finished,
            full: game.full,
            partyClasses: game.partyClasses,
          ),
        )
        .toList(growable: false);
  }

  Future<CreatedGame> createGame({
    required String scenario,
    required String dmType,
    required bool isPublic,
    required bool fillWithAi,
  }) async {
    final result = await _service.gameApi.createGame(
      input: ApiCreateGameInput(
        scenario: scenario,
        dmType: dmType,
        isPublic: isPublic,
        fillMode: fillWithAi
            ? ApiCreateGameInputFillMode.ai
            : ApiCreateGameInputFillMode.humans,
      ),
    );
    return CreatedGame(gameId: result.gameId, accessCode: result.accessCode);
  }

  Future<String> joinPrivate(String code) async {
    final result = await _service.gameApi.joinPrivate(accessCode: code);
    return result.gameId;
  }

  Future<void> joinGame(String gameId) async {
    await _service.gameApi.joinGame(gameId: gameId);
  }

  Future<GameState> getState(String gameId) async {
    final state = await _service.gameApi.getState(gameId: gameId);
    return _state(state);
  }

  Future<GameState> takeAction(String gameId, String action) async {
    await _service.gameApi.takeAction(gameId: gameId, action: action);
    return getState(gameId);
  }

  Future<GameState> advanceBotTurn(String gameId) async {
    await _service.gameApi.advanceBotTurn(gameId: gameId);
    return getState(gameId);
  }

  Future<void> startWithAi(String gameId) async {
    await _service.gameApi.startWithAi(gameId: gameId);
  }

  Future<List<ChatMessage>> getChat(String gameId) async {
    final messages = await _service.gameApi.getChatHistory(gameId: gameId);
    return messages
        .map(
          (message) => ChatMessage(
            timestamp: message.ts.toInt(),
            who: message.who,
            text: message.text,
            kind: message.kind?.name ?? 'say',
          ),
        )
        .toList(growable: false);
  }

  Future<void> sendChat(String gameId, String text) async {
    await _service.gameApi.sendChat(gameId: gameId, text: text);
  }

  Future<Stream<void>> stateEvents(String gameId) async {
    final channel = await _service.gameApi.getStateChannel(gameId: gameId);
    return (await _channelEvents(channel)).map((_) {});
  }

  Future<Stream<ChatMessage>> chatEvents(String gameId) async {
    final channel = await _service.gameApi.getChatChannel(gameId: gameId);
    return (await _channelEvents(channel)).map((json) {
      return ChatMessage(
        timestamp: (json['ts'] as num).toInt(),
        who: json['who'] as String,
        text: json['text'] as String,
        kind: json['kind'] as String? ?? 'say',
      );
    });
  }

  Future<Stream<ThinkingEvent>> thinkingEvents(String gameId) async {
    final channel = await _service.gameApi.getThinkingChannel(gameId: gameId);
    return (await _channelEvents(channel)).map((json) {
      return ThinkingEvent(
        who: json['who'] as String,
        phase: json['phase'] as String,
        text: json['text'] as String,
      );
    });
  }

  Future<Stream<Map<String, dynamic>>> _channelEvents(
    RealtimeChannel<dynamic> channel,
  ) async {
    final socket = WebSocketChannel.connect(_channelUri(channel));
    await socket.ready;
    final established = Completer<void>();
    late final StreamSubscription<dynamic> subscription;
    late final StreamController<Map<String, dynamic>> controller;
    controller = StreamController<Map<String, dynamic>>(
      onCancel: () async {
        await subscription.cancel();
        await socket.sink.close();
      },
    );
    subscription = socket.stream.listen(
      (data) {
        final envelope = jsonDecode(data as String) as Map<String, dynamic>;
        if (envelope['type'] == 'subscribe_success') {
          if (!established.isCompleted) established.complete();
          return;
        }
        if (envelope['type'] != 'message') return;
        final payload = envelope['data'] ?? envelope['payload'];
        controller.add(Map<String, dynamic>.from(payload as Map));
      },
      onError: (Object exception, StackTrace stackTrace) {
        if (!established.isCompleted) {
          established.completeError(exception, stackTrace);
        }
        controller.addError(exception, stackTrace);
      },
      onDone: () {
        if (!established.isCompleted) {
          established.completeError(
            StateError('Realtime channel closed before subscribing.'),
          );
        }
        controller.close();
      },
    );
    socket.sink.add(
      jsonEncode({
        'action': 'subscribe',
        'channel': channel.channel,
        'token': channel.token,
      }),
    );
    await established.future.timeout(
      const Duration(seconds: 5),
      onTimeout: () {},
    );
    return controller.stream;
  }

  Uri _channelUri(RealtimeChannel<dynamic> channel) {
    final uri = Uri.parse(channel.wsUrl);
    final connectToken = channel.connectToken;
    if (connectToken == null) return uri;
    return uri.replace(
      queryParameters: {...uri.queryParameters, 'token': connectToken},
    );
  }

  AppUser? _user(AuthUser? user) =>
      user == null ? null : AppUser(id: user.userId, username: user.username);

  Character _character(GetCharacterResult value) => Character(
    userId: value.userId,
    name: value.name,
    classKey: value.classKey,
    spriteId: value.spriteId,
    sprite: value.sprite,
  );

  GameState _state(GetStateResult value) => GameState(
    viewerUserId: value.viewer.userId,
    spectator: value.viewer.spectator,
    gameId: value.gameId,
    scenario: value.scenario,
    dmName: value.dmName,
    players: value.players
        .map(
          (player) => Player(
            id: player.id,
            name: player.name,
            classKey: player.classKey,
            sprite: player.sprite,
            seat: SeatKind.values.byName(player.seat.name),
            userId: player.userId,
            hp: player.hp.toInt(),
            slot: player.slot.toInt(),
          ),
        )
        .toList(growable: false),
    roomPhase: value.roomPhase.name,
    endsAt: value.endsAt == null
        ? null
        : DateTime.fromMillisecondsSinceEpoch(value.endsAt!.toInt()),
    turnIndex: value.turnIndex.toInt(),
    phase: value.phase.name,
    lastRoll: value.lastRoll == null
        ? null
        : DiceRoll(
            value: value.lastRoll!.value.toInt(),
            sprite: value.lastRoll!.sprite.toInt(),
            color: value.lastRoll!.color,
            dc: value.lastRoll!.dc.toInt(),
            success: value.lastRoll!.success,
            actor: value.lastRoll!.actor,
            action: value.lastRoll!.action,
          ),
    log: value.log
        .map(
          (entry) =>
              LogEntry(kind: entry.kind.name, who: entry.who, text: entry.text),
        )
        .toList(growable: false),
    options: value.options,
    version: value.version.toInt(),
  );
}
