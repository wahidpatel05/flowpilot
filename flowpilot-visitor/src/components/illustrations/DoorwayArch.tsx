/**
 * The arched doorway the queue is walking toward — the destination in the
 * reference boards' queue scene, and the thing that makes the row of figures
 * read as a *queue* rather than a row of people.
 *
 * Purple fill with the same black outline every other surface carries, plus
 * an inner arch so the opening reads as depth instead of a flat lozenge.
 */
import Svg, { Path } from "react-native-svg";
import { colors, neo } from "../../theme";

interface DoorwayArchProps {
  /** Rendered height in px; width follows the 2:3 viewBox ratio. */
  height?: number;
}

export function DoorwayArch({ height = 64 }: DoorwayArchProps) {
  const width = (height * 40) / 64;

  return (
    <Svg width={width} height={height} viewBox="0 0 40 64">
      {/* Outer arch: straight sides rising into a half-round head. */}
      <Path
        d="M3 63V21a17 17 0 0134 0v42z"
        fill={colors.purple}
        stroke={colors.border}
        strokeWidth={neo.borderWidth}
        strokeLinejoin="round"
      />
      {/* Inner opening, inset — the depth cue. */}
      <Path
        d="M11 63V22a9 9 0 0118 0v41z"
        fill={colors.card}
        opacity={0.22}
        stroke={colors.border}
        strokeWidth={neo.borderWidth - 0.75}
        strokeLinejoin="round"
      />
    </Svg>
  );
}
