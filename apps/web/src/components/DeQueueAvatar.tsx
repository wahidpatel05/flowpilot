export type AvatarMood = "idle" | "greeting" | "thinking" | "idea" | "alert" | "confused" | "excited";

interface MoodConfig {
  bg: string;
  mouth: string;
  badge: string | null;
  label: string;
}

const MOOD: Record<AvatarMood, MoodConfig> = {
  idle: { bg: "#EDEBFF", mouth: "M12 16q3 2 6 0", badge: null, label: "Idle" },
  greeting: { bg: "#FFF1B8", mouth: "M11 15q4 3 8 0", badge: null, label: "Greeting" },
  thinking: { bg: "#E6F0FF", mouth: "M12 16h5", badge: "M9 2a5 5 0 00-3 9v2h6v-2a5 5 0 00-3-9z M9 15h6 M10 18h4", label: "Thinking" },
  idea: { bg: "#FFF1B8", mouth: "M11 15q4 3 8 0", badge: "M12 2v2m0 16v2m10-10h-2M4 12H2m15.36-7.36l-1.41 1.41M6.05 17.95l-1.41 1.41m12.72 0l-1.41-1.41M6.05 6.05L4.64 4.64M12 7a5 5 0 100 10 5 5 0 000-10z", label: "Idea" },
  alert: { bg: "#FFE1E1", mouth: "M12 17h4", badge: "M12 2L2 20h20L12 2z M12 9v5 M12 17h.01", label: "Alert" },
  confused: { bg: "#F1F1F1", mouth: "M12 16q2 -2 4 0", badge: "M9.5 9a2.5 2.5 0 015 .4c0 1.6-2.5 2-2.5 3.6 M12 17h.01", label: "Confused" },
  excited: { bg: "#FFE0F0", mouth: "M10 15q3 4 6 0", badge: "M12 2l1.4 3.9L17 7l-3.6 1.1L12 12l-1.4-3.9L7 7l3.6-1.1L12 2z M4 15l.8 2.2L7 18l-2.2.8L4 21l-.8-2.2L1 18l2.2-.8L4 15z", label: "Excited" },
};

/**
 * DeQueue's assistant avatar — the face the engine wears while it decides.
 * Never speaks for the engine (Gemini never scores an Intervention); it only
 * reflects state the app already knows: generating a Recommendation, one
 * ready to review, a Service turning critical, an RPC failing, an approval
 * landing.
 */
export function DeQueueAvatar({
  mood,
  size = 40,
}: {
  mood: AvatarMood;
  size?: number;
}) {
  const config = MOOD[mood];

  return (
    <span className="fp-avatar" data-mood={mood} style={{ width: size, height: size }} title={config.label}>
      <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
        <circle cx="16" cy="16" r="16" fill={config.bg} />
        <path d="M8 13a8 8 0 0116 0v2H8v-2z" fill="#111111" />
        <circle cx="16" cy="17" r="7.5" fill="#FFE0B2" stroke="#111111" strokeWidth="1.6" />
        <circle cx="13" cy="17" r="1.1" fill="#111111" />
        <circle cx="19" cy="17" r="1.1" fill="#111111" />
        <path d={config.mouth} fill="none" stroke="#111111" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      {config.badge !== null ? (
        <span className="fp-avatar-badge" data-mood={mood} aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d={config.badge} />
          </svg>
        </span>
      ) : null}
      <span className="fp-visually-hidden">{config.label}</span>
    </span>
  );
}
