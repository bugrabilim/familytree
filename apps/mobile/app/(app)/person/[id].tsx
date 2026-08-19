import { useMemo } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useFamily } from "@/lib/family";
import { colors } from "@/lib/theme";
import { calcAge, formatLong, fullName, isRainbow, lifeSpan } from "@/lib/format";
import type { Person } from "@/lib/types";
import { PersonAvatar } from "@/components/PersonAvatar";

export default function PersonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { byId, people, loading } = useFamily();
  const router = useRouter();
  const person = id ? byId.get(id) : undefined;

  const rel = useMemo(() => {
    if (!person) return { parents: [], spouses: [], children: [] };
    const parents = person.parentIds.map((pid) => byId.get(pid)).filter(Boolean) as Person[];
    const spouseIds = [...(person.spouseIds ?? []), ...(person.formerSpouseIds ?? [])];
    const spouses = spouseIds.map((sid) => byId.get(sid)).filter(Boolean) as Person[];
    const children = people
      .filter((p) => p.parentIds?.includes(person.id))
      .sort((a, b) => (a.birthDate ?? "").localeCompare(b.birthDate ?? ""));
    return { parents, spouses, children };
  }, [person, byId, people]);

  if (loading && !person) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <Stack.Screen options={{ title: "" }} />
      </SafeAreaView>
    );
  }

  if (!person) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" }}>
        <Stack.Screen options={{ title: "Kişi" }} />
        <Text style={{ color: colors.textMuted }}>Kişi bulunamadı.</Text>
      </SafeAreaView>
    );
  }

  const rainbow = isRainbow(person);
  const span = lifeSpan(person.birthDate, person.deathDate);
  const age = calcAge(person.birthDate, person.deathDate);
  const deceased = !!person.deathDate;

  const addRelation = (type: "parent" | "spouse" | "child" | "sibling") =>
    router.push(
      `/(app)/person/new?type=${type}&targetId=${person.id}&targetName=${encodeURIComponent(fullName(person))}`
    );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["left", "right", "bottom"]}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: fullName(person),
          headerBackTitle: "Geri",
          headerRight: () => (
            <Pressable onPress={() => router.push(`/(app)/person/edit/${person.id}`)} hitSlop={10}>
              <Text style={{ color: colors.primary, fontWeight: "600", fontSize: 15 }}>Düzenle</Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        {/* Başlık kartı */}
        <View
          style={{
            alignItems: "center",
            padding: 22,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: rainbow ? "transparent" : colors.border,
            backgroundColor: rainbow ? "#fbe9ef" : colors.surface,
          }}
        >
          <PersonAvatar person={person} size={96} />
          <Text style={{ fontSize: 22, fontWeight: "700", color: colors.text, marginTop: 14, textAlign: "center" }}>
            {fullName(person)}
          </Text>
          {span ? <Text style={{ fontSize: 15, color: colors.textMuted, marginTop: 4 }}>{span}</Text> : null}
          {age !== null ? (
            <Text style={{ fontSize: 13, color: colors.textSubtle, marginTop: 2 }}>
              {deceased ? `${age} yaşında vefat etti` : `${age} yaşında`}
            </Text>
          ) : null}
          <Pressable
            onPress={() => router.push(`/(app)/tree?focus=${person.id}`)}
            style={({ pressed }) => ({
              marginTop: 14,
              paddingHorizontal: 18,
              paddingVertical: 9,
              borderRadius: 20,
              backgroundColor: pressed ? colors.surface2 : colors.surface,
              borderWidth: 1,
              borderColor: colors.primary,
            })}
          >
            <Text style={{ color: colors.primary, fontWeight: "600" }}>🌳 Ağaçta gör</Text>
          </Pressable>
        </View>

        {/* Bilgiler */}
        <Section title="Bilgiler">
          <Fact label="Doğum" value={formatLong(person.birthDate)} />
          <Fact label="Doğum yeri" value={person.birthPlace} />
          {deceased && <Fact label="Vefat" value={formatLong(person.deathDate)} />}
          {deceased && <Fact label="Defin yeri" value={person.burialPlace} />}
          <Fact label="Meslek" value={person.occupation} />
          <Fact label="Din" value={person.religion} />
          <Fact label="Etnik köken" value={person.ethnicity} />
          <Fact label="Uyruk" value={person.nationality} />
          <Fact label="Kimlik no" value={person.code} />
        </Section>

        {person.bio ? (
          <Section title="Hakkında">
            <Text style={{ color: colors.text, fontSize: 15, lineHeight: 22 }}>{person.bio}</Text>
          </Section>
        ) : null}

        <RelGroup title="Ebeveynler" list={rel.parents} onTap={(pid) => router.push(`/(app)/person/${pid}`)} />
        <RelGroup title="Eş(ler)" list={rel.spouses} onTap={(pid) => router.push(`/(app)/person/${pid}`)} />
        <RelGroup title="Çocuklar" list={rel.children} onTap={(pid) => router.push(`/(app)/person/${pid}`)} />

        {/* İlişki ekle */}
        <View style={{ marginTop: 24 }}>
          <Text style={{ fontSize: 13, fontWeight: "700", color: colors.textSubtle, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>
            Bağlı kişi ekle
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            <AddChip label="+ Ebeveyn" onPress={() => addRelation("parent")} />
            <AddChip label="+ Eş" onPress={() => addRelation("spouse")} />
            <AddChip label="+ Çocuk" onPress={() => addRelation("child")} />
            <AddChip label="+ Kardeş" onPress={() => addRelation("sibling")} />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: 20 }}>
      <Text style={{ fontSize: 13, fontWeight: "700", color: colors.textSubtle, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
        {title}
      </Text>
      <View style={{ padding: 16, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, gap: 2 }}>
        {children}
      </View>
    </View>
  );
}

function Fact({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 5, gap: 16 }}>
      <Text style={{ color: colors.textMuted, fontSize: 14 }}>{label}</Text>
      <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600", flexShrink: 1, textAlign: "right" }}>{value}</Text>
    </View>
  );
}

function AddChip({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        paddingHorizontal: 16,
        paddingVertical: 11,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: colors.primary,
        backgroundColor: pressed ? colors.surface2 : colors.surface,
      })}
    >
      <Text style={{ color: colors.primary, fontWeight: "600", fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

function RelGroup({
  title,
  list,
  onTap,
}: {
  title: string;
  list: Person[];
  onTap: (id: string) => void;
}) {
  if (list.length === 0) return null;
  return (
    <View style={{ marginTop: 20 }}>
      <Text style={{ fontSize: 13, fontWeight: "700", color: colors.textSubtle, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
        {title}
      </Text>
      <View style={{ gap: 8 }}>
        {list.map((p) => (
          <Pressable
            key={p.id}
            onPress={() => onTap(p.id)}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              padding: 10,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <PersonAvatar person={p} size={40} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: "600", color: colors.text }} numberOfLines={1}>
                {fullName(p)}
              </Text>
              {lifeSpan(p.birthDate, p.deathDate) ? (
                <Text style={{ fontSize: 12, color: colors.textMuted }}>{lifeSpan(p.birthDate, p.deathDate)}</Text>
              ) : null}
            </View>
            <Text style={{ color: colors.textSubtle, fontSize: 18 }}>›</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
