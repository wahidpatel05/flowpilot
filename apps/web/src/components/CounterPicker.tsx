import type { CounterCatalogEntry } from "../hooks/useCounterCatalog";
import { counterLabel } from "../lib/counterLabel";
import { Select, type SelectOption } from "./Select";

export function CounterPicker({
  counters,
  selectedCounterId,
  onSelect,
  serviceNameForCounter,
}: {
  counters: CounterCatalogEntry[];
  selectedCounterId: string | null;
  onSelect: (counterId: string) => void;
  /**
   * The Service each Counter is bound to right now, or null when it is free.
   * Passed in rather than looked up here because the binding is live
   * projection state, and a Counter's Service can change under the Desk.
   */
  serviceNameForCounter: (counterId: string) => string | null;
}) {
  const options: SelectOption[] = counters.map((counter) => {
    const label = counterLabel({
      counterName: counter.name,
      serviceName: serviceNameForCounter(counter.id),
    });
    return { value: counter.id, primary: label.primary, secondary: label.secondary };
  });

  return (
    <div className="fp-desk-picker">
      <span className="fp-metric-label" id="fp-counter-picker-label">
        Working Counter
      </span>
      <Select
        options={options}
        value={selectedCounterId}
        onChange={onSelect}
        placeholder="Choose a Counter…"
        ariaLabel="Working Counter"
      />
    </div>
  );
}
