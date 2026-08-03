import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tabletop_flutter/ui/core/app_theme.dart';
import 'package:tabletop_flutter/ui/core/widgets.dart';

void main() {
  testWidgets('panel provides a Material surface for ListTile ink', (
    tester,
  ) async {
    var value = true;

    await tester.pumpWidget(
      MaterialApp(
        theme: buildTheme(),
        home: Scaffold(
          body: SizedBox(
            height: 180,
            child: Panel(
              child: SwitchListTile(
                title: const Text('Open to public'),
                value: value,
                onChanged: (next) => value = next,
              ),
            ),
          ),
        ),
      ),
    );

    expect(tester.takeException(), isNull);
  });

  testWidgets('cabinet fits a narrow phone viewport', (tester) async {
    tester.view.physicalSize = const Size(390, 700);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      MaterialApp(
        theme: buildTheme(),
        home: const Scaffold(
          body: Cabinet(child: Center(child: Text('Guild content'))),
        ),
      ),
    );

    expect(tester.takeException(), isNull);
    expect(find.text('Guild content'), findsOneWidget);
  });
}
