import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useFamily } from "@/lib/family";
import { colors } from "@/lib/theme";
import { fullName, isRainbow, lifeSpan } from "@/lib/format";
import type { Person } from "@/lib/types";
import { PersonAvatar } from "@/components/PersonAvatar";

/**
 * Gezilebilir ağaç: odak kişi ortada; ebeveynler üstte, eş(ler) & kardeşler
 * yanında, çocuklar altta. Bir karta dokununca o kişi yeni odak olur. React
 * Flow'un mobil-dostu, dikey karşılığı.
 */
export default function TreeScreen() {
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const { people, byId } = useFamily();
  const router = useRouter();

  // İlk odak: parametre → varsa ilk kişi.
  const [focusId, setFocusId] = useState<string | undefined>(focus ?? people[0]?.id);
  const person = focusId ? byId.get(focusId) : undefined;

  const rel = useMemo(() => {
    if (!person) return { parents: [], spouses: [], siblings: [], children: [] };
    const parents = person.parentIds.map((id) => byId.get(id)).filter(Boolean) as Person[];
    const spouseIds = [...(person.spouseIds ?? []), ...(person.formerSpouseIds ?? [])];
    const spouses = spouseIds.map((id) => byId.get(id)).filter(Boolean) as Person[];
    const parentSet = new Set(person.parentIds);
    const siblings = people.filter(
      (p) => p.id !== person.id && p.parentIds.some((pid) => parentSet.has(pid))
    );
    const children = people
      .filter((p) => p.parentIds?.includes(person.id))
      .sort((a, b) => (a.birthDate ?? "").localeCompare(b.birthDate ?? ""));
    return { parents, spouses, siblings, children };
  }, [person, people, byId]);

  if (!person) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" }}>
        <Stack.Screen options={{ headerShown: true, title: "Ağaç" }} />
        <Text style={{ color: colors.textMuted }}>Gösterilecek kişi yok.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["left", "right", "bottom"]}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: "Ağaç",
          headerRight: () => (
            <Pressable onPress={() => router.push(`/(app)/person/${person.id}`)} hitSlop={10}>
              <Text style={{ color: colors.primary, fontWeight: "600", fontSize: 15 }}>Profil</Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Generation title="Ebeveynler" list={rel.parents} onTap={setFocusId} empty="Ebeveyn kaydı yok" />

        {/* Odak + eşler */}
        <Text style={sectionLabel}>Odak</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 6 }}>
          <TreeCard person={person} focused onTap={() => {}} />
          {rel.spouses.map((s) => (
            <TreeCard key={s.id} person={s} onTap={() => setFocusId(s.id)} badge="eş" />
          ))}
        </View>

        {rel.siblings.length > 0 && (
          <Generation title="Kardeşler" list={rel.siblings} onTap={setFocusId} />
        )}
        <Generation title="Çocuklar" list={rel.children} onTap={setFocusId} empty="Çocuk kaydı yok" />
      </ScrollView>
    </SafeAreaView>
  );
}

function Generation({
  title,
  list,
  onTap,
  empty,
}: {
  title: string;
  list: Person[];
  onTap: (id: string) => void;
  empty?: string;
}) {
  return (
    <View style={{ marginTop: 8 }}>
      <Text style={sectionLabel}>{title}</Text>
      {list.length === 0 ? (
        empty ? (
          <Text style={{ color: colors.textSubtle, fontSize: 13, marginBottom: 8 }}>{empty}</Text>
        ) : null
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 2 }}>
          {list.map((p) => (
            <TreeCard key={p.id} person={p} onTap={() => onTap(p.id)} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function TreeCard({
  person,
  onTap,
  focused,
  badge,
}: {
  person: Person;
  onTap: () => void;
  focused?: boolean;
  badge?: string;
}) {
  const rainbow = isRainbow(person);
  const span = lifeSpan(person.birthDate, person.deathDate);
  return (
    <Pressable
      onPress={onTap}
      style={({ pressed }) => ({
        width: 116,
        alignItems: "center",
        padding: 10,
        borderRadius: 14,
        borderWidth: focused ? 2 : 1,
        borderColor: focused ? colors.primary : rainbow ? "transparent" : colors.border,
        backgroundColor: rainbow ? "#fbe9ef" : colors.surface,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <PersonAvatar person={person} size={54} />
      <Text style={{ fontSize: 13, fontWeight: "600", color: colors.text, marginTop: 6, textAlign: "center" }} numberOfLines={2}>
        {fullName(person)}
      </Text>
      {span ? <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>{span}</Text> : null}
      {badge ? (
        <Text style={{ fontSize: 10, color: colors.accent, fontWeight: "700", marginTop: 2, textTransform: "uppercase" }}>
          {badge}
        </Text>
      ) : null}
    </Pressable>
  );
}

const sectionLabel = {
  fontSize: 12,
  fontWeight: "700" as const,
  color: colors.textSubtle,
  textTransform: "uppercase" as const,
  letterSpacing: 0.5,
  marginTop: 14,
  marginBottom: 8,
};
