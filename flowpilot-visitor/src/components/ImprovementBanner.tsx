/**
 * "Your wait just got shorter" — the plain statement A3 requires alongside
 * the number changing. Fades in, holds, fades out once; never idle motion
 * once visible, and invisible (unmounted) the rest of the time.
 */
import { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text } from "react-native";
import { colors, radius, spacing } from "../theme";
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
  const isMountedRef = useRef(true);
  useEffect(
    () => () => {
      isMountedRef.current = false;
      opacity.stopAnimation();
    },
    [opacity],
  );

  useFireOnce(triggerKey, () => {
    setVisible(true);
    opacity.setValue(0);
    Animated.sequence([
      Animated.timing(opacity, {
        toValue: 1,
        duration: FADE_IN_MS,
        useNativeDriver: true,
      }),
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
      style={[styles.banner, { opacity }]}
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
