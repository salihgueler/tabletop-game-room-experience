import 'package:flutter/material.dart';

abstract final class AppColors {
  static const background = Color(0xFF12091F);
  static const purple = Color(0xFF28143F);
  static const panel = Color(0xFF1A1C2E);
  static const panelRaised = Color(0xFF232640);
  static const panelLine = Color(0xFF3A3D63);
  static const wood = Color(0xFF8B5A2B);
  static const woodDark = Color(0xFF3D2510);
  static const woodLight = Color(0xFFA9743D);
  static const gold = Color(0xFFDFA13B);
  static const goldBright = Color(0xFFFFD479);
  static const text = Color(0xFFF4EEDB);
  static const meta = Color(0xFFA29BFE);
  static const dim = Color(0xFF77729A);
  static const danger = Color(0xFFFF6B6B);
  static const dm = Color(0xFF9D4EDD);
}

ThemeData buildTheme() {
  final scheme = ColorScheme.fromSeed(
    seedColor: AppColors.gold,
    brightness: Brightness.dark,
    surface: AppColors.panel,
  );
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: AppColors.background,
    fontFamily: 'monospace',
    textTheme: const TextTheme(
      headlineMedium: TextStyle(
        color: AppColors.goldBright,
        fontWeight: FontWeight.w900,
        letterSpacing: 0,
      ),
      titleMedium: TextStyle(
        color: AppColors.goldBright,
        fontWeight: FontWeight.w800,
        letterSpacing: 0,
      ),
      bodyLarge: TextStyle(color: AppColors.text, letterSpacing: 0),
      bodyMedium: TextStyle(color: AppColors.text, letterSpacing: 0),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: const Color(0xFF0F1120),
      labelStyle: const TextStyle(color: AppColors.meta),
      hintStyle: const TextStyle(color: AppColors.dim),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(4),
        borderSide: const BorderSide(color: AppColors.panelLine, width: 2),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(4),
        borderSide: const BorderSide(color: AppColors.panelLine, width: 2),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(4),
        borderSide: const BorderSide(color: AppColors.gold, width: 2),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(5)),
        backgroundColor: const Color(0xFFFF8A00),
        foregroundColor: Colors.white,
        minimumSize: const Size(48, 46),
        textStyle: const TextStyle(
          fontWeight: FontWeight.w900,
          letterSpacing: 0,
        ),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(5)),
        side: const BorderSide(color: AppColors.panelLine, width: 2),
        foregroundColor: AppColors.text,
        minimumSize: const Size(48, 42),
      ),
    ),
    tooltipTheme: const TooltipThemeData(
      waitDuration: Duration(milliseconds: 350),
    ),
  );
}
