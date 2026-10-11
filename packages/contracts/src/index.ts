import { z } from "zod";

export const Category = z.enum([
  "walk",
  "park",
  "garden",
  "photography",
  "reading",
  "cycling",
  "hiking",
  "exercise",
  "picnic",
]);
export const Effort = z.enum(["gentle", "moderate", "vigorous"]);
export const Time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const DateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const Window = z.object({ start: Time, end: Time });
export const Block = z.object({
  id: z.string().min(1).max(80),
  day: z.number().int().min(-1).max(6),
  start: Time,
  end: Time,
  nextDay: z.boolean().default(false),
  kind: z.enum(["work", "sleep", "commute", "other"]),
  lunch: Window.optional(),
});
export const Preferences = z.object({
  timezone: z.string().min(1).max(80).default("Australia/Melbourne"),
  weekStartsOn: z.union([z.literal(1), z.literal(7)]).default(1),
  area: z.string().max(100).default(""),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  interests: z.array(Category).min(1).max(9).default(["walk", "park"]),
  intensity: Effort.default("gentle"),
  shortMinutes: z.number().int().min(5).max(45).default(25),
  longMinutes: z.number().int().min(60).max(360).default(90),
  daysPerWeek: z.number().int().min(1).max(7).default(4),
  earlyMornings: z.boolean().default(false),
  longerOuting: z.boolean().default(false),
  transport: z.enum(["walk", "bicycle", "car", "public"]).default("walk"),
  travelMinutes: z.number().int().min(0).max(120).default(5),
  hikeDriveMinutes: z.number().int().min(15).max(240).default(180),
  garden: z.boolean().default(false),
  bicycle: z.boolean().default(false),
  reminders: z.boolean().default(false),
  version: z.number().int().nonnegative().default(0),
});
export type Preferences = z.infer<typeof Preferences>;
export const Schedule = z.object({
  weekStart: DateKey,
  timezone: z.string(),
  blocks: z.array(Block).max(100),
  fullDays: z.array(z.number().int().min(0).max(6))
    .max(7)
    .refine((days) => new Set(days).size === days.length, "Each day can only be marked free once")
    .optional(),
  windows: z
    .array(
      z.object({ day: z.number().int().min(0).max(6), start: Time, end: Time }),
    )
    .max(28),
  confirmedDays: z
    .array(z.number().int().min(0).max(6))
    .length(7)
    .refine((v) => new Set(v).size === 7, "Confirm every day"),
  version: z.number().int().nonnegative(),
  confirmedAt: z.string().optional(),
});
export type Schedule = z.infer<typeof Schedule>;
export const Proposal = z
  .object({
    slotId: z.string(),
    templateId: z.string(),
    category: Category,
    title: z.string().min(1).max(100),
    activityMinutes: z.number().int().min(5).max(360),
    intensity: Effort,
    destinationId: z.string().nullable(),
    reason: z.string().min(1).max(300),
    steps: z.array(z.string().min(1).max(200)).min(1).max(5),
  })
  .strict();
export const ModelOutput = z
  .object({ activities: z.array(Proposal).max(7) })
  .strict();
export type Proposal = z.infer<typeof Proposal>;
export type Weather = {
  status: "pending" | "available" | "stale" | "unavailable" | "needs_review";
  fetchedAt?: string;
  source: string;
  days?: Record<
    string,
    {
      sunrise: string;
      sunset: string;
      rain: number;
      wind: number;
      min: number;
      max: number;
    }
  >;
};
export type Destination = {
  id: string;
  name: string;
  url: string;
  source: string;
  fetchedAt: string;
  kind?: "park" | "garden" | "square" | "picnic_site" | "riverside" | "hike" | "other";
  latitude?: number;
  longitude?: number;
  distanceKm?: number; // Straight-line distance from the approximate user position.
  routeKm?: number; // Source-tagged distance for a complete loop hiking route.
  driveMinutes?: number; // Estimated one-way driving time to the mapped route center.
};
export type Slot = {
  id: string;
  start: string;
  end: string;
  localDate: string;
  budget: number;
  longOnly?: boolean;
};
export type Mission = {
  id: string;
  title: string;
  detail: string;
  kind?: "action" | "photo" | "reflection";
  targetId?: string;
};
export const photoTargets = [
  { id: "bird", label: "bird" }, { id: "plant", label: "plant" },
  { id: "flower", label: "flower" }, { id: "tree", label: "tree" },
  { id: "dog", label: "dog" }, { id: "insect", label: "insect" },
  { id: "sky", label: "sky or clouds" }, { id: "texture", label: "natural texture" },
] as const;
type MissionGroup = Mission[];
const nature: MissionGroup = [
  { id: "bird", title: "Spot a bird", detail: "Watch from a distance without disturbing it. No species identification is needed." },
  { id: "dog", title: "Spot a dog", detail: "If one is nearby, observe from a distance. Ask its owner before approaching or taking a photo." },
  { id: "pollinator", title: "Look for a pollinator", detail: "Watch a flower or plant briefly. If nothing visits, notice how the plant is shaped instead." },
  { id: "birdsongs", title: "Listen for bird calls", detail: "Pause for two minutes and count distinct calls you hear, even if you cannot see the birds." },
];
const creative: MissionGroup = [
  { id: "plant-photo", title: "Photograph a plant", detail: "Take a picture of a plant from the path. Leave it untouched.", kind: "photo", targetId: "plant" },
  { id: "texture-photo", title: "Capture a natural texture", detail: "Photograph bark, stone or a leaf without moving anything.", kind: "photo", targetId: "texture" },
  { id: "bird-photo", title: "Photograph a bird", detail: "Keep your distance and do not disturb wildlife.", kind: "photo", targetId: "bird" },
  { id: "sky-photo", title: "Photograph the sky", detail: "Capture clouds, colour or open sky from a safe spot.", kind: "photo", targetId: "sky" },
  { id: "colour-hunt", title: "Find three natural colours", detail: "Look for three different colours in plants, sky or stone. This works as a game with children too." },
  { id: "sketch", title: "Make a tiny field note", detail: "Write one thing you noticed. A single sentence is enough.", kind: "reflection" },
  { id: "surprise-note", title: "What surprised you?", detail: "Write one thing you saw, heard or felt that was different from what you expected.", kind: "reflection" },
];
const pause: MissionGroup = [
  { id: "quiet-pause", title: "Take a quiet pause", detail: "Stop somewhere appropriate for two minutes and notice the sounds around you." },
  { id: "family-game", title: "Try a mini nature hunt", detail: "If children are with you, take turns finding a leaf, a bird and a cloud. Try it solo otherwise." },
  { id: "look-up", title: "Look up for a moment", detail: "Notice the shape of the canopy, clouds or skyline without leaving the path." },
  { id: "dog-respect", title: "Share the path kindly", detail: "Give people and dogs room to pass; ask before interacting with anyone's dog." },
];
export const reflectionChoices = [
  { id: "describe-scene", title: "Describe what you see" },
  { id: "feeling-today", title: "How do you feel today?" },
  { id: "notice-change", title: "What changed?" },
] as const;
const reflectionFocus: Record<z.infer<typeof Category>, string> = {
  walk: "your route", park: "the park or reserve", garden: "your outdoor plants",
  photography: "the scene you photographed", reading: "your reading spot",
  cycling: "your route and surroundings", hiking: "the trail and landscape",
  exercise: "your movement outdoors", picnic: "your picnic spot",
};
export function missionsFor(
  category: z.infer<typeof Category>,
  localDate: string,
  placeName: string | undefined,
  activityMinutes: number,
  recentMissionIds: string[] = [],
  prior?: { note: string; placeName?: string; samePlace?: boolean },
  reflectionChoice?: number,
): Mission[] {
  const dayNumber = Math.floor(Date.parse(`${localDate}T00:00:00Z`) / 86400000);
  const rotation = Number.isFinite(dayNumber) ? dayNumber : 0;
  const pick = (group: MissionGroup, offset: number) => [...group].sort((a, b) => {
    const count = (id: string) => recentMissionIds.filter((used) => used === id).length;
    const start = ((rotation + offset) % group.length + group.length) % group.length;
    return count(a.id) - count(b.id) ||
      ((group.indexOf(a) - start + group.length) % group.length) -
      ((group.indexOf(b) - start + group.length) % group.length);
  })[0];
  const observation = pick(nature, 0);
  const creation = pick(creative, 1);
  const atPlace = placeName ? ` at ${placeName}` : "";
  const focus = placeName ? `${reflectionFocus[category]} at ${placeName}` : reflectionFocus[category];
  const prefix = prior?.note ? `Last time${prior.placeName ? ` at ${prior.placeName}` : ""}, you wrote: “${prior.note.slice(0, 100)}”. ` : "";
  const reflectionOptions: MissionGroup = reflectionChoices.map((choice) => ({
    ...choice, kind: "reflection",
    detail: choice.id === "describe-scene"
      ? `${prefix}Describe one detail of ${focus} that caught your attention.`
      : choice.id === "feeling-today"
        ? `${prefix}Write a sentence about how you feel outside today, and what may have shaped it.`
        : prior?.note
          ? `${prefix}What feels different now in ${focus}?`
          : `What is different about ${focus} today, or what would you like to notice next time?`,
  }));
  const sortedReflections = [...reflectionOptions].sort((a, b) => {
    const count = (id: string) => recentMissionIds.filter((used) => used === id).length;
    return count(a.id) - count(b.id) ||
      ((reflectionOptions.indexOf(a) - rotation % reflectionOptions.length + reflectionOptions.length) % reflectionOptions.length) -
      ((reflectionOptions.indexOf(b) - rotation % reflectionOptions.length + reflectionOptions.length) % reflectionOptions.length);
  });
  const aiChoice = reflectionChoice === undefined ? undefined : reflectionOptions[reflectionChoice];
  const leastUsed = recentMissionIds.filter((id) => id === sortedReflections[0].id).length;
  const reflection = prior?.samePlace && prior.note
    ? reflectionOptions[2]
    : aiChoice && recentMissionIds.filter((id) => id === aiChoice.id).length <= leastUsed
      ? aiChoice : sortedReflections[0];
  const missions: Mission[] = category === "hiking"
    ? [
        { id: "trail-marker", title: "Check a trail marker", detail: `At a marked junction${atPlace}, compare the sign with your map. Turn back if the route is unclear.` },
        creation.kind === "reflection" ? observation : creation,
        reflection,
      ]
    : category === "garden"
      ? [
          { id: "soil-check", title: "Check the soil", detail: "Feel the top few centimetres of soil before deciding whether your plants need water." },
          prior?.note
            ? { id: "growth-check", title: "Check how your plant has changed", detail: `${prefix}What has changed since then?`, kind: "reflection" }
            : { id: "plant-seedling", title: "Plant a seed or seedling", detail: "If you have one ready, plant it outdoors and remember what you planted. This optional task can be skipped if you have no supplies." },
          { id: "garden-note", title: prior?.note ? "Record today's growth" : "Record what you planted or noticed", detail: "Write the plant name and one change you can check on your next visit.", kind: "reflection" },
        ]
      : category === "reading"
        ? [
            { id: "read-outside", title: "Read a few pages", detail: `Find a comfortable public spot${atPlace} and read at your own pace.` },
            observation,
            reflection,
          ]
        : category === "cycling"
          ? [
              { id: "cycle-stop", title: "Take a safe stop", detail: "Stop clear of the path before looking around or using your phone." },
              observation,
              reflection,
            ]
          : category === "photography"
            ? [pick(creative.filter((mission) => mission.kind === "photo"), 1), observation, reflection]
            : category === "exercise"
              ? [{ id: "warm-up", title: "Warm up outdoors", detail: "Start with a gentle walk and move at a comfortable pace." }, { id: "move-break", title: "Try a short movement break", detail: "Stretch or do easy bodyweight movements in a safe public space." }, reflection]
              : category === "picnic"
                ? [{ id: "picnic-spot", title: "Find a comfortable spot", detail: "Choose an accessible public spot and settle in for a snack or meal." }, { id: "pack-out", title: "Leave the place tidy", detail: "Take your belongings and any litter with you." }, reflection]
            : [observation, creation.kind === "reflection" ? pick(creative.filter((mission) => mission.kind !== "reflection"), 1) : creation, reflection];
  return activityMinutes < 15 ? [missions[0], missions[missions.length - 1]] : missions;
}
export type Activity = Proposal & {
  id: string;
  start: string;
  end: string;
  localDate: string;
  preparationMinutes: number;
  outwardMinutes: number;
  returnMinutes: number;
  bufferMinutes: number;
  totalMinutes: number;
  long: boolean;
  state:
    | "suggested"
    | "accepted"
    | "needs_review"
    | "completed"
    | "partly_completed"
    | "skipped"
    | "replaced";
  weather: Weather;
  destination?: Destination;
  missions?: Mission[]; // Older saved plans may predate mini missions.
  completedMissionIds?: string[];
  photoVerifications?: Record<string, { targetId: string; verifiedAt: string }>;
  missionNotes?: Record<string, string>;
  feedback?: string;
  scheduleVersion: number;
  preferenceVersion: number;
};
export type Plan = {
  weekStart: string;
  revision: number;
  scheduleVersion: number;
  preferenceVersion: number;
  source: "gemma" | "basic";
  notice: string;
  activities: Activity[];
  generatedAt: string;
  model: string;
  attempts: number;
  destinations: Destination[];
};
export const Completion = z.object({
  clientEventId: z.string().uuid(),
  activityId: z.string().uuid(),
  outcome: z.enum(["completed", "partly_completed", "skipped"]),
  occurredAt: z.string().datetime(),
  feedback: z.string().max(300).optional(),
  missionIds: z.array(z.string().min(1).max(50)).max(3).optional(),
  missionNotes: z.record(z.string().min(1).max(50), z.string().trim().min(1).max(300)).optional(),
});
export type Completion = z.infer<typeof Completion>;
export type Run = {
  id: string;
  weekStart: string;
  inputKey: string;
  status: "queued" | "running" | "succeeded" | "failed";
  attempts: number;
  leaseUntil?: string;
  leaseToken?: string;
  error?: string;
  planRevision?: number;
  createdAt: string;
};
export type UserState = {
  id: string;
  revision: number;
  preferences: Preferences;
  schedules: Record<string, Schedule>;
  plans: Record<string, Plan>;
  runs: Run[];
  completions: Completion[];
};
export const defaultPreferences = (): Preferences => Preferences.parse({});
