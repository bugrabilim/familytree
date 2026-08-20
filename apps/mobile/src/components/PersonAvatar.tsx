import { Image, Text, View } from "react-native";
import type { Person } from "@/lib/types";
import { avatarColor, initials } from "@/lib/format";

/** Kişi avatarı: fotoğraf varsa onu, yoksa baş harfli renkli daire. */
export function PersonAvatar({
  person,
  size = 52,
}: {
  person: Pick<Person, "id" | "firstName" | "lastName" | "photo">;
  size?: number;
}) {
  const radius = size / 2;
  if (person.photo) {
    return (
      <Image
        source={{ uri: person.photo }}
        style={{ width: size, height: size, borderRadius: radius, backgroundColor: "#e3e0d8" }}
      />
    );
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: avatarColor(person.id),
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: "#fff", fontWeight: "700", fontSize: size * 0.38 }}>
        {initials(person)}
      </Text>
    </View>
  );
}
