export interface User {
  id: string;
  familyName: string;
  passwordHash: string;
  recoveryCodeHash: string;
  createdAt: string;
  /** Bildirim e-posta adresi (opt-in). Giriş surname+şifre olduğundan e-posta
   *  yalnız hatırlatma/bildirim için, kullanıcının açık onayıyla saklanır. */
  notifyEmail?: string;
  /** Doğum/ölüm/evlilik yıl dönümü e-posta hatırlatmalarını istiyor mu? */
  notifyReminders?: boolean;
}

export interface UsersData {
  users: User[];
}

/**
 * Ağaç erişim rolleri (Madde 13). Founder (ağacı kuran hesap) her zaman
 * "admin" sayılır; üyeler davet bağlantısıyla katılır.
 *  - viewer: yalnızca okur
 *  - editor: kişi ekler/düzenler/siler
 *  - admin : buna ek olarak üyeleri ve davetleri yönetir
 */
export type TreeRole = "viewer" | "editor" | "admin";

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
}
