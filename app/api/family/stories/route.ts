import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getFamilyData, saveFamilyData, versionMismatch } from "@/lib/blob";
import { resolveActiveTree } from "@/lib/tree-context";
import { canEdit } from "@/lib/roles";
import { applyApproval } from "@/lib/contribution";
import {
  closeRequest,
  createRequest,
  decideContribution,
  deleteContribution,
  readStories,
} from "@/lib/story-store";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

/**
 * HİKÂYE TALEPLERİ — ağaç sahibinin tarafı (madde 49/50).
 *
 * ## Onay KİMDE
 *
 * Ağaç sahibinde — platformda değil. Her aile kendi ağacına gireni kendi
 * onaylar. Merkezî bir onay, on binlerce ailenin hikâyesini tek bir darboğaza
 * ve tek bir yabancının okumasına bağlamak olurdu.
 *
 * ## Onaylanan katkı kişinin kaydına BURADA yazılıyor
 *
 * Kuyruk kendi blobunda, kişiler başka blobda. `lib/story-store.ts` kayda
 * yazmıyor; iki deponun birbirini tanımaması, kuyruğun kişi verisine
 * dokunabildiği bir yol bırakmamak için.
 */

const forbidden = () =>
  NextResponse.json({ error: "Bu işlem için düzenleme yetkiniz yok." }, { status: 403 });

const conflict = () =>
  NextResponse.json(
    { error: "Ağaç bu sırada başka bir yerde değişti. Sayfayı yenileyip tekrar deneyin." },
    { status: 409 }
  );

async function guard() {
  const ctx = await resolveActiveTree();
  if (!ctx.ok) return { error: NextResponse.json({ error: "Yetkisiz" }, { status: ctx.status }) };
  if (!canEdit(ctx.role)) return { error: forbidden() };
  return { ctx };
}

/** Talepler + onay kuyruğu, kişi adlarıyla birlikte. */
export async function GET() {
  const g = await guard();
  if ("error" in g) return g.error;
  const box = await readStories(g.ctx.treeId);
  const { people } = await getFamilyData(g.ctx.treeId);
  const ad = new Map(people.map((p) => [p.id, `${p.firstName} ${p.lastName}`.trim()]));
  return NextResponse.json({
    requests: box.requests.map((r) => ({ ...r, tokenHash: undefined, subject: ad.get(r.personId) ?? "?" })),
    contributions: box.contributions.map((c) => ({ ...c, subject: ad.get(c.personId) ?? "?" })),
  });
}

/** Yeni talep. Ham jeton YALNIZ burada, bir kez dönüyor. */
export async function POST(req: NextRequest) {
  const g = await guard();
  if ("error" in g) return g.error;

  let body: { personId?: unknown; question?: unknown; sentTo?: unknown; days?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  }

  /*
   * GİZLİ KAYIT hakkında talep AÇILAMAZ. Talep, o kişinin adını taşıyan
   * girişsiz bir sayfa demek; `confidential` işareti "bu kayıt hiçbir yerde
   * görünmesin" demek. İkisi aynı anda doğru olamaz.
   */
  const { people } = await getFamilyData(g.ctx.treeId);
  const kisi = people.find((p) => p.id === body.personId);
  if (!kisi) return NextResponse.json({ error: "Kişi bulunamadı." }, { status: 404 });
  if (kisi.confidential)
    return NextResponse.json(
      { error: "Gizli işaretli kayıt için dışarıya soru gönderilemez." },
      { status: 403 }
    );

  const r = await createRequest(g.ctx.treeId, body);
  if ("error" in r)
    return NextResponse.json(
      {
        error:
          r.error === "dolu"
            ? "Açık talep sayısı doldu. Önce birkaçını kapat."
            : "Soru ve kişi gerekli.",
      },
      { status: r.error === "dolu" ? 409 : 400 }
    );

  return NextResponse.json({
    request: { ...r.request, tokenHash: undefined },
    /*
     * Bağlantı bir kez gösteriliyor: depoda yalnız özet duruyor ve yeniden
     * üretilemez. Kaybeden yeni bir talep açar — özeti saklamanın bedeli bu.
     */
    link: `${SITE_URL}/hikaye/${g.ctx.treeId}?token=${r.token}`,
  });
}

/** Karar: onayla / reddet. Onayda katkı kişinin `memories`ine giriyor. */
export async function PATCH(req: NextRequest) {
  const g = await guard();
  if ("error" in g) return g.error;

  let body: { id?: unknown; karar?: unknown; requestId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  }

  // Talebi kapatma da bu yöntemde: yazma değil, bir bayrak.
  if (typeof body.requestId === "string") {
    const ok = await closeRequest(g.ctx.treeId, body.requestId);
    return ok
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: "Talep bulunamadı." }, { status: 404 });
  }

  const id = typeof body.id === "string" ? body.id : "";
  const karar = body.karar === "onayla" ? "onayla" : body.karar === "reddet" ? "reddet" : null;
  if (!id || !karar) return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });

  const data = await getFamilyData(g.ctx.treeId, { skipCache: true });
  /*
   * İyimser kilit KARARDAN ÖNCE. Sonra olsaydı, çakışma yüzünden reddedilen
   * bir istekte katkı kuyrukta "onaylandı" işaretlenmiş ama kişinin kaydına
   * hiç yazılmamış olurdu — ve bir daha uygulanamazdı, çünkü `applyApproval`
   * yalnız "bekliyor" durumunu kabul ediyor. Hikâye sessizce kaybolurdu.
   */
  if (versionMismatch(req, data.updatedAt)) return conflict();

  const c = await decideContribution(g.ctx.treeId, id, karar);
  if (!c) return NextResponse.json({ error: "Katkı bulunamadı." }, { status: 404 });
  if (karar === "reddet") return NextResponse.json({ ok: true });

  const i = data.people.findIndex((p) => p.id === c.personId);
  if (i === -1) return NextResponse.json({ error: "Kişi bulunamadı." }, { status: 404 });
  const yeni = applyApproval(data.people[i], c, randomUUID());
  if (!yeni) return NextResponse.json({ error: "Katkı uygulanamadı." }, { status: 409 });

  data.people[i] = yeni;
  await saveFamilyData(g.ctx.treeId, data, { by: g.ctx.authorId });
  return NextResponse.json({ ok: true });
}

/** Kuyruk temizliği — işlenmiş katkıyı listeden kaldırır. */
export async function DELETE(req: NextRequest) {
  const g = await guard();
  if ("error" in g) return g.error;
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  const ok = await deleteContribution(g.ctx.treeId, id);
  return ok
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: "Katkı bulunamadı." }, { status: 404 });
}
