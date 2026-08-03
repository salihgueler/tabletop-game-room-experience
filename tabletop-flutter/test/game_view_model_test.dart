import 'package:flutter_test/flutter_test.dart';
import 'package:tabletop_flutter/blocks.blocks.dart';
import 'package:tabletop_flutter/data/repositories/game_repository.dart';
import 'package:tabletop_flutter/data/services/blocks_game_service.dart';
import 'package:tabletop_flutter/domain/models.dart';
import 'package:tabletop_flutter/ui/features/game/game_view_model.dart';

void main() {
  test('game state log fills chat when history is unavailable', () async {
    final repository = _ChatFallbackRepository();
    final viewModel = GameViewModel(repository, gameId: 'game-1');
    addTearDown(viewModel.dispose);

    await viewModel.start();

    expect(viewModel.messages, hasLength(1));
    expect(viewModel.messages.single.who, 'DM');
    expect(viewModel.messages.single.text, 'The door opens.');
  });
}

class _ChatFallbackRepository extends GameRepository {
  _ChatFallbackRepository()
    : super(BlocksGameService(Blocks(baseUrl: 'http://localhost/unused')));

  @override
  Future<void> joinGame(String gameId) async {}

  @override
  Future<GameState> getState(String gameId) async {
    return const GameState(
      viewerUserId: 'user-1',
      spectator: false,
      gameId: 'game-1',
      scenario: 'Cave Crypt',
      dmName: 'Grimjaw',
      players: [
        Player(
          id: 'player-1',
          name: 'Aldric',
          classKey: 'paladin',
          sprite: '/sprites/characters/paladin_a.png',
          seat: SeatKind.human,
          userId: 'user-1',
          hp: 20,
          slot: 0,
        ),
      ],
      roomPhase: 'live',
      endsAt: null,
      turnIndex: 0,
      phase: 'player',
      lastRoll: null,
      log: [LogEntry(kind: 'dm', who: 'DM', text: 'The door opens.')],
      options: ['Investigate'],
      version: 1,
    );
  }

  @override
  Future<List<ChatMessage>> getChat(String gameId) async {
    throw Exception('History transport unavailable');
  }

  @override
  Future<Stream<void>> stateEvents(String gameId) async =>
      const Stream<void>.empty();

  @override
  Future<Stream<ChatMessage>> chatEvents(String gameId) async =>
      const Stream<ChatMessage>.empty();

  @override
  Future<Stream<ThinkingEvent>> thinkingEvents(String gameId) async =>
      const Stream<ThinkingEvent>.empty();
}
