import { put, list, get } from "@vercel/blob";
import { createHash, randomBytes } from "crypto";
import { compare } from "bcryptjs";
import type { Invite, Member, TreeAccess, TreeRole } from "@/types/user";
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
    return { members: data.members ?? [], invites: data.invites ?? [] };
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
