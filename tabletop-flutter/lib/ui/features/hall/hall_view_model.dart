import 'package:flutter/foundation.dart';

import '../../../data/repositories/game_repository.dart';
import '../../../domain/models.dart';

class HallViewModel extends ChangeNotifier {
  HallViewModel(this._repository);

  final GameRepository _repository;

  List<GameSummary> games = const [];
  String scenario = scenarios.first;
  String dmType = dmTypes.first;
  bool isPublic = true;
  bool fillWithAi = true;
  bool loading = false;
  String? error;

  Future<void> load() async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      games = await _repository.listGames();
    } catch (exception) {
      error = _message(exception);
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  void setScenario(String? value) {
    if (value == null) return;
    scenario = value;
    notifyListeners();
  }

  void setDmType(String? value) {
    if (value == null) return;
    dmType = value;
    notifyListeners();
  }

  void setPublic(bool value) {
    isPublic = value;
    notifyListeners();
  }

  void setFillWithAi(bool value) {
    fillWithAi = value;
    notifyListeners();
  }

  Future<CreatedGame?> create() async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      return await _repository.createGame(
        scenario: scenario,
        dmType: dmType,
        isPublic: isPublic,
        fillWithAi: fillWithAi,
      );
    } catch (exception) {
      error = _message(exception);
      return null;
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  Future<String?> joinPrivate(String code) async {
    if (code.trim().isEmpty) return null;
    error = null;
    try {
      return await _repository.joinPrivate(code.trim());
    } catch (exception) {
      error = _message(exception);
      notifyListeners();
      return null;
    }
  }

  String _message(Object exception) => exception.toString().replaceFirst(
    RegExp(r'^(Exception|StateError):\s*'),
    '',
  );
}
