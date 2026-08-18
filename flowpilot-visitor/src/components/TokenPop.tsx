/**
 * The reference's Booking-Success confetti, re-scoped to the moment this app
 * actually has: a fresh Token appearing on the Live Token screen right after
 * joining. Plays once — the parent mounts this only when `justJoined` was
 * true at that screen's own mount (frozen there, not re-derived), and
 * unmounts it once `onDone` fires. Independent of the particle animation,
 * same reasoning as the improvement moment's haptic: a motion-reduced
 * Visitor still gets the confirming buzz.
 */
import { useEffect, useRef } from "react";
import { AccessibilityInfo, Animated, Easing, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import { colors } from "../theme";

interface TokenPopProps {
  onDone: () => void;
}

const PARTICLE_COUNT = 12;
const PARTICLE_COLORS = [colors.purple, colors.pink, colors.green, colors.primary];
const DURATION_MS = 700;

interface Particle {
  color: string;
  dx: number;
  dy: number;
  rotate: number;
}

function randomParticles(): Particle[] {
  return Array.from({ length: PARTICLE_COUNT }).map((_, index) => {
    const angle = (index / PARTICLE_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
    const distance = 36 + Math.random() * 26;
    return {
      color: PARTICLE_COLORS[index % PARTICLE_COLORS.length],
      dx: Math.cos(angle) * distance,
      // Biased upward — a burst, not an even ring.
      dy: Math.sin(angle) * distance - 12,
      rotate: Math.round(Math.random() * 360),
    };
  });
}

export function TokenPop({ onDone }: TokenPopProps) {
  const progress = useRef(new Animated.Value(0)).current;
  const particles = useRef(randomParticles()).current;
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {
      // Non-fatal — no hardware support, permissions, or web.
    });

    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduced) => {
        if (cancelled) return;
        if (reduced) {
          onDoneRef.current();
          return;
        }
        Animated.timing(progress, {
          toValue: 1,
          duration: DURATION_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (finished) onDoneRef.current();
        });
      })
      .catch(() => {
        if (cancelled) return;
        Animated.timing(progress, {
          toValue: 1,
          duration: DURATION_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (finished) onDoneRef.current();
        });
      });

    return () => {
      cancelled = true;
      progress.stopAnimation();
    };
    // Plays exactly once per mount — no dependency on props that could re-fire it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View pointerEvents="none" style={styles.container}>
      {particles.map((particle, index) => {
        const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [0, particle.dx] });
        const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [0, particle.dy] });
        const opacity = progress.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] });
        const rotate = progress.interpolate({
          inputRange: [0, 1],
          outputRange: ["0deg", `${particle.rotate}deg`],
        });

        return (
          <Animated.View
            key={index}
            style={[
              styles.particle,
              {
                backgroundColor: particle.color,
                opacity,
                transform: [{ translateX }, { translateY }, { rotate }],
              },
            ]}
          />
        );
      })}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  particle: {
    position: "absolute",
    width: 7,
    height: 7,
    borderRadius: 2,
  },
});
