import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams } from "expo-router";
import { PersonForm } from "@/components/PersonForm";
import { useFamily } from "@/lib/family";
import { colors } from "@/lib/theme";
import { Text } from "react-native";

export default function EditPerson() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { byId } = useFamily();
  const person = id ? byId.get(id) : undefined;

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
