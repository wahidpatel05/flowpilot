/**
 * The wording guard for Estimated Time Returned.
 *
 * ADR-0002 renamed the metric because the number is a counterfactual from our
 * own simulator: nobody observed the facility that didn't happen. That decision
 * only holds if no surface goes on saying otherwise, and the word is easy to
 * reintroduce months later in a sentence that looks harmless — including inside
 * a denial of it, which still puts the word on screen next to the figure.
 *
 * So this scans the surfaces' source with comments removed and fails on the
 * banned wording. Comments are stripped rather than the whole file searched,
 * because the ADR has to be explainable in the code that implements it — the
 * word belongs in a comment saying never to render it.
 *
 * Scanning comment-stripped source rather than only string literals means an
 * identifier like `measuredMinutes` trips it too. That is deliberate: it costs a
 * rename, and it is the only version of this check that cannot be defeated by
 * building the sentence out of pieces.
 *
 * WHAT THIS DOES NOT SCAN, on purpose:
 *
 * - `.sql`. Service durations genuinely ARE measured — `service_started_at` to
 *   `completed_at` is an observation — so the schema's `measured_avg_service_minutes`
 *   and its comments are accurate, and banning the word there would be wrong. What
 *   ADR-0002 forbids is calling ESTIMATED TIME RETURNED measured, and no RPC
 *   message does. If a `raise` message ever describes the metric, bring `.sql` in.
 * - The harness's own output. `closedLoop.ts` prints "(N measured durations)" for
 *   the same reason: that number is a measurement. This guard governs what a
 *   Visitor, a Manager or a Desk clerk reads in the product.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { REPO_ROOT } from "./client.js";

/** Everything a Visitor, a Manager or a Desk clerk can read. */
const SURFACE_ROOTS = [
  "apps/web/src",
  "flowpilot-visitor/src",
  "flowpilot-visitor/App.tsx",
  "flowpilot-core/src",
];

const SCANNED_EXTENSIONS = new Set([".ts", ".tsx", ".css"]);

/**
 * The banned wording, from ADR-0002 and CONTEXT.md's `_Avoid_` list. The label
 * is "Estimated time returned" and the column is `estimated_minutes_returned`;
 * every one of these is a claim we cannot support.
 */
const BANNED = [
  /measured/i,
  /human[ _-]?(time|minutes)[ _-]?saved/i,
  /\btime saved\b/i,
];

export interface CopyViolation {
  /** Repo-relative, so the message is a path a human can open. */
  file: string;
  line: number;
  text: string;
  pattern: string;
}

/**
 * Source with comments blanked out, line structure preserved.
 *
 * Written as a scanner rather than a regex because `//` inside a string literal
 * (a URL, most often) is not a comment, and treating it as one would blank the
 * rest of a line that might carry the very wording this guard exists to catch.
 * Blanked regions keep their newlines so reported line numbers stay true.
 */
export function stripComments(source: string): string {
  const out: string[] = [];
  let index = 0;
  // Outside any string, comment or template.
  let quote: '"' | "'" | "`" | null = null;

  while (index < source.length) {
    const char = source[index] as string;
    const next = source[index + 1];

    if (quote !== null) {
      out.push(char);
      if (char === "\\") {
        // Copy the escaped character through untouched.
        if (index + 1 < source.length) out.push(source[index + 1] as string);
        index += 2;
        continue;
      }
      if (char === quote) quote = null;
      index += 1;
      continue;
    }

    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      out.push(char);
      index += 1;
      continue;
    }

    if (char === "/" && next === "/") {
      while (index < source.length && source[index] !== "\n") index += 1;
      continue;
    }

    if (char === "/" && next === "*") {
      index += 2;
      while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) {
        // Keep the newlines so line numbers survive.
        if (source[index] === "\n") out.push("\n");
        index += 1;
      }
      index += 2;
      continue;
    }

    out.push(char);
    index += 1;
  }

  return out.join("");
}

function collectFiles(absolutePath: string, into: string[]): void {
  let stats;
  try {
    stats = statSync(absolutePath);
  } catch {
    return; // A root that isn't checked out is not a violation.
  }

  if (stats.isFile()) {
    if (SCANNED_EXTENSIONS.has(extname(absolutePath))) into.push(absolutePath);
    return;
  }

  for (const entry of readdirSync(absolutePath)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    collectFiles(join(absolutePath, entry), into);
  }
}

/** Every place a surface would show the banned wording to a human. */
export function findBannedCopy(roots: readonly string[] = SURFACE_ROOTS): {
  violations: CopyViolation[];
  filesScanned: number;
} {
  const files: string[] = [];
  for (const root of roots) collectFiles(join(REPO_ROOT, root), files);

  const violations: CopyViolation[] = [];
  for (const file of files) {
    const lines = stripComments(readFileSync(file, "utf8")).split(/\r?\n/);
    lines.forEach((line, offset) => {
      for (const pattern of BANNED) {
        if (!pattern.test(line)) continue;
        violations.push({
          file: relative(REPO_ROOT, file).replace(/\\/g, "/"),
          line: offset + 1,
          text: line.trim(),
          pattern: String(pattern),
        });
      }
    });
  }

  return { violations, filesScanned: files.length };
}
