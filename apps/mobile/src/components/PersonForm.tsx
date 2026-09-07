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
import {
  ApiError,
  createPerson,
  deletePerson,
  proposeDelete,
  proposeFields,
  proposeNewPerson,
  updatePerson,
  type RelationType,
} from "@/lib/api";
import { useOutbox } from "@/lib/outbox-store";
import { alanFarki, type OutboxKind } from "@/lib/outbox";
import { canEdit as rolCanEdit } from "@/lib/roles";
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
  const { token, role } = useAuth();
  const { refresh, baseVersion } = useFamily();
  const { yakala } = useOutbox();
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
  /** Sunucu 409 döndü: ağaç bu form açıkken başka bir yerde değişti. */
  const [conflict, setConflict] = useState(false);

  const deceased = !!death.trim();

  /*
   * KİM NE YAPABİLİR — karar `lib/roles.ts`ten geliyor, burada ROL DİZGESİ
   * KARŞILAŞTIRILMIYOR.
   *
   * Eskiden burada `user?.role === "yonetici"` yazıyordu ve telefonda hâlâ
   * eski adı (`"admin"`) saklı olan bir KURUCU kendi ağacında "yetkin yok"
   * görüyordu — oysa sunucu onu kabul ediyordu. Kural tek yere alındı.
   */
  const yazabilir = rolCanEdit(role);
  /** Üye doğrudan yazamaz; yazdığı öneri kuyruğuna gider (`canPropose`). */
  const oneriMi = !yazabilir;

  /** Formdaki alanları taze kayıttan yeniden doldurur (çakışma sonrası). */
  const applyFresh = (p: Person) => {
    setPhoto(p.photo);
    setFirstName(p.firstName ?? "");
    setLastName(p.lastName ?? "");
    setGender(p.gender !== "unknown" ? p.gender : undefined);
    setNickname(p.nickname ?? "");
    setPatronymic(p.patronymic ?? "");
    setBirth(storedToDisplay(p.birthDate));
    setDeath(storedToDisplay(p.deathDate));
    setBirthPlace(p.birthPlace ?? "");
    setBurialPlace(p.burialPlace ?? "");
    setOccupation(p.occupation ?? "");
    setBio(p.bio ?? "");
  };

  /**
   * Çakışmadan çıkış yolu: ağacı yenile, düzenlenen kaydın GÜNCEL hâlini
   * forma bas. Kullanıcının yazdıkları gider — bilerek: alternatif, güncel
   * veriyi görmeden üstüne yazmaktı ve bulgunun kendisi buydu.
   */
  const tazele = async () => {
    setSaving(true);
    const data = await refresh();
    if (data && initial) {
      const fresh = data.people.find((p) => p.id === initial.id);
      if (fresh) applyFresh(fresh);
    }
    setConflict(false);
    setError("");
    setSaving(false);
  };

  /**
   * ÇEVRİMDIŞI YAKALAMA (madde 44).
   *
   * İstek AĞ yüzünden düştüyse (`ApiError` durum `0` — yanıt hiç gelmedi)
   * kullanıcının yazdığı ÇÖPE ATILMIYOR, cihazdaki kuyruğa alınıyor ve
   * bağlantı gelince gönderiliyor (`src/lib/outbox.ts`).
   *
   * YALNIZ durum `0`: 403 "yetkin yok", 400 "geçersiz" ya da 409 "çakıştı"
   * gibi cevaplar sunucunun VERDİĞİ karardır ve onları kuyruğa almak,
   * reddedilmiş bir yazmayı sonsuza kadar yeniden denemek olurdu.
   *
   * Güncellemede kuyruğa TÜM GÖVDE değil YALNIZ DEĞİŞEN ALANLAR giriyor —
   * çakışma çözümünün şartı bu: dokunulmamış alanları "benim değerim"
   * saymak, saatler sonra gönderildiğinde başkasının düzeltmesini ezerdi.
   */
  const cevrimdisiYakala = (
    kind: OutboxKind,
    alanlar: Record<string, unknown>,
    taban: Record<string, unknown>
  ): boolean =>
    yakala({
      kind,
      personId: initial?.id,
      etiket: `${firstName} ${lastName}`.trim() || "Adsız kayıt",
      alanlar,
      taban,
      relation: relation ? { type: relation.type, targetId: relation.targetId } : undefined,
      oneri: oneriMi,
      yakalananSurum: baseVersion,
    });

  /** Kuyruğa alındı / alınamadı — ikisi de kullanıcıya AÇIKÇA söyleniyor. */
  const yakalandiBildir = (alindi: boolean, mesaj: string) => {
    setSaving(false);
    if (!alindi) {
      setError(
        "Bağlantı yok ve bekleyen yazma kuyruğu dolu. Bağlan ve kuyruğu boşalt, sonra tekrar dene."
      );
      return;
    }
    Alert.alert("Çevrimdışısın — cihazda saklandı", mesaj, [
      { text: "Tamam", onPress: () => router.back() },
    ]);
  };

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
    setConflict(false);
    setSaving(true);
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
    const bag = relation ? { type: relation.type, targetId: relation.targetId } : undefined;
    try {
      if (oneriMi) {
        /*
         * ÜYENİN YOLU. Kişi uçları `canEdit` istiyor ve üyeye 403 dönüyor;
         * öneri ucu `canPropose` istiyor ve üyeyi kabul ediyor. Sunucu
         * değişmeyen alanları kendi eliyor, o yüzden formun tamamını
         * göndermek güvenli (`lib/proposals.ts` → `sameValue`).
         */
        if (editing) await proposeFields(token, initial!.id, payload);
        else await proposeNewPerson(token, payload, bag);
        setSaving(false);
        Alert.alert(
          "Önerin gönderildi",
          "Yönetici onayladığında değişiklik ağaçta görünecek.",
          [{ text: "Tamam", onPress: () => router.back() }]
        );
        return;
      }

      /*
       * SÜRÜM DAMGASI (madde 9). Başlık gönderilmezse sunucu çakışma
       * denetimini HİÇ yapmıyor; damgasız kaydetmek, arada başka bir yerde
       * yapılmış düzeltmeyi uyarısız geri almak demekti.
       */
      if (editing) await updatePerson(token, initial!.id, payload, baseVersion);
      else await createPerson(token, payload, bag, baseVersion);
      await refresh();
      router.back();
    } catch (e) {
      if (e instanceof ApiError && e.status === 0) {
        if (editing) {
          const { alanlar, taban } = alanFarki(
            initial as unknown as Record<string, unknown>,
            payload
          );
          if (Object.keys(alanlar).length === 0) {
            /* Hiçbir şey değişmemiş: kuyruğa boş bir yazma koymak, bağlantı
               gelince hiçbir işe yaramayan bir istek göndermek olurdu. */
            setSaving(false);
            router.back();
            return;
          }
          yakalandiBildir(
            cevrimdisiYakala("guncelle", alanlar, taban),
            oneriMi
              ? "Önerin cihazda bekliyor; bağlantı gelince yöneticiye gönderilecek."
              : "Değişikliklerin cihazda bekliyor; bağlantı gelince ağaca yazılacak."
          );
          return;
        }
        yakalandiBildir(
          cevrimdisiYakala("ekle", payload, {}),
          oneriMi
            ? "Önerin cihazda bekliyor; bağlantı gelince yöneticiye gönderilecek."
            : "Yeni kişi cihazda bekliyor; bağlantı gelince ağaca eklenecek."
        );
        return;
      }
      if (e instanceof ApiError && e.status === 409) setConflict(true);
      setError(e instanceof Error ? e.message : "Kaydedilemedi.");
      setSaving(false);
    }
  };

  const remove = () => {
    if (!editing || !token) return;
    const baslik = oneriMi ? "Silinmesini öner" : "Kişiyi sil";
    const soru = oneriMi
      ? `${firstName} kaydının silinmesi yöneticiye önerilsin mi?`
      : `${firstName} kalıcı olarak silinsin mi?`;
    Alert.alert(baslik, soru, [
      { text: "Vazgeç", style: "cancel" },
      {
        text: oneriMi ? "Öner" : "Sil",
        style: oneriMi ? "default" : "destructive",
        onPress: async () => {
          setSaving(true);
          setConflict(false);
          try {
            if (oneriMi) {
              await proposeDelete(token, initial!.id);
              setSaving(false);
              Alert.alert(
                "Önerin gönderildi",
                "Yönetici onayladığında kayıt silinecek.",
                [{ text: "Tamam", onPress: () => router.back() }]
              );
              return;
            }
            await deletePerson(token, initial!.id, baseVersion);
            await refresh();
            router.replace("/(app)/home");
          } catch (e) {
            if (e instanceof ApiError && e.status === 0) {
              /*
               * Silme niyetinde TABAN kaydın TAMAMI. Gönderim anında kayıt
               * aradan değiştiyse (biri fotoğraf eklemiş, hikâyeyi yazmış)
               * silme sessizce uygulanmıyor, kullanıcıya soruluyor —
               * silme geri alınamaz.
               */
              yakalandiBildir(
                cevrimdisiYakala("sil", {}, {
                  ...(initial as unknown as Record<string, unknown>),
                }),
                oneriMi
                  ? "Silme önerin cihazda bekliyor; bağlantı gelince gönderilecek."
                  : "Silme isteğin cihazda bekliyor; bağlantı gelince uygulanacak."
              );
              return;
            }
            if (e instanceof ApiError && e.status === 409) setConflict(true);
            setError(e instanceof Error ? e.message : "Silinemedi.");
            setSaving(false);
          }
        },
      },
    ]);
  };

  const kaydetEtiketi = oneriMi ? "Öneri gönder" : editing ? "Kaydet" : "Kişiyi ekle";

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {/*
          ÜYEYE TEK VE NET BİR CÜMLE. Buradaki eski metin "Bu ağaçta düzenleme
          yetkin yok (izleyici)." idi: hem "izleyici" diye bir rol artık yok,
          hem de doğru değil — üye katkı YAPABİLİR, sadece yolu onaydan geçer.
        */}
        {oneriMi ? (
          <View
            style={{
              padding: 14,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface2,
              marginBottom: 14,
            }}
          >
            <Text style={{ color: colors.text, fontSize: 14, lineHeight: 20 }}>
              Bu ağaçta üyesin: doldurduğun bilgi doğrudan yazılmaz, yöneticinin
              onayına gider.
            </Text>
          </View>
        ) : null}

        {conflict ? (
          <View
            style={{
              padding: 14,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.danger,
              backgroundColor: "#fdecea",
              marginBottom: 14,
            }}
          >
            <Text style={{ color: colors.danger, fontSize: 14, lineHeight: 20 }}>
              Ağaç, sen bu formu açtıktan sonra başka bir yerde değişti.
              “Yenile” dersen ekrandaki bilgiyi güncelle değiştiririz (yazdıkların
              gider); tekrar kaydedersen senin değerlerin güncelin üstüne yazılır.
            </Text>
            <Pressable
              onPress={tazele}
              disabled={saving}
              style={{
                marginTop: 12,
                height: 42,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: colors.danger,
                alignItems: "center",
                justifyContent: "center",
                opacity: saving ? 0.6 : 1,
              }}
            >
              <Text style={{ color: colors.danger, fontWeight: "700" }}>Yenile</Text>
            </Pressable>
          </View>
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
          disabled={saving}
          style={{
            height: 52,
            borderRadius: 12,
            backgroundColor: colors.primary,
            alignItems: "center",
            justifyContent: "center",
            marginTop: 22,
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? (
            <ActivityIndicator color={colors.primaryText} />
          ) : (
            <Text style={{ color: colors.primaryText, fontWeight: "700", fontSize: 15 }}>
              {kaydetEtiketi}
            </Text>
          )}
        </Pressable>

        {editing ? (
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
            <Text style={{ color: colors.danger, fontWeight: "600" }}>
              {oneriMi ? "Silinmesini öner" : "Kişiyi sil"}
            </Text>
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
