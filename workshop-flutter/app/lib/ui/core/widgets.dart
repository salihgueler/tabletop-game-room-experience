import 'package:flutter/material.dart';

import 'app_theme.dart';

class TavernBackground extends StatelessWidget {
  const TavernBackground({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: const BoxDecoration(
        color: AppColors.background,
        image: DecorationImage(
          image: AssetImage('assets/ui/background.png'),
          fit: BoxFit.cover,
          opacity: 0.25,
        ),
      ),
      child: child,
    );
  }
}

class WoodFrame extends StatelessWidget {
  const WoodFrame({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(12),
  });

  final Widget child;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: padding,
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [AppColors.woodLight, AppColors.wood, AppColors.woodDark],
        ),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: const Color(0xFF2A1806), width: 3),
        boxShadow: const [
          BoxShadow(
            color: Colors.black54,
            blurRadius: 22,
            offset: Offset(0, 10),
          ),
        ],
      ),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppColors.purple.withValues(alpha: 0.96),
          borderRadius: BorderRadius.circular(6),
          border: Border.all(color: AppColors.gold, width: 2),
        ),
        child: child,
      ),
    );
  }
}

class Cabinet extends StatelessWidget {
  const Cabinet({
    super.key,
    required this.child,
    this.onBack,
    this.onRefresh,
    this.heroAsset,
  });

  final Widget child;
  final VoidCallback? onBack;
  final VoidCallback? onRefresh;
  final String? heroAsset;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: LayoutBuilder(
        builder: (context, constraints) {
          if (constraints.maxWidth < 700) {
            return Padding(
              padding: const EdgeInsets.all(6),
              child: Column(
                children: [
                  SizedBox(
                    height: 46,
                    child: Row(
                      children: [
                        _RailButton(
                          icon: Icons.logout,
                          tooltip: 'Leave',
                          onPressed: onBack,
                        ),
                        const Spacer(),
                        if (heroAsset != null)
                          _HeroBadge(heroAsset: heroAsset!),
                        const SizedBox(width: 8),
                        _RailButton(
                          icon: Icons.refresh,
                          tooltip: 'Refresh',
                          onPressed: onRefresh,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 6),
                  Expanded(
                    child: WoodFrame(
                      padding: const EdgeInsets.all(8),
                      child: child,
                    ),
                  ),
                ],
              ),
            );
          }
          return Padding(
            padding: const EdgeInsets.all(8),
            child: Row(
              children: [
                _RailButton(
                  icon: Icons.logout,
                  tooltip: 'Leave',
                  onPressed: onBack,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: WoodFrame(
                    padding: const EdgeInsets.all(14),
                    child: child,
                  ),
                ),
                const SizedBox(width: 8),
                Column(
                  children: [
                    if (heroAsset != null) _HeroBadge(heroAsset: heroAsset!),
                    const SizedBox(height: 8),
                    _RailButton(
                      icon: Icons.refresh,
                      tooltip: 'Refresh',
                      onPressed: onRefresh,
                    ),
                  ],
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _HeroBadge extends StatelessWidget {
  const _HeroBadge({required this.heroAsset});

  final String heroAsset;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 46,
      height: 46,
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: AppColors.panel,
        border: Border.all(color: AppColors.gold, width: 2),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Image.asset(heroAsset, filterQuality: FilterQuality.none),
    );
  }
}

class _RailButton extends StatelessWidget {
  const _RailButton({
    required this.icon,
    required this.tooltip,
    required this.onPressed,
  });

  final IconData icon;
  final String tooltip;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return IconButton(
      tooltip: tooltip,
      onPressed: onPressed,
      icon: Icon(icon),
      color: AppColors.goldBright,
      style: IconButton.styleFrom(
        fixedSize: const Size(46, 46),
        backgroundColor: AppColors.wood,
        side: const BorderSide(color: AppColors.woodDark, width: 2),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
      ),
    );
  }
}

class Panel extends StatelessWidget {
  const Panel({
    super.key,
    this.title,
    required this.child,
    this.padding = const EdgeInsets.all(12),
  });

  final String? title;
  final Widget child;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.panel,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
        side: const BorderSide(color: AppColors.panelLine, width: 2),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (title != null)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 9),
              decoration: const BoxDecoration(
                border: Border(
                  bottom: BorderSide(color: AppColors.panelLine, width: 2),
                ),
              ),
              child: Text(
                title!,
                textAlign: TextAlign.center,
                style: Theme.of(
                  context,
                ).textTheme.titleMedium?.copyWith(fontSize: 13),
              ),
            ),
          Expanded(
            child: Padding(padding: padding, child: child),
          ),
        ],
      ),
    );
  }
}

class ErrorText extends StatelessWidget {
  const ErrorText(this.message, {super.key});

  final String? message;

  @override
  Widget build(BuildContext context) {
    if (message == null || message!.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Text(
        message!,
        style: const TextStyle(color: AppColors.danger),
        textAlign: TextAlign.center,
      ),
    );
  }
}

class EmptyState extends StatelessWidget {
  const EmptyState(this.message, {super.key, this.icon = Icons.auto_stories});

  final String message;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 34, color: AppColors.dim),
          const SizedBox(height: 8),
          Text(
            message,
            textAlign: TextAlign.center,
            style: const TextStyle(color: AppColors.dim),
          ),
        ],
      ),
    );
  }
}
