import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import { useOutbox } from "@/lib/outbox-store";
import { storedToDisplay } from "@/lib/format";
import { colors } from "@/lib/theme";
import { styles } from "@/lib/styles";
import type { CakisanAlan, OutboxItem } from "@/lib/outbox";

/**
 * BEKLEYEN YAZMALAR — çevrimdışı kuyruğun kullanıcıya açılan yüzü (madde 44).
 *
 * İki işi var ve ikincisi asıl olan:
 *  1. "Yazdığım kayboldu mu?" sorusunu cevaplamak — kuyruk görünür olmalı,
 *     yoksa kullanıcı uygulamanın bir şey sakladığını hiç bilmez;
 *  2. ÇAKIŞMAYI KARARA BAĞLAMAK. Kuyruktaki bir yazma gönderilirken aradan
 *     başkası aynı alanı değiştirmişse sessizce üstüne yazmıyoruz; iki
 *     değeri yan yana gösterip kullanıcıya soruyoruz.
 */
export default function Outbox() {
  const { kuyruk, bekleyen, cakisan, hatali, gonderiliyor, simdiGonder, coz, at } = useOutbox();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["left", "right", "bottom"]}>
      <Stack.Screen options={{ headerShown: true, title: "Bekleyen yazmalar" }} />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        {kuyruk.length === 0 ? (
          <View
            style={{
              padding: 18,
              borderRadius: 16,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text style={{ color: colors.text, fontSize: 15, fontWeight: "600" }}>
              Bekleyen bir şey yok.
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 6, lineHeight: 19 }}>
              İnternet yokken kaydettiklerin burada birikir ve bağlantı gelince
              kendiliğinden gönderilir. Mezarlıkta, köyde, uçakta yazdıkların
              kaybolmaz.
            </Text>
          </View>
        ) : (
          <>
            <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 19 }}>
              {ozet(bekleyen, cakisan, hatali)}
            </Text>
            <Pressable
              style={[styles.buttonSecondary, { borderColor: colors.primary }]}
              onPress={simdiGonder}
              disabled={gonderiliyor}
            >
              {gonderiliyor ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Text style={[styles.buttonSecondaryText, { color: colors.primary }]}>
                  Şimdi gönder
                </Text>
              )}
            </Pressable>

            {kuyruk.map((it) => (
              <Kart key={it.id} item={it} coz={coz} at={at} />
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ozet(bekleyen: number, cakisan: number, hatali: number): string {
  const p: string[] = [];
  if (bekleyen) p.push(`${bekleyen} yazma sırada`);
  if (cakisan) p.push(`${cakisan} tanesi kararını bekliyor`);
  if (hatali) p.push(`${hatali} tanesi gönderilemedi`);
  return p.join(" · ");
}

/* ── Tek öğe ──────────────────────────────────────────────────────────────── */

function Kart({
  item,
  coz,
  at,
}: {
  item: OutboxItem;
  coz: (id: string, cozum: "benim" | "sunucu") => void;
  at: (id: string) => void;
}) {
  const cakisti = item.durum === "cakisti";
  const hata = item.durum === "hata";
  const kenar = cakisti || hata ? colors.danger : colors.border;

  return (
    <View
      style={{
        marginTop: 14,
        padding: 16,
        borderRadius: 16,
        backgroundColor: cakisti || hata ? "#fdecea" : colors.surface,
        borderWidth: 1,
        borderColor: kenar,
      }}
    >
      <Text style={{ color: colors.text, fontSize: 15, fontWeight: "700" }}>{item.etiket}</Text>
      <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
        {islemAdi(item)} · {tarih(item.olusturuldu)}
      </Text>

      {item.durum === "bekliyor" && (
        <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 8, lineHeight: 19 }}>
          {item.deneme > 0
            ? `Bağlantı kurulamadı (${item.deneme}. deneme). Bağlantı gelince kendiliğinden gönderilecek.`
            : "Sırada. Bağlantı gelince gönderilecek."}
        </Text>
      )}

      {hata && (
        <>
          <Text style={{ color: colors.danger, fontSize: 13, marginTop: 8, lineHeight: 19 }}>
            {item.hata || "Gönderilemedi."}
          </Text>
          <Pressable
            style={[styles.buttonSecondary, { borderColor: colors.danger, marginTop: 12 }]}
            onPress={() =>
              Alert.alert("Bu yazmayı at", `${item.etiket} için bekleyen yazma silinsin mi?`, [
                { text: "Vazgeç", style: "cancel" },
                { text: "At", style: "destructive", onPress: () => at(item.id) },
              ])
            }
          >
            <Text style={[styles.buttonSecondaryText, { color: colors.danger }]}>Bu yazmayı at</Text>
          </Pressable>
        </>
      )}

      {cakisti && <Cakisma item={item} coz={coz} />}
    </View>
  );
}

/**
 * Çakışma kutusu.
 *
 * Alan alan SEÇTİRMİYORUZ. Telefon ekranında alan alan birleştirme arayüzü,
 * kullanıcının okumadan onaylayacağı bir şeye dönüşür; kayıt bazında karar
 * hem anlaşılır hem de "öbür sürüm neydi" ekranda yazılı kalıyor.
 */
function Cakisma({
  item,
  coz,
}: {
  item: OutboxItem;
  coz: (id: string, cozum: "benim" | "sunucu") => void;
}) {
  return (
    <View style={{ marginTop: 10 }}>
      <Text style={{ color: colors.danger, fontSize: 13, lineHeight: 19, fontWeight: "600" }}>
        {aciklama(item)}
      </Text>

      {(item.cakisan ?? []).map((c) => (
        <AlanSatiri key={c.alan} c={c} sil={item.kind === "sil"} />
      ))}

      <Pressable
        style={[styles.buttonSecondary, { borderColor: colors.danger, marginTop: 12 }]}
        onPress={() =>
          Alert.alert(
            "Benimkini uygula",
            "Senin değerlerin sunucudakinin üstüne yazılacak. Aradan yapılan düzeltme kaybolur.",
            [
              { text: "Vazgeç", style: "cancel" },
              { text: "Uygula", style: "destructive", onPress: () => coz(item.id, "benim") },
            ]
          )
        }
      >
        <Text style={[styles.buttonSecondaryText, { color: colors.danger }]}>Benimkini uygula</Text>
      </Pressable>
      <Pressable
        style={[styles.buttonSecondary, { marginTop: 8 }]}
        onPress={() =>
          Alert.alert(
            "Sunucudakini tut",
            "Bu yazma kuyruktan silinecek; senin yazdıkların uygulanmayacak.",
            [
              { text: "Vazgeç", style: "cancel" },
              { text: "Sunucudakini tut", onPress: () => coz(item.id, "sunucu") },
            ]
          )
        }
      >
        <Text style={styles.buttonSecondaryText}>Sunucudakini tut</Text>
      </Pressable>
    </View>
  );
}

function AlanSatiri({ c, sil }: { c: CakisanAlan; sil: boolean }) {
  return (
    <View
      style={{
        marginTop: 10,
        padding: 10,
        borderRadius: 10,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "600" }}>
        {alanAdi(c.alan)}
      </Text>
      {!sil && (
        <Text style={{ color: colors.text, fontSize: 13, marginTop: 4 }}>
          Senin: {deger(c.alan, c.benim)}
        </Text>
      )}
      <Text style={{ color: colors.text, fontSize: 13, marginTop: 2 }}>
        Sunucudaki: {deger(c.alan, c.sunucu)}
      </Text>
      <Text style={{ color: colors.textSubtle, fontSize: 12, marginTop: 2 }}>
        Sen yazarken: {deger(c.alan, c.taban)}
      </Text>
    </View>
  );
}

/* ── Metinler ─────────────────────────────────────────────────────────────── */

function islemAdi(it: OutboxItem): string {
  const yol = it.oneri ? " önerisi" : "";
  if (it.kind === "ekle") return `Yeni kişi${yol}`;
  if (it.kind === "sil") return `Silme${yol}`;
  return `Düzenleme${yol}`;
}

function aciklama(it: OutboxItem): string {
  switch (it.cakismaSebep) {
    case "kayit-silinmis":
      return "Bu kayıt sen çevrimdışıyken silinmiş. Yazdıkların uygulanamadı.";
    case "kayit-degismis":
      return "Silmek istediğin kayıt sen çevrimdışıyken değişmiş — biri bilgi eklemiş olabilir.";
    case "surekli-cakisma":
      return "Ağaç her denemede başka bir yerde değişiyor; yazma gönderilemedi.";
    default:
      return "Sen çevrimdışıyken aşağıdaki alanları başkası da değiştirmiş.";
  }
}

/** Alan anahtarı → Türkçe ad. Bilinmeyen anahtar olduğu gibi gösteriliyor. */
const ALAN_ADI: Record<string, string> = {
  firstName: "Ad",
  lastName: "Soyad",
  gender: "Cinsiyet",
  nickname: "Lakap",
  patronymic: "Baba adı",
  birthDate: "Doğum tarihi",
  deathDate: "Vefat tarihi",
  birthPlace: "Doğum yeri",
  burialPlace: "Defin yeri",
  occupation: "Meslek",
  education: "Öğrenim",
  bio: "Hakkında",
  photo: "Fotoğraf",
  religion: "İnanç",
  ethnicity: "Köken",
  nationality: "Uyruk",
  language: "Dil",
  orientation: "Yönelim",
  parentIds: "Ebeveyn bağları",
  spouseIds: "Eş bağları",
  formerSpouseIds: "Eski eş bağları",
  confidential: "Gizli kayıt",
  privateFields: "Gizlenen alanlar",
};

function alanAdi(alan: string): string {
  return ALAN_ADI[alan] ?? alan;
}

const CINSIYET: Record<string, string> = {
  male: "Erkek",
  female: "Kadın",
  other: "Diğer",
  unknown: "Bilinmiyor",
};

/** Değeri okunur hâle getirir; boş değer "—" olarak gösteriliyor. */
function deger(alan: string, v: unknown): string {
  if (v === undefined || v === null || v === "") return "—";
  if (alan === "gender") return CINSIYET[String(v)] ?? String(v);
  if (alan === "birthDate" || alan === "deathDate") return storedToDisplay(String(v));
  if (alan === "photo") return "fotoğraf";
  if (Array.isArray(v)) return v.length ? `${v.length} bağ` : "—";
  if (typeof v === "boolean") return v ? "evet" : "hayır";
  const s = String(v);
  return s.length > 120 ? `${s.slice(0, 120)}…` : s;
}

function tarih(ms: number): string {
  const d = new Date(ms);
  return `${d.toLocaleDateString("tr-TR")} ${d.toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}
