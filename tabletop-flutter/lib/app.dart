import 'package:flutter/material.dart';

import 'data/repositories/game_repository.dart';
import 'ui/core/app_theme.dart';
import 'ui/core/widgets.dart';
import 'ui/features/auth/auth_view.dart';
import 'ui/features/character/character_view.dart';
import 'ui/features/game/game_view.dart';
import 'ui/features/hall/hall_view.dart';
import 'ui/features/session/app_view_model.dart';

class TabletopApp extends StatefulWidget {
  const TabletopApp({super.key, required this.repository});

  final GameRepository repository;

  @override
  State<TabletopApp> createState() => _TabletopAppState();
}

class _TabletopAppState extends State<TabletopApp> {
  late final AppViewModel viewModel;

  @override
  void initState() {
    super.initState();
    viewModel = AppViewModel(widget.repository);
    viewModel.bootstrap();
  }

  @override
  void dispose() {
    viewModel.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Adventurer\'s Guild Hall',
      theme: buildTheme(),
      home: TavernBackground(
        child: ListenableBuilder(
          listenable: viewModel,
          builder: (context, _) => switch (viewModel.stage) {
            AppStage.loading => const _LoadingView(),
            AppStage.auth => AuthView(viewModel: viewModel),
            AppStage.character => CharacterView(viewModel: viewModel),
            AppStage.hall => HallView(
              key: const ValueKey('hall'),
              appViewModel: viewModel,
            ),
            AppStage.game => GameView(
              key: ValueKey(viewModel.gameId),
              appViewModel: viewModel,
            ),
          },
        ),
      ),
    );
  }
}

class _LoadingView extends StatelessWidget {
  const _LoadingView();

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      backgroundColor: Colors.transparent,
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Image(
              image: AssetImage('assets/ui/crest.png'),
              width: 88,
              filterQuality: FilterQuality.none,
            ),
            SizedBox(height: 16),
            CircularProgressIndicator(color: AppColors.gold),
            SizedBox(height: 12),
            Text('Loading the guild hall...'),
          ],
        ),
      ),
    );
  }
}
