import { saveFamilyData } from "@/lib/blob";
import { DEMO_USER_ID } from "./demo-id.ts";
import { dbUpsertTree } from "@/lib/db";
import { listTrees, purgeTree } from "@/lib/trees";
import { DEMO_PEOPLE } from "@/lib/demo-data";
import type { SessionUser } from "@/lib/credentials";

/** Herkesin şifresiz girebildiği ortak demo. */
export const DEMO_FAMILY_NAME = "Demirtaş (demo)";
/*
 * Kimliğin TANIMI `lib/demo-id.ts`e taşındı, evi ise burası olmaya devam
 * ediyor: yirmi kadar çağıran `@/lib/demo-account`tan içe aktarıyor ve o
 * satırların hiçbiri değişmedi. Taşımanın sebebi bir içe aktarma döngüsü —
 * gerekçesi o dosyanın başında yazılı; dizgeyi buraya geri kopyalamayın,
 * iki tanım noktası sessizce ayrışır.
 */
export { DEMO_USER_ID };

/**
 * DEMO BİR HESAP DEĞİL, BİR VİTRİNDİR.
 *
 * Bu dosyadaki en önemli cümle bu ve buraya, ileride birinin "tutarlılık
 * olsun" diye demoyu yeniden kimlik sistemine sokmasını engellemek için
 * yazıldı. Eğer o değişikliği düşünüyorsan, önce aşağıyı oku.
 *
 * ## Demo neden kimlik deposunda DURMUYOR
 *
 * Demo, tanıtım sayfasının ana çağrısı: ziyaretçi şifre yazmadan,
 * kaydolmadan, hiçbir şey vermeden içeri giriyor ve gezdiği ağaç her girişte
 * sıfırlanan oyuncak veri. Yani "demoya giren kişi" diye biri yok —
 * doğrulanacak bir kimlik, korunacak bir sır, sahiplenilecek bir veri yok.
 *
 * Eski hâlinde demo yine de `users.json`a NORMAL BİR HESAP gibi yazılıyordu:
 * rastgele üretilen, hiçbir yerde saklanmayan bir bcrypt şifre karmasıyla.
 * Yani depoda gerçek bir kimlik değil, kimlik TAKLİDİ bir satır duruyordu —
 * şifresi kimsede olmayan, kurtarma kodu kimseye verilmemiş, e-postası
 * olmayan, sıfırlanamayan bir "hesap". O satır hiçbir kimlik işlevi
 * görmüyordu; yalnızca başka kodun `findUserById(demo)` çağrılarına bir
 * nesne döndürmek için oradaydı.
 *
 * Bedeli ise gerçekti:
 *
 *  · **Faz 4'ün önünde duruyordu.** `users.json` emekliye ayrıldığında
 *    (`docs/SUPABASE-GECIS.md`) demonun kimliğinin nereye dayanacağı belirsiz
 *    kalıyordu — herkese açık oyun alanı sessizce kapanabilirdi.
 *  · **Herkesin bildiği bir "şifre" kimlik sisteminin içindeydi.** Demoya
 *    gerçek kimlik altyapısı (Supabase Auth kaydı, sentetik e-posta, kurtarma
 *    kodu, şifre sıfırlama) taşıtmak da aynı hatanın öteki ucu olurdu.
 *  · Demo, kimlik envanterini gezen her işin (cron postaları, ayna taraması,
 *    Auth kapsama denetimi) yoluna çıkıyor ve hepsinde "bu hesap neden böyle"
 *    diye bir istisna gerektiriyordu.
 *
 * ## Bugünkü hâli
 *
 * Demo girişinin kimlik deposuyla HİÇBİR alışverişi yok: `signIn("demo")`
 * ayrı bir sağlayıcıdan geçiyor (`auth.ts`), oturumun bütün alanları
 * aşağıdaki sabitten geliyor. Demonun `users.json` satırı yok, `accounts`
 * satırı yok, `auth.users` kaydı yok — çünkü demo bir kimlik değil.
 *
 * Bunun iki doğal sonucu var ve ikisi de İSTENEN davranış:
 *
 *  · `findUserByFamilyName(DEMO_FAMILY_NAME)` artık `null` — yani normal
 *    giriş formundan demoya girilemez (`lib/credentials.ts`). Eskiden bunu
 *    sağlayan şey rastgele şifreydi; şimdi ortada denenecek bir satır bile
 *    yok. `tests/demo-identity-gate.test.mts` bunu kilitliyor.
 *  · Demo şifre sıfırlamaya, kurtarma koduna, kimlik e-postasına ve cron
 *    postalarına hiç girmiyor. Hiçbiri kayıp değil: demonun sahibi yok.
 *
 * DEMONUN SİLİNEMEZ OLMASI bundan etkilenmiyor: o kapılar `users.json`
 * satırına değil KİMLİĞE (`DEMO_USER_ID`) bakıyor —
 * `lib/account-lifecycle.ts` ve `app/api/account/delete/route.ts`.
 */
export const DEMO_SESSION: SessionUser = {
  id: DEMO_USER_ID,
  name: DEMO_FAMILY_NAME,
  // Demo ortak oyun alanı: ziyaretçiler serbestçe ekler/düzenler → yönetici.
  role: "yonetici",
  treeName: DEMO_FAMILY_NAME,
  // Ağacın sahibi: ziyaretçi ağaç kurabilsin, ayar ekranlarını görebilsin.
  isFounder: true,
};

/**
 * Kimlik kaydı OLMAYAN bir ağacın görünen adı — bugün yalnız demo.
 *
 * Kurucunun adını `users.json`dan çözen yüzeyler (katkı akışı, davet sayfası)
 * demo için `null` alıyor; adı bilinen tek yer bu dosyadaki sabit olduğundan
 * önce buraya soruyorlar. Ayrı bir işlev olması bilinçli: çağıranların
 * `DEMO_USER_ID` karşılaştırmasını kendi içlerinde tekrarlaması, demonun
 * kimliksizliğini bütün depoya dağıtmak olurdu.
 */
export function demoTreeName(treeId: string): string | null {
  return treeId === DEMO_USER_ID ? DEMO_FAMILY_NAME : null;
}

/**
 * Aile adı demoya mı ait? (büyük/küçük harf duyarsız — `findUserByFamilyName`
 * ile aynı ölçüt).
 *
 * Kayıt uçları bunu soruyor: demonun `users.json` satırı kalktığı için "bu ad
 * zaten var mı" denetimi artık demo adını yakalamıyordu ve birisi demonun
 * adıyla gerçek bir ağaç açabilirdi. Ad, kimlik deposunda değil KODDA
 * rezerve — sahibi olmayan bir adın korunacağı yer de burası.
 */
export function isDemoFamilyName(familyName: string): boolean {
  return familyName.trim().toLowerCase() === DEMO_FAMILY_NAME.toLowerCase();
}

/**
 * Demo ağacını başlangıç hâline döndürür ve demo oturumunu üretir.
 *
 * Ağaç herkese açık ve ortak: ziyaretçiler kişi ekleyip silebilir. Bu yüzden
 * her demo girişinde ağaç sıfırlanır — bir sonraki ziyaretçi her zaman
 * tertemiz bir demo görür. Demo oturumu founder olduğundan ziyaretçiler
 * ekstra ("test") ağaçlar da oluşturabilir; bunlar ana ağaç sıfırlamasına
 * dahil değildi ve birikiyordu — girişte hepsi temizlenir, yalnız ana demo
 * ağacı kalır.
 *
 * Hiçbir kimlik kaydı OLUŞTURMAZ ya da OKUMAZ (gerekçe `DEMO_SESSION`ın
 * başında); yaptığı tek şey ağaç verisini hazırlamak.
 */
export async function prepareDemoAccount(): Promise<SessionUser> {
  /*
   * AYNADAKİ AĞAÇ SATIRI. Kimlik değil, VERİ: `people.tree_id` → `trees(id)`
   * yabancı anahtarı var, satır yoksa demo ağacının Postgres aynası hiç
   * yazılamaz (`saveFamilyData` çift-yazması sessizce düşer). Eskiden bu satır
   * `createUser`ın yan etkisi olarak açılıyordu; demo artık oradan geçmediği
   * için burada, kendi gerekçesiyle açılıyor.
   *
   * `accounts` satırı ise BİLEREK açılmıyor: o, kimlik aynası.
   *
   * En iyi çaba — Supabase yapılandırılmamış ortamlarda (yerel geliştirme)
   * hata verir ve demo yine de açılmalı.
   */
  try {
    await dbUpsertTree({
      treeId: DEMO_USER_ID,
      ownerAccount: DEMO_USER_ID,
      name: DEMO_FAMILY_NAME,
      isHome: true,
    });
  } catch (e) {
    console.warn(`[demo] ağaç satırı→postgres:`, (e as Error).message);
  }

  await saveFamilyData(DEMO_USER_ID, {
    people: DEMO_PEOPLE,
    // Aile Kitabı için varsayılan kapak (#9). Ziyaretçi kendi fotoğrafını
    // yükleyip değiştirebilir; her demo girişinde bu varsayılana döner.
    coverPhoto: "/demo-book-cover.svg",
    updatedAt: new Date().toISOString(),
  });

  // Ziyaretçilerin oluşturduğu ekstra ("test") ağaçları temizle — yalnız ana
  // demo ağacı kalsın. Best-effort: temizlik başarısız olsa da demo açılır.
  try {
    const trees = await listTrees(DEMO_USER_ID, DEMO_FAMILY_NAME);
    for (const t of trees) {
      /*
       * Demo'da BEKLEME SÜRESİ YOK: yumuşak silme (`softDeleteTree`) yerine
       * doğrudan kalıcı silme. Bekleme süresi "yanlışlıkla sildim" hatasına
       * karşı; demo ağaçları zaten her girişte sıfırlanan oyuncak veri ve 30
       * gün beklemek, ziyaretçilerin bıraktığı ağaçların birikmesi demek
       * olurdu.
       */
      if (!t.home) await purgeTree(DEMO_USER_ID, t.treeId);
    }
  } catch {
    /* temizlik başarısız olsa da demo çalışmaya devam eder */
  }

  // NOT: Paylaşım bağlantılarını girişte SIFIRLAMIYORUZ. Eskiden resetShares
  // çağrılıyordu; bu, ziyaretçinin demo'da oluşturduğu paylaşım linkini
  // (bazen daha o linke tıklamadan) siliyor ve link "Bağlantı geçersiz"
  // veriyordu. Demo verisi sabittir (DEMO_PEOPLE), bir link hep geçerli demo
  // ağacını gösterir; birikim MAX_SHARES ile zaten sınırlıdır.

  return DEMO_SESSION;
}
