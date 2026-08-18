export type IconName =
  | "people"
  | "clock"
  | "counter"
  | "bell"
  | "refresh"
  | "check"
  | "search";

/** Line + Rounded icon style, 2px stroke, matching the design system. */
const PATH: Record<IconName, string> = {
  people: "M16 11a4 4 0 100-8 4 4 0 000 8zM8 11a3 3 0 100-6 3 3 0 000 6zM2 20c0-3.3 2.7-6 6-6s6 2.7 6 6M9 20c0-2.2.9-4.2 2.3-5.6A6 6 0 0122 20",
  clock: "M12 22a10 10 0 100-20 10 10 0 000 20zM12 6v6l4 2",
  counter: "M3 21h18M6 21V9l6-4 6 4v12M10 21v-6h4v6",
  bell: "M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9zM13.7 21a2 2 0 01-3.4 0",
  refresh: "M21 12a9 9 0 11-3-6.7M21 3v6h-6",
  check: "M5 13l4 4L19 7",
  search: "M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.35-4.35",
};

export function Icon({ name, size = 18, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={PATH[name]} />
    </svg>
  );
}
