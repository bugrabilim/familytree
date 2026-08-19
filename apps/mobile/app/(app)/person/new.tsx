import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams } from "expo-router";
import { PersonForm } from "@/components/PersonForm";
import { colors } from "@/lib/theme";
import type { RelationType } from "@/lib/api";

/**
 * Yeni kişi ekleme. İsteğe bağlı ilişki parametreleriyle açılırsa
 * (type + targetId + targetName) kişiyi doğrudan bağlar.
 */
export default function NewPerson() {
  const params = useLocalSearchParams<{ type?: string; targetId?: string; targetName?: string }>();
  const relation =
    params.type && params.targetId
      ? {
          type: params.type as RelationType,
          targetId: params.targetId,
          targetName: params.targetName ?? "",
        }
      : undefined;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["left", "right", "bottom"]}>
      <Stack.Screen options={{ headerShown: true, title: "Yeni kişi" }} />
      <PersonForm relation={relation} />
    </SafeAreaView>
  );
}
