import { DateTime, IANAZone } from "luxon";
import { createHash, randomUUID } from "node:crypto";
import {
  ModelOutput,
  missionsFor,
  type Activity,
  type Destination,
  type Preferences,
  type Schedule,
  type Slot,
  type Weather,
  type Proposal,
} from "../../contracts/src/index.js";

export class PlannerError extends Error {}
export function local(date: string, time: string, zone: string) {
  if (!IANAZone.isValidZone(zone))
    throw new PlannerError("Choose a valid IANA timezone.");
  const value = DateTime.fromISO(`${date}T${time}`, { zone });
  if (
    !value.isValid ||
    value.toFormat("yyyy-MM-dd HH:mm") !== `${date} ${time}` ||
    value.getPossibleOffsets().length !== 1
  )
    throw new PlannerError(
      `Review ${date} ${time}: this local time is missing or ambiguous because of daylight saving.`,
    );
  return value;
}
export function weekKey(now: string, preferences: Preferences) {
  const day = DateTime.fromISO(now)
    .setZone(preferences.timezone)
    .startOf("day");
  return day
    .minus({ days: (day.weekday - preferences.weekStartsOn + 7) % 7 })
    .toISODate()!;
}
type Span = [number, number];
const overlap = (a: Span, b: Span) => a[0] < b[1] && b[0] < a[1];
export function subtract(spans: Span[], busy: Span[]): Span[] {
  return busy.reduce(
    (free, b) =>
      free.flatMap((a) =>
        !overlap(a, b)
          ? [a]
          : [
              ...(a[0] < b[0] ? [[a[0], b[0]] as Span] : []),
              ...(a[1] > b[1] ? [[b[1], a[1]] as Span] : []),
            ],
      ),
    spans,
  );
}
function dateAt(s: Schedule, day: number) {
  return DateTime.fromISO(s.weekStart, { zone: s.timezone })
    .plus({ days: day })
    .toISODate()!;
}
export function validateSchedule(s: Schedule, p: Preferences) {
  if (s.timezone !== p.timezone)
    throw new PlannerError("Review the schedule in your selected timezone.");
  if (
    weekKey(local(s.weekStart, "12:00", s.timezone).toISO()!, p) !== s.weekStart
  )
    throw new PlannerError(
      "The schedule must start on your chosen first day of the week.",
    );
  for (const w of s.windows)
    if (
      local(dateAt(s, w.day), w.end, s.timezone) <=
      local(dateAt(s, w.day), w.start, s.timezone)
    )
      throw new PlannerError(
        "Outdoor windows must end after they start on the same day.",
      );
  busySpans(s);
}
function busySpans(s: Schedule): Span[] {
  return s.blocks.flatMap((b) => {
    const start = local(dateAt(s, b.day), b.start, s.timezone).toMillis();
    const end = local(
      dateAt(s, b.day + (b.nextDay ? 1 : 0)),
      b.end,
      s.timezone,
    ).toMillis();
    if (end <= start)
      throw new PlannerError(
        "Busy blocks must end after they start. Use ends next day for overnight commitments.",
      );
    if (!b.lunch) return [[start, end] as Span];
    if (b.kind !== "work" || b.nextDay)
      throw new PlannerError(
        "Lunch breaks belong to same-day work blocks. Split an overnight work shift first.",
      );
    const lunch: Span = [
      local(dateAt(s, b.day), b.lunch.start, s.timezone).toMillis(),
      local(dateAt(s, b.day), b.lunch.end, s.timezone).toMillis(),
    ];
    if (lunch[0] < start || lunch[1] > end || lunch[1] <= lunch[0])
      throw new PlannerError("Lunch must fit inside its work block.");
    return subtract([[start, end]], [lunch]);
  });
}
export const reserved = (a: Activity) =>
  ["accepted", "needs_review", "completed", "partly_completed"].includes(
    a.state,
  );
export function slots(
  s: Schedule,
  p: Preferences,
  activities: Activity[] = [],
  now = new Date().toISOString(),
  exclude?: string,
  applyPreferredTimes = true,
): Slot[] {
  validateSchedule(s, p);
  const busy = busySpans(s).concat(
    activities
      .filter((a) => reserved(a) && a.id !== exclude)
      .map((a) => [Date.parse(a.start), Date.parse(a.end)] as Span),
  );
  const output: Slot[] = [];
  const minute = 60000;
  const midnight = (date: string) => local(date, "00:00", s.timezone).toMillis();
  const addSlot = (date: string, from: number, to: number, longOnly = false) => {
    const budget = Math.floor((to - from) / minute);
    if (budget < 10) return;
    const id = createHash("sha256")
      .update(`${s.weekStart}|${s.version}|${from}|${to}|${longOnly}`)
      .digest("hex")
      .slice(0, 16);
    output.push({
      id,
      start: new Date(from).toISOString(),
      end: new Date(to).toISOString(),
      localDate: date,
      budget,
      ...(longOnly ? { longOnly: true } : {}),
    });
  };
  for (const w of s.windows) {
    const date = dateAt(s, w.day);
    const weekday = DateTime.fromISO(date).weekday;
    const fullDay = s.fullDays?.includes(w.day) ?? weekday >= 6;
    const start = Math.max(
      local(date, w.start, s.timezone).toMillis(),
      Math.ceil(Date.parse(now) / 60000) * 60000,
    );
    const end = local(date, w.end, s.timezone).toMillis();
    if (start >= end) continue;
    const specificWindow = end - local(date, w.start, s.timezone).toMillis() < 8 * 60 * minute;
    const work = s.blocks.filter((b) => b.day === w.day && b.kind === "work");
    const workStart = work.length
      ? Math.min(...work.map((b) => local(date, b.start, s.timezone).toMillis()))
      : undefined;
    const wake = s.blocks
      .filter((b) => b.kind === "sleep" && b.nextDay && b.day === w.day - 1)
      .map((b) => local(date, b.end, s.timezone).toMillis());
    const ready = wake.length ? Math.max(...wake) + 60 * minute : midnight(date);
    const recovery = s.blocks
      .filter((b) => b.kind === "work" &&
        ((!b.nextDay && b.day === w.day) || (b.nextDay && b.day === w.day - 1)))
      .map((b) => [
        local(date, b.end, s.timezone).toMillis(),
        local(date, b.end, s.timezone).toMillis() + 30 * minute,
      ] as Span);
    const morningWork = workStart !== undefined &&
      workStart <= local(date, "11:00", s.timezone).toMillis();
    const prep = applyPreferredTimes && morningWork && !p.earlyMornings
      ? [[midnight(date), workStart] as Span]
      : [];
    const morningMargin = applyPreferredTimes && workStart !== undefined && (p.earlyMornings || !morningWork)
      ? [[workStart - 60 * minute, workStart] as Span]
      : [];
    const preferredBusy = applyPreferredTimes ? [...busy, ...prep, ...morningMargin, ...recovery] : busy;
    for (const [from, to] of subtract([[start, end]], preferredBusy)) {
      if (!applyPreferredTimes) {
        addSlot(date, from, to);
        continue;
      }
      const preferredTime = !p.earlyMornings && workStart === undefined &&
        !fullDay && !specificWindow ? "18:00" : "09:00";
      const floor = p.earlyMornings
        ? ready
        : Math.max(ready, local(date, preferredTime, s.timezone).toMillis());
      const normalFrom = Math.max(from, floor);
      addSlot(date, normalFrom, to);
      // A long free-day outing may need an earlier departure, while short
      // sessions should still start after the usual morning routine.
      if (!p.earlyMornings && p.longerOuting && workStart === undefined && fullDay &&
          end - start >= 8 * 60 * minute) {
        const earlyFrom = Math.max(from, ready, local(date, "08:00", s.timezone).toMillis());
        if (earlyFrom < normalFrom) addSlot(date, earlyFrom, to, true);
      }
    }
  }
  return output
    .sort((a, b) => a.start.localeCompare(b.start))
    .filter((s, i, arr) => arr.findIndex((t) => t.id === s.id) === i);
}
export const catalogue = [
  {
    id: "familiar-walk",
    category: "walk",
    title: "A little fresh air",
    min: 5,
    max: 45,
    intensity: "gentle",
    daylight: false,
    long: false,
  },
  {
    id: "nearby-park",
    category: "park",
    title: "A pause in the park",
    min: 15,
    max: 45,
    intensity: "gentle",
    daylight: false,
    long: false,
  },
  {
    id: "existing-plants",
    category: "garden",
    title: "A moment with your plants",
    min: 5,
    max: 30,
    intensity: "gentle",
    daylight: false,
    long: false,
  },
  {
    id: "photo-walk",
    category: "photography",
    title: "Find a different perspective",
    min: 10,
    max: 45,
    intensity: "gentle",
    daylight: true,
    long: false,
  },
  {
    id: "outdoor-reading",
    category: "reading",
    title: "A few pages outside",
    min: 10,
    max: 45,
    intensity: "gentle",
    daylight: false,
    long: false,
  },
  { id: "outdoor-movement", category: "exercise", title: "Move outside", min: 10, max: 45, intensity: "gentle", daylight: true, long: false },
  { id: "picnic-break", category: "picnic", title: "Have a picnic outside", min: 15, max: 45, intensity: "gentle", daylight: true, long: false },
  {
    id: "easy-cycle",
    category: "cycling",
    title: "A familiar ride",
    min: 15,
    max: 45,
    intensity: "moderate",
    daylight: true,
    long: false,
  },
  {
    id: "long-park",
    category: "park",
    title: "Take the scenic afternoon",
    min: 60,
    max: 360,
    intensity: "gentle",
    daylight: true,
    long: true,
  },
  {
    id: "hiking-loop",
    category: "hiking",
    title: "A day on a trail",
    min: 90,
    max: 360,
    intensity: "moderate",
    daylight: true,
    long: true,
  },
  {
    id: "long-walk",
    category: "walk",
    title: "Make room for a longer wander",
    min: 60,
    max: 360,
    intensity: "gentle",
    daylight: true,
    long: true,
  },
] as const;
const effort = { gentle: 0, moderate: 1, vigorous: 2 };
const travelSpeed = { walk: 4, bicycle: 12, car: 25, public: 10 };
export function placeFits(
  place: Destination,
  template: (typeof catalogue)[number],
  p: Preferences,
) {
  if (template.category === "hiking")
    return (
      place.kind === "hike" &&
      !!place.routeKm &&
      place.driveMinutes !== undefined &&
      place.driveMinutes < p.hikeDriveMinutes
    );
  if (place.distanceKm === undefined || place.distanceKm < 0) return false;
  if (
    Math.ceil((place.distanceKm / travelSpeed[p.transport]) * 60) >
    p.travelMinutes
  )
    return false;
  if (template.category === "park") return place.kind === "park";
  if (template.category === "picnic") return place.kind === "park" || place.kind === "picnic_site" || place.kind === "garden";
  if (
    template.category === "walk" ||
    template.category === "photography" ||
    template.category === "reading" ||
    template.category === "exercise"
  )
    return place.kind === "park" || place.kind === "garden" || place.kind === "square" || place.kind === "picnic_site";
  return false;
}
export function placeScore(
  place: Destination | null,
  templateId: string,
  category: string,
  history: Activity[],
  chosen: Activity[],
) {
  const recent = [...history].sort((a, b) => a.start.localeCompare(b.start)).slice(-30);
  const visited = recent.filter((a) => a.state === "completed" || a.state === "partly_completed");
  const categoryUse = recent.filter(
    (a) => a.category === category && (a.state === "completed" || a.state === "partly_completed"),
  ).length;
  const templateUse = visited.filter(
    (a) => a.templateId === templateId,
  ).length;
  const placeUse = place
    ? visited.filter(
        (a) => a.destinationId === place.id,
      ).length
    : 0;
  const samePlaceAndCategory = place ? visited.filter((a) =>
    a.destinationId === place.id && a.category === category).length : 0;
  const weekCategory = chosen.filter((a) => a.category === category).length;
  const weekPlace = place
    ? chosen.filter((a) => a.destinationId === place.id).length
    : 0;
  const skipped = recent.filter(
    (a) => a.category === category && a.state === "skipped",
  ).length;
  return (
    categoryUse * 2 +
    templateUse +
    placeUse * 8 +
    samePlaceAndCategory * 8 +
    weekCategory * 7 +
    weekPlace * 12 +
    skipped * 3 +
    (place ? (place.distanceKm ?? 0) / 5 : 2)
  );
}
export function personalizeMissions(
  activities: Activity[], history: Activity[], reflectionChoicesBySlot: Record<string, number> = {},
): Activity[] {
  const previous = [...history]
    .filter((a) => ["completed", "partly_completed"].includes(a.state))
    .sort((a, b) => a.start.localeCompare(b.start));
  return activities.map((activity) => {
    const related = previous.filter((a) => a.start < activity.start &&
      (a.category === activity.category ||
      (!!activity.destinationId && a.destinationId === activity.destinationId))).slice(-12);
    const recentIds = related.flatMap((a) => a.completedMissionIds ?? []);
    const noted = [...previous].reverse().find((a) =>
      a.start < activity.start &&
      (a.category === activity.category || (!!activity.destinationId && a.destinationId === activity.destinationId)) &&
      (!!Object.values(a.missionNotes ?? {}).find((note) => note.trim()) || !!a.feedback?.trim()));
    const note = noted && (noted.missionNotes?.["garden-note"]?.trim() ||
      Object.values(noted.missionNotes ?? {}).find((value) => value.trim()) || noted.feedback?.trim());
    const prior = note ? {
      note,
      placeName: noted?.destination?.name ?? (noted?.category === "garden" ? "your garden" : undefined),
      samePlace: (!!activity.destinationId && activity.destinationId === noted?.destinationId) ||
        (activity.category === "garden" && noted?.category === "garden" && !activity.destinationId),
    } : undefined;
    const missions = missionsFor(activity.category, activity.localDate, activity.destination?.name,
      activity.activityMinutes, recentIds, prior, reflectionChoicesBySlot[activity.slotId]);
    previous.push({ ...activity, completedMissionIds: missions.map((mission) => mission.id), state: "completed" });
    return { ...activity, missions };
  });
}
function placeTask(category: string, destination: Destination, minutes: number): string[] {
  if (category === "hiking") return [
    `Open the mapped ${destination.name} route and check its trailhead and current access.`,
    `Hike the mapped loop at your own pace for about ${minutes} minutes, turning back if the route is unclear.`,
    "Allow the planned drive back before your next commitment.",
  ];
  return [
    `Open the map link and find a public entrance to ${destination.name}.`,
    category === "park"
      ? `Spend about ${minutes} minutes exploring paths or resting inside ${destination.name}.`
      : category === "reading" ? `Read outside at ${destination.name} for about ${minutes} minutes.`
      : category === "picnic" ? `Bring a snack or meal and picnic at ${destination.name} for about ${minutes} minutes.`
      : category === "photography" ? `Photograph nature at ${destination.name} for about ${minutes} minutes.`
      : category === "exercise" ? `Move or stretch outdoors at ${destination.name} for about ${minutes} minutes.`
      : `Walk for about ${minutes} minutes along paths in ${destination.name}.`,
    "Leave enough time for the return journey.",
  ];
}

export function eligibleTemplates(p: Preferences) {
  return catalogue.filter(
    (t) =>
      p.interests.includes(t.category) &&
      effort[t.intensity] <= effort[p.intensity] &&
      (t.category !== "garden" || p.garden) &&
      (t.category !== "cycling" || p.bicycle) &&
      (!t.long || p.longerOuting),
  );
}
export function budgetFor(
  t: (typeof catalogue)[number],
  p: Preferences,
  minutes: number,
  destination?: Destination | null,
) {
  const travel =
    t.category === "garden"
      ? 0
      : t.category === "hiking"
        ? destination?.driveMinutes ?? p.hikeDriveMinutes
        : p.travelMinutes;
  return {
    preparationMinutes: t.long ? 10 : 2,
    outwardMinutes: travel,
    returnMinutes: travel,
    bufferMinutes: t.long ? 10 : 3,
    totalMinutes: minutes + travel * 2 + (t.long ? 20 : 5),
  };
}
export function validateProposals(
  raw: unknown,
  available: Slot[],
  p: Preferences,
  s: Schedule,
  weather: Weather,
  existing: Activity[] = [],
  now = new Date().toISOString(),
  destinations: Destination[] = [],
): Activity[] {
  const parsed = ModelOutput.parse(raw);
  const chosen = existing.filter(reserved);
  const occupied: Span[] = chosen.map((a) => [
    Date.parse(a.start),
    Date.parse(a.end),
  ]);
  const days = new Set(chosen.map((a) => a.localDate));
  const usedPlaces = new Set(
    chosen.map((a) => a.destinationId).filter(Boolean),
  );
  let longCount = chosen.filter((a) => a.long).length;
  return parsed.activities.map((proposal) => {
    const slot = available.find((x) => x.id === proposal.slotId);
    const template = eligibleTemplates(p).find(
      (x) => x.id === proposal.templateId,
    );
    if (!slot || !template)
      throw new PlannerError("Unknown or ineligible slot/template.");
    if (slot.longOnly && !template.long)
      throw new PlannerError("This early start is reserved for a longer outing.");
    if (
      proposal.category !== template.category ||
      proposal.intensity !== template.intensity
    )
      throw new PlannerError("Category or effort is not allowed.");
    const destination = proposal.destinationId
      ? destinations.find((d) => d.id === proposal.destinationId)
      : undefined;
    if (
      proposal.destinationId &&
      (!destination || !placeFits(destination, template, p))
    )
      throw new PlannerError(
        "The named place is unknown or beyond your travel estimate.",
      );
    if (
      destination &&
      !proposal.title
        .toLocaleLowerCase()
        .includes(destination.name.toLocaleLowerCase())
    )
      throw new PlannerError("The named place must match the linked source.");
    if (
      destination &&
      usedPlaces.has(destination.id) &&
      destinations.some(
        (d) =>
          d.id !== destination.id &&
          !usedPlaces.has(d.id) &&
          placeFits(d, template, p),
      )
    )
      throw new PlannerError("Try a different nearby place this week.");
    if ((template.category === "hiking" || template.category === "park" || template.category === "picnic") && !destination)
      throw new PlannerError(
        "This outing needs a sourced destination.",
      );
    if (
      proposal.activityMinutes < template.min ||
      proposal.activityMinutes >
        Math.min(template.max, template.long ? p.longMinutes : p.shortMinutes)
    )
      throw new PlannerError("Activity duration exceeds your limits.");
    if (
      destination?.kind === "hike" &&
      destination.routeKm &&
      proposal.activityMinutes < Math.ceil((destination.routeKm / 2.5) * 60)
    )
      throw new PlannerError(
        "The route distance needs more time at a cautious estimated pace.",
      );
    const budget = budgetFor(template, p, proposal.activityMinutes, destination);
    let start = Date.parse(slot.start);
    if (start < Date.parse(now))
      throw new PlannerError(
        "This suggestion is in the past. Generate a fresh plan.",
      );
    if (template.daylight) {
      const day =
        weather.status === "available"
          ? weather.days?.[slot.localDate]
          : undefined;
      if (!day)
        throw new PlannerError(
          "Daylight information is unavailable for this activity.",
        );
      start = Math.max(start, Date.parse(day.sunrise));
      if (start + budget.totalMinutes * 60000 > Date.parse(day.sunset))
        throw new PlannerError("The entire outing must fit in daylight.");
      if (template.long && (day.rain > 70 || day.wind > 40))
        throw new PlannerError(
          "Review conditions before planning a longer outing.",
        );
    }
    const end = start + budget.totalMinutes * 60000;
    if (
      end > Date.parse(slot.end) ||
      budget.totalMinutes > slot.budget ||
      occupied.some((b) => overlap([start, end], b))
    )
      throw new PlannerError("The complete time budget does not fit.");
    if (days.has(slot.localDate) || days.size >= p.daysPerWeek)
      throw new PlannerError("Weekly frequency limit reached.");
    if (template.long && ++longCount > 1)
      throw new PlannerError("Only one longer outing per week.");
    days.add(slot.localDate);
    if (destination) usedPlaces.add(destination.id);
    occupied.push([start, end]);
    return {
      ...proposal,
      ...(destination ? { steps: placeTask(template.category, destination, proposal.activityMinutes) } : {}),
      ...(destination ? { destination } : {}),
      missions: missionsFor(template.category, slot.localDate, destination?.name, proposal.activityMinutes),
      ...budget,
      id: randomUUID(),
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      localDate: slot.localDate,
      long: template.long,
      state: "suggested",
      weather,
      scheduleVersion: s.version,
      preferenceVersion: p.version,
    };
  });
}
export function basicPlan(
  available: Slot[],
  p: Preferences,
  s: Schedule,
  weather: Weather,
  existing: Activity[] = [],
  now = new Date().toISOString(),
  avoid?: string,
  options: { places?: Destination[]; history?: Activity[] } = {},
): Activity[] {
  const result: Activity[] = [];
  const places = options.places ?? [],
    history = options.history ?? [];
  const longSlots = available.filter((slot) => {
    const day =
      weather.status === "available"
        ? weather.days?.[slot.localDate]
        : undefined;
    return (
      !!day &&
      day.rain <= 70 &&
      day.wind <= 40 &&
      Date.parse(day.sunset) -
        Math.max(Date.parse(day.sunrise), Date.parse(slot.start)) >=
        90 * 60000 &&
      eligibleTemplates(p).some(
        (t) =>
          t.long &&
          t.id !== avoid &&
          (t.category === "hiking"
            ? places.some(
                (d) =>
                  placeFits(d, t, p) &&
                  slot.budget >= budgetFor(t, p, t.min, d).totalMinutes &&
                  Math.min(Date.parse(slot.end), Date.parse(day.sunset)) -
                    Math.max(Date.parse(slot.start), Date.parse(day.sunrise)) >=
                    budgetFor(t, p, t.min, d).totalMinutes * 60000,
              )
            : slot.budget >= budgetFor(t, p, t.min).totalMinutes &&
              Math.min(Date.parse(slot.end), Date.parse(day.sunset)) -
                Math.max(Date.parse(slot.start), Date.parse(day.sunrise)) >=
                budgetFor(t, p, t.min).totalMinutes * 60000),
      )
    );
  });
  const longTarget = [...longSlots].sort(
    (a, b) =>
      b.budget +
      ([6, 7].includes(DateTime.fromISO(b.localDate).weekday) ? 120 : 0) -
      (a.budget +
        ([6, 7].includes(DateTime.fromISO(a.localDate).weekday) ? 120 : 0)),
  )[0];
  const ordered = longTarget
    ? [longTarget, ...available.filter((x) => x.id !== longTarget.id)]
    : available;
  for (const slot of ordered) {
    const candidates = eligibleTemplates(p)
      .filter((t) => t.id !== avoid && (!slot.longOnly || t.long) && (!t.long || slot.id === longTarget?.id))
      .flatMap((t) => {
        const optionsForTemplate = places.filter((d) => placeFits(d, t, p));
        if ((t.category === "hiking" || t.category === "park" || t.category === "picnic") && !optionsForTemplate.length) return [];
        const destinations = t.category === "hiking" || t.category === "park" || t.category === "picnic" || (optionsForTemplate.length && p.latitude !== undefined)
          ? optionsForTemplate
          : [...optionsForTemplate, null];
        return destinations.map((destination) => ({
          t,
          destination,
          score:
            placeScore(destination, t.id, t.category, history, result) -
            (t.long && slot.id === longTarget?.id ? 100 : 0) -
            (t.category === "hiking" ? 20 : 0) -
            (["garden", "photography", "reading", "exercise", "picnic"].includes(t.category) ? 5 : 0),
        }));
      })
      .sort((a, b) => a.score - b.score);
    for (const { t, destination } of candidates) {
      const overhead = budgetFor(t, p, 0, destination).totalMinutes;
      const minutes = Math.min(
        t.max,
        t.long ? p.longMinutes : p.shortMinutes,
        slot.budget - overhead,
      );
      if (minutes < t.min) continue;
      const proposal: Proposal = {
        slotId: slot.id,
        templateId: t.id,
        category: t.category,
        title: destination
          ? `${t.category === "hiking" ? "Hike" : t.category === "park" ? "Visit" : t.category === "picnic" ? "Picnic at" : t.category === "reading" ? "Read at" : t.category === "photography" ? "Photograph nature at" : t.category === "exercise" ? "Move outside at" : "Explore"} ${destination.name}`
          : t.category === "garden" ? "Care for your outdoor plants at home" : t.title,
        activityMinutes: minutes,
        intensity: t.intensity,
        destinationId: destination?.id ?? null,
        reason: destination
          ? destination.kind === "hike"
            ? `${destination.name} is a mapped loop with an estimated ${destination.driveMinutes}-minute one-way drive to its mapped center. Check the actual trailhead, route, access and journey before going.`
            : `${destination.name} is a mapped place about ${destination.distanceKm} km away in a straight line. Check the actual route, access and your travel estimate before going.`
          : t.category === "garden" ? "Use your own outdoor garden, balcony, or plants at home during this confirmed window." : "Fits an outdoor window you confirmed, including preparation, travel and a return buffer.",
        steps: destination
          ? [
              "Check the source link, access and actual journey before leaving.",
              "Follow a route that fits your own pace and return time.",
            ]
          : t.category === "garden" ? ["Go to your outdoor garden, balcony, or plants at home.", "Check the soil, water if needed, and remove weeds or dead leaves where appropriate.", "Tidy tools before your next commitment."] : ["Choose a familiar public outdoor space you can reach.", "Take it at your own pace.", "Allow time to return before your next commitment."],
      };
      try {
        const [activity] = validateProposals(
          { activities: [proposal] },
          [slot],
          p,
          s,
          weather,
          [
            ...existing,
            ...result.map((a) => ({ ...a, state: "accepted" as const })),
          ],
          now,
          places,
        );
        result.push(activity!);
        break;
      } catch {
        /* Try another validated option. */
      }
    }
  }
  return result.sort((a, b) => a.start.localeCompare(b.start));
}
export function revalidateActivity(
  a: Activity,
  s: Schedule,
  p: Preferences,
  existing: Activity[],
  now: string,
): void {
  // Recheck the reserved calendar span, even if the user accepts or records it
  // after its scheduled start. Clipping slots to the current clock would erase
  // that span and incorrectly report a schedule conflict.
  const validationNow = new Date(Math.min(Date.parse(now), Date.parse(a.start))).toISOString();
  const available = slots(s, p, existing, validationNow, a.id, false);
  const slot = available.find(
    (x) =>
      Date.parse(x.start) <= Date.parse(a.start) &&
      Date.parse(x.end) >= Date.parse(a.end),
  );
  if (!slot)
    throw new PlannerError("This time now conflicts with your schedule.");
  const [validated] = validateProposals(
    {
      activities: [
        {
          slotId: slot.id,
          templateId: a.templateId,
          category: a.category,
          title: a.title,
          activityMinutes: a.activityMinutes,
          intensity: a.intensity,
          destinationId: a.destinationId,
          reason: a.reason,
          steps: a.steps,
        },
      ],
    },
    [{ ...slot, start: a.start }],
    p,
    s,
    a.weather,
    existing.filter((x) => x.id !== a.id),
    validationNow,
    a.destination ? [a.destination] : [],
  );
  if (validated.totalMinutes !== a.totalMinutes || validated.end !== a.end)
    throw new PlannerError(
      "Your travel or preparation budget changed. Replace this activity to use your new limits.",
    );
}
