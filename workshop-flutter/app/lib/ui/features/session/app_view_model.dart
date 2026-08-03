import 'package:flutter/foundation.dart';

import '../../../data/repositories/game_repository.dart';
import '../../../domain/models.dart';

enum AppStage { loading, auth, character, hall, game }

class AppViewModel extends ChangeNotifier {
  AppViewModel(this._repository);

  final GameRepository _repository;

  AppStage stage = AppStage.loading;
  AppUser? user;
  Character? character;
  String? gameId;
  String? error;

  GameRepository get repository => _repository;

  Future<void> bootstrap() async {
    stage = AppStage.loading;
    notifyListeners();
    try {
      user = await _repository.restoreSession();
      if (user == null) {
        stage = AppStage.auth;
        return;
      }
      character = await _repository.getCharacter();
      stage = character == null ? AppStage.character : AppStage.hall;
    } catch (_) {
      user = null;
      stage = AppStage.auth;
    } finally {
      notifyListeners();
    }
  }

  Future<void> authenticate({
    required String username,
    required String password,
    required bool createAccount,
  }) async {
    error = null;
    notifyListeners();
    try {
      user = await _repository.authenticate(
        username: username,
        password: password,
        createAccount: createAccount,
      );
      character = await _repository.getCharacter();
      stage = character == null ? AppStage.character : AppStage.hall;
    } catch (exception) {
      error = _message(exception);
    }
    notifyListeners();
  }

  Future<void> chooseCharacter(String name, HeroChoice choice) async {
    error = null;
    notifyListeners();
    try {
      character = await _repository.saveCharacter(name: name, choice: choice);
      stage = AppStage.hall;
    } catch (exception) {
      error = _message(exception);
    }
    notifyListeners();
  }

  void openGame(String id) {
    gameId = id;
    stage = AppStage.game;
    notifyListeners();
  }

  void leaveGame() {
    gameId = null;
    stage = AppStage.hall;
    notifyListeners();
  }

  Future<void> signOut() async {
    try {
      await _repository.signOut();
    } finally {
      user = null;
      character = null;
      gameId = null;
      stage = AppStage.auth;
      notifyListeners();
    }
  }

  String _message(Object exception) => exception.toString().replaceFirst(
    RegExp(r'^(Exception|StateError):\s*'),
    '',
  );
}
