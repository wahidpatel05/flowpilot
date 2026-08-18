/**
 * The pass/fail harness. A demo proof that prints a wall of JSON proves nothing
 * to the person reading it, so every assertion carries a sentence.
 */

export interface CheckLine {
  step: string;
  label: string;
  passed: boolean;
  detail?: string;
}

/**
 * Thrown when an assertion fails, so the run stops but still tidies up. Named
 * for the harness rather than for the golden path, because the acceptance run
 * throws it too.
 */
export class HarnessFailure extends Error {}

export class Report {
  private readonly lines: CheckLine[] = [];
  private readonly notes: string[] = [];
  private step = "-";

  /**
   * What the closing verdict calls this run. The golden path and the acceptance
   * run share this harness, and a summary that says GOLDEN PATH PASSED at the
   * end of one acceptance pass would misreport which proof just ran.
   */
  constructor(private readonly name = "Golden path") {}

  /** Starts a numbered step and prints its heading. */
  begin(step: string, title: string): void {
    this.step = step;
    process.stdout.write(`\n${step}. ${title}\n`);
  }

  /** Records an assertion. Throws on failure — the loop is a chain, so there is
   *  nothing useful to check after a broken link. */
  assert(label: string, passed: boolean, detail?: string): void {
    const line: CheckLine = { step: this.step, label, passed };
    if (detail !== undefined) line.detail = detail;
    this.lines.push(line);
    process.stdout.write(
      `   ${passed ? "[PASS]" : "[FAIL]"} ${label}${detail === undefined ? "" : ` — ${detail}`}\n`,
    );
    if (!passed) {
      throw new HarnessFailure(
        `${label}${detail === undefined ? "" : ` — ${detail}`}`,
      );
    }
  }

  /** Context that is worth printing but is not an assertion. */
  info(message: string): void {
    process.stdout.write(`   ·      ${message}\n`);
  }

  /** A finding worth repeating in the closing summary. Said once, not per call. */
  note(message: string): void {
    if (this.notes.includes(message)) return;
    this.notes.push(message);
    process.stdout.write(`   note   ${message}\n`);
  }

  get passed(): number {
    return this.lines.filter((line) => line.passed).length;
  }

  get failed(): number {
    return this.lines.filter((line) => !line.passed).length;
  }

  /** The closing block: every assertion, then the verdict. */
  print(headline: string[], failure?: Error): void {
    const rule = "=".repeat(78);
    process.stdout.write(`\n${rule}\nSUMMARY\n${rule}\n`);

    for (const line of this.lines) {
      const mark = line.passed ? "[PASS]" : "[FAIL]";
      process.stdout.write(
        `${mark} ${line.step.padEnd(3)} ${line.label}${line.detail === undefined ? "" : ` — ${line.detail}`}\n`,
      );
    }

    if (headline.length > 0) {
      process.stdout.write(`\n${"-".repeat(78)}\n`);
      for (const line of headline) process.stdout.write(`${line}\n`);
    }

    if (this.notes.length > 0) {
      process.stdout.write(`\nNotes\n`);
      for (const note of this.notes) process.stdout.write(`  - ${note}\n`);
    }

    process.stdout.write(`\n${rule}\n`);
    const verdict = this.name.toUpperCase();
    if (failure === undefined) {
      process.stdout.write(
        `${verdict} PASSED — ${this.passed} assertions, 0 failures.\n`,
      );
    } else {
      process.stdout.write(
        `${verdict} FAILED after ${this.passed} passing assertions.\n${failure.message}\n`,
      );
    }
    process.stdout.write(`${rule}\n`);
  }
}

/** Minutes for humans: one decimal, and Infinity said out loud. */
export function minutes(value: number | undefined): string {
  if (value === undefined) return "n/a";
  if (!Number.isFinite(value)) return "unbounded (no counter open)";
  return `${value.toFixed(1)} min`;
}
