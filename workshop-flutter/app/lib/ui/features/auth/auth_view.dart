import 'package:flutter/material.dart';

import '../../core/app_theme.dart';
import '../../core/widgets.dart';
import '../session/app_view_model.dart';

class AuthView extends StatefulWidget {
  const AuthView({super.key, required this.viewModel});

  final AppViewModel viewModel;

  @override
  State<AuthView> createState() => _AuthViewState();
}

class _AuthViewState extends State<AuthView> {
  final usernameController = TextEditingController();
  final passwordController = TextEditingController();
  bool createAccount = false;
  bool busy = false;
  String? validation;

  @override
  void dispose() {
    usernameController.dispose();
    passwordController.dispose();
    super.dispose();
  }

  Future<void> submit() async {
    final username = usernameController.text.trim();
    final password = passwordController.text;
    if (username.length < 3) {
      setState(() => validation = 'Name must be at least 3 characters.');
      return;
    }
    if (password.length < 8) {
      setState(() => validation = 'Password must be at least 8 characters.');
      return;
    }
    setState(() {
      validation = null;
      busy = true;
    });
    await widget.viewModel.authenticate(
      username: username,
      password: password,
      createAccount: createAccount,
    );
    if (mounted) setState(() => busy = false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.transparent,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: Column(
                children: [
                  Image.asset(
                    'assets/ui/crest.png',
                    height: 92,
                    filterQuality: FilterQuality.none,
                  ),
                  const SizedBox(height: 12),
                  Text(
                    'ADVENTURER\'S GUILD HALL',
                    textAlign: TextAlign.center,
                    style: Theme.of(
                      context,
                    ).textTheme.headlineMedium?.copyWith(fontSize: 24),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    createAccount
                        ? 'Register a new adventurer'
                        : 'Welcome back, adventurer',
                    style: const TextStyle(color: AppColors.meta, fontSize: 17),
                  ),
                  const SizedBox(height: 18),
                  WoodFrame(
                    child: AutofillGroup(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          TextField(
                            key: const Key('username-field'),
                            controller: usernameController,
                            autofocus: true,
                            maxLength: 20,
                            autofillHints: const [AutofillHints.username],
                            decoration: const InputDecoration(
                              labelText: 'Adventurer name',
                              hintText: 'e.g. aldric',
                              counterText: '',
                            ),
                          ),
                          const SizedBox(height: 12),
                          TextField(
                            key: const Key('password-field'),
                            controller: passwordController,
                            obscureText: true,
                            autofillHints: const [AutofillHints.password],
                            onSubmitted: (_) => submit(),
                            decoration: const InputDecoration(
                              labelText: 'Password',
                              hintText: 'at least 8 characters',
                            ),
                          ),
                          ErrorText(validation ?? widget.viewModel.error),
                          const SizedBox(height: 6),
                          FilledButton.icon(
                            key: const Key('auth-submit'),
                            onPressed: busy ? null : submit,
                            icon: busy
                                ? const SizedBox.square(
                                    dimension: 18,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                    ),
                                  )
                                : Icon(
                                    createAccount
                                        ? Icons.person_add
                                        : Icons.login,
                                  ),
                            label: Text(
                              createAccount ? 'REGISTER & ENTER' : 'SIGN IN',
                            ),
                          ),
                          const SizedBox(height: 8),
                          TextButton(
                            onPressed: busy
                                ? null
                                : () => setState(() {
                                    createAccount = !createAccount;
                                    validation = null;
                                  }),
                            child: Text(
                              createAccount
                                  ? 'Already have an account? Sign in'
                                  : 'New here? Create an account',
                            ),
                          ),
                        ],
                      ),
                    ),
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
