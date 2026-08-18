/**
 * The design's status indicator, in FlowPilot's vocabulary: a coloured dot
 * beside the Health word, in the reference boards' bordered chip shape.
 *
 * The word is what makes this work — colour alone would leave a colour-blind
 * Visitor, or one in bright sunlight, unable to tell Busy from Critical. The
 * label is therefore solid black rather than tinted: the dot carries colour,
 * the word carries meaning.
 */
import { StyleSheet, Text, View } from "react-native";
import type { ServiceCardModel } from "../facility/catalogue";
import { colors, healthColor, neo, spacing } from "../theme";

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
    <View style={styles.badge}>
      <View style={[styles.dot, { backgroundColor: tint }]} />
      <Text style={styles.label}>{healthLabel}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: spacing.xs + 2,
    borderWidth: neo.borderWidth - 0.5,
    borderColor: colors.border,
    borderRadius: 999,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm + 2,
    backgroundColor: colors.card,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  label: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
});
