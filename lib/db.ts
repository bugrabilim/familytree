import "server-only";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import type { FamilyData, Person } from "@/types/family";
import type { Invite, Member, User } from "@/types/user";

/**
 * Postgres (Supabase) veri katmanı — Faz 2.
 *
 * Şimdilik YALNIZ yazma (göç) ve doğrulama içindir; uygulama hâlâ Blob'dan
 * okuyup yazıyor. Okuma yolu ileride (çift-yazma sonrası) buraya çevrilecek.
 * Tüm çağrılar servis-rolü istemcisiyle sunucudan yapılır (RLS atlanır);
 * yetki denetimi çağıran rotalarda.
 */

export interface TreeRow {
  treeId: string;
  ownerAccount: string;
  name: string;
  isHome: boolean;
  createdAt?: string;
}

function personToRow(treeId: string, p: Person) {
  return {
    tree_id: treeId,
    person_id: p.id,
    first_name: p.firstName ?? "",
    last_name: p.lastName ?? "",
    gender: p.gender ?? "unknown",
    birth_date: p.birthDate ?? null,
    death_date: p.deathDate ?? null,
    sibling_order: p.siblingOrder ?? null,
    data: p, // tam Person nesnesi (kayıpsız)
    updated_at: new Date().toISOString(),
  };
}

/** Ağaç satırını ekle/güncelle (id çakışmasında günceller). */
export async function dbUpsertTree(t: TreeRow): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("trees")
    .upsert(
      {
        id: t.treeId,
        owner_account: t.ownerAccount,
        name: t.name,
        is_home: t.isHome,
        ...(t.createdAt ? { created_at: t.createdAt } : {}),
      },
      { onConflict: "id" }
    );
  if (error) throw new Error(`trees upsert: ${error.message}`);
}

/** Ağacın kişilerini Postgres'e tam kopyala (önce temizle, sonra ekle). İdempotent. */
export async function dbReplacePeople(treeId: string, people: Person[]): Promise<number> {
  const sb = supabaseAdmin();
  const del = await sb.from("people").delete().eq("tree_id", treeId);
  if (del.error) throw new Error(`people delete: ${del.error.message}`);
  if (people.length === 0) return 0;
  const rows = people.map((p) => personToRow(treeId, p));
  // Büyük ağaçlarda tek istek şişmesin diye parça parça ekle.
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await sb.from("people").insert(rows.slice(i, i + CHUNK));
    if (error) throw new Error(`people insert: ${error.message}`);
  }
  return people.length;
}

/** Yalnız verilen kişileri ekle/güncelle (hedefli — tam yenileme yerine). */
export async function dbUpsertPeople(treeId: string, people: Person[]): Promise<number> {
  if (people.length === 0) return 0;
  const rows = people.map((p) => personToRow(treeId, p));
  const { error } = await supabaseAdmin()
    .from("people")
    .upsert(rows, { onConflict: "tree_id,person_id" });
  if (error) throw new Error(`people upsert: ${error.message}`);
  return people.length;
}

/** Verilen kişi kimliklerini sil (hedefli). */
export async function dbDeletePeople(treeId: string, personIds: string[]): Promise<number> {
  if (personIds.length === 0) return 0;
  const { error } = await supabaseAdmin()
    .from("people")
    .delete()
    .eq("tree_id", treeId)
    .in("person_id", personIds);
  if (error) throw new Error(`people delete (targeted): ${error.message}`);
  return personIds.length;
}

/** Ağacın üyelerini Postgres'e tam kopyala. İdempotent. */
export async function dbReplaceMembers(treeId: string, members: Member[]): Promise<number> {
  const sb = supabaseAdmin();
  const del = await sb.from("tree_members").delete().eq("tree_id", treeId);
  if (del.error) throw new Error(`members delete: ${del.error.message}`);
  if (members.length === 0) return 0;
  const rows = members.map((m) => ({
    id: m.id,
    tree_id: treeId,
    display_name: m.displayName,
    password_hash: m.passwordHash,
    role: m.role,
    joined_at: m.joinedAt,
  }));
  const { error } = await sb.from("tree_members").insert(rows);
  if (error) throw new Error(`members insert: ${error.message}`);
  return members.length;
}

/** Ağacın davetlerini Postgres'e tam kopyala. İdempotent. */
export async function dbReplaceInvites(treeId: string, invites: Invite[]): Promise<number> {
  const sb = supabaseAdmin();
  const del = await sb.from("tree_invites").delete().eq("tree_id", treeId);
  if (del.error) throw new Error(`invites delete: ${del.error.message}`);
  if (invites.length === 0) return 0;
  const rows = invites.map((iv) => ({
    tree_id: treeId,
    token_hash: iv.tokenHash,
    role: iv.role,
    created_by: iv.createdBy,
    created_at: iv.createdAt,
    expires_at: iv.expiresAt,
    used_at: iv.usedAt ?? null,
  }));
  const { error } = await sb.from("tree_invites").insert(rows);
  if (error) throw new Error(`invites insert: ${error.message}`);
  return invites.length;
}

/** Ağaç adını güncelle (çift-yazma). */
export async function dbRenameTree(treeId: string, name: string): Promise<void> {
  const { error } = await supabaseAdmin().from("trees").update({ name }).eq("id", treeId);
  if (error) throw new Error(`trees rename: ${error.message}`);
}

/** Ağacı sil (çift-yazma). people/members/invites FK cascade ile silinir. */
export async function dbDeleteTree(treeId: string): Promise<void> {
  const { error } = await supabaseAdmin().from("trees").delete().eq("id", treeId);
  if (error) throw new Error(`trees delete: ${error.message}`);
}

/**
 * Ağacın verisini Postgres'ten oku (Faz 2d — okuma yolu).
 *
 * Ağaç Postgres'te YOKSA `null` döner → çağıran Blob'a düşer (henüz göç
 * edilmemiş ağaçlar için güvenli yedek). Kişiler `data` (JSONB) sütunundan
 * kayıpsız geri kurulur; `updatedAt` sürüm jetonu, satırların en yeni
 * `updated_at` değeridir (iyimser kilitleme bununla tutarlı çalışır).
 */
export async function dbGetFamilyData(treeId: string): Promise<FamilyData | null> {
  const sb = supabaseAdmin();
  const tree = await sb.from("trees").select("id").eq("id", treeId).maybeSingle();
  if (tree.error) throw new Error(`tree get: ${tree.error.message}`);
  if (!tree.data) return null; // Postgres'te yok → Blob'a düş

  const { data, error } = await sb.from("people").select("data, updated_at").eq("tree_id", treeId);
  if (error) throw new Error(`people get: ${error.message}`);
  const rows = (data ?? []) as Array<{ data: Person; updated_at: string }>;
  let updatedAt = "";
  for (const r of rows) if (r.updated_at > updatedAt) updatedAt = r.updated_at;
  return { people: rows.map((r) => r.data), updatedAt };
}

/**
 * Tanıtım (landing) sosyal-kanıt taban değerleri (Madde 9). Gerçek sayaç bunun
 * ALTINDA kalırsa taban gösterilir; üstüne çıkarsa gerçek sayı gösterilir —
 * böylece şerit hiçbir zaman bu değerlerden düşük görünmez.
 */
const SOCIAL_BASELINE = { trees: 108, people: 16782 };

/**
 * Platform geneli sayaçlar — "X aile ağacı oluşturuldu · X kişi eklendi".
 * Supabase yapılandırılmamış / sorgu başarısızsa taban değerler döner (şerit
 * her zaman gösterilir). `head:true` + `count:exact` yalnız sayıyı çeker.
 */
export async function getPlatformStats(): Promise<{ trees: number; people: number }> {
  if (!isSupabaseConfigured()) return SOCIAL_BASELINE;
  try {
    const sb = supabaseAdmin();
    const [tt, pp] = await Promise.all([
      sb.from("trees").select("*", { count: "exact", head: true }),
      sb.from("people").select("*", { count: "exact", head: true }),
    ]);
    if (tt.error || pp.error) return SOCIAL_BASELINE;
    return {
      trees: Math.max(SOCIAL_BASELINE.trees, tt.count ?? 0),
      people: Math.max(SOCIAL_BASELINE.people, pp.count ?? 0),
    };
  } catch {
    return SOCIAL_BASELINE;
  }
}

/* ── Hesaplar (founder) — Faz 3, şimdilik yalnız çift-yazma aynası ─────────── */

/** Founder hesabını ekle/güncelle (çift-yazma). */
export async function dbUpsertAccount(u: User): Promise<void> {
  const { error } = await supabaseAdmin().from("accounts").upsert(
    {
      id: u.id,
      family_name: u.familyName,
      password_hash: u.passwordHash,
      recovery_code_hash: u.recoveryCodeHash ?? "",
      created_at: u.createdAt,
    },
    { onConflict: "id" }
  );
  if (error) throw new Error(`accounts upsert: ${error.message}`);
}

/** Founder şifresini güncelle (çift-yazma). Büyük/küçük harf duyarsız eşleşme. */
export async function dbUpdateAccountPassword(familyName: string, passwordHash: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("accounts")
    .update({ password_hash: passwordHash })
    .ilike("family_name", familyName);
  if (error) throw new Error(`accounts password update: ${error.message}`);
}

/** Doğrulama: Postgres'te bu ağaç için kaç kişi var? */
export async function dbCountPeople(treeId: string): Promise<number> {
  const { count, error } = await supabaseAdmin()
    .from("people")
    .select("person_id", { count: "exact", head: true })
    .eq("tree_id", treeId);
  if (error) throw new Error(`people count: ${error.message}`);
  return count ?? 0;
}
