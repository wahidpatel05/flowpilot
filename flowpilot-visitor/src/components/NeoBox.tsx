/**
 * The neo-brutalist card shell: a solid black outline over a solid, unblurred
 * offset shadow — the "sticker" look from the design's reference boards.
 * A plain View can't get a hard-edged, cross-platform-identical shadow from
 * the shadow/elevation style props (Android always blurs), so this is faked with a second
 * View painted first, offset by `offset`, and sized to match via percentage
 * — the front layer is in normal flow and determines this box's footprint,
 * the back layer is absolutely positioned and takes no part in that sizing.
 */
import type { ReactNode } from "react";
import { StyleSheet, View, type AccessibilityRole, type ViewStyle } from "react-native";
import { colors, neo } from "../theme";

interface NeoBoxProps {
  children: ReactNode;
  radius: number;
  backgroundColor?: string;
  offset?: number;
  style?: ViewStyle;
  accessible?: boolean;
  accessibilityRole?: AccessibilityRole;
  accessibilityLabel?: string;
}

export function NeoBox({
  children,
  radius,
  backgroundColor = colors.card,
  offset = neo.shadowOffset,
  style,
  accessible,
  accessibilityRole,
  accessibilityLabel,
}: NeoBoxProps) {
  return (
    <View style={styles.wrap}>
      <View
        pointerEvents="none"
        style={[
          styles.shadow,
          { top: offset, left: offset, borderRadius: radius },
        ]}
      />
      <View
        accessible={accessible}
        accessibilityRole={accessibilityRole}
        accessibilityLabel={accessibilityLabel}
        style={[
          styles.front,
          { backgroundColor, borderRadius: radius },
          style,
        ]}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "relative",
  },
  shadow: {
    position: "absolute",
    width: "100%",
    height: "100%",
    backgroundColor: colors.text,
  },
  front: {
    borderWidth: neo.borderWidth,
    borderColor: colors.border,
  },
});
