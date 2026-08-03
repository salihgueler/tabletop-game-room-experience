import 'dart:io';

import 'package:tabletop_workshop/data/repositories/game_repository.dart';
import 'package:tabletop_workshop/data/services/blocks_game_service.dart';
import 'package:tabletop_workshop/domain/models.dart';

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

  final history = await repository.getChat('seed-0');
  final events = await repository.chatEvents('seed-0');
  final received = events
      .firstWhere((message) => message.text == marker)
      .timeout(const Duration(seconds: 5));

  await repository.sendChat('seed-0', marker);
  final event = await received;

  stdout.writeln(
    'Blocks chat OK: loaded ${history.length} messages and received '
    '"${event.text}" over Realtime.',
  );
}
