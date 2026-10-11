import { useEffect, useState } from "react";
import { Linking, Platform, Pressable, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { missionsFor, photoTargets } from "@outsideweek/contracts";
import { useLocalSearchParams } from "expo-router";
import { DateTime } from "luxon";
import { useApp } from "../../src/context";
import { Button, Field, Screen, categoryVisual, colors, styles } from "../../src/ui";
import { read, write } from "../../src/storage";
import { Chip } from "../../src/ui";
export default function Detail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const app = useApp();
  const plan = app.data.plans.find((p) =>
    p.activities.some((a) => a.id === id),
  );
  const a = plan?.activities.find((a) => a.id === id);
  const [feedback, setFeedback] = useState("");
  const [move, setMove] = useState("");
  const [checked, setChecked] = useState<string[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [photoTarget, setPhotoTarget] = useState<Record<string, string>>({});
  const [verifying, setVerifying] = useState<string | null>(null);
  const [photoMessage, setPhotoMessage] = useState("");
  useEffect(() => {
    if (!a) return;
    let active = true;
    void read<string[]>(`mission-progress:${a.id}`).then((saved) => {
      if (active) setChecked((saved ?? a.completedMissionIds ?? []).filter((missionId) => {
        const mission = (a.missions ?? missionsFor(a.category, a.localDate, a.destination?.name, a.activityMinutes)).find((item) => item.id === missionId);
        return mission?.kind === "action" || (!mission?.kind) ||
          (mission.kind === "photo" && !!a.photoVerifications?.[missionId]);
      }));
    });
    void read<Record<string, string>>(`mission-notes:${a.id}`).then((saved) => {
      if (active) setNotes(saved ?? a.missionNotes ?? {});
    });
    return () => { active = false; };
  }, [a?.id]);
  if (!a)
    return (
      <Screen stack>
        <Text style={styles.heading}>
          This activity isn’t in your saved plans.
        </Text>
      </Screen>
    );
  const p = app.data.preferences;
  const missions = a.missions ?? missionsFor(a.category, a.localDate, a.destination?.name, a.activityMinutes);
  const writtenIds = missions.filter((mission) => mission.kind === "reflection" && notes[mission.id]?.trim()).map((mission) => mission.id);
  const checkedMissions = [...new Set([...checked, ...Object.keys(a.photoVerifications ?? {}), ...writtenIds])].filter((id) =>
    missions.some((mission) => mission.id === id),
  );
  const completedNotes = Object.fromEntries(writtenIds.map((id) => [id, notes[id].trim()]));
  const missionLocked = ["completed", "partly_completed", "skipped", "replaced"].includes(a.state);
  function toggleMission(id: string) {
    if (missionLocked) return;
    if (["photo", "reflection"].includes(missions.find((mission) => mission.id === id)?.kind ?? "")) return;
    const next = checked.includes(id) ? checked.filter((value) => value !== id) : [...checked, id];
    setChecked(next);
    void write(`mission-progress:${a!.id}`, next).catch(() => app.setError("Could not save your mission checklist on this device."));
  }
  async function captureMission(id: string, targetId: string) {
    if (verifying || missionLocked) return;
    setPhotoMessage("");
    try {
      if (Platform.OS !== "web") {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setPhotoMessage("Allow camera access to check this photo mission.");
          return;
        }
      }
      const capture = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.7 });
      if (capture.canceled || !capture.assets?.[0]) return;
      setVerifying(id);
      const image = await ImageManipulator.manipulateAsync(
        capture.assets[0].uri,
        [{ resize: { width: 768 } }],
        { compress: 0.55, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );
      if (!image.base64) throw new Error("Could not prepare this photo.");
      const result = await app.verifyMissionPhoto(a!, id, targetId, image.base64);
      if (result.verified) {
        const next = [...new Set([...checked, id])];
        setChecked(next);
        await write(`mission-progress:${a!.id}`, next);
        setPhotoMessage(`Photo accepted: ${result.reason}`);
      } else setPhotoMessage(`Not verified yet: ${result.reason} Try again or choose another subject you can see.`);
    } catch (error) {
      setPhotoMessage(error instanceof Error ? error.message : "Photo check failed. Please retry.");
    } finally {
      setVerifying(null);
    }
  }
  const when = DateTime.fromISO(a.start).setZone(p.timezone);
  const visual = categoryVisual[a.category];
  const pending = app.pending.find((q) => q.event.activityId === a.id);
  const weather = a.weather;
  const stale =
    weather.fetchedAt && Date.now() - Date.parse(weather.fetchedAt) > 1800000;
  const day = weather.days?.[a.localDate];
  return (
    <Screen stack>
      <View style={{ backgroundColor: visual.background, borderRadius: 24, padding: 21, gap: 12, overflow: "hidden" }}>
        <View style={styles.row}>
          <Text style={[styles.eyebrow, { color: visual.foreground }]}>{visual.label} · {when.toFormat("cccc d MMM")}</Text>
          <Text style={{ fontSize: 42, color: visual.foreground, fontWeight: "600" }}>{visual.glyph}</Text>
        </View>
        <Text style={[styles.title, { fontSize: 30, lineHeight: 35 }]}>{a.title}</Text>
        <Text style={[styles.body, { color: colors.ink, fontWeight: "600" }]}>{when.toFormat("h:mm a")} · {a.totalMinutes} min total</Text>
        <Text style={[styles.small, { color: visual.foreground, fontWeight: "700", textTransform: "capitalize" }]}>{a.state.replace("_", " ")}{pending ? " · sync pending" : ""}</Text>
      </View>
      <Text style={styles.body}>{a.reason}</Text>
      <View style={styles.card}>
        <Text style={styles.heading}>{["completed", "partly_completed", "skipped"].includes(a.state) ? "Your outing" : "Make this outing yours"}</Text>
        <Text style={styles.small}>Category: {a.category.replace("_", " ")} · {a.destination?.name ?? (a.category === "garden" ? "your outdoor plants at home" : "your chosen outdoor place")}</Text>
        {["completed", "partly_completed", "skipped"].includes(a.state) ? (
          <Text style={styles.body}>Recorded as {a.state.replace("_", " ")}{pending ? " · waiting to sync" : ""}.</Text>
        ) : <>
          {["suggested", "needs_review"].includes(a.state) ? <Button label={a.long ? "Review and accept this longer outing" : "Accept this outing"} disabled={app.busy} onPress={() => app.activityAction(a, "accept")} /> : null}
          {["accepted", "needs_review"].includes(a.state) && Date.parse(a.start) <= Date.now() ? <>
            <Field label="Optional overall reflection" multiline placeholder="What did you enjoy or want to try next time?" value={feedback} onChangeText={setFeedback} />
            <Button label="Complete whole outing" disabled={app.busy} onPress={() => app.complete(a, "completed", feedback, checkedMissions, completedNotes)} />
            <Button label="I did part of it" secondary disabled={app.busy} onPress={() => app.complete(a, "partly_completed", feedback, checkedMissions, completedNotes)} />
          </> : <Text style={styles.small}>Completion opens after you accept the outing and its scheduled start time arrives. Mini missions are optional.</Text>}
        </>}
      </View>
      {a.destination ? (
        <View style={styles.card}>
          <Text style={styles.heading}>{a.destination.name}</Text>
          <Text style={styles.body}>
            {a.destination.kind === "hike"
              ? `Mapped loop trail · ${a.destination.routeKm} km route${a.destination.driveMinutes !== undefined ? ` · about ${a.destination.driveMinutes} min one-way drive to mapped center` : ""}`
              : a.destination.kind === "riverside"
                ? "Mapped riverside area"
                : a.destination.kind === "garden" ? "Mapped garden"
                : a.destination.kind === "square" ? "Mapped square"
                : a.destination.kind === "picnic_site" ? "Mapped picnic site"
                : "Mapped outdoor place"}
            {a.destination.distanceKm !== undefined
              ? ` · ${a.destination.distanceKm} km straight-line from your approximate position`
              : ""}
          </Text>
          <Text style={styles.small}>
            Check access, actual journey and current conditions. The route time
            is an estimate; mapped data may be incomplete.
          </Text>
          <Button
            label="Open place details and map ↗"
            secondary
            onPress={() => Linking.openURL(a.destination!.url)}
          />
          {a.destination.source === "OpenStreetMap" ? (
            <Text
              style={styles.small}
              onPress={() =>
                Linking.openURL("https://www.openstreetmap.org/copyright")
              }
            >
              Map data © OpenStreetMap contributors · ODbL
            </Text>
          ) : null}
        </View>
      ) : null}
      <View style={styles.card}>
        <Text style={styles.heading}>Room for the whole trip</Text>
        {[
          ["Get ready", a.preparationMinutes],
          ["Travel out", a.outwardMinutes],
          ["Outside", a.activityMinutes],
          ["Travel back", a.returnMinutes],
          ["Return buffer", a.bufferMinutes],
        ].map(([label, minutes]) => (
          <View style={styles.row} key={label}>
            <Text style={styles.body}>{label}</Text>
            <Text style={styles.body}>{minutes} min</Text>
          </View>
        ))}
        <View style={styles.rule} />
        <View style={styles.row}>
          <Text style={styles.heading}>Total</Text>
          <Text style={styles.heading}>{a.totalMinutes} min</Text>
        </View>
        <Text style={styles.small}>
          Back by{" "}
          {DateTime.fromISO(a.end).setZone(p.timezone).toFormat("h:mm a")}.
          Travel uses your own estimate.
        </Text>
      </View>
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.heading}>Mini missions</Text>
          <Text style={[styles.badge, { backgroundColor: visual.background, color: visual.foreground }]}>{checkedMissions.length} / {missions.length}</Text>
        </View>
        <Text style={styles.small}>
          {checkedMissions.length} of {missions.length} done · tick actions, verify photos, or write a short observation. Mini missions are optional.
        </Text>
        {photoMessage ? <Text style={styles.small}>{photoMessage}</Text> : null}
        {missions.map((mission) => {
          const done = mission.kind === "photo" ? !!a.photoVerifications?.[mission.id] || checked.includes(mission.id) : mission.kind === "reflection" ? !!notes[mission.id]?.trim() : checked.includes(mission.id);
          const targetId = photoTarget[mission.id] ?? mission.targetId ?? "plant";
          return (
            <View
              key={mission.id}
              style={[styles.card, { padding: 14, borderRadius: 16, backgroundColor: "#F6F7F0" }]}
            >
              <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: done, disabled: missionLocked || mission.kind === "photo" || mission.kind === "reflection" }} accessibilityLabel={`${mission.title}. ${mission.detail}`} disabled={missionLocked || mission.kind === "photo" || mission.kind === "reflection"} onPress={() => toggleMission(mission.id)} style={{ flexDirection: "row", gap: 8 }}>
                <Text style={[styles.body, { color: done ? "#315D42" : "#687369", fontWeight: "700" }]}>{done ? "☑" : "☐"}</Text>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={[styles.body, { color: "#203E32", fontWeight: "700" }]}>{mission.title}</Text>
                  <Text style={styles.small}>{mission.detail}</Text>
                </View>
              </Pressable>
              {mission.kind === "reflection" ? <Field label="Your observation" multiline placeholder="One sentence is enough" value={notes[mission.id] ?? ""} onChangeText={(value) => {
                if (missionLocked) return;
                const next = { ...notes, [mission.id]: value.slice(0, 300) };
                setNotes(next);
                void write(`mission-notes:${a.id}`, next).catch(() => app.setError("Could not save your note on this device."));
              }} /> : null}
              {mission.kind === "photo" && !done && !missionLocked ? <>
                <Text style={styles.small}>Can’t find it? Pick something you can see on this outing:</Text>
                <Text style={styles.small}>Ask an owner before photographing a dog. Avoid people in the frame.</Text>
                <View style={styles.wrap}>{photoTargets.map((target) => <Chip key={target.id} label={target.label} selected={targetId === target.id} onPress={() => setPhotoTarget((old) => ({ ...old, [mission.id]: target.id }))} />)}</View>
                <Button label={verifying === mission.id ? "Checking photo…" : `Take photo of ${photoTargets.find((target) => target.id === targetId)?.label}`} disabled={!!verifying || Date.now() < Date.parse(a.start) || !["accepted", "needs_review"].includes(a.state)} onPress={() => captureMission(mission.id, targetId)} />
              </> : null}
              {mission.kind === "photo" && done ? <Text style={styles.small}>Verified: {photoTargets.find((target) => target.id === a.photoVerifications?.[mission.id]?.targetId)?.label ?? "photo"}</Text> : null}
            </View>
          );
        })}
      </View>
      <Text style={styles.heading}>Keep it simple</Text>
      {a.steps.map((step, i) => (
        <Text key={i} style={styles.body}>
          {i + 1}. {step}
        </Text>
      ))}
      <View style={styles.card}>
        <Text style={styles.heading}>Conditions</Text>
        <Text style={styles.body}>
          {stale
            ? "Cached forecast · needs refreshing"
            : weather.status.replace("_", " ")}
        </Text>
        {day ? (
          <Text style={styles.small}>
            {day.min}–{day.max}°C · rain probability {day.rain}% · wind up to{" "}
            {day.wind} km/h
          </Text>
        ) : (
          <Text style={styles.small}>
            Conditions are unknown. Check the weather where you are before
            heading out.
          </Text>
        )}
        <Text style={styles.small}>
          Open-Meteo
          {weather.fetchedAt
            ? ` · fetched ${DateTime.fromISO(weather.fetchedAt).setZone(p.timezone).toFormat("d MMM, h:mm a")}`
            : ""}
          . Forecasts are provisional and do not report trail closures.
        </Text>
        <Button
          label="Refresh conditions"
          secondary
          disabled={app.busy}
          onPress={() => app.activityAction(a, "refresh-conditions")}
        />
      </View>
      {["suggested", "accepted", "needs_review"].includes(a.state) ? (
        <>
          <Button
            label="Something else"
            secondary
            disabled={app.busy}
            onPress={() => app.activityAction(a, "replace")}
          />
          <Field
            label={`Move to local time (${p.timezone}) · YYYY-MM-DD HH:mm`}
            value={move}
            placeholder={`${a.localDate} 18:00`}
            onChangeText={setMove}
          />
          <Button
            label="Check this new time"
            secondary
            disabled={app.busy || !move}
            onPress={() => {
              const value = DateTime.fromFormat(move, "yyyy-MM-dd HH:mm", {
                zone: p.timezone,
              });
              if (
                !value.isValid ||
                value.toFormat("yyyy-MM-dd HH:mm") !== move ||
                value.getPossibleOffsets().length !== 1
              ) {
                app.setError("Enter an unambiguous local date and time.");
                return;
              }
              return app.activityAction(a, "reschedule", {
                start: value.toUTC().toISO(),
              });
            }}
          />
          <Button
            label="Not this time"
            secondary
            onPress={() => app.complete(a, "skipped", feedback, checkedMissions, completedNotes)}
          />
        </>
      ) : null}
      {plan?.destinations.length ? (
        <>
          <Text style={styles.heading}>Other places to explore</Text>
          <Text style={styles.small}>
            Nearby map entries are ideas, not part of this scheduled activity.
            Straight-line distance does not measure travel time. Check access
            and the actual route before going.
          </Text>
          {plan.destinations
            .filter((d) => d.id !== a.destinationId)
            .slice(0, 8)
            .map((d) => (
              <Button
                key={d.id}
                label={`${d.name}${d.distanceKm !== undefined ? ` · ${d.distanceKm} km direct` : ""} ↗`}
                secondary
                onPress={() => Linking.openURL(d.url)}
              />
            ))}
          {plan.destinations.some((d) => d.source === "OpenStreetMap") ? (
            <Text
              style={styles.small}
              onPress={() =>
                Linking.openURL("https://www.openstreetmap.org/copyright")
              }
            >
              Map data © OpenStreetMap contributors · ODbL
            </Text>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
