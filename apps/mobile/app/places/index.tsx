import { useEffect, useState } from "react";
import { Linking, Text, View } from "react-native";
import { router } from "expo-router";
import type { Destination } from "@outsideweek/contracts";
import { api } from "../../src/api";
import { useApp } from "../../src/context";
import { read, write } from "../../src/storage";
import { Button, Chip, Screen, styles } from "../../src/ui";

type Filter = "all" | "park" | "riverside" | "hike";
export default function Places() {
  const app = useApp();
  const currentPlan = app.data.plans.find(
    (p) => p.weekStart === app.data.weekStart,
  );
  const fromPlan =
    currentPlan?.preferenceVersion === app.data.preferences.version
      ? currentPlan.destinations
      : [];
  const cacheKey = `nearby-places:${app.data.preferences.latitude?.toFixed(2) ?? "none"}:${app.data.preferences.longitude?.toFixed(2) ?? "none"}`;
  const [places, setPlaces] = useState<Destination[]>(fromPlan);
  const [filter, setFilter] = useState<Filter>("all");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  async function load() {
    setLoading(true);
    try {
      const result = await api<{
        places: Destination[];
        locationAvailable: boolean;
      }>("/v1/places/nearby");
      if (result.places.length) {
        setPlaces(result.places);
        await write(cacheKey, result.places);
      }
      setMessage(
        result.locationAvailable
          ? result.places.length
            ? "Mapped places near your approximate position."
            : "No mapped places were returned right now. Try again later or use a familiar place."
          : "Add approximate location in Your preferences to find nearby parks and trails.",
      );
    } catch {
      setMessage(
        "You’re offline or place search is unavailable. Saved places remain here.",
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void (async () => {
      const saved = await read<Destination[]>(cacheKey);
      if (saved?.length && !fromPlan.length) setPlaces(saved);
      await load();
    })();
  }, []);
  const visible = places.filter((p) => filter === "all" || p.kind === filter);
  return (
    <Screen stack>
      <Text style={styles.eyebrow}>Nearby ideas</Text>
      <Text style={styles.title}>Where could you go?</Text>
      <Text style={styles.body}>
        Explore mapped parks, rivers and loop trails. Results depend on map
        coverage and your approximate position; they are not a complete list.
      </Text>
      <View style={styles.wrap}>
        {(["all", "park", "riverside", "hike"] as const).map((kind) => (
          <Chip
            key={kind}
            label={
              kind === "all"
                ? "All"
                : kind === "riverside"
                  ? "Rivers"
                  : kind === "hike"
                    ? "Hikes"
                    : "Parks"
            }
            selected={filter === kind}
            onPress={() => setFilter(kind)}
          />
        ))}
      </View>
      <Button
        label={loading ? "Searching nearby…" : "Refresh nearby places"}
        secondary
        disabled={loading}
        onPress={load}
      />
      {message ? <Text style={styles.small}>{message}</Text> : null}
      {!visible.length ? (
        <View style={styles.card}>
          <Text style={styles.body}>
            No saved places in this category yet. A familiar outdoor activity
            can still fit your plan.
          </Text>
        </View>
      ) : null}
      {visible.map((place) => (
        <View key={place.id} style={styles.card}>
          <Text style={styles.heading}>{place.name}</Text>
          <Text style={styles.small}>
            {place.kind === "hike"
              ? `Loop hike · ${place.routeKm} km mapped route${place.driveMinutes !== undefined ? ` · about ${place.driveMinutes} min one-way drive to mapped center` : " · drive time unavailable"}`
              : place.kind === "riverside"
                ? "River feature · check public access"
                : "Park"}
            {place.distanceKm !== undefined
              ? ` · ${place.distanceKm} km straight-line away`
              : ""}
          </Text>
          <Text style={styles.small}>
            Check actual travel time, trailhead or entrance, and current access.
            Route estimates do not include live traffic. Map data may be incomplete.
          </Text>
          <Button
            label="Open map details ↗"
            secondary
            onPress={() => Linking.openURL(place.url)}
          />
        </View>
      ))}
      {places.some((p) => p.source === "OpenStreetMap") ? (
        <Text
          style={styles.small}
          onPress={() =>
            Linking.openURL("https://www.openstreetmap.org/copyright")
          }
        >
          Map data © OpenStreetMap contributors · ODbL
        </Text>
      ) : null}
      {app.data.preferences.latitude === undefined ? (
        <Button
          label="Add approximate location"
          secondary
          onPress={() => router.push("/onboarding")}
        />
      ) : null}
    </Screen>
  );
}
