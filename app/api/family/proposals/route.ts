import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getFamilyData, saveFamilyData, versionMismatch } from "@/lib/blob";
import { resolveActiveTree } from "@/lib/tree-context";
import { canContribute, canEdit } from "@/lib/roles";
import { getUsersData } from "@/lib/users";
import { isEmailConfigured, sendEmail } from "@/lib/email";
import { renderEmail } from "@/lib/email-template";
import { SITE_URL } from "@/lib/site";
import {
  applyProposal, buildChanges, decide, MAX_NOTE, pendingCount, visibleTo,
  type Proposal,
} from "@/lib/proposals";
import { addProposal, findProposal, listProposals, replaceProposal } from "@/lib/proposal-store";

export const dynamic = "force-dynamic";

/**
 * DEĞİŞİKLİK ÖNERİLERİ — madde 35/B.
 *
 *  GET   → kuyruk. Katkı verici YALNIZ kendi önerilerini görür.
 *  POST  → yeni öneri            (katkı verici ve üstü)
 *  PATCH → onayla / reddet       (düzenleyici ve üstü)
 *
 * ## Neden ayrı bir uç
 *
 * Katkı verici kişi ucundan (PUT) geçemiyor — orası `canEdit` istiyor ve
 * istemesi gerekiyor. Öneri, o kapının ETRAFINDAN dolanmak değil, kapıya bir
 * kapı zili takmak: yazma yetkisi hâlâ düzenleyicide, katkı vericinin
 * yaptığı tek şey talebi kaydetmek.
 *
 * ## Onay, kaydı DOĞRUDAN yazmıyor
 *
 * `applyProposal` önce önerinin dayandığı değerin hâlâ yerinde olup
 * olmadığına bakıyor (`lib/proposals.ts`teki bayatlık denetimi). Arada
 * başkası aynı alanı değiştirdiyse onay REDDEDİLİYOR — yoksa eski bir öneri,
 * yeni bilgiyi sessizce ezerdi.
 */

const forbidden = (mesaj = "Bu işlem için yetkiniz yok.") =>
  NextResponse.json({ error: mesaj }, { status: 403 });

/**
 * Kaydı yazan/karar veren kişinin GÖRÜNEN adı.
 *
 * `resolveActiveTree` kimliği (`authorId`) veriyor ama adı vermiyor; ad
 * yalnız oturumda. Native mobil (Bearer) oturumunda `auth()` boş döner ve o
 * durumda ad BOŞ kalıyor — bilerek: uydurulmuş bir ad, kaydın kimin yazdığını
 * yanlış anlatırdı. Karar hep `authorId` üstünden, ad yalnız görüntü için.
 */
async function gorunenAd(): Promise<string> {
  const session = await auth();
  return session?.user?.name ?? "";
}

/** Kuyruk: katkı verici kendi önerilerini, düzenleyici hepsini görür. */
export async function GET() {
  const ctx = await resolveActiveTree();
  if (!ctx.ok) return NextResponse.json({ error: "Yetkisiz" }, { status: ctx.status });
  if (!canContribute(ctx.role)) return forbidden();

  const hepsi = await listProposals(ctx.treeId);
  const kararVerebilir = canEdit(ctx.role);
  return NextResponse.json({
    proposals: visibleTo(hepsi, ctx.authorId, kararVerebilir),
    /*
     * Rozet sayısı YALNIZ karar verebilene gönderiliyor. Katkı vericiye de
     * gönderilseydi, göremediği önerilerin varlığını sayıdan çıkarırdı —
     * görünürlük kuralını sayı üstünden delen bir sızıntı.
     */
    pending: kararVerebilir ? pendingCount(hepsi) : undefined,
    canDecide: kararVerebilir,
  });
}

/** Yeni öneri. */
export async function POST(req: NextRequest) {
  const ctx = await resolveActiveTree();
  if (!ctx.ok) return NextResponse.json({ error: "Yetkisiz" }, { status: ctx.status });
  if (!canContribute(ctx.role)) return forbidden();

  const body = (await req.json().catch(() => ({}))) as {
    personId?: unknown;
    changes?: unknown;
    note?: unknown;
  };
  const personId = typeof body.personId === "string" ? body.personId : "";
  const istek =
    body.changes && typeof body.changes === "object" && !Array.isArray(body.changes)
      ? (body.changes as Record<string, unknown>)
      : null;
  if (!personId || !istek) return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });

  const data = await getFamilyData(ctx.treeId, { skipCache: true });
  const person = data.people.find((p) => p.id === personId);
  if (!person) return NextResponse.json({ error: "Kişi bulunamadı" }, { status: 404 });

  /*
   * `from` değerleri KAYITTAN okunuyor, istekten değil (`buildChanges`).
   * İstemci yazabilseydi bayatlık denetimi anlamsızlaşırdı.
   */
  const kur = buildChanges(person, istek);
  if (!kur.ok) {
    const mesaj = {
      "alan-yok": "Önerilemeyen bir alan gönderildi.",
      "degisiklik-yok": "Değişen bir şey yok.",
      "cok-alan": "Tek seferde önerilebilecek alan sayısı aşıldı.",
    }[kur.fail];
    return NextResponse.json({ error: mesaj }, { status: 400 });
  }

  const eklendi = await addProposal(ctx.treeId, {
    personId,
    personName: `${person.firstName} ${person.lastName}`.trim(),
    changes: kur.changes,
    note: typeof body.note === "string" ? body.note.trim().slice(0, MAX_NOTE) : undefined,
    by: ctx.authorId,
    byName: await gorunenAd(),
    at: new Date().toISOString(),
    status: "bekliyor",
  });
  if (!eklendi.ok)
    return NextResponse.json(
      { error: "Öneri kuyruğu dolu; bekleyen öneriler karara bağlanmalı." },
      { status: 409 }
    );

  // Bildirim EN İYİ ÇABA: gönderilemezse öneri yine kaydedildi.
  await bildir(ctx.accountId, eklendi.proposal).catch((e) =>
    console.warn("[oneri] bildirim gönderilemedi:", (e as Error).message)
  );

  return NextResponse.json({ ok: true, proposal: eklendi.proposal });
}

/** Onay / ret — yalnız düzenleyici ve üstü. */
export async function PATCH(req: NextRequest) {
  const ctx = await resolveActiveTree();
  if (!ctx.ok) return NextResponse.json({ error: "Yetkisiz" }, { status: ctx.status });
  /*
   * KARAR canEdit İSTİYOR. `canContribute` yetseydi katkı verici kendi
   * önerisini onaylayıp yazma kapısını tamamen dolanırdı — yani rol,
   * gecikmeli bir editor olurdu.
   */
  if (!canEdit(ctx.role)) return forbidden("Bu işlem için düzenleme yetkiniz yok.");

  const body = (await req.json().catch(() => ({}))) as {
    id?: unknown;
    decision?: unknown;
    note?: unknown;
  };
  const id = typeof body.id === "string" ? body.id : "";
  const karar = body.decision === "onaylandi" || body.decision === "reddedildi" ? body.decision : null;
  if (!id || !karar) return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });

  const p = await findProposal(ctx.treeId, id);
  if (!p) return NextResponse.json({ error: "Öneri bulunamadı" }, { status: 404 });

  const kararli = decide(
    p, karar, ctx.authorId, await gorunenAd(), new Date().toISOString(),
    typeof body.note === "string" ? body.note : ""
  );
  if (!kararli.ok)
    return NextResponse.json(
      { error: kararli.fail === "karar-verilmis" ? "Bu öneri zaten karara bağlanmış." : "Geçersiz karar." },
      { status: 409 }
    );

  if (karar === "onaylandi") {
    const data = await getFamilyData(ctx.treeId, { skipCache: true });
    /*
     * İYİMSER KİLİT — öbür yazan uçlarla aynı kural.
     *
     * `applyProposal`ın bayatlık denetimi yalnız ÖNERİLEN ALANLARI koruyor.
     * Ağaç tek bir dosya; okuma ile yazma arasında başkası başka bir kişiyi
     * kaydettiyse, bu yazma onun değişikliğini de ezerdi. İki denetim farklı
     * şeylere bakıyor ve ikisi de gerekli.
     */
    if (versionMismatch(req, data.updatedAt))
      return NextResponse.json(
        { error: "Ağaç bu sırada başka bir yerde değişti. Sayfayı yenileyip tekrar deneyin." },
        { status: 409 }
      );
    const i = data.people.findIndex((x) => x.id === p.personId);
    /*
     * Kişi arada silinmiş olabilir. Öneriyi "onaylandı" diye işaretleyip
     * uygulayamamak, kayıtta olmayan bir değişikliği olmuş göstermek olurdu.
     */
    if (i === -1)
      return NextResponse.json({ error: "Öneri edilen kişi artık yok." }, { status: 409 });

    const uygula = applyProposal(data.people[i], p);
    if (!uygula.ok)
      return NextResponse.json(
        {
          error: "Bu öneri yazıldığından beri alanlar değişmiş; onaylamak yeni bilgiyi silerdi.",
          stale: uygula.stale,
        },
        { status: 409 }
      );

    const people = [...data.people];
    people[i] = uygula.person;
    /*
     * SIRA: önce ağaç yazılıyor, sonra öneri "onaylandı" işaretleniyor.
     * Ters olsaydı ve ağaç yazımı düşseydi, öneri onaylanmış görünür ama
     * değişiklik hiç gerçekleşmezdi — kimsenin fark etmeyeceği bir yalan.
     */
    await saveFamilyData(ctx.treeId, { ...data, people });
  }

  const yazildi = await replaceProposal(ctx.treeId, kararli.proposal);
  if (!yazildi) return NextResponse.json({ error: "Öneri bulunamadı" }, { status: 404 });
  return NextResponse.json({ ok: true, proposal: kararli.proposal });
}

/**
 * Ağaç sahibine bildirim.
 *
 * YALNIZ SAHİBE gidebiliyor ve bunun sebebi ürünün kendisi: davetle katılan
 * üyelerin (editor/admin dâhil) sistemde e-posta adresi YOK — giriş
 * soyadı+şifre ile. Yani düzenleyicilerin çoğuna posta atmanın yolu yok;
 * onların kanalı uygulama içindeki kuyruk (C parçası).
 *
 * Adres opt-in (`notifyEmail`) ve hiç verilmemiş olabilir; o durumda sessizce
 * geçiliyor — bildirim yokluğu öneriyi kaybetmiyor, kuyrukta duruyor.
 */
async function bildir(accountId: string, p: Proposal): Promise<void> {
  if (!isEmailConfigured()) return;
  const { users } = await getUsersData();
  const u = users.find((x) => x.id === accountId);
  const adres = u?.notifyEmail?.trim();
  if (!adres) return;

  const alanlar = Object.keys(p.changes).length;
  const { html, text } = renderEmail({
    title: "Ağacında bir değişiklik önerisi var",
    intro: `${p.byName || "Bir katkı verici"}, ${p.personName || "bir kişi"} kaydı için ${alanlar} alanda değişiklik öneriyor.`,
    /*
     * Önerilen DEĞERLER postaya konmuyor, yalnız sayısı. Gövde, ağaçtaki
     * kişisel bilgiyi (doğum tarihi, adres, hastalık) gizlilik katmanından
     * geçmeden dışarı taşırdı; oysa uygulamadaki her görüntü `view()`
     * üstünden çiziliyor. Karar ekranda veriliyor, postada değil.
     */
    note: p.note ? `Notu: ${p.note.slice(0, 300)}` : undefined,
    button: { label: "Öneriyi gör", url: `${SITE_URL}/tree` },
    footer: "Bu bildirimi ağaç sahibi olduğun için aldın.",
  });
  await sendEmail({ to: adres, subject: "🌳 Değişiklik önerisi", html, text });
}
