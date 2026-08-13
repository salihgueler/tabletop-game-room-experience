# AWS Blocks Skill Evaluation Harness

Benchmark how well AI coding agents perform on AWS Blocks tasks **with** vs **without** skill files.

## Overview

This eval measures skill effectiveness across 10 tasks by comparing 3 modes:

| Mode | What the agent sees | Purpose |
|------|-------|---------|
| **no-skill** | Only the task prompt | Baseline — what the model knows from training data |
| **with-custom-skill** | Task prompt + your `.kiro/skills/aws-blocks-development/` | Test your custom skill |
| **with-bundled-docs** | Task prompt + `@aws-blocks/blocks/docs/` folder | Test the bundled package docs |

## Requirements

- Node.js ≥ 22
- A scaffolded Blocks project (template: `bare`)
- An AI coding agent (Kiro, Claude Code, Cursor, or any chat-based LLM)

## Running the Eval

### Step 1: Scaffold a base project (once)

```bash
npm create @aws-blocks/blocks-app@latest eval-workspace -- --template bare
cd eval-workspace
npm install
```

### Step 2: Run a task in each mode

#### Mode A: No Skill (baseline)

```bash
# Remove any skill files
rm -rf .kiro/skills/

# Give the agent ONLY the task prompt
cat ../evals/tasks/01-scaffold-react.md
# Paste this prompt into your agent and let it work
```

#### Mode B: With Custom Skill (Kiro)

```bash
# Mount the custom skill
mkdir -p .kiro/skills/
cp -r /path/to/aws-blocks-development .kiro/skills/aws-blocks-development

# Open Kiro and give it the task prompt
kiro
# Paste the task prompt
```

#### Mode C: With Custom Skill (Claude Code / Cursor / other)

```bash
# Provide the skill as context:
# 1. Open the skill's SKILL.md as project context
# 2. Add the relevant block docs as context
# 3. Give the agent the task prompt
```

#### Mode D: With Bundled Docs

```bash
# Mount bundled docs as skill context
mkdir -p .kiro/skills/aws-blocks-bundled/
cp -r node_modules/@aws-blocks/blocks/docs/* .kiro/skills/aws-blocks-bundled/

# Give the agent the same task prompt
```

### Step 3: Verify the output

```bash
# From the project root where the agent wrote code:
node ../evals/verify.mjs <task-number> .

# Example:
node ../evals/verify.mjs 01 .
# Output: PASS or FAIL with reasons
```

### Step 4: Record scores

Edit `scorecard.md` with PASS/FAIL for each task × mode combination.

## Tips

- **Reset between runs:** `git checkout -- .` or re-scaffold to get a clean slate
- **One task at a time:** Don't let previous task output influence the next
- **Time it:** Note how long the agent takes — speed matters too
- **Check compilation first:** `npx tsc --noEmit` must pass before pattern checks
- **Task 07 is special:** It provides broken code — the agent must fix it, not rewrite from scratch

## Estimated Time

- ~10-15 minutes per task per mode
- Full eval (10 tasks × 3 modes): ~5-7 hours
- Quick eval (tasks 01, 02, 05, 07): ~2-3 hours

## Scoring Criteria

Each task is scored binary: **PASS** or **FAIL**.

PASS requires:
1. TypeScript compiles without errors (`npx tsc --noEmit`)
2. Key patterns present (verified by `verify.mjs`)
3. No obviously broken logic (imports exist, blocks instantiated correctly)

FAIL if:
- TypeScript errors
- Missing required blocks/patterns
- Wrong block chosen for the task
- Known anti-patterns present (e.g., REST-style routes instead of JSON-RPC)
