import { NextRequest, NextResponse } from "next/server";
import { getFamilyData, saveFamilyData, versionMismatch } from "@/lib/blob";
import { resolveActiveTree } from "@/lib/tree-context";
import { canEdit } from "@/lib/roles";
import { applyApproval, memoryIdFor } from "@/lib/contribution";
import {
  closeRequest,
  closeSeries,
  createRequest,
  createSeries,
  decideContribution,
  deleteContribution,
  findContribution,
  readStories,
} from "@/lib/story-store";
import { SERIES_WEEKS } from "@/lib/story-series";
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
    /*
     * SERİLER — yalnız yürüyenler ve yalnız İLERLEME. `asked` listesinin
     * kendisi (hangi soruların sorulduğu) taşınmıyor: ekranın ihtiyacı
     * "7/26" ve gereksiz her alan bir sızıntı yüzeyi.
     */
    series: box.series
      .filter((s) => !s.closed)
      .map((s) => ({
        id: s.id,
        personId: s.personId,
        subject: ad.get(s.personId) ?? "?",
        sent: s.asked.length,
        total: SERIES_WEEKS,
        expiresAt: s.expiresAt,
      })),
  });
}

/** Yeni talep. Ham jeton YALNIZ burada, bir kez dönüyor. */
export async function POST(req: NextRequest) {
  const g = await guard();
  if ("error" in g) return g.error;

  let body: {
    personId?: unknown;
    question?: unknown;
    sentTo?: unknown;
    days?: unknown;
    /** `"seri"` → tek soru değil, haftalık seri başlat (madde 39). */
    mode?: unknown;
  };
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

  /*
   * İŞARET DEPOYA TAŞINIYOR. Yukarıdaki denetim duruyor (kullanıcıya doğru
   * mesajı burada verebiliyoruz) ama karar artık depoda da veriliyor:
   * `lib/story-store.ts` bu işareti görmeden talep açamıyor. İkinci yazar
   * (haftalık cron) geldiği için tek kopya yetmez.
   */
  const konu = { id: kisi.id, confidential: kisi.confidential };

  /* HAFTALIK SERİ — tek soru değil, kadans (madde 39). */
  if (body.mode === "seri") {
    const s = await createSeries(
      g.ctx.treeId,
      kisi.id,
      konu,
      typeof body.days === "number" ? body.days : undefined
    );
    if ("error" in s) {
      const mesaj =
        s.error === "zaten-var"
          ? "Bu kişi için zaten yürüyen bir seri var."
          : s.error === "dolu"
            ? "Aynı anda yürüyebilecek seri sayısı doldu. Önce birkaçını durdur."
            : s.error === "gizli"
              ? "Gizli işaretli kayıt için dışarıya soru gönderilemez."
              : "Kişi gerekli.";
      return NextResponse.json({ error: mesaj }, { status: s.error === "gecersiz" ? 400 : 409 });
    }
    return NextResponse.json({ series: { id: s.series.id, personId: s.series.personId } });
  }

  const r = await createRequest(g.ctx.treeId, body, konu);
  if ("error" in r)
    return NextResponse.json(
      {
        error:
          r.error === "dolu"
            ? "Açık talep sayısı doldu. Önce birkaçını kapat."
            : r.error === "gizli"
              ? "Gizli işaretli kayıt için dışarıya soru gönderilemez."
              : "Soru ve kişi gerekli.",
      },
      { status: r.error === "dolu" ? 409 : r.error === "gizli" ? 403 : 400 }
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

  let body: { id?: unknown; karar?: unknown; requestId?: unknown; seriesId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  }

  /*
   * Seriyi durdurma. Depo aynı işlemde açık haftalık talebi de kapatıyor —
   * durdurulmuş bir serinin arkasında canlı bir yazma bağlantısı kalmasın.
   */
  if (typeof body.seriesId === "string") {
    const ok = await closeSeries(g.ctx.treeId, body.seriesId);
    return ok
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: "Seri bulunamadı." }, { status: 404 });
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
  if (versionMismatch(req, data.updatedAt, g.ctx.treeId)) return conflict();

  /*
   * RET ağaca dokunmuyor: tek adım, doğrudan damga.
   */
  if (karar === "reddet") {
    const r = await decideContribution(g.ctx.treeId, id, "reddet");
    return r
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: "Katkı bulunamadı." }, { status: 404 });
  }

  /*
   * ONAY: ÖNCE AĞAÇ, SONRA DAMGA.
   *
   * Ters sıradaydı ve dışarıdan gelen bir aile hikâyesini geri
   * getirilemez biçimde kaybediyordu: `decideContribution` durumu
   * "onaylandi" yapıp KAYDEDİYOR, ondan sonra kişi aranıyordu. Kişi arada
   * silinmişse (ya da ağaç yazması düşerse) uç 404/500 dönüyor ama katkı
   * kuyrukta "onaylandı" görünüyor — ve bir daha uygulanamıyor, çünkü
   * `applyApproval` yalnız "bekliyor" durumunu kabul ediyor. Anı hiçbir
   * kayda yazılmamış, kuyrukta da işlenmiş görünüyor.
   *
   * Dosyanın kendi yorumu iyimser kilidin karardan önce olması gerektiğini
   * zaten anlatıyordu — yani tehlike görülmüş ama yalnız YARISI
   * düzeltilmişti. Öneri motoru (`/api/family/proposals`) doğru sırayı
   * uyguluyor; bu uç ondan ayrışmıştı.
   */
  const c = await findContribution(g.ctx.treeId, id);
  if (!c) return NextResponse.json({ error: "Katkı bulunamadı." }, { status: 404 });
  if (c.status !== "bekliyor")
    return NextResponse.json({ error: "Bu katkı zaten karara bağlanmış." }, { status: 409 });

  const i = data.people.findIndex((p) => p.id === c.personId);
  if (i === -1) return NextResponse.json({ error: "Kişi bulunamadı." }, { status: 404 });
  /*
   * Anı kimliği KATKI KİMLİĞİNDEN türetiliyor, rastgele değil: damga adımı
   * düşerse katkı "bekliyor" kalıyor ve tekrar onaylanabiliyor — rastgele
   * kimlikle o tekrar, aynı hikâyeyi ikinci kez eklerdi.
   */
  const yeni = applyApproval(data.people[i], c, memoryIdFor(c));
  if (!yeni) return NextResponse.json({ error: "Katkı uygulanamadı." }, { status: 409 });

  data.people[i] = yeni;
  await saveFamilyData(g.ctx.treeId, data, { by: g.ctx.authorId });

  const damga = await decideContribution(g.ctx.treeId, id, "onayla");
  if (!damga)
    /*
     * Anı AĞACA YAZILDI ama katkı damgalanamadı. "Bulunamadı" demek
     * yanıltıcı olurdu: kullanıcı hiçbir şey olmadığını sanır, oysa hikâye
     * kayda geçti. Katkı "bekliyor" kalıyor ve tekrar onaylandığında
     * yinelenme ÜRETMİYOR (kararlı anı kimliği) — yani durum
     * kurtarılabilir; söylenmesi gereken tek şey ne olduğu.
     */
    return NextResponse.json(
      {
        error: "Hikâye kayda eklendi ama katkı damgası yazılamadı. Kuyruğu tazeleyip tekrar onaylayabilirsin.",
        applied: true,
      },
      { status: 500 }
    );
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
