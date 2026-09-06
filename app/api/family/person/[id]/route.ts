import { NextRequest, NextResponse } from "next/server";
import { getFamilyData, saveFamilyData, versionMismatch } from "@/lib/blob";
import { resolveActiveTree } from "@/lib/tree-context";
import { mergePersonFields } from "@/lib/person-fields";
import { canContribute, canEdit } from "@/lib/roles";
import { deleteBondsOfPerson } from "@/lib/bond-store";
import { scrubDeleted } from "@/lib/scrub";

const conflict = () =>
  NextResponse.json(
    { error: "Ağaç bu sırada başka bir yerde değişti. Sayfayı yenileyip tekrar deneyin." },
    { status: 409 }
  );

const forbidden = () =>
  NextResponse.json({ error: "Bu işlem için düzenleme yetkiniz yok." }, { status: 403 });

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await resolveActiveTree();
  if (!ctx.ok) return NextResponse.json({ error: "Unauthorized" }, { status: ctx.status });
  /*
   * KAPI İKİ AŞAMALI (madde 35).
   *
   * Birinci aşama roldür ve burada: katkı vericinin altındaki hiç kimse
   * (viewer) bu uca giremez. İkinci aşama SAHİPLİKTİR ve kaydı bulduktan
   * sonra gelir — çünkü "kendi eklediği mi?" sorusu ancak kayıt elde
   * olunca sorulabilir.
   *
   * Sıra bu yüzden ters çevrilemez; ama tek aşamalı bırakılsaydı katkı
   * verici HERKESİN kaydını düzenlerdi.
   */
  if (!canContribute(ctx.role)) return forbidden();

  const userId = ctx.treeId;
  const { id } = await params;
  const body = await req.json();
  const data = await getFamilyData(userId, { skipCache: true });
  if (versionMismatch(req, data.updatedAt)) return conflict();

  const index = data.people.findIndex((p) => p.id === id);
  if (index === -1)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  /*
   * İKİNCİ AŞAMA. Editor ve üstü her kaydı düzenler; katkı verici YALNIZ
   * kendi eklediğini.
   *
   * `addedBy` yoksa (rolden önce eklenmiş eski kayıtlar) sahiplik
   * KURULAMAZ ve karşılaştırma başarısız olur — yani eski kayıtların hepsi
   * katkı vericiye kapalı. Boşluğun güvenli yöne düşmesi bilinçli:
   * `undefined === undefined` gibi bir eşleşmeye izin verilseydi, kimliği
   * çözülemeyen bir katkı verici bütün eski ağacı düzenleyebilirdi.
   */
  if (!canEdit(ctx.role) && data.people[index].addedBy !== ctx.authorId)
    return forbidden();

  /*
   * Alanlar KAYIT DEFTERİNDEN birleştirilir (`lib/person-fields.ts`).
   *
   * Burada kırk satırlık elle yazılmış bir liste vardı ve alanlar iki farklı
   * kuralla birleşiyordu: çoğu `body.x ?? mevcut`, dördü `body.x || mevcut`.
   * İkincisi boş bir değeri eskisine geri düşürüyordu, yani doğum tarihi,
   * resmî doğum tarihi, ölüm tarihi ve doğum yeri HİÇ TEMİZLENEMİYORDU —
   * yanlış girilmiş bir tarih silinip kaydedilince geri geliyordu.
   *
   * Artık tek kural: `undefined` dokunmaz, `""`/`null` temizler.
   *
   * Deftere girmeyenler burada kalır: ilişki grafiği karşılıklılık gerektirir
   * (eş eklenince karşı tarafa da yazılır), kimlik/kod sunucunundur.
   */
  const updated = {
    ...data.people[index],
    ...mergePersonFields(data.people[index], body as Record<string, unknown>),
    // Başlangıç iskeleti etiketi, gerçek bir ad girilir girilmez düşer.
    placeholder: (body.firstName ?? data.people[index].firstName)?.trim()
      ? undefined
      : data.people[index].placeholder,
    // "uye" açıkça gönderilirse çevre bayrağı kalkar; defterdeki düz metin
    // birleştirmesi bu üç durumu ("cevre" / "uye" / dokunma) ayırt edemez.
    kind: body.kind === "cevre" ? "cevre" : body.kind === "uye" ? undefined : data.people[index].kind,
    parentIds: Array.isArray(body.parentIds)
      ? body.parentIds
      : data.people[index].parentIds,
    parentLinks:
      body.parentLinks && typeof body.parentLinks === "object"
        ? body.parentLinks
        : data.people[index].parentLinks,
    spouseIds: Array.isArray(body.spouseIds)
      ? body.spouseIds
      : data.people[index].spouseIds,
    formerSpouseIds: Array.isArray(body.formerSpouseIds)
      ? body.formerSpouseIds
      : data.people[index].formerSpouseIds ?? [],
  };

  /*
   * ESKİ DEĞERLER YAZMADAN ÖNCE OKUNUR.
   *
   * `oldEx` aşağıda okunuyordu — yani `data.people[index] = updated`
   * satırından SONRA. O noktada dizi zaten yeni değerdi, `oldEx` ile `newEx`
   * her zaman aynı çıkıyor ve iki döngü de boş kümede dönüyordu: eski eş
   * bağının karşılıklılığı hiç kurulmuyordu. Bir tarafta boşanma görünüyor,
   * öbür tarafta görünmüyordu.
   */
  const oldSpouseIds = data.people[index].spouseIds;
  const oldEx: string[] = data.people[index].formerSpouseIds ?? [];
  data.people[index] = updated;

  const removed: string[] = oldSpouseIds.filter((sid: string) => !updated.spouseIds.includes(sid));
  const added: string[] = updated.spouseIds.filter((sid: string) => !oldSpouseIds.includes(sid));

  for (const sid of removed) {
    const s = data.people.find((p) => p.id === sid);
    if (s) s.spouseIds = s.spouseIds.filter((x) => x !== id);
  }
  for (const sid of added) {
    const s = data.people.find((p) => p.id === sid);
    if (s && !s.spouseIds.includes(id)) s.spouseIds.push(id);
  }

  // Eski eş bağlarını da çift yönlü tut (`oldEx` yukarıda, yazmadan önce alındı)
  const newEx: string[] = updated.formerSpouseIds ?? [];
  for (const sid of oldEx.filter((x) => !newEx.includes(x))) {
    const s = data.people.find((p) => p.id === sid);
    if (s) s.formerSpouseIds = (s.formerSpouseIds ?? []).filter((x) => x !== id);
  }
  for (const sid of newEx.filter((x) => !oldEx.includes(x))) {
    const s = data.people.find((p) => p.id === sid);
    if (s && !(s.formerSpouseIds ?? []).includes(id)) {
      s.formerSpouseIds = [...(s.formerSpouseIds ?? []), id];
    }
  }

  await saveFamilyData(userId, data, { by: ctx.authorId });
  return NextResponse.json(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await resolveActiveTree();
  if (!ctx.ok) return NextResponse.json({ error: "Unauthorized" }, { status: ctx.status });
  /*
   * SİLME katkı vericiye AÇILMADI — kendi eklediği kayıt için bile.
   *
   * Düzenleme ile silme burada simetrik değil: bir kaydı ekledikten sonra
   * başkaları onun üstüne bir şey kurmuş olabilir (çocuk bağlamış, fotoğraf
   * eklemiş, hikâye yazmış). Ekleyenin "benim kaydım" demesi o andan sonra
   * doğru değil ve silme, düzenlemenin aksine başkasının emeğini de götürür.
   * Katkı verici silmek istiyorsa yolu öneriden geçiyor.
   */
  if (!canEdit(ctx.role)) return forbidden();

  const userId = ctx.treeId;
  const { id } = await params;
  const data = await getFamilyData(userId, { skipCache: true });
  if (versionMismatch(req, data.updatedAt)) return conflict();

  const person = data.people.find((p) => p.id === id);
  if (!person) return NextResponse.json({ error: "Not found" }, { status: 404 });

  /*
   * Başvuru temizliği `lib/scrub.ts`te — toplu silme rotasıyla AYNI işlev.
   * Eskiden ikisi ayrı yazılmıştı ve ayrı düşmüştü: burası `formerSpouseIds`i
   * hiç temizlemiyor, ikisi de `associations`/`parentLinks`e dokunmuyordu.
   * Sonuç, uygulamanın kendi bütünlük tarayıcısının `error` diye bildirdiği
   * kalıcı sorunlardı.
   */
  data.people = scrubDeleted(data.people, [id]);

  await saveFamilyData(userId, data, { by: ctx.authorId });

  /*
   * Duygusal bağlar ayrı bir blobda; kişi listesinden silmek onları
   * silmiyor. Ölü kaydı burada kaldırıyoruz.
   *
   * Kişi kaydı ZATEN kaydedildikten SONRA ve hatayı yutarak: bağ silme
   * başarısız olsa bile kişi silinmiş olmalı. Kalan öksüz bağı okuma
   * tarafındaki `pruneBonds` zaten süzüyor, yani görünür bir bozulma
   * doğurmuyor — asıl silme işlemini geri almak ise kullanıcıya "silinmedi"
   * demek olurdu.
   */
  try {
    await deleteBondsOfPerson(userId, id);
  } catch {
    /* yok sayılır — öksüz bağ okurken süzülüyor */
  }

  return NextResponse.json({ success: true });
}
