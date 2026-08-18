/**
 * "Your wait just got shorter" — the plain statement A3 requires alongside
 * the number changing. Fades in, holds, fades out once; never idle motion
 * once visible, and invisible (unmounted) the rest of the time.
 */
import { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text } from "react-native";
import { colors, neo, radius, spacing } from "../theme";
import { useFireOnce } from "../token/useFireOnce";

const FADE_IN_MS = 220;
const HOLD_MS = 2400;
const FADE_OUT_MS = 320;

interface ImprovementBannerProps {
  /** Changes identity exactly when the banner should play; null shows nothing. */
  triggerKey: number | null;
}

export function ImprovementBanner({ triggerKey }: ImprovementBannerProps) {
  const [visible, setVisible] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;
  // Entrance is a pop rather than a plain fade, matching the design's
  // notification "Pop Bounce" motion; the exit stays a plain fade.
  const scale = useRef(new Animated.Value(0.9)).current;
  const isMountedRef = useRef(true);
  useEffect(
    () => () => {
      isMountedRef.current = false;
      opacity.stopAnimation();
      scale.stopAnimation();
    },
    [opacity, scale],
  );

  useFireOnce(triggerKey, () => {
    setVisible(true);
    opacity.setValue(0);
    scale.setValue(0.9);
    Animated.sequence([
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: FADE_IN_MS,
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          useNativeDriver: true,
          speed: 14,
          bounciness: 10,
        }),
      ]),
      Animated.delay(HOLD_MS),
      Animated.timing(opacity, {
        toValue: 0,
        duration: FADE_OUT_MS,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished && isMountedRef.current) setVisible(false);
    });
  });

  if (!visible) return null;

  return (
    <Animated.View
      style={[styles.banner, { opacity, transform: [{ scale }] }]}
      accessibilityLiveRegion="polite"
      accessibilityRole="text"
    >
      <Text style={styles.text}>Your wait just got shorter</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.green,
    borderWidth: neo.borderWidth,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  text: {
    color: colors.card,
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
  },
});
