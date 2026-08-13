#!/usr/bin/env node

/**
 * AWS Blocks Skill Evaluation — Verification Script
 *
 * Usage: node verify.mjs <task-number> [project-dir]
 * Example: node verify.mjs 01 ./eval-workspace
 *
 * Checks:
 * 1. TypeScript compilation (npx tsc --noEmit)
 * 2. Task-specific pattern assertions (grep-based)
 *
 * Exit code: 0 = PASS, 1 = FAIL
 */

import { execSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const [, , taskNum, projectDir = '.'] = process.argv;

if (!taskNum) {
  console.error('Usage: node verify.mjs <task-number> [project-dir]');
  console.error('Example: node verify.mjs 01 ./eval-workspace');
  process.exit(1);
}

const dir = resolve(projectDir);
const results = { passed: [], failed: [] };

function pass(msg) {
  results.passed.push(msg);
  console.log(`  ✅ ${msg}`);
}

function fail(msg) {
  results.failed.push(msg);
  console.log(`  ❌ ${msg}`);
}

function findFiles(baseDir, ext = '.ts') {
  const files = [];
  function walk(d) {
    if (!existsSync(d)) return;
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'cdk.out') continue;
      const full = join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(ext)) files.push(full);
    }
  }
  walk(baseDir);
  return files;
}

function readAllTs() {
  const files = findFiles(dir, '.ts').concat(findFiles(dir, '.tsx'));
  return files.map(f => readFileSync(f, 'utf-8')).join('\n');
}

function checkTsc() {
  console.log('\n📦 TypeScript compilation check...');
  try {
    execSync('npx tsc --noEmit', { cwd: dir, stdio: 'pipe' });
    pass('TypeScript compiles without errors');
    return true;
  } catch (e) {
    const output = e.stdout?.toString() || e.stderr?.toString() || 'Unknown error';
    fail(`TypeScript compilation failed:\n${output.slice(0, 500)}`);
    return false;
  }
}

function contains(source, pattern, caseSensitive = true) {
  if (caseSensitive) return source.includes(pattern);
  return source.toLowerCase().includes(pattern.toLowerCase());
}

function containsAny(source, patterns) {
  return patterns.some(p => contains(source, p));
}

function containsRegex(source, regex) {
  return regex.test(source);
}

// ─── Task-specific verifiers ───────────────────────────────────────────

function verifyTask01(code) {
  console.log('\n🔍 Task 01: Todo App with Auth');

  if (containsAny(code, ['AuthBasic', 'AuthCognito', 'AuthOIDC'])) {
    pass('Auth block found');
  } else {
    fail('No auth block found (expected AuthBasic, AuthCognito, or AuthOIDC)');
  }

  if (containsAny(code, ['DistributedTable', 'Database', 'KVStore'])) {
    pass('Data storage block found');
  } else {
    fail('No data storage block found');
  }

  if (contains(code, 'ApiNamespace')) {
    pass('ApiNamespace found');
  } else {
    fail('No ApiNamespace found');
  }

  if (containsAny(code, ['requireAuth', 'checkAuth'])) {
    pass('Auth enforcement in API methods');
  } else {
    fail('No auth enforcement (requireAuth/checkAuth) in API methods');
  }

  if (containsRegex(code, /async\s+\w*(create|add|new)\w*/i)) {
    pass('Create operation found');
  } else {
    fail('No create/add operation found');
  }
}

function verifyTask02(code) {
  console.log('\n🔍 Task 02: Auth Cognito MFA + Groups');

  if (contains(code, 'AuthCognito')) {
    pass('AuthCognito block found');
  } else {
    fail('AuthCognito not found (wrong auth block for MFA/groups)');
  }

  if (containsAny(code, ['mfa:', 'mfa :', "mfa:"])) {
    pass('MFA configuration found');
  } else {
    fail('No MFA configuration');
  }

  if (containsAny(code, ['groups:', 'groups :', "groups:"])) {
    pass('Groups configuration found');
  } else {
    fail('No groups configuration');
  }

  if (containsAny(code, ['userAttributes', 'department'])) {
    pass('Custom user attributes found');
  } else {
    fail('No custom user attributes');
  }

  if (contains(code, 'requireRole')) {
    pass('Role-based access (requireRole) found');
  } else {
    fail('No requireRole — missing role-based access control');
  }
}

function verifyTask03(code) {
  console.log('\n🔍 Task 03: AI Agent with Tools');

  if (contains(code, 'Agent')) {
    pass('Agent block found');
  } else {
    fail('No Agent block found');
  }

  if (containsRegex(code, /tools\s*[:(]/)) {
    pass('Tools configuration found');
  } else {
    fail('No tools configuration');
  }

  // Check for callback pattern (not plain array)
  if (containsRegex(code, /tools\s*:\s*\(\s*tool\s*\)\s*=>/)) {
    pass('Tools use callback pattern (correct)');
  } else if (containsRegex(code, /tools\s*:\s*\[/)) {
    fail('Tools use array pattern (should use callback: tools: (tool) => ({...}))');
  } else {
    pass('Tools pattern present (non-standard but functional)');
  }

  // Count tool declarations
  const toolMatches = code.match(/tool\s*\(\s*\{/g) || [];
  if (toolMatches.length >= 3) {
    pass(`${toolMatches.length} tools declared (≥3 required)`);
  } else {
    fail(`Only ${toolMatches.length} tools found (need ≥3)`);
  }

  if (containsAny(code, ['requireAuth', 'auth'])) {
    pass('Auth requirement present');
  } else {
    fail('No auth requirement for agent access');
  }
}

function verifyTask04(code) {
  console.log('\n🔍 Task 04: Realtime Chat');

  if (contains(code, 'Realtime')) {
    pass('Realtime block found');
  } else {
    fail('No Realtime block found');
  }

  if (containsAny(code, ['DistributedTable', 'Database', 'KVStore'])) {
    pass('Message persistence store found');
  } else {
    fail('No message persistence (no data storage block)');
  }

  if (containsAny(code, ['namespace', 'Realtime.namespace'])) {
    pass('Realtime namespace defined');
  } else {
    fail('No Realtime namespace definition');
  }

  if (containsAny(code, ['publish', 'rt.publish', 'realtime.publish'])) {
    pass('Publish pattern found');
  } else {
    fail('No publish pattern');
  }

  if (containsAny(code, ['getChannel', 'subscribe'])) {
    pass('Subscribe/getChannel pattern found');
  } else {
    fail('No subscribe/getChannel pattern');
  }
}

function verifyTask05(code) {
  console.log('\n🔍 Task 05: Brownfield CDK Integration');

  if (contains(code, 'fromExisting')) {
    pass('fromExisting() pattern found');
  } else if (contains(code, 'BlocksBackend')) {
    pass('BlocksBackend pattern found');
  } else {
    fail('Neither fromExisting() nor BlocksBackend found');
  }

  if (containsAny(code, ['prod-orders', 'orderId'])) {
    pass('DynamoDB table reference found');
  } else {
    fail('No reference to the existing DynamoDB table');
  }

  if (containsAny(code, ['company-uploads', 'uploads'])) {
    pass('S3 bucket reference found');
  } else {
    fail('No reference to the existing S3 bucket');
  }

  // Ensure resources are NOT re-created
  if (containsRegex(code, /new\s+DistributedTable\s*\(/) && !contains(code, 'fromExisting')) {
    fail('DistributedTable created without fromExisting — resources should NOT be re-created');
  }
}

function verifyTask06(code) {
  console.log('\n🔍 Task 06: Hosting with Security');

  if (contains(code, 'Hosting')) {
    pass('Hosting block found');
  } else {
    fail('No Hosting block found');
  }

  if (containsAny(code, ['domain', 'app.example.com', 'customDomain'])) {
    pass('Custom domain configuration found');
  } else {
    fail('No custom domain configuration');
  }

  if (containsAny(code, ['waf', 'WAF', 'webAcl'])) {
    pass('WAF configuration found');
  } else {
    fail('No WAF configuration');
  }

  if (containsAny(code, ['csp', 'CSP', 'Content-Security-Policy', 'contentSecurityPolicy'])) {
    pass('CSP headers configuration found');
  } else {
    fail('No CSP/Content-Security-Policy configuration');
  }

  if (containsAny(code, ['basePath', 'base-path', '/dashboard'])) {
    pass('basePath configuration found');
  } else {
    fail('No basePath configuration');
  }
}

function verifyTask07(code) {
  console.log('\n🔍 Task 07: Debug Auth 401');

  // The fix: auth must be passed to ApiNamespace
  if (containsRegex(code, /ApiNamespace\s*\(\s*scope\s*,\s*['"][^'"]+['"]\s*,\s*\{[^}]*auth/)) {
    pass('Auth passed to ApiNamespace in options object (fix applied)');
  } else if (containsRegex(code, /ApiNamespace\s*\(\s*scope\s*,\s*['"][^'"]+['"]\s*,\s*\{\s*auth\s*\}/)) {
    pass('Auth passed to ApiNamespace (fix applied)');
  } else if (containsAny(code, ['withAuth', '{ auth }', '{auth}', '{ auth,'])) {
    pass('Auth wiring found (withAuth or auth in options)');
  } else {
    fail('Auth is NOT wired into ApiNamespace — bug not fixed');
  }

  // Ensure requireAuth is still present (not removed as "fix")
  if (contains(code, 'requireAuth')) {
    pass('requireAuth calls preserved (correct — those are not the bug)');
  } else {
    fail('requireAuth removed — wrong fix! The bug is missing auth wiring, not requireAuth');
  }

  // Ensure AuthBasic is still used (not replaced)
  if (contains(code, 'AuthBasic')) {
    pass('AuthBasic preserved (correct auth block for this app)');
  } else {
    fail('AuthBasic removed/replaced — wrong fix! The auth block is correct');
  }
}

function verifyTask08(code) {
  console.log('\n🔍 Task 08: Native Kotlin Client');

  if (containsAny(code, ['client-spec', 'openapi', 'OpenAPI', 'spec', 'generateSpec'])) {
    pass('Spec generation reference found');
  } else if (containsAny(code, ['.kt', 'kotlin', 'Kotlin', 'suspend fun', 'CoroutineScope'])) {
    pass('Kotlin code/reference found');
  } else {
    fail('No spec generation or Kotlin client code found');
  }

  if (containsAny(code, ['listTodos', 'createTodo', 'updateTodo', 'deleteTodo'])) {
    pass('API methods referenced in client');
  } else {
    fail('API methods not reflected in client');
  }

  if (containsAny(code, ['auth', 'token', 'Authorization', 'Bearer'])) {
    pass('Auth/token handling present');
  } else {
    fail('No auth token handling in client');
  }
}

function verifyTask09(code) {
  console.log('\n🔍 Task 09: DistributedTable with GSI');

  if (contains(code, 'DistributedTable')) {
    pass('DistributedTable found');
  } else {
    fail('No DistributedTable found');
  }

  if (containsAny(code, ['indexes', 'index:', 'indexes:'])) {
    pass('Index (GSI) configuration found');
  } else {
    fail('No index/GSI configuration');
  }

  if (containsAny(code, ['ttl', 'TTL', 'timeToLive', 'ttlAttribute'])) {
    pass('TTL configuration found');
  } else {
    fail('No TTL configuration for auto-expiry');
  }

  if (containsAny(code, ['customerId', 'customer'])) {
    pass('Customer ID field present (for secondary access pattern)');
  } else {
    fail('No customerId field for secondary query pattern');
  }

  if (containsAny(code, ['query(', '.query('])) {
    pass('Query operation used');
  } else {
    fail('No query operation found');
  }
}

function verifyTask10(code) {
  console.log('\n🔍 Task 10: Cron + Observability');

  if (contains(code, 'CronJob')) {
    pass('CronJob block found');
  } else {
    fail('No CronJob block found');
  }

  if (containsAny(code, ['rate(', 'cron(', 'schedule:', '6 hours', '6h'])) {
    pass('Schedule configuration found');
  } else {
    fail('No schedule configuration');
  }

  if (contains(code, 'Logger')) {
    pass('Logger block found');
  } else {
    fail('No Logger block');
  }

  if (contains(code, 'Metrics')) {
    pass('Metrics block found');
  } else {
    fail('No Metrics block');
  }

  if (contains(code, 'Tracer')) {
    pass('Tracer block found');
  } else {
    fail('No Tracer block');
  }

  if (contains(code, 'Dashboard')) {
    pass('Dashboard block found');
  } else {
    fail('No Dashboard block');
  }
}

// ─── Main ──────────────────────────────────────────────────────────────

const verifiers = {
  '01': verifyTask01,
  '02': verifyTask02,
  '03': verifyTask03,
  '04': verifyTask04,
  '05': verifyTask05,
  '06': verifyTask06,
  '07': verifyTask07,
  '08': verifyTask08,
  '09': verifyTask09,
  '10': verifyTask10,
};

const padded = taskNum.padStart(2, '0');
const verifier = verifiers[padded];

if (!verifier) {
  console.error(`Unknown task: ${taskNum}. Valid: 01-10`);
  process.exit(1);
}

console.log(`\n═══════════════════════════════════════════════════`);
console.log(`  AWS Blocks Skill Eval — Task ${padded}`);
console.log(`  Project: ${dir}`);
console.log(`═══════════════════════════════════════════════════`);

// Step 1: TypeScript check (skip for task 08 which may be Kotlin-only)
let tscPassed = true;
if (padded !== '08') {
  tscPassed = checkTsc();
}

// Step 2: Pattern checks
const code = readAllTs();
if (!code && padded !== '08') {
  fail('No TypeScript files found in project');
} else {
  verifier(code);
}

// Summary
console.log(`\n───────────────────────────────────────────────────`);
console.log(`  Results: ${results.passed.length} passed, ${results.failed.length} failed`);

const totalChecks = results.passed.length + results.failed.length;
const passRate = totalChecks > 0 ? results.passed.length / totalChecks : 0;
const verdict = results.failed.length === 0 ? 'PASS ✅' : passRate >= 0.6 ? 'PARTIAL ⚠️' : 'FAIL ❌';

console.log(`  Verdict: ${verdict}`);
console.log(`───────────────────────────────────────────────────\n`);

process.exit(results.failed.length === 0 ? 0 : 1);
