import 'package:flutter/material.dart';

import '../../../domain/models.dart';
import '../../core/app_theme.dart';
import '../../core/widgets.dart';
import '../session/app_view_model.dart';
import 'game_view_model.dart';

class GameView extends StatefulWidget {
  const GameView({super.key, required this.appViewModel});

  final AppViewModel appViewModel;

  @override
  State<GameView> createState() => _GameViewState();
}

class _GameViewState extends State<GameView> {
  late final GameViewModel viewModel;

  @override
  void initState() {
    super.initState();
    viewModel = GameViewModel(
      widget.appViewModel.repository,
      gameId: widget.appViewModel.gameId!,
    )..start();
  }

  @override
  void dispose() {
    viewModel.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final character = widget.appViewModel.character!;
    return Scaffold(
      backgroundColor: Colors.transparent,
      body: Cabinet(
        onBack: widget.appViewModel.leaveGame,
        onRefresh: viewModel.refresh,
        heroAsset: character.asset,
        child: ListenableBuilder(
          listenable: viewModel,
          builder: (context, _) {
            final state = viewModel.state;
            if (state == null) {
              return Center(
                child: viewModel.error == null
                    ? const CircularProgressIndicator(color: AppColors.gold)
                    : ErrorText(viewModel.error),
              );
            }
            return Stack(
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    _StatusBar(viewModel: viewModel),
                    if (state.roomPhase == 'lobby') ...[
                      const SizedBox(height: 8),
                      _LobbyBar(viewModel: viewModel),
                    ],
                    if (viewModel.thinking != null) ...[
                      const SizedBox(height: 8),
                      _ThinkingBar(event: viewModel.thinking!),
                    ],
                    const SizedBox(height: 8),
                    Expanded(
                      child: LayoutBuilder(
                        builder: (context, constraints) {
                          if (constraints.maxWidth >= 1050 &&
                              constraints.maxHeight >= 620) {
                            return _DesktopTable(viewModel: viewModel);
                          }
                          return _CompactTable(viewModel: viewModel);
                        },
                      ),
                    ),
                  ],
                ),
                if (state.roomPhase == 'ended')
                  Positioned.fill(
                    child: _GameOver(onLeave: widget.appViewModel.leaveGame),
                  ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _StatusBar extends StatelessWidget {
  const _StatusBar({required this.viewModel});

  final GameViewModel viewModel;

  @override
  Widget build(BuildContext context) {
    final remaining = viewModel.remaining;
    final timer = remaining == null
        ? null
        : '${remaining.inMinutes}:${(remaining.inSeconds % 60).toString().padLeft(2, '0')}';
    final color = viewModel.isMyTurn ? const Color(0xFF39FF14) : AppColors.gold;
    return Container(
      constraints: const BoxConstraints(minHeight: 48),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: const Color(0xFF0F1120),
        border: Border.all(color: color, width: 2),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Row(
        children: [
          Icon(Icons.circle, size: 13, color: color),
          const SizedBox(width: 9),
          Expanded(
            child: Text(
              viewModel.status,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(color: color, fontWeight: FontWeight.bold),
            ),
          ),
          if (viewModel.error != null)
            Flexible(
              child: Text(
                viewModel.error!,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(color: AppColors.danger),
              ),
            ),
          if (timer != null) ...[
            const SizedBox(width: 8),
            Chip(
              avatar: const Icon(Icons.timer_outlined, size: 17),
              label: Text(timer),
              visualDensity: VisualDensity.compact,
              side: const BorderSide(color: AppColors.gold),
            ),
          ],
        ],
      ),
    );
  }
}

class _LobbyBar extends StatelessWidget {
  const _LobbyBar({required this.viewModel});

  final GameViewModel viewModel;

  @override
  Widget build(BuildContext context) {
    final state = viewModel.state!;
    final occupied = state.players
        .where((player) => player.seat != SeatKind.open)
        .length;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
      decoration: BoxDecoration(
        color: AppColors.panel,
        border: Border.all(color: const Color(0xFFFFAA00), width: 2),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text('$occupied/${state.players.length} seats filled'),
          ),
          if (state.isHost)
            FilledButton.icon(
              onPressed: viewModel.busy ? null : viewModel.startWithAi,
              icon: const Icon(Icons.smart_toy),
              label: const Text('START WITH AI'),
            ),
        ],
      ),
    );
  }
}

class _ThinkingBar extends StatelessWidget {
  const _ThinkingBar({required this.event});

  final ThinkingEvent event;

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(minHeight: 42),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: AppColors.panel,
        border: Border.all(color: AppColors.dm, width: 2),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Row(
        children: [
          const Icon(Icons.psychology, color: AppColors.dm),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              '${event.who} is thinking: ${event.text.isEmpty ? '...' : event.text}',
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }
}

class _DesktopTable extends StatelessWidget {
  const _DesktopTable({required this.viewModel});

  final GameViewModel viewModel;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SizedBox(width: 200, child: _TurnOrder(state: viewModel.state!)),
        const SizedBox(width: 10),
        Expanded(child: _Board(viewModel: viewModel)),
        const SizedBox(width: 10),
        SizedBox(
          width: 285,
          child: Column(
            children: [
              Expanded(child: _Chat(viewModel: viewModel)),
              const SizedBox(height: 10),
              SizedBox(
                height: 160,
                child: _DiceTray(roll: viewModel.state!.lastRoll),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _CompactTable extends StatelessWidget {
  const _CompactTable({required this.viewModel});

  final GameViewModel viewModel;

  // Smallest heights at which each panel is still usable, plus the gaps between
  // them. Above this total we lay the panels out to fill the window exactly;
  // below it we let the list scroll rather than squeeze them into nothing.
  static const double _turnOrder = 125;
  static const double _dice = 155;
  // The board's fixed furniture, independent of height: the DM badge (~42) and
  // the action panel (a 3-line narration, the status line, and a Wrap of action
  // buttons that becomes several rows at phone width). The token grid needs its
  // own room on top of this — a flat board minimum left the grid 0px at 390
  // wide, hiding the whole party with no error raised.
  static const double _boardFurniture = 405;
  static const double _minChat = 190;
  static const double _gaps = 30;

  double _minBoard(int playerCount) =>
      _boardFurniture + _Board.gridHeightFor(playerCount);

  double _minTotal(int playerCount) =>
      _turnOrder + _dice + _minBoard(playerCount) + _minChat + _gaps;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final turnOrder = SizedBox(
          height: _turnOrder,
          child: _TurnOrder(state: viewModel.state!, horizontal: true),
        );
        final board = _Board(viewModel: viewModel);
        final chat = _Chat(viewModel: viewModel);
        final dice = SizedBox(
          height: _dice,
          child: _DiceTray(roll: viewModel.state!.lastRoll),
        );

        if (fitsAvailableHeight(
          constraints.maxHeight,
          minimum: _minTotal(viewModel.state!.players.length),
        )) {
          // Enough room: give the board and the chat everything left over, so
          // the table fills the window and nothing sits off-screen.
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              turnOrder,
              const SizedBox(height: 10),
              Expanded(flex: 3, child: board),
              const SizedBox(height: 10),
              Expanded(flex: 2, child: chat),
              const SizedBox(height: 10),
              dice,
            ],
          );
        }

        // Too short to fit: scroll, but at the minimums rather than the much
        // taller fixed heights this used to force.
        return ListView(
          children: [
            turnOrder,
            const SizedBox(height: 10),
            // Intrinsic height: the board sizes to its own content, so the
            // grid always gets the room its party needs instead of trusting a
            // predicted constant that came up short at phone width.
            _Board(viewModel: viewModel, fillHeight: false),
            const SizedBox(height: 10),
            SizedBox(height: _minChat, child: chat),
            const SizedBox(height: 10),
            dice,
          ],
        );
      },
    );
  }
}

class _TurnOrder extends StatelessWidget {
  const _TurnOrder({required this.state, this.horizontal = false});

  final GameState state;
  final bool horizontal;

  @override
  Widget build(BuildContext context) {
    final children = [
      ...state.players.indexed.map(
        (entry) => _TurnChip(
          player: entry.$2,
          number: entry.$1 + 1,
          active: state.phase == 'player' && state.turnIndex == entry.$1,
          me: entry.$2.userId == state.viewerUserId,
          horizontal: horizontal,
        ),
      ),
      _DmChip(active: state.phase != 'player', horizontal: horizontal),
    ];
    return Panel(
      title: 'TURN ORDER',
      padding: const EdgeInsets.all(7),
      child: horizontal
          ? ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: children.length,
              separatorBuilder: (_, _) => const SizedBox(width: 7),
              itemBuilder: (_, index) => children[index],
            )
          : ListView.separated(
              itemCount: children.length,
              separatorBuilder: (_, _) => const SizedBox(height: 7),
              itemBuilder: (_, index) => children[index],
            ),
    );
  }
}

class _TurnChip extends StatelessWidget {
  const _TurnChip({
    required this.player,
    required this.number,
    required this.active,
    required this.me,
    required this.horizontal,
  });

  final Player player;
  final int number;
  final bool active;
  final bool me;
  final bool horizontal;

  @override
  Widget build(BuildContext context) {
    final color = Color(heroClasses[player.classKey]?.colorValue ?? 0xFF77729A);
    return Container(
      width: horizontal ? 145 : null,
      padding: const EdgeInsets.all(5),
      decoration: BoxDecoration(
        color: active ? const Color(0xFF0F1120) : Colors.transparent,
        border: Border.all(
          color: active ? color : Colors.transparent,
          width: 2,
        ),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(color: color, width: 2),
            ),
            child: player.seat == SeatKind.open
                ? const Icon(Icons.person_outline, color: AppColors.dim)
                : Image.asset(player.asset, filterQuality: FilterQuality.none),
          ),
          const SizedBox(width: 6),
          Expanded(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '$number: ${player.seat == SeatKind.open ? 'Open' : player.name}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(color: color, fontSize: 13),
                ),
                Text(
                  me
                      ? 'You'
                      : player.seat == SeatKind.ai
                      ? 'AI'
                      : heroClasses[player.classKey]?.name ?? '',
                  style: const TextStyle(color: AppColors.dim, fontSize: 11),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _DmChip extends StatelessWidget {
  const _DmChip({required this.active, required this.horizontal});

  final bool active;
  final bool horizontal;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: horizontal ? 115 : null,
      padding: const EdgeInsets.all(7),
      decoration: BoxDecoration(
        color: active ? const Color(0xFF0F1120) : Colors.transparent,
        border: Border.all(
          color: active ? AppColors.dm : Colors.transparent,
          width: 2,
        ),
        borderRadius: BorderRadius.circular(6),
      ),
      child: const Row(
        children: [
          CircleAvatar(
            radius: 19,
            backgroundColor: AppColors.panelRaised,
            child: Icon(Icons.auto_stories, color: AppColors.dm),
          ),
          SizedBox(width: 6),
          Expanded(
            child: Text('AI DM', style: TextStyle(color: AppColors.dm)),
          ),
        ],
      ),
    );
  }
}

class _Board extends StatelessWidget {
  const _Board({required this.viewModel, this.fillHeight = true});

  final GameViewModel viewModel;

  /// When false the board sizes itself to its content, giving the token grid
  /// exactly the room its party needs. Used on the scrolling path, so the
  /// board's height is never a predicted constant that can come up short.
  final bool fillHeight;

  static const int _columns = 2;
  static const double _tokenGap = 10;
  static const double _gridPadding = 10;
  // A token's own intrinsic height, from its parts: the avatar circle's
  // maxHeight, the name label (12px text + 2x2 padding + 2x1 border), the gap
  // under it, and the HP bar's minHeight. Sizing a tile below this overflows
  // the token's Column — measured at exactly 26px short when this was 92.
  static const double _avatarMax = 88;
  static const double _nameLabel = 23;
  static const double _underLabel = 2;
  static const double _hpBar = 5;
  static const double _minTokenHeight =
      _avatarMax + _nameLabel + _underLabel + _hpBar;

  /// Height the token grid needs to show [playerCount] tokens without hiding
  /// any, including the padding around it.
  static double gridHeightFor(int playerCount) {
    final rows = (playerCount / _columns).ceil();
    return rows * _minTokenHeight + (rows - 1) * _tokenGap + _gridPadding * 2;
  }

  Widget _gridRegion(GameState state) {
    final grid = Padding(
      padding: const EdgeInsets.all(_gridPadding),
      child: LayoutBuilder(
        builder: (context, box) {
          // Drive the tile shape from the height the grid actually has, never
          // from its width. A fixed childAspectRatio made tiles taller as the
          // board got wider, so a *bigger* window hid more of the party: at
          // 2560x1440 two rows wanted 1362px in a 1099px box. Tiles now divide
          // the available height, so every row is on screen at every size.
          final rows = (state.players.length / _columns).ceil();
          final tileWidth =
              (box.maxWidth - _tokenGap * (_columns - 1)) / _columns;
          final fitHeight = (box.maxHeight - _tokenGap * (rows - 1)) / rows;
          // Only fall back to scrolling when the box genuinely cannot show a
          // legible token, so the grid fills the space when the room is there
          // and stays reachable when it is not.
          final fits = fitHeight >= _minTokenHeight;
          final tileHeight = fits ? fitHeight : _minTokenHeight;
          return GridView.builder(
            physics: fits
                ? const NeverScrollableScrollPhysics()
                : const ClampingScrollPhysics(),
            itemCount: state.players.length,
            gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: _columns,
              childAspectRatio: tileWidth / tileHeight,
              crossAxisSpacing: _tokenGap,
              mainAxisSpacing: _tokenGap,
            ),
            itemBuilder: (context, index) => _Token(
              player: state.players[index],
              active: state.phase == 'player' && state.turnIndex == index,
            ),
          );
        },
      ),
    );
    return fillHeight
        ? Expanded(child: grid)
        : SizedBox(height: gridHeightFor(state.players.length), child: grid);
  }

  @override
  Widget build(BuildContext context) {
    final state = viewModel.state!;
    final fallbackActions =
        heroClasses[state.me?.classKey]?.actions ?? const ['Investigate'];
    final actions = state.options.isEmpty ? fallbackActions : state.options;
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF0A0D18),
        image: const DecorationImage(
          image: AssetImage('assets/ui/floor_tile.png'),
          repeat: ImageRepeat.repeat,
          opacity: 0.62,
        ),
        border: Border.all(color: const Color(0xFF0A0D18), width: 3),
        borderRadius: BorderRadius.circular(6),
        boxShadow: const [
          BoxShadow(color: Colors.black54, blurRadius: 18, spreadRadius: -4),
        ],
      ),
      child: Column(
        mainAxisSize: fillHeight ? MainAxisSize.max : MainAxisSize.min,
        children: [
          Container(
            margin: const EdgeInsets.only(top: 8),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
            decoration: BoxDecoration(
              color: AppColors.panel.withValues(alpha: 0.95),
              border: Border.all(color: AppColors.dm, width: 2),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Text(
              'AI DM: ${state.dmName}',
              style: const TextStyle(
                color: AppColors.dm,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
          _gridRegion(state),
          Container(
            margin: const EdgeInsets.fromLTRB(10, 0, 10, 10),
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: AppColors.panel.withValues(alpha: 0.95),
              border: Border.all(color: AppColors.panelLine, width: 2),
              borderRadius: BorderRadius.circular(6),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'DM ${state.dmName}: ${state.narration}',
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 8),
                Text(
                  viewModel.isMyTurn ? 'CHOOSE AN ACTION' : viewModel.status,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: viewModel.isMyTurn
                        ? const Color(0xFF39FF14)
                        : AppColors.meta,
                    fontWeight: FontWeight.bold,
                    fontSize: 12,
                  ),
                ),
                const SizedBox(height: 6),
                Wrap(
                  alignment: WrapAlignment.center,
                  spacing: 7,
                  runSpacing: 7,
                  children: actions
                      .map(
                        (action) => OutlinedButton(
                          onPressed: viewModel.isMyTurn && !viewModel.busy
                              ? () => viewModel.takeAction(action)
                              : null,
                          child: Text(action),
                        ),
                      )
                      .toList(),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Token extends StatelessWidget {
  const _Token({required this.player, required this.active});

  final Player player;
  final bool active;

  @override
  Widget build(BuildContext context) {
    final color = Color(heroClasses[player.classKey]?.colorValue ?? 0xFF77729A);
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            constraints: const BoxConstraints(maxWidth: 88, maxHeight: 88),
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: color.withValues(alpha: 0.18),
              border: Border.all(color: color, width: active ? 4 : 3),
              boxShadow: [
                BoxShadow(
                  color: color.withValues(alpha: active ? 0.75 : 0.35),
                  blurRadius: active ? 20 : 8,
                ),
              ],
            ),
            child: ClipOval(
              child: player.seat == SeatKind.open
                  ? const Padding(
                      padding: EdgeInsets.all(20),
                      child: Icon(Icons.person_outline, color: AppColors.dim),
                    )
                  : Image.asset(
                      player.asset,
                      filterQuality: FilterQuality.none,
                    ),
            ),
          ),
          Container(
            constraints: const BoxConstraints(minWidth: 80, maxWidth: 130),
            padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
            decoration: BoxDecoration(
              color: const Color(0xFF0A0D18),
              border: Border.all(color: color),
              borderRadius: BorderRadius.circular(4),
            ),
            child: Text(
              player.seat == SeatKind.open ? 'Open seat' : player.name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 12),
            ),
          ),
          const SizedBox(height: 2),
          SizedBox(
            width: 82,
            child: LinearProgressIndicator(
              value: (player.hp / 20).clamp(0, 1),
              color: AppColors.danger,
              backgroundColor: const Color(0xFF2A0D10),
              minHeight: 5,
            ),
          ),
        ],
      ),
    );
  }
}

class _Chat extends StatefulWidget {
  const _Chat({required this.viewModel});

  final GameViewModel viewModel;

  @override
  State<_Chat> createState() => _ChatState();
}

class _ChatState extends State<_Chat> {
  final controller = TextEditingController();

  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Panel(
      title: 'CHAT',
      padding: EdgeInsets.zero,
      child: Column(
        children: [
          Expanded(
            child: widget.viewModel.messages.isEmpty
                ? const EmptyState(
                    'No messages yet',
                    icon: Icons.forum_outlined,
                  )
                : ListView.builder(
                    reverse: true,
                    padding: const EdgeInsets.all(10),
                    itemCount: widget.viewModel.messages.length,
                    itemBuilder: (context, index) {
                      final message =
                          widget.viewModel.messages[widget
                                  .viewModel
                                  .messages
                                  .length -
                              1 -
                              index];
                      final color = message.kind == 'dm'
                          ? AppColors.dm
                          : message.kind == 'roll'
                          ? AppColors.goldBright
                          : AppColors.text;
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 7),
                        child: Text.rich(
                          TextSpan(
                            children: [
                              TextSpan(
                                text: '${message.who}: ',
                                style: TextStyle(
                                  color: color,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              TextSpan(text: message.text),
                            ],
                          ),
                          style: const TextStyle(fontSize: 13),
                        ),
                      );
                    },
                  ),
          ),
          Container(
            padding: const EdgeInsets.all(8),
            decoration: const BoxDecoration(
              border: Border(
                top: BorderSide(color: AppColors.panelLine, width: 2),
              ),
            ),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: controller,
                    decoration: const InputDecoration(
                      hintText: 'Say something...',
                      isDense: true,
                    ),
                    onSubmitted: (_) => send(),
                  ),
                ),
                const SizedBox(width: 6),
                IconButton.filled(
                  tooltip: 'Send message',
                  onPressed: send,
                  icon: const Icon(Icons.send),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  void send() {
    final text = controller.text;
    controller.clear();
    widget.viewModel.sendChat(text);
  }
}

class _DiceTray extends StatelessWidget {
  const _DiceTray({required this.roll});

  final DiceRoll? roll;

  @override
  Widget build(BuildContext context) {
    return Panel(
      title: 'DICE ROLL',
      child: Row(
        children: [
          Image.asset(
            roll?.asset ?? 'assets/sprites/dice/red_24.png',
            width: 78,
            height: 78,
            filterQuality: FilterQuality.none,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: roll == null
                ? const Text(
                    'Waiting for the first roll',
                    style: TextStyle(color: AppColors.dim),
                  )
                : Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(roll!.actor, overflow: TextOverflow.ellipsis),
                      Text(
                        roll!.action,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(color: AppColors.dim),
                      ),
                      Text(
                        '${roll!.success ? 'SUCCESS' : 'FAIL'} - ${roll!.value} vs DC ${roll!.dc}',
                        style: TextStyle(
                          color: roll!.success
                              ? const Color(0xFF39FF14)
                              : AppColors.danger,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
          ),
        ],
      ),
    );
  }
}

class _GameOver extends StatelessWidget {
  const _GameOver({required this.onLeave});

  final VoidCallback onLeave;

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: Colors.black.withValues(alpha: 0.75),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 430),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: WoodFrame(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Image.asset(
                    'assets/ui/crest.png',
                    height: 80,
                    filterQuality: FilterQuality.none,
                  ),
                  const SizedBox(height: 10),
                  Text(
                    'TIME\'S UP',
                    style: Theme.of(context).textTheme.headlineMedium,
                  ),
                  const SizedBox(height: 10),
                  const Text(
                    'The Dungeon Master closes the tome. This adventure is complete.',
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 16),
                  FilledButton.icon(
                    onPressed: onLeave,
                    icon: const Icon(Icons.home),
                    label: const Text('RETURN TO GUILD HALL'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
