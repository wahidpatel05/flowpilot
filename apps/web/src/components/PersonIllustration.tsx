/** The four accent colours the illustration style cycles through for a crowd of strangers. */
export const PERSON_PALETTE = ["#FFD233", "#FF4DA6", "#7B61FF", "#22C55E"] as const;

/**
 * One flat, bold-outlined character — head, body, a hint of arms — in the
 * illustration style: minimal, flat colour fills, thick dark outline, no
 * gradients or shading. Colour is the only thing that varies between people.
 */
export function PersonIllustration({
  color,
  className,
  style,
}: {
  color: string;
  className?: string;
  /** Lets a caller stagger this figure's idle animation within a line. */
  style?: React.CSSProperties;
}) {
  return (
    <svg viewBox="0 0 32 48" className={className} style={style} aria-hidden="true">
      <ellipse cx="16" cy="45" rx="10" ry="2.4" fill="#111111" opacity="0.08" />
      <path
        d="M8 47v-13c0-6.5 3.6-10.4 8-10.4s8 3.9 8 10.4v13"
        fill={color}
        stroke="#111111"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="10" r="8" fill={color} stroke="#111111" strokeWidth="2" />
    </svg>
  );
}
