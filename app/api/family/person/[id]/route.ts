import { NextRequest, NextResponse } from "next/server";
import { getFamilyData, saveFamilyData, versionMismatch } from "@/lib/blob";
import { resolveActiveTree } from "@/lib/tree-context";
import { mergePersonFields } from "@/lib/person-fields";
import { canEdit } from "@/lib/roles";

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
  if (!canEdit(ctx.role)) return forbidden();

  const userId = ctx.treeId;
  const { id } = await params;
  const body = await req.json();
  const data = await getFamilyData(userId, { skipCache: true });
  if (versionMismatch(req, data.updatedAt)) return conflict();

  const index = data.people.findIndex((p) => p.id === id);
  if (index === -1)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

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

  const oldSpouseIds = data.people[index].spouseIds;
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

  // Eski eş bağlarını da çift yönlü tut
  const oldEx: string[] = data.people[index].formerSpouseIds ?? [];
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

  await saveFamilyData(userId, data);
  return NextResponse.json(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await resolveActiveTree();
  if (!ctx.ok) return NextResponse.json({ error: "Unauthorized" }, { status: ctx.status });
  if (!canEdit(ctx.role)) return forbidden();

  const userId = ctx.treeId;
  const { id } = await params;
  const data = await getFamilyData(userId, { skipCache: true });
  if (versionMismatch(req, data.updatedAt)) return conflict();

  const person = data.people.find((p) => p.id === id);
  if (!person) return NextResponse.json({ error: "Not found" }, { status: 404 });

  data.people = data.people
    .filter((p) => p.id !== id)
    .map((p) => ({
      ...p,
      parentIds: p.parentIds.filter((pid) => pid !== id),
      spouseIds: p.spouseIds.filter((sid) => sid !== id),
    }));

  await saveFamilyData(userId, data);
  return NextResponse.json({ success: true });
}
