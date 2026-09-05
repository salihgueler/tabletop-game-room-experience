import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tabletop_flutter/blocks.blocks.dart';
import 'package:tabletop_flutter/data/repositories/game_repository.dart';
import 'package:tabletop_flutter/data/services/blocks_game_service.dart';
import 'package:tabletop_flutter/domain/models.dart';
import 'package:tabletop_flutter/ui/core/app_theme.dart';
import 'package:tabletop_flutter/ui/core/widgets.dart';
import 'package:tabletop_flutter/ui/features/character/character_view.dart';
import 'package:tabletop_flutter/ui/features/game/game_view.dart';
import 'package:tabletop_flutter/ui/features/hall/hall_view.dart';
import 'package:tabletop_flutter/ui/features/session/app_view_model.dart';

/// The screens used to hard-code panel heights (the game table alone summed to
/// ~1290px), so content sat outside the window at sizes that had plenty of room.
/// A Flutter overflow is a thrown exception in tests, so pumping each view
/// across a spread of viewports and asserting nothing throws is what holds the
/// fix in place.
///
/// Overflow exceptions are only half the story, though. A scroll view whose
/// content exceeds its box does NOT throw — it silently clips. The board's
/// token grid is a GridView with NeverScrollableScrollPhysics, so a party of
/// four went off-screen at every single viewport while this file reported all
/// green. [_expectNothingHidden] is the assertion that actually catches it.
const _viewports = <Size>[
  Size(390, 700), // phone portrait
  Size(430, 930), // large phone
  Size(768, 1024), // tablet portrait
  Size(1024, 768), // tablet landscape — short
  Size(1280, 720), // laptop — short, below the desktop-table height gate
  Size(1440, 900), // laptop
  Size(1920, 1080), // desktop
  Size(2560, 1440), // large desktop
  Size(1180, 620), // exactly on the desktop-table gate
  Size(900, 500), // small window, genuinely too short to fit
];

void main() {
  group('views fit their viewport without overflowing', () {
    for (final size in _viewports) {
      final label = '${size.width.toInt()}x${size.height.toInt()}';

      testWidgets('game view at $label', (tester) async {
        await _pumpAt(tester, size, (vm) => GameView(appViewModel: vm));
        expect(tester.takeException(), isNull);
        _expectNothingHidden(tester, label);
      });

      testWidgets('hall view at $label', (tester) async {
        await _pumpAt(tester, size, (vm) => HallView(appViewModel: vm));
        expect(tester.takeException(), isNull);
        _expectNothingHidden(tester, label);
      });

      testWidgets('character view at $label', (tester) async {
        await _pumpAt(tester, size, (vm) => CharacterView(viewModel: vm));
        expect(tester.takeException(), isNull);
        _expectNothingHidden(tester, label);
      });
    }
  });

  test('fitsAvailableHeight rejects the unbounded case', () {
    // A ListView / SingleChildScrollView child is handed infinity; treating that
    // as "plenty of room" is the trap that produced the original bug.
    expect(fitsAvailableHeight(double.infinity, minimum: 400), isFalse);
    expect(fitsAvailableHeight(399, minimum: 400), isFalse);
    expect(fitsAvailableHeight(400, minimum: 400), isTrue);
  });
}

/// Fails when a scroll view that the user cannot scroll is hiding content.
///
/// A GridView or ListView with [NeverScrollableScrollPhysics] clips silently
/// rather than throwing, so `takeException()` cannot see it. Any such view with
/// a non-zero maxScrollExtent has content off-screen that no gesture can reach.
void _expectNothingHidden(WidgetTester tester, String label) {
  for (final element in find.byType(Scrollable).evaluate()) {
    final state = (element as StatefulElement).state as ScrollableState;
    final scrollable = element.widget as Scrollable;
    if (scrollable.physics is! NeverScrollableScrollPhysics) continue;
    if (!state.position.hasContentDimensions) continue;
    expect(
      state.position.maxScrollExtent,
      lessThan(0.5),
      reason:
          'at $label a non-scrollable ${scrollable.axis.name} view hides '
          '${state.position.maxScrollExtent.toStringAsFixed(1)}px of content '
          'that the user cannot scroll to',
    );
  }
}

Future<void> _pumpAt(
  WidgetTester tester,
  Size size,
  Widget Function(AppViewModel) build,
) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);

  final viewModel = AppViewModel(_StubRepository());
  addTearDown(viewModel.dispose);
  viewModel.gameId = 'game-1';
  viewModel.character = const Character(
    userId: 'user-1',
    name: 'Aldric',
    classKey: 'paladin',
    spriteId: 'paladin_a',
    sprite: '/sprites/characters/paladin_a.png',
  );

  await tester.pumpWidget(
    MaterialApp(
      theme: buildTheme(),
      home: TavernBackground(child: build(viewModel)),
    ),
  );
  await tester.pump(const Duration(milliseconds: 50));
}

/// Enough of a repository to render each view with a full party and a chat log,
/// so the panels carry realistic content rather than collapsing to nothing.
class _StubRepository extends GameRepository {
  _StubRepository()
    : super(BlocksGameService(Blocks(baseUrl: 'http://localhost/unused')));

  @override
  Future<void> joinGame(String gameId) async {}

  @override
  Future<GameState> getState(String gameId) async => const GameState(
    viewerUserId: 'user-1',
    spectator: false,
    gameId: 'game-1',
    scenario: 'Cave Crypt',
    dmName: 'Grimjaw',
    players: [
      Player(
        id: 'p1',
        name: 'Aldric',
        classKey: 'paladin',
        sprite: '/sprites/characters/paladin_a.png',
        seat: SeatKind.human,
        userId: 'user-1',
        hp: 20,
        slot: 0,
      ),
      Player(
        id: 'p2',
        name: 'Mira',
        classKey: 'rogue',
        sprite: '/sprites/characters/rogue_a.png',
        seat: SeatKind.ai,
        userId: null,
        hp: 18,
        slot: 1,
      ),
      Player(
        id: 'p3',
        name: 'Thorn',
        classKey: 'ranger',
        sprite: '/sprites/characters/ranger_a.png',
        seat: SeatKind.ai,
        userId: null,
        hp: 17,
        slot: 2,
      ),
      Player(
        id: 'p4',
        name: 'Zara',
        classKey: 'sorcerer',
        sprite: '/sprites/characters/sorcerer_a.png',
        seat: SeatKind.ai,
        userId: null,
        hp: 15,
        slot: 3,
      ),
    ],
    roomPhase: 'live',
    endsAt: null,
    turnIndex: 0,
    phase: 'player',
    lastRoll: null,
    log: [
      LogEntry(kind: 'dm', who: 'DM', text: 'A stone door stands before you.'),
      LogEntry(kind: 'action', who: 'Aldric', text: 'Aldric investigates.'),
      LogEntry(kind: 'roll', who: 'Aldric', text: 'rolled 16 vs DC 12'),
    ],
    options: ['Investigate', 'Attack', 'Defend Ally', 'Cast Bless'],
    version: 1,
  );

  @override
  Future<List<ChatMessage>> getChat(String gameId) async => const [
    ChatMessage(
      timestamp: 1,
      who: 'DM',
      text: 'A stone door stands before you, carved with runes.',
      kind: 'dm',
    ),
    ChatMessage(
      timestamp: 2,
      who: 'Aldric',
      text: 'I search for a hidden catch.',
      kind: 'say',
    ),
  ];

  @override
  Future<List<GameSummary>> listGames() async => const [
    GameSummary(
      id: 'game-1',
      name: "Aldric's Cave Crypt Run",
      note: 'A Cave Crypt adventure',
      dmLevel: 'intermediate',
      party: 4,
      maxParty: 4,
      finished: false,
      full: true,
      partyClasses: ['paladin', 'rogue', 'ranger', 'sorcerer'],
    ),
  ];

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
