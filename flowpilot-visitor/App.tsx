/**
 * DeQueue Visitor.
 *
 * Two surfaces, deliberately: the Service catalogue, and the Live Token screen
 * for whichever Token the Visitor currently holds. This app is the Visitor's
 * view of the facility, never all of DeQueue on a phone — no router library
 * is pulled in for two screens and one direction of travel.
 */
import { useCallback, useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import type { ServiceCardModel } from "./src/facility/catalogue";
import { ServiceCatalogueScreen } from "./src/screens/ServiceCatalogueScreen";
import { LiveTokenScreen } from "./src/screens/LiveTokenScreen";
import { StateMessage } from "./src/components/StateMessage";
import { ScreenTransition } from "./src/components/ScreenTransition";
import {
  clearActiveToken,
  loadActiveToken,
  saveActiveToken,
  type StoredToken,
} from "./src/token/activeTokenStorage";
import { joinQueue } from "./src/token/joinQueue";
import { getSupabaseClient } from "./src/supabase";
import { colors } from "./src/theme";

export default function App() {
  // undefined = still reading AsyncStorage; null = no Token held.
  const [activeToken, setActiveToken] = useState<StoredToken | null | undefined>(
    undefined,
  );
  const [joiningServiceId, setJoiningServiceId] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  // TRUE only for the Token this session just created — never for one loaded
  // back from AsyncStorage on launch. Read once by LiveTokenScreen at its own
  // mount (see its `justJoined` prop), so the pop animation plays exactly at
  // the moment a Token is generated, not on every relaunch with one held.
  const [justJoined, setJustJoined] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadActiveToken().then((stored) => {
      if (!cancelled) setActiveToken(stored);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleJoin = useCallback(async (service: ServiceCardModel) => {
    setJoinError(null);
    setJoiningServiceId(service.serviceId);
    try {
      const client = getSupabaseClient();
      const token = await joinQueue(client, { id: service.serviceId, name: service.name });
      const stored: StoredToken = {
        tokenId: token.id,
        serviceId: service.serviceId,
        serviceName: service.name,
      };
      await saveActiveToken(stored);
      setJustJoined(true);
      setActiveToken(stored);
    } catch (caught) {
      setJoinError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setJoiningServiceId(null);
    }
  }, []);

  const handleDone = useCallback(() => {
    void clearActiveToken();
    setActiveToken(null);
  }, []);

  return (
    <SafeAreaProvider>
      {/* Dark glyphs: the Visitor ground is warm cream, not the Control dark. */}
      <StatusBar style="dark" />
      {activeToken === undefined ? (
        <View style={styles.splash}>
          <StateMessage isLoading title="" />
        </View>
      ) : activeToken === null ? (
        <ScreenTransition key="catalogue">
          <ServiceCatalogueScreen
            onJoin={(service) => void handleJoin(service)}
            joiningServiceId={joiningServiceId}
            joinError={joinError}
          />
        </ScreenTransition>
      ) : (
        <ScreenTransition key="live-token">
          <LiveTokenScreen
            tokenId={activeToken.tokenId}
            serviceNameHint={activeToken.serviceName}
            justJoined={justJoined}
            onDone={handleDone}
          />
        </ScreenTransition>
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
