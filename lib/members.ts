import { put, list, get } from "@vercel/blob";
import { createHash, randomBytes } from "crypto";
import { compare } from "bcryptjs";
import type { Invite, Member, Pairing, PairInvite, ShareLink, TreeAccess, TreeRole } from "@/types/user";
import { dbReplaceInvites, dbReplaceMembers } from "@/lib/db";

/**
 * Ağaç erişim (üye + davet) deposu — Madde 13.
 *
 * Her ağaç için ayrı blob: `tree-access-<treeId>.json`. treeId, ağacı kuran
 * (founder) hesabın kimliğidir; founder her zaman admin sayılır ve burada
 * saklanmaz. Yalnız davetle katılan üyeler ve bekleyen davetler tutulur.
 */

function accessPathname(treeId: string) {
  return `tree-access-${treeId}.json`;
}

const empty = (): TreeAccess => ({ members: [], invites: [] });

export async function getTreeAccess(treeId: string): Promise<TreeAccess> {
  try {
    const { blobs } = await list({ prefix: accessPathname(treeId) });
    if (blobs.length === 0) return empty();
    const latest = blobs.sort(
      (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    )[0];
    const result = await get(latest.pathname, { access: "private", useCache: false });
    if (!result || result.statusCode !== 200) return empty();
    const data = (await new Response(result.stream).json()) as TreeAccess;
    return {
      members: data.members ?? [],
      invites: data.invites ?? [],
      share: data.share ?? null,
      pairings: data.pairings ?? [],
      pairInvites: data.pairInvites ?? [],
    };
  } catch {
    return empty();
  }
}

async function saveTreeAccess(treeId: string, data: TreeAccess): Promise<void> {
  await put(accessPathname(treeId), JSON.stringify(data), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
  // Faz 2c — çift-yazma (best-effort): üye/davetleri Postgres'e de yaz.
  // Blob kaynaktır; hata kullanıcının işlemini etkilemez.
  try {
    await dbReplaceMembers(treeId, data.members);
    await dbReplaceInvites(treeId, data.invites);
  } catch (e) {
    console.warn(`[cift-yazma] access→postgres (${treeId}):`, (e as Error).message);
  }
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/**
 * Davet oluştur. Ham jeton `<treeId>.<secret>` biçiminde döner (yalnız
 * bağlantıda görünür); blob'da secret'ın SHA-256 özeti saklanır. Tek kullanım,
 * varsayılan 7 gün geçerli.
 */
export async function createInvite(
  treeId: string,
  role: TreeRole,
  createdBy: string,
  ttlDays = 7
): Promise<{ token: string; invite: Invite }> {
  const secret = randomBytes(24).toString("hex");
  const token = `${treeId}.${secret}`;
  const now = Date.now();
  const invite: Invite = {
    tokenHash: sha256(secret),
    role,
    createdBy,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttlDays * 86400_000).toISOString(),
  };
  const data = await getTreeAccess(treeId);
  data.invites.push(invite);
  await saveTreeAccess(treeId, data);
  return { token, invite };
}

/** Davet bağlantısındaki ham jetondan treeId'yi ayıkla (`<treeId>.<secret>`). */
export function parseInviteToken(token: string): { treeId: string; secret: string } | null {
  const i = token.indexOf(".");
  if (i <= 0 || i === token.length - 1) return null;
  return { treeId: token.slice(0, i), secret: token.slice(i + 1) };
}

/** Geçerli, kullanılmamış, süresi dolmamış daveti döndürür (yoksa null). */
export async function findValidInvite(token: string): Promise<{ treeId: string; invite: Invite } | null> {
  const parsed = parseInviteToken(token);
  if (!parsed) return null;
  const { treeId, secret } = parsed;
  const hash = sha256(secret);
  const data = await getTreeAccess(treeId);
  const invite = data.invites.find((iv) => iv.tokenHash === hash);
  if (!invite || invite.usedAt) return null;
  if (new Date(invite.expiresAt).getTime() < Date.now()) return null;
  return { treeId, invite };
}

/**
 * Daveti kullanıp üye oluştur (atomik: daveti "kullanıldı" işaretler ve üyeyi
 * aynı yazıda ekler). Jeton geçersizse null.
 */
export async function acceptInvite(
  token: string,
  displayName: string,
  passwordHash: string
): Promise<{ treeId: string; member: Member } | null> {
  const parsed = parseInviteToken(token);
  if (!parsed) return null;
  const { treeId, secret } = parsed;
  const hash = sha256(secret);
  const data = await getTreeAccess(treeId);
  const invite = data.invites.find((iv) => iv.tokenHash === hash);
  if (!invite || invite.usedAt) return null;
  if (new Date(invite.expiresAt).getTime() < Date.now()) return null;

  const member: Member = {
    id: crypto.randomUUID(),
    displayName: displayName.trim(),
    passwordHash,
    role: invite.role,
    joinedAt: new Date().toISOString(),
  };
  invite.usedAt = new Date().toISOString();
  data.members.push(member);
  await saveTreeAccess(treeId, data);
  return { treeId, member };
}

/** Giriş için: verilen şifre bir üyenin şifresiyle eşleşiyor mu? */
export async function findMemberByPassword(
  treeId: string,
  password: string
): Promise<Member | null> {
  const { members } = await getTreeAccess(treeId);
  for (const m of members) {
    if (await compare(password, m.passwordHash)) return m;
  }
  return null;
}

export async function removeMember(treeId: string, memberId: string): Promise<void> {
  const data = await getTreeAccess(treeId);
  data.members = data.members.filter((m) => m.id !== memberId);
  await saveTreeAccess(treeId, data);
}

/** Bekleyen (kullanılmamış) bir daveti özet-hash ile iptal et. */
export async function revokeInvite(treeId: string, tokenHash: string): Promise<void> {
  const data = await getTreeAccess(treeId);
  data.invites = data.invites.filter((iv) => iv.tokenHash !== tokenHash);
  await saveTreeAccess(treeId, data);
}

/* ── Herkese açık salt-okunur paylaşım (üyeliksiz görüntüleme) ──────────────── */
/*
 * Çoklu, kalıcı paylaşım bağlantıları (#7): sahip birden çok bağlantı üretebilir;
 * her biri kullanıcı silene kadar sabittir. Her bağlantı ziyaret sayısı ve son
 * ziyaretleri (anonim: ülke/şehir/cihaz/zaman) tutar. İsteğe bağlı süre (#8):
 * `expiresAt` geçmişteyse bağlantı ölür. Eski tekil `share` okurken `shares`'e
 * taşınır (geri uyumluluk).
 */

const MAX_VISITS = 50;

/**
 * Bir ağaçta tutulan en fazla paylaşım bağlantısı. Herkese açık demo gibi ortak
 * hesaplarda ziyaretçiler sürekli bağlantı üretebilir; sınırsız birikim hem
 * kaydı hem de her istekte üretilen QR'lar yüzünden yanıtı yavaşlatır (bağlantı
 * oluştur düğmesi "yanıt vermiyor" görünür). En yeni bağlantılar korunur.
 */
const MAX_SHARES = 50;

/** Erişim kaydındaki paylaşımları döndürür; eski tekil `share`'i diziye taşır. */
function normalizeShares(data: { share?: ShareLink | null; shares?: ShareLink[] }): ShareLink[] {
  const list = Array.isArray(data.shares) ? [...data.shares] : [];
  if (data.share && !list.some((s) => s.token === data.share!.token)) {
    const legacy = data.share;
    list.unshift({ ...legacy, id: legacy.id ?? `legacy-${legacy.token.slice(-8)}` });
  }
  return list;
}

function daysToExpiry(days?: number | null): string | null {
  if (!days || days <= 0 || !Number.isFinite(days)) return null; // süresiz
  return new Date(Date.now() + days * 86400000).toISOString();
}

function isExpired(s: ShareLink): boolean {
  return !!s.expiresAt && new Date(s.expiresAt).getTime() <= Date.now();
}

/** Ağacın tüm paylaşım bağlantıları (en yeni önce). */
export async function listShares(treeId: string): Promise<ShareLink[]> {
  const data = await getTreeAccess(treeId);
  const shares = normalizeShares(data);
  // Eski tekil share'i kalıcı olarak diziye yaz (bir kereye mahsus geçiş).
  if (data.share && !Array.isArray(data.shares)) {
    data.shares = shares;
    data.share = undefined;
    await saveTreeAccess(treeId, data);
  }
  return shares;
}

/** Yeni bir paylaşım bağlantısı oluşturur. */
export async function createShare(
  treeId: string,
  treeName: string,
  opts: { hideLiving: boolean; label?: string; expiresDays?: number | null }
): Promise<ShareLink> {
  const secret = randomBytes(18).toString("base64url");
  const share: ShareLink = {
    id: randomBytes(6).toString("base64url"),
    token: `${treeId}.${secret}`,
    treeName,
    hideLiving: opts.hideLiving,
    createdAt: new Date().toISOString(),
    label: opts.label?.trim() || undefined,
    expiresAt: daysToExpiry(opts.expiresDays),
    views: 0,
    visits: [],
  };
  const data = await getTreeAccess(treeId);
  const shares = normalizeShares(data);
  shares.unshift(share);
  if (shares.length > MAX_SHARES) shares.length = MAX_SHARES;
  data.shares = shares;
  data.share = undefined;
  await saveTreeAccess(treeId, data);
  return share;
}

/** Bir paylaşımın seçeneklerini günceller (jeton değişmez). */
export async function updateShare(
  treeId: string,
  id: string,
  opts: { hideLiving?: boolean; label?: string; expiresDays?: number | null }
): Promise<ShareLink | null> {
  const data = await getTreeAccess(treeId);
  const shares = normalizeShares(data);
  const s = shares.find((x) => x.id === id);
  if (!s) return null;
  if (opts.hideLiving !== undefined) s.hideLiving = opts.hideLiving;
  if (opts.label !== undefined) s.label = opts.label.trim() || undefined;
  if (opts.expiresDays !== undefined) s.expiresAt = daysToExpiry(opts.expiresDays);
  data.shares = shares;
  data.share = undefined;
  await saveTreeAccess(treeId, data);
  return s;
}

/** Bir paylaşım bağlantısını siler (kalıcı). */
export async function deleteShare(treeId: string, id: string): Promise<void> {
  const data = await getTreeAccess(treeId);
  const shares = normalizeShares(data).filter((s) => s.id !== id);
  data.shares = shares;
  data.share = undefined;
  await saveTreeAccess(treeId, data);
}

/** Bir ağacın tüm paylaşım bağlantılarını temizler (ör. demo sıfırlaması). */
export async function resetShares(treeId: string): Promise<void> {
  const data = await getTreeAccess(treeId);
  if ((data.shares?.length ?? 0) === 0 && !data.share) return;
  data.shares = [];
  data.share = undefined;
  await saveTreeAccess(treeId, data);
}

/** Genel görüntüleme için: jeton geçerli, etkin ve süresi dolmamış mı? */
export async function findValidShare(
  token: string
): Promise<{ treeId: string; share: ShareLink } | null> {
  const parsed = parseInviteToken(token);
  if (!parsed) return null;
  const data = await getTreeAccess(parsed.treeId);
  const share = normalizeShares(data).find((s) => s.token === token);
  if (!share || isExpired(share)) return null;
  return { treeId: parsed.treeId, share };
}

/** Bir ziyareti kaydeder (best-effort; anonim). */
export async function recordShareVisit(
  treeId: string,
  id: string,
  visit: { country?: string; city?: string; device?: string }
): Promise<void> {
  try {
    const data = await getTreeAccess(treeId);
    const shares = normalizeShares(data);
    const s = shares.find((x) => x.id === id);
    if (!s) return;
    s.views = (s.views ?? 0) + 1;
    const entry = { at: new Date().toISOString(), ...visit };
    s.visits = [entry, ...(s.visits ?? [])].slice(0, MAX_VISITS);
    data.shares = shares;
    data.share = undefined;
    await saveTreeAccess(treeId, data);
  } catch {
    /* istatistik yazımı görüntülemeyi engellemez */
  }
}

/* ── Hesaplar arası eşleştirme (P1–P4) ─────────────────────────────────────── */

/** Ağacın onaylı bağlı ağaçları. */
export async function listPairings(treeId: string): Promise<Pairing[]> {
  const data = await getTreeAccess(treeId);
  return data.pairings ?? [];
}

/** İki ağaç onaylı bağlı mı? (her iki blob'da da kayıt olması beklenir). */
export async function arePaired(treeId: string, peerTreeId: string): Promise<boolean> {
  const data = await getTreeAccess(treeId);
  return (data.pairings ?? []).some((p) => p.peerTreeId === peerTreeId);
}

/**
 * Eşleştirme daveti oluştur. Ham jeton `<treeId>.<secret>` döner (bağlantıda);
 * blob'da secret'ın özeti + davet edenin adı saklanır. Varsayılan 14 gün.
 */
export async function createPairInvite(
  treeId: string,
  inviterName: string,
  ttlDays = 14
): Promise<string> {
  const secret = randomBytes(24).toString("hex");
  const token = `${treeId}.${secret}`;
  const now = Date.now();
  const invite: PairInvite = {
    tokenHash: sha256(secret),
    inviterName,
    createdBy: treeId,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttlDays * 86400_000).toISOString(),
  };
  const data = await getTreeAccess(treeId);
  data.pairInvites = [...(data.pairInvites ?? []), invite];
  await saveTreeAccess(treeId, data);
  return token;
}

/**
 * Eşleştirme davetini kabul et: her iki ağaca da karşılıklı `Pairing` yazar ve
 * daveti tüketir. Kabul eden taraf `peerTreeId` (kendi ağacı) ve `peerName`'ini
 * verir. Kendi kendine ya da zaten bağlıysa hata döndürür.
 */
export async function acceptPairInvite(
  token: string,
  accepterTreeId: string,
  accepterName: string
): Promise<{ inviterTreeId: string; inviterName: string } | { error: string }> {
  const parsed = parseInviteToken(token);
  if (!parsed) return { error: "Geçersiz davet." };
  const inviterTreeId = parsed.treeId;
  if (inviterTreeId === accepterTreeId) return { error: "Bir ağacı kendisiyle eşleştiremezsiniz." };

  const hash = sha256(parsed.secret);
  const inviterData = await getTreeAccess(inviterTreeId);
  const invite = (inviterData.pairInvites ?? []).find((iv) => iv.tokenHash === hash);
  if (!invite) return { error: "Davet bulunamadı ya da kullanılmış." };
  if (new Date(invite.expiresAt).getTime() < Date.now()) return { error: "Davetin süresi dolmuş." };

  const inviterName = invite.inviterName;

  // Daveti tüket + karşılıklı eşleştirme yaz (iki ayrı blob).
  inviterData.pairInvites = (inviterData.pairInvites ?? []).filter((iv) => iv.tokenHash !== hash);
  if (!(inviterData.pairings ?? []).some((p) => p.peerTreeId === accepterTreeId)) {
    inviterData.pairings = [
      ...(inviterData.pairings ?? []),
      { peerTreeId: accepterTreeId, peerName: accepterName, createdAt: new Date().toISOString() },
    ];
  }
  await saveTreeAccess(inviterTreeId, inviterData);

  const accepterData = await getTreeAccess(accepterTreeId);
  if (!(accepterData.pairings ?? []).some((p) => p.peerTreeId === inviterTreeId)) {
    accepterData.pairings = [
      ...(accepterData.pairings ?? []),
      { peerTreeId: inviterTreeId, peerName: inviterName, createdAt: new Date().toISOString() },
    ];
    await saveTreeAccess(accepterTreeId, accepterData);
  }

  return { inviterTreeId, inviterName };
}

/** Eşleştirmeyi kaldır — her iki taraftan da siler. */
export async function removePairing(treeId: string, peerTreeId: string): Promise<void> {
  const a = await getTreeAccess(treeId);
  a.pairings = (a.pairings ?? []).filter((p) => p.peerTreeId !== peerTreeId);
  await saveTreeAccess(treeId, a);
  const b = await getTreeAccess(peerTreeId);
  b.pairings = (b.pairings ?? []).filter((p) => p.peerTreeId !== treeId);
  await saveTreeAccess(peerTreeId, b);
}
