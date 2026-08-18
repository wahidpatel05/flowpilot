/**
 * The reference boards' queue-position scene: flat figures walking toward a
 * doorway, "you" picked out in the token badge's yellow so the two read as
 * the same signal. One scene reused across every waiting state — advancing,
 * approaching, next — rather than swapped illustrations per state, so a
 * change in standing always reads as *this* line moving, never a cut.
 *
 * The figures, the doorway and the approach arrow are SVG (see
 * ./illustrations), drawn from the same path data the website uses, so the
 * queue on the phone and the queue on Control are the same illustration.
 *
 * Three motions, matching the reference's animation strip: a gentle idle bob
 * (the queue is alive, not a static graphic), a forward nudge exactly when
 * `customersAhead` drops (no interaction, no timer — the same discipline
 * useLiveToken follows), and the dashed arrow pulsing toward the door once
 * Freedom Radius says the turn is approaching.
 */
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from "react-native";
import type { FreedomRadiusState } from "../token/freedomRadius";
import { colors, spacing } from "../theme";
import { PersonFigure } from "./illustrations/PersonFigure";
import { DoorwayArch } from "./illustrations/DoorwayArch";
import { ApproachArrow } from "./illustrations/ApproachArrow";

interface QueueLineIllustrationProps {
  customersAhead: number | null;
  freedomRadiusState: FreedomRadiusState | null;
}

/** The strangers ahead of you, in the illustration style's accent colours. */
const AHEAD_COLORS: readonly string[] = [colors.purple, colors.pink, colors.green];
const MAX_AHEAD_SHOWN = 3;
/** One bob driver per figure slot: the three ahead, plus you. */
const FIGURE_SLOTS = MAX_AHEAD_SHOWN + 1;
const YOU_SLOT = MAX_AHEAD_SHOWN;
const BOB_DISTANCE = 3;
const BOB_DURATION_MS = 900;
const PERSON_HEIGHT = 44;

export function QueueLineIllustration({
  customersAhead,
  freedomRadiusState,
}: QueueLineIllustrationProps) {
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduced) => {
        if (!cancelled) setReducedMotion(reduced);
      })
      .catch(() => {
        // Unsupported on this platform — default (false) is fine.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const isNext = freedomRadiusState === "turn-approaching";
  const aheadCount = isNext ? 0 : Math.max(0, Math.min(customersAhead ?? 0, MAX_AHEAD_SHOWN));

  // One bob value per figure slot, staggered so the line reads as a wave
  // rather than everyone bobbing in lockstep.
  const bobValues = useRef(
    Array.from({ length: FIGURE_SLOTS }, () => new Animated.Value(0)),
  ).current;

  useEffect(() => {
    if (reducedMotion) return;
    const loops = bobValues.map((value, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * 140),
          Animated.timing(value, {
            toValue: 1,
            duration: BOB_DURATION_MS,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: 0,
            duration: BOB_DURATION_MS,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      ),
    );
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [reducedMotion, bobValues]);

  const shift = useRef(new Animated.Value(0)).current;
  const previousAheadRef = useRef(customersAhead);
  useEffect(() => {
    const previous = previousAheadRef.current;
    if (
      previous !== null &&
      customersAhead !== null &&
      customersAhead < previous &&
      !reducedMotion
    ) {
      shift.setValue(-10);
      Animated.timing(shift, {
        toValue: 0,
        duration: 320,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    }
    previousAheadRef.current = customersAhead;
  }, [customersAhead, reducedMotion, shift]);

  const arrow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!isNext || reducedMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(arrow, {
          toValue: 1,
          duration: 500,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(arrow, {
          toValue: 0,
          duration: 500,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isNext, reducedMotion, arrow]);

  return (
    <View style={styles.row}>
      {Array.from({ length: aheadCount }, (_, index) => (
        <BobbingFigure
          key={index}
          color={AHEAD_COLORS[index % AHEAD_COLORS.length] ?? colors.purple}
          bob={bobValues[index]}
        />
      ))}

      <Animated.View style={{ transform: [{ translateX: shift }] }}>
        <BobbingFigure color={colors.primary} bob={bobValues[YOU_SLOT]} emphasis />
      </Animated.View>

      {isNext ? (
        <Animated.View
          style={[
            styles.arrow,
            {
              opacity: arrow,
              transform: [
                { translateX: arrow.interpolate({ inputRange: [0, 1], outputRange: [0, 8] }) },
              ],
            },
          ]}
        >
          <ApproachArrow />
        </Animated.View>
      ) : null}

      <DoorwayArch height={64} />
    </View>
  );
}

/**
 * `bob` is optional only to satisfy indexed access into the drivers array;
 * a missing driver falls back to a still figure rather than crashing the
 * whole scene.
 */
function BobbingFigure({
  color,
  bob,
  emphasis = false,
}: {
  color: string;
  bob: Animated.Value | undefined;
  emphasis?: boolean;
}) {
  const figure = <PersonFigure color={color} height={PERSON_HEIGHT} />;

  if (bob === undefined) {
    return <View style={emphasis ? styles.emphasis : undefined}>{figure}</View>;
  }

  const translateY = bob.interpolate({ inputRange: [0, 1], outputRange: [0, -BOB_DISTANCE] });
  // "You" stands slightly larger than the strangers, so the yellow figure is
  // findable in the line at a glance.
  const transform = emphasis ? [{ scale: 1.12 }, { translateY }] : [{ translateY }];

  return <Animated.View style={{ transform }}>{figure}</Animated.View>;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
  },
  emphasis: {
    transform: [{ scale: 1.12 }],
  },
  arrow: {
    marginBottom: spacing.md,
  },
});
