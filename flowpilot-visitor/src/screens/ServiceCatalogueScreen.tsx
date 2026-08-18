/**
 * DeQueue Visitor — home.
 *
 * Asks the Visitor what they need, then answers it with every Service and its
 * current wait, queue and Health, and a one-tap way to join. This is the whole
 * app for now, and it stays the whole app: no dashboards, no simulation
 * controls, no analytics. Those belong to Control, on a screen someone is
 * paid to watch.
 */
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StateMessage } from "../components/StateMessage";
import { ServiceCard } from "../components/ServiceCard";
import type { ServiceCardModel } from "../facility/catalogue";
import { useServiceCatalogue } from "../facility/useServiceCatalogue";
import { colors, spacing } from "../theme";

interface ServiceCatalogueScreenProps {
  onJoin: (service: ServiceCardModel) => void;
  /** The Service currently being joined, so only its own card shows a spinner. */
  joiningServiceId: string | null;
  joinError: string | null;
}

export function ServiceCatalogueScreen({
  onJoin,
  joiningServiceId,
  joinError,
}: ServiceCatalogueScreenProps) {
  const { services, isLoading, isRefreshing, error, refresh } =
    useServiceCatalogue();

  return (
    <SafeAreaView style={styles.screen}>
      <FlatList
        data={services}
        keyExtractor={(service) => service.serviceId}
        renderItem={({ item }) => (
          <ServiceCard
            service={item}
            onJoin={onJoin}
            isJoining={joiningServiceId === item.serviceId}
            disabled={joiningServiceId !== null}
          />
        )}
        contentContainerStyle={styles.content}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.eyebrow}>DeQueue</Text>
            <Text style={styles.question}>What do you need today?</Text>
            <Text style={styles.subtitle}>
              Live waits across the facility. Pull down to refresh.
            </Text>
            {joinError !== null && (
              <Text style={styles.joinError}>{joinError}</Text>
            )}
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <StateMessage isLoading title="Reading the facility…" />
          ) : error !== null ? (
            <StateMessage
              title="Couldn’t load the services"
              // The PostgREST message names the table and policy — worth showing.
              detail={error}
              retry={{ label: "Try again", onPress: refresh }}
            />
          ) : (
            <StateMessage
              title="No services listed"
              detail="This facility has not published any services yet."
            />
          )
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
  joinError: {
    color: colors.red,
    fontSize: 14,
    marginTop: spacing.sm,
  },
});
