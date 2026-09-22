// drift-guard.mjs — catch skill/source drift for the aws-blocks-development skill.
//
// Usage:
//   node scripts/drift-guard.mjs --node-modules <path-to-node_modules>
//   BLOCKS_NODE_MODULES=<path> node scripts/drift-guard.mjs
//
// What it does:
//   1. Walks every *.md in the skill dir, extracts fenced ```ts / ```typescript blocks.
//   2. Pulls identifiers imported from `@aws-blocks/*` packages in those blocks.
//   3. Resolves each against the INSTALLED package's type surface: reads the
//      package.json "types"/"exports" to find the .d.ts (falls back to API.md),
//      and flags any identifier the skill mentions that is NOT found there.
//   4. Prints a pinned-vs-installed version diff (skill pins 0.6.0 in SKILL.md
//      vs the installed @aws-blocks/blocks version).
//
// Exit codes: non-zero when misses are found. If no install is available it
// prints a clear message and exits 0 (does not crash) — drift can't be checked
// without a real install, so a missing install is "unknown", not "failed".
//
// Node ESM, no external deps. Regex extraction (no TS parser) is intentional.

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL_DIR = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PINNED_VERSION = '0.6.0'; // must match the pin in SKILL.md

// ---- args -----------------------------------------------------------------
function parseArgs(argv) {
  const out = { nodeModules: process.env.BLOCKS_NODE_MODULES || null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--node-modules') out.nodeModules = argv[++i];
  }
  return out;
}

// ---- fs helpers -----------------------------------------------------------
function walkMarkdown(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.')) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) files.push(...walkMarkdown(full));
    else if (entry.endsWith('.md')) files.push(full);
  }
  return files;
}

// ---- extraction -----------------------------------------------------------
// Fenced ```ts / ```typescript blocks.
function extractTsBlocks(md) {
  const blocks = [];
  const re = /```(?:ts|typescript)\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(md)) !== null) blocks.push(m[1]);
  return blocks;
}

// import { A, B as C, type D } from '@aws-blocks/pkg';  (also `import type {...}`)
function extractBlocksImports(code) {
  const found = []; // { pkg, ids: [...] }
  const re = /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"](@aws-blocks\/[^'"]+)['"]/g;
  let m;
  while ((m = re.exec(code)) !== null) {
    const pkg = m[2];
    const ids = m[1]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => s.replace(/^type\s+/, '')) // strip inline `type`
      .map((s) => s.split(/\s+as\s+/)[0].trim()) // `A as B` -> A (the imported name)
      .filter((s) => /^[A-Za-z_$][\w$]*$/.test(s));
    if (ids.length) found.push({ pkg, ids });
  }
  return found;
}

// ---- package resolution ---------------------------------------------------
// Map a subpath import like `@aws-blocks/blocks/cdk` to its installed dir root
// `@aws-blocks/blocks` and the subpath `cdk` (or '.').
function splitPkg(spec) {
  const parts = spec.split('/');
  const root = parts.slice(0, 2).join('/'); // @scope/name
  const sub = parts.length > 2 ? './' + parts.slice(2).join('/') : '.';
  return { root, sub };
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

// Resolve the .d.ts for a package subpath from its package.json.
function resolveDts(nodeModules, root, sub) {
  const pkgRoot = join(nodeModules, root);
  const pkgJsonPath = join(pkgRoot, 'package.json');
  const pkg = readJson(pkgJsonPath);
  if (!pkg) return { pkgRoot, dts: null, apiMd: null, version: null };

  let dtsRel = null;
  const exp = pkg.exports;
  if (exp && typeof exp === 'object') {
    const entry = exp[sub] ?? exp[sub === '.' ? './' : sub];
    if (entry) {
      if (typeof entry === 'string') dtsRel = entry;
      else dtsRel = entry.types || entry.import?.types || entry.default?.types || null;
    }
  }
  if (!dtsRel && sub === '.') dtsRel = pkg.types || pkg.typings || null;

  const dts = dtsRel ? join(pkgRoot, dtsRel) : null;
  const apiMd = join(pkgRoot, 'API.md');
  return {
    pkgRoot,
    dts: dts && existsSync(dts) ? dts : null,
    apiMd: existsSync(apiMd) ? apiMd : null,
    version: pkg.version || null,
  };
}

// Gather the identifier "surface" of a package from its .d.ts and/or API.md.
// Regex-only: collect exported/declared names — good enough to answer
// "does the skill mention a symbol the install has never heard of?".
function surfaceOf(dtsPath, apiMdPath) {
  const names = new Set();
  const scan = (text) => {
    const re =
      /\b(?:export\s+)?(?:declare\s+)?(?:abstract\s+)?(?:class|interface|type|function|const|let|var|enum|namespace)\s+([A-Za-z_$][\w$]*)/g;
    let m;
    while ((m = re.exec(text)) !== null) names.add(m[1]);
    // `export { A, B as C }` re-exports
    const re2 = /export\s*\{([^}]*)\}/g;
    while ((m = re2.exec(text)) !== null) {
      m[1]
        .split(',')
        .map((s) => s.trim().split(/\s+as\s+/).pop().trim())
        .filter((s) => /^[A-Za-z_$][\w$]*$/.test(s))
        .forEach((s) => names.add(s));
    }
  };
  if (dtsPath) scan(readFileSync(dtsPath, 'utf8'));
  if (apiMdPath) scan(readFileSync(apiMdPath, 'utf8'));
  return names;
}

// ---- version diff ---------------------------------------------------------
function skillPinnedVersion() {
  const skillMd = join(SKILL_DIR, 'SKILL.md');
  if (!existsSync(skillMd)) return PINNED_VERSION;
  const m = readFileSync(skillMd, 'utf8').match(/@aws-blocks\/blocks@([0-9]+\.[0-9]+\.[0-9]+)/);
  return m ? m[1] : PINNED_VERSION;
}

// ---- main -----------------------------------------------------------------
function main() {
  const { nodeModules } = parseArgs(process.argv.slice(2));
  const pinned = skillPinnedVersion();

  console.log(`drift-guard: skill dir ${SKILL_DIR}`);
  console.log(`drift-guard: skill pins @aws-blocks/blocks@${pinned}`);

  if (!nodeModules || !existsSync(nodeModules)) {
    console.log(
      `drift-guard: no installed node_modules at ${nodeModules ?? '(none given)'} — ` +
        `cannot check drift. Pass --node-modules <path> or set BLOCKS_NODE_MODULES.`,
    );
    process.exit(0); // "unknown", not a failure
  }

  // version diff
  const installed = resolveDts(nodeModules, '@aws-blocks/blocks', '.').version;
  if (installed) {
    const tag = installed === pinned ? 'match' : 'DRIFT';
    console.log(`drift-guard: installed @aws-blocks/blocks@${installed} (pin ${pinned}) — ${tag}`);
  } else {
    console.log(`drift-guard: @aws-blocks/blocks not found under ${nodeModules}`);
  }

  // collect identifiers keyed by the ACTUAL import spec (root + subpath) across
  // all skill markdown, so `@aws-blocks/blocks/ui` resolves to the ui d.ts, not root.
  const wanted = new Map(); // spec -> { root, sub, ids: Map<id, Set<file>> }
  for (const file of walkMarkdown(SKILL_DIR)) {
    const md = readFileSync(file, 'utf8');
    for (const block of extractTsBlocks(md)) {
      for (const { pkg, ids } of extractBlocksImports(block)) {
        const { root, sub } = splitPkg(pkg);
        if (!wanted.has(pkg)) wanted.set(pkg, { root, sub, ids: new Map() });
        const bucket = wanted.get(pkg).ids;
        for (const id of ids) {
          if (!bucket.has(id)) bucket.set(id, new Set());
          bucket.get(id).add(file.replace(SKILL_DIR + '/', ''));
        }
      }
    }
  }

  // Union every subpath surface of a package root — the umbrella re-exports many
  // symbols across subpaths (./cdk, ./ui, ./server, ...), so a symbol the skill
  // imports from the root may physically live in a subpath d.ts. Checking against
  // the union avoids false "misses" while still catching genuinely-unknown names.
  const unionCache = new Map(); // root -> Set<symbol>
  function rootUnionSurface(root) {
    if (unionCache.has(root)) return unionCache.get(root);
    const pkg = readJson(join(nodeModules, root, 'package.json'));
    const subs = new Set(['.']);
    if (pkg?.exports && typeof pkg.exports === 'object') {
      for (const k of Object.keys(pkg.exports)) if (!k.includes('*')) subs.add(k);
    }
    const names = new Set();
    for (const s of subs) {
      const { dts, apiMd } = resolveDts(nodeModules, root, s);
      for (const n of surfaceOf(dts, apiMd)) names.add(n);
    }
    unionCache.set(root, names);
    return names;
  }

  const misses = [];
  for (const [spec, { root, sub, ids }] of wanted) {
    const { dts, apiMd, version } = resolveDts(nodeModules, root, sub);
    const union = rootUnionSurface(root);
    if (!dts && !apiMd && union.size === 0) {
      console.log(`drift-guard: ${root} not installed (or no types/API.md) — skipping ${ids.size} id(s)`);
      continue;
    }
    // Exact subpath surface, falling back to the package-wide union.
    const surface = dts || apiMd ? surfaceOf(dts, apiMd) : new Set();
    console.log(
      `drift-guard: ${spec}@${version ?? '?'} surface ${surface.size} (root union ${union.size}), ` +
        `checking ${ids.size} skill id(s)`,
    );
    for (const [id, files] of ids) {
      if (!surface.has(id) && !union.has(id)) misses.push({ spec, id, files: [...files] });
    }
  }

  if (misses.length) {
    console.error(`\ndrift-guard: ${misses.length} identifier(s) in the skill NOT found in the install:`);
    for (const { spec, id, files } of misses) {
      console.error(`  - ${id}  (imported from ${spec})  cited in: ${files.join(', ')}`);
    }
    process.exit(1);
  }

  console.log('\ndrift-guard: OK — every @aws-blocks/* identifier the skill imports exists in the install.');
  process.exit(0);
}

main();
