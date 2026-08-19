import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { colors } from "@/lib/theme";
import { styles } from "@/lib/styles";
import { BrandMark } from "@/lib/BrandMark";

interface FamilyData {
  people: Array<{ id: string }>;
}

/**
 * Geçici ana ekran (Aşama 1 doğrulaması): giriş sonrası hesabı gösterir ve
 * jetonla korumalı /api/family'yi çekerek uçtan uca kimliği kanıtlar. Ağaç
 * listesi/görünümü sonraki aşamalarda gelecek.
 */
export default function Home() {
  const { user, token, signOut } = useAuth();
  const [count, setCount] = useState<number | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const data = await apiFetch<FamilyData>("/api/family", { token });
        setCount(data.people?.length ?? 0);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Veri alınamadı.");
      }
    })();
  }, [token]);

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={{ padding: 24 }}>
        <BrandMark />
        <Text style={styles.title}>{user?.treeName ?? "Ağacım"}</Text>
        <Text style={styles.subtitle}>Hoş geldin{user?.name ? `, ${user.name}` : ""}</Text>

        <View style={{ marginTop: 16, padding: 18, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
          {count === null && !err ? (
            <Text style={{ color: colors.textMuted }}>Ağaç verisi yükleniyor…</Text>
          ) : err ? (
            <Text style={{ color: colors.danger }}>{err}</Text>
          ) : (
            <Text style={{ color: colors.text, fontSize: 16 }}>
              Ağaçta <Text style={{ fontWeight: "700" }}>{count}</Text> kişi kayıtlı.
            </Text>
          )}
          <Text style={{ color: colors.textSubtle, fontSize: 12, marginTop: 8 }}>
            (Jeton kimliği çalışıyor — ağaç görünümü sonraki aşamada.)
          </Text>
        </View>

        <Pressable style={styles.buttonSecondary} onPress={signOut}>
          <Text style={styles.buttonSecondaryText}>Çıkış yap</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
