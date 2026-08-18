/**
 * Loading / error / empty text, shared by every screen that reads the
 * facility. Extracted once the Live Token screen needed the same three
 * states the catalogue already had — one component, so the Visitor gets
 * the same wording and the same retry affordance everywhere.
 */
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Button } from "./Button";
import { colors, spacing } from "../theme";

interface StateMessageProps {
  title: string;
  detail?: string;
  isLoading?: boolean;
  retry?: { label: string; onPress: () => void };
}

export function StateMessage({ title, detail, isLoading, retry }: StateMessageProps) {
  return (
    <View style={styles.container}>
      {isLoading === true && <ActivityIndicator color={colors.text} />}
      <Text style={styles.title}>{title}</Text>
      {detail !== undefined && <Text style={styles.detail}>{detail}</Text>}
      {retry !== undefined && (
        <Button label={retry.label} onPress={retry.onPress} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "600",
    textAlign: "center",
  },
  detail: {
    color: colors.muted,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
});
