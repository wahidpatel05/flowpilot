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
 *
 * A4 adds three more things off the same model: the Freedom Radius badge
 * (derived from status/ETA/position, not a timer), the connection indicator
 * (from useLiveToken's channel tracking), and Leave queue — an ordinary
 * status update, confirmed first since it can't be undone from here.
 */
import { useEffect, useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { StateMessage } from "../components/StateMessage";
import { HealthIndicator } from "../components/HealthIndicator";
import { PrimaryButton } from "../components/PrimaryButton";
import { EtaHeadline } from "../components/EtaHeadline";
import { ImprovementBanner } from "../components/ImprovementBanner";
import { FreedomRadiusBadge } from "../components/FreedomRadiusBadge";
import { ConnectionIndicator } from "../components/ConnectionIndicator";
import { cancelToken } from "../token/cancelToken";
import { deriveFreedomRadius } from "../token/freedomRadius";
import { useLiveToken } from "../token/useLiveToken";
import { getSupabaseClient } from "../supabase";
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
  const { model, isLoading, error, notFound, improvedAt, connectionState } = useLiveToken(
    tokenId,
    serviceNameHint,
  );
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

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

  async function handleLeaveQueue() {
    setCancelError(null);
    setIsCancelling(true);
    try {
      await cancelToken(getSupabaseClient(), tokenId);
      // No local state change here: the `tokens` subscription this same
      // Service is already on (see useLiveToken) picks up this row's own
      // update and refetches — one path for "the Token changed," not two.
    } catch (caught) {
      setCancelError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsCancelling(false);
    }
  }

  function confirmLeaveQueue() {
    Alert.alert("Leave this queue?", "You'll lose your place and will need to rejoin.", [
      { text: "Stay in queue", style: "cancel" },
      { text: "Leave queue", style: "destructive", onPress: () => void handleLeaveQueue() },
    ]);
  }

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

  const freedomRadiusState = deriveFreedomRadius({
    status: model.status,
    etaMinutes: model.etaMinutes,
    customersAhead: model.customersAhead,
  });

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <View style={styles.topRow}>
          <ConnectionIndicator state={connectionState} />
        </View>

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

        {freedomRadiusState !== null && (
          <View style={styles.freedomRadius}>
            <FreedomRadiusBadge state={freedomRadiusState} />
          </View>
        )}

        {!model.isTerminal && (
          <View style={styles.leaveQueue}>
            <Pressable
              onPress={confirmLeaveQueue}
              disabled={isCancelling}
              accessibilityRole="button"
              accessibilityLabel="Leave queue"
              hitSlop={8}
            >
              <Text style={[styles.leaveQueueLabel, isCancelling && styles.leaveQueueDisabled]}>
                {isCancelling ? "Leaving…" : "Leave queue"}
              </Text>
            </Pressable>
            {cancelError !== null && <Text style={styles.cancelError}>{cancelError}</Text>}
          </View>
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
  topRow: {
    width: "100%",
    alignItems: "flex-end",
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
  freedomRadius: {
    marginTop: spacing.md,
  },
  leaveQueue: {
    marginTop: spacing.lg,
    alignItems: "center",
    gap: spacing.xs,
  },
  leaveQueueLabel: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "600",
    textDecorationLine: "underline",
    paddingVertical: spacing.xs,
  },
  leaveQueueDisabled: {
    opacity: 0.5,
  },
  cancelError: {
    color: colors.red,
    fontSize: 13,
    textAlign: "center",
  },
  doneButton: {
    marginTop: spacing.xl,
    minWidth: 200,
  },
});
