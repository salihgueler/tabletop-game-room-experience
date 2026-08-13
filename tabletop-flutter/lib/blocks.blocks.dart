// GENERATED CODE — DO NOT MODIFY BY HAND
// Generator: blocks-codegen
// Source: api v1.0.0
// ignore_for_file: constant_identifier_names

import 'package:blocks_runtime/blocks_runtime.dart';
export 'package:blocks_runtime/blocks_runtime.dart'
    show BlocksClient, BlocksRpcException, SessionStore, InMemorySessionStore;
export 'package:blocks_runtime/blocks_runtime.dart'
    show RealtimeChannel, FileDownloadHandle, FileUploadHandle;

// --- Models ---

enum AuthStateState {
  signedOut,
  signedIn,
  confirmingSignUp,
  confirmingSignIn,
  confirmingMfa,
  confirmingPasswordReset;

  String toJson() => name;
  static AuthStateState fromJson(String json) => values.byName(json);
}

class AuthUser {
  final String userId;
  final String username;

  const AuthUser({required this.userId, required this.username});

  factory AuthUser.fromJson(Map<String, dynamic> json) {
    return AuthUser(
      userId: json['userId'] as String,
      username: json['username'] as String,
    );
  }

  Map<String, dynamic> toJson() {
    return {'userId': userId, 'username': username};
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is AuthUser && userId == other.userId && username == other.username;

  @override
  int get hashCode => Object.hash(userId, username);

  @override
  String toString() => 'AuthUser(userId: $userId, username: $username)';
}

enum AuthActionMethod {
  GET,
  POST;

  String toJson() => name;
  static AuthActionMethod fromJson(String json) => values.byName(json);
}

enum AuthActionCapability {
  webauthnGet,
  webauthnCreate;

  static const _jsonMap = <String, AuthActionCapability>{
    'webauthn-get': webauthnGet,
    'webauthn-create': webauthnCreate,
  };
  static const _toJsonMap = <AuthActionCapability, String>{
    webauthnGet: 'webauthn-get',
    webauthnCreate: 'webauthn-create',
  };
  String toJson() => _toJsonMap[this]!;
  static AuthActionCapability fromJson(String json) => _jsonMap[json]!;
}

class AuthAction {
  final String name;
  final String label;
  final List<AuthField> fields;
  final String? url;
  final AuthActionMethod? method;
  final AuthActionCapability? capability;

  const AuthAction({
    required this.name,
    required this.label,
    required this.fields,
    this.url,
    this.method,
    this.capability,
  });

  factory AuthAction.fromJson(Map<String, dynamic> json) {
    return AuthAction(
      name: json['name'] as String,
      label: json['label'] as String,
      fields: (json['fields'] as List<dynamic>)
          .map((e) => AuthField.fromJson(e as Map<String, dynamic>))
          .toList(),
      url: json['url'] as String?,
      method: json['method'] != null
          ? AuthActionMethod.fromJson(json['method'] as String)
          : null,
      capability: json['capability'] != null
          ? AuthActionCapability.fromJson(json['capability'] as String)
          : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'name': name,
      'label': label,
      'fields': fields.map((e) => e.toJson()).toList(),
      if (url != null) 'url': url,
      if (method != null) 'method': method?.toJson(),
      if (capability != null) 'capability': capability?.toJson(),
    };
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is AuthAction &&
          name == other.name &&
          label == other.label &&
          fields == other.fields &&
          url == other.url &&
          method == other.method &&
          capability == other.capability;

  @override
  int get hashCode => Object.hash(name, label, fields, url, method, capability);

  @override
  String toString() =>
      'AuthAction(name: $name, label: $label, fields: $fields, url: $url, method: $method, capability: $capability)';
}

enum AuthFieldType {
  number,
  text,
  password,
  email,
  tel,
  hidden;

  String toJson() => name;
  static AuthFieldType fromJson(String json) => values.byName(json);
}

class AuthField {
  final String name;
  final String label;
  final AuthFieldType type;
  final bool required$;
  final String? defaultValue;

  const AuthField({
    required this.name,
    required this.label,
    required this.type,
    required this.required$,
    this.defaultValue,
  });

  factory AuthField.fromJson(Map<String, dynamic> json) {
    return AuthField(
      name: json['name'] as String,
      label: json['label'] as String,
      type: AuthFieldType.fromJson(json['type'] as String),
      required$: json['required'] as bool,
      defaultValue: json['defaultValue'] as String?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'name': name,
      'label': label,
      'type': type.toJson(),
      'required': required$,
      if (defaultValue != null) 'defaultValue': defaultValue,
    };
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is AuthField &&
          name == other.name &&
          label == other.label &&
          type == other.type &&
          required$ == other.required$ &&
          defaultValue == other.defaultValue;

  @override
  int get hashCode => Object.hash(name, label, type, required$, defaultValue);

  @override
  String toString() =>
      'AuthField(name: $name, label: $label, type: $type, required\$: ${required$}, defaultValue: $defaultValue)';
}

enum AdvanceBotTurnResultStatePlayersSeat {
  human,
  ai,
  open;

  String toJson() => name;
  static AdvanceBotTurnResultStatePlayersSeat fromJson(String json) =>
      values.byName(json);
}

class AdvanceBotTurnResultStatePlayers {
  final String id;
  final String name;
  final String classKey;
  final String sprite;
  final String color;
  final AdvanceBotTurnResultStatePlayersSeat seat;
  final bool isHuman;
  final String? userId;
  final num hp;
  final num slot;

  const AdvanceBotTurnResultStatePlayers({
    required this.id,
    required this.name,
    required this.classKey,
    required this.sprite,
    required this.color,
    required this.seat,
    required this.isHuman,
    required this.userId,
    required this.hp,
    required this.slot,
  });

  factory AdvanceBotTurnResultStatePlayers.fromJson(Map<String, dynamic> json) {
    return AdvanceBotTurnResultStatePlayers(
      id: json['id'] as String,
      name: json['name'] as String,
      classKey: json['classKey'] as String,
      sprite: json['sprite'] as String,
      color: json['color'] as String,
      seat: AdvanceBotTurnResultStatePlayersSeat.fromJson(
        json['seat'] as String,
      ),
      isHuman: json['isHuman'] as bool,
      userId: json['userId'] as String?,
      hp: json['hp'] as num,
      slot: json['slot'] as num,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'classKey': classKey,
      'sprite': sprite,
      'color': color,
      'seat': seat.toJson(),
      'isHuman': isHuman,
      'userId': userId,
      'hp': hp,
      'slot': slot,
    };
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is AdvanceBotTurnResultStatePlayers &&
          id == other.id &&
          name == other.name &&
          classKey == other.classKey &&
          sprite == other.sprite &&
          color == other.color &&
          seat == other.seat &&
          isHuman == other.isHuman &&
          userId == other.userId &&
          hp == other.hp &&
          slot == other.slot;

  @override
  int get hashCode => Object.hash(
    id,
    name,
    classKey,
    sprite,
    color,
    seat,
    isHuman,
    userId,
    hp,
    slot,
  );

  @override
  String toString() =>
      'AdvanceBotTurnResultStatePlayers(id: $id, name: $name, classKey: $classKey, sprite: $sprite, color: $color, seat: $seat, isHuman: $isHuman, userId: $userId, hp: $hp, slot: $slot)';
}

enum AdvanceBotTurnResultStateRoomPhase {
  lobby,
  live,
  ended;

  String toJson() => name;
  static AdvanceBotTurnResultStateRoomPhase fromJson(String json) =>
      values.byName(json);
}

enum AdvanceBotTurnResultStatePhase {
  player,
  resolving,
  dm;

  String toJson() => name;
  static AdvanceBotTurnResultStatePhase fromJson(String json) =>
      values.byName(json);
}

class AdvanceBotTurnResultStateLastRoll {
  final num value;
  final num sprite;
  final String color;
  final num dc;
  final bool success;
  final String actor;
  final String action;

  const AdvanceBotTurnResultStateLastRoll({
    required this.value,
    required this.sprite,
    required this.color,
    required this.dc,
    required this.success,
    required this.actor,
    required this.action,
  });

  factory AdvanceBotTurnResultStateLastRoll.fromJson(
    Map<String, dynamic> json,
  ) {
    return AdvanceBotTurnResultStateLastRoll(
      value: json['value'] as num,
      sprite: json['sprite'] as num,
      color: json['color'] as String,
      dc: json['dc'] as num,
      success: json['success'] as bool,
      actor: json['actor'] as String,
      action: json['action'] as String,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'value': value,
      'sprite': sprite,
      'color': color,
      'dc': dc,
      'success': success,
      'actor': actor,
      'action': action,
    };
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is AdvanceBotTurnResultStateLastRoll &&
          value == other.value &&
          sprite == other.sprite &&
          color == other.color &&
          dc == other.dc &&
          success == other.success &&
          actor == other.actor &&
          action == other.action;

  @override
  int get hashCode =>
      Object.hash(value, sprite, color, dc, success, actor, action);

  @override
  String toString() =>
      'AdvanceBotTurnResultStateLastRoll(value: $value, sprite: $sprite, color: $color, dc: $dc, success: $success, actor: $actor, action: $action)';
}

enum AdvanceBotTurnResultStateLogKind {
  dm,
  action,
  roll,
  system;

  String toJson() => name;
  static AdvanceBotTurnResultStateLogKind fromJson(String json) =>
      values.byName(json);
}

class AdvanceBotTurnResultStateLog {
  final AdvanceBotTurnResultStateLogKind kind;
  final String who;
  final String text;
  final String? color;

  const AdvanceBotTurnResultStateLog({
    required this.kind,
    required this.who,
    required this.text,
    this.color,
  });

  factory AdvanceBotTurnResultStateLog.fromJson(Map<String, dynamic> json) {
    return AdvanceBotTurnResultStateLog(
      kind: AdvanceBotTurnResultStateLogKind.fromJson(json['kind'] as String),
      who: json['who'] as String,
      text: json['text'] as String,
      color: json['color'] as String?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'kind': kind.toJson(),
      'who': who,
      'text': text,
      if (color != null) 'color': color,
    };
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is AdvanceBotTurnResultStateLog &&
          kind == other.kind &&
          who == other.who &&
          text == other.text &&
          color == other.color;

  @override
  int get hashCode => Object.hash(kind, who, text, color);

  @override
  String toString() =>
      'AdvanceBotTurnResultStateLog(kind: $kind, who: $who, text: $text, color: $color)';
}

class AdvanceBotTurnResultState {
  final num version;
  final String gameId;
  final String scenario;
  final String dmName;
  final List<AdvanceBotTurnResultStatePlayers> players;
  final AdvanceBotTurnResultStateRoomPhase roomPhase;
  final num? endsAt;
  final num turnIndex;
  final num round;
  final AdvanceBotTurnResultStatePhase phase;
  final num dc;
  final AdvanceBotTurnResultStateLastRoll? lastRoll;
  final List<AdvanceBotTurnResultStateLog> log;
  final List<String> inventory;
  final List<String> options;

  const AdvanceBotTurnResultState({
    required this.version,
    required this.gameId,
    required this.scenario,
    required this.dmName,
    required this.players,
    required this.roomPhase,
    required this.endsAt,
    required this.turnIndex,
    required this.round,
    required this.phase,
    required this.dc,
    required this.lastRoll,
    required this.log,
    required this.inventory,
    required this.options,
  });

  factory AdvanceBotTurnResultState.fromJson(Map<String, dynamic> json) {
    return AdvanceBotTurnResultState(
      version: json['version'] as num,
      gameId: json['gameId'] as String,
      scenario: json['scenario'] as String,
      dmName: json['dmName'] as String,
      players: (json['players'] as List<dynamic>)
          .map(
            (e) => AdvanceBotTurnResultStatePlayers.fromJson(
              e as Map<String, dynamic>,
            ),
          )
          .toList(),
      roomPhase: AdvanceBotTurnResultStateRoomPhase.fromJson(
        json['roomPhase'] as String,
      ),
      endsAt: json['endsAt'] as num?,
      turnIndex: json['turnIndex'] as num,
      round: json['round'] as num,
      phase: AdvanceBotTurnResultStatePhase.fromJson(json['phase'] as String),
      dc: json['dc'] as num,
      lastRoll: json['lastRoll'] != null
          ? AdvanceBotTurnResultStateLastRoll.fromJson(
              json['lastRoll'] as Map<String, dynamic>,
            )
          : null,
      log: (json['log'] as List<dynamic>)
          .map(
            (e) => AdvanceBotTurnResultStateLog.fromJson(
              e as Map<String, dynamic>,
            ),
          )
          .toList(),
      inventory: (json['inventory'] as List<dynamic>).cast<String>(),
      options: (json['options'] as List<dynamic>).cast<String>(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'version': version,
      'gameId': gameId,
      'scenario': scenario,
      'dmName': dmName,
      'players': players.map((e) => e.toJson()).toList(),
      'roomPhase': roomPhase.toJson(),
      'endsAt': endsAt,
      'turnIndex': turnIndex,
      'round': round,
      'phase': phase.toJson(),
      'dc': dc,
      'lastRoll': lastRoll?.toJson(),
      'log': log.map((e) => e.toJson()).toList(),
      'inventory': inventory,
      'options': options,
    };
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is AdvanceBotTurnResultState &&
          version == other.version &&
          gameId == other.gameId &&
          scenario == other.scenario &&
          dmName == other.dmName &&
          players == other.players &&
          roomPhase == other.roomPhase &&
          endsAt == other.endsAt &&
          turnIndex == other.turnIndex &&
          round == other.round &&
          phase == other.phase &&
          dc == other.dc &&
          lastRoll == other.lastRoll &&
          log == other.log &&
          inventory == other.inventory &&
          options == other.options;

  @override
  int get hashCode => Object.hash(
    version,
    gameId,
    scenario,
    dmName,
    players,
    roomPhase,
    endsAt,
    turnIndex,
    round,
    phase,
    dc,
    lastRoll,
    log,
    inventory,
    options,
  );

  @override
  String toString() =>
      'AdvanceBotTurnResultState(version: $version, gameId: $gameId, scenario: $scenario, dmName: $dmName, players: $players, roomPhase: $roomPhase, endsAt: $endsAt, turnIndex: $turnIndex, round: $round, phase: $phase, dc: $dc, lastRoll: $lastRoll, log: $log, inventory: $inventory, options: $options)';
}

enum ApiCreateGameInputFillMode {
  ai,
  humans;

  String toJson() => name;
  static ApiCreateGameInputFillMode fromJson(String json) =>
      values.byName(json);
}

enum GetChatHistoryResultKind {
  dm,
  action,
  roll,
  system,
  say;

  String toJson() => name;
  static GetChatHistoryResultKind fromJson(String json) => values.byName(json);
}

class GetConstantsResultClassMeta {
  final String name;
  final String color;
  final List<String> actions;

  const GetConstantsResultClassMeta({
    required this.name,
    required this.color,
    required this.actions,
  });

  factory GetConstantsResultClassMeta.fromJson(Map<String, dynamic> json) {
    return GetConstantsResultClassMeta(
      name: json['name'] as String,
      color: json['color'] as String,
      actions: (json['actions'] as List<dynamic>).cast<String>(),
    );
  }

  Map<String, dynamic> toJson() {
    return {'name': name, 'color': color, 'actions': actions};
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is GetConstantsResultClassMeta &&
          name == other.name &&
          color == other.color &&
          actions == other.actions;

  @override
  int get hashCode => Object.hash(name, color, actions);

  @override
  String toString() =>
      'GetConstantsResultClassMeta(name: $name, color: $color, actions: $actions)';
}

class GetStateResultViewer {
  final String userId;
  final String? mySeatId;
  final bool spectator;

  const GetStateResultViewer({
    required this.userId,
    required this.mySeatId,
    required this.spectator,
  });

  factory GetStateResultViewer.fromJson(Map<String, dynamic> json) {
    return GetStateResultViewer(
      userId: json['userId'] as String,
      mySeatId: json['mySeatId'] as String?,
      spectator: json['spectator'] as bool,
    );
  }

  Map<String, dynamic> toJson() {
    return {'userId': userId, 'mySeatId': mySeatId, 'spectator': spectator};
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is GetStateResultViewer &&
          userId == other.userId &&
          mySeatId == other.mySeatId &&
          spectator == other.spectator;

  @override
  int get hashCode => Object.hash(userId, mySeatId, spectator);

  @override
  String toString() =>
      'GetStateResultViewer(userId: $userId, mySeatId: $mySeatId, spectator: $spectator)';
}

enum GetStateResultPlayersSeat {
  human,
  ai,
  open;

  String toJson() => name;
  static GetStateResultPlayersSeat fromJson(String json) => values.byName(json);
}

class GetStateResultPlayers {
  final String id;
  final String name;
  final String classKey;
  final String sprite;
  final String color;
  final GetStateResultPlayersSeat seat;
  final bool isHuman;
  final String? userId;
  final num hp;
  final num slot;

  const GetStateResultPlayers({
    required this.id,
    required this.name,
    required this.classKey,
    required this.sprite,
    required this.color,
    required this.seat,
    required this.isHuman,
    required this.userId,
    required this.hp,
    required this.slot,
  });

  factory GetStateResultPlayers.fromJson(Map<String, dynamic> json) {
    return GetStateResultPlayers(
      id: json['id'] as String,
      name: json['name'] as String,
      classKey: json['classKey'] as String,
      sprite: json['sprite'] as String,
      color: json['color'] as String,
      seat: GetStateResultPlayersSeat.fromJson(json['seat'] as String),
      isHuman: json['isHuman'] as bool,
      userId: json['userId'] as String?,
      hp: json['hp'] as num,
      slot: json['slot'] as num,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'classKey': classKey,
      'sprite': sprite,
      'color': color,
      'seat': seat.toJson(),
      'isHuman': isHuman,
      'userId': userId,
      'hp': hp,
      'slot': slot,
    };
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is GetStateResultPlayers &&
          id == other.id &&
          name == other.name &&
          classKey == other.classKey &&
          sprite == other.sprite &&
          color == other.color &&
          seat == other.seat &&
          isHuman == other.isHuman &&
          userId == other.userId &&
          hp == other.hp &&
          slot == other.slot;

  @override
  int get hashCode => Object.hash(
    id,
    name,
    classKey,
    sprite,
    color,
    seat,
    isHuman,
    userId,
    hp,
    slot,
  );

  @override
  String toString() =>
      'GetStateResultPlayers(id: $id, name: $name, classKey: $classKey, sprite: $sprite, color: $color, seat: $seat, isHuman: $isHuman, userId: $userId, hp: $hp, slot: $slot)';
}

enum GetStateResultRoomPhase {
  lobby,
  live,
  ended;

  String toJson() => name;
  static GetStateResultRoomPhase fromJson(String json) => values.byName(json);
}

enum GetStateResultPhase {
  player,
  resolving,
  dm;

  String toJson() => name;
  static GetStateResultPhase fromJson(String json) => values.byName(json);
}

enum GetStateResultLogKind {
  dm,
  action,
  roll,
  system;

  String toJson() => name;
  static GetStateResultLogKind fromJson(String json) => values.byName(json);
}

class GetStateResultLog {
  final GetStateResultLogKind kind;
  final String who;
  final String text;
  final String? color;

  const GetStateResultLog({
    required this.kind,
    required this.who,
    required this.text,
    this.color,
  });

  factory GetStateResultLog.fromJson(Map<String, dynamic> json) {
    return GetStateResultLog(
      kind: GetStateResultLogKind.fromJson(json['kind'] as String),
      who: json['who'] as String,
      text: json['text'] as String,
      color: json['color'] as String?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'kind': kind.toJson(),
      'who': who,
      'text': text,
      if (color != null) 'color': color,
    };
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is GetStateResultLog &&
          kind == other.kind &&
          who == other.who &&
          text == other.text &&
          color == other.color;

  @override
  int get hashCode => Object.hash(kind, who, text, color);

  @override
  String toString() =>
      'GetStateResultLog(kind: $kind, who: $who, text: $text, color: $color)';
}

enum ListGamesResultMembersSeat {
  human,
  ai,
  open;

  String toJson() => name;
  static ListGamesResultMembersSeat fromJson(String json) =>
      values.byName(json);
}

class ListGamesResultMembers {
  final String name;
  final String classKey;
  final ListGamesResultMembersSeat seat;

  const ListGamesResultMembers({
    required this.name,
    required this.classKey,
    required this.seat,
  });

  factory ListGamesResultMembers.fromJson(Map<String, dynamic> json) {
    return ListGamesResultMembers(
      name: json['name'] as String,
      classKey: json['classKey'] as String,
      seat: ListGamesResultMembersSeat.fromJson(json['seat'] as String),
    );
  }

  Map<String, dynamic> toJson() {
    return {'name': name, 'classKey': classKey, 'seat': seat.toJson()};
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is ListGamesResultMembers &&
          name == other.name &&
          classKey == other.classKey &&
          seat == other.seat;

  @override
  int get hashCode => Object.hash(name, classKey, seat);

  @override
  String toString() =>
      'ListGamesResultMembers(name: $name, classKey: $classKey, seat: $seat)';
}

enum TakeActionResultPlayersSeat {
  human,
  ai,
  open;

  String toJson() => name;
  static TakeActionResultPlayersSeat fromJson(String json) =>
      values.byName(json);
}

class TakeActionResultPlayers {
  final String id;
  final String name;
  final String classKey;
  final String sprite;
  final String color;
  final TakeActionResultPlayersSeat seat;
  final bool isHuman;
  final String? userId;
  final num hp;
  final num slot;

  const TakeActionResultPlayers({
    required this.id,
    required this.name,
    required this.classKey,
    required this.sprite,
    required this.color,
    required this.seat,
    required this.isHuman,
    required this.userId,
    required this.hp,
    required this.slot,
  });

  factory TakeActionResultPlayers.fromJson(Map<String, dynamic> json) {
    return TakeActionResultPlayers(
      id: json['id'] as String,
      name: json['name'] as String,
      classKey: json['classKey'] as String,
      sprite: json['sprite'] as String,
      color: json['color'] as String,
      seat: TakeActionResultPlayersSeat.fromJson(json['seat'] as String),
      isHuman: json['isHuman'] as bool,
      userId: json['userId'] as String?,
      hp: json['hp'] as num,
      slot: json['slot'] as num,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'classKey': classKey,
      'sprite': sprite,
      'color': color,
      'seat': seat.toJson(),
      'isHuman': isHuman,
      'userId': userId,
      'hp': hp,
      'slot': slot,
    };
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is TakeActionResultPlayers &&
          id == other.id &&
          name == other.name &&
          classKey == other.classKey &&
          sprite == other.sprite &&
          color == other.color &&
          seat == other.seat &&
          isHuman == other.isHuman &&
          userId == other.userId &&
          hp == other.hp &&
          slot == other.slot;

  @override
  int get hashCode => Object.hash(
    id,
    name,
    classKey,
    sprite,
    color,
    seat,
    isHuman,
    userId,
    hp,
    slot,
  );

  @override
  String toString() =>
      'TakeActionResultPlayers(id: $id, name: $name, classKey: $classKey, sprite: $sprite, color: $color, seat: $seat, isHuman: $isHuman, userId: $userId, hp: $hp, slot: $slot)';
}

enum TakeActionResultRoomPhase {
  lobby,
  live,
  ended;

  String toJson() => name;
  static TakeActionResultRoomPhase fromJson(String json) => values.byName(json);
}

enum TakeActionResultPhase {
  player,
  resolving,
  dm;

  String toJson() => name;
  static TakeActionResultPhase fromJson(String json) => values.byName(json);
}

enum TakeActionResultLogKind {
  dm,
  action,
  roll,
  system;

  String toJson() => name;
  static TakeActionResultLogKind fromJson(String json) => values.byName(json);
}

class TakeActionResultLog {
  final TakeActionResultLogKind kind;
  final String who;
  final String text;
  final String? color;

  const TakeActionResultLog({
    required this.kind,
    required this.who,
    required this.text,
    this.color,
  });

  factory TakeActionResultLog.fromJson(Map<String, dynamic> json) {
    return TakeActionResultLog(
      kind: TakeActionResultLogKind.fromJson(json['kind'] as String),
      who: json['who'] as String,
      text: json['text'] as String,
      color: json['color'] as String?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'kind': kind.toJson(),
      'who': who,
      'text': text,
      if (color != null) 'color': color,
    };
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is TakeActionResultLog &&
          kind == other.kind &&
          who == other.who &&
          text == other.text &&
          color == other.color;

  @override
  int get hashCode => Object.hash(kind, who, text, color);

  @override
  String toString() =>
      'TakeActionResultLog(kind: $kind, who: $who, text: $text, color: $color)';
}

sealed class ConfirmSignInInputChallenge {
  const ConfirmSignInInputChallenge();
  Map<String, dynamic> toJson();
  static ConfirmSignInInputChallenge fromJson(Map<String, dynamic> json) {
    switch (json['challenge'] as String) {
      case 'code':
        return CodeConfirmSignInInputChallenge.fromJson(json);
      case 'mfaType':
        return MfaTypeConfirmSignInInputChallenge.fromJson(json);
      case 'newPassword':
        return NewPasswordConfirmSignInInputChallenge.fromJson(json);
      case 'totpSetup':
        return TotpSetupConfirmSignInInputChallenge.fromJson(json);
      case 'email':
        return EmailConfirmSignInInputChallenge.fromJson(json);
      case 'password':
        return PasswordConfirmSignInInputChallenge.fromJson(json);
      case 'firstFactor':
        return FirstFactorConfirmSignInInputChallenge.fromJson(json);
      case 'webauthn':
        return WebauthnConfirmSignInInputChallenge.fromJson(json);
      default:
        throw ArgumentError('Unknown challenge: ${json['challenge']}');
    }
  }
}

class CodeConfirmSignInInputChallenge extends ConfirmSignInInputChallenge {
  final String code;

  const CodeConfirmSignInInputChallenge({required this.code});

  factory CodeConfirmSignInInputChallenge.fromJson(Map<String, dynamic> json) {
    return CodeConfirmSignInInputChallenge(code: json['code'] as String);
  }

  @override
  Map<String, dynamic> toJson() {
    return {'challenge': 'code', 'code': code};
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is CodeConfirmSignInInputChallenge && code == other.code;

  @override
  int get hashCode => code.hashCode;

  @override
  String toString() => 'CodeConfirmSignInInputChallenge(code: $code)';
}

class MfaTypeConfirmSignInInputChallenge extends ConfirmSignInInputChallenge {
  final String mfaType;

  const MfaTypeConfirmSignInInputChallenge({required this.mfaType});

  factory MfaTypeConfirmSignInInputChallenge.fromJson(
    Map<String, dynamic> json,
  ) {
    return MfaTypeConfirmSignInInputChallenge(
      mfaType: json['mfaType'] as String,
    );
  }

  @override
  Map<String, dynamic> toJson() {
    return {'challenge': 'mfaType', 'mfaType': mfaType};
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is MfaTypeConfirmSignInInputChallenge && mfaType == other.mfaType;

  @override
  int get hashCode => mfaType.hashCode;

  @override
  String toString() => 'MfaTypeConfirmSignInInputChallenge(mfaType: $mfaType)';
}

class NewPasswordConfirmSignInInputChallenge
    extends ConfirmSignInInputChallenge {
  final String newPassword;

  const NewPasswordConfirmSignInInputChallenge({required this.newPassword});

  factory NewPasswordConfirmSignInInputChallenge.fromJson(
    Map<String, dynamic> json,
  ) {
    return NewPasswordConfirmSignInInputChallenge(
      newPassword: json['newPassword'] as String,
    );
  }

  @override
  Map<String, dynamic> toJson() {
    return {'challenge': 'newPassword', 'newPassword': newPassword};
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is NewPasswordConfirmSignInInputChallenge &&
          newPassword == other.newPassword;

  @override
  int get hashCode => newPassword.hashCode;

  @override
  String toString() =>
      'NewPasswordConfirmSignInInputChallenge(newPassword: $newPassword)';
}

class TotpSetupConfirmSignInInputChallenge extends ConfirmSignInInputChallenge {
  final String sharedSecret;
  final String code;

  const TotpSetupConfirmSignInInputChallenge({
    required this.sharedSecret,
    required this.code,
  });

  factory TotpSetupConfirmSignInInputChallenge.fromJson(
    Map<String, dynamic> json,
  ) {
    return TotpSetupConfirmSignInInputChallenge(
      sharedSecret: json['sharedSecret'] as String,
      code: json['code'] as String,
    );
  }

  @override
  Map<String, dynamic> toJson() {
    return {
      'challenge': 'totpSetup',
      'sharedSecret': sharedSecret,
      'code': code,
    };
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is TotpSetupConfirmSignInInputChallenge &&
          sharedSecret == other.sharedSecret &&
          code == other.code;

  @override
  int get hashCode => Object.hash(sharedSecret, code);

  @override
  String toString() =>
      'TotpSetupConfirmSignInInputChallenge(sharedSecret: $sharedSecret, code: $code)';
}

class EmailConfirmSignInInputChallenge extends ConfirmSignInInputChallenge {
  final String email;

  const EmailConfirmSignInInputChallenge({required this.email});

  factory EmailConfirmSignInInputChallenge.fromJson(Map<String, dynamic> json) {
    return EmailConfirmSignInInputChallenge(email: json['email'] as String);
  }

  @override
  Map<String, dynamic> toJson() {
    return {'challenge': 'email', 'email': email};
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is EmailConfirmSignInInputChallenge && email == other.email;

  @override
  int get hashCode => email.hashCode;

  @override
  String toString() => 'EmailConfirmSignInInputChallenge(email: $email)';
}

class PasswordConfirmSignInInputChallenge extends ConfirmSignInInputChallenge {
  final String password;

  const PasswordConfirmSignInInputChallenge({required this.password});

  factory PasswordConfirmSignInInputChallenge.fromJson(
    Map<String, dynamic> json,
  ) {
    return PasswordConfirmSignInInputChallenge(
      password: json['password'] as String,
    );
  }

  @override
  Map<String, dynamic> toJson() {
    return {'challenge': 'password', 'password': password};
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is PasswordConfirmSignInInputChallenge &&
          password == other.password;

  @override
  int get hashCode => password.hashCode;

  @override
  String toString() =>
      'PasswordConfirmSignInInputChallenge(password: $password)';
}

class FirstFactorConfirmSignInInputChallenge
    extends ConfirmSignInInputChallenge {
  final String firstFactor;

  const FirstFactorConfirmSignInInputChallenge({required this.firstFactor});

  factory FirstFactorConfirmSignInInputChallenge.fromJson(
    Map<String, dynamic> json,
  ) {
    return FirstFactorConfirmSignInInputChallenge(
      firstFactor: json['firstFactor'] as String,
    );
  }

  @override
  Map<String, dynamic> toJson() {
    return {'challenge': 'firstFactor', 'firstFactor': firstFactor};
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is FirstFactorConfirmSignInInputChallenge &&
          firstFactor == other.firstFactor;

  @override
  int get hashCode => firstFactor.hashCode;

  @override
  String toString() =>
      'FirstFactorConfirmSignInInputChallenge(firstFactor: $firstFactor)';
}

class WebauthnConfirmSignInInputChallenge extends ConfirmSignInInputChallenge {
  final String credential;

  const WebauthnConfirmSignInInputChallenge({required this.credential});

  factory WebauthnConfirmSignInInputChallenge.fromJson(
    Map<String, dynamic> json,
  ) {
    return WebauthnConfirmSignInInputChallenge(
      credential: json['credential'] as String,
    );
  }

  @override
  Map<String, dynamic> toJson() {
    return {'challenge': 'webauthn', 'credential': credential};
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is WebauthnConfirmSignInInputChallenge &&
          credential == other.credential;

  @override
  int get hashCode => credential.hashCode;

  @override
  String toString() =>
      'WebauthnConfirmSignInInputChallenge(credential: $credential)';
}

// --- API Namespaces ---

class AdvanceBotTurnResult {
  final AdvanceBotTurnResultState state;
  final bool botActed;
  final bool botTurnPending;

  const AdvanceBotTurnResult({
    required this.state,
    required this.botActed,
    required this.botTurnPending,
  });

  factory AdvanceBotTurnResult.fromJson(Map<String, dynamic> json) {
    return AdvanceBotTurnResult(
      state: AdvanceBotTurnResultState.fromJson(
        json['state'] as Map<String, dynamic>,
      ),
      botActed: json['botActed'] as bool,
      botTurnPending: json['botTurnPending'] as bool,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'state': state.toJson(),
      'botActed': botActed,
      'botTurnPending': botTurnPending,
    };
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is AdvanceBotTurnResult &&
          state == other.state &&
          botActed == other.botActed &&
          botTurnPending == other.botTurnPending;

  @override
  int get hashCode => Object.hash(state, botActed, botTurnPending);

  @override
  String toString() =>
      'AdvanceBotTurnResult(state: $state, botActed: $botActed, botTurnPending: $botTurnPending)';
}

class ApiCreateGameInput {
  final String scenario;
  final String dmType;
  final bool isPublic;
  final String? accessCode;
  final ApiCreateGameInputFillMode? fillMode;

  const ApiCreateGameInput({
    required this.scenario,
    required this.dmType,
    required this.isPublic,
    this.accessCode,
    this.fillMode,
  });

  factory ApiCreateGameInput.fromJson(Map<String, dynamic> json) {
    return ApiCreateGameInput(
      scenario: json['scenario'] as String,
      dmType: json['dmType'] as String,
      isPublic: json['isPublic'] as bool,
      accessCode: json['accessCode'] as String?,
      fillMode: json['fillMode'] != null
          ? ApiCreateGameInputFillMode.fromJson(json['fillMode'] as String)
          : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'scenario': scenario,
      'dmType': dmType,
      'isPublic': isPublic,
      if (accessCode != null) 'accessCode': accessCode,
      if (fillMode != null) 'fillMode': fillMode?.toJson(),
    };
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is ApiCreateGameInput &&
          scenario == other.scenario &&
          dmType == other.dmType &&
          isPublic == other.isPublic &&
          accessCode == other.accessCode &&
          fillMode == other.fillMode;

  @override
  int get hashCode =>
      Object.hash(scenario, dmType, isPublic, accessCode, fillMode);

  @override
  String toString() =>
      'ApiCreateGameInput(scenario: $scenario, dmType: $dmType, isPublic: $isPublic, accessCode: $accessCode, fillMode: $fillMode)';
}

class CreateGameResult {
  final String gameId;
  final String? accessCode;

  const CreateGameResult({required this.gameId, required this.accessCode});

  factory CreateGameResult.fromJson(Map<String, dynamic> json) {
    return CreateGameResult(
      gameId: json['gameId'] as String,
      accessCode: json['accessCode'] as String?,
    );
  }

  Map<String, dynamic> toJson() {
    return {'gameId': gameId, 'accessCode': accessCode};
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is CreateGameResult &&
          gameId == other.gameId &&
          accessCode == other.accessCode;

  @override
  int get hashCode => Object.hash(gameId, accessCode);

  @override
  String toString() =>
      'CreateGameResult(gameId: $gameId, accessCode: $accessCode)';
}

class GetCharacterResult {
  final String userId;
  final String name;
  final String classKey;
  final String spriteId;
  final String sprite;

  const GetCharacterResult({
    required this.userId,
    required this.name,
    required this.classKey,
    required this.spriteId,
    required this.sprite,
  });

  factory GetCharacterResult.fromJson(Map<String, dynamic> json) {
    return GetCharacterResult(
      userId: json['userId'] as String,
      name: json['name'] as String,
      classKey: json['classKey'] as String,
      spriteId: json['spriteId'] as String,
      sprite: json['sprite'] as String,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'userId': userId,
      'name': name,
      'classKey': classKey,
      'spriteId': spriteId,
      'sprite': sprite,
    };
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is GetCharacterResult &&
          userId == other.userId &&
          name == other.name &&
          classKey == other.classKey &&
          spriteId == other.spriteId &&
          sprite == other.sprite;

  @override
  int get hashCode => Object.hash(userId, name, classKey, spriteId, sprite);

  @override
  String toString() =>
      'GetCharacterResult(userId: $userId, name: $name, classKey: $classKey, spriteId: $spriteId, sprite: $sprite)';
}

class GetChatHistoryResult {
  final String gameId;
  final num ts;
  final String who;
  final String color;
  final String text;
  final GetChatHistoryResultKind? kind;

  const GetChatHistoryResult({
    required this.gameId,
    required this.ts,
    required this.who,
    required this.color,
    required this.text,
    this.kind,
  });

  factory GetChatHistoryResult.fromJson(Map<String, dynamic> json) {
    return GetChatHistoryResult(
      gameId: json['gameId'] as String,
      ts: json['ts'] as num,
      who: json['who'] as String,
      color: json['color'] as String,
      text: json['text'] as String,
      kind: json['kind'] != null
          ? GetChatHistoryResultKind.fromJson(json['kind'] as String)
          : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'gameId': gameId,
      'ts': ts,
      'who': who,
      'color': color,
      'text': text,
      if (kind != null) 'kind': kind?.toJson(),
    };
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is GetChatHistoryResult &&
          gameId == other.gameId &&
          ts == other.ts &&
          who == other.who &&
          color == other.color &&
          text == other.text &&
          kind == other.kind;

  @override
  int get hashCode => Object.hash(gameId, ts, who, color, text, kind);

  @override
  String toString() =>
      'GetChatHistoryResult(gameId: $gameId, ts: $ts, who: $who, color: $color, text: $text, kind: $kind)';
}

class GetConstantsResult {
  final dynamic scenarios;
  final dynamic dmTypes;
  final Map<String, GetConstantsResultClassMeta> classMeta;

  const GetConstantsResult({
    required this.scenarios,
    required this.dmTypes,
    required this.classMeta,
  });

  factory GetConstantsResult.fromJson(Map<String, dynamic> json) {
    return GetConstantsResult(
      scenarios: json['scenarios'] as dynamic,
      dmTypes: json['dmTypes'] as dynamic,
      classMeta: (json['classMeta'] as Map<String, dynamic>).map(
        (k, v) => MapEntry(k, v as GetConstantsResultClassMeta),
      ),
    );
  }

  Map<String, dynamic> toJson() {
    return {'scenarios': scenarios, 'dmTypes': dmTypes, 'classMeta': classMeta};
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is GetConstantsResult &&
          scenarios == other.scenarios &&
          dmTypes == other.dmTypes &&
          classMeta == other.classMeta;

  @override
  int get hashCode => Object.hash(scenarios, dmTypes, classMeta);

  @override
  String toString() =>
      'GetConstantsResult(scenarios: $scenarios, dmTypes: $dmTypes, classMeta: $classMeta)';
}

class GetStateResult {
  final GetStateResultViewer viewer;
  final String gameId;
  final String scenario;
  final String dmName;
  final List<GetStateResultPlayers> players;
  final GetStateResultRoomPhase roomPhase;
  final num? endsAt;
  final num turnIndex;
  final num round;
  final GetStateResultPhase phase;
  final num dc;
  final AdvanceBotTurnResultStateLastRoll? lastRoll;
  final List<GetStateResultLog> log;
  final List<String> inventory;
  final List<String> options;
  final num version;

  const GetStateResult({
    required this.viewer,
    required this.gameId,
    required this.scenario,
    required this.dmName,
    required this.players,
    required this.roomPhase,
    required this.endsAt,
    required this.turnIndex,
    required this.round,
    required this.phase,
    required this.dc,
    required this.lastRoll,
    required this.log,
    required this.inventory,
    required this.options,
    required this.version,
  });

  factory GetStateResult.fromJson(Map<String, dynamic> json) {
    return GetStateResult(
      viewer: GetStateResultViewer.fromJson(
        json['viewer'] as Map<String, dynamic>,
      ),
      gameId: json['gameId'] as String,
      scenario: json['scenario'] as String,
      dmName: json['dmName'] as String,
      players: (json['players'] as List<dynamic>)
          .map((e) => GetStateResultPlayers.fromJson(e as Map<String, dynamic>))
          .toList(),
      roomPhase: GetStateResultRoomPhase.fromJson(json['roomPhase'] as String),
      endsAt: json['endsAt'] as num?,
      turnIndex: json['turnIndex'] as num,
      round: json['round'] as num,
      phase: GetStateResultPhase.fromJson(json['phase'] as String),
      dc: json['dc'] as num,
      lastRoll: json['lastRoll'] != null
          ? AdvanceBotTurnResultStateLastRoll.fromJson(
              json['lastRoll'] as Map<String, dynamic>,
            )
          : null,
      log: (json['log'] as List<dynamic>)
          .map((e) => GetStateResultLog.fromJson(e as Map<String, dynamic>))
          .toList(),
      inventory: (json['inventory'] as List<dynamic>).cast<String>(),
      options: (json['options'] as List<dynamic>).cast<String>(),
      version: json['version'] as num,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'viewer': viewer.toJson(),
      'gameId': gameId,
      'scenario': scenario,
      'dmName': dmName,
      'players': players.map((e) => e.toJson()).toList(),
      'roomPhase': roomPhase.toJson(),
      'endsAt': endsAt,
      'turnIndex': turnIndex,
      'round': round,
      'phase': phase.toJson(),
      'dc': dc,
      'lastRoll': lastRoll?.toJson(),
      'log': log.map((e) => e.toJson()).toList(),
      'inventory': inventory,
      'options': options,
      'version': version,
    };
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is GetStateResult &&
          viewer == other.viewer &&
          gameId == other.gameId &&
          scenario == other.scenario &&
          dmName == other.dmName &&
          players == other.players &&
          roomPhase == other.roomPhase &&
          endsAt == other.endsAt &&
          turnIndex == other.turnIndex &&
          round == other.round &&
          phase == other.phase &&
          dc == other.dc &&
          lastRoll == other.lastRoll &&
          log == other.log &&
          inventory == other.inventory &&
          options == other.options &&
          version == other.version;

  @override
  int get hashCode => Object.hash(
    viewer,
    gameId,
    scenario,
    dmName,
    players,
    roomPhase,
    endsAt,
    turnIndex,
    round,
    phase,
    dc,
    lastRoll,
    log,
    inventory,
    options,
    version,
  );

  @override
  String toString() =>
      'GetStateResult(viewer: $viewer, gameId: $gameId, scenario: $scenario, dmName: $dmName, players: $players, roomPhase: $roomPhase, endsAt: $endsAt, turnIndex: $turnIndex, round: $round, phase: $phase, dc: $dc, lastRoll: $lastRoll, log: $log, inventory: $inventory, options: $options, version: $version)';
}

class JoinGameResult {
  final String gameId;
  final bool seated;

  const JoinGameResult({required this.gameId, required this.seated});

  factory JoinGameResult.fromJson(Map<String, dynamic> json) {
    return JoinGameResult(
      gameId: json['gameId'] as String,
      seated: json['seated'] as bool,
    );
  }

  Map<String, dynamic> toJson() {
    return {'gameId': gameId, 'seated': seated};
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is JoinGameResult &&
          gameId == other.gameId &&
          seated == other.seated;

  @override
  int get hashCode => Object.hash(gameId, seated);

  @override
  String toString() => 'JoinGameResult(gameId: $gameId, seated: $seated)';
}

class JoinPrivateResult {
  final String gameId;

  const JoinPrivateResult({required this.gameId});

  factory JoinPrivateResult.fromJson(Map<String, dynamic> json) {
    return JoinPrivateResult(gameId: json['gameId'] as String);
  }

  Map<String, dynamic> toJson() {
    return {'gameId': gameId};
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is JoinPrivateResult && gameId == other.gameId;

  @override
  int get hashCode => gameId.hashCode;

  @override
  String toString() => 'JoinPrivateResult(gameId: $gameId)';
}

class ListGamesResult {
  final String id;
  final String name;
  final String theme;
  final String note;
  final num maxParty;
  final String dmLevel;
  final String dm;
  final bool finished;
  final bool full;
  final String status;
  final num party;
  final List<String> partyClasses;
  final List<ListGamesResultMembers> members;

  const ListGamesResult({
    required this.id,
    required this.name,
    required this.theme,
    required this.note,
    required this.maxParty,
    required this.dmLevel,
    required this.dm,
    required this.finished,
    required this.full,
    required this.status,
    required this.party,
    required this.partyClasses,
    required this.members,
  });

  factory ListGamesResult.fromJson(Map<String, dynamic> json) {
    return ListGamesResult(
      id: json['id'] as String,
      name: json['name'] as String,
      theme: json['theme'] as String,
      note: json['note'] as String,
      maxParty: json['maxParty'] as num,
      dmLevel: json['dmLevel'] as String,
      dm: json['dm'] as String,
      finished: json['finished'] as bool,
      full: json['full'] as bool,
      status: json['status'] as String,
      party: json['party'] as num,
      partyClasses: (json['partyClasses'] as List<dynamic>).cast<String>(),
      members: (json['members'] as List<dynamic>)
          .map(
            (e) => ListGamesResultMembers.fromJson(e as Map<String, dynamic>),
          )
          .toList(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'theme': theme,
      'note': note,
      'maxParty': maxParty,
      'dmLevel': dmLevel,
      'dm': dm,
      'finished': finished,
      'full': full,
      'status': status,
      'party': party,
      'partyClasses': partyClasses,
      'members': members.map((e) => e.toJson()).toList(),
    };
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is ListGamesResult &&
          id == other.id &&
          name == other.name &&
          theme == other.theme &&
          note == other.note &&
          maxParty == other.maxParty &&
          dmLevel == other.dmLevel &&
          dm == other.dm &&
          finished == other.finished &&
          full == other.full &&
          status == other.status &&
          party == other.party &&
          partyClasses == other.partyClasses &&
          members == other.members;

  @override
  int get hashCode => Object.hash(
    id,
    name,
    theme,
    note,
    maxParty,
    dmLevel,
    dm,
    finished,
    full,
    status,
    party,
    partyClasses,
    members,
  );

  @override
  String toString() =>
      'ListGamesResult(id: $id, name: $name, theme: $theme, note: $note, maxParty: $maxParty, dmLevel: $dmLevel, dm: $dm, finished: $finished, full: $full, status: $status, party: $party, partyClasses: $partyClasses, members: $members)';
}

class ApiSaveCharacterInput {
  final String name;
  final String classKey;
  final String spriteId;
  final String sprite;

  const ApiSaveCharacterInput({
    required this.name,
    required this.classKey,
    required this.spriteId,
    required this.sprite,
  });

  factory ApiSaveCharacterInput.fromJson(Map<String, dynamic> json) {
    return ApiSaveCharacterInput(
      name: json['name'] as String,
      classKey: json['classKey'] as String,
      spriteId: json['spriteId'] as String,
      sprite: json['sprite'] as String,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'name': name,
      'classKey': classKey,
      'spriteId': spriteId,
      'sprite': sprite,
    };
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is ApiSaveCharacterInput &&
          name == other.name &&
          classKey == other.classKey &&
          spriteId == other.spriteId &&
          sprite == other.sprite;

  @override
  int get hashCode => Object.hash(name, classKey, spriteId, sprite);

  @override
  String toString() =>
      'ApiSaveCharacterInput(name: $name, classKey: $classKey, spriteId: $spriteId, sprite: $sprite)';
}

class SendChatResult {
  final bool ok;

  const SendChatResult({required this.ok});

  factory SendChatResult.fromJson(Map<String, dynamic> json) {
    return SendChatResult(ok: json['ok'] as bool);
  }

  Map<String, dynamic> toJson() {
    return {'ok': ok};
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) || other is SendChatResult && ok == other.ok;

  @override
  int get hashCode => ok.hashCode;

  @override
  String toString() => 'SendChatResult(ok: $ok)';
}

class TakeActionResult {
  final num version;
  final String gameId;
  final String scenario;
  final String dmName;
  final List<TakeActionResultPlayers> players;
  final TakeActionResultRoomPhase roomPhase;
  final num? endsAt;
  final num turnIndex;
  final num round;
  final TakeActionResultPhase phase;
  final num dc;
  final AdvanceBotTurnResultStateLastRoll? lastRoll;
  final List<TakeActionResultLog> log;
  final List<String> inventory;
  final List<String> options;

  const TakeActionResult({
    required this.version,
    required this.gameId,
    required this.scenario,
    required this.dmName,
    required this.players,
    required this.roomPhase,
    required this.endsAt,
    required this.turnIndex,
    required this.round,
    required this.phase,
    required this.dc,
    required this.lastRoll,
    required this.log,
    required this.inventory,
    required this.options,
  });

  factory TakeActionResult.fromJson(Map<String, dynamic> json) {
    return TakeActionResult(
      version: json['version'] as num,
      gameId: json['gameId'] as String,
      scenario: json['scenario'] as String,
      dmName: json['dmName'] as String,
      players: (json['players'] as List<dynamic>)
          .map(
            (e) => TakeActionResultPlayers.fromJson(e as Map<String, dynamic>),
          )
          .toList(),
      roomPhase: TakeActionResultRoomPhase.fromJson(
        json['roomPhase'] as String,
      ),
      endsAt: json['endsAt'] as num?,
      turnIndex: json['turnIndex'] as num,
      round: json['round'] as num,
      phase: TakeActionResultPhase.fromJson(json['phase'] as String),
      dc: json['dc'] as num,
      lastRoll: json['lastRoll'] != null
          ? AdvanceBotTurnResultStateLastRoll.fromJson(
              json['lastRoll'] as Map<String, dynamic>,
            )
          : null,
      log: (json['log'] as List<dynamic>)
          .map((e) => TakeActionResultLog.fromJson(e as Map<String, dynamic>))
          .toList(),
      inventory: (json['inventory'] as List<dynamic>).cast<String>(),
      options: (json['options'] as List<dynamic>).cast<String>(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'version': version,
      'gameId': gameId,
      'scenario': scenario,
      'dmName': dmName,
      'players': players.map((e) => e.toJson()).toList(),
      'roomPhase': roomPhase.toJson(),
      'endsAt': endsAt,
      'turnIndex': turnIndex,
      'round': round,
      'phase': phase.toJson(),
      'dc': dc,
      'lastRoll': lastRoll?.toJson(),
      'log': log.map((e) => e.toJson()).toList(),
      'inventory': inventory,
      'options': options,
    };
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is TakeActionResult &&
          version == other.version &&
          gameId == other.gameId &&
          scenario == other.scenario &&
          dmName == other.dmName &&
          players == other.players &&
          roomPhase == other.roomPhase &&
          endsAt == other.endsAt &&
          turnIndex == other.turnIndex &&
          round == other.round &&
          phase == other.phase &&
          dc == other.dc &&
          lastRoll == other.lastRoll &&
          log == other.log &&
          inventory == other.inventory &&
          options == other.options;

  @override
  int get hashCode => Object.hash(
    version,
    gameId,
    scenario,
    dmName,
    players,
    roomPhase,
    endsAt,
    turnIndex,
    round,
    phase,
    dc,
    lastRoll,
    log,
    inventory,
    options,
  );

  @override
  String toString() =>
      'TakeActionResult(version: $version, gameId: $gameId, scenario: $scenario, dmName: $dmName, players: $players, roomPhase: $roomPhase, endsAt: $endsAt, turnIndex: $turnIndex, round: $round, phase: $phase, dc: $dc, lastRoll: $lastRoll, log: $log, inventory: $inventory, options: $options)';
}

class ApiApi {
  final BlocksClient _client;
  ApiApi(this._client);

  Future<AdvanceBotTurnResult> advanceBotTurn({required String gameId}) async {
    final params = <String, dynamic>{'gameId': gameId};
    final result = await _client.call('api.advanceBotTurn', params);
    return AdvanceBotTurnResult.fromJson(result as Map<String, dynamic>);
  }

  Future<CreateGameResult> createGame({
    required ApiCreateGameInput input,
  }) async {
    final params = <String, dynamic>{'input': input.toJson()};
    final result = await _client.call('api.createGame', params);
    return CreateGameResult.fromJson(result as Map<String, dynamic>);
  }

  Future<GetCharacterResult?> getCharacter() async {
    final result = await _client.call('api.getCharacter', <String, dynamic>{});
    return result == null
        ? null
        : GetCharacterResult.fromJson(result as Map<String, dynamic>);
  }

  Future<RealtimeChannel<dynamic>> getChatChannel({
    required String gameId,
  }) async {
    final params = <String, dynamic>{'gameId': gameId};
    final result = await _client.call('api.getChatChannel', params);
    return RealtimeChannel.fromJson(
      result as Map<String, dynamic>,
      (json) => json,
    );
  }

  Future<List<GetChatHistoryResult>> getChatHistory({
    required String gameId,
  }) async {
    final params = <String, dynamic>{'gameId': gameId};
    final result = await _client.call('api.getChatHistory', params);
    return (result as List<dynamic>)
        .map((e) => GetChatHistoryResult.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<GetConstantsResult> getConstants() async {
    final result = await _client.call('api.getConstants', <String, dynamic>{});
    return GetConstantsResult.fromJson(result as Map<String, dynamic>);
  }

  Future<GetStateResult> getState({required String gameId}) async {
    final params = <String, dynamic>{'gameId': gameId};
    final result = await _client.call('api.getState', params);
    return GetStateResult.fromJson(result as Map<String, dynamic>);
  }

  Future<RealtimeChannel<dynamic>> getStateChannel({
    required String gameId,
  }) async {
    final params = <String, dynamic>{'gameId': gameId};
    final result = await _client.call('api.getStateChannel', params);
    return RealtimeChannel.fromJson(
      result as Map<String, dynamic>,
      (json) => json,
    );
  }

  Future<RealtimeChannel<dynamic>> getThinkingChannel({
    required String gameId,
  }) async {
    final params = <String, dynamic>{'gameId': gameId};
    final result = await _client.call('api.getThinkingChannel', params);
    return RealtimeChannel.fromJson(
      result as Map<String, dynamic>,
      (json) => json,
    );
  }

  Future<JoinGameResult> joinGame({required String gameId}) async {
    final params = <String, dynamic>{'gameId': gameId};
    final result = await _client.call('api.joinGame', params);
    return JoinGameResult.fromJson(result as Map<String, dynamic>);
  }

  Future<JoinPrivateResult> joinPrivate({required String accessCode}) async {
    final params = <String, dynamic>{'accessCode': accessCode};
    final result = await _client.call('api.joinPrivate', params);
    return JoinPrivateResult.fromJson(result as Map<String, dynamic>);
  }

  Future<List<ListGamesResult>> listGames() async {
    final result = await _client.call('api.listGames', <String, dynamic>{});
    return (result as List<dynamic>)
        .map((e) => ListGamesResult.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<GetCharacterResult> saveCharacter({
    required ApiSaveCharacterInput input,
  }) async {
    final params = <String, dynamic>{'input': input.toJson()};
    final result = await _client.call('api.saveCharacter', params);
    return GetCharacterResult.fromJson(result as Map<String, dynamic>);
  }

  Future<SendChatResult> sendChat({
    required String gameId,
    required String text,
  }) async {
    final params = <String, dynamic>{'gameId': gameId, 'text': text};
    final result = await _client.call('api.sendChat', params);
    return SendChatResult.fromJson(result as Map<String, dynamic>);
  }

  Future<JoinPrivateResult> startWithAi({required String gameId}) async {
    final params = <String, dynamic>{'gameId': gameId};
    final result = await _client.call('api.startWithAi', params);
    return JoinPrivateResult.fromJson(result as Map<String, dynamic>);
  }

  Future<TakeActionResult> takeAction({
    required String gameId,
    required String action,
  }) async {
    final params = <String, dynamic>{'gameId': gameId, 'action': action};
    final result = await _client.call('api.takeAction', params);
    return TakeActionResult.fromJson(result as Map<String, dynamic>);
  }
}

class AuthState {
  final AuthStateState state;
  final AuthUser? user;
  final List<AuthAction> actions;
  final String? error;
  final String? errorName;
  final bool? retriable;

  const AuthState({
    required this.state,
    this.user,
    required this.actions,
    this.error,
    this.errorName,
    this.retriable,
  });

  factory AuthState.fromJson(Map<String, dynamic> json) {
    return AuthState(
      state: AuthStateState.fromJson(json['state'] as String),
      user: json['user'] != null
          ? AuthUser.fromJson(json['user'] as Map<String, dynamic>)
          : null,
      actions: (json['actions'] as List<dynamic>)
          .map((e) => AuthAction.fromJson(e as Map<String, dynamic>))
          .toList(),
      error: json['error'] as String?,
      errorName: json['errorName'] as String?,
      retriable: json['retriable'] as bool?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'state': state.toJson(),
      if (user != null) 'user': user?.toJson(),
      'actions': actions.map((e) => e.toJson()).toList(),
      if (error != null) 'error': error,
      if (errorName != null) 'errorName': errorName,
      if (retriable != null) 'retriable': retriable,
    };
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is AuthState &&
          state == other.state &&
          user == other.user &&
          actions == other.actions &&
          error == other.error &&
          errorName == other.errorName &&
          retriable == other.retriable;

  @override
  int get hashCode =>
      Object.hash(state, user, actions, error, errorName, retriable);

  @override
  String toString() =>
      'AuthState(state: $state, user: $user, actions: $actions, error: $error, errorName: $errorName, retriable: $retriable)';
}

sealed class AuthApiSetAuthStateInput {
  const AuthApiSetAuthStateInput();
  Map<String, dynamic> toJson();
  static AuthApiSetAuthStateInput fromJson(Map<String, dynamic> json) {
    switch (json['action'] as String) {
      case 'signIn':
        return SignInInput.fromJson(json);
      case 'signInWithPasskey':
        return SignInWithPasskeyInput.fromJson(json);
      case 'signUp':
        return SignUpInput.fromJson(json);
      case 'confirmSignUp':
        return ConfirmSignUpInput.fromJson(json);
      case 'resendSignUpCode':
        return ResendSignUpCodeInput.fromJson(json);
      case 'signOut':
        return SignOutInput.fromJson(json);
      case 'resetPassword':
        return ResetPasswordInput.fromJson(json);
      case 'confirmResetPassword':
        return ConfirmResetPasswordInput.fromJson(json);
      case 'autoSignIn':
        return AutoSignInInput.fromJson(json);
      case 'confirmSignIn':
        return ConfirmSignInInput.fromJson(json);
      case 'startPasskeyRegistration':
        return StartPasskeyRegistrationInput.fromJson(json);
      case 'completePasskeyRegistration':
        return CompletePasskeyRegistrationInput.fromJson(json);
      case 'listPasskeys':
        return ListPasskeysInput.fromJson(json);
      case 'deletePasskey':
        return DeletePasskeyInput.fromJson(json);
      default:
        throw ArgumentError('Unknown action: ${json['action']}');
    }
  }
}

class SignInInput extends AuthApiSetAuthStateInput {
  final String username;
  final String password;

  const SignInInput({required this.username, required this.password});

  factory SignInInput.fromJson(Map<String, dynamic> json) {
    return SignInInput(
      username: json['username'] as String,
      password: json['password'] as String,
    );
  }

  @override
  Map<String, dynamic> toJson() {
    return {'action': 'signIn', 'username': username, 'password': password};
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is SignInInput &&
          username == other.username &&
          password == other.password;

  @override
  int get hashCode => Object.hash(username, password);

  @override
  String toString() => 'SignInInput(username: $username, password: $password)';
}

class SignInWithPasskeyInput extends AuthApiSetAuthStateInput {
  final String username;

  const SignInWithPasskeyInput({required this.username});

  factory SignInWithPasskeyInput.fromJson(Map<String, dynamic> json) {
    return SignInWithPasskeyInput(username: json['username'] as String);
  }

  @override
  Map<String, dynamic> toJson() {
    return {'action': 'signInWithPasskey', 'username': username};
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is SignInWithPasskeyInput && username == other.username;

  @override
  int get hashCode => username.hashCode;

  @override
  String toString() => 'SignInWithPasskeyInput(username: $username)';
}

class SignUpInput extends AuthApiSetAuthStateInput {
  final String username;
  final String password;

  const SignUpInput({required this.username, required this.password});

  factory SignUpInput.fromJson(Map<String, dynamic> json) {
    return SignUpInput(
      username: json['username'] as String,
      password: json['password'] as String,
    );
  }

  @override
  Map<String, dynamic> toJson() {
    return {'action': 'signUp', 'username': username, 'password': password};
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is SignUpInput &&
          username == other.username &&
          password == other.password;

  @override
  int get hashCode => Object.hash(username, password);

  @override
  String toString() => 'SignUpInput(username: $username, password: $password)';
}

class ConfirmSignUpInput extends AuthApiSetAuthStateInput {
  final String username;
  final String code;
  final String? password;

  const ConfirmSignUpInput({
    required this.username,
    required this.code,
    this.password,
  });

  factory ConfirmSignUpInput.fromJson(Map<String, dynamic> json) {
    return ConfirmSignUpInput(
      username: json['username'] as String,
      code: json['code'] as String,
      password: json['password'] as String?,
    );
  }

  @override
  Map<String, dynamic> toJson() {
    return {
      'action': 'confirmSignUp',
      'username': username,
      'code': code,
      if (password != null) 'password': password,
    };
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is ConfirmSignUpInput &&
          username == other.username &&
          code == other.code &&
          password == other.password;

  @override
  int get hashCode => Object.hash(username, code, password);

  @override
  String toString() =>
      'ConfirmSignUpInput(username: $username, code: $code, password: $password)';
}

class ResendSignUpCodeInput extends AuthApiSetAuthStateInput {
  final String username;

  const ResendSignUpCodeInput({required this.username});

  factory ResendSignUpCodeInput.fromJson(Map<String, dynamic> json) {
    return ResendSignUpCodeInput(username: json['username'] as String);
  }

  @override
  Map<String, dynamic> toJson() {
    return {'action': 'resendSignUpCode', 'username': username};
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is ResendSignUpCodeInput && username == other.username;

  @override
  int get hashCode => username.hashCode;

  @override
  String toString() => 'ResendSignUpCodeInput(username: $username)';
}

class SignOutInput extends AuthApiSetAuthStateInput {
  const SignOutInput();

  factory SignOutInput.fromJson(Map<String, dynamic> json) {
    return SignOutInput();
  }

  @override
  Map<String, dynamic> toJson() {
    return {'action': 'signOut'};
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) || other is SignOutInput;

  @override
  int get hashCode => runtimeType.hashCode;

  @override
  String toString() => 'SignOutInput()';
}

class ResetPasswordInput extends AuthApiSetAuthStateInput {
  final String username;

  const ResetPasswordInput({required this.username});

  factory ResetPasswordInput.fromJson(Map<String, dynamic> json) {
    return ResetPasswordInput(username: json['username'] as String);
  }

  @override
  Map<String, dynamic> toJson() {
    return {'action': 'resetPassword', 'username': username};
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is ResetPasswordInput && username == other.username;

  @override
  int get hashCode => username.hashCode;

  @override
  String toString() => 'ResetPasswordInput(username: $username)';
}

class ConfirmResetPasswordInput extends AuthApiSetAuthStateInput {
  final String username;
  final String code;
  final String newPassword;

  const ConfirmResetPasswordInput({
    required this.username,
    required this.code,
    required this.newPassword,
  });

  factory ConfirmResetPasswordInput.fromJson(Map<String, dynamic> json) {
    return ConfirmResetPasswordInput(
      username: json['username'] as String,
      code: json['code'] as String,
      newPassword: json['newPassword'] as String,
    );
  }

  @override
  Map<String, dynamic> toJson() {
    return {
      'action': 'confirmResetPassword',
      'username': username,
      'code': code,
      'newPassword': newPassword,
    };
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is ConfirmResetPasswordInput &&
          username == other.username &&
          code == other.code &&
          newPassword == other.newPassword;

  @override
  int get hashCode => Object.hash(username, code, newPassword);

  @override
  String toString() =>
      'ConfirmResetPasswordInput(username: $username, code: $code, newPassword: $newPassword)';
}

class AutoSignInInput extends AuthApiSetAuthStateInput {
  final String username;

  const AutoSignInInput({required this.username});

  factory AutoSignInInput.fromJson(Map<String, dynamic> json) {
    return AutoSignInInput(username: json['username'] as String);
  }

  @override
  Map<String, dynamic> toJson() {
    return {'action': 'autoSignIn', 'username': username};
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is AutoSignInInput && username == other.username;

  @override
  int get hashCode => username.hashCode;

  @override
  String toString() => 'AutoSignInInput(username: $username)';
}

class ConfirmSignInInput extends AuthApiSetAuthStateInput {
  final String session;
  final ConfirmSignInInputChallenge challenge;

  const ConfirmSignInInput({required this.session, required this.challenge});

  factory ConfirmSignInInput.fromJson(Map<String, dynamic> json) {
    return ConfirmSignInInput(
      session: json['session'] as String,
      challenge: ConfirmSignInInputChallenge.fromJson(json),
    );
  }

  @override
  Map<String, dynamic> toJson() {
    return {
      'action': 'confirmSignIn',
      'session': session,
      ...challenge.toJson(),
    };
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is ConfirmSignInInput &&
          session == other.session &&
          challenge == other.challenge;

  @override
  int get hashCode => Object.hash(session, challenge);

  @override
  String toString() =>
      'ConfirmSignInInput(session: $session, challenge: $challenge)';
}

class StartPasskeyRegistrationInput extends AuthApiSetAuthStateInput {
  const StartPasskeyRegistrationInput();

  factory StartPasskeyRegistrationInput.fromJson(Map<String, dynamic> json) {
    return StartPasskeyRegistrationInput();
  }

  @override
  Map<String, dynamic> toJson() {
    return {'action': 'startPasskeyRegistration'};
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) || other is StartPasskeyRegistrationInput;

  @override
  int get hashCode => runtimeType.hashCode;

  @override
  String toString() => 'StartPasskeyRegistrationInput()';
}

class CompletePasskeyRegistrationInput extends AuthApiSetAuthStateInput {
  final String credential;

  const CompletePasskeyRegistrationInput({required this.credential});

  factory CompletePasskeyRegistrationInput.fromJson(Map<String, dynamic> json) {
    return CompletePasskeyRegistrationInput(
      credential: json['credential'] as String,
    );
  }

  @override
  Map<String, dynamic> toJson() {
    return {'action': 'completePasskeyRegistration', 'credential': credential};
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is CompletePasskeyRegistrationInput &&
          credential == other.credential;

  @override
  int get hashCode => credential.hashCode;

  @override
  String toString() =>
      'CompletePasskeyRegistrationInput(credential: $credential)';
}

class ListPasskeysInput extends AuthApiSetAuthStateInput {
  const ListPasskeysInput();

  factory ListPasskeysInput.fromJson(Map<String, dynamic> json) {
    return ListPasskeysInput();
  }

  @override
  Map<String, dynamic> toJson() {
    return {'action': 'listPasskeys'};
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) || other is ListPasskeysInput;

  @override
  int get hashCode => runtimeType.hashCode;

  @override
  String toString() => 'ListPasskeysInput()';
}

class DeletePasskeyInput extends AuthApiSetAuthStateInput {
  final String credentialId;

  const DeletePasskeyInput({required this.credentialId});

  factory DeletePasskeyInput.fromJson(Map<String, dynamic> json) {
    return DeletePasskeyInput(credentialId: json['credentialId'] as String);
  }

  @override
  Map<String, dynamic> toJson() {
    return {'action': 'deletePasskey', 'credentialId': credentialId};
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is DeletePasskeyInput && credentialId == other.credentialId;

  @override
  int get hashCode => credentialId.hashCode;

  @override
  String toString() => 'DeletePasskeyInput(credentialId: $credentialId)';
}

class AuthApiApi {
  final BlocksClient _client;
  AuthApiApi(this._client);

  Future<AuthState> getAuthState() async {
    final result = await _client.call(
      'authApi.getAuthState',
      <String, dynamic>{},
    );
    return AuthState.fromJson(result as Map<String, dynamic>);
  }

  Future<AuthState> setAuthState({
    required AuthApiSetAuthStateInput input,
  }) async {
    final params = <String, dynamic>{'input': input.toJson()};
    final result = await _client.call('authApi.setAuthState', params);
    return AuthState.fromJson(result as Map<String, dynamic>);
  }
}

// --- Servers ---

class Servers {
  static const String local = 'http://localhost:3001/aws-blocks/api';
}

// --- Blocks Client ---

class Blocks {
  late final ApiApi api;
  late final AuthApiApi authApi;

  Blocks({String? baseUrl, SessionStore? sessionStore}) {
    final client = BlocksClient(
      baseUrl: baseUrl ?? Servers.local,
      sessionStore: sessionStore,
    );
    api = ApiApi(client);
    authApi = AuthApiApi(client);
  }
}
