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

/** Bir ağacın erişim kaydı — blob `tree-access-<treeId>.json`. */
export interface TreeAccess {
  members: Member[];
  invites: Invite[];
}
