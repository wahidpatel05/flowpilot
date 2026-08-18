/** A selectable filter tag — "Chips / Tags" from the design system. */
export function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="fp-chip"
      data-active={active ? "true" : undefined}
      aria-pressed={active}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
