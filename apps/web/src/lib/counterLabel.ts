/**
 * What to call a Counter on the Desk.
 *
 * A Counter is a physical desk and does not belong to a Service — the binding
 * lives in `counter_assignments` and moves (docs/adr/0001). So "Counter 2 is
 * the examination desk" is only true right now, and this derives the label at
 * render time from the live projection rather than storing a Service on the
 * Counter.
 *
 * The Service leads, because that is what a clerk is actually picking. The
 * desk's own name still rides along: someone physically sitting at Counter 4
 * has to be able to find Counter 4 in the list, and after a reassignment the
 * Service name alone would no longer identify it.
 */

/** Separates the Service from the desk it is currently being served at. */
const SEPARATOR = " · ";

/** What an unbound desk is called — free to be opened, serving nobody yet. */
export const FREE_COUNTER_SUFFIX = "free desk";

export interface CounterLabelInput {
  /** The desk's own name, e.g. "Counter 4". */
  counterName: string;
  /** The Service it is bound to right now, or null when it is free. */
  serviceName: string | null;
}

export interface CounterLabel {
  /** The line to lead with: the Service, or the desk when it has none. */
  primary: string;
  /** The supporting line: the desk, or what "free" means. */
  secondary: string;
  /** Both together, for a single-line control like a `<select>` option. */
  full: string;
}

/**
 * A bound Counter reads "Examination Cell · Counter 2"; a free one reads
 * "Counter 4 · free desk". An empty or whitespace-only Service name is treated
 * as no binding, so a blank column can never render a dangling separator.
 */
export function counterLabel(input: CounterLabelInput): CounterLabel {
  const serviceName = input.serviceName?.trim() ?? "";

  if (serviceName.length === 0) {
    return {
      primary: input.counterName,
      secondary: FREE_COUNTER_SUFFIX,
      full: `${input.counterName}${SEPARATOR}${FREE_COUNTER_SUFFIX}`,
    };
  }

  return {
    primary: serviceName,
    secondary: input.counterName,
    full: `${serviceName}${SEPARATOR}${input.counterName}`,
  };
}
