/**
 * The design's screen-transition motion — a soft slide-up-and-fade played
 * once when a screen mounts — applied here to the catalogue/Live Token swap
 * in App.tsx, which has no navigation library to animate this for it. Skips
 * the animation entirely under Reduced Motion rather than just shortening it.
 */
import { useEffect, useRef, type ReactNode } from "react";
import { AccessibilityInfo, Animated, StyleSheet } from "react-native";

const DURATION_MS = 260;
const OFFSET = 16;

interface ScreenTransitionProps {
  children: ReactNode;
}

export function ScreenTransition({ children }: ScreenTransitionProps) {
  const opacity = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduced) => {
        if (cancelled || reduced) return;
        opacity.setValue(0);
        translateY.setValue(OFFSET);
        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 1,
            duration: DURATION_MS,
            useNativeDriver: true,
          }),
          Animated.timing(translateY, {
            toValue: 0,
            duration: DURATION_MS,
            useNativeDriver: true,
          }),
        ]).start();
      })
      .catch(() => {
        // Reduced-motion query unsupported on this platform — leave the
        // screen at its resting, fully-visible values, no animation.
      });
    return () => {
      cancelled = true;
    };
  }, [opacity, translateY]);

  return (
    <Animated.View style={[styles.fill, { opacity, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});
