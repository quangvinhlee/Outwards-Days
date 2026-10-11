import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { DateTime } from "luxon";
import * as Crypto from "expo-crypto";
import { Schedule } from "@outsideweek/contracts";
import { newSchedule, useApp } from "../../src/context";
import { api } from "../../src/api";
import { read, write } from "../../src/storage";
import { Button, Chip, Field, Screen, styles } from "../../src/ui";
export default function ScheduleEditor() {
  const { weekStart } = useLocalSearchParams<{ weekStart: string }>();
  const app = useApp();
  const [s, set] = useState<Schedule>(
    () =>
      (app.data.schedule?.weekStart === weekStart ? app.data.schedule : null) ?? {
        ...newSchedule(weekStart, app.data.preferences),
        confirmedDays: [],
      },
  );
  const [loaded, setLoaded] = useState(false);
  const [day, setDay] = useState(0);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    void (async () => {
      const existing =
        app.data.schedule?.weekStart === weekStart
          ? app.data.schedule
          : await api<Schedule | null>(`/v1/schedules/${weekStart}`);
      const draft = await read<Schedule>(`draft:${weekStart}`);
      if (!active) return;
      set(
        draft && draft.version === (existing?.version ?? 0)
          ? draft
          : existing ?? {
              ...newSchedule(weekStart, app.data.preferences),
              confirmedDays: [],
            },
      );
      setLoaded(true);
    })().catch(() => {
      if (active) setLoaded(true);
    });
    return () => {
      active = false;
    };
  }, [weekStart]);
  useEffect(() => {
    if (loaded) void write(`draft:${weekStart}`, s);
  }, [s, loaded, weekStart]);
  const update = (fn: (s: Schedule) => Schedule) =>
    set((old) => {
      const next = fn(old);
      return {
        ...next,
        confirmedDays: next.confirmedDays.filter((d) => d !== day),
      };
    });
  const blockChange = (
    id: string,
    patch: Partial<Schedule["blocks"][number]>,
  ) =>
    update((old) => ({
      ...old,
      blocks: old.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    }));
  const label = DateTime.fromISO(weekStart)
    .plus({ days: day })
    .toFormat("cccc, d MMMM");
  return (
    <Screen stack>
      <Text style={styles.eyebrow}>Plan around real life</Text>
      <Text style={styles.title}>What does your{"\n"}week look like?</Text>
      <Text style={styles.body}>
        Include sleep, travel and commitments. Lunch is only available when you
        explicitly add a break. We leave mornings before work free for your
        routine unless you choose early outings in preferences. After work we
        allow 30 minutes to get home or settle in; add your actual commute too.
      </Text>
      <Button
        label="Same as last week"
        secondary
        onPress={async () => {
          const previous = await read<Schedule>("schedule-template");
          if (!previous) {
            setMessage("No previous template yet. Set up your week below.");
            return;
          }
          set({
            ...previous,
            weekStart,
            timezone: app.data.preferences.timezone,
            version: s.version,
            confirmedDays: [],
          });
          setMessage(
            "Copied your template. Review each day, then confirm this week.",
          );
        }}
      />
      <Button
        label="Start fresh"
        secondary
        onPress={() =>
          set({
            ...newSchedule(weekStart, app.data.preferences),
            version: s.version,
            confirmedDays: [],
          })
        }
      />
      <Button
        label="Add 9–5 work on weekdays"
        secondary
        onPress={() =>
          set((old) => ({
            ...old,
            confirmedDays: [],
            blocks: [
              ...old.blocks.filter((b) => b.kind !== "work"),
              ...Array.from({ length: 7 }, (_, d) => d)
                .filter(
                  (d) =>
                    DateTime.fromISO(weekStart).plus({ days: d }).weekday <= 5,
                )
                .map((d) => ({
                  id: Crypto.randomUUID(),
                  day: d,
                  start: "09:00",
                  end: "17:00",
                  nextDay: false,
                  kind: "work" as const,
                })),
            ],
          }))
        }
      />
      <View style={styles.wrap}>
        {Array.from({ length: 7 }, (_, d) => (
          <Chip
            key={d}
            label={`${DateTime.fromISO(weekStart).plus({ days: d }).toFormat("ccc")} ${s.confirmedDays.includes(d) ? "✓" : ""}`}
            selected={day === d}
            onPress={() => setDay(d)}
          />
        ))}
      </View>
      <Text style={styles.heading}>{label}</Text>
      <Chip
        label="Full day off / daytime is available"
        selected={s.fullDays?.includes(day) ?? DateTime.fromISO(weekStart).plus({ days: day }).weekday >= 6}
        onPress={() => update((old) => {
          const currentlyFree = old.fullDays?.includes(day) ??
            DateTime.fromISO(weekStart).plus({ days: day }).weekday >= 6;
          const base = old.fullDays ?? Array.from({ length: 7 }, (_, d) => d)
            .filter((d) => DateTime.fromISO(weekStart).plus({ days: d }).weekday >= 6);
          return { ...old, fullDays: currentlyFree
            ? base.filter((d) => d !== day)
            : [...base, day].sort() };
        })}
      />
      <Text style={styles.small}>
        Unmarked weekdays without work hours favor 18:00 or later. Mark a day
        off for daytime suggestions, or enter your actual work and commute below.
      </Text>
      <Text style={styles.small}>
        The default sleep template blocks 22:00–07:00, including the previous
        night. Adjust it to your actual sleep.
      </Text>
      {s.blocks
        .filter((b) => b.day === day || (day === 0 && b.day === -1))
        .map((b) => (
          <View key={b.id} style={styles.card}>
            <Text style={styles.eyebrow}>
              {b.day === -1 ? "Previous night · " : ""}
              {b.kind}
            </Text>
            <View style={styles.wrap}>
              {(["work", "sleep", "commute", "other"] as const).map((kind) => (
                <Chip
                  key={kind}
                  label={kind}
                  selected={b.kind === kind}
                  onPress={() => blockChange(b.id, { kind, lunch: undefined })}
                />
              ))}
            </View>
            <View style={styles.row}>
              <Field
                label="Starts (HH:mm)"
                value={b.start}
                onChangeText={(start) => blockChange(b.id, { start })}
              />
              <Field
                label="Ends (HH:mm)"
                value={b.end}
                onChangeText={(end) => blockChange(b.id, { end })}
              />
            </View>
            <Chip
              label="Ends next day"
              selected={b.nextDay}
              onPress={() =>
                blockChange(b.id, { nextDay: !b.nextDay, lunch: undefined })
              }
            />
            {b.kind === "work" && !b.nextDay ? (
              <>
                <Chip
                  label="I have an available lunch break"
                  selected={!!b.lunch}
                  onPress={() =>
                    blockChange(b.id, {
                      lunch: b.lunch
                        ? undefined
                        : { start: "12:00", end: "12:30" },
                    })
                  }
                />
                {b.lunch ? (
                  <View style={styles.row}>
                    <Field
                      label="Lunch starts"
                      value={b.lunch.start}
                      onChangeText={(start) =>
                        blockChange(b.id, { lunch: { ...b.lunch!, start } })
                      }
                    />
                    <Field
                      label="Lunch ends"
                      value={b.lunch.end}
                      onChangeText={(end) =>
                        blockChange(b.id, { lunch: { ...b.lunch!, end } })
                      }
                    />
                  </View>
                ) : null}
              </>
            ) : null}
            <Button
              label="Remove block"
              secondary
              onPress={() =>
                update((old) => ({
                  ...old,
                  blocks: old.blocks.filter((x) => x.id !== b.id),
                }))
              }
            />
          </View>
        ))}
      <Button
        label="Add a busy block"
        secondary
        onPress={() =>
          update((old) => ({
            ...old,
            blocks: [
              ...old.blocks,
              {
                id: Crypto.randomUUID(),
                day,
                start: "09:00",
                end: "10:00",
                nextDay: false,
                kind: "other",
              },
            ],
          }))
        }
      />
      <Button
        label="Full day off (keep sleep)"
        secondary
        onPress={() => update((old) => ({
          ...old,
          fullDays: [...new Set([...(old.fullDays ?? Array.from({ length: 7 }, (_, d) => d)
            .filter((d) => DateTime.fromISO(weekStart).plus({ days: d }).weekday >= 6)), day])].sort(),
          blocks: old.blocks.filter((b) => b.day !== day || b.kind === "sleep"),
        }))}
      />
      <Text style={styles.heading}>When you’d like to be outside</Text>
      <Text style={styles.small}>
        Busy blocks still take priority inside these windows.
      </Text>
      {s.windows.map((w, i) =>
        w.day === day ? (
          <View key={i} style={styles.card}>
            <View style={styles.row}>
              <Field
                label="From (HH:mm)"
                value={w.start}
                onChangeText={(start) =>
                  update((old) => ({
                    ...old,
                    windows: old.windows.map((v, j) =>
                      j === i ? { ...v, start } : v,
                    ),
                  }))
                }
              />
              <Field
                label="Until (HH:mm)"
                value={w.end}
                onChangeText={(end) =>
                  update((old) => ({
                    ...old,
                    windows: old.windows.map((v, j) =>
                      j === i ? { ...v, end } : v,
                    ),
                  }))
                }
              />
            </View>
            <Button
              label="Remove outdoor window"
              secondary
              onPress={() =>
                update((old) => ({
                  ...old,
                  windows: old.windows.filter((_, j) => j !== i),
                }))
              }
            />
          </View>
        ) : null,
      )}
      <Button
        label="Add outdoor window"
        secondary
        onPress={() =>
          update((old) => ({
            ...old,
            windows: [...old.windows, { day, start: "12:00", end: "13:00" }],
          }))
        }
      />
      <Button
        label={
          s.confirmedDays.includes(day)
            ? "Day reviewed ✓"
            : "This day looks right"
        }
        onPress={() => {
          set((old) => ({
            ...old,
            confirmedDays: [...new Set([...old.confirmedDays, day])],
          }));
          if (day < 6) setDay(day + 1);
        }}
      />
      <Text style={styles.small}>
        {s.confirmedDays.length} of 7 days reviewed · drafts save on this phone
      </Text>
      {message ? (
        <Text accessibilityRole="alert" style={styles.body}>
          {message}
        </Text>
      ) : null}
      <Button
        label="Confirm my week"
        disabled={app.busy || s.confirmedDays.length !== 7}
        onPress={async () => {
          const parsed = Schedule.safeParse(s);
          if (!parsed.success) {
            setMessage(
              "Check the time fields (HH:mm), and review all seven days.",
            );
            return;
          }
          await app.confirm(parsed.data);
          await write("schedule-template", parsed.data);
          router.replace("/week");
        }}
      />
    </Screen>
  );
}
