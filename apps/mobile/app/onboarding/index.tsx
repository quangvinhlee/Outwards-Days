import { useState } from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";
import * as Location from "expo-location";
import { Category, Preferences } from "@outsideweek/contracts";
import { useApp } from "../../src/context";
import { askReminders } from "../../src/reminders";
import { Button, Chip, Field, Screen, styles } from "../../src/ui";
export default function Onboarding() {
  const app = useApp();
  const [p, set] = useState(app.data.preferences);
  const [latitudeText, setLatitudeText] = useState(
    app.data.preferences.latitude?.toString() ?? "",
  );
  const [longitudeText, setLongitudeText] = useState(
    app.data.preferences.longitude?.toString() ?? "",
  );
  const change = (key: keyof Preferences, value: unknown) =>
    set((old) => ({ ...old, [key]: value }));
  const [message, setMessage] = useState("");
  return (
    <Screen stack>
      <Text style={styles.eyebrow}>Let’s make this yours</Text>
      <Text style={styles.title}>What brings{"\n"}you outside?</Text>
      <Text style={styles.body}>
        Pick what you enjoy. We’ll work around your week, your pace, and your
        limits.
      </Text>
      <View style={styles.wrap}>
        {Category.options.map((c) => (
          <Chip
            key={c}
            label={c}
            selected={p.interests.includes(c)}
            onPress={() =>
              change(
                "interests",
                p.interests.includes(c)
                  ? p.interests.filter((x) => x !== c)
                  : [...p.interests, c],
              )
            }
          />
        ))}
      </View>
      <Text style={styles.heading}>Your pace</Text>
      <Chip
        label="I enjoy early morning outings"
        selected={p.earlyMornings}
        onPress={() => change("earlyMornings", !p.earlyMornings)}
      />
      <Text style={styles.small}>
        Otherwise we leave mornings free before work, allow an hour after waking,
        and wait 30 minutes after work. Weekdays without work hours favor 18:00;
        mark a full day off in your schedule for daytime plans.
      </Text>
      <View style={styles.wrap}>
        {(["gentle", "moderate", "vigorous"] as const).map((v) => (
          <Chip
            key={v}
            label={v}
            selected={p.intensity === v}
            onPress={() => change("intensity", v)}
          />
        ))}
      </View>
      <Field
        label="Outdoor days per week (1–7)"
        keyboardType="number-pad"
        value={String(p.daysPerWeek)}
        onChangeText={(v) => change("daysPerWeek", Number(v))}
      />
      <Field
        label="Maximum short activity (5–45 minutes)"
        keyboardType="number-pad"
        value={String(p.shortMinutes)}
        onChangeText={(v) => change("shortMinutes", Number(v))}
      />
      <Chip
        label="Include one longer outing"
        selected={p.longerOuting}
        onPress={() => change("longerOuting", !p.longerOuting)}
      />
      {p.longerOuting ? (
        <Field
          label="Maximum longer activity (60–360 minutes)"
          keyboardType="number-pad"
          value={String(p.longMinutes)}
          onChangeText={(v) => change("longMinutes", Number(v))}
        />
      ) : null}
      <Text style={styles.heading}>Getting there</Text>
      <View style={styles.wrap}>
        {(["walk", "bicycle", "car", "public"] as const).map((v) => (
          <Chip
            key={v}
            label={v}
            selected={p.transport === v}
            onPress={() => change("transport", v)}
          />
        ))}
      </View>
      <Field
        label="Your estimated one-way travel time (minutes)"
        keyboardType="number-pad"
        value={String(p.travelMinutes)}
        onChangeText={(v) => change("travelMinutes", Number(v))}
      />
      {p.interests.includes("hiking") ? (
        <Field
          label="Maximum one-way drive for a hike (minutes)"
          keyboardType="number-pad"
          value={String(p.hikeDriveMinutes)}
          onChangeText={(v) => change("hikeDriveMinutes", Number(v))}
        />
      ) : null}
      <Text style={styles.small}>
        For familiar places you know. This is your estimate, not a calculated
        route time.
      </Text>
      <View style={styles.wrap}>
        <Chip
          label="Outdoor plants, garden or balcony access"
          selected={p.garden}
          onPress={() => change("garden", !p.garden)}
        />
        <Chip
          label="Bicycle access"
          selected={p.bicycle}
          onPress={() => change("bicycle", !p.bicycle)}
        />
      </View>
      <Field
        label="Approximate area"
        placeholder="e.g. Carlton, Melbourne"
        value={p.area}
        onChangeText={(v) => change("area", v)}
      />
      <Button
        label="Use approximate current location"
        secondary
        onPress={async () => {
          try {
            if (!(await Location.requestForegroundPermissionsAsync()).granted) {
              setMessage("Location is optional. The planner still works without it, but nearby discovery needs coordinates.");
              return;
            }
            const result = await Promise.race([
              Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Low,
              }),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error("location timeout")), 12000),
              ),
            ]);
            set((old) => ({
              ...old,
              latitude: Number(result.coords.latitude.toFixed(2)),
              longitude: Number(result.coords.longitude.toFixed(2)),
            }));
            setLatitudeText(result.coords.latitude.toFixed(2));
            setLongitudeText(result.coords.longitude.toFixed(2));
            setMessage("Approximate coordinates ready for weather and nearby places. Save preferences below to apply them.");
          } catch {
            setMessage("Current location is unavailable. Check device location settings or enter approximate coordinates below.");
          }
        }}
      />
      <Text style={styles.small}>
        If device location is unavailable, you can enter approximate coordinates
        from a map. Both are optional; nearby discovery needs both values.
      </Text>
      <Field
        label="Approximate latitude (optional)"
        keyboardType="numbers-and-punctuation"
        value={latitudeText}
        onChangeText={setLatitudeText}
      />
      <Field
        label="Approximate longitude (optional)"
        keyboardType="numbers-and-punctuation"
        value={longitudeText}
        onChangeText={setLongitudeText}
      />
      {latitudeText && longitudeText ? (
        <>
          <Text style={styles.small}>
            {latitudeText}, {longitudeText} · approximate coordinates
          </Text>
          <Button
            label="Remove location coordinates"
            secondary
            onPress={() => {
              setLatitudeText("");
              setLongitudeText("");
              set((old) => ({
                ...old,
                latitude: undefined,
                longitude: undefined,
              }));
            }}
          />
        </>
      ) : null}
      <Field
        label="Timezone (IANA name)"
        value={p.timezone}
        autoCapitalize="none"
        onChangeText={(v) => change("timezone", v)}
      />
      <View style={styles.wrap}>
        <Chip
          label="Week starts Monday"
          selected={p.weekStartsOn === 1}
          onPress={() => change("weekStartsOn", 1)}
        />
        <Chip
          label="Week starts Sunday"
          selected={p.weekStartsOn === 7}
          onPress={() => change("weekStartsOn", 7)}
        />
      </View>
      <Chip
        label="Optional local reminders"
        selected={p.reminders}
        onPress={() => {
          void (async () => {
            if (p.reminders) {
              change("reminders", false);
              return;
            }
            const granted = await askReminders();
            change("reminders", granted);
            if (!granted)
              setMessage(
                "Reminders are off. Everything else works without them.",
              );
          })().catch(() =>
            setMessage("Reminders are unavailable on this device."),
          );
        }}
      />
      {message ? (
        <Text accessibilityRole="alert" style={styles.body}>
          {message}
        </Text>
      ) : null}
      <Text style={styles.small}>
        Nearby parks and sourced loop hikes use approximate location. Hiking
        needs moderate effort, a longer outing, daylight and your travel
        estimate.
      </Text>
      <Button
        label={
          app.data.preferences.version
            ? "Save preferences"
            : "Continue to my week"
        }
        disabled={app.busy}
        onPress={async () => {
          if (!!latitudeText.trim() !== !!longitudeText.trim()) {
            setMessage("Enter both latitude and longitude, or leave both blank.");
            return;
          }
          const parsed = Preferences.safeParse({
            ...p,
            latitude: latitudeText.trim()
              ? Number(Number(latitudeText).toFixed(2))
              : undefined,
            longitude: longitudeText.trim()
              ? Number(Number(longitudeText).toFixed(2))
              : undefined,
          });
          if (!parsed.success) {
            setMessage(parsed.error.issues.map((i) => i.message).join("\n"));
            return;
          }
          await app.preferences(parsed.data);
          router.replace("/");
        }}
      />
    </Screen>
  );
}
