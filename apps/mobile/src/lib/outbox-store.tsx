import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState } from "react-native";
import * as SecureStore from "expo-secure-store";
import {
  ApiError,
  createPerson,
  deletePerson,
  proposeDelete,
  proposeFields,
  proposeNewPerson,
  updatePerson,
  type RelationType,
} from "./api";
import { useAuth } from "./auth";
import { useFamily } from "./family";
import {
  bekleyenSayisi,
  birlestir,
  cakismaUygula,
  cakisanSayisi,
  cikar,
  cozumUygula,
  deserialize,
  hataUygula,
  hataliSayisi,
  kisiBekliyorMu,
  kuyrugaAl,
  kuyrukDolu,
  kuyrukSuz,
  parcala,
  parcalariBirlestir,
  serialize,
  sonraki,
  type Cozum,
  type OutboxGirdi,
  type OutboxItem,
} from "./outbox";
import type { Person } from "./types";

/**
 * ÇEVRİMDIŞI KUYRUĞUN G/Ç'Sİ VE SÜRÜCÜSÜ (yol haritası madde 44).
 *
 * Karar mantığı burada DEĞİL — `src/lib/outbox.ts`te, saf ve test edilebilir
 * hâlde. Bu dosya üç şey yapıyor: kuyruğu cihazda saklıyor, bağlantı
 * geldiğinde sırayla gönderiyor, sonucu ekranlara veriyor.
 *
 * `FamilyProvider`ın İÇİNDE olmak zorunda: gönderim taze ağaç verisi ve taze
 * sürüm damgası istiyor, ikisi de oradan geliyor.
 */

/* ── Cihazda saklama ──────────────────────────────────────────────────────── */

/**
 * PARÇALI SAKLAMA — çünkü elimizde SecureStore'dan başka kalıcılık yok.
 *
 * Depoda `AsyncStorage` da `expo-file-system` de yok (`package.json`) ve bu
 * iş için yeni bağımlılık eklemiyoruz. SecureStore'da Android tarafında bir
 * değer 2048 baytı aşamıyor; aşan yazma SESSİZCE düşüyor — yani kuyruk
 * uygulama kapanınca yok olurdu. Tam olarak önlemeye çalıştığımız kayıp.
 *
 * Bu yüzden JSON metni baytla ölçülüp parçalara bölünüyor (`parcala`), her
 * parça ayrı anahtara yazılıyor ve sayaç EN SONA yazılıyor: yarım kalan bir
 * yazmada sayaç hâlâ eski parça sayısını gösterir, okuma JSON'u
 * ayrıştıramaz ve kuyruk boş döner. Bu pencere kapatılamıyor (SecureStore'da
 * işlem yok); daraltmak için sayaç son adım.
 */
const PARCA_SAYI_ANAHTAR = "soyagaci.outbox.n";
const parcaAnahtar = (i: number) => `soyagaci.outbox.${i}`;
/** Bir kerede silinebilecek eski parça sayısı — sonsuz döngü olmasın. */
const MAKS_PARCA = 64;

async function kuyrukOku(): Promise<OutboxItem[]> {
  try {
    const sayiMetni = await SecureStore.getItemAsync(PARCA_SAYI_ANAHTAR);
    const sayi = Number(sayiMetni ?? "0");
    if (!Number.isFinite(sayi) || sayi <= 0) return [];
    const parcalar = await Promise.all(
      Array.from({ length: Math.min(sayi, MAKS_PARCA) }, (_, i) =>
        SecureStore.getItemAsync(parcaAnahtar(i))
      )
    );
    return deserialize(parcalariBirlestir(parcalar));
  } catch {
    /* Okunamadıysa kuyruk yok sayılıyor: açılışta atılan bir istisna
       uygulamayı hiç açılmaz hâle getirirdi. */
    return [];
  }
}

async function kuyrukYaz(kuyruk: OutboxItem[]): Promise<void> {
  try {
    const parcalar = kuyruk.length ? parcala(serialize(kuyruk)) : [];
    for (let i = 0; i < parcalar.length; i++) {
      await SecureStore.setItemAsync(parcaAnahtar(i), parcalar[i]);
    }
    /*
     * ARTAKALAN PARÇALAR SİLİNİYOR. Kuyruk kısaldığında eski (daha uzun)
     * yazmanın kuyruğu geride kalırdı ve sayaç büyürse yeniden okunup
     * bozuk JSON üretirdi.
     */
    const eski = Number((await SecureStore.getItemAsync(PARCA_SAYI_ANAHTAR)) ?? "0");
    for (let i = parcalar.length; i < Math.min(eski, MAKS_PARCA); i++) {
      await SecureStore.deleteItemAsync(parcaAnahtar(i));
    }
    await SecureStore.setItemAsync(PARCA_SAYI_ANAHTAR, String(parcalar.length));
  } catch {
    /* Yazılamadıysa kuyruk bu oturumda geçerli. Kullanıcıya kaydettiğini
       söyleyen mesaj yine de doğru: uygulama açık kaldığı sürece gönderilir. */
  }
}

/* ── Bağlam ───────────────────────────────────────────────────────────────── */

/** Ekranların verdiği bilgi — hesap ve ağaç bağlamdan ekleniyor. */
export type YakalaGirdi = Omit<OutboxGirdi, "hesap" | "treeId">;

interface OutboxState {
  /** YALNIZ aktif hesabın ve aktif ağacın öğeleri. */
  kuyruk: OutboxItem[];
  bekleyen: number;
  cakisan: number;
  hatali: number;
  /** Şu an gönderim turu koşuyor mu? */
  gonderiliyor: boolean;
  /** Saklı kuyruk cihazdan okundu mu? (okunmadan gönderim başlamamalı) */
  hazir: boolean;
  /** Yazma niyetini sıraya alır. `false` → kuyruk dolu, yakalanamadı. */
  yakala: (girdi: YakalaGirdi) => boolean;
  /** Elle "şimdi gönder". */
  simdiGonder: () => void;
  /** Çakışma kararı: benimkini uygula / sunucudakini tut. */
  coz: (id: string, cozum: Cozum) => void;
  /** Kalıcı hatalı öğeyi kuyruktan at. */
  at: (id: string) => void;
  /** Bu kişi için bekleyen bir yazma var mı? (profilde rozet) */
  kisiBekliyor: (personId: string) => boolean;
}

const Ctx = createContext<OutboxState | null>(null);

/** Kuyruğu boşta bırakmamak için düzenli deneme aralığı (ms). */
const DENEME_ARALIGI = 60_000;
/** Bir gönderim turunun azami adımı — sonsuz döngüye karşı. */
const TUR_SINIRI = 250;

export function OutboxProvider({ children }: { children: ReactNode }) {
  const { token, user } = useAuth();
  const { refresh, activeTreeId } = useFamily();

  const [kuyruk, setKuyruk] = useState<OutboxItem[]>([]);
  const [hazir, setHazir] = useState(false);
  const [gonderiliyor, setGonderiliyor] = useState(false);

  /*
   * Kuyruğun REF kopyası. Gönderim turu bir döngü içinde arka arkaya
   * `await` ediyor; her adımda durum değişkeninin tazesine ihtiyaç var ve
   * `useState` kapanışı turun başındaki değerde donmuş kalırdı — o kapanışla
   * çalışan bir döngü aynı öğeyi sonsuza kadar yeniden gönderirdi.
   */
  const kuyrukRef = useRef<OutboxItem[]>([]);
  const calisiyorRef = useRef(false);

  const uygula = useCallback((f: (k: OutboxItem[]) => OutboxItem[]) => {
    const yeni = f(kuyrukRef.current);
    kuyrukRef.current = yeni;
    setKuyruk(yeni);
    void kuyrukYaz(yeni);
  }, []);

  /* Açılışta saklı kuyruk. */
  useEffect(() => {
    let alive = true;
    kuyrukOku()
      .then((k) => {
        if (!alive) return;
        kuyrukRef.current = k;
        setKuyruk(k);
      })
      .finally(() => {
        if (alive) setHazir(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const yakala = useCallback(
    (girdi: YakalaGirdi): boolean => {
      if (!user) return false;
      if (kuyrukDolu(kuyrukRef.current)) return false;
      const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      uygula((k) =>
        kuyrugaAl(
          k,
          { ...girdi, hesap: user.id, treeId: activeTreeId ?? null },
          Date.now(),
          id
        )
      );
      return true;
    },
    [uygula, user, activeTreeId]
  );

  /** Tek öğeyi sunucuya yazar. Damga TAZE olan (turun başında çekilen). */
  const gonderTek = useCallback(
    async (it: OutboxItem, govde: Record<string, unknown>, damga: string | null) => {
      if (!token) throw new ApiError("Oturum yok.", 401);
      const agac = it.treeId ?? undefined;
      const bag = it.relation
        ? { type: it.relation.type as RelationType, targetId: it.relation.targetId }
        : undefined;

      if (it.oneri) {
        /* Öneri yolunda damga GÖNDERİLMİYOR — `api.ts`teki gerekçe. */
        if (it.kind === "ekle") await proposeNewPerson(token, govde, bag, agac);
        else if (it.kind === "guncelle") await proposeFields(token, it.personId!, govde, agac);
        else await proposeDelete(token, it.personId!, agac);
        return;
      }
      if (it.kind === "ekle") await createPerson(token, govde, bag, damga, agac);
      else if (it.kind === "guncelle") await updatePerson(token, it.personId!, govde, damga, agac);
      else await deletePerson(token, it.personId!, damga, agac);
    },
    [token]
  );

  /**
   * BİR GÖNDERİM TURU.
   *
   * Akış: taze veriyi çek → sıradaki öğeyi taze veriyle BİRLEŞTİR → karara
   * göre gönder/atla/kullanıcıya sor.
   *
   * Her başarılı yazmadan sonra tur baştan başlıyor, çünkü yazma ağacın
   * damgasını DEĞİŞTİRİYOR: aynı damgayla ikinci bir yazma göndermek
   * garantili 409 olurdu. (Öneri yazmaları ağacı değiştirmiyor, onlarda
   * devam ediliyor.)
   *
   * `refresh()` `null` dönerse hâlâ çevrimdışıyız: tur sessizce bitiyor,
   * kuyruk olduğu gibi kalıyor. Bağlantı denetimi için ayrı bir kütüphane
   * (NetInfo) YOK — "denemek" zaten en doğru denetim, çünkü çevrimiçi
   * görünüp yazamadığımız durumlar (uçak wifi'si, captive portal) da aynı
   * yola düşüyor.
   */
  const turKos = useCallback(async () => {
    if (calisiyorRef.current) return;
    if (!token || !user || !hazir) return;
    const hesap = user.id;
    const agac = activeTreeId ?? null;
    if (!sonraki(kuyrukSuz(kuyrukRef.current, hesap, agac), Date.now())) return;

    calisiyorRef.current = true;
    setGonderiliyor(true);
    try {
      for (let adim = 0; adim < TUR_SINIRI; adim++) {
        const veri = await refresh();
        if (!veri) break; // çevrimdışı ya da okuma düştü
        const kayitlar = new Map<string, Person>(veri.people.map((p) => [p.id, p]));
        const damga = typeof veri.updatedAt === "string" ? veri.updatedAt : null;

        let yazdi = false;
        let dur = false;
        while (!dur) {
          const it = sonraki(kuyrukSuz(kuyrukRef.current, hesap, agac), Date.now());
          if (!it) {
            dur = true;
            break;
          }
          const karar = birlestir(it, it.personId ? kayitlar.get(it.personId) : undefined);
          if (karar.tur === "cakisma") {
            uygula((k) => cakismaUygula(k, it.id, karar.sebep, karar.alanlar));
            dur = true;
            break;
          }
          if (karar.tur === "atla") {
            /* Niyet zaten gerçekleşmiş: sunucuya gitmeden düşüyor. */
            uygula((k) => cikar(k, it.id));
            continue;
          }
          try {
            await gonderTek(it, karar.gonderilecek, damga);
            uygula((k) => cikar(k, it.id));
            if (it.oneri) continue; // ağaç değişmedi, aynı damgayla devam
            yazdi = true;
            dur = true;
          } catch (e) {
            const status = e instanceof ApiError ? e.status : 0;
            const mesaj = e instanceof Error ? e.message : "Gönderilemedi.";
            uygula((k) => hataUygula(k, it.id, status, mesaj, Date.now()));
            dur = true;
          }
        }
        if (!yazdi) break; // ilerleme yok: tur bitti
      }
    } finally {
      calisiyorRef.current = false;
      setGonderiliyor(false);
    }
  }, [token, user, hazir, activeTreeId, refresh, gonderTek, uygula]);

  /*
   * Turu REF üzerinden tetikliyoruz: zamanlayıcı ve AppType dinleyicisi
   * `turKos` her değiştiğinde yeniden kurulmasın. `turKos` bağımlılıkları
   * (aile verisi tazelendiğinde değişen `refresh` dâhil) her turda
   * değişiyor; dinleyiciyi ona bağlamak, her gönderimde zamanlayıcıyı
   * sıfırlayan bir döngü kurardı.
   */
  const turRef = useRef(turKos);
  useEffect(() => {
    turRef.current = turKos;
  }, [turKos]);

  /* Açılışta / oturum ve ağaç değişince bir tur. */
  useEffect(() => {
    if (!hazir || !token) return;
    void turRef.current();
  }, [hazir, token, activeTreeId]);

  /* Uygulama öne geldiğinde: kullanıcı telefonu cebinden çıkardı, muhtemelen
     şebeke de geri geldi. Kuyruğun en doğal tetikleyicisi bu. */
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void turRef.current();
    });
    return () => sub.remove();
  }, []);

  /* Kuyrukta iş varken düzenli deneme. Boşken zamanlayıcı hiç kurulmuyor:
     boş kuyruk için dakikada bir ağ isteği yapmak pil yakmak olurdu. */
  const isVar = kuyruk.length > 0;
  useEffect(() => {
    if (!isVar) return;
    const t = setInterval(() => void turRef.current(), DENEME_ARALIGI);
    return () => clearInterval(t);
  }, [isVar]);

  const coz = useCallback(
    (id: string, cozum: Cozum) => {
      uygula((k) => cozumUygula(k, id, cozum, Date.now()));
      void turRef.current();
    },
    [uygula]
  );

  const at = useCallback((id: string) => uygula((k) => cikar(k, id)), [uygula]);

  const dilim = useMemo(
    () => (user ? kuyrukSuz(kuyruk, user.id, activeTreeId ?? null) : []),
    [kuyruk, user, activeTreeId]
  );

  const kisiBekliyor = useCallback(
    (personId: string) => kisiBekliyorMu(dilim, personId),
    [dilim]
  );

  const value = useMemo<OutboxState>(
    () => ({
      kuyruk: dilim,
      bekleyen: bekleyenSayisi(dilim),
      cakisan: cakisanSayisi(dilim),
      hatali: hataliSayisi(dilim),
      gonderiliyor,
      hazir,
      yakala,
      simdiGonder: () => void turRef.current(),
      coz,
      at,
      kisiBekliyor,
    }),
    [dilim, gonderiliyor, hazir, yakala, coz, at, kisiBekliyor]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOutbox(): OutboxState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useOutbox OutboxProvider içinde kullanılmalı");
  return v;
}
