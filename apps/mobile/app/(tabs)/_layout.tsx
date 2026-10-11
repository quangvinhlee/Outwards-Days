import { Tabs } from "expo-router";
import { Text } from "react-native";
import { colors } from "../../src/ui";
export default function Layout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.green,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.white,
          borderTopColor: colors.line,
          height: 76,
          paddingTop: 7,
          paddingBottom: 13,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700", letterSpacing: 0.2 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Today",
          tabBarIcon: ({ color }) => (
            <Text style={{ color, fontSize: 24 }}>☼</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="week"
        options={{
          title: "Week",
          tabBarIcon: ({ color }) => (
            <Text style={{ color, fontSize: 22 }}>▦</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="you"
        options={{
          title: "You",
          tabBarIcon: ({ color }) => (
            <Text style={{ color, fontSize: 23 }}>◌</Text>
          ),
        }}
      />
    </Tabs>
  );
}
