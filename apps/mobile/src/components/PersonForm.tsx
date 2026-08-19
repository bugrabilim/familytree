import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/lib/auth";
import { useFamily } from "@/lib/family";
import { createPerson, deletePerson, updatePerson, type RelationType } from "@/lib/api";
import { displayToStored, storedToDisplay } from "@/lib/format";
import { colors } from "@/lib/theme";
import type { Gender, Person } from "@/lib/types";
import { PhotoPicker } from "./PhotoPicker";

const GENDERS: { value: Gender; label: string }[] = [
  { value: "male", label: "Erkek" },
  { value: "female", label: "Kadın" },
  { value: "other", label: "Diğer" },
];

export function PersonForm({
  initial,
  relation,
}: {
  initial?: Person;
  relation?: { type: RelationType; targetId: string; targetName: string };
}) {
  const { token, user } = useAuth();
  const { refresh } = useFamily();
  const router = useRouter();
  const editing = !!initial;

  const [photo, setPhoto] = useState<string | undefined>(initial?.photo);
  const [firstName, setFirstName] = useState(initial?.firstName ?? "");
  const [lastName, setLastName] = useState(initial?.lastName ?? "");
  const [gender, setGender] = useState<Gender | undefined>(
    initial && initial.gender !== "unknown" ? initial.gender : undefined
  );
  const [nickname, setNickname] = useState(initial?.nickname ?? "");
  const [patronymic, setPatronymic] = useState(initial?.patronymic ?? "");
  const [birth, setBirth] = useState(storedToDisplay(initial?.birthDate));
  const [death, setDeath] = useState(storedToDisplay(initial?.deathDate));
  const [birthPlace, setBirthPlace] = useState(initial?.birthPlace ?? "");
  const [burialPlace, setBurialPlace] = useState(initial?.burialPlace ?? "");
  const [occupation, setOccupation] = useState(initial?.occupation ?? "");
  const [bio, setBio] = useState(initial?.bio ?? "");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const deceased = !!death.trim();

  const save = async () => {
    if (!token) return;
    if (!firstName.trim()) {
      setError("Ad zorunludur.");
      return;
    }
    if (!gender) {
      setError("Cinsiyet seçiniz.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        gender,
        nickname: nickname.trim(),
        patronymic: patronymic.trim(),
        birthDate: displayToStored(birth),
        deathDate: displayToStored(death),
        birthPlace: birthPlace.trim(),
        burialPlace: deceased ? burialPlace.trim() : "",
        occupation: occupation.trim(),
        bio: bio.trim(),
        photo: photo ?? "",
      };
      if (editing) {
        await updatePerson(token, initial!.id, payload);
      } else {
        await createPerson(
          token,
          payload,
          relation ? { type: relation.type, targetId: relation.targetId } : undefined
        );
      }
      await refresh();
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kaydedilemedi.");
      setSaving(false);
    }
  };

  const remove = () => {
    if (!editing || !token) return;
    Alert.alert("Kişiyi sil", `${firstName} kalıcı olarak silinsin mi?`, [
      { text: "Vazgeç", style: "cancel" },
      {
        text: "Sil",
        style: "destructive",
        onPress: async () => {
          setSaving(true);
          try {
            await deletePerson(token, initial!.id);
            await refresh();
            router.replace("/(app)/home");
          } catch (e) {
            setError(e instanceof Error ? e.message : "Silinemedi.");
            setSaving(false);
          }
        },
      },
    ]);
  };

  const canEdit = user?.role !== "viewer";

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {!canEdit ? (
          <Text style={{ color: colors.danger, marginBottom: 12 }}>
            Bu ağaçta düzenleme yetkin yok (izleyici).
          </Text>
        ) : null}

        {relation ? (
          <Text style={{ color: colors.textMuted, marginBottom: 14 }}>
            <Text style={{ fontWeight: "700", color: colors.text }}>{relation.targetName}</Text>
            {" kişisine "}
            {relation.type === "parent"
              ? "ebeveyn"
              : relation.type === "child"
                ? "çocuk"
                : relation.type === "spouse"
                  ? "eş"
                  : "kardeş"}
            {" olarak ekleniyor."}
          </Text>
        ) : null}

        {token ? (
          <PhotoPicker value={photo} token={token} onChange={setPhoto} />
        ) : null}

        <Field label="Ad *" value={firstName} onChangeText={setFirstName} />
        <Field label="Soyad" value={lastName} onChangeText={setLastName} />

        <Text style={label}>Cinsiyet *</Text>
        <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
          {GENDERS.map((g) => {
            const active = gender === g.value;
            return (
              <Pressable
                key={g.value}
                onPress={() => setGender(g.value)}
                style={{
                  flex: 1,
                  height: 46,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: active ? colors.primary : colors.border,
                  backgroundColor: active ? colors.primary : colors.surface,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: active ? colors.primaryText : colors.text, fontWeight: "600" }}>
                  {g.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Field label="Lakap" value={nickname} onChangeText={setNickname} placeholder="ör. Topal, Avcı" />
        <Field
          label="Baba adı (soyadsız kuşaklar)"
          value={patronymic}
          onChangeText={setPatronymic}
          placeholder="ör. Şaban oğlu"
        />
        <Field label="Doğum tarihi" value={birth} onChangeText={setBirth} placeholder="YYYY veya GG.AA.YYYY" />
        <Field label="Doğum yeri" value={birthPlace} onChangeText={setBirthPlace} />
        <Field label="Vefat tarihi" value={death} onChangeText={setDeath} placeholder="YYYY veya GG.AA.YYYY" />
        {deceased ? (
          <Field label="Defin yeri" value={burialPlace} onChangeText={setBurialPlace} />
        ) : null}
        <Field label="Meslek" value={occupation} onChangeText={setOccupation} />
        <Field label="Hakkında" value={bio} onChangeText={setBio} multiline />

        {error ? <Text style={{ color: colors.danger, marginTop: 14 }}>{error}</Text> : null}

        <Pressable
          onPress={save}
          disabled={saving || !canEdit}
          style={{
            height: 52,
            borderRadius: 12,
            backgroundColor: colors.primary,
            alignItems: "center",
            justifyContent: "center",
            marginTop: 22,
            opacity: saving || !canEdit ? 0.6 : 1,
          }}
        >
          {saving ? (
            <ActivityIndicator color={colors.primaryText} />
          ) : (
            <Text style={{ color: colors.primaryText, fontWeight: "700", fontSize: 15 }}>
              {editing ? "Kaydet" : "Kişiyi ekle"}
            </Text>
          )}
        </Pressable>

        {editing && canEdit ? (
          <Pressable
            onPress={remove}
            disabled={saving}
            style={{
              height: 50,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.danger,
              alignItems: "center",
              justifyContent: "center",
              marginTop: 12,
            }}
          >
            <Text style={{ color: colors.danger, fontWeight: "600" }}>Kişiyi sil</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const label = {
  fontSize: 12,
  fontWeight: "600" as const,
  color: colors.textMuted,
  marginTop: 16,
  marginBottom: 6,
};

function Field({
  label: lbl,
  value,
  onChangeText,
  placeholder,
  multiline,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  return (
    <View>
      <Text style={label}>{lbl}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textSubtle}
        multiline={multiline}
        style={{
          minHeight: multiline ? 96 : 48,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          paddingHorizontal: 14,
          paddingTop: multiline ? 12 : 0,
          paddingVertical: multiline ? 12 : 0,
          fontSize: 15,
          color: colors.text,
          textAlignVertical: multiline ? "top" : "center",
        }}
      />
    </View>
  );
}
