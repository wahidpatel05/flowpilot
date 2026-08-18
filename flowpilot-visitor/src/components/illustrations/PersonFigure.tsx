/**
 * One flat, bold-outlined character — the same figure the website draws in
 * `apps/web/src/components/PersonIllustration.tsx`, down to the path data and
 * the 32x48 viewBox, so a queue rendered on the phone and the same queue
 * rendered on Control are visibly the same illustration rather than two
 * drawings that merely share a palette.
 *
 * Vector rather than the stack of rounded Views this replaced: the outline
 * stays a true 2px at any size, the silhouette survives scaling, and the
 * shapes the design actually asks for (a tapered body, a ground shadow) are
 * not expressible as border-radius on a box.
 */
import Svg, { Circle, Ellipse, Path } from "react-native-svg";
import { colors, neo } from "../../theme";

/** The accent colours the illustration style cycles through for a crowd. */
export const PERSON_PALETTE = [
  colors.primary,
  colors.pink,
  colors.purple,
  colors.green,
] as const;

interface PersonFigureProps {
  color: string;
  /** Rendered height in px; width follows the 2:3 viewBox ratio. */
  height?: number;
}

export function PersonFigure({ color, height = 48 }: PersonFigureProps) {
  const width = (height * 32) / 48;

  return (
    <Svg width={width} height={height} viewBox="0 0 32 48">
      {/* Contact shadow — keeps the figure standing on the ground rather than
          floating, at the same 8% the website uses. */}
      <Ellipse cx="16" cy="45" rx="10" ry="2.4" fill={colors.text} opacity={0.08} />
      <Path
        d="M8 47v-13c0-6.5 3.6-10.4 8-10.4s8 3.9 8 10.4v13"
        fill={color}
        stroke={colors.border}
        strokeWidth={neo.borderWidth}
        strokeLinejoin="round"
      />
      <Circle
        cx="16"
        cy="10"
        r="8"
        fill={color}
        stroke={colors.border}
        strokeWidth={neo.borderWidth}
      />
    </Svg>
  );
}
