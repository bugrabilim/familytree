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
 * Ağaç erişim rolleri (Madde 13/35). Founder (ağacı kuran hesap) her zaman
 * "admin" sayılır; üyeler davet bağlantısıyla katılır.
 *  - viewer     : yalnızca okur
 *  - contributor: EKLER, ama var olan kayda dokunamaz — değişiklik ÖNERİR
 *  - editor     : kişi ekler/düzenler/siler
 *  - admin      : buna ek olarak üyeleri ve davetleri yönetir
 *
 * ## `contributor` neden var
 *
 * Aradaki boşluk gerçekti: bir akrabaya "kendi dalını gir" demek için ona
 * `editor` vermek gerekiyordu ve `editor` ağacın TAMAMINI silebiliyor,
 * herkesin kaydını değiştirebiliyor. "Biraz katkı versin" ile "her şeye
 * dokunabilsin" arasında kademe yoktu; sonuç, ya kimseyi davet etmemek ya da
 * herkese tam yetki vermekti.
 *
 * SIRA ANLAMLIDIR. `lib/roles.ts` yetkiyi bu dizilime göre karşılaştırıyor,
 * yani buraya bir kademe sokmak her yetki kapısını yeniden değerlendirmek
 * demek. Varsayılan GÜVENLİ yönde: kapılar `canEdit` (editor ve üstü) ile
 * korunmaya devam ediyor; katkı vericiye açılan uçlar TEK TEK `canContribute`
 * ile işaretlendi. Yani bir kapı unutulursa katkı verici DIŞARIDA kalır,
 * içeride değil.
 */
export type TreeRole = "viewer" | "contributor" | "editor" | "admin";

/** Ağaca davetle katılmış üye hesabı (founder dışındaki kişiler). */
export interface Member {
  id: string;
  displayName: string;
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
