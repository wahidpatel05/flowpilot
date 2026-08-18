/**
 * One Service, as a Visitor deciding whether to join reads it.
 *
 * Follows the design's Service card: name, a meta line of queue and wait, the
 * Health indicator, and a one-tap Join Queue button — SRS user story 4 ("join a
 * queue with one tap"). A Service showing "Closed" can still be joined: waiting
 * for a Counter to open is a real state, not an error, and the Token screen
 * will say so honestly once joined.
 */
import { StyleSheet, Text, View } from "react-native";
import type { ServiceCardModel } from "../facility/catalogue";
import { HealthIndicator } from "./HealthIndicator";
import { Button } from "./Button";
import { NeoBox } from "./NeoBox";
import { colors, healthColor, radius, spacing } from "../theme";

interface ServiceCardProps {
  service: ServiceCardModel;
  onJoin: (service: ServiceCardModel) => void;
  /** TRUE while this Service's own join request is in flight. */
  isJoining: boolean;
  /** TRUE while any Service is being joined, so a second tap can't race it. */
  disabled: boolean;
}

export function ServiceCard({ service, onJoin, isJoining, disabled }: ServiceCardProps) {
  // A closed Service gets the same grey the dot below uses, not a colour that
  // implies something is wrong with the queue.
  const accentColor = service.isOpen ? healthColor[service.health] : colors.grey;

  return (
    <NeoBox
      radius={radius.lg}
      style={styles.card}
      accessible
      accessibilityRole="summary"
      accessibilityLabel={`${service.name}. ${service.metaLabel}. Health: ${service.healthLabel}.`}
    >
      <View style={[styles.accent, { backgroundColor: accentColor }]} />
      <Text style={styles.name} numberOfLines={2}>
        {service.name}
      </Text>
      <Text style={[styles.meta, !service.isOpen && styles.metaClosed]}>
        {service.metaLabel}
      </Text>
      <View style={styles.footer}>
        <HealthIndicator
          health={service.health}
          healthLabel={service.healthLabel}
          isOpen={service.isOpen}
        />
        <View style={styles.joinButton}>
          <Button
            label="Join Queue"
            onPress={() => onJoin(service)}
            disabled={disabled}
            loading={isJoining}
            accessibilityLabel={`Join the queue for ${service.name}`}
          />
        </View>
      </View>
    </NeoBox>
  );
}

const styles = StyleSheet.create({
  card: {
    justifyContent: "center",
    gap: spacing.xs + 2,
    paddingTop: spacing.md + 4,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.md,
    overflow: "hidden",
  },
  // The folder-tab motif from the reference boards, reused as the Health
  // signal: a coloured strip along the card's own top edge rather than a
  // separate protruding shape, so it never fights the card's hard shadow.
  accent: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 6,
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
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.xs,
  },
  // Caps the shared button's width so it sits beside the Health indicator
  // rather than stretching across the card.
  joinButton: {
    minWidth: 128,
  },
});
