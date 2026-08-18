/**
 * The design's Modal / Bottom Sheet pattern: a scrim over a fade-in card,
 * used wherever a destructive action needs confirming (e.g. Leave queue).
 * RN's built-in `Modal` fade animation already respects the OS reduced-motion
 * setting, so no custom Animated timing is needed here.
 */
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "./Button";
import { colors, neo, radius, spacing } from "../theme";

interface ConfirmModalProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.scrim} onPress={onCancel} accessibilityLabel="Dismiss">
        {/* Swallow taps on the card itself so they don't fall through to the scrim's dismiss. */}
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <View style={styles.actions}>
            <Button label={cancelLabel} variant="secondary" onPress={onCancel} />
            <Button label={confirmLabel} variant="text" danger onPress={onConfirm} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: "rgba(17, 17, 17, 0.5)",
    justifyContent: "flex-end",
  },
  card: {
    backgroundColor: colors.card,
    borderWidth: neo.borderWidth,
    borderColor: colors.border,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
  },
  message: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.md,
  },
});
