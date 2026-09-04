import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../domain/models.dart';
import '../../core/app_theme.dart';
import '../../core/widgets.dart';
import '../session/app_view_model.dart';
import 'hall_view_model.dart';

class HallView extends StatefulWidget {
  const HallView({super.key, required this.appViewModel});

  final AppViewModel appViewModel;

  @override
  State<HallView> createState() => _HallViewState();
}

class _HallViewState extends State<HallView> {
  late final HallViewModel viewModel;
  final codeController = TextEditingController();

  @override
  void initState() {
    super.initState();
    viewModel = HallViewModel(widget.appViewModel.repository)..load();
  }

  @override
  void dispose() {
    codeController.dispose();
    viewModel.dispose();
    super.dispose();
  }

  Future<void> create() async {
    final result = await viewModel.create();
    if (!mounted || result == null) return;
    if (result.accessCode != null) {
      await showDialog<void>(
        context: context,
        builder: (context) => AlertDialog(
          backgroundColor: AppColors.panel,
          title: const Text('PRIVATE GAME READY'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('Share this access code with your party.'),
              const SizedBox(height: 14),
              SelectableText(
                result.accessCode!,
                style: const TextStyle(
                  color: AppColors.goldBright,
                  fontSize: 28,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ],
          ),
          actions: [
            IconButton(
              tooltip: 'Copy access code',
              onPressed: () =>
                  Clipboard.setData(ClipboardData(text: result.accessCode!)),
              icon: const Icon(Icons.copy),
            ),
            FilledButton(
              onPressed: () {
                Navigator.pop(context);
                widget.appViewModel.openGame(result.gameId);
              },
              child: const Text('ENTER GAME'),
            ),
          ],
        ),
      );
      return;
    }
    widget.appViewModel.openGame(result.gameId);
  }

  @override
  Widget build(BuildContext context) {
    final character = widget.appViewModel.character!;
    return Scaffold(
      backgroundColor: Colors.transparent,
      body: Cabinet(
        onBack: widget.appViewModel.signOut,
        onRefresh: viewModel.load,
        heroAsset: character.asset,
        child: ListenableBuilder(
          listenable: viewModel,
          builder: (context, _) => Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              SizedBox(
                height: 58,
                child: Image.asset(
                  'assets/ui/title_banner.png',
                  fit: BoxFit.contain,
                  filterQuality: FilterQuality.none,
                ),
              ),
              Text(
                '${character.name} - ${heroClasses[character.classKey]?.name ?? character.classKey}',
                textAlign: TextAlign.center,
                style: const TextStyle(color: AppColors.meta),
              ),
              ErrorText(viewModel.error),
              const SizedBox(height: 8),
              Expanded(
                child: LayoutBuilder(
                  builder: (context, constraints) {
                    if (constraints.maxWidth >= 840) {
                      return Row(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Expanded(
                            flex: 3,
                            child: _GameList(
                              viewModel: viewModel,
                              onOpen: widget.appViewModel.openGame,
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            flex: 2,
                            child: _CreateGame(
                              viewModel: viewModel,
                              codeController: codeController,
                              onCreate: create,
                              onOpen: widget.appViewModel.openGame,
                            ),
                          ),
                        ],
                      );
                    }
                    final gameList = _GameList(
                      viewModel: viewModel,
                      onOpen: widget.appViewModel.openGame,
                    );
                    final createGame = _CreateGame(
                      viewModel: viewModel,
                      codeController: codeController,
                      onCreate: create,
                      onOpen: widget.appViewModel.openGame,
                    );

                    if (fitsAvailableHeight(
                      constraints.maxHeight,
                      minimum: 620,
                    )) {
                      // Stack them but still fill the window, so neither panel
                      // ends up below the fold on a short screen.
                      return Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Expanded(flex: 3, child: gameList),
                          const SizedBox(height: 12),
                          Expanded(flex: 4, child: createGame),
                        ],
                      );
                    }

                    return ListView(
                      children: [
                        SizedBox(height: 300, child: gameList),
                        const SizedBox(height: 12),
                        SizedBox(
                          height: 420,
                          child: createGame,
                        ),
                      ],
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _GameList extends StatelessWidget {
  const _GameList({required this.viewModel, required this.onOpen});

  final HallViewModel viewModel;
  final ValueChanged<String> onOpen;

  @override
  Widget build(BuildContext context) {
    return Panel(
      title: 'PUBLIC GAME LIST',
      child: viewModel.loading && viewModel.games.isEmpty
          ? const Center(
              child: CircularProgressIndicator(color: AppColors.gold),
            )
          : viewModel.games.isEmpty
          ? const EmptyState('No public games yet. Launch a new adventure.')
          : ListView.separated(
              itemCount: viewModel.games.length,
              separatorBuilder: (_, _) => const SizedBox(height: 8),
              itemBuilder: (context, index) {
                final game = viewModel.games[index];
                return _GameCard(game: game, onOpen: () => onOpen(game.id));
              },
            ),
    );
  }
}

class _GameCard extends StatelessWidget {
  const _GameCard({required this.game, required this.onOpen});

  final GameSummary game;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final status = game.finished
        ? 'Finished'
        : game.full
        ? 'In session'
        : 'Awaiting players';
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.panelRaised,
        border: Border.all(color: AppColors.wood, width: 2),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  game.name,
                  style: const TextStyle(
                    color: AppColors.goldBright,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 4),
                Text(game.note, style: const TextStyle(color: AppColors.dim)),
                const SizedBox(height: 4),
                Text('${game.party}/${game.maxParty} seats - $status'),
                Text(
                  'AI DM: ${game.dmLevel}',
                  style: const TextStyle(color: AppColors.meta),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          FilledButton.icon(
            onPressed: game.finished ? null : onOpen,
            icon: Icon(game.full ? Icons.visibility : Icons.login),
            label: Text(game.full ? 'WATCH' : 'JOIN'),
          ),
        ],
      ),
    );
  }
}

class _CreateGame extends StatelessWidget {
  const _CreateGame({
    required this.viewModel,
    required this.codeController,
    required this.onCreate,
    required this.onOpen,
  });

  final HallViewModel viewModel;
  final TextEditingController codeController;
  final VoidCallback onCreate;
  final ValueChanged<String> onOpen;

  @override
  Widget build(BuildContext context) {
    return Panel(
      title: 'CREATE A NEW GAME',
      child: ListView(
        children: [
          DropdownButtonFormField<String>(
            initialValue: viewModel.scenario,
            decoration: const InputDecoration(labelText: 'Scenario theme'),
            items: scenarios
                .map(
                  (value) => DropdownMenuItem(value: value, child: Text(value)),
                )
                .toList(),
            onChanged: viewModel.setScenario,
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: viewModel.dmType,
            decoration: const InputDecoration(labelText: 'AI DM type'),
            items: dmTypes
                .map(
                  (value) => DropdownMenuItem(value: value, child: Text(value)),
                )
                .toList(),
            onChanged: viewModel.setDmType,
          ),
          const SizedBox(height: 10),
          SegmentedButton<bool>(
            segments: const [
              ButtonSegment(
                value: true,
                icon: Icon(Icons.smart_toy),
                label: Text('AI party'),
              ),
              ButtonSegment(
                value: false,
                icon: Icon(Icons.groups),
                label: Text('Humans'),
              ),
            ],
            selected: {viewModel.fillWithAi},
            onSelectionChanged: (values) =>
                viewModel.setFillWithAi(values.first),
          ),
          const SizedBox(height: 8),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Open to public'),
            value: viewModel.isPublic,
            onChanged: viewModel.setPublic,
          ),
          FilledButton.icon(
            onPressed: viewModel.loading ? null : onCreate,
            icon: const Icon(Icons.local_fire_department),
            label: Text(
              viewModel.loading ? 'LAUNCHING...' : 'LAUNCH ADVENTURE',
            ),
          ),
          const SizedBox(height: 18),
          const Divider(color: AppColors.panelLine),
          const SizedBox(height: 8),
          TextField(
            controller: codeController,
            textCapitalization: TextCapitalization.characters,
            decoration: InputDecoration(
              labelText: 'Private access code',
              suffixIcon: IconButton(
                tooltip: 'Join private game',
                icon: const Icon(Icons.arrow_forward),
                onPressed: () async {
                  final id = await viewModel.joinPrivate(codeController.text);
                  if (id != null) onOpen(id);
                },
              ),
            ),
          ),
          const SizedBox(height: 18),
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              Image.asset(
                'assets/sprites/dice/red_24.png',
                height: 42,
                filterQuality: FilterQuality.none,
              ),
              Image.asset(
                'assets/sprites/dice/blue_20.png',
                height: 52,
                filterQuality: FilterQuality.none,
              ),
              Image.asset(
                'assets/sprites/dice/blue_08.png',
                height: 62,
                filterQuality: FilterQuality.none,
              ),
            ],
          ),
        ],
      ),
    );
  }
}
