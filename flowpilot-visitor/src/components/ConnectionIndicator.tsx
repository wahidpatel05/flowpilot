/**
 * A4's live-connection indicator: whether this screen's Realtime channels are
 * actually subscribed, so a Visitor knows whether to trust what's on screen.
 * "connecting" (the brief moment before the first subscribe result) reads the
 * same as "reconnecting" — both mean "don't fully trust this yet" — so they
 * share one word rather than a rarely-seen third label.
 *
 * Same dot-plus-word shape as HealthIndicator, for the same reason: colour
 * alone would leave a colour-blind Visitor, or one in bright sunlight, unable
 * to read it.
 */
import { StyleSheet, Text, View } from "react-native";
import type { ConnectionState } from "../token/connectionState";
import { colors, spacing } from "../theme";

interface ConnectionIndicatorProps {
  state: ConnectionState;
}

export function ConnectionIndicator({ state }: ConnectionIndicatorProps) {
  const isLive = state === "live";
  const tint = isLive ? colors.green : colors.grey;
  const label = isLive ? "Live" : "Reconnecting…";

  return (
    <View style={styles.row} accessibilityLabel={`Connection: ${label}`}>
      <View style={[styles.dot, { backgroundColor: tint }]} />
      <Text style={[styles.label, { color: tint }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
  },
});
