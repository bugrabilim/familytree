import { useMemo, useRef, useState } from "react";
import { FlatList, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import { useFamily } from "@/lib/family";
import { colors } from "@/lib/theme";
import { calcAge, formatLong, fullName, lifeSpan } from "@/lib/format";
import type { Person } from "@/lib/types";
import { PersonAvatar } from "@/components/PersonAvatar";

type Page = { kind: "cover" } | { kind: "person"; person: Person } | { kind: "back" };

/** Aile kitabı — yatay kaydırmalı sayfalar (roman gibi), kişi başına bir sayfa. */
export default function BookScreen() {
  const { people, byId } = useFamily();
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);
  const [areaH, setAreaH] = useState(0);
  const listRef = useRef<FlatList>(null);

  const pages = useMemo<Page[]>(() => {
    const sorted = [...people].sort((a, b) => {
      const ay = a.birthDate ?? "9999";
      const by = b.birthDate ?? "9999";
      return ay.localeCompare(by) || fullName(a).localeCompare(fullName(b), "tr");
    });
    return [{ kind: "cover" }, ...sorted.map((person) => ({ kind: "person" as const, person })), { kind: "back" }];
  }, [people]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#f3ead8" }} edges={["left", "right", "bottom"]}>
      <Stack.Screen options={{ headerShown: true, title: "Aile Kitabı" }} />
      <View style={{ flex: 1 }} onLayout={(e) => setAreaH(e.nativeEvent.layout.height)}>
      <FlatList
        ref={listRef}
        data={pages}
        keyExtractor={(_, i) => String(i)}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item }) => (
          <View style={{ width, height: areaH || undefined }}>
            {item.kind === "cover" ? (
              <BookPage>
                <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
                  <Text style={{ fontSize: 40 }}>🌳</Text>
                  <Text style={{ fontSize: 28, fontWeight: "800", color: "#3a2c18", textAlign: "center" }}>
                    Aile Kitabı
                  </Text>
                  <Text style={{ fontSize: 15, color: "#7a6a4f" }}>{people.length} kişi</Text>
                </View>
              </BookPage>
            ) : item.kind === "back" ? (
              <BookPage>
                <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontSize: 15, color: "#7a6a4f", textAlign: "center" }}>
                    Son. Bu ağaç sevgiyle büyütüldü.
                  </Text>
                </View>
              </BookPage>
            ) : (
              <PersonPage person={item.person} byId={byId} />
            )}
          </View>
        )}
      />
      </View>
      <View style={{ position: "absolute", bottom: 10, left: 0, right: 0, alignItems: "center" }}>
        <Text style={{ color: "#7a6a4f", fontSize: 12 }}>
          {page + 1} / {pages.length}
        </Text>
      </View>
    </SafeAreaView>
  );
}

function BookPage({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ flex: 1, margin: 16, borderRadius: 16, backgroundColor: "#fbf6ec", borderWidth: 1, borderColor: "#e6d8bd", padding: 24 }}>
      {children}
    </View>
  );
}

function PersonPage({ person, byId }: { person: Person; byId: Map<string, Person> }) {
  const span = lifeSpan(person.birthDate, person.deathDate);
  const age = calcAge(person.birthDate, person.deathDate);
  const parents = person.parentIds.map((id) => byId.get(id)?.firstName).filter(Boolean).join(" & ");

  return (
    <BookPage>
      <View style={{ alignItems: "center" }}>
        <PersonAvatar person={person} size={100} />
        <Text style={{ fontSize: 22, fontWeight: "800", color: "#3a2c18", marginTop: 12, textAlign: "center" }}>
          {fullName(person)}
        </Text>
        {span ? <Text style={{ fontSize: 15, color: "#7a6a4f", marginTop: 4 }}>{span}</Text> : null}
      </View>

      <View style={{ marginTop: 20, gap: 8 }}>
        {person.birthDate ? <Line label="Doğum" value={formatLong(person.birthDate)} /> : null}
        {person.birthPlace ? <Line label="Doğum yeri" value={person.birthPlace} /> : null}
        {person.deathDate ? <Line label="Vefat" value={formatLong(person.deathDate)} /> : null}
        {person.occupation ? <Line label="Meslek" value={person.occupation} /> : null}
        {parents ? <Line label="Ebeveynleri" value={parents} /> : null}
        {age !== null ? <Line label="Yaş" value={`${age}`} /> : null}
      </View>

      {person.bio ? (
        <Text style={{ marginTop: 18, fontSize: 15, lineHeight: 23, color: "#4a3d2a", fontStyle: "italic" }}>
          “{person.bio}”
        </Text>
      ) : null}
    </BookPage>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      <Text style={{ fontSize: 14, color: "#9a8968", width: 92 }}>{label}</Text>
      <Text style={{ fontSize: 14, color: "#3a2c18", fontWeight: "600", flex: 1 }}>{value}</Text>
    </View>
  );
}
