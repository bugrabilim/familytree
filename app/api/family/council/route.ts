import { NextRequest, NextResponse } from "next/server";
import { resolveActiveTree } from "@/lib/tree-context";
import { canEdit, canPropose } from "@/lib/roles";
import { versionMismatch } from "@/lib/blob";
import { getTreeAccess } from "@/lib/members";
import {
  addCampaign,
  addDebt,
  addDecision,
  castBallot,
  closeCouncilDecision,
  deleteCampaign,
  deleteDebt,
  deleteDecision,
  deletePledge,
  readCouncil,
  savePledge,
  updateCampaign,
  updateDebt,
  updateDecision,
} from "@/lib/council-store";
import { MAX_CAMPAIGNS, MAX_DEBTS, MAX_DECISIONS, type DebtInput } from "@/lib/council";

export const dynamic = "force-dynamic";

/**
 * AİLE MECLİSİ — aidat defteri, borç-alacak defteri, karar tutanağı.
 *
 * ## Bu uçtan PARA GEÇMEZ
 *
 * Burada ödeme alma, kart saklama, bakiye tutma ya da transfer başlatma
 * YOK — ve olmayacak. Uygulama içinde para hareketi Türkiye'de 6493 sayılı
 * kanun kapsamında ödeme hizmetidir ve ödeme kuruluşu lisansı ister. Bizim
 * tuttuğumuz şey defter: taahhüt, kullanıcının kendi ÖDEME BEYANI, borç
 * kaydı ve karar tutanağı. Paranın kendisi kullanıcının bankasında hareket
 * eder; biz ne görürüz ne saklarız.
 *
 * Bu kural yalnız yorumda değil: `types/council.ts`te bakiye/kart/IBAN alanı
 * yok, `lib/council.ts` serbest metinden IBAN'ı düşürüyor ve
 * `tests/council-gate.test.mts` bu dosyaların hiçbirinde ödeme sağlayıcısı,
 * kart ya da cüzdan kavramı geçmemesini kaynak düzeyinde kilitliyor.
 *
 * ## Yetki — MEVCUT iki kademe, yeni kademe YOK
 *
 *  · okuma        → ağacın her üyesi (defter ailenin ortak kaydı)
 *  · defter yazma → `canEdit` (yönetici). Aidat/borç defterini tutan kişi
 *    ailede tektir; herkesin yazabildiği bir defterde "kim ne yazdı"
 *    tartışması, defterin çözmesi gereken sorunun ta kendisi olurdu. Üye,
 *    ödeme beyanını yöneticiye söyler ve yönetici işler.
 *  · OY VERME     → `canPropose` (yönetici + üye). Yalnız yöneticinin oy
 *    verebildiği bir meclis, meclis değildir; oylama bu özelliğin tek
 *    gerçek çok-kullanıcılı yüzeyi.
 *
 * ## Herkese açık paylaşımda GÖRÜNMEZ
 *
 * Para rakamları ve kim kime borçlu bilgisi hassas. Bu uç oturum istiyor
 * (`resolveActiveTree`), `/g/<jeton>` ve `/embed` sayfaları meclis verisini
 * hiç okumuyor ve `SHARE_SCOPES`ta bir "meclis" kapsamı YOK — yani bir
 * paylaşım bağlantısı bu defteri açamaz. Üçü de kapı testinde.
 */

async function guard(seviye: "oku" | "oyla" | "defter") {
  const ctx = await resolveActiveTree();
  if (!ctx.ok) return { error: NextResponse.json({ error: "Yetkisiz" }, { status: ctx.status }) };
  const yeter =
    seviye === "oku" ? true : seviye === "oyla" ? canPropose(ctx.role) : canEdit(ctx.role);
  if (!yeter)
    return {
      error: NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 }),
    };
  return { treeId: ctx.treeId, authorId: ctx.authorId, isFounder: ctx.isFounder };
}

interface Body {
  kind?: string;
  id?: string;
  campaignId?: string;
  decisionId?: string;
  [k: string]: unknown;
}

async function body(req: NextRequest): Promise<Body> {
  try {
    return (await req.json()) as Body;
  } catch {
    return {};
  }
}

/**
 * İYİMSER KİLİT — meclis defterinin KENDİ damgasına karşı.
 *
 * Ağacın (`family-data`) damgası değil, bu koleksiyonun damgası
 * karşılaştırılıyor: istemci defteri okurken aldığı `updatedAt`i
 * `x-base-version` ile geri gönderiyor. Ağaç damgasını kullansaydık her
 * kişi düzenlemesi defteri kilitler, defter yazması da ağacı — iki farklı
 * dosyanın sürümünü tek jetona bağlamak, ikisini de yanlış anlatırdı.
 *
 * Başlık hiç gelmezse `versionMismatch` `false` döner (eski istemciler
 * çalışmayı sürdürsün); üçüncü parametre demo muafiyetini taşıyor.
 */
async function conflict(req: NextRequest, ctx: { treeId: string }) {
  const kutu = await readCouncil(ctx.treeId);
  if (!versionMismatch(req, kutu.updatedAt, ctx.treeId)) return null;
  return NextResponse.json(
    { error: "Defter siz bakarken değişti. Sayfayı yenileyip tekrar deneyin." },
    { status: 409 }
  );
}

/** Tutanakta görünecek ad. Kurucuda üye kaydı yok; arayüz etiketi gösterir. */
async function oyVerenAdi(treeId: string, authorId: string): Promise<string> {
  try {
    const erisim = await getTreeAccess(treeId);
    return erisim.members.find((m) => m.id === authorId)?.displayName ?? "";
  } catch {
    /*
     * Ad okunamadı: oy YİNE DE kaydediliyor. Adın eksikliği tutanağı
     * eksiltir ama oyun kaydedilmemesi onu bozar — ve `voterId` her
     * durumda yazılıyor, yani kimin oy verdiği kaybolmuyor.
     */
    return "";
  }
}

export async function GET() {
  const g = await guard("oku");
  if ("error" in g) return g.error;
  return NextResponse.json(await readCouncil(g.treeId));
}

export async function POST(req: NextRequest) {
  const input = await body(req);

  /* OY: tek "üye de yapabilir" işlem — ayrı kapıdan geçiyor. */
  if (input.kind === "oy") {
    const g = await guard("oyla");
    if ("error" in g) return g.error;
    const c = await conflict(req, g);
    if (c) return c;
    if (!input.decisionId) return NextResponse.json({ error: "decisionId gerekli" }, { status: 400 });
    const res = await castBallot(g.treeId, input.decisionId, {
      voterId: g.authorId,
      voterName: await oyVerenAdi(g.treeId, g.authorId),
      vote: input.vote,
    });
    if ("error" in res) {
      const mesaj =
        res.error === "kapali"
          ? "Bu karar kapandı; tutanak değiştirilemez."
          : res.error === "yok"
            ? "Karar bulunamadı."
            : res.error === "dolu"
              ? "Bu karara verilebilecek oy sayısı doldu."
              : "Geçersiz oy.";
      return NextResponse.json({ error: mesaj }, { status: res.error === "yok" ? 404 : 400 });
    }
    return NextResponse.json(await readCouncil(g.treeId));
  }

  const g = await guard("defter");
  if ("error" in g) return g.error;
  const c = await conflict(req, g);
  if (c) return c;

  switch (input.kind) {
    case "kampanya": {
      const c2 = await addCampaign(g.treeId, input);
      if (!c2)
        return NextResponse.json(
          { error: `Kampanyanın bir başlığı ve geçerli bir hedefi olmalı (en fazla ${MAX_CAMPAIGNS} kampanya).` },
          { status: 400 }
        );
      break;
    }
    case "taahhut": {
      if (!input.campaignId)
        return NextResponse.json({ error: "campaignId gerekli" }, { status: 400 });
      const r = await savePledge(g.treeId, input.campaignId, input);
      if ("error" in r) {
        const mesaj =
          r.error === "yok"
            ? "Kampanya ya da katkı satırı bulunamadı."
            : r.error === "kapali"
              ? "Kampanya kapalı; yeni katkı yazılamaz."
              : r.error === "dolu"
                ? "Bu kampanyadaki katkı satırı sayısı doldu."
                : "Katkı satırının bir adı ve geçerli tutarı olmalı.";
        return NextResponse.json({ error: mesaj }, { status: r.error === "yok" ? 404 : 400 });
      }
      break;
    }
    case "borc": {
      const d = await addDebt(g.treeId, input as DebtInput);
      if (!d)
        return NextResponse.json(
          { error: `Borç kaydında iki taraf ve sıfırdan büyük bir tutar olmalı (en fazla ${MAX_DEBTS} kayıt).` },
          { status: 400 }
        );
      break;
    }
    case "karar": {
      const d = await addDecision(g.treeId, input);
      if (!d)
        return NextResponse.json(
          { error: `Kararın bir başlığı olmalı (en fazla ${MAX_DECISIONS} karar).` },
          { status: 400 }
        );
      break;
    }
    default:
      return NextResponse.json({ error: "Bilinmeyen kayıt türü" }, { status: 400 });
  }

  return NextResponse.json(await readCouncil(g.treeId));
}

export async function PUT(req: NextRequest) {
  const g = await guard("defter");
  if ("error" in g) return g.error;
  const input = await body(req);
  const c = await conflict(req, g);
  if (c) return c;

  switch (input.kind) {
    case "kampanya": {
      if (!input.id) return NextResponse.json({ error: "id gerekli" }, { status: 400 });
      const r = await updateCampaign(g.treeId, input.id, input);
      if (!r) return NextResponse.json({ error: "Kampanya bulunamadı ya da girdi geçersiz." }, { status: 404 });
      break;
    }
    case "taahhut": {
      if (!input.campaignId || !input.id)
        return NextResponse.json({ error: "campaignId ve id gerekli" }, { status: 400 });
      const r = await savePledge(g.treeId, input.campaignId, input);
      if ("error" in r)
        return NextResponse.json(
          { error: r.error === "kapali" ? "Kampanya kapalı; katkı satırı değiştirilemez." : "Katkı satırı güncellenemedi." },
          { status: r.error === "yok" ? 404 : 400 }
        );
      break;
    }
    case "borc": {
      if (!input.id) return NextResponse.json({ error: "id gerekli" }, { status: 400 });
      const r = await updateDebt(g.treeId, input.id, input as DebtInput);
      if (!r) return NextResponse.json({ error: "Borç kaydı bulunamadı ya da girdi geçersiz." }, { status: 404 });
      break;
    }
    case "karar": {
      if (!input.id) return NextResponse.json({ error: "id gerekli" }, { status: 400 });
      const r = await updateDecision(g.treeId, input.id, input);
      /*
       * KAPALI TUTANAK burada 409 veriyor, 404 değil: "bulunamadı" demek
       * kullanıcıyı yanıltırdı — karar duruyor, yalnız artık dokunulamaz.
       */
      if (!r)
        return NextResponse.json(
          { error: "Karar bulunamadı ya da kapanmış bir tutanak: değiştirilemez." },
          { status: 409 }
        );
      break;
    }
    case "kapat": {
      if (!input.id) return NextResponse.json({ error: "id gerekli" }, { status: 400 });
      const r = await closeCouncilDecision(g.treeId, input.id);
      if (!r)
        return NextResponse.json(
          { error: "Karar bulunamadı ya da zaten kapanmış." },
          { status: 409 }
        );
      break;
    }
    default:
      return NextResponse.json({ error: "Bilinmeyen kayıt türü" }, { status: 400 });
  }

  return NextResponse.json(await readCouncil(g.treeId));
}

export async function DELETE(req: NextRequest) {
  const g = await guard("defter");
  if ("error" in g) return g.error;
  const input = await body(req);
  const c = await conflict(req, g);
  if (c) return c;

  let silindi = false;
  switch (input.kind) {
    case "kampanya":
      if (!input.id) return NextResponse.json({ error: "id gerekli" }, { status: 400 });
      silindi = await deleteCampaign(g.treeId, input.id);
      break;
    case "taahhut":
      if (!input.campaignId || !input.id)
        return NextResponse.json({ error: "campaignId ve id gerekli" }, { status: 400 });
      silindi = await deletePledge(g.treeId, input.campaignId, input.id);
      break;
    case "borc":
      if (!input.id) return NextResponse.json({ error: "id gerekli" }, { status: 400 });
      silindi = await deleteDebt(g.treeId, input.id);
      break;
    case "karar":
      if (!input.id) return NextResponse.json({ error: "id gerekli" }, { status: 400 });
      /* Kapalı tutanak silinemez — depo reddediyor, burada `false` dönüyor. */
      silindi = await deleteDecision(g.treeId, input.id);
      break;
    default:
      return NextResponse.json({ error: "Bilinmeyen kayıt türü" }, { status: 400 });
  }

  if (!silindi)
    return NextResponse.json(
      { error: "Kayıt bulunamadı ya da kapanmış bir tutanak: silinemez." },
      { status: 404 }
    );
  return NextResponse.json(await readCouncil(g.treeId));
}
