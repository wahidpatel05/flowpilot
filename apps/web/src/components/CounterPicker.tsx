import type { CounterCatalogEntry } from "../hooks/useCounterCatalog";

export function CounterPicker({
  counters,
  selectedCounterId,
  onSelect,
}: {
  counters: CounterCatalogEntry[];
  selectedCounterId: string | null;
  onSelect: (counterId: string) => void;
}) {
  return (
    <label className="fp-desk-picker">
      <span className="fp-metric-label">Working Counter</span>
      <select
        className="fp-desk-select"
        value={selectedCounterId ?? ""}
        onChange={(event) => onSelect(event.target.value)}
      >
        <option value="" disabled>
          Choose a Counter…
        </option>
        {counters.map((counter) => (
          <option key={counter.id} value={counter.id}>
            {counter.name}
          </option>
        ))}
      </select>
    </label>
  );
}
