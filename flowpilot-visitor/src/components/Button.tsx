/**
 * The design's button system: Primary (yellow fill), Secondary (white,
 * bordered), Tertiary (purple fill) and Text (label only) — one component so
 * every screen draws from the same four, rather than each screen inventing
 * its own "quiet" button.
 *
 * The three filled/bordered variants carry the neo-brutalist hard shadow (see
 * NeoBox) and, on press, slide into it — the button moves down-right onto the
 * black layer behind it and the shadow disappears, reading as "pressed flush
 * against the page" rather than a soft opacity dim. Text has no shadow to
 * press into, so it keeps a plain opacity dim instead.
 */
import { useRef, type ReactNode } from "react";
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { MIN_TOUCH_TARGET, colors, neo, radius, spacing } from "../theme";

export type ButtonVariant = "primary" | "secondary" | "tertiary" | "text";

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  /** Shows a spinner in place of the label; implies disabled. */
  loading?: boolean;
  accessibilityLabel?: string;
  /** Text variant only — colours the label for a destructive action (e.g. Leave queue). */
  danger?: boolean;
}

const VARIANT_STYLES: Record<ButtonVariant, { button: object; label: object }> = {
  primary: {
    button: { backgroundColor: colors.primary, borderWidth: neo.borderWidth, borderColor: colors.border },
    label: { color: colors.text },
  },
  secondary: {
    button: { backgroundColor: colors.card, borderWidth: neo.borderWidth, borderColor: colors.border },
    label: { color: colors.text },
  },
  tertiary: {
    button: { backgroundColor: colors.purple, borderWidth: neo.borderWidth, borderColor: colors.border },
    label: { color: colors.card },
  },
  text: {
    button: { backgroundColor: "transparent", minHeight: undefined, paddingHorizontal: spacing.sm },
    label: { color: colors.text, textDecorationLine: "underline" },
  },
};

const SHADOW_OFFSET = neo.shadowOffsetSmall;

export function Button({
  label,
  onPress,
  variant = "primary",
  disabled = false,
  loading = false,
  accessibilityLabel,
  danger = false,
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const variantStyle = VARIANT_STYLES[variant];
  const labelColor = (variantStyle.label as { color: string }).color;

  const content = loading ? (
    <ActivityIndicator color={labelColor} size="small" />
  ) : (
    <Text style={[styles.label, variantStyle.label, danger && styles.dangerLabel]}>{label}</Text>
  );

  if (variant === "text") {
    return (
      <Pressable
        onPress={onPress}
        disabled={isDisabled}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        hitSlop={8}
        style={({ pressed }) => [
          styles.button,
          variantStyle.button,
          pressed && !isDisabled && styles.pressedOpacity,
          isDisabled && styles.disabled,
        ]}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <PressIntoShadowButton
      onPress={onPress}
      disabled={isDisabled}
      accessibilityLabel={accessibilityLabel ?? label}
      style={[styles.button, variantStyle.button, isDisabled && styles.disabled]}
    >
      {content}
    </PressIntoShadowButton>
  );
}

interface PressIntoShadowButtonProps {
  children: ReactNode;
  onPress: () => void;
  disabled: boolean;
  accessibilityLabel: string;
  style: object;
}

function PressIntoShadowButton({
  children,
  onPress,
  disabled,
  accessibilityLabel,
  style,
}: PressIntoShadowButtonProps) {
  const press = useRef(new Animated.Value(0)).current;

  function animateTo(toValue: number) {
    Animated.timing(press, { toValue, duration: 90, useNativeDriver: true }).start();
  }

  const translate = press.interpolate({ inputRange: [0, 1], outputRange: [0, SHADOW_OFFSET] });

  return (
    <View style={styles.wrap}>
      <View pointerEvents="none" style={[styles.shadow, { top: SHADOW_OFFSET, left: SHADOW_OFFSET }]} />
      <Animated.View style={{ transform: [{ translateX: translate }, { translateY: translate }] }}>
        <Pressable
          onPress={onPress}
          onPressIn={() => animateTo(1)}
          onPressOut={() => animateTo(0)}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          android_ripple={{ color: colors.border }}
          style={style}
        >
          {children}
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "relative",
  },
  shadow: {
    position: "absolute",
    width: "100%",
    height: "100%",
    backgroundColor: colors.text,
    borderRadius: radius.md,
  },
  button: {
    minHeight: MIN_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
  },
  pressedOpacity: {
    opacity: 0.6,
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    fontSize: 15,
    fontWeight: "700",
  },
  dangerLabel: {
    color: colors.red,
  },
});
