#!/usr/bin/env node
// Completes the node_modules of a built Nitro/Vercel function so every
// runtime require() resolves inside the lambda (/var/task).
//
// Why: the bundler leaves a handful of CJS packages as bare runtime
// require("...") calls inside the built chunks (firebase-admin internals,
// h3's busboy, etc.). The nf3/Vercel dep tracer misses the `__require`
// indirection and copies packages WITHOUT their transitive deps
// (e.g. google-auth-library's nested gaxios was copied but gaxios's
// `extend` was not -> "Cannot find module 'extend'" in /var/task).
//
// What it does (two phases):
//  1. Scan the built (non-node_modules) chunks for bare specifiers and make
//     sure each of those packages is present in the target node_modules.
//  2. Compute the FULL runtime-dependency closure of every package already
//     present in the target node_modules (resolving each dep with exact Node
//     semantics FROM ITS REQUIRING PACKAGE and preserving the project's
//     hoisted/nested layout), copying anything missing from the project's
//     installed node_modules.
// Mirrors how nf3 already ships tslib; deterministic and version-exact.
//
// Usage: node scripts/embed-function-deps.mjs [target-dir] [project-dir]
// Without arguments it completes every existing output:
//   - .output/server                            (npm run build / node preset)
//   - .vercel/output/functions/__server.func    (vercel build / vercel preset)
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

// The function bundle contains CJS packages that `require()` ESM-only
// packages (jwks-rsa@4 -> jose@6). require(esm) is only enabled by default
// since Node 20.19 / 22.12, so the old nodejs20.x lambda runtime throws
// ERR_REQUIRE_ESM. nodejs22.x always has it.
const TARGET_RUNTIME = "nodejs22.x";

const targets = process.argv[2]
  ? [resolve(process.argv[2])]
  : [
      resolve(".output/server"),
      resolve(".vercel/output/functions/__server.func"),
    ].filter((t) => existsSync(t));
const project = resolve(process.argv[3] || ".");
if (targets.length === 0) {
  console.log("No built output found (run `vite build` first). Nothing to embed.");
  process.exit(0);
}
const projectNM = join(project, "node_modules");

const BUILTIN = new Set([
  "assert","assert/strict","async_hooks","buffer","child_process","cluster","console",
  "constants","crypto","dgram","diagnostics_channel","dns","dns/promises","domain","events",
  "fs","fs/promises","http","http2","https","inspector","inspector/promises","module","net",
  "os","path","path/posix","path/win32","perf_hooks","process","punycode","querystring",
  "readline","readline/promises","repl","stream","stream/consumers","stream/promises",
  "stream/web","string_decoder","sys","timers","timers/promises","tls","trace_events","tty",
  "url","util","util/types","v8","vm","wasi","worker_threads","zlib",
]);

function readdirSafe(dir) {
  try { return readdirSync(dir, { withFileTypes: true }); } catch { return []; }
}

// ---- Phase 1: scan built chunks for bare specifiers -----------------------
function* walk(dir) {
  for (const e of readdirSafe(dir)) {
    if (e.name === "node_modules" || e.name === ".nitro") continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (/\.(mjs|cjs|js)$/.test(e.name)) yield p;
  }
}

function findBareSpecifiers(dir) {
  const found = new Set();
  for (const f of walk(dir)) {
    let src;
    try { src = readFileSync(f, "utf8"); } catch { continue; }
    for (const line of src.split("\n")) {
      if (/^\s*\*/.test(line) || /^\s*\/\//.test(line) || /^\s*\/\*/.test(line)) continue;
      // CJS require / __require, dynamic import(), static ESM import/export-from
      const re =
        /(?:__require|require)\s*\(\s*["'`]([^"'`]+)["'`]\s*\)|import\s*\(\s*["'`]([^"'`]+)["'`]\s*\)|import\s+["'`]([^"'`]+)["'`]|(?:import|export)\s+[^"'`;\n]*?\s+from\s+["'`]([^"'`]+)["'`]/g;
      let m;
      while ((m = re.exec(line))) {
        const spec = m[1] || m[2] || m[3] || m[4];
        if (!spec) continue;
        if (spec.startsWith(".") || spec.startsWith("/") || spec.startsWith("\0")) continue;
        if (spec.startsWith("#")) continue; // bundler-internal virtuals, already inlined
        const bare = spec.replace(/^node:/, "");
        if (BUILTIN.has(bare)) continue;
        if (/^(data|https?|file):/.test(spec)) continue;
        found.add(spec);
      }
    }
  }
  return found;
}

// ---- Package resolution with exact Node semantics -------------------------
// Resolve `spec` as required FROM `fromDir` (a package dir inside the
// project's node_modules, or the project root). Returns the real package dir
// (the ancestor dir whose package.json NAME matches the requested package),
// handling type-marker package.jsons (e.g. lru-cache/dist/commonjs/package.json
// with no `name` field).
function resolvePkgDir(spec, fromDir) {
  const req = createRequire(join(fromDir, "package.json"));
  let resolved;
  try { resolved = req.resolve(spec); } catch { return null; }
  if (!resolved.startsWith(projectNM + sep)) return null;
  const parts = spec.split("/");
  const wantName = parts[0].startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
  let dir = dirname(resolved);
  let firstPj = null;
  for (let i = 0; i < 16; i++) {
    if (dir === projectNM || dir === project) break;
    const pj = join(dir, "package.json");
    if (existsSync(pj)) {
      let name = null;
      try { name = JSON.parse(readFileSync(pj, "utf8")).name || null; } catch {}
      if (name === wantName) return dir;
      if (!firstPj) firstPj = dir; // remember in case nothing matches
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return firstPj; // name-less real packages fall back to nearest package.json
}

function layoutOf(pkgDir) {
  return relative(projectNM, pkgDir).split(sep).join("/");
}

function pkgJson(pkgDir) {
  try { return JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8")); } catch { return null; }
}

function isRootLayout(rel) {
  const parts = rel.split("/");
  return parts.length === 1 || (parts.length === 2 && parts[0].startsWith("@"));
}

function pkgNameOfLayout(rel) {
  const parts = rel.split("/");
  return parts.length === 3 && parts[0].startsWith("@") ? `${parts[0]}/${parts[1]}` : parts[parts.length - 1];
}

// ---- Phase 2: closure completion -----------------------------------------
// seeds: bare specifier names that must be present at target root.
function completeTargetNM(target, seeds = []) {
  const targetNM = join(target, "node_modules");
  if (!existsSync(targetNM)) mkdirSync(targetNM, { recursive: true });

  // 1. Every package dir (root or nested) present under target node_modules.
  const present = new Set();
  (function collect(dir, rel = "") {
    for (const e of readdirSafe(dir)) {
      if (!e.isDirectory()) continue;
      const p = join(dir, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (existsSync(join(p, "package.json"))) present.add(r);
      collect(p, r);
    }
  })(targetNM);

  // 2. BFS over the dependency closure. Each queued item is a package that
  //    should exist (srcDir in the project), whose runtime deps are resolved
  //    FROM ITS OWN DIR and enqueued, preserving the project's real layout.
  const queue = [];
  for (const rel of present) {
    const src = join(projectNM, rel.split("/").join(sep));
    if (existsSync(join(src, "package.json"))) queue.push({ rel, src });
  }
  // Seeds: missing bare specifiers, resolved from the project root.
  for (const name of seeds) {
    const src = resolvePkgDir(name, project);
    if (src) queue.push({ rel: layoutOf(src), src });
    else console.log(`  ! cannot resolve "${name}" in project node_modules; SKIPPED`);
  }
  const visited = new Set();
  const copied = new Map(); // layout -> source dir
  while (queue.length) {
    const { rel, src } = queue.shift();
    if (visited.has(src)) continue;
    visited.add(src);

    // ensure the package sits at its project layout path inside target
    const layout = layoutOf(src);
    const dest = join(targetNM, layout.split("/").join(sep));
    if (!existsSync(join(dest, "package.json"))) {
      mkdirSync(dirname(dest), { recursive: true });
      cpSync(src, dest, { recursive: true });
      copied.set(layout, src);
    }

    const pkg = pkgJson(src);
    if (!pkg) continue;
    const deps = {
      ...(pkg.dependencies || {}),
      ...(pkg.optionalDependencies || {}),
      ...(pkg.peerDependencies || {}),
    };
    for (const d of Object.keys(deps)) {
      const dd = resolvePkgDir(d, src);
      if (dd) queue.push({ rel: layoutOf(dd), src: dd });
    }
  }
  // Re-collect after copies so the caller verifies the FINAL state.
  present.clear();
  (function collect(dir, rel = "") {
    for (const e of readdirSafe(dir)) {
      if (!e.isDirectory()) continue;
      const p = join(dir, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (existsSync(join(p, "package.json"))) present.add(r);
      collect(p, r);
    }
  })(targetNM);
  return { copied, present };
}

// Verifies that every specifier resolves to a file INSIDE the target's
// node_modules, in a fresh Node process (avoids Module._pathCache staleness).
// Tries ESM resolution first (import.meta.resolve), then CJS require.resolve.
function verifyInChild(target, specs, present) {
  // a) root-layout package dirs must exist (deterministic, no cache involved)
  let ok = true;
  for (const rel of present) {
    if (!isRootLayout(rel)) continue;
    if (!existsSync(join(join(target, "node_modules"), rel.split("/").join(sep), "package.json"))) {
      ok = false;
      console.log(`  !! root package missing at layout: ${rel}`);
    }
  }
  if (specs.length === 0) return ok;
  const script = `
    import { createRequire } from "node:module";
    import { pathToFileURL } from "node:url";
    const cwd = process.cwd();
    const nm = cwd + "/node_modules/";
    const specs = JSON.parse(process.argv[1]);
    const parent = pathToFileURL(cwd + "/__verify__.mjs").href;
    let bad = [];
    for (const s of specs) {
      let okSpec = false;
      try {
        const r = import.meta.resolve(s, parent);
        if (r.startsWith("file://" + nm)) okSpec = true;
      } catch {}
      if (!okSpec) {
        try {
          const req = createRequire(cwd + "/package.json");
          const r = req.resolve(s);
          if (r.startsWith(nm)) okSpec = true;
        } catch {}
      }
      if (!okSpec) bad.push(s);
    }
    console.log(JSON.stringify(bad));
    process.exit(bad.length ? 2 : 0);
  `;
  try {
    const out = execFileSync(process.execPath, ["--input-type=module", "-e", script, JSON.stringify(specs)], {
      cwd: target,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const bad = JSON.parse(out.trim().split("\n").pop() || "[]");
    if (bad.length) {
      ok = false;
      for (const s of bad) console.log(`  !! unresolvable inside target: ${s}`);
    }
    return ok;
  } catch (e) {
    ok = false;
    console.log(`  !! verifier child failed: ${e.message}`);
    console.log(String(e.stdout || ""));
    console.log(String(e.stderr || ""));
    return ok;
  }
}

function dirSize(dir) {
  let n = 0;
  for (const e of readdirSafe(dir)) {
    const p = join(dir, e.name);
    try { n += e.isDirectory() ? dirSize(p) : statSync(p).size; } catch {}
  }
  return n;
}

let exitCode = 0;
for (const target of targets) {
  console.log(`\n=== ${target} ===`);

  // Phase 1: bare specifiers in the build chunks
  const bare = findBareSpecifiers(target);
  const targetRequire = createRequire(join(target, "package.json"));
  const missingRoots = [];
  for (const s of bare) {
    try {
      const r = targetRequire.resolve(s);
      if (r.startsWith(target + sep)) continue;
      missingRoots.push(s);
    } catch { missingRoots.push(s); }
  }
  if (missingRoots.length) {
    console.log("Bare runtime requires not resolvable inside target:");
    for (const s of [...missingRoots].sort()) console.log(`  - ${s}`);
  } else {
    console.log(`Phase 1: all ${bare.size} bare runtime require(s) from build chunks resolve inside target.`);
  }

  // Phase 2: dependency-closure completion
  const { copied, present } = completeTargetNM(target, missingRoots);
  console.log(`Phase 2: ${present.size} package dirs present; copied ${copied.size} missing:`);
  for (const [layout] of copied) console.log(`  + ${layout}`);

  // Verify strictly inside the target, in a FRESH child process: Node's
  // Module._pathCache would otherwise replay phase-1 resolutions performed
  // BEFORE the copies existed (createRequire also walks up to the project's
  // node_modules, making checks falsely pass/fail).
  const checkBare = missingRoots.length ? [...missingRoots] : [...bare];
  const ok = verifyInChild(target, checkBare, present);

  // Lambda runtime: nodejs22.x guarantees require(esm) support (jose@6 is
  // ESM-only and required by the CJS jwks-rsa — nodejs20.x throws
  // ERR_REQUIRE_ESM in /var/task).
  const vcConfig = join(target, ".vc-config.json");
  if (existsSync(vcConfig)) {
    try {
      const cfg = JSON.parse(readFileSync(vcConfig, "utf8"));
      if (cfg.runtime && cfg.runtime !== TARGET_RUNTIME) {
        cfg.runtime = TARGET_RUNTIME;
        writeFileSync(vcConfig, JSON.stringify(cfg, null, 2));
        console.log(`Runtime set to ${TARGET_RUNTIME} (was nodejs20.x; require(esm) support).`);
      }
    } catch (e) {
      console.log(`  !! could not patch ${vcConfig}: ${e.message}`);
    }
  }
  console.log(`Target node_modules size: ${(dirSize(join(target, "node_modules")) / 1048576).toFixed(1)} MiB`);
  console.log(ok ? "VERIFIED: closure complete." : "FAILED: some packages still unresolvable.");
  if (!ok) exitCode = 1;
}
process.exit(exitCode);
