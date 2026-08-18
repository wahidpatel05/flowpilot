/**
 * The design's Primary button: yellow fill, dark label, rounded. Three
 * screens need exactly this — a retry, Join Queue, and leaving a finished
 * Token — so it is one component rather than three copies of the same style.
 */
import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";
import { MIN_TOUCH_TARGET, colors, radius, spacing } from "../theme";

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** Shows a spinner in place of the label; implies disabled. */
  loading?: boolean;
  accessibilityLabel?: string;
}

export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  accessibilityLabel,
}: PrimaryButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      android_ripple={{ color: colors.border }}
      style={({ pressed }) => [
        styles.button,
        pressed && styles.pressed,
        isDisabled && styles.disabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.text} size="small" />
      ) : (
        <Text style={styles.label}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: MIN_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
});
