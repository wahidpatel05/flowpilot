/**
 * One Service, as a Visitor deciding whether to join reads it.
 *
 * Follows the design's Service card: name, a meta line of queue and wait, and
 * the status indicator underneath. Read-only by design — joining a queue
 * arrives with A2, and a card that looked tappable and did nothing would be
 * worse than one that never invited the tap.
 */
import { StyleSheet, Text, View } from "react-native";
import type { ServiceCardModel } from "../facility/catalogue";
import { StatusIndicator } from "./StatusIndicator";
import { MIN_TOUCH_TARGET, colors, radius, spacing } from "../theme";

interface ServiceCardProps {
  service: ServiceCardModel;
}

export function ServiceCard({ service }: ServiceCardProps) {
  return (
    <View
      style={styles.card}
      accessible
      accessibilityRole="summary"
      accessibilityLabel={`${service.name}. ${service.metaLabel}. Status: ${service.statusLabel}.`}
    >
      <Text style={styles.name} numberOfLines={2}>
        {service.name}
      </Text>
      <Text style={[styles.meta, !service.isOpen && styles.metaClosed]}>
        {service.metaLabel}
      </Text>
      <StatusIndicator
        health={service.health}
        statusLabel={service.statusLabel}
        isOpen={service.isOpen}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: MIN_TOUCH_TARGET * 1.6,
    justifyContent: "center",
    gap: spacing.xs + 2,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  name: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "600",
  },
  meta: {
    color: colors.muted,
    fontSize: 14,
  },
  metaClosed: {
    fontStyle: "italic",
  },
});
