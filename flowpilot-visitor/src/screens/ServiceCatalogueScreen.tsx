/**
 * FlowPilot Visitor — home.
 *
 * Asks the Visitor what they need, then answers it with every Service and its
 * current wait, queue and Health. This is the whole app for now, and it stays
 * the whole app: no dashboards, no simulation controls, no analytics. Those
 * belong to Control, on a screen someone is paid to watch.
 */
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ServiceCard } from "../components/ServiceCard";
import { useServiceCatalogue } from "../facility/useServiceCatalogue";
import { MIN_TOUCH_TARGET, colors, radius, spacing } from "../theme";

export function ServiceCatalogueScreen() {
  const { services, isLoading, isRefreshing, error, refresh } =
    useServiceCatalogue();

  return (
    <SafeAreaView style={styles.screen}>
      <FlatList
        data={services}
        keyExtractor={(service) => service.serviceId}
        renderItem={({ item }) => <ServiceCard service={item} />}
        contentContainerStyle={styles.content}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.eyebrow}>FlowPilot</Text>
            <Text style={styles.question}>What do you need today?</Text>
            <Text style={styles.subtitle}>
              Live waits across the facility. Pull down to refresh.
            </Text>
          </View>
        }
        ListEmptyComponent={
          <EmptyState isLoading={isLoading} error={error} onRetry={refresh} />
        }
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refresh}
            tintColor={colors.text}
            colors={[colors.text]}
            progressBackgroundColor={colors.card}
          />
        }
      />
    </SafeAreaView>
  );
}

interface EmptyStateProps {
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
}

/**
 * One component for all three empty cases, because they are mutually exclusive
 * and a Visitor staring at a blank list needs to be told which one they are in.
 */
function EmptyState({ isLoading, error, onRetry }: EmptyStateProps) {
  if (isLoading) {
    return (
      <View style={styles.empty}>
        <ActivityIndicator color={colors.text} />
        <Text style={styles.emptyText}>Reading the facility…</Text>
      </View>
    );
  }

  if (error !== null) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>Couldn’t load the services</Text>
        {/* The PostgREST message names the table and policy — worth showing. */}
        <Text style={styles.emptyText}>{error}</Text>
        <Pressable
          onPress={onRetry}
          accessibilityRole="button"
          android_ripple={{ color: colors.border }}
          style={({ pressed }) => [styles.retry, pressed && styles.retryPressed]}
        >
          <Text style={styles.retryLabel}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>No services listed</Text>
      <Text style={styles.emptyText}>
        This facility has not published any services yet.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  header: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.xs,
  },
  eyebrow: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  question: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.4,
    marginTop: spacing.xs,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
    marginTop: spacing.xs,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.md,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "600",
    textAlign: "center",
  },
  emptyText: {
    color: colors.muted,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  // The design's Primary button: yellow fill, dark label, rounded.
  retry: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
  },
  retryPressed: {
    opacity: 0.85,
  },
  retryLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
});
