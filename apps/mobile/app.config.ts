export default {
  expo: {
    name: "Outwards Days",
    slug: "outwards-days",
    scheme: "outsideweek",
    version: "0.1.0",
    orientation: "portrait",
    web: { bundler: "metro", output: "single" },
    userInterfaceStyle: "light",
    ios: { supportsTablet: true, bundleIdentifier: "app.outsideweek.mobile" },
    android: { package: "app.outsideweek.mobile" },
    plugins: [
      "expo-router",
      "expo-sqlite",
      "expo-secure-store",
      "expo-status-bar",
      ["expo-image-picker", { cameraPermission: "Allow Outwards Days to take photos for optional outdoor missions.", microphonePermission: false }],
      ["expo-notifications", { color: "#234E3D" }],
      [
        "expo-location",
        {
          locationWhenInUsePermission:
            "Use your approximate area to show outdoor conditions.",
        },
      ],
    ],
    experiments: { typedRoutes: false },
  },
};
