import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { apiFetch, setActiveTreeId } from "./api";
import { useAuth } from "./auth";
import { viewAll } from "./privacy";
import type { FamilyData, Person } from "./types";

/** "Yaşayanları gizle" tercihi — cihazda kalıcı. */
const HIDE_LIVING_KEY = "soyagaci.hideLiving";
/** Son bakılan ağaç — uygulama kapanıp açılınca aynı ağaçla dönsün. */
const ACTIVE_TREE_KEY = "soyagaci.activeTree";

/** Kurucunun ağaç listesindeki bir satır (`GET /api/trees`). */
export interface TreeItem {
  treeId: string;
  name: string;
  home?: boolean;
}

interface FamilyState {
  /**
   * GÖRÜNTÜLENECEK kişiler — gizlilik katmanından GEÇMİŞ (`lib/privacy.ts`).
   *
   * Varsayılanın maskeli olması bilinçli ve web'dekinden farklı: web'de her
   * çizim yeri `view()` çağırmayı HATIRLAMAK zorunda ve unutulan yer sessizce
   * ham veri gösteriyor. Mobilde bu katman zaten hiç yoktu; aynı tuzağı
   * yeniden kurmamak için varsayılan ters çevrildi. Yeni bir ekran yazan
   * kişi hiçbir şey hatırlamasa da doğru olanı görüyor.
   *
   * Ham kayda ihtiyacı olan tek yer düzenleme formu ve o açıkça `rawById`
   * istiyor.
   */
  people: Person[];
  byId: Map<string, Person>;
  /**
   * HAM kayıtlar — YALNIZ düzenleme formu için.
   *
   * Maskeli kopyayı forma verip kaydetmek, gizlenen alanları KALICI olarak
   * silmek olurdu: form bütün alanları gövdeye koyuyor ve maskeli kopyada o
   * alanlar yok. Web'de aynı ayrım `PersonDrawer` (maskeli) ile `PersonForm`
   * (ham) arasında.
   */
  rawById: Map<string, Person>;
  /** Yaşayanların bilgileri gizlensin mi? Cihazda kalıcı tercih. */
  hideLiving: boolean;
  setHideLiving: (v: boolean) => void;
  /**
   * ÇOKLU AĞAÇ. Kurucunun erişebildiği ağaçlar ve o an bakılan.
   *
   * Sunucu aktif ağacı `x-tree-id` başlığından okuyor ve mobil o başlığı HİÇ
   * göndermiyordu: birden çok ağacı olan bir kurucu telefonda yalnız ana
   * ağacını görebiliyordu. Öbür ağaçlarını kurmuş, veri girmiş, telefonda
   * hiçbirine ulaşamıyordu.
   *
   * Üyede liste BOŞ kalıyor: üye tek bir ağaca davetli ve `/api/trees`
   * founder istiyor. Boş listede arayüz seçici göstermiyor.
   */
  trees: TreeItem[];
  activeTreeId: string | null;
  switchTree: (treeId: string) => void;
  loading: boolean;
  refreshing: boolean;
  error: string;
  /**
   * Ekrandaki verinin dayandığı SÜRÜM DAMGASI (`GET /api/family` → `updatedAt`).
   *
   * Yazma isteklerinde `x-base-version` olarak geri gönderiliyor; sunucu
   * damga uyuşmazsa 409 dönüyor (`lib/blob.ts` → `versionMismatch`). Damga
   * zaten yanıtın içindeydi ama burada ATILIYORDU — ve sunucu başlık yoksa
   * çakışma denetimini hiç yapmadığı için mobilde iyimser kilit tümüyle
   * kapalıydı: 20 dakika önce açılmış bir formdan Kaydet'e basmak, arada
   * web'den yapılmış düzeltmeyi uyarısız geri alıyordu (form bütün alanları
   * gövdeye koyuyor, içinde ESKİ değerlerle).
   */
  baseVersion: string | null;
  /**
   * Kullanıcının elle tetiklediği yenileme (pull-to-refresh).
   *
   * Taze veriyi DÖNDÜRÜYOR: çakışma sonrası form, yenilenmiş kaydı bu
   * dönüşten okuyup alanlarını tazeliyor. Bağlamdaki `byId`ye bakamazdı —
   * `await`in içinde elindeki kopya hâlâ yenileme öncesinin.
   */
  refresh: () => Promise<FamilyData | null>;
}

const Ctx = createContext<FamilyState | null>(null);

/**
 * Ağaç verisini bir kez çekip tüm korumalı ekranlara verir. Liste ve profil
 * aynı kaynağı paylaşır; her ekran ayrı ayrı ağ isteği yapmaz.
 */
export function FamilyProvider({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuth();
  const [people, setPeople] = useState<Person[]>([]);
  const [hideLiving, setHideLivingState] = useState(false);
  const [trees, setTrees] = useState<TreeItem[]>([]);
  const [activeTreeId, setActiveTreeIdState] = useState<string | null>(null);
  /**
   * Saklı tercih OKUNDU mu?
   *
   * Ağaç verisi bu bayrak açılmadan çekilmiyor. Okumadan çekseydik uygulama
   * her açılışta ÖNCE ana ağacı gösterip sonra doğru ağaca atlardı — ve
   * arada yapılan bir düzenleme yanlış ağaca gidebilirdi.
   */
  const [agacHazir, setAgacHazir] = useState(false);
  const [baseVersion, setBaseVersion] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(
    async (mode: "initial" | "refresh"): Promise<FamilyData | null> => {
      if (!token) return null;
      if (mode === "refresh") setRefreshing(true);
      setError("");
      try {
        const data = await apiFetch<FamilyData>("/api/family", { token });
        setPeople(Array.isArray(data.people) ? data.people : []);
        setBaseVersion(typeof data.updatedAt === "string" ? data.updatedAt : null);
        return data;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Veri alınamadı.");
        /*
         * Damga BOŞALTILIYOR. Okuma başarısızken elde kalan eski damgayla
         * yazmaya devam etmek, sunucunun çakışma denetimini bilerek yanlış
         * bir tabana dayandırmak olurdu.
         */
        setBaseVersion(null);
        return null;
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token]
  );

  /*
   * Saklı aktif ağaç okunuyor ve `api.ts`e bildiriliyor. Modül düzeyindeki
   * değer, `apiFetch`in her isteğe başlığı koyabilmesi için gerekli —
   * `apiFetch` bir bileşen değil, bağlamı göremiyor.
   */
  useEffect(() => {
    let alive = true;
    SecureStore.getItemAsync(ACTIVE_TREE_KEY)
      .then((v) => {
        if (!alive) return;
        setActiveTreeId(v || null);
        setActiveTreeIdState(v || null);
      })
      .catch(() => { /* okunamazsa ana ağaç */ })
      .finally(() => { if (alive) setAgacHazir(true); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!agacHazir) return;
    setLoading(true);
    load("initial");
  }, [load, agacHazir, activeTreeId]);

  /*
   * Ağaç listesi YALNIZ kurucuda çekiliyor (`/api/trees` founder istiyor) ve
   * hatası yutuluyor: liste alınamadığında seçici görünmüyor ama ağacın
   * kendisi çalışmaya devam ediyor. Bir kolaylığın arızası, uygulamayı
   * kullanılamaz hâle getirmemeli.
   */
  useEffect(() => {
    if (!token || !user?.isFounder) { setTrees([]); return; }
    let alive = true;
    apiFetch<{ trees?: TreeItem[] }>("/api/trees", { token })
      .then((r) => { if (alive) setTrees(Array.isArray(r.trees) ? r.trees : []); })
      .catch(() => { if (alive) setTrees([]); });
    return () => { alive = false; };
  }, [token, user?.isFounder]);

  /**
   * Ağaç değiştir.
   *
   * Modül değeri ÖNCE yazılıyor: `load` hemen ardından koşacak ve isteğin
   * başlığı yeni ağacı taşımalı. Ters sırada ilk istek eski ağaca giderdi.
   */
  const switchTree = useCallback((treeId: string) => {
    setActiveTreeId(treeId);
    setActiveTreeIdState(treeId);
    SecureStore.setItemAsync(ACTIVE_TREE_KEY, treeId).catch(() => {
      /* yazılamazsa seçim bu oturumda geçerli */
    });
  }, []);

  /*
   * Tercih cihazda saklanıyor. Okuma başarısızsa varsayılan KAPALI — web'deki
   * `PrivacyContext` ile aynı: giriş yapmış kullanıcı kendi ağacını
   * varsayılan olarak açık görüyor, gizleme bir tercih.
   *
   * `confidential` kayıtlar bu tercihten BAĞIMSIZ maskeli kalıyor
   * (`lib/privacy.ts` → `isMasked`), yani tercih kapalıyken bile gizli
   * işaretlenmiş kayıt açılmıyor.
   */
  useEffect(() => {
    let alive = true;
    SecureStore.getItemAsync(HIDE_LIVING_KEY)
      .then((v) => { if (alive) setHideLivingState(v === "1"); })
      .catch(() => { /* okunamazsa varsayılan kapalı */ });
    return () => { alive = false; };
  }, []);

  const setHideLiving = useCallback((v: boolean) => {
    setHideLivingState(v);
    SecureStore.setItemAsync(HIDE_LIVING_KEY, v ? "1" : "0").catch(() => {
      /* yazılamazsa tercih bu oturumda geçerli; çizim yine doğru */
    });
  }, []);

  /*
   * MASKELEME BURADA, tek yerde. Ekranlar `people`/`byId` aldığında zaten
   * gizlilik katmanından geçmiş veriyi alıyor.
   */
  const gorunur = useMemo(() => viewAll(people, hideLiving), [people, hideLiving]);
  const byId = useMemo(() => new Map(gorunur.map((p) => [p.id, p])), [gorunur]);
  const rawById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const refresh = useCallback(() => load("refresh"), [load]);

  const value = useMemo<FamilyState>(
    () => ({
      people: gorunur, byId, rawById, hideLiving, setHideLiving,
      trees, activeTreeId, switchTree,
      loading, refreshing, error, baseVersion, refresh,
    }),
    [gorunur, byId, rawById, hideLiving, setHideLiving, trees, activeTreeId, switchTree,
     loading, refreshing, error, baseVersion, refresh]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFamily(): FamilyState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useFamily FamilyProvider içinde kullanılmalı");
  return v;
}
