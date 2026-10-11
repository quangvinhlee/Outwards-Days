import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { DateTime } from "luxon";
import { useApp } from "../../src/context";
import { ActivityCard, Button, Landscape, Screen, colors, styles } from "../../src/ui";
export default function Today() {
  const app = useApp();
  const { data } = app;
  if (!app.ready)
    return (
      <Screen>
        <ActivityIndicator />
      </Screen>
    );
  if (!data.preferences.version)
    return (
      <Screen>
        <Text style={styles.eyebrow}>Small plans. Good days.</Text>
        <Text style={styles.title}>A little more outside starts here.</Text>
        <Landscape />
        <Text style={styles.body}>
          Tell us when you’re busy. We’ll help you find outdoor moments that fit
          the time you actually have.
        </Text>
        <Button
          label="Make room for outside"
          onPress={() => router.push("/onboarding")}
        />
        <Text style={styles.small}>
          No password. No pressure. Just your kind of fresh air.
        </Text>
      </Screen>
    );
  const today = DateTime.now().setZone(data.preferences.timezone).toISODate();
  const plan = data.plans.find((p) => p.weekStart === data.weekStart);
  const activities =
    plan?.activities.filter(
      (a) => !["skipped", "replaced"].includes(a.state),
    ) ?? [];
  const next =
    activities.find((a) => a.localDate === today) ??
    activities.find((a) => Date.parse(a.start) > Date.now());
  const done = activities.filter((a) =>
    ["completed", "partly_completed"].includes(a.state),
  ).length;
  return (
    <Screen>
      <Text style={styles.eyebrow}>
        {DateTime.now()
          .setZone(data.preferences.timezone)
          .toFormat("cccc, d MMMM")}
      </Text>
      <Text style={styles.title}>There's more outside.</Text>
      <Landscape />
      <View style={[styles.card, { gap: 10, backgroundColor: "#EAF0DD", borderColor: "#EAF0DD" }]}>
        <View style={styles.row}>
          <View style={{ gap: 3 }}>
            <Text style={[styles.eyebrow, { color: colors.green }]}>YOUR WEEK SO FAR</Text>
            <Text style={[styles.heading, { fontSize: 20 }]}>{done} outdoor {done === 1 ? "moment" : "moments"}</Text>
          </View>
          <Text style={{ color: colors.green, fontWeight: "800", fontSize: 21 }}>{done} / {data.preferences.daysPerWeek}</Text>
        </View>
        <View style={{ height: 8, backgroundColor: "#D4DFC2", borderRadius: 8, overflow: "hidden" }}>
          <View style={{ height: 8, width: `${Math.min(100, Math.round(done / data.preferences.daysPerWeek * 100))}%`, backgroundColor: colors.green, borderRadius: 8 }} />
        </View>
        <Text style={styles.small}>Every outing counts. There's no streak to lose.</Text>
      </View>
      {!data.confirmed && !app.later ? (
        <View style={styles.card}>
          <Text style={styles.heading}>What does your week look like?</Text>
          <Text style={styles.body}>
            A fresh week deserves a quick check. Your past plans stay in your
            history.
          </Text>
          <Button
            label="Confirm this week"
            onPress={() => router.push(`/schedule/${data.weekStart}`)}
          />
          <Button label="Later" secondary onPress={() => app.setLater(true)} />
        </View>
      ) : null}
      {!data.confirmed && app.later ? (
        <Button
          label="Plan this week when you’re ready"
          secondary
          onPress={() => router.push(`/schedule/${data.weekStart}`)}
        />
      ) : null}
      {next ? (
        <>
          <View style={styles.row}>
            <Text style={styles.heading}>{next.localDate === today ? "Today's idea" : "Coming up next"}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="View full week" onPress={() => router.push("/week")} style={{ minHeight: 44, justifyContent: "center" }}><Text style={[styles.small, { color: colors.green, fontWeight: "700" }]}>Full week ↗</Text></Pressable>
          </View>
          <ActivityCard activity={next} timezone={data.preferences.timezone} />
        </>
      ) : (
        <View style={styles.card}>
          <Text style={styles.heading}>Leave a little space.</Text>
          <Text style={styles.body}>
            {plan?.notice ??
              "Confirm your schedule, then find a few achievable ways to get outside."}
          </Text>
          {data.confirmed ? (
            <Button
              label="Find my outdoor moments"
              disabled={app.busy || !!app.runId}
              onPress={app.generate}
            />
          ) : null}
        </View>
      )}
      {plan ? <Text style={styles.small}>{plan.notice}</Text> : null}
      {app.pending.length ? <Text style={styles.small}>A completion is waiting to sync.</Text> : null}
    </Screen>
  );
}
