import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getFamilyData, saveFamilyData, versionMismatch } from "@/lib/blob";
import { resolveActiveTree } from "@/lib/tree-context";
import { canEdit, canPropose } from "@/lib/roles";
import { getUsersData } from "@/lib/users";
import { isEmailConfigured, sendEmail } from "@/lib/email";
import { renderEmail } from "@/lib/email-template";
import { SITE_URL } from "@/lib/site";
import {
  buildChanges, buildNewPerson, decide, isCoherent,
  MAX_NOTE, MAX_VALUE, pendingCount, visibleTo,
  type Proposal, type ProposalKind,
} from "@/lib/proposals";
import { addProposal, listProposals, replaceProposals } from "@/lib/proposal-store";
import { applyFailMessage, applyToTree } from "@/lib/proposal-apply";
import type { FamilyData } from "@/types/family";

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
  if (!canPropose(ctx.role)) return forbidden();

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
  if (!canPropose(ctx.role)) return forbidden();

  const body = (await req.json().catch(() => ({}))) as {
    kind?: unknown;
    personId?: unknown;
    changes?: unknown;
    person?: unknown;
    relation?: unknown;
    note?: unknown;
  };
  const kind: ProposalKind =
    body.kind === "ekleme" || body.kind === "silme" ? body.kind : "alan";
  const personId = typeof body.personId === "string" ? body.personId : "";
  const nesne = (v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  const not = typeof body.note === "string" ? body.note.trim().slice(0, MAX_NOTE) : undefined;
  const ortak = {
    note: not,
    by: ctx.authorId,
    byName: await gorunenAd(),
    at: new Date().toISOString(),
    status: "bekliyor" as const,
  };

  const hata = (fail: string) =>
    NextResponse.json(
      {
        error: {
          "alan-yok": "Önerilemeyen bir alan gönderildi.",
          "degisiklik-yok": "Değişen bir şey yok.",
          "cok-alan": "Tek seferde önerilebilecek alan sayısı aşıldı.",
          "cok-uzun": `Bir alan çok uzun (en fazla ${MAX_VALUE} karakter).`,
        }[fail] ?? "Geçersiz istek",
      },
      { status: 400 }
    );

  let taslak: Omit<Proposal, "id">;

  if (kind === "ekleme") {
    /*
     * YENİ KİŞİ ÖNERİSİ. `changes` yok: ortada karşılaştırılacak bir "önceki
     * değer" olmadığı için bayatlık denetiminin de anlamı yok. Bağ isteğe
     * bağlı; verilirse hedefin VAR OLDUĞU burada doğrulanıyor, onay anında
     * değil — öneren, hedefi silinmiş bir bağı kuyruğa sokmasın.
     */
    const istek = nesne(body.person);
    if (!istek) return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
    const kur = buildNewPerson(istek);
    if (!kur.ok) return hata(kur.fail);

    let relation: Proposal["relation"];
    const r = nesne(body.relation);
    if (r && typeof r.targetId === "string" && typeof r.type === "string") {
      const data = await getFamilyData(ctx.treeId, { skipCache: true });
      if (!data.people.some((p) => p.id === r.targetId))
        return NextResponse.json({ error: "Bağlanacak kişi bulunamadı" }, { status: 404 });
      relation = {
        type: r.type as NonNullable<Proposal["relation"]>["type"],
        targetId: r.targetId,
        ...(typeof r.assocType === "string" ? { assocType: r.assocType } : {}),
      };
    }
    const ad = `${istek.firstName ?? ""} ${istek.lastName ?? ""}`.trim();
    taslak = { ...ortak, kind, personId: "", personName: ad, changes: {}, person: kur.person, relation };
  } else {
    const data = await getFamilyData(ctx.treeId, { skipCache: true });
    const person = data.people.find((p) => p.id === personId);
    if (!person) return NextResponse.json({ error: "Kişi bulunamadı" }, { status: 404 });
    const ad = `${person.firstName} ${person.lastName}`.trim();

    if (kind === "silme") {
      taslak = { ...ortak, kind, personId, personName: ad, changes: {} };
    } else {
      const istek = nesne(body.changes);
      if (!istek) return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
      /*
       * `from` değerleri KAYITTAN okunuyor, istekten değil (`buildChanges`).
       * İstemci yazabilseydi bayatlık denetimi anlamsızlaşırdı.
       */
      const kur = buildChanges(person, istek);
      if (!kur.ok) return hata(kur.fail);
      taslak = { ...ortak, kind, personId, personName: ad, changes: kur.changes };
    }
  }

  /*
   * TÜR TUTARLILIĞI depoya girmeden sınanıyor. Türü "ekleme" olup `personId`
   * taşıyan bir kayıt, onay anında hangi kod yolunun çalışacağını belirsiz
   * kılardı; belirsizliği yazma anında kesmek onay anında keşfetmekten ucuz.
   */
  if (!isCoherent({ ...taslak, id: "" })) 
    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });

  const eklendi = await addProposal(ctx.treeId, taslak);
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

/** Tek istekte karara bağlanabilecek öneri sayısı. */
const MAX_TOPLU = 100;

/**
 * ONAY / RET — tek öneri ya da TOPLU (madde 35/E).
 *
 * `{ id }` tek öneriyi, `{ ids: [...] }` bir kümeyi karara bağlar. İkisi de
 * AYNI gövdeden geçiyor; toplu onay ayrı bir uca konsaydı iki yol ayrışırdı
 * ve ayrışmanın yönü kötü olurdu (bkz. `lib/proposal-apply.ts`).
 *
 * ## Toplu onayda ağaç TEK KEZ yazılıyor
 *
 * Öneriler sırayla AYNI anlık görüntüye uygulanıyor, sonra tek `saveFamilyData`.
 * Her öneri için ayrı kaydetseydik: N tane Blob yazması, N sürüm damgası ve
 * her damgada istemcinin taban sürümü bayatlar — kullanıcı ikinci onayda
 * kendi az önceki onayı yüzünden 409 yerdi.
 *
 * Art arda uygulama, önerilerin birbirinin sonucunu GÖRMESİNİ de sağlıyor:
 * aynı alana iki farklı değer öneren iki kayıttan ikincisi artık bayat
 * çıkıyor ve reddediliyor — birincinin yazdığını sessizce ezmek yerine.
 *
 * ## Kısmi başarı KABUL EDİLİYOR
 *
 * Bir öneri bayatsa ya da kişisi silinmişse yalnız O öneri düşüyor,
 * ötekiler uygulanıyor ve sonuç listesi hangisinin neden düştüğünü
 * söylüyor. Hepsini geri almak, tek bayat öneriyle yüz onaylık bir kuyruğu
 * kilitlerdi — özelliğin var oluş sebebinin tam tersi. Düşen öneri
 * "bekliyor" kalıyor, yani kaybolmuyor.
 */
export async function PATCH(req: NextRequest) {
  const ctx = await resolveActiveTree();
  if (!ctx.ok) return NextResponse.json({ error: "Yetkisiz" }, { status: ctx.status });
  /*
   * KARAR canEdit İSTİYOR. `canPropose` yetseydi katkı verici kendi
   * önerisini onaylayıp yazma kapısını tamamen dolanırdı — yani rol,
   * gecikmeli bir editor olurdu.
   */
  if (!canEdit(ctx.role)) return forbidden("Bu işlem için düzenleme yetkiniz yok.");

  const body = (await req.json().catch(() => ({}))) as {
    id?: unknown;
    ids?: unknown;
    decision?: unknown;
    note?: unknown;
  };
  const karar = body.decision === "onaylandi" || body.decision === "reddedildi" ? body.decision : null;
  /*
   * Yanıt BİÇİMİ isteğin biçimini izliyor: `{id}` ile gelen tek bir
   * `proposal` alıyor, `{ids}` ile gelen `results` listesi. Tek biçime
   * indirilseydi ya eski istemci kırılırdı ya da toplu yanıt hangi
   * önerinin neden düştüğünü söyleyemezdi.
   */
  const toplu = Array.isArray(body.ids);
  const ham = toplu
    ? (body.ids as unknown[]).filter((x): x is string => typeof x === "string" && !!x)
    : typeof body.id === "string" && body.id
      ? [body.id]
      : [];
  const ids = [...new Set(ham)];
  if (!ids.length || !karar) return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  if (ids.length > MAX_TOPLU)
    return NextResponse.json(
      { error: `Tek seferde en fazla ${MAX_TOPLU} öneri karara bağlanabilir.` },
      { status: 400 }
    );

  // Kuyruk TEK KEZ okunuyor: her kimlik için ayrı okuma, toplu onayı
  // öneri sayısıyla çarpan bir Blob trafiğine çevirirdi.
  const kitap = new Map((await listProposals(ctx.treeId)).map((p) => [p.id, p]));

  const ad = await gorunenAd();
  const simdi = new Date().toISOString();
  const not = typeof body.note === "string" ? body.note : "";

  type Sonuc = { id: string; ok: boolean; error?: string; stale?: string[]; status?: number };
  const sonuclar: Sonuc[] = [];
  const yazilacak: Proposal[] = [];

  let data: FamilyData | null = null;
  if (karar === "onaylandi") {
    data = await getFamilyData(ctx.treeId, { skipCache: true });
    /*
     * İYİMSER KİLİT — öbür yazan uçlarla aynı kural.
     *
     * Bayatlık denetimi yalnız ÖNERİLEN ALANLARI koruyor. Ağaç tek bir
     * dosya; okuma ile yazma arasında başkası başka bir kişiyi kaydettiyse,
     * bu yazma onun değişikliğini de ezerdi. İki denetim farklı şeylere
     * bakıyor ve ikisi de gerekli.
     */
    if (versionMismatch(req, data.updatedAt))
      return NextResponse.json(
        { error: "Ağaç bu sırada başka bir yerde değişti. Sayfayı yenileyip tekrar deneyin." },
        { status: 409 }
      );
  }

  let agacDegisti = false;
  for (const id of ids) {
    const p = kitap.get(id);
    if (!p) {
      sonuclar.push({ id, ok: false, error: "Öneri bulunamadı", status: 404 });
      continue;
    }
    const kararli = decide(p, karar, ctx.authorId, ad, simdi, not);
    if (!kararli.ok) {
      sonuclar.push({
        id, ok: false, status: 409,
        error: kararli.fail === "karar-verilmis" ? "Bu öneri zaten karara bağlanmış." : "Geçersiz karar.",
      });
      continue;
    }
    if (karar === "onaylandi") {
      const uygula = applyToTree(data as FamilyData, p);
      if (!uygula.ok) {
        sonuclar.push({
          id, ok: false, status: 409,
          error: applyFailMessage(uygula.fail),
          ...(uygula.fail.kod === "bayat" ? { stale: uygula.fail.stale } : {}),
        });
        continue;
      }
      agacDegisti = true;
      /*
       * GERİ ALMA KAYDI onay anında yazılıyor, çünkü bilgi yalnız burada
       * var: "ekleme"de oluşan kaydın kimliği bu çağrıda üretiliyor,
       * "silme"de silinen kayıt ve koparılan bağlar bir sonraki okumada
       * artık yok. Sonradan türetilemez.
       */
      yazilacak.push({ ...kararli.proposal, undo: uygula.undo });
      sonuclar.push({ id, ok: true });
      continue;
    }
    yazilacak.push(kararli.proposal);
    sonuclar.push({ id, ok: true });
  }

  /*
   * SIRA: önce ağaç yazılıyor, sonra öneriler "onaylandı" işaretleniyor.
   * Ters olsaydı ve ağaç yazımı düşseydi, öneriler onaylanmış görünür ama
   * değişiklik hiç gerçekleşmezdi — kimsenin fark etmeyeceği bir yalan.
   *
   * Sürüm damgasını `saveFamilyData` KENDİ vuruyor; tahmin etmek yerine
   * nesneyi elde tutup damgayı ondan okuyoruz: istemci bunu
   * `x-base-version` olarak birebir geri gönderecek, bir milisaniye farkı
   * bile 409 üretirdi.
   */
  let yeniSurum: string | undefined;
  if (karar === "onaylandi" && agacDegisti && data) {
    await saveFamilyData(ctx.treeId, data, { by: ctx.authorId });
    yeniSurum = data.updatedAt;
  }

  const damgalandi = await replaceProposals(ctx.treeId, yazilacak);

  if (!toplu) {
    const tek = sonuclar[0];
    if (!tek.ok) return NextResponse.json({ error: tek.error, ...(tek.stale ? { stale: tek.stale } : {}) }, { status: tek.status ?? 409 });
    if (damgalandi === 0)
      /*
       * DEĞİŞİKLİK AĞACA ZATEN YAZILDI ama damga yazılamadı. Buradan "Öneri
       * bulunamadı" (404) dönmek yanıltıcıydı: kullanıcı hiçbir şey
       * olmadığını sanıyor, oysa ağaç değişti. Öneri "bekliyor" kalıyor ve
       * tekrar onaylandığında `applyProposal` idempotent olduğu için
       * sorunsuz geçiyor — yani durum kurtarılabilir.
       */
      return NextResponse.json(
        {
          error:
            karar === "onaylandi"
              ? "Değişiklik ağaca uygulandı ama öneri damgası yazılamadı. Kuyruğu tazeleyip tekrar onaylayabilirsin."
              : "Öneri bulunamadı.",
          applied: karar === "onaylandi",
        },
        { status: karar === "onaylandi" ? 500 : 404 }
      );
    return NextResponse.json({ ok: true, proposal: yazilacak[0], version: yeniSurum });
  }

  const basarili = sonuclar.filter((r) => r.ok).length;
  return NextResponse.json(
    {
      ok: basarili > 0,
      // `status` yalnız TEK öneri yanıtının HTTP kodunu seçmek için tutuldu;
      // toplu yanıtta istemciye çıkmıyor.
      results: sonuclar.map((r) => ({ id: r.id, ok: r.ok, ...(r.error ? { error: r.error } : {}), ...(r.stale ? { stale: r.stale } : {}) })),
      done: basarili,
      failed: sonuclar.length - basarili,
      version: yeniSurum,
      /*
       * Ağaç yazıldı ama damga yazılamadıysa istemci bunu BİLMELİ: kuyrukta
       * hâlâ "bekliyor" görünen öneriler aslında uygulanmış olabilir.
       */
      ...(basarili > 0 && damgalandi < basarili ? { stampFailed: true } : {}),
    },
    /*
     * Hiçbiri geçmediyse 409: istemci "oldu" sanmasın. Bir kısmı geçtiyse
     * 200 — çünkü gerçekten bir şey OLDU ve sonuç listesi neyin olmadığını
     * zaten söylüyor.
     */
    { status: basarili > 0 ? 200 : 409 }
  );
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
