import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canManage } from "@/lib/roles";
import { isSupabaseConfigured } from "@/lib/supabase";
import { getFamilyData } from "@/lib/blob";
import { getTreeAccess } from "@/lib/members";
import { listTrees } from "@/lib/trees";
import { findUserByFamilyName } from "@/lib/users";
import {
  dbCountPeople,
  dbReplaceInvites,
  dbReplaceMembers,
  dbReplacePeople,
  dbUpsertAccount,
  dbUpsertTree,
} from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Blob → Postgres tek-seferlik veri göçü (Faz 2).
 *
 *  GET  → KURU ÇALIŞMA (dry-run): hiçbir şey yazmaz; her ağaç için Blob'daki
 *         kişi/üye/davet sayısını ve Supabase'in hazır olup olmadığını gösterir.
 *         Tarayıcıdan güvenle açılabilir.
 *  POST → GERÇEK göç: Blob'daki veriyi Postgres'e kopyalar (idempotent — her
 *         ağaç için önce temizleyip yeniden yazar). Blob'a DOKUNMAZ; kaynak
 *         doğruluğu hâlâ Blob'da. Yalnız founder + admin.
 *
 * Kapsam: giriş yapan founder'ın ağaçları (ana ağaç + sahip oldukları).
 */

async function guard() {
  const session = await auth();
  if (!session?.user?.id)
    return { error: NextResponse.json({ error: "Yetkisiz" }, { status: 401 }) };
  if (!(session.user.isFounder ?? true))
    return { error: NextResponse.json({ error: "Yalnız ağaç sahibi göç yapabilir." }, { status: 403 }) };
  if (!canManage(session.user.role))
    return { error: NextResponse.json({ error: "Yönetici olmalısınız." }, { status: 403 }) };
  if (!isSupabaseConfigured())
    return { error: NextResponse.json({ error: "Supabase yapılandırılmamış." }, { status: 503 }) };
  return {
    accountId: session.user.id,
    homeName: session.user.treeName ?? session.user.name ?? "Ağaç",
  };
}

/** KURU ÇALIŞMA — yalnız Blob'dan sayım, yazma yok. */
export async function GET() {
  const g = await guard();
  if ("error" in g) return g.error;

  const trees = await listTrees(g.accountId, g.homeName);
  const preview = [];
  for (const t of trees) {
    const fam = await getFamilyData(t.treeId, { skipCache: true });
    const access = await getTreeAccess(t.treeId);
    // Postgres'teki güncel kişi sayısı — çift-yazma tutarlılığını gözle teyit
    // etmek için Blob sayısıyla yan yana gösterilir.
    let postgresPeople: number | null = null;
    try {
      postgresPeople = await dbCountPeople(t.treeId);
    } catch {
      postgresPeople = null;
    }
    preview.push({
      tree: t.name,
      treeId: t.treeId,
      home: t.home,
      people: fam.people.length,
      postgresPeople,
      inSync: postgresPeople === fam.people.length,
      members: access.members.length,
      invites: access.invites.length,
    });
  }
  return NextResponse.json({
    dryRun: true,
    account: g.accountId,
    note: "Bu bir önizlemedir; hiçbir şey yazılmadı. 'Kişi' Blob'daki, 'Postgres' ise DB'deki sayıdır; çift-yazma çalışıyorsa eşit olmalılar.",
    trees: preview,
  });
}

/** GERÇEK GÖÇ — Blob → Postgres. */
export async function POST() {
  const g = await guard();
  if ("error" in g) return g.error;

  // Founder hesabını da Postgres aynasına taşı (giriş verisi).
  let account: string | boolean = false;
  try {
    const me = await findUserByFamilyName(g.homeName);
    if (me) {
      await dbUpsertAccount(me);
      account = true;
    }
  } catch (e) {
    account = `hata: ${(e as Error).message}`;
  }

  const trees = await listTrees(g.accountId, g.homeName);
  const summary: Array<Record<string, unknown>> = [];

  for (const t of trees) {
    try {
      await dbUpsertTree({
        treeId: t.treeId,
        ownerAccount: g.accountId,
        name: t.name,
        isHome: t.home,
        createdAt: t.createdAt || undefined,
      });
      const fam = await getFamilyData(t.treeId, { skipCache: true });
      const people = await dbReplacePeople(t.treeId, fam.people);
      const access = await getTreeAccess(t.treeId);
      const members = await dbReplaceMembers(t.treeId, access.members);
      const invites = await dbReplaceInvites(t.treeId, access.invites);
      const verified = await dbCountPeople(t.treeId);
      summary.push({
        tree: t.name,
        treeId: t.treeId,
        home: t.home,
        people,
        members,
        invites,
        verifiedPeople: verified,
        ok: people === verified,
      });
    } catch (e) {
      summary.push({ tree: t.name, treeId: t.treeId, ok: false, error: (e as Error).message });
    }
  }

  const ok = summary.every((s) => s.ok);
  return NextResponse.json(
    { migratedAt: new Date().toISOString(), account: g.accountId, accountMirrored: account, ok, trees: summary },
    { status: ok ? 200 : 207 }
  );
}
