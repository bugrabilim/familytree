import { useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { uploadPhoto } from "@/lib/api";
import { colors } from "@/lib/theme";

/**
 * Kişi fotoğrafı seçici — kameradan çek ya da galeriden seç, Cloudinary'ye
 * yükle, sonuç URL'ini `onChange` ile ver. `value` mevcut fotoğraf URL'i.
 */
export function PhotoPicker({
  value,
  token,
  onChange,
}: {
  value?: string;
  token: string;
  onChange: (url: string | undefined) => void;
}) {
  const [busy, setBusy] = useState(false);

  const handle = async (source: "camera" | "library") => {
    try {
      const perm =
        source === "camera"
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("İzin gerekli", "Fotoğraf eklemek için izin vermelisin.");
        return;
      }
      const result =
        source === "camera"
          ? await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.7 })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ["images"],
              allowsEditing: true,
              aspect: [1, 1],
              quality: 0.7,
            });
      if (result.canceled || !result.assets?.[0]?.uri) return;

      setBusy(true);
      const url = await uploadPhoto(token, result.assets[0].uri);
      onChange(url);
    } catch (e) {
      Alert.alert("Hata", e instanceof Error ? e.message : "Fotoğraf yüklenemedi.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ alignItems: "center", gap: 10 }}>
      <View
        style={{
          width: 110,
          height: 110,
          borderRadius: 55,
          backgroundColor: colors.surface2,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        {busy ? (
          <ActivityIndicator color={colors.primary} />
        ) : value ? (
          <Image source={{ uri: value }} style={{ width: 110, height: 110 }} />
        ) : (
          <Text style={{ fontSize: 34 }}>📷</Text>
        )}
      </View>
      <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
        <Chip label="Kamera" onPress={() => handle("camera")} disabled={busy} />
        <Chip label="Galeri" onPress={() => handle("library")} disabled={busy} />
        {value ? <Chip label="Kaldır" danger onPress={() => onChange(undefined)} disabled={busy} /> : null}
      </View>
    </View>
  );
}

function Chip({
  label,
  onPress,
  disabled,
  danger,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        paddingHorizontal: 16,
        paddingVertical: 9,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: danger ? colors.danger : colors.border,
        backgroundColor: colors.surface,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Text style={{ color: danger ? colors.danger : colors.text, fontWeight: "600", fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}
