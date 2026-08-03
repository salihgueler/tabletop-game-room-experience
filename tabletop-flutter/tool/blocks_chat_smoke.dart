import 'dart:io';

import 'package:tabletop_flutter/data/repositories/game_repository.dart';
import 'package:tabletop_flutter/data/services/blocks_game_service.dart';
import 'package:tabletop_flutter/domain/models.dart';

Future<void> main() async {
  final suffix = DateTime.now().microsecondsSinceEpoch;
  final username = 'flutter_smoke_$suffix';
  final marker = 'Flutter Realtime smoke $suffix';
  final repository = GameRepository(BlocksGameService.fromEnvironment());

  await repository.authenticate(
    username: username,
    password: 'flutter-smoke-password',
    createAccount: true,
  );
  await repository.saveCharacter(name: 'Smoke', choice: heroChoices.first);

  final games = await repository.listGames();
  if (games.isEmpty) throw StateError('Blocks returned no playable games.');
  final gameId = games.first.id;
  final history = await repository.getChat(gameId);
  final events = await repository.chatEvents(gameId);
  final received = events
      .firstWhere((message) => message.text == marker)
      .timeout(const Duration(seconds: 5));

  await repository.sendChat(gameId, marker);
  final event = await received;

  stdout.writeln(
    'Blocks chat OK for $gameId: loaded ${history.length} messages and '
    'received "${event.text}" over Realtime.',
  );
}
