class AppUser {
  const AppUser({required this.id, required this.username});

  final String id;
  final String username;
}

class HeroClass {
  const HeroClass({
    required this.key,
    required this.name,
    required this.colorValue,
    required this.blurb,
    required this.actions,
    required this.abilities,
  });

  final String key;
  final String name;
  final int colorValue;
  final String blurb;
  final List<String> actions;
  final List<String> abilities;
}

const heroClasses = <String, HeroClass>{
  'paladin': HeroClass(
    key: 'paladin',
    name: 'Paladin',
    colorValue: 0xFF00F0FF,
    blurb: 'Holy warrior. High defense, protects the party.',
    actions: ['Attack', 'Defend Ally', 'Cast Bless', 'Investigate'],
    abilities: ['SWORD', 'SHIELD'],
  ),
  'sorcerer': HeroClass(
    key: 'sorcerer',
    name: 'Sorcerer',
    colorValue: 0xFFBD00FF,
    blurb: 'Arcane spellcaster. Devastating magic, fragile body.',
    actions: ['Cast Firebolt', 'Detect Magic', 'Cast Shield', 'Investigate'],
    abilities: ['FIRE', 'SPARK'],
  ),
  'rogue': HeroClass(
    key: 'rogue',
    name: 'Rogue',
    colorValue: 0xFF39FF14,
    blurb: 'Shadow and steel. Stealth, traps, and sneak attacks.',
    actions: ['Sneak Attack', 'Disarm Trap', 'Pick Lock', 'Investigate'],
    abilities: ['BLADE', 'AIM'],
  ),
  'ranger': HeroClass(
    key: 'ranger',
    name: 'Ranger',
    colorValue: 0xFFFFAA00,
    blurb: 'Wilderness hunter. Ranged precision and tracking.',
    actions: ['Fire Arrow', 'Track', 'Cast Hunter\'s Mark', 'Investigate'],
    abilities: ['BOW', 'TRACK'],
  ),
  'ai': HeroClass(
    key: 'ai',
    name: 'Revenant',
    colorValue: 0xFF9D4EDD,
    blurb: 'Spectral wanderer wreathed in ghost flame.',
    actions: ['Spectral Strike', 'Haunt', 'Phase', 'Investigate'],
    abilities: ['SKULL', 'ORB'],
  ),
};

const scenarios = [
  'Cave Crypt',
  'Dungeon Crawl',
  'Magic Tower',
  'Frozen Keep',
  'Sunken Vault',
];

const dmTypes = ['Grimjaw', 'Xandros', 'Mistweaver', 'Hollowvoice'];

class HeroChoice {
  const HeroChoice({
    required this.id,
    required this.classKey,
    required this.label,
  });

  final String id;
  final String classKey;
  final String label;

  String get asset => 'assets/sprites/characters/$id.png';
  String get backendPath => '/sprites/characters/$id.png';
}

final heroChoices = heroClasses.entries
    .expand(
      (entry) => List.generate(4, (index) {
        final suffix = String.fromCharCode(97 + index);
        return HeroChoice(
          id: '${entry.key}_$suffix',
          classKey: entry.key,
          label: '${entry.value.name} ${suffix.toUpperCase()}',
        );
      }),
    )
    .toList(growable: false);

class Character {
  const Character({
    required this.userId,
    required this.name,
    required this.classKey,
    required this.spriteId,
    required this.sprite,
  });

  final String userId;
  final String name;
  final String classKey;
  final String spriteId;
  final String sprite;

  String get asset => assetPath(sprite);
}

class GameSummary {
  const GameSummary({
    required this.id,
    required this.name,
    required this.note,
    required this.dmLevel,
    required this.party,
    required this.maxParty,
    required this.finished,
    required this.full,
    required this.partyClasses,
  });

  final String id;
  final String name;
  final String note;
  final String dmLevel;
  final int party;
  final int maxParty;
  final bool finished;
  final bool full;
  final List<String> partyClasses;
}

class CreatedGame {
  const CreatedGame({required this.gameId, this.accessCode});

  final String gameId;
  final String? accessCode;
}

enum SeatKind { human, ai, open }

class Player {
  const Player({
    required this.id,
    required this.name,
    required this.classKey,
    required this.sprite,
    required this.seat,
    required this.userId,
    required this.hp,
    required this.slot,
  });

  final String id;
  final String name;
  final String classKey;
  final String sprite;
  final SeatKind seat;
  final String? userId;
  final int hp;
  final int slot;

  String get asset => assetPath(sprite);
}

class DiceRoll {
  const DiceRoll({
    required this.value,
    required this.sprite,
    required this.color,
    required this.dc,
    required this.success,
    required this.actor,
    required this.action,
  });

  final int value;
  final int sprite;
  final String color;
  final int dc;
  final bool success;
  final String actor;
  final String action;

  String get asset =>
      'assets/sprites/dice/${color}_${sprite.toString().padLeft(2, '0')}.png';
}

class LogEntry {
  const LogEntry({required this.kind, required this.who, required this.text});

  final String kind;
  final String who;
  final String text;
}

class GameState {
  const GameState({
    required this.viewerUserId,
    required this.spectator,
    required this.gameId,
    required this.scenario,
    required this.dmName,
    required this.players,
    required this.roomPhase,
    required this.endsAt,
    required this.turnIndex,
    required this.phase,
    required this.lastRoll,
    required this.log,
    required this.options,
    required this.version,
  });

  final String viewerUserId;
  final bool spectator;
  final String gameId;
  final String scenario;
  final String dmName;
  final List<Player> players;
  final String roomPhase;
  final DateTime? endsAt;
  final int turnIndex;
  final String phase;
  final DiceRoll? lastRoll;
  final List<LogEntry> log;
  final List<String> options;
  final int version;

  Player? get current =>
      turnIndex >= 0 && turnIndex < players.length ? players[turnIndex] : null;
  Player? get me =>
      players.where((player) => player.userId == viewerUserId).firstOrNull;
  bool get isHost => players.isNotEmpty && players.first.userId == viewerUserId;
  String get narration =>
      log.where((entry) => entry.kind == 'dm').lastOrNull?.text ??
      'The Dungeon Master opens the tome...';
}

class ChatMessage {
  const ChatMessage({
    required this.timestamp,
    required this.who,
    required this.text,
    required this.kind,
  });

  final int timestamp;
  final String who;
  final String text;
  final String kind;
}

class ThinkingEvent {
  const ThinkingEvent({
    required this.who,
    required this.phase,
    required this.text,
  });

  final String who;
  final String phase;
  final String text;
}

String assetPath(String backendPath) {
  final clean = backendPath.startsWith('/')
      ? backendPath.substring(1)
      : backendPath;
  return 'assets/$clean';
}

extension FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
  T? get lastOrNull => isEmpty ? null : last;
}
