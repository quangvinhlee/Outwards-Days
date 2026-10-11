import React from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { DateTime } from "luxon";
import { missionsFor, type Activity } from "@outsideweek/contracts";
import { useApp } from "./context";
export const colors = {
  paper: "#F6F4EC",
  ink: "#203D33",
  muted: "#617168",
  green: "#285842",
  lime: "#E1EAB2",
  line: "#E2E3D8",
  white: "#FFFEFA",
  orange: "#A95436",
  sky: "#D8EBED",
};
export const categoryVisual: Record<Activity["category"], { label: string; glyph: string; background: string; foreground: string }> = {
  walk: { label: "WALK", glyph: "↝", background: "#DFEAD8", foreground: "#285842" },
  park: { label: "PARK VISIT", glyph: "♧", background: "#DDE8CF", foreground: "#315C3D" },
  garden: { label: "GARDENING", glyph: "✿", background: "#E8EDCF", foreground: "#576C35" },
  photography: { label: "PHOTOGRAPHY", glyph: "◉", background: "#E3E5DB", foreground: "#5A6254" },
  reading: { label: "OUTDOOR READING", glyph: "▤", background: "#F1E5CF", foreground: "#80633F" },
  cycling: { label: "CYCLING", glyph: "◌", background: "#D7EAEB", foreground: "#3B6971" },
  hiking: { label: "HIKING", glyph: "⌁", background: "#E1E8D1", foreground: "#426441" },
  exercise: { label: "MOVEMENT", glyph: "✧", background: "#E4E3EC", foreground: "#605C81" },
  picnic: { label: "PICNIC", glyph: "☼", background: "#F6E5D3", foreground: "#97633F" },
};
export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { paddingHorizontal: 22, paddingTop: 18, paddingBottom: 48, gap: 18 },
  eyebrow: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
    color: colors.muted,
    textTransform: "uppercase",
  },
  title: {
    fontSize: 36,
    fontWeight: "700",
    letterSpacing: -1.4,
    lineHeight: 41,
    color: colors.ink,
  },
  heading: {
    fontSize: 22,
    fontWeight: "600",
    letterSpacing: -0.5,
    color: colors.ink,
  },
  body: { fontSize: 16, lineHeight: 24, color: colors.muted },
  small: { fontSize: 13, lineHeight: 20, color: colors.muted },
  card: {
    backgroundColor: colors.white,
    borderRadius: 22,
    padding: 19,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.line,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  input: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    padding: 14,
    minHeight: 48,
    fontSize: 16,
    color: colors.ink,
  },
  button: {
    minHeight: 50,
    borderRadius: 15,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.green,
  },
  buttonText: { color: colors.white, fontSize: 15, fontWeight: "700" },
  chip: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 30,
    paddingHorizontal: 15,
    paddingVertical: 12,
    minHeight: 44,
  },
  hero: {
    height: 204,
    overflow: "hidden",
    backgroundColor: colors.sky,
    borderRadius: 24,
  },
  rule: { height: 1, backgroundColor: colors.line },
  badge: {
    backgroundColor: colors.lime,
    color: colors.ink,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    fontSize: 12,
    fontWeight: "600",
    alignSelf: "flex-start",
  },
  error: { backgroundColor: "#F7E8DC", padding: 14, borderRadius: 16, gap: 8 },
});
export function Button({
  label,
  onPress,
  secondary = false,
  disabled = false,
}: {
  label: string;
  onPress: () => unknown;
  secondary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={() => {
        Promise.resolve(onPress()).catch(() => {});
      }}
      style={({ pressed }) => [
        styles.button,
        secondary && {
          backgroundColor: colors.white,
          borderWidth: 1,
          borderColor: colors.line,
        },
        (disabled || pressed) && { opacity: 0.5 },
      ]}
    >
      <Text style={[styles.buttonText, secondary && { color: colors.ink }]}>
        {label}
      </Text>
    </Pressable>
  );
}
export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[
        styles.chip,
        selected && { backgroundColor: colors.lime, borderColor: colors.lime },
      ]}
    >
      <Text style={{ color: colors.ink, fontWeight: selected ? "700" : "400" }}>
        {label}
      </Text>
    </Pressable>
  );
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 7, flexGrow: 1 }}>
      <Text style={styles.small}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        style={styles.input}
        {...props}
      />
    </View>
  );
}
export function Landscape({ compact = false }: { compact?: boolean }) {
  return (
    <View style={[styles.hero, compact && { height: 132 }]}>
      <Image
        source={require("../assets/outside-path.jpg")}
        resizeMode="cover"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ width: "100%", height: "100%" }}
      />
      <View style={{ position: "absolute", left: 14, top: 14, maxWidth: "90%", backgroundColor: colors.white, borderRadius: 30, paddingHorizontal: 12, paddingVertical: 8 }}>
        <Text style={[styles.eyebrow, { color: colors.green, letterSpacing: 1.4, fontSize: 10 }]}>THE OUTDOORS IS CLOSER THAN YOU THINK</Text>
      </View>
    </View>
  );
}
export function Screen({ children, stack = false, showGlobalError = true }: { children: React.ReactNode; stack?: boolean; showGlobalError?: boolean }) {
  const app = useApp();
  return (
    <SafeAreaView style={styles.screen} edges={stack ? ["left", "right"] : ["top", "left", "right"]}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        {!stack ? <View style={styles.row}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
            <View style={{ width: 24, height: 24, borderRadius: 8, backgroundColor: colors.green, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: colors.white, fontWeight: "800", fontSize: 15 }}>↗</Text>
            </View>
            <Text style={[styles.eyebrow, { color: colors.ink, letterSpacing: 1.6 }]}>Outwards Days</Text>
          </View>
          <Text style={styles.small}>Go a little further</Text>
        </View> : null}
        {showGlobalError && app.error ? (
          <View style={styles.error}>
            <Text
              accessibilityRole="alert"
              style={[styles.small, { color: "#81472D" }]}
            >
              {app.error}
            </Text>
            <Button label="Refresh" secondary onPress={app.refresh} />
          </View>
        ) : null}
        {app.runId ? (
          <View style={[styles.card, styles.row]}>
            <ActivityIndicator color={colors.green} />
            <Text style={[styles.small, { flex: 1 }]}>
              Finding a little room for outside. You can leave this screen.
            </Text>
          </View>
        ) : null}
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}
export function ActivityCard({
  activity: a,
  timezone,
}: {
  activity: Activity;
  timezone: string;
}) {
  const when = DateTime.fromISO(a.start).setZone(timezone);
  const missions = a.missions ?? missionsFor(a.category, a.localDate, a.destination?.name, a.activityMinutes);
  const visual = categoryVisual[a.category];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${a.title}, ${when.toFormat("cccc h:mm a")}, ${a.totalMinutes} minutes total, ${a.state}`}
      onPress={() => router.push(`/activity/${a.id}`)}
      style={({ pressed }) => [styles.card, { padding: 0, overflow: "hidden", opacity: pressed ? 0.82 : 1 }]}
    >
      <View style={{ height: 5, backgroundColor: visual.foreground }} />
      <View style={{ flexDirection: "row", padding: 17, gap: 14, alignItems: "flex-start" }}>
        <View style={{ width: 55, height: 55, borderRadius: 18, backgroundColor: visual.background, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 30, color: visual.foreground, fontWeight: "600" }}>{visual.glyph}</Text>
        </View>
        <View style={{ flex: 1, gap: 7 }}>
          <View style={styles.row}>
            <Text style={[styles.eyebrow, { color: visual.foreground, letterSpacing: 1.1, fontSize: 10 }]}>{visual.label}</Text>
            <Text style={[styles.small, { color: colors.ink, fontWeight: "700" }]}>{when.toFormat("ccc h:mm a")}</Text>
          </View>
          <Text style={{ fontSize: 19, lineHeight: 24, color: colors.ink, fontWeight: "700", letterSpacing: -0.35 }}>{a.title}</Text>
          <Text style={styles.small} numberOfLines={1}>{a.destination ? `⌖  ${a.destination.name}` : a.category === "garden" ? "⌖  Your outdoor plants at home" : "⌖  A familiar outdoor spot"}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7, alignItems: "center" }}>
            <Text style={[styles.badge, { backgroundColor: visual.background, color: visual.foreground }]}>{a.totalMinutes} min total</Text>
            <Text style={[styles.small, { fontSize: 12 }]}>{missions.length} mini missions</Text>
            {a.long ? <Text style={[styles.small, { fontSize: 12 }]}>· day trip</Text> : null}
          </View>
          {a.state !== "suggested" ? <Text style={[styles.small, { color: visual.foreground, fontWeight: "700", textTransform: "capitalize" }]}>{a.state.replace("_", " ")}</Text> : null}
        </View>
        <Text style={{ fontSize: 20, color: colors.green, alignSelf: "center" }}>›</Text>
      </View>
    </Pressable>
  );
}
