import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams } from "expo-router";
import { PersonForm } from "@/components/PersonForm";
import { useFamily } from "@/lib/family";
import { colors } from "@/lib/theme";
import { Text } from "react-native";

export default function EditPerson() {
  const { id } = useLocalSearchParams<{ id: string }>();
  /*
   * HAM kayıt — `byId` DEĞİL.
   *
   * `byId` gizlilik katmanından geçmiş kopyaları taşıyor. Form bütün alanları
   * gövdeye koyduğu için maskeli bir kopyayla kaydetmek, gizlenen alanları
   * KALICI olarak silerdi: kullanıcı bir alanı "gizli" işaretlediği için
   * kaybederdi. Web'de aynı ayrım `PersonDrawer` (maskeli) ile `PersonForm`
   * (ham) arasında.
   */
  const { rawById } = useFamily();
  const person = id ? rawById.get(id) : undefined;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["left", "right", "bottom"]}>
      <Stack.Screen options={{ headerShown: true, title: "Düzenle" }} />
      {person ? (
        <PersonForm initial={person} />
      ) : (
        <Text style={{ color: colors.textMuted, padding: 24 }}>Kişi bulunamadı.</Text>
      )}
    </SafeAreaView>
  );
}
