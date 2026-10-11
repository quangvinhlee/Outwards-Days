import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import type { Plan, Preferences } from "@outsideweek/contracts";
export async function askReminders() {
  if (Platform.OS === "web") return false;
  if (Platform.OS === "android")
    await Notifications.setNotificationChannelAsync("outdoor", {
      name: "Outdoor plans",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  return (await Notifications.requestPermissionsAsync()).granted;
}
export async function reconcileReminders(
  plans: Plan[],
  preferences: Preferences,
) {
  if (Platform.OS === "web") return;
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (
    !preferences.reminders ||
    !(await Notifications.getPermissionsAsync()).granted
  )
    return;
  for (const a of plans
    .flatMap((p) => p.activities)
    .filter(
      (a) => a.state === "accepted" && Date.parse(a.start) > Date.now() + 60000,
    ))
    await Notifications.scheduleNotificationAsync({
      identifier: a.id,
      content: {
        title: "A little room for outside",
        body: a.title,
        data: { activityId: a.id },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(a.start),
        channelId: "outdoor",
      },
    });
  await Notifications.scheduleNotificationAsync({
    identifier: "weekly-review",
    content: {
      title: "What does your week look like?",
      body: "Confirm your week when you have a moment.",
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
      weekday: preferences.weekStartsOn === 1 ? 2 : 1,
      hour: 8,
      minute: 0,
      channelId: "outdoor",
    },
  });
}
export async function cancelReminder(id: string) {
  if (Platform.OS !== "web")
    await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
}
