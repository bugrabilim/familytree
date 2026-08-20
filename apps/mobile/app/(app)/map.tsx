import { useMemo } from "react";
import { Linking, Pressable, SectionList, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { useFamily } from "@/lib/family";
import { googleMapsUrl } from "@/lib/places";
import { colors } from "@/lib/theme";
import { fullName } from "@/lib/format";
import type { Person } from "@/lib/types";

interface PlaceEntry {
  place: string;
  people: { id: string; name: string; kind: "birth" | "burial" }[];
}

/**
 * Yerler — kişilerin doğum ve defin yerlerini toplar, her yeri Google Maps'te
 * açar. (Native gömülü harita sonraki sürümde; şimdilik kanıtlanmış bağlantı.)
 */
export default function MapScreen() {
  const { people } = useFamily();
  const router = useRouter();

  const sections = useMemo(() => {
    const map = new Map<string, PlaceEntry>();
    const add = (place: string | undefined, p: Person, kind: "birth" | "burial") => {
      const key = place?.trim();
      if (!key) return;
      const norm = key.toLocaleLowerCase("tr");
      if (!map.has(norm)) map.set(norm, { place: key, people: [] });
      map.get(norm)!.people.push({ id: p.id, name: fullName(p), kind });
    };
    for (const p of people) {
      add(p.birthPlace, p, "birth");
      add(p.burialPlace, p, "burial");
    }
    const list = [...map.values()].sort((a, b) => b.people.length - a.people.length);
    return list.map((e) => ({ title: e.place, count: e.people.length, data: e.people }));
  }, [people]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["left", "right", "bottom"]}>
      <Stack.Screen options={{ headerShown: true, title: "Yerler" }} />
      <SectionList
        sections={sections}
        keyExtractor={(item, i) => `${item.id}-${item.kind}-${i}`}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        stickySectionHeadersEnabled={false}
        ListEmptyComponent={
          <Text style={{ color: colors.textMuted, textAlign: "center", marginTop: 48 }}>
            Kayıtlı yer yok. Kişilere doğum/defin yeri ekleyin.
          </Text>
        }
        renderSectionHeader={({ section }) => (
          <Pressable
            onPress={() => Linking.openURL(googleMapsUrl(section.title))}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingVertical: 12,
              paddingHorizontal: 14,
              marginTop: 12,
              borderRadius: 12,
              backgroundColor: pressed ? colors.surface2 : colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
            })}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
              <Text style={{ fontSize: 16 }}>📍</Text>
              <Text style={{ fontSize: 16, fontWeight: "700", color: colors.text, flexShrink: 1 }} numberOfLines={1}>
                {section.title}
              </Text>
              <Text style={{ fontSize: 13, color: colors.textMuted }}>({section.count})</Text>
            </View>
            <Text style={{ color: colors.primary, fontWeight: "600", fontSize: 13 }}>Haritada aç ›</Text>
          </Pressable>
        )}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/(app)/person/${item.id}`)}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingVertical: 9,
              paddingHorizontal: 16,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Text style={{ color: colors.text, fontSize: 14 }} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={{ color: colors.textSubtle, fontSize: 12 }}>
              {item.kind === "birth" ? "doğum" : "defin"}
            </Text>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}
