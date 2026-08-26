#!/usr/bin/env node
// Scans a built Nitro/Vercel function dir for bare (non-builtin) module
// specifiers that the bundler left as runtime require() calls. These are
// invisible to the nf3 dependency tracer and must be embedded into the
// function's node_modules by embed-function-deps.mjs.
import { readdirSync, statSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.argv[2] || ".vercel/output/functions/__server.func";
const BUILTIN = new Set([
  "assert", "assert/strict", "async_hooks", "buffer", "child_process", "cluster",
  "console", "constants", "crypto", "dgram", "diagnostics_channel", "dns",
  "dns/promises", "domain", "events", "fs", "fs/promises", "http", "http2",
  "https", "inspector", "inspector/promises", "module", "net", "os", "path",
  "path/posix", "path/win32", "perf_hooks", "process", "punycode", "querystring",
  "readline", "readline/promises", "repl", "stream", "stream/consumers",
  "stream/promises", "stream/web", "string_decoder", "sys", "timers",
  "timers/promises", "tls", "trace_events", "tty", "url", "util", "util/types",
  "v8", "vm", "wasi", "worker_threads", "zlib",
]);

function* walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules") continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (/\.(mjs|cjs|js)$/.test(e.name)) yield p;
  }
}

const found = new Map(); // specifier -> Set(files)
for (const f of walk(root)) {
  const src = readFileSync(f, "utf8");
  const re = /(?:__require|require)\s*\(\s*["'`]([^"'`]+)["'`]\s*\)|(?:import|from)\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g;
  let m;
  while ((m = re.exec(src))) {
    const spec = m[1] || m[2];
    if (!spec || spec.startsWith(".") || spec.startsWith("/") || spec.startsWith("\0")) continue;
    const bare = spec.startsWith("node:") ? spec.slice(5) : spec;
    if (BUILTIN.has(bare)) continue;
    if (spec.startsWith("data:") || spec.startsWith("http:") || spec.startsWith("https:")) continue;
    if (!found.has(spec)) found.set(spec, new Set());
    found.get(spec).add(relative(root, f));
  }
}

if (found.size === 0) {
  console.log("OK: no bare runtime requires found.");
} else {
  for (const [spec, files] of [...found.entries()].sort()) {
    console.log(`MISSING RUNTIME: ${spec}`);
    for (const f of files) console.log(`    ${f}`);
  }
}
