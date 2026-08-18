/**
 * The dominant readout on the Live Token screen, and the improvement moment's
 * visual centre: when the value changes because `transitionKey` changed (an
 * ETA improvement), the old value slides up and fades out while the new one
 * slides up and fades in from below — one directional pass, played once,
 * never looping. Any other value change (worsening, called/serving text,
 * anything not carrying a new `transitionKey`) just swaps the text with no
 * motion — per A3's "a worsening or unchanged ETA does not trigger the
 * celebration."
 */
import { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text } from "react-native";
import { colors } from "../theme";

const TRANSITION_DURATION_MS = 420;
const SLIDE_DISTANCE = 18;

interface EtaHeadlineProps {
  value: string;
  /** Changes identity exactly when the crossfade should play; null plays none. */
  transitionKey: number | null;
  style?: object;
}

export function EtaHeadline({ value, transitionKey, style }: EtaHeadlineProps) {
  const [displayValue, setDisplayValue] = useState(value);
  const [outgoingValue, setOutgoingValue] = useState<string | null>(null);
  const progress = useRef(new Animated.Value(0)).current;
  const lastKeyRef = useRef<number | null>(transitionKey);

  useEffect(() => {
    if (transitionKey === null || transitionKey === lastKeyRef.current) {
      // No new improvement to animate — keep the text current, no motion.
      setDisplayValue(value);
      return;
    }
    lastKeyRef.current = transitionKey;
    setOutgoingValue(displayValue);
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: TRANSITION_DURATION_MS,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setDisplayValue(value);
        setOutgoingValue(null);
      }
    });
    // displayValue is read once at trigger time, not a reactive dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transitionKey, value]);

  if (outgoingValue === null) {
    return (
      <Text style={style} numberOfLines={1} adjustsFontSizeToFit>
        {displayValue}
      </Text>
    );
  }

  const outgoingStyle = {
    opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
    transform: [
      {
        translateY: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -SLIDE_DISTANCE],
        }),
      },
    ],
  };
  const incomingStyle = {
    opacity: progress,
    transform: [
      {
        translateY: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [SLIDE_DISTANCE, 0],
        }),
      },
    ],
  };

  return (
    <Animated.View style={styles.stack}>
      <Animated.Text style={[style, styles.layered, outgoingStyle]} numberOfLines={1}>
        {outgoingValue}
      </Animated.Text>
      <Animated.Text style={[style, incomingStyle]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  stack: {
    alignItems: "center",
    justifyContent: "center",
  },
  layered: {
    position: "absolute",
    color: colors.text,
  },
});
