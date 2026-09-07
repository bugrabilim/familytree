import { Redirect, Stack } from "expo-router";
import { useAuth } from "@/lib/auth";
import { FamilyProvider } from "@/lib/family";
import { OutboxProvider } from "@/lib/outbox-store";
import { colors } from "@/lib/theme";

/** Korumalı grup — jeton yoksa girişe yönlendir; ağaç verisini sağlar. */
export default function AppLayout() {
  const { token, loading } = useAuth();
  if (!loading && !token) return <Redirect href="/(auth)/login" />;
  return (
    /*
     * ÇEVRİMDIŞI KUYRUK, `FamilyProvider`ın İÇİNDE. Gönderim taze ağaç
     * verisi ve taze sürüm damgası istiyor; ikisi de aile bağlamından
     * geliyor (madde 44).
     */
    <FamilyProvider>
      <OutboxProvider>
        <Stack
          screenOptions={{
            headerShown: false,
            headerStyle: { backgroundColor: colors.bg },
            headerTintColor: colors.text,
            headerShadowVisible: false,
            contentStyle: { backgroundColor: colors.bg },
          }}
        >
          <Stack.Screen name="home" />
          <Stack.Screen name="menu" options={{ presentation: "modal" }} />
          <Stack.Screen name="person/[id]" />
          <Stack.Screen name="person/new" />
          <Stack.Screen name="person/edit/[id]" />
          <Stack.Screen name="tree" />
          <Stack.Screen name="map" />
          <Stack.Screen name="book" />
          <Stack.Screen name="ai" />
          <Stack.Screen name="outbox" />
        </Stack>
      </OutboxProvider>
    </FamilyProvider>
  );
}
