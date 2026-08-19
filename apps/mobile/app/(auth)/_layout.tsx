import { Redirect, Stack } from "expo-router";
import { useAuth } from "@/lib/auth";

/** Kimlik grubu — zaten girişliyse uygulamaya yönlendir. */
export default function AuthLayout() {
  const { token, loading } = useAuth();
  if (!loading && token) return <Redirect href="/(app)/home" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
