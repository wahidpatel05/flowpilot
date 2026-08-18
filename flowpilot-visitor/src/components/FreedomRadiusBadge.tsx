/**
 * Freedom Radius's visual: which of the three guidance states applies right
 * now. Turn-approaching is deliberately the loudest — filled red, white text —
 * since AC requires it to read as a stronger signal than the other two, which
 * stay quiet (outlined / tinted) so they don't compete with the ETA above them.
 * Static, no idle motion — a badge that changes value already draws the eye.
 */
import { StyleSheet, Text, View } from "react-native";
import { FREEDOM_RADIUS_LABEL, type FreedomRadiusState } from "../token/freedomRadius";
import { colors, neo, radius, spacing } from "../theme";

interface FreedomRadiusBadgeProps {
  state: FreedomRadiusState;
}

const BADGE_STYLE: Record<FreedomRadiusState, { background: string; text: string }> = {
  "free-to-leave": { background: colors.card, text: colors.muted },
  "stay-nearby": { background: colors.primary, text: colors.text },
  "turn-approaching": { background: colors.red, text: colors.card },
};

export function FreedomRadiusBadge({ state }: FreedomRadiusBadgeProps) {
  const tone = BADGE_STYLE[state];

  return (
    <View style={[styles.badge, { backgroundColor: tone.background }]}>
      <Text style={[styles.text, { color: tone.text }]}>{FREEDOM_RADIUS_LABEL[state]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderWidth: neo.borderWidth,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
  },
  text: {
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
  },
});
