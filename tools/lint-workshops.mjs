#!/usr/bin/env node
/**
 * Lints the workshop guides for the defect classes that actually bite readers.
 *
 * Every check here exists because the defect it catches shipped at least once:
 *
 *   fences       a 4-backtick fence swallowed two whole numbered steps, which
 *                rendered as TypeScript instead of as instructions
 *   steps        modules numbered 1,2,3,4,5,5,4 / skipped 5 / grew a duplicate 4
 *                when a step was inserted at the front
 *   refs         "step 2 covers this" kept pointing at the step that used to be
 *                there before an insertion shifted everything down
 *   paths        modules cite client files by path; a rename leaves a dead pointer
 *   labels       four checkpoints labelled the realtime mock "Module 05" when the
 *                module that replaces it is 06 -- and those labels are the syllabus
 *   langs        ```tsc is not a language; it silently loses highlighting
 *   links        the de-duplicated boilerplate points at root-README anchors
 *
 * Usage:  node tools/lint-workshops.mjs [--quiet]
 * Exit:   0 clean, 1 findings.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WORKSHOPS = ["workshop", "workshop-flutter"];
const VALID_LANGS = new Set([
  "ts", "tsx", "js", "jsx", "json", "dart", "bash", "sh", "shell",
  "cmd", "powershell", "yaml", "yml", "diff", "text", "console", "html", "css", "",
]);
/** Files the guides mention precisely because they should NOT exist in a clone:
 *  the scaffolder's demo test, which module 01 tells you to delete, and the two
 *  generated client artifacts, which are gitignored and only appear once a
 *  participant runs the regeneration loop. Without these the linter reports 16
 *  false findings on a fresh checkout — the exact state a contributor is in. */
const EXPECTED_ABSENT = new Set([
  "app/test/e2e.test.ts",
  "app/lib/blocks.blocks.dart",
  "app/lib/blocks.spec.json",
]);

const findings = [];
/** Coverage for the `indent` check. A check that silently matches nothing passes
 *  vacuously, so these numbers are printed with the result rather than assumed. */
const stats = { fences: 0, checked: 0, matched: 0 };
const note = (file, line, check, msg) =>
  findings.push({ file, line, check, msg });

/** Split a markdown file into lines tagged with whether they sit inside a fence. */
function scan(text) {
  const lines = text.split("\n");
  const out = [];
  let open = null; // length of the backticks that opened the current fence
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*(`{3,})(.*)$/);
    if (m) {
      const len = m[1].length;
      if (open === null) {
        out.push({ text: lines[i], n: i + 1, inFence: true, fenceOpen: len, lang: m[2].trim() });
        open = len;
        continue;
      }
      if (len >= open) {
        out.push({ text: lines[i], n: i + 1, inFence: true, fenceClose: len });
        open = null;
        continue;
      }
    }
    out.push({ text: lines[i], n: i + 1, inFence: open !== null });
  }
  return { lines: out, unclosed: open !== null };
}

function moduleDirs(ws) {
  return readdirSync(join(ROOT, ws))
    .filter((d) => /^\d\d-/.test(d))
    .sort();
}

/** block name -> set of module numbers, parsed from the workshop's own root README table.
 *  A block can legitimately appear in several modules (DistributedTable arrives in 03 and
 *  is used again for the lobby in 04 and game state in 05), so this is a set, not a value. */
function blockModuleMap(ws) {
  const p = join(ROOT, ws, "README.md");
  if (!existsSync(p)) return {};
  const map = {};
  for (const row of readFileSync(p, "utf8").split("\n")) {
    const m = row.match(/^\|\s*(\d\d)\s*\|.*\|\s*(.+?)\s*\|\s*$/);
    if (!m) continue;
    for (const blk of m[2].matchAll(/`([A-Z][A-Za-z]+)`/g)) {
      (map[blk[1]] ??= new Set()).add(m[1]);
    }
  }
  return map;
}

function headingAnchors(text) {
  const set = new Set();
  for (const m of text.matchAll(/^#{1,6}\s+(.+)$/gm)) {
    set.add(
      m[1]
        .replace(/`/g, "")
        .toLowerCase()
        .replace(/[^\w\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-"),
    );
  }
  return set;
}

for (const ws of WORKSHOPS) {
  if (!existsSync(join(ROOT, ws))) continue;
  const rootReadme = join(ROOT, ws, "README.md");
  const rootAnchors = existsSync(rootReadme)
    ? headingAnchors(readFileSync(rootReadme, "utf8"))
    : new Set();
  const blockMap = blockModuleMap(ws);

  const docs = [
    ...(existsSync(rootReadme) ? [rootReadme] : []),
    ...moduleDirs(ws)
      .map((d) => join(ROOT, ws, d, "README.md"))
      .filter(existsSync),
  ];

  for (const file of docs) {
    const rel = relative(ROOT, file);
    const text = readFileSync(file, "utf8");
    const { lines, unclosed } = scan(text);

    // --- fences -----------------------------------------------------------
    if (unclosed) note(rel, 0, "fences", "a code fence is never closed");
    for (const l of lines) {
      if (l.fenceOpen && l.fenceOpen > 3) {
        note(rel, l.n, "fences",
          `fence opened with ${l.fenceOpen} backticks — only use >3 to nest a fence, ` +
          `otherwise it swallows following prose`);
      }
      if (l.fenceOpen && !VALID_LANGS.has(l.lang.split(/\s/)[0])) {
        note(rel, l.n, "langs", `unknown fence language \`${l.lang}\``);
      }
    }

    // --- steps ------------------------------------------------------------
    // Two conventions are in use: `### N.` headings, and top-level ordered list
    // items. Only list items BETWEEN "## Steps" and the next "## " count, so the
    // ordered sub-lists inside a step (and verification checklists) aren't mistaken
    // for steps themselves.
    const stepsStart = lines.findIndex((l) => !l.inFence && /^## Steps\b/.test(l.text));
    const stepsEnd = stepsStart === -1 ? -1
      : lines.findIndex((l, i) => i > stepsStart && !l.inFence && /^## /.test(l.text));
    const inStepsSection = (l) => {
      const i = lines.indexOf(l);
      return stepsStart !== -1 && i > stepsStart && (stepsEnd === -1 || i < stepsEnd);
    };
    const headSteps = lines.filter((l) => !l.inFence && /^#{3,4} \d+\./.test(l.text));
    const listSteps = lines.filter(
      (l) => !l.inFence && /^\d+\. /.test(l.text) && inStepsSection(l),
    );
    const steps = headSteps.length ? headSteps : listSteps;
    const nums = steps.map((l) => Number(l.text.match(/(\d+)\./)[1]));
    nums.forEach((v, i) => {
      if (v !== i + 1) {
        note(rel, steps[i].n, "steps",
          `step numbered ${v} but is #${i + 1} in order — sequence is ${nums.join(",")}`);
      }
    });
    // a numbered step trapped inside a fence renders as code, not instructions
    for (const l of lines) {
      if (l.inFence && !l.fenceOpen && !l.fenceClose && /^\s*\d+\. \*\*/.test(l.text)) {
        note(rel, l.n, "fences", `numbered step is inside a code fence: "${l.text.trim().slice(0, 46)}"`);
      }
    }

    // --- "step N" cross-references ---------------------------------------
    if (nums.length) {
      const max = Math.max(...nums);
      for (const l of lines) {
        if (l.inFence) continue;
        for (const m of l.text.matchAll(/\bstep (\d+)\b/gi)) {
          const n = Number(m[1]);
          if (n > max) {
            note(rel, l.n, "refs", `refers to step ${n} but this module has ${max} steps`);
          }
        }
      }
    }

    // --- cited paths ------------------------------------------------------
    // Note the extension alternation puts `json` before `js` — otherwise `jsx?`
    // matches the "js" inside "blocks.spec.json" and reports a file nobody cited.
    const wsDir = join(ROOT, ws);
    for (const l of lines) {
      // a path the reader is told to delete is expected to be absent
      if (/\brm\b/.test(l.text)) continue;
      for (const m of l.text.matchAll(/\b((?:app\/)?(?:src|lib|test|tool)\/[\w./-]+\.(?:json|dart|tsx?|jsx?))/g)) {
        let p = m[1];
        if (!p.startsWith("app/")) p = "app/" + p;
        if (EXPECTED_ABSENT.has(p)) continue;
        if (!existsSync(join(wsDir, p))) {
          note(rel, l.n, "paths", `cites a file that does not exist: ${p}`);
        }
      }
    }

    // --- fence indentation vs the module's checkpoint ---------------------
    // A README snippet is often an excerpt lifted from a different nesting level
    // than the solution file, so its absolute indentation legitimately differs.
    // What must NOT differ is the offset: every matched line in one fence should
    // sit the same distance from where it sits in the checkpoint. A VARYING offset
    // means the snippet's internal indentation drifted — which is how a bulk
    // re-indent silently flattens a function body while leaving its braces put.
    const mod = rel.match(/\/(\d\d-[\w-]+)\/README\.md$/)?.[1];
    const solPath = mod ? join(ROOT, ws, mod, "solution", "index.ts") : null;
    if (solPath && existsSync(solPath)) {
      const solIndent = new Map();
      for (const sl of readFileSync(solPath, "utf8").split("\n")) {
        const t = sl.trim();
        if (t.length < 12) continue; // too short to identify a line uniquely
        solIndent.set(t, solIndent.has(t) ? null : sl.length - sl.trimStart().length);
      }
      let block = null;
      for (const l of lines) {
        if (l.fenceOpen !== undefined) {
          block = /^(ts|tsx|js|jsx)\b/.test(l.lang) ? [] : null;
          continue;
        }
        if (l.fenceClose !== undefined) {
          if (block && block.length > 2) {
            const indents = block.filter((b) => b.text.trim()).map((b) => b.indent);
            const base = indents.length ? Math.min(...indents) : 0;
            const offsets = [];
            for (const b of block) {
              const want = solIndent.get(b.text.trim());
              if (want === null || want === undefined) continue;
              offsets.push({ off: b.indent - base - want, n: b.n, t: b.text.trim() });
            }
            stats.fences++;
            if (offsets.length >= 2) stats.checked++;
            stats.matched += offsets.length;
            const distinct = [...new Set(offsets.map((o) => o.off))];
            if (offsets.length >= 2 && distinct.length > 1) {
              const odd = offsets.find((o) => o.off !== offsets[0].off);
              note(rel, odd.n, "indent",
                `indentation in this snippet does not match the checkpoint consistently ` +
                `(offsets ${distinct.join(", ")}) — "${odd.t.slice(0, 40)}" is out by ` +
                `${odd.off - offsets[0].off}`);
            }
          }
          block = null;
          continue;
        }
        if (block) block.push({ text: l.text, indent: l.text.length - l.text.trimStart().length, n: l.n });
      }
    }

    // --- internal links --------------------------------------------------
    for (const l of lines) {
      for (const m of l.text.matchAll(/\]\((\.\.\/)?README\.md#([\w-]+)\)/g)) {
        const anchors = m[1] ? rootAnchors : headingAnchors(text);
        if (!anchors.has(m[2])) {
          note(rel, l.n, "links", `link points at #${m[2]}, which is not a heading there`);
        }
      }
    }
  }

  // --- mock labels in the checkpoints ------------------------------------
  for (const d of moduleDirs(ws)) {
    const sol = join(ROOT, ws, d, "solution", "index.ts");
    if (!existsSync(sol)) continue;
    const rel = relative(ROOT, sol);
    readFileSync(sol, "utf8").split("\n").forEach((line, i) => {
      for (const m of line.matchAll(/Modules?\s+(\d\d)(?:\s*[–-]\s*(\d\d))?\s*(?:→|->)\s*([A-Z][A-Za-z]+)/g)) {
        const want = blockMap[m[3]];
        if (!want) continue;
        const claimed = m[2] ? [m[1], m[2]] : [m[1]];
        if (!claimed.some((c) => want.has(c))) {
          note(rel, i + 1, "labels",
            `label says Module ${claimed.join("–")} → ${m[3]}, but ${m[3]} belongs to module ` +
            `${[...want].sort().join("/")}`);
        }
      }
    });
  }
}

// --- report ---------------------------------------------------------------
const quiet = process.argv.includes("--quiet");
const coverage =
  `indent check: ${stats.checked}/${stats.fences} code fences compared against a ` +
  `checkpoint (${stats.matched} lines matched)`;
if (!findings.length) {
  console.log("✅ workshops lint clean");
  console.log(`   ${coverage}`);
  process.exit(0);
}
const byCheck = {};
for (const f of findings) (byCheck[f.check] ??= []).push(f);
for (const [check, list] of Object.entries(byCheck).sort()) {
  console.log(`\n${check} (${list.length})`);
  for (const f of list) console.log(`  ${f.file}:${f.line}  ${f.msg}`);
}
console.log(`\n${findings.length} finding(s)`);
console.log(coverage);
process.exit(quiet ? 0 : 1);
