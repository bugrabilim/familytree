import { NextRequest, NextResponse } from "next/server";
import type { Person } from "@/types/family";
import { auth } from "@/auth";
import { canManage } from "@/lib/roles";
import { isSupabaseConfigured } from "@/lib/supabase";
import { getFamilyData } from "@/lib/blob";
import { listTrees } from "@/lib/trees";
import {
  dbDeletePeople,
  dbGetPeopleRows,
  dbGetTreeRow,
  dbUpsertPeople,
} from "@/lib/db";
import { driftReport, repairPlan, treeDrift, type TreeDrift } from "@/lib/drift";

export const dynamic = "force-dynamic";

/**
 * BLOB ↔ POSTGRES KAYMA DENETİMİ (Madde 43) — `/api/admin/drift`.
 *
 *  GET  → DENETİM. Hiçbir şey yazmaz. Her ağaç için Blob ile Postgres'i
 *         kayıt kayıt, alan alan karşılaştırır.
 *  POST → ONARIM. Blob'u KAYNAK alarak Postgres'i hizaya getirir; Blob'a
 *         dokunmaz. Hedeflidir (`dbUpsertPeople` / `dbDeletePeople`) — göç
 *         rotasının "önce hepsini sil, sonra hepsini yaz" davranışından
 *         farklı olarak yalnız kaymış kayıtları eller.
 *
 * `/api/admin/migrate` GET'teki `inSync` ölçüsü SAYI karşılaştırmasıydı ve
 * sessiz ayrışmayı göremiyordu (bkz. `lib/drift.ts` başlığı). Bu uç onun
 * yerine geçmiyor, eksiğini kapatıyor: göç "veriyi oraya taşıdı mı",
 * denetim "hâlâ aynı mı" sorusunun yanıtı.
 *
 * Kapsam giriş yapan founder'ın ağaçlarıyla sınırlı — `listTrees` başkasının
 * ağacını döndürmez, dolayısıyla bu uç başka bir hesabın verisine bakamaz.
 */

async function guard() {
  const session = await auth();
  if (!session?.user?.id)
    return { error: NextResponse.json({ error: "Yetkisiz" }, { status: 401 }) };
  if (!(session.user.isFounder ?? true))
    return { error: NextResponse.json({ error: "Yalnız ağaç sahibi denetleyebilir." }, { status: 403 }) };
  if (!canManage(session.user.role))
    return { error: NextResponse.json({ error: "Yönetici olmalısınız." }, { status: 403 }) };
  if (!isSupabaseConfigured())
    return { error: NextResponse.json({ error: "Supabase yapılandırılmamış." }, { status: 503 }) };
  return {
    accountId: session.user.id,
    homeName: session.user.treeName ?? session.user.name ?? "Ağaç",
  };
}

/**
 * Tek bir ağacın denetimi.
 *
 * `max` ayrıntı listesinin sınırı; onarım için sınırsız çağrılır ki plan
 * kırpılmış bir listeden çıkarılıp sessizce yarım kalmasın (`repairPlan`ın
 * `partial` bayrağı bu tuzağın kilidi).
 */
async function denetle(
  t: { treeId: string; name: string },
  max: number
): Promise<{ drift: TreeDrift; blobPeople: Person[] }> {
  const blob = await getFamilyData(t.treeId, { skipCache: true });
  const row = await dbGetTreeRow(t.treeId);
  const rows = row ? await dbGetPeopleRows(t.treeId) : [];
  const drift = treeDrift(
    {
      treeId: t.treeId,
      name: t.name,
      inDb: !!row,
      blobPeople: blob.people,
      dbPeople: rows.map((r) => r.data).filter(Boolean),
      rows,
      dbName: row?.name,
    },
    { max }
  );
  return { drift, blobPeople: blob.people };
}

export async function GET(req: NextRequest) {
  const g = await guard();
  if ("error" in g) return g.error;

  // Varsayılan kısa; `?full=1` ile tam liste (büyük ağaçta yanıt şişebilir).
  const max = req.nextUrl.searchParams.get("full") === "1" ? Number.MAX_SAFE_INTEGER : 100;
  const trees = await listTrees(g.accountId, g.homeName);
  const out: Array<TreeDrift & { error?: string }> = [];
  for (const t of trees) {
    try {
      out.push((await denetle(t, max)).drift);
    } catch (e) {
      /*
       * Bir ağacın okunamaması TEMİZ demek değil: hata da bir sonuçtur ve
       * `clean: false` ile döner. Sessizce atlanırsa rapor "hepsi tamam"
       * derdi — denetimin verebileceği en kötü yanıt.
       */
      out.push({
        treeId: t.treeId, name: t.name, inDb: false,
        blobPeople: 0, dbPeople: 0, countsEqual: false,
        people: { missing: 0, extra: 0, changed: 0, same: 0, items: [], truncated: 0 },
        duplicateIds: [], columns: [], meta: [], clean: false,
        error: (e as Error).message,
      });
    }
  }

  const report = driftReport(out, new Date().toISOString());
  return NextResponse.json({
    ...report,
    note: report.clean
      ? "İki kaynak ayrışmamış."
      : "Ayrışma var. Onarım için aynı uca POST atın (Blob kaynak alınır).",
  });
}

/** ONARIM — Blob kaynak, Postgres hizaya getirilir. */
export async function POST() {
  const g = await guard();
  if ("error" in g) return g.error;

  const trees = await listTrees(g.accountId, g.homeName);
  const summary: Array<Record<string, unknown>> = [];

  for (const t of trees) {
    try {
      // Sınırsız: onarım planı kırpılmış listeden çıkarılırsa yarım kalır.
      const { drift: d, blobPeople } = await denetle(t, Number.MAX_SAFE_INTEGER);
      if (!d.inDb) {
        /*
         * Hiç göç etmemiş ağacı burada kurmuyoruz. Ağaç satırı, sahiplik ve
         * üye/davet aynası göçün işi (`/api/admin/migrate`); bu uç yalnız
         * KAYMAYI onarır. İkisini karıştırmak, denetimin sessizce göç
         * başlatması demek olurdu.
         */
        summary.push({ tree: t.name, treeId: t.treeId, skipped: "Postgres'te yok — önce göç edin." });
        continue;
      }
      const plan = repairPlan(d);
      /*
       * Çift id'li Blob kayıtları tekilleştirilir (son kayıt kazanır — hangi
       * kaydın DB'ye gittiğiyle aynı kural). Aynı anahtarı tek `upsert`te iki
       * kez göndermek Postgres'te doğrudan hata: "ON CONFLICT DO UPDATE
       * command cannot affect row a second time".
       */
      const istenen = new Set(plan.upsert);
      const teklestir = new Map<string, Person>();
      for (const p of blobPeople) if (istenen.has(p.id)) teklestir.set(p.id, p);
      const yazildi = await dbUpsertPeople(t.treeId, [...teklestir.values()]);
      const silindi = await dbDeletePeople(t.treeId, plan.delete);

      // Onarımdan SONRA yeniden denetle — "yaptım" demek yetmez, gösterilir.
      const { drift: sonra } = await denetle(t, 20);
      summary.push({
        tree: t.name, treeId: t.treeId,
        upserted: yazildi, deleted: silindi,
        clean: sonra.clean,
        remaining: sonra.clean ? 0 : sonra.people.missing + sonra.people.extra + sonra.people.changed,
      });
    } catch (e) {
      summary.push({ tree: t.name, treeId: t.treeId, clean: false, error: (e as Error).message });
    }
  }

  const ok = summary.every((s) => s.clean === true || s.skipped !== undefined);
  return NextResponse.json(
    { repairedAt: new Date().toISOString(), ok, trees: summary },
    { status: ok ? 200 : 207 }
  );
}
