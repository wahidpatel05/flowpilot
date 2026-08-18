/**
 * The design's status indicator, in FlowPilot's vocabulary: a coloured dot
 * beside the Health word.
 *
 * The word is what makes this work — colour alone would leave a colour-blind
 * Visitor, or one in bright sunlight, unable to tell Busy from Critical.
 */
import { StyleSheet, Text, View } from "react-native";
import type { ServiceCardModel } from "../facility/catalogue";
import { colors, healthColor, spacing } from "../theme";

type HealthIndicatorProps = Pick<
  ServiceCardModel,
  "health" | "healthLabel" | "isOpen"
>;

export function HealthIndicator({
  health,
  healthLabel,
  isOpen,
}: HealthIndicatorProps) {
  // A closed Service is grey rather than red: nothing is wrong with the queue,
  // there is simply nobody serving it.
  const tint = isOpen ? healthColor[health] : colors.grey;

  return (
    <View style={styles.row}>
      <View style={[styles.dot, { backgroundColor: tint }]} />
      <Text style={[styles.label, { color: tint }]}>{healthLabel}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs + 2,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
  },
});
