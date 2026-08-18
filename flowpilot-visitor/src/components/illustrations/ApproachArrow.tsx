/**
 * The dashed curve sweeping from "you" into the doorway, shown only once
 * Freedom Radius says the turn is approaching.
 *
 * This is the piece the previous View-based illustration explicitly gave up on
 * ("a full dashed curve isn't worth a canvas/SVG dependency here") and settled
 * for a single dot instead. It is the one element in the scene that carries
 * direction — without it the figures are merely near the door rather than
 * heading through it — so with SVG available it is drawn properly: a bezier
 * with a real arrowhead, dashed to read as movement rather than a fixed rail.
 */
import Svg, { Path } from "react-native-svg";
import { colors } from "../../theme";

interface ApproachArrowProps {
  width?: number;
  height?: number;
}

export function ApproachArrow({ width = 34, height = 26 }: ApproachArrowProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 34 26">
      <Path
        d="M2 20C8 20 12 14 16 9c2.6-3.3 5.4-5 8.5-5.6"
        fill="none"
        stroke={colors.text}
        strokeWidth={2}
        strokeLinecap="round"
        strokeDasharray="4 4"
      />
      <Path
        d="M21 1.5l5 2-3.4 4"
        fill="none"
        stroke={colors.text}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
