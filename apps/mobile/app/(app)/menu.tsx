import { Pressable, ScrollView, Share, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { useAuth } from "@/lib/auth";
import { useFamily } from "@/lib/family";
import { API_BASE_URL } from "@/lib/config";
import { colors } from "@/lib/theme";
import { styles } from "@/lib/styles";
import { BrandMark } from "@/lib/BrandMark";

/** Hesap / ağaç bilgisi ve oturum işlemleri. */
export default function Menu() {
  const { user, signOut } = useAuth();
  const { people } = useFamily();
  const router = useRouter();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ headerShown: true, title: "Menü" }} />
      <ScrollView contentContainerStyle={{ padding: 24 }}>
        <BrandMark />
        <Text style={styles.title}>{user?.treeName ?? "Ağacım"}</Text>
        <Text style={styles.subtitle}>{user?.name ? user.name : ""}</Text>

        <View
          style={{
            marginTop: 8,
            padding: 18,
            borderRadius: 16,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            gap: 6,
          }}
        >
          <Row label="Rol" value={user?.isFounder ? "Kurucu" : user?.role ?? "—"} />
          <Row label="Kişi sayısı" value={String(people.length)} />
        </View>

        <NavButton label="🌳 Ağaç görünümü" to="/(app)/tree" router={router} />
        <NavButton label="📍 Yerler / harita" to="/(app)/map" router={router} />
        <NavButton label="📖 Aile kitabı" to="/(app)/book" router={router} />
        <NavButton label="🤖 Yapay zekâya sor" to="/(app)/ai" router={router} />
        <Pressable
          style={styles.buttonSecondary}
          onPress={() =>
            Share.share({
              message: `${user?.treeName ?? "Aile ağacımız"} — Soy Ağacı\n${API_BASE_URL}`,
            })
          }
        >
          <Text style={styles.buttonSecondaryText}>📤 Ağacı paylaş</Text>
        </Pressable>
        <Pressable style={styles.buttonSecondary} onPress={() => router.back()}>
          <Text style={styles.buttonSecondaryText}>Listeye dön</Text>
        </Pressable>
        <Pressable style={[styles.buttonSecondary, { borderColor: colors.danger }]} onPress={signOut}>
          <Text style={[styles.buttonSecondaryText, { color: colors.danger }]}>Çıkış yap</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function NavButton({
  label,
  to,
  router,
}: {
  label: string;
  to: string;
  router: ReturnType<typeof useRouter>;
}) {
  return (
    <Pressable
      style={[styles.buttonSecondary, { borderColor: colors.primary }]}
      onPress={() => {
        router.back();
        router.push(to as never);
      }}
    >
      <Text style={[styles.buttonSecondaryText, { color: colors.primary }]}>{label}</Text>
    </Pressable>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 }}>
      <Text style={{ color: colors.textMuted, fontSize: 14 }}>{label}</Text>
      <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600" }}>{value}</Text>
    </View>
  );
}
