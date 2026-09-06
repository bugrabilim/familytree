import { NextRequest, NextResponse } from "next/server";
import { getFamilyData, saveFamilyData, versionMismatch } from "@/lib/blob";
import { resolveActiveTree } from "@/lib/tree-context";
import { canContribute, canEdit } from "@/lib/roles";
import { nextCode } from "@/lib/code";
import type { Person } from "@/types/family";
import { buildPersonFields } from "@/lib/person-fields";

export type RelationType = "parent" | "child" | "spouse" | "sibling" | "associate";

export async function POST(req: NextRequest) {
  const ctx = await resolveActiveTree();
  if (!ctx.ok) return NextResponse.json({ error: "Yetkisiz" }, { status: ctx.status });
  /*
   * EKLEME kapısı (madde 35) — `canEdit` değil `canContribute`.
   *
   * Katkı vericinin yapabildiği tek doğrudan yazma işi bu: yeni kayıt
   * açmak. Var olana dokunmak (PUT/DELETE) hâlâ `canEdit` istiyor; oraya
   * onun yolu değişiklik önerisinden geçiyor.
   */
  if (!canContribute(ctx.role))
    return NextResponse.json({ error: "Bu işlem için düzenleme yetkiniz yok." }, { status: 403 });

  const userId = ctx.treeId;
  const body = await req.json();
  const data = await getFamilyData(userId, { skipCache: true });
  if (versionMismatch(req, data.updatedAt)) {
    return NextResponse.json(
      { error: "Ağaç bu sırada başka bir yerde değişti. Sayfayı yenileyip tekrar deneyin." },
      { status: 409 }
    );
  }

  /*
   * Alanlar KAYIT DEFTERİNDEN kurulur (`lib/person-fields.ts`).
   *
   * Eskiden burada kırk satırlık elle yazılmış bir liste vardı ve aynısının
   * bir başkası PUT rotasındaydı. İki listenin ayrışması kaçınılmazdı: bir
   * alan birinde `??`, öbüründe `||` ile birleşiyordu ve fark kimsenin
   * gözüne çarpmıyordu.
   *
   * Deftere girmeyenler burada kalır: kimlik/kod sunucunundur, ilişki grafiği
   * kendi karşılıklılık akışını yürütür.
   */
  const person: Person = {
    id: crypto.randomUUID(),
    code: nextCode(data.people),
    /*
     * EKLEYEN kayda yazılıyor. Katkı verici kendi eklediğini sonradan
     * düzeltebilsin diye; `buildPersonFields`ten SONRA değil ÖNCE de
     * yazılabilirdi ama sıra önemli değil: alan kayıt defterinde yok, yani
     * gövdeden gelen bir değer buraya hiç ulaşmıyor.
     */
    addedBy: ctx.authorId,
    ...buildPersonFields(body as Record<string, unknown>),
    // Ad/soyad her zaman bulunur (boş da olsa) ve kırpılır.
    firstName: ((body.firstName as string) ?? "").trim(),
    lastName: ((body.lastName as string) ?? "").trim(),
    gender: (body.gender as Person["gender"]) ?? "unknown",
    // "cevre" dışındaki her değer varsayılan (üye) demektir.
    kind: body.kind === "cevre" ? "cevre" : undefined,
    parentIds: Array.isArray(body.parentIds) ? body.parentIds.slice(0, 2) : [],
    parentLinks: body.parentLinks && typeof body.parentLinks === "object" ? body.parentLinks : undefined,
    /*
     * İLİŞKİ DİZİLERİ TAM YETKİDE — katkı vericide `relation` tek yol.
     *
     * Bu diziler aşağıda VAR OLAN kişilerin kayıtlarına yazıyor
     * (`spouse.spouseIds.push`). Gövdeden serbest bırakıldığında katkı
     * verici tek istekle ağaçtaki her kaydın eş listesine kendi eklediği
     * kişiyi sokabiliyordu — üstelik silme yetkisi olmadığı için geri de
     * alamıyordu. `relation` tek bir hedefe bağlıyor ve kendi denetimleri
     * var; katkı vericiye kalan yol o.
     */
    spouseIds: canEdit(ctx.role) && Array.isArray(body.spouseIds) ? [...body.spouseIds] : [],
    // Eş dizisiyle aynı gerekçe: karşı tarafın kaydına yazıyor.
    formerSpouseIds:
      canEdit(ctx.role) && Array.isArray(body.formerSpouseIds) ? [...body.formerSpouseIds] : [],
    // #6 — Köken/iz: elle eklenen kart (istemci başka bir kaynak bildirmediyse).
    entrySource: typeof body.entrySource === "string" && body.entrySource.trim() ? body.entrySource.trim() : "manuel",
  };

  /* ---- İlişki bağlama: "X'in babası/çocuğu/eşi/kardeşi olarak ekle" ---- */
  const relation = body.relation as { type: RelationType; targetId: string; assocType?: string } | undefined;
  if (relation?.targetId) {
    const target = data.people.find((p) => p.id === relation.targetId);
    if (!target) {
      return NextResponse.json({ error: "Bağlanacak kişi bulunamadı" }, { status: 400 });
    }

    switch (relation.type) {
      case "associate": {
        // Yeni kişi, hedefin aile-dışı yakını (çevre) olur — kan/evlilik bağı
        // KURULMAZ; iki yönlü çözülebilen bir "yakın çevre" bağı eklenir.
        person.kind = "cevre";
        const type = (typeof relation.assocType === "string" && relation.assocType.trim()) || "arkadas";
        const existing = Array.isArray(person.associations) ? person.associations : [];
        if (!existing.some((a) => a.personId === target.id)) {
          person.associations = [...existing, { id: crypto.randomUUID(), personId: target.id, type }];
        }
        break;
      }

      case "parent": {
        // Yeni kişi, hedefin ebeveyni olur
        if (target.parentIds.length >= 2) {
          return NextResponse.json(
            { error: "Bu kişinin zaten iki ebeveyni var" },
            { status: 400 }
          );
        }
        target.parentIds.push(person.id);
        // Mevcut diğer ebeveyn varsa eş olarak bağla
        const digerEbeveynId = target.parentIds.find((id) => id !== person.id);
        if (digerEbeveynId) {
          const diger = data.people.find((p) => p.id === digerEbeveynId);
          if (diger && !diger.spouseIds.includes(person.id)) {
            diger.spouseIds.push(person.id);
            person.spouseIds.push(diger.id);
          }
        }
        break;
      }

      case "child": {
        // Yeni kişi, hedefin çocuğu olur
        if (!person.parentIds.includes(target.id)) person.parentIds.push(target.id);
        // Hedefin tek eşi varsa onu da ikinci ebeveyn yap
        if (target.spouseIds.length === 1 && person.parentIds.length < 2) {
          const es = target.spouseIds[0];
          if (!person.parentIds.includes(es)) person.parentIds.push(es);
        }
        break;
      }

      case "spouse": {
        if (!person.spouseIds.includes(target.id)) person.spouseIds.push(target.id);
        break;
      }

      case "sibling": {
        // Hedefin ebeveynlerini paylaş
        person.parentIds = [...target.parentIds];
        break;
      }
    }
  }

  data.people.push(person);

  // Eş bağlarını çift yönlü senkronla
  for (const spouseId of person.spouseIds) {
    const spouse = data.people.find((p) => p.id === spouseId);
    if (spouse && !spouse.spouseIds.includes(person.id)) {
      spouse.spouseIds.push(person.id);
    }
  }
  for (const exId of person.formerSpouseIds ?? []) {
    const ex = data.people.find((p) => p.id === exId);
    if (ex && !(ex.formerSpouseIds ?? []).includes(person.id)) {
      ex.formerSpouseIds = [...(ex.formerSpouseIds ?? []), person.id];
    }
  }

  await saveFamilyData(userId, data, { by: ctx.authorId });
  return NextResponse.json(person, { status: 201 });
}
