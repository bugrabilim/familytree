/**
 * ROL KURALI — MOBİLİN TEK YERİ.
 *
 * Sunucudaki `types/user.ts` + `lib/roles.ts` ikilisinin mobil karşılığı.
 * Mobil kendi araç zincirinde derlendiği için web dosyalarını içe aktaramıyor;
 * o yüzden kural burada TEKRAR yazıldı ama SADECE burada — her yetki kararı
 * bu dosyadan geçiyor. Ekranlara `user.role === "yonetici"` diye dağıtılsaydı
 * (bir önceki hâli buydu) her yeni ekran kuralın bir kopyasını taşırdı ve
 * kopyalar ayrışırdı.
 *
 * ## Neden normalleştirme şart: telefondaki rol BAYAT olabilir
 *
 * Mobil rolü her istekte sunucuya sormuyor; girişte gelen `user` nesnesini
 * SecureStore'a yazıp bütün kararları o saklı dizgeden veriyor. Jeton 60 gün
 * geçerli (`lib/mobile-token.ts`) ve rolü tazeleyen bir uç yok. Rol modeli
 * dört kademeden ikiye inince (`admin/editor/contributor/viewer` →
 * `yonetici/uye`) telefonlarda hâlâ ESKİ adlar yazılı kaldı: deploy'dan önce
 * girmiş bir KURUCUNUN telefonunda `"admin"` duruyor ve bugünkü kod onu
 * tanımadığı için kendi ağacında "yetkin yok" görüyordu.
 *
 * Sunucu bu kişiyi kabul EDİYOR: `verifyMobileToken` jetondaki `"admin"`i
 * `normalizeRole` ile `"yonetici"`ye çeviriyor. Yani kilit tamamen istemci
 * tarafındaydı ve yanlıştı. Aşağıdaki tablo sunucunun tablosunun aynısı;
 * ikisi ayrışırsa arayüz yine sunucunun izin verdiğinden farklı bir şey
 * gösterir — ki bu bulgunun tam kendisi.
 */

export type TreeRole = "yonetici" | "uye";

/**
 * Depoda/jetonda karşılaşılabilecek ESKİ rol adları — `types/user.ts`teki
 * `ESKI_ROLLER` ile birebir aynı olmak zorunda.
 *
 * `admin` → `yonetici`: eski bir yöneticiyi üyeye indirmek, ona haber vermeden
 * yetkisini almak olurdu. Geri kalan hiçbiri yetki KAZANMIYOR.
 */
const ESKI_ROLLER: Record<string, TreeRole> = {
  admin: "yonetici",
  editor: "uye",
  contributor: "uye",
  viewer: "uye",
};

/**
 * Herhangi bir yerden okunan rol değerini bugünkü kademeye çevirir.
 *
 * TANINMAYAN değer `uye` — en az yetkili kademe. Bozuk ya da gelecekten gelen
 * bir değerin yönetici sayılması, tek bir yazım hatasıyla ağacın kontrolünü
 * devretmek olurdu.
 */
export function normalizeRole(raw: unknown): TreeRole {
  if (raw === "yonetici" || raw === "uye") return raw;
  if (typeof raw === "string" && raw in ESKI_ROLLER) return ESKI_ROLLER[raw];
  return "uye";
}

/**
 * SecureStore'dan okunan kullanıcının rolü.
 *
 * `normalizeRole`den tek farkı ROLSÜZ kaydın `yonetici` sayılması ve bu fark
 * bilinçli: sunucu da jetonu tam böyle çözüyor (`lib/mobile-token.ts` →
 * `payload.role === undefined ? "yonetici" : normalizeRole(...)`). O jetonlar
 * ağaç şifresiyle giren kuruculara ait ve rol alanı jetona eklenmeden önce
 * yazılmışlardı. Burada `uye` deseydik arayüz, sunucunun YAZMAYA İZİN
 * VERECEĞİ bir kurucuya "yetkin yok" derdi — düzeltmeye çalıştığımız hatanın
 * aynısı, başka kılıkta.
 *
 * Oturum yokken (`user === null`) çağrılırsa `uye` dönüyor: kimliği olmayan
 * birine en geniş yetkiyi vermek için bir sebep yok.
 */
export function storedRole(raw: unknown, hasUser = true): TreeRole {
  if (!hasUser) return "uye";
  if (raw === undefined || raw === null || raw === "") return "yonetici";
  return normalizeRole(raw);
}

/**
 * DOĞRUDAN yazabilir mi? (kişi ekleme/düzenleme/silme, yapay zekâ)
 *
 * Sunucu tarafındaki `canEdit` ile aynı kapı: `POST/PUT/DELETE
 * /api/family/person` ve `/api/ai/chat` bunu istiyor, geçemeyene 403 dönüyor.
 */
export function canEdit(role: TreeRole): boolean {
  return role === "yonetici";
}

/**
 * ÖNERİ açabilir mi? Ağacın her üyesi açabilir (`POST /api/family/proposals`).
 *
 * Üyenin yazma yolu bu: değişiklik doğrudan geçmiyor, kuyruğa giriyor ve
 * yönetici onaylayınca gerçekleşiyor.
 */
export function canPropose(role: TreeRole): boolean {
  return role === "yonetici" || role === "uye";
}

/**
 * Ekranda gösterilecek rol adı.
 *
 * Menüde ham dizge basılıyordu ve üyeye küçük harfle "uye" yazıyordu. Rol
 * adları artık Türkçe kelimeler olduğu için ham değeri basmak, kullanıcıya
 * yarım çevrilmiş bir sistem izlenimi veriyor.
 */
export function roleLabel(role: TreeRole, isFounder = false): string {
  /*
   * "Kurucu" etiketi ROLÜN ÖNÜNE GEÇMİYOR: kademe önce, kuruculuk parantez
   * içinde. Ters sırada yazılsaydı, arayüzün yazmaya izin vermediği bir
   * hesap ekranda "Kurucu" görünürdü — kullanıcının yaşadığı şeyle
   * çelişen bir etiket, bulgunun kendisini gizlerdi.
   */
  if (role === "yonetici") return isFounder ? "Kurucu (yönetici)" : "Yönetici";
  return "Üye";
}
