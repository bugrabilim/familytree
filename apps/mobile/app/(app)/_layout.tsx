import { Redirect, Stack } from "expo-router";
import { useAuth } from "@/lib/auth";

/** Korumalı grup — jeton yoksa girişe yönlendir. */
export default function AppLayout() {
  const { token, loading } = useAuth();
  if (!loading && !token) return <Redirect href="/(auth)/login" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
