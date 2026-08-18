/**
 * The reference boards' queue-position scene: flat figures walking toward a
 * doorway, "you" picked out in the token badge's yellow so the two read as
 * the same signal. One scene reused across every waiting state — advancing,
 * approaching, next — rather than swapped illustrations per state, so a
 * change in standing always reads as *this* line moving, never a cut.
 *
 * Three motions, matching the reference's animation strip: a gentle idle bob
 * (the queue is alive, not a static graphic), a forward nudge exactly when
 * `customersAhead` drops (no interaction, no timer — the same discipline
 * useLiveToken follows), and a pulsing arrow toward the door once Freedom
 * Radius says the turn is approaching.
 */
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from "react-native";
import type { FreedomRadiusState } from "../token/freedomRadius";
import { colors, neo } from "../theme";

interface QueueLineIllustrationProps {
  customersAhead: number | null;
  freedomRadiusState: FreedomRadiusState | null;
}

const AHEAD_COLORS = [colors.purple, colors.pink, colors.green];
const MAX_AHEAD_SHOWN = 3;
const BOB_DISTANCE = 3;
const BOB_DURATION_MS = 900;

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

  // One bob value per figure slot (3 "ahead" + "you"), staggered so the line
  // reads as a wave rather than everyone bobbing in lockstep.
  const bobValues = useRef([0, 1, 2, 3].map(() => new Animated.Value(0))).current;
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
      {Array.from({ length: aheadCount }).map((_, index) => (
        <Person key={index} color={AHEAD_COLORS[index % AHEAD_COLORS.length]} bob={bobValues[index]} />
      ))}
      <Animated.View style={{ transform: [{ translateX: shift }] }}>
        <Person color={colors.primary} bob={bobValues[3]} you />
      </Animated.View>
      {isNext && (
        <Animated.View
          style={[
            styles.arrowDot,
            {
              opacity: arrow,
              transform: [
                { translateX: arrow.interpolate({ inputRange: [0, 1], outputRange: [0, 10] }) },
              ],
            },
          ]}
        />
      )}
      <View style={styles.door} />
    </View>
  );
}

function Person({ color, bob, you = false }: { color: string; bob: Animated.Value; you?: boolean }) {
  const translateY = bob.interpolate({ inputRange: [0, 1], outputRange: [0, -BOB_DISTANCE] });
  const transform = you ? [{ scale: 1.12 }, { translateY }] : [{ translateY }];

  return (
    <Animated.View style={[styles.person, { transform }]}>
      <View style={styles.head} />
      <View style={[styles.body, { backgroundColor: color }]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
  },
  person: {
    alignItems: "center",
  },
  head: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  body: {
    width: 24,
    height: 28,
    marginTop: -2,
    borderRadius: 8,
    borderWidth: neo.borderWidth - 0.5,
    borderColor: colors.border,
  },
  // A small pip standing in for the reference's dashed arrow into the
  // doorway — a full dashed curve isn't worth a canvas/SVG dependency here.
  arrowDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.text,
    marginBottom: 16,
  },
  door: {
    width: 30,
    height: 52,
    marginLeft: 4,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    backgroundColor: colors.purple,
    borderWidth: neo.borderWidth,
    borderColor: colors.border,
  },
});
