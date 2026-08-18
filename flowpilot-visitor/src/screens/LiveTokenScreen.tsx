/**
 * FlowPilot Visitor — Live Token.
 *
 * The heart of the Visitor experience: Token number, then the one number that
 * matters, above the fold, updating with no interaction as capacity or the
 * queue ahead changes. See useLiveToken for what "no interaction" is built on.
 *
 * The improvement moment (A3) hangs off one value from that hook, `improvedAt`:
 * EtaHeadline plays the number crossfade, ImprovementBanner plays the "wait
 * just got shorter" message, and the effect below fires the success haptic —
 * three independent reactions to the same trigger, so a haptic failure (no
 * hardware support, permissions, web) can never block the other two.
 */
import { useEffect, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { StateMessage } from "../components/StateMessage";
import { HealthIndicator } from "../components/HealthIndicator";
import { PrimaryButton } from "../components/PrimaryButton";
import { EtaHeadline } from "../components/EtaHeadline";
import { ImprovementBanner } from "../components/ImprovementBanner";
import { useLiveToken } from "../token/useLiveToken";
import { colors, spacing } from "../theme";

interface LiveTokenScreenProps {
  tokenId: string;
  serviceNameHint: string;
  /** Called once the Visitor is done looking at a terminal Token. */
  onDone: () => void;
}

export function LiveTokenScreen({
  tokenId,
  serviceNameHint,
  onDone,
}: LiveTokenScreenProps) {
  const { model, isLoading, error, notFound, improvedAt } = useLiveToken(
    tokenId,
    serviceNameHint,
  );

  // Independent of the visual pieces: if haptics are unavailable (no
  // hardware, permissions, running on web), the crossfade and banner still
  // fire — the AC's explicit fallback.
  const lastHapticKeyRef = useRef<number | null>(improvedAt);
  useEffect(() => {
    if (improvedAt === null || improvedAt === lastHapticKeyRef.current) return;
    lastHapticKeyRef.current = improvedAt;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {
      // Non-fatal — see the file-level comment.
    });
  }, [improvedAt]);

  if (notFound) {
    // A stale local pointer — e.g. reset_demo() ran. Nothing to show; leave
    // quietly rather than displaying an error for a state that is ordinary.
    onDone();
    return null;
  }

  if (isLoading && model === null) {
    return (
      <SafeAreaView style={styles.screen}>
        <StateMessage isLoading title="Finding your Token…" />
      </SafeAreaView>
    );
  }

  if (error !== null && model === null) {
    return (
      <SafeAreaView style={styles.screen}>
        <StateMessage title="Couldn’t load your Token" detail={error} />
      </SafeAreaView>
    );
  }

  if (model === null) return null;

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <Text style={styles.tokenNumber}>{model.tokenNumber}</Text>
        <Text style={styles.serviceName}>{model.serviceName}</Text>

        <View style={styles.readout}>
          <EtaHeadline
            value={model.headline}
            transitionKey={improvedAt}
            style={styles.headline}
          />
          {model.subheadline !== "" && (
            <Text style={styles.subheadline}>{model.subheadline}</Text>
          )}
          <ImprovementBanner triggerKey={improvedAt} />
        </View>

        {model.health !== null && model.healthLabel !== null && (
          <HealthIndicator
            health={model.health}
            healthLabel={model.healthLabel}
            isOpen={model.etaMinutes !== null}
          />
        )}

        {model.isTerminal && (
          <View style={styles.doneButton}>
            <PrimaryButton label="Back to services" onPress={onDone} />
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    gap: spacing.sm,
  },
  tokenNumber: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  serviceName: {
    color: colors.muted,
    fontSize: 15,
    marginTop: spacing.xs,
  },
  // The dominant readout — everything else on the screen is context for this.
  readout: {
    alignItems: "center",
    marginTop: spacing.xl,
    gap: spacing.xs,
  },
  headline: {
    color: colors.text,
    fontSize: 56,
    fontWeight: "800",
    letterSpacing: -1,
  },
  subheadline: {
    color: colors.muted,
    fontSize: 16,
  },
  doneButton: {
    marginTop: spacing.xl,
    minWidth: 200,
  },
});
