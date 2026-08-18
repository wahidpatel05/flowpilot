/**
 * FlowPilot Visitor.
 *
 * One surface, deliberately: the Service catalogue. This app is the Visitor's
 * view of the facility, never all of FlowPilot on a phone.
 */
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ServiceCatalogueScreen } from "./src/screens/ServiceCatalogueScreen";

export default function App() {
  return (
    <SafeAreaProvider>
      {/* Dark glyphs: the Visitor ground is warm cream, not the Control dark. */}
      <StatusBar style="dark" />
      <ServiceCatalogueScreen />
    </SafeAreaProvider>
  );
}
