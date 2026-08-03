import 'package:flutter/material.dart';

import 'app.dart';
import 'data/repositories/game_repository.dart';
import 'data/services/blocks_game_service.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  final service = BlocksGameService.fromEnvironment();
  runApp(TabletopApp(repository: GameRepository(service)));
}
