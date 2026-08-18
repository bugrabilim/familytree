export interface User {
  id: string;
  familyName: string;
  passwordHash: string;
  recoveryCodeHash: string;
  createdAt: string;
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
export interface ShareLink {
  /** Ham bearer jeton: `<treeId>.<secret>`. Bağlantı ve "kod" olarak kullanılır. */
  token: string;
  /** Ağaç adı (paylaşım anında; genel sayfada başlık için). */
  treeName: string;
  /** Yaşayanların özel bilgileri gizlensin mi? (varsayılan: evet). */
  hideLiving: boolean;
  createdAt: string;
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
  /** Herkese açık salt-okunur paylaşım (yoksa/undefined → paylaşım kapalı). */
  share?: ShareLink | null;
  /** Onaylı bağlı ağaçlar (hesaplar arası). */
  pairings?: Pairing[];
  /** Bekleyen eşleştirme davetleri. */
  pairInvites?: PairInvite[];
}
