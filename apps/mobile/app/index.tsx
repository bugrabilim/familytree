import { ActivityIndicator, View } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "@/lib/auth";
import { colors } from "@/lib/theme";

/** Açılış yönlendirmesi: jeton varsa uygulamaya, yoksa girişe. */
export default function Index() {
  const { loading, token } = useAuth();
  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary }}>
        <ActivityIndicator color={colors.primaryText} size="large" />
      </View>
    );
  }
  return <Redirect href={token ? "/(app)/home" : "/(auth)/login"} />;
}
