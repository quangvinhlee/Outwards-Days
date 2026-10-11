import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { DateTime } from "luxon";
import { router } from "expo-router";
import { useApp } from "../../src/context";
import { ActivityCard, Button, Landscape, Screen, colors, styles } from "../../src/ui";
import { api } from "../../src/api";
import type { Schedule } from "@outsideweek/contracts";
export default function Week() {
  const app = useApp();
  const { data } = app;
  const [nextWeek, setNextWeek] = useState(false);
  const [futureSchedule, setFutureSchedule] = useState<Schedule | null>(null);
  const weekStart = nextWeek && data.weekStart
    ? DateTime.fromISO(data.weekStart).plus({ weeks: 1 }).toISODate()!
    : data.weekStart;
  useEffect(() => {
    if (!nextWeek || !weekStart) return;
    void api<Schedule | null>(`/v1/schedules/${weekStart}`)
      .then(setFutureSchedule)
      .catch(() => setFutureSchedule(null));
  }, [nextWeek, weekStart, data.plans.length]);
  const confirmed = nextWeek ? !!futureSchedule?.confirmedAt : data.confirmed;
  const plan = data.plans.find((p) => p.weekStart === weekStart);
  const scheduled = plan?.activities.filter((a) => !["replaced", "skipped"].includes(a.state)).length ?? 0;
  return (
    <Screen>
      <View style={styles.row}>
        <View style={{ gap: 5, flex: 1 }}>
          <Text style={styles.eyebrow}>YOUR OUTDOOR WEEK</Text>
          <Text style={[styles.title, { fontSize: 32, lineHeight: 37 }]}>Make room for outside.</Text>
        </View>
        <View style={{ backgroundColor: colors.lime, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, alignItems: "center" }}>
          <Text style={{ color: colors.ink, fontSize: 21, fontWeight: "800" }}>{scheduled}</Text>
          <Text style={[styles.eyebrow, { fontSize: 9, letterSpacing: 1 }]}>IDEAS</Text>
        </View>
      </View>
      <Landscape compact />
      <View style={[styles.card, { gap: 13 }]}>
        <View style={styles.row}>
          <View style={{ gap: 3 }}>
            <Text style={styles.eyebrow}>{nextWeek ? "NEXT WEEK" : "THIS WEEK"}</Text>
            <Text style={[styles.heading, { fontSize: 19 }]}>{weekStart ? DateTime.fromISO(weekStart).toFormat("d MMM") : "Your week"} – {weekStart ? DateTime.fromISO(weekStart).plus({ days: 6 }).toFormat("d MMM") : ""}</Text>
          </View>
          {data.weekStart ? <Pressable accessibilityRole="button" accessibilityLabel={nextWeek ? "Show this week" : "Show next week"} onPress={() => setNextWeek((value) => !value)} style={{ minHeight: 44, justifyContent: "center" }}><Text style={[styles.small, { color: colors.green, fontWeight: "700" }]}>{nextWeek ? "This week ↗" : "Next week ↗"}</Text></Pressable> : null}
        </View>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Button
              label={confirmed ? "Edit schedule" : "Confirm schedule"}
              onPress={() => router.push(data.preferences.version ? `/schedule/${weekStart}` : "/onboarding")}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label={plan ? "Refresh plan" : "Find ideas"}
              secondary={confirmed}
              disabled={!confirmed || app.busy || !!app.runId}
              onPress={() => app.generate(weekStart)}
            />
          </View>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Explore nearby places" onPress={() => router.push("/places")} style={{ minHeight: 44, justifyContent: "center" }}><Text style={[styles.small, { color: colors.green, fontWeight: "700" }]}>Explore nearby places  ↗</Text></Pressable>
        {plan?.notice ? <Text style={[styles.small, { fontSize: 11, lineHeight: 16 }]}>{plan.notice}</Text> : null}
      </View>
      {Array.from({ length: 7 }, (_, i) => {
        const date = DateTime.fromISO(weekStart).plus({ days: i });
        const activities =
          plan?.activities.filter(
            (a) =>
              a.localDate === date.toISODate() &&
              !["replaced", "skipped"].includes(a.state),
          ) ?? [];
        return (
          <View key={i} style={{ gap: 9 }}>
            <View style={styles.row}>
              <Text style={[styles.heading, { fontSize: 18 }]}>{date.isValid ? date.toFormat("cccc") : `Day ${i + 1}`}</Text>
              <Text style={styles.small}>{date.isValid ? date.toFormat("d MMM") : ""}</Text>
            </View>
            {activities.length ? (
              activities.map((a) => (
                <ActivityCard
                  key={a.id}
                  activity={a}
                  timezone={data.preferences.timezone}
                />
              ))
            ) : (
              <View style={[styles.card, { padding: 14, backgroundColor: "#EEF0E6", borderColor: "#EEF0E6" }]}>
                <Text style={styles.small}>
                  {confirmed
                    ? "Open space · no outing planned"
                    : "Confirm this day to see what fits."}
                </Text>
              </View>
            )}
          </View>
        );
      })}
    </Screen>
  );
}
