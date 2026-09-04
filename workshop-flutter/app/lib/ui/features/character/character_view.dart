import 'package:flutter/material.dart';

import '../../../domain/models.dart';
import '../../core/app_theme.dart';
import '../../core/widgets.dart';
import '../session/app_view_model.dart';

class CharacterView extends StatefulWidget {
  const CharacterView({super.key, required this.viewModel});

  final AppViewModel viewModel;

  @override
  State<CharacterView> createState() => _CharacterViewState();
}

class _CharacterViewState extends State<CharacterView> {
  late final TextEditingController nameController;
  HeroChoice? selected;
  bool busy = false;

  @override
  void initState() {
    super.initState();
    nameController = TextEditingController(
      text: widget.viewModel.user?.username ?? '',
    );
  }

  @override
  void dispose() {
    nameController.dispose();
    super.dispose();
  }

  Future<void> save() async {
    if (selected == null || nameController.text.trim().length < 2) return;
    setState(() => busy = true);
    await widget.viewModel.chooseCharacter(
      nameController.text.trim(),
      selected!,
    );
    if (mounted) setState(() => busy = false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.transparent,
      // LayoutBuilder OUTSIDE the scroll view: a SingleChildScrollView gives its
      // child unbounded height, so anything inside it can never size itself to
      // the window. Measuring here is what lets the card fill the viewport.
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, viewport) {
            // Room left for the card once the heading block and padding are paid
            // for. Below the floor the page scrolls instead of crushing it.
            const chrome = 32.0 + 24.0 + 6.0 + 20.0 + 16.0;
            final forCard = viewport.maxHeight - chrome;
            // 470 is the card's own content floor in the side-by-side layout
            // (measured: it overflows by 16px at 430). Above it the card fills
            // the window; below it the page scrolls at this height.
            const cardFloor = 470.0;
            final fits = fitsAvailableHeight(forCard, minimum: cardFloor);

            final card = WoodFrame(
              child: LayoutBuilder(
                builder: (context, constraints) {
                  final preview = _Preview(
                    controller: nameController,
                    selected: selected,
                    busy: busy,
                    error: widget.viewModel.error,
                    onSave: save,
                  );
                  final picker = _Picker(
                    selected: selected,
                    onSelected: (value) => setState(() => selected = value),
                  );
                  if (constraints.maxWidth >= 720) {
                    return Row(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        SizedBox(width: 250, child: preview),
                        const SizedBox(width: 14),
                        Expanded(child: picker),
                      ],
                    );
                  }
                  return Column(
                    children: [
                      preview,
                      const SizedBox(height: 14),
                      // Fill what is left when the height is known; fall back to
                      // a usable minimum when this sits inside a scroll view.
                      if (constraints.maxHeight.isFinite)
                        Expanded(child: picker)
                      else
                        SizedBox(height: 430, child: picker),
                    ],
                  );
                },
              ),
            );

            final content = Column(
              children: [
                Text(
                  'ADVENTURER\'S GUILD HALL',
                  textAlign: TextAlign.center,
                  style: Theme.of(
                    context,
                  ).textTheme.headlineMedium?.copyWith(fontSize: 24),
                ),
                const SizedBox(height: 6),
                const Text(
                  'Forge your hero and take a seat at the table.',
                  style: TextStyle(color: AppColors.meta),
                ),
                const SizedBox(height: 16),
                if (fits)
                  Expanded(child: card)
                else
                  // Bounded, not just a minimum: inside a scroll view the height
                  // is unbounded, and the card's Row stretches its children, so
                  // an unbounded box would force an infinite height.
                  SizedBox(height: cardFloor, child: card),
              ],
            );

            final bounded = Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 980),
                child: content,
              ),
            );

            // Only introduce a scroll view when the window genuinely cannot hold
            // the card, so the common case fits exactly and never scrolls.
            return Padding(
              padding: const EdgeInsets.all(16),
              child: fits
                  ? bounded
                  : SingleChildScrollView(child: bounded),
            );
          },
        ),
      ),
    );
  }
}

class _Preview extends StatelessWidget {
  const _Preview({
    required this.controller,
    required this.selected,
    required this.busy,
    required this.error,
    required this.onSave,
  });

  final TextEditingController controller;
  final HeroChoice? selected;
  final bool busy;
  final String? error;
  final VoidCallback onSave;

  @override
  Widget build(BuildContext context) {
    final heroClass = selected == null ? null : heroClasses[selected!.classKey];
    final color = Color(
      heroClass?.colorValue ?? AppColors.panelLine.toARGB32(),
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: controller,
          maxLength: 18,
          decoration: const InputDecoration(
            labelText: 'Adventurer name',
            counterText: '',
          ),
        ),
        const SizedBox(height: 12),
        Container(
          height: 260,
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: AppColors.panel,
            border: Border.all(color: color, width: 2),
            borderRadius: BorderRadius.circular(6),
          ),
          child: selected == null
              ? const EmptyState(
                  'Choose a character',
                  icon: Icons.person_search,
                )
              : Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Image.asset(
                      selected!.asset,
                      height: 118,
                      filterQuality: FilterQuality.none,
                    ),
                    const SizedBox(height: 10),
                    Text(
                      selected!.label,
                      style: TextStyle(
                        color: color,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      heroClass!.blurb,
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: AppColors.meta),
                    ),
                  ],
                ),
        ),
        ErrorText(error),
        const SizedBox(height: 8),
        FilledButton.icon(
          onPressed: selected == null || busy ? null : onSave,
          icon: const Icon(Icons.door_front_door),
          label: Text(busy ? 'SAVING...' : 'ENTER GUILD HALL'),
        ),
      ],
    );
  }
}

class _Picker extends StatelessWidget {
  const _Picker({required this.selected, required this.onSelected});

  final HeroChoice? selected;
  final ValueChanged<HeroChoice> onSelected;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'CHOOSE YOUR CHARACTER',
          textAlign: TextAlign.center,
          style: Theme.of(
            context,
          ).textTheme.titleMedium?.copyWith(fontSize: 13),
        ),
        const SizedBox(height: 10),
        Expanded(
          child: GridView.builder(
            itemCount: heroChoices.length,
            gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
              maxCrossAxisExtent: 130,
              mainAxisExtent: 125,
              crossAxisSpacing: 8,
              mainAxisSpacing: 8,
            ),
            itemBuilder: (context, index) {
              final choice = heroChoices[index];
              final active = choice.id == selected?.id;
              final color = Color(heroClasses[choice.classKey]!.colorValue);
              return Tooltip(
                message: choice.label,
                child: InkWell(
                  onTap: () => onSelected(choice),
                  borderRadius: BorderRadius.circular(6),
                  child: Container(
                    padding: const EdgeInsets.all(6),
                    decoration: BoxDecoration(
                      color: AppColors.panel,
                      borderRadius: BorderRadius.circular(6),
                      border: Border.all(
                        color: active ? color : AppColors.panelLine,
                        width: 2,
                      ),
                      boxShadow: active
                          ? [
                              BoxShadow(
                                color: color.withValues(alpha: 0.45),
                                blurRadius: 12,
                              ),
                            ]
                          : null,
                    ),
                    child: Column(
                      children: [
                        Expanded(
                          child: Image.asset(
                            choice.asset,
                            filterQuality: FilterQuality.none,
                          ),
                        ),
                        Text(
                          choice.label,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: active ? color : AppColors.meta,
                            fontSize: 12,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}
