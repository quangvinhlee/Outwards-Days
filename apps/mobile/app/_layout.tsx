import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { StoreProvider } from "../src/context";
import { colors } from "../src/ui";
export default function Layout() {
  return (
    <StoreProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.paper },
          headerTintColor: colors.ink,
          headerShadowVisible: false,
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="onboarding/index"
          options={{ title: "Your kind of outside" }}
        />
        <Stack.Screen name="account/index" options={{ title: "Your account" }} />
        <Stack.Screen
          name="schedule/[weekStart]"
          options={{ title: "Your week" }}
        />
        <Stack.Screen
          name="places/index"
          options={{ title: "Nearby outdoors" }}
        />
        <Stack.Screen
          name="activity/[id]"
          options={{ title: "A little room for outside" }}
        />
      </Stack>
    </StoreProvider>
  );
}
