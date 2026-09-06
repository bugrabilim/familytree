import type { ShareScope } from "@/lib/share-scope";
export interface User {
  id: string;
  familyName: string;
  passwordHash: string;
  recoveryCodeHash: string;
  /**
   * Kurtarma kodunun ARANABİLİR indeksi — normalleştirilmiş kodun SHA-256'sı
   * (`lib/recovery-code.ts`). TUZSUZ ve bu bilinçli: bcrypt hash'iyle satır
   * ARANAMIYOR (her hash yeni tuz üretir), oysa şifresini unutmuş birinden
   * ayrıca ağacının tam yazımını istemek kurtarmanın kendisini zorlaştırıyor.
   * Tuzsuz özetin klasik riski sözlük saldırısıdır; kod 32 harfli alfabeden
   * 16 karakter (≈ 80 bit) ve insan seçmiyor, o yüzden sözlüğü de yok.
   *
   * Doğrulama katmanı DEĞİL: indeks yalnız satırı bulur, kodu `recoveryCodeHash`
   * doğrular. Eski hesaplarda YOK — kodun düz hâli kimsede olmadığı için
   * geriye dönük doldurulamaz; onlar ağaç adıyla bulunmaya devam eder ve ilk
   * başarılı sıfırlamada kod yenilenerek indeksleri açılır.
   */
  recoveryCodeIndex?: string;
  createdAt: string;
  /** Bildirim e-posta adresi (opt-in). Giriş surname+şifre olduğundan e-posta
   *  yalnız hatırlatma/bildirim için, kullanıcının açık onayıyla saklanır. */
  notifyEmail?: string;
  /** Doğum/ölüm/evlilik yıl dönümü e-posta hatırlatmalarını istiyor mu? */
  notifyReminders?: boolean;
  /**
   * KİMLİK e-postası (Supabase Faz 3e). `notifyEmail`den AYRI ve bilerek:
   * o bir bildirim adresi, bu hesabı geri almanın yolu olacak (madde 51).
   * Güven eşikleri aynı olmadığı için tek alana indirilmedi — ayrıntı
   * `lib/account-email.ts` başında.
   */
  authEmail?: string;
  /**
   * Adresin sahipliği KANITLANDI mı? Doğrulanmamış adres asla kurtarma yolu
   * değildir ve adres her değiştiğinde bu bayrak sıfırlanır.
   */
  authEmailVerified?: boolean;
  /**
   * ANMA bildirimleri (madde 48) — hatırlatmalardan AYRI onay.
   *
   * Doğum günü hatırlatmasıyla vefat anması aynı şey değil: biri kutlama,
   * öbürü yas. Kullanıcı birini isteyip öbürünü istemeyebilir ve bunu tek
   * onaya bağlamak, yas gününü hatırlatan bir postayı istememiş birine
   * göndermek demekti.
   */
  notifyMemorials?: boolean;
  /** Aylık aile bülteni (madde 47) — ayrı onay; farklı içerik, farklı sıklık. */
  notifyNewsletter?: boolean;
  /** Bekleyen doğrulamanın jeton ÖZETİ (ham jeton yalnız bağlantıda). */
  emailTokenHash?: string;
  /** Bekleyen doğrulamanın son kullanma anı (ISO). */
  emailTokenExpires?: string;
  /**
   * Bekleyen ŞİFRE SIFIRLAMA jetonunun özeti (madde 51).
   *
   * `emailTokenHash`ten AYRI ve bu ayrım güvenlik gereği: o alan bir ADRESİ
   * doğruluyor, bu alan HESABIN KENDİSİNİ veriyor. Tek alanda toplansaydı,
   * adres doğrulama postasını ele geçiren biri şifreyi de değiştirebilirdi.
   * Ömrü de kısa (1 saat, `lib/password-reset.ts`) — yetkisi büyük olanın
   * penceresi dar olmalı.
   */
  resetTokenHash?: string;
  /** Bekleyen sıfırlamanın son kullanma anı (ISO). */
  resetTokenExpires?: string;
  /**
   * HESAP YUMUŞAK SİLİNDİ — damga varsa hesap bekleme süresindedir
   * (`lib/retention.ts`, `GRACE_DAYS`).
   *
   * Damga duruyorken: giriş YAPILAMAZ (`lib/credentials.ts`), oturum çözülmez
   * (`lib/tree-context.ts`), hatırlatma postası gitmez — ama veri durur ve
   * şifreyle geri alınabilir. Süre dolunca zamanlanmış iş her şeyi siler.
   */
  deletedAt?: string;
}

export interface UsersData {
  users: User[];
}

/**
 * Ağaç erişim rolleri — İKİ KADEME (madde 35, ikinci tur).
 *
 *  - yonetici: ağacı KURAN hesap. Her şeyi doğrudan yapar, önerilere karar
 *              verir, üyeleri yönetir, ağacı siler.
 *  - uye     : okur ve ÖNERİR. Hiçbir değişikliği doğrudan geçmez.
 *
 * ## Neden dört kademe ikiye indi
 *
 * Önceki dizilim `viewer < contributor < editor < admin` idi ve dört kademe
 * üç farklı soruya cevap veriyormuş gibi duruyordu: "okuyabilir mi",
 * "ekleyebilir mi", "değiştirebilir mi", "üye yönetir mi". Ama ürün sahibinin
 * kararıyla YÖNETİCİ OLMAYAN HERKESİN her değişikliği onaya gidiyor — o anda
 * `editor` ile `viewer` arasındaki fark ortadan kalktı: ikisi de okuyor,
 * ikisi de öneriyor, hiçbiri doğrudan yazmıyor. Aradaki kademeler ayrı
 * ADLARDI ama ayrı YETKİLER değildi.
 *
 * ## Eski değerler
 *
 * Depoda ve Postgres'te hâlâ eski dizeler duruyor. `normalizeRole` onları
 * okurken çeviriyor; kayıtlar bir sonraki yazmada kendiliğinden güncelleniyor
 * — göç betiği YOK, çünkü çeviri kayıpsız ve tek yönlü.
 *
 * `admin` → `yonetici`. Bu bilinçli bir GÜVENLİ yön tercihi: eski bir
 * yöneticiyi üyeye indirmek, ona haber vermeden yetkisini almak olurdu.
 * Geri kalan her şey (`editor`, `contributor`, `viewer`) → `uye`; hiçbiri
 * yetki KAZANMIYOR.
 */
export type TreeRole = "yonetici" | "uye";

/** Depoda karşılaşılabilecek eski rol adları. */
const ESKI_ROLLER: Record<string, TreeRole> = {
  admin: "yonetici",
  editor: "uye",
  contributor: "uye",
  viewer: "uye",
};

/**
 * Herhangi bir yerden okunan rol değerini bugünkü kademeye çevirir.
 *
 * TANINMAYAN değer `uye` oluyor — en az yetkili kademe. Bozuk ya da
 * gelecekten gelen bir değerin yönetici sayılması, tek bir yazım hatasıyla
 * ağacın kontrolünü devretmek olurdu.
 */
export function normalizeRole(raw: unknown): TreeRole {
  if (raw === "yonetici" || raw === "uye") return raw;
  if (typeof raw === "string" && raw in ESKI_ROLLER) return ESKI_ROLLER[raw];
  return "uye";
}

/** Ağaca davetle katılmış üye hesabı (founder dışındaki kişiler). */
export interface Member {
  id: string;
  displayName: string;
  /**
   * Giriş adı — küçük harfe indirilmiş, ağaç içinde benzersiz (madde 36).
   *
   * OPSİYONEL, çünkü bu alandan önce katılmış üyeler var ve onların girişi
   * hâlâ eski yoldan (şifreyle kimlik çözme) çalışmalı. Zorunlu yapmak,
   * var olan her üyeyi kapıda bırakırdı.
   *
   * `displayName` "ekranda ne yazsın", bu alan "kim giriyor" sorusunun
   * yanıtı. İkisi ayrı: görünen ad serbest ve tekrar edebilir.
   */
  username?: string;
  passwordHash: string;
  role: TreeRole;
  joinedAt: string;
}

/** Tek kullanımlık davet. Ham jeton yalnızca bağlantıda; blob'da SHA-256 özeti. */
export interface Invite {
  tokenHash: string;
  role: TreeRole;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  usedAt?: string;
}

/**
 * Herkese açık salt-okunur paylaşım bağlantısı (üyelik gerektirmez).
 * Ağaç sahibi bir bağlantı/kod/QR üretir; bu jetona sahip herkes ağacı
 * yalnızca GÖRÜNTÜLER (düzenleyemez). Jeton `<treeId>.<secret>` biçiminde ham
 * (bearer) saklanır — tahmin edilemez; sahibi istediğinde yenileyip/kapatabilir.
 */
/** Genel bir paylaşım bağlantısına yapılan tek bir ziyaret (anonim; kimlik yok). */
export interface ShareVisit {
  at: string;
  /** Vercel coğrafi başlıklarından (varsa) — ülke kodu / şehir. */
  country?: string;
  city?: string;
  /** Cihaz türü: "mobil" | "masaüstü" | "tablet". */
  device?: string;
}

export interface ShareLink {
  /** Kararlı kimlik (yönetim için). */
  id: string;
  /** Ham bearer jeton: `<treeId>.<secret>`. Bağlantı olarak kullanılır. */
  token: string;
  /** Ağaç adı (paylaşım anında; genel sayfada başlık için). */
  treeName: string;
  /** Yaşayanların özel bilgileri gizlensin mi? (varsayılan: evet). */
  hideLiving: boolean;
  /**
   * Doluysa bağlantı TEK KİŞİYE daralır: `/g/<jeton>` ağacı değil, o kişinin
   * anma sayfasını açar. Mezar taşına basılan QR için — taş herkesin
   * görebileceği bir yerdedir, dolayısıyla jetonu tarayan biri tüm ağacı değil
   * yalnız o kişiyi görmelidir.
   */
  personId?: string;
  createdAt: string;
  /** Kullanıcı etiketi (ör. "WhatsApp grubu"). */
  label?: string;
  /** Sona erme (ISO). null/undefined → süresiz. */
  expiresAt?: string | null;
  /** Toplam görüntülenme sayısı. */
  views?: number;
  /** Son ziyaretler (kim/nereden/ne zaman — anonim; kapalı liste, en yeni önce). */
  visits?: ShareVisit[];
  /**
   * Bu bağlantının AÇTIĞI görünümler (madde 35/G). Alan YOKSA kısıt yok —
   * bağlantı her şeyi açar. Yokluğu "hiçbiri" saymak, bu özellikten önce
   * açılmış her bağlantıyı sessizce boş sayfaya çevirirdi.
   */
  scope?: ShareScope[];
}

/**
 * Hesaplar arası ağaç eşleştirmesi (P1–P4). İki uzak akrabanın AYRI ağaçları
 * karşılıklı ONAYLA bağlanır: birbirini görebilir (P1), kesişimleri bulabilir
 * (P2), dal aşılayabilir (P3) ya da tümüyle birleştirebilir (P4). Eşleştirme
 * KAYIT her iki ağacın erişim blob'unda ayrı ayrı tutulur (çift taraflı onay).
 */
export interface Pairing {
  /** Karşı ağacın kimliği. */
  peerTreeId: string;
  /** Karşı ağacın adı (gösterim). */
  peerName: string;
  createdAt: string;
}

/** Bekleyen eşleştirme daveti — ham jeton `<treeId>.<secret>`, blob'da özet. */
export interface PairInvite {
  tokenHash: string;
  /** Daveti oluşturan ağacın adı (kabul eden taraf peerName için kullanır). */
  inviterName: string;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
}

/** Bir ağacın erişim kaydı — blob `tree-access-<treeId>.json`. */
export interface TreeAccess {
  members: Member[];
  invites: Invite[];
  /** Eski tekil paylaşım (geri uyumluluk; okurken `shares`'e taşınır). */
  share?: ShareLink | null;
  /** Herkese açık salt-okunur paylaşım bağlantıları (çoklu, kalıcı). */
  shares?: ShareLink[];
  /** Onaylı bağlı ağaçlar (hesaplar arası). */
  pairings?: Pairing[];
  /** Bekleyen eşleştirme davetleri. */
  pairInvites?: PairInvite[];
  /**
   * AĞAÇ YUMUŞAK SİLİNDİ (ISO damga) — ağacın KENDİ dosyasındaki kopya.
   *
   * Asıl kayıt hesabın ağaç kaydında (`account-trees-<accountId>.json`), ama
   * paylaşım bağlantısı / davet / RSVP gibi yüzeylerin elinde yalnız bir
   * `treeId` var; sahibin kim olduğunu bilmeden o kayda ulaşamazlar. Damganın
   * ağacın kendi erişim dosyasında da durması, "yalnız treeId bilen" her
   * yüzeyin tek okumayla kapanabilmesi demek.
   *
   * İki damga tek yerden yazılır (`lib/trees.ts` → `softDeleteTree`), yoksa
   * ayrışır ve ağaç yarı gizlenmiş olur — en kötüsü o.
   */
  deletedAt?: string;
}
