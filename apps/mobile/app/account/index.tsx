import { useState } from "react";
import { Alert, Platform, Text, View } from "react-native";
import { router } from "expo-router";
import { useApp } from "../../src/context";
import { Button, Field, Screen, styles } from "../../src/ui";

export default function Account() {
  const app = useApp();
  const [mode, setMode] = useState<"register" | "login">("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const submit = async (discardPending = false) => {
    setMessage("");
    try {
      if (mode === "register") await app.register(email.trim(), password);
      else await app.signIn(email.trim(), password, discardPending);
      setPassword("");
      router.replace("/(tabs)/you");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Please try again.");
    }
  };
  const onSubmit = () => {
    if (mode === "login" && app.pending.length) {
      const text = "Some guest completions have not synced. Switching accounts now removes those local drafts.";
      if (Platform.OS === "web") {
        if (window.confirm(text)) void submit(true);
      } else Alert.alert("Unsynced completions", text, [
        { text: "Keep them", style: "cancel" },
        { text: "Switch anyway", style: "destructive", onPress: () => void submit(true) },
      ]);
      return;
    }
    void submit();
  };
  return (
    <Screen stack>
      <Text style={styles.eyebrow}>YOUR OUTSIDE STORY</Text>
      <Text style={styles.title}>{mode === "register" ? "Keep it with you." : "Welcome back."}</Text>
      <Text style={styles.body}>
        {mode === "register"
          ? "Create an account to keep this device’s guest plans, outings and history and open them on another device."
          : "Sign in to see your saved plans and history. A different guest profile on this device stays separate."}
      </Text>
      <View style={{ gap: 14 }}>
        <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete={mode === "register" ? "new-password" : "current-password"} />
        {mode === "register" ? <Text style={styles.small}>Use at least 12 characters. There is no password reset yet, so keep it somewhere safe.</Text> : null}
        {message ? <Text accessibilityRole="alert" style={styles.error}>{message}</Text> : null}
        <Button
          label={mode === "register" ? "Create account" : "Sign in"}
          disabled={app.busy}
          onPress={onSubmit}
        />
        <Button label={mode === "register" ? "I already have an account" : "Create an account instead"} secondary onPress={() => { setMode(mode === "register" ? "login" : "register"); setMessage(""); }} />
      </View>
    </Screen>
  );
}
