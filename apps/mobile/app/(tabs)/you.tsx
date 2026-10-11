import { Alert, Text, View } from "react-native";
import { router } from "expo-router";
import { useApp } from "../../src/context";
import { Button, Screen, colors, styles } from "../../src/ui";
export default function You() {
  const app = useApp();
  const completed = app.data.plans
    .flatMap((p) => p.activities)
    .filter((a) => ["completed", "partly_completed"].includes(a.state)).length;
  return (
    <Screen>
      <Text style={styles.eyebrow}>Your kind of outside</Text>
      <Text style={styles.title}>Your outside story.</Text>
      <View style={[styles.card, { backgroundColor: colors.green, borderColor: colors.green, paddingVertical: 26, gap: 10 }]}>
        <Text style={[styles.eyebrow, { color: colors.lime }]}>MOMENTS YOU MADE ROOM FOR</Text>
        <Text style={{ color: colors.white, fontSize: 55, fontWeight: "800", lineHeight: 60 }}>{completed}</Text>
        <Text style={[styles.body, { color: "#E4EDE3" }]}>A walk, a few pages, a pause. They all count.</Text>
        <Text style={[styles.badge, { backgroundColor: colors.lime }]}>{completed >= 10 ? "Curious explorer" : "Making room"}</Text>
      </View>
      <Button
        label="Edit interests & preferences"
        onPress={() => router.push("/onboarding")}
      />
      <Button
        label="Refresh & sync completions"
        secondary
        onPress={app.refresh}
      />
      {app.pending.map((q) => (
        <View key={q.id} style={styles.error}>
          <Text style={styles.small}>
            {q.status === "blocked"
              ? `Needs attention: ${q.error}`
              : "Completion saved on this phone · waiting to sync"}
          </Text>
        </View>
      ))}
      <Text style={styles.heading}>Past weeks</Text>
      {app.data.plans.map((p) => (
        <View style={styles.card} key={p.weekStart}>
          <Text style={styles.heading}>Week of {p.weekStart}</Text>
          <Text style={styles.small}>
            {
              p.activities.filter((a) =>
                ["completed", "partly_completed"].includes(a.state),
              ).length
            }{" "}
            outdoor moments completed
          </Text>
          {p.activities
            .filter((a) => !["replaced", "skipped"].includes(a.state))
            .map((a) => (
              <Text
                key={a.id}
                style={styles.body}
                onPress={() => router.push(`/activity/${a.id}`)}
              >
                {a.title} · {a.state.replace("_", " ")}
              </Text>
            ))}
        </View>
      ))}
      <Text style={styles.small}>
        Your guest identity belongs to this device. Availability and approximate
        area are sent to the backend. Model requests contain eligible time slots
        and preferences, not your raw commitments. Forecasts: Open-Meteo.
        Discovery: SerpApi when configured.
      </Text>
      <Button
        label="Delete my data"
        secondary
        disabled={app.busy}
        onPress={() =>
          Alert.alert(
            "Delete your Outwards Days data?",
            "This removes your server records, local plans, queued completions and guest identity. It cannot be undone.",
            [
              { text: "Keep my data", style: "cancel" },
              {
                text: "Delete",
                style: "destructive",
                onPress: () => void app.deleteData().catch(() => {}),
              },
            ],
          )
        }
      />
    </Screen>
  );
}
