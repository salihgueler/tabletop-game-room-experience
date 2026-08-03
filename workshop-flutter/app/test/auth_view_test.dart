import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tabletop_workshop/blocks.blocks.dart';
import 'package:tabletop_workshop/data/repositories/game_repository.dart';
import 'package:tabletop_workshop/data/services/blocks_game_service.dart';
import 'package:tabletop_workshop/ui/core/app_theme.dart';
import 'package:tabletop_workshop/ui/features/auth/auth_view.dart';
import 'package:tabletop_workshop/ui/features/session/app_view_model.dart';

void main() {
  testWidgets('auth form validates credentials before making a request', (
    tester,
  ) async {
    final repository = GameRepository(
      BlocksGameService(Blocks(baseUrl: 'http://localhost/unused')),
    );
    final viewModel = AppViewModel(repository);

    await tester.pumpWidget(
      MaterialApp(
        theme: buildTheme(),
        home: AuthView(viewModel: viewModel),
      ),
    );

    await tester.enterText(find.byKey(const Key('username-field')), 'ab');
    await tester.enterText(find.byKey(const Key('password-field')), 'short');
    await tester.tap(find.byKey(const Key('auth-submit')));
    await tester.pump();

    expect(find.text('Name must be at least 3 characters.'), findsOneWidget);
  });
}
