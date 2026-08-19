import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link, useRouter } from "expo-router";
import { useAuth } from "@/lib/auth";
import { useFamily } from "@/lib/family";
import { colors } from "@/lib/theme";
import { fullName, isRainbow, lifeSpan } from "@/lib/format";
import type { Person } from "@/lib/types";
import { PersonAvatar } from "@/components/PersonAvatar";

/** Türkçe-duyarlı, aksan-toleranslı arama anahtarı. */
function norm(s: string): string {
  return s
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .replace(/[çğöşü]/g, (c) => ({ ç: "c", ğ: "g", ö: "o", ş: "s", ü: "u" }[c] ?? c));
}

export default function Home() {
  const { user } = useAuth();
  const { people, loading, refreshing, error, refresh } = useFamily();
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const sorted = [...people].sort((a, b) =>
      fullName(a).localeCompare(fullName(b), "tr")
    );
    const q = norm(query.trim());
    if (!q) return sorted;
    return sorted.filter((p) => {
      const hay = norm(
        [fullName(p), p.birthDate ?? "", p.deathDate ?? "", p.birthPlace ?? "", p.code ?? ""].join(" ")
      );
      return hay.includes(q);
    });
  }, [people, query]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top", "left", "right"]}>
      {/* Başlık şeridi */}
      <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 22, fontWeight: "700", color: colors.text }} numberOfLines={1}>
              {user?.treeName ?? "Ağacım"}
            </Text>
            <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 2 }}>
              {people.length} kişi
            </Text>
          </View>
          <Link href="/(app)/menu" asChild>
            <Pressable
              hitSlop={10}
              style={{
                width: 42,
                height: 42,
                borderRadius: 21,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surface,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontSize: 18, color: colors.text }}>☰</Text>
            </Pressable>
          </Link>
        </View>

        {/* Arama */}
        <View style={{ marginTop: 14 }}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="İsim, yıl veya yer ara…"
            placeholderTextColor={colors.textSubtle}
            autoCorrect={false}
            style={{
              height: 46,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              paddingHorizontal: 14,
              fontSize: 15,
              color: colors.text,
            }}
          />
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : error ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
          <Text style={{ color: colors.danger, textAlign: "center", marginBottom: 16 }}>{error}</Text>
          <Pressable
            onPress={refresh}
            style={{
              paddingHorizontal: 20,
              paddingVertical: 10,
              borderRadius: 10,
              backgroundColor: colors.primary,
            }}
          >
            <Text style={{ color: colors.primaryText, fontWeight: "600" }}>Yeniden dene</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 28 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <View style={{ alignItems: "center", paddingTop: 48 }}>
              <Text style={{ color: colors.textMuted }}>
                {query ? "Eşleşen kişi yok." : "Henüz kişi eklenmemiş."}
              </Text>
            </View>
          }
          renderItem={({ item }) => <PersonRow person={item} />}
        />
      )}
    </SafeAreaView>
  );
}

function PersonRow({ person }: { person: Person }) {
  const router = useRouter();
  const rainbow = isRainbow(person);
  const span = lifeSpan(person.birthDate, person.deathDate);
  const sub = [span, person.birthPlace].filter(Boolean).join(" · ");

  return (
    <Pressable
      onPress={() => router.push(`/(app)/person/${person.id}`)}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        paddingVertical: 10,
        paddingHorizontal: 12,
        marginVertical: 4,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: rainbow ? "transparent" : colors.border,
        backgroundColor: rainbow ? "#fbe9ef" : colors.surface,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      {rainbow && (
        <View
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 5,
            borderTopLeftRadius: 14,
            borderBottomLeftRadius: 14,
            backgroundColor: "#d64f8a",
          }}
        />
      )}
      <PersonAvatar person={person} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 16, fontWeight: "600", color: colors.text }} numberOfLines={1}>
          {fullName(person)}
        </Text>
        {sub ? (
          <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 2 }} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
      <Text style={{ color: colors.textSubtle, fontSize: 20 }}>›</Text>
    </Pressable>
  );
}
