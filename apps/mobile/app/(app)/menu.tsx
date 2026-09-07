import { useState } from "react";
import { Pressable, ScrollView, Share, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { useAuth } from "@/lib/auth";
import { useFamily } from "@/lib/family";
import { apiFetch } from "@/lib/api";
import { canEdit, roleLabel } from "@/lib/roles";
import { colors } from "@/lib/theme";
import { styles } from "@/lib/styles";
import { BrandMark } from "@/lib/BrandMark";

/** Hesap / ağaç bilgisi ve oturum işlemleri. */
export default function Menu() {
  const { user, role, token, signOut } = useAuth();
  const { people, hideLiving, setHideLiving, trees, activeTreeId, switchTree } = useFamily();
  const router = useRouter();
  const [paylasimHata, setPaylasimHata] = useState("");
  const [paylasiliyor, setPaylasiliyor] = useState(false);

  /**
   * GERÇEK PAYLAŞIM BAĞLANTISI ÜRETİYOR.
   *
   * Bu düğme "Ağacı paylaş" diyordu ama paylaştığı şey uygulamanın kök
   * adresiydi (`API_BASE_URL`): bağlantıyı alan kişi bir giriş ekranı
   * görüyordu, ağacı değil. Yani düğme adının söylediği şeyi yapmıyordu.
   *
   * Artık web'deki akışın aynısını çağırıyor (`POST /api/tree/share`) ve
   * dönen `/g/<token>` adresini paylaşıyor.
   *
   * Varsayılanlar bilinçli ve KISITLAYICI yönde:
   *  · `hideLiving` kullanıcının kendi tercihini izliyor — telefonda
   *    yaşayanları gizleyerek gezen biri, paylaşırken de gizlemeyi bekler.
   *  · Kapsam GÖNDERİLMİYOR, yani "hepsi". Mobilde kapsam seçtiren bir ekran
   *    yok; boş liste göndermek sunucuda reddediliyor (haklı olarak) ve
   *    yarım bir seçim uydurmak kullanıcının seçmediği bir şeyi seçmek
   *    olurdu. Ayrıntılı kapsam webdeki paylaşım ekranında.
   *  · Etiket zorunlu (sunucu tarafında da), tarihle üretiliyor ki kullanıcı
   *    web'deki listede hangi bağlantının nereden geldiğini görebilsin.
   *
   * YALNIZ YÖNETİCİ: uç zaten `canManage` istiyor. Düğmeyi üyeye göstermek,
   * onu basıp 403 yemeye davet etmek olurdu.
   */
  const paylas = async () => {
    if (paylasiliyor) return;
    setPaylasiliyor(true);
    setPaylasimHata("");
    try {
      const bugun = new Date().toLocaleDateString("tr-TR");
      const r = await apiFetch<{ shares?: Array<{ url?: string }> }>("/api/tree/share", {
        token,
        method: "POST",
        body: { label: `Telefondan paylaşım · ${bugun}`, hideLiving },
      });
      /*
       * Uç BÜTÜN bağlantıları döndürüyor ve YENİSİ BAŞTA: `createShare`
       * listeye `unshift` ediyor (`lib/members.ts`). Sondan almak, aylar
       * önce oluşturulmuş başka bir bağlantıyı paylaşmak olurdu — sırayı
       * varsaymak yerine kaynağa bakmak gerekiyordu, ilk yazdığımda sondan
       * alıyordum.
       */
      const url = r.shares?.[0]?.url;
      if (!url) throw new Error("Bağlantı üretilemedi.");
      await Share.share({ message: `${user?.treeName ?? "Aile ağacımız"} — Soy Ağacı\n${url}` });
    } catch (e) {
      setPaylasimHata(e instanceof Error ? e.message : "Bağlantı oluşturulamadı.");
    } finally {
      setPaylasiliyor(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ headerShown: true, title: "Menü" }} />
      <ScrollView contentContainerStyle={{ padding: 24 }}>
        <BrandMark />
        <Text style={styles.title}>{user?.treeName ?? "Ağacım"}</Text>
        <Text style={styles.subtitle}>{user?.name ? user.name : ""}</Text>

        <View
          style={{
            marginTop: 8,
            padding: 18,
            borderRadius: 16,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            gap: 6,
          }}
        >
          {/*
            HAM ROL DİZGESİ BASILMIYOR. Buradaki eski satır üyeye küçük harfle
            "uye" yazıyordu (kurucuya "Kurucu"); rol adları artık Türkçe
            kelimeler olduğu için ham değeri basmak yarım çevrilmiş bir sistem
            izlenimi veriyordu. Ayrıca çeviri `lib/roles.ts`ten geçiyor, yani
            telefonda duran eski ad ("admin") da doğru yazılıyor.
          */}
          <Row label="Rol" value={roleLabel(role, !!user?.isFounder)} />
          <Row label="Kişi sayısı" value={String(people.length)} />
        </View>

        {/*
          GİZLİLİK TERCİHİ. Mobilde gizlilik katmanı hiç yoktu: yaşayanların
          bütün bilgileri, hatta "gizli" işaretlenmiş kayıtlar bile ham
          gösteriliyordu. Katman eklendi; bu anahtar onun kullanıcıya açılan
          yüzü — web'deki tercihin karşılığı.

          `confidential` işaretli kayıtlar bu anahtardan BAĞIMSIZ maskeli
          kalıyor; anahtar yalnız yaşayanlar için.
        */}
        <View
          style={{
            marginTop: 12,
            padding: 16,
            borderRadius: 16,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600" }}>
              Yaşayanları gizle
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
              Yaşayan kişilerin doğum tarihi, fotoğrafı ve hikâyesi gizlenir.
            </Text>
          </View>
          <Switch
            value={hideLiving}
            onValueChange={setHideLiving}
            trackColor={{ true: colors.primary }}
            accessibilityLabel="Yaşayanları gizle"
          />
        </View>

        {/*
          ÇOKLU AĞAÇ. Sunucu aktif ağacı `x-tree-id` başlığından okuyor ve
          mobil o başlığı hiç göndermiyordu: birden çok ağacı olan bir kurucu
          telefonda YALNIZ ana ağacını görebiliyordu — öbürlerini kurmuş, veri
          girmiş ve hiçbirine ulaşamıyordu.

          Seçici yalnız BİRDEN ÇOK ağaç varken çiziliyor: tek ağacı olan
          kullanıcıya seçecek bir şey sunmak, ekranı hiçbir karşılığı olmayan
          bir kutuyla doldurmak olurdu.
        */}
        {trees.length > 1 && (
          <View style={{ marginTop: 16, gap: 8 }}>
            <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "600" }}>
              AĞAÇLARIM
            </Text>
            {trees.map((t) => {
              const secili = (activeTreeId ?? trees.find((x) => x.home)?.treeId) === t.treeId;
              return (
                <Pressable
                  key={t.treeId}
                  onPress={() => { if (!secili) switchTree(t.treeId); }}
                  style={[
                    styles.buttonSecondary,
                    secili && { borderColor: colors.primary, backgroundColor: colors.surface },
                  ]}
                  accessibilityState={{ selected: secili }}
                >
                  <Text
                    style={[styles.buttonSecondaryText, secili && { color: colors.primary, fontWeight: "700" }]}
                  >
                    {secili ? "● " : "○ "}
                    {t.name}
                    {t.home ? " (ana)" : ""}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        <NavButton label="🌳 Ağaç görünümü" to="/(app)/tree" router={router} />
        <NavButton label="📍 Yerler / harita" to="/(app)/map" router={router} />
        <NavButton label="📖 Aile kitabı" to="/(app)/book" router={router} />
        <NavButton label="🤖 Yapay zekâya sor" to="/(app)/ai" router={router} />
        {canEdit(role) && (
          <>
            <Pressable style={styles.buttonSecondary} onPress={paylas} disabled={paylasiliyor}>
              <Text style={styles.buttonSecondaryText}>
                {paylasiliyor ? "Bağlantı hazırlanıyor…" : "📤 Paylaşım bağlantısı oluştur"}
              </Text>
            </Pressable>
            {!!paylasimHata && (
              <Text style={{ color: colors.danger, fontSize: 12, marginTop: 6 }}>{paylasimHata}</Text>
            )}
          </>
        )}
        <Pressable style={styles.buttonSecondary} onPress={() => router.back()}>
          <Text style={styles.buttonSecondaryText}>Listeye dön</Text>
        </Pressable>
        <Pressable style={[styles.buttonSecondary, { borderColor: colors.danger }]} onPress={signOut}>
          <Text style={[styles.buttonSecondaryText, { color: colors.danger }]}>Çıkış yap</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function NavButton({
  label,
  to,
  router,
}: {
  label: string;
  to: string;
  router: ReturnType<typeof useRouter>;
}) {
  return (
    <Pressable
      style={[styles.buttonSecondary, { borderColor: colors.primary }]}
      onPress={() => {
        router.back();
        router.push(to as never);
      }}
    >
      <Text style={[styles.buttonSecondaryText, { color: colors.primary }]}>{label}</Text>
    </Pressable>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 }}>
      <Text style={{ color: colors.textMuted, fontSize: 14 }}>{label}</Text>
      <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600" }}>{value}</Text>
    </View>
  );
}
