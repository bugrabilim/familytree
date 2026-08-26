import { NextRequest, NextResponse } from "next/server";
import { getFamilyData, saveFamilyData, versionMismatch } from "@/lib/blob";
import { resolveActiveTree } from "@/lib/tree-context";
import { canEdit } from "@/lib/roles";
import { nextCode } from "@/lib/code";
import type { Person } from "@/types/family";

export type RelationType = "parent" | "child" | "spouse" | "sibling" | "associate";

export async function POST(req: NextRequest) {
  const ctx = await resolveActiveTree();
  if (!ctx.ok) return NextResponse.json({ error: "Yetkisiz" }, { status: ctx.status });
  if (!canEdit(ctx.role))
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

  const person: Person = {
    id: crypto.randomUUID(),
    code: nextCode(data.people),
    firstName: (body.firstName ?? "").trim(),
    lastName: (body.lastName ?? "").trim(),
    gender: body.gender ?? "unknown",
    nickname: body.nickname || undefined,
    patronymic: body.patronymic || undefined,
    orientation: body.orientation || undefined,
    birthDate: body.birthDate || undefined,
    officialBirthDate: body.officialBirthDate || undefined,
    deathDate: body.deathDate || undefined,
    birthPlace: body.birthPlace || undefined,
    religion: body.religion || undefined,
    denomination: body.denomination || undefined,
    language: body.language || undefined,
    ethnicity: body.ethnicity || undefined,
    nationality: body.nationality || undefined,
    occupation: body.occupation || undefined,
    education: body.education || undefined,
    congenitalCondition: body.congenitalCondition || undefined,
    healthCondition: body.healthCondition || undefined,
    deathCause: body.deathCause || undefined,
    burialPlace: body.burialPlace || undefined,
    burialCoords: body.burialCoords || undefined,
    photo: body.photo || undefined,
    photos: Array.isArray(body.photos) ? body.photos : undefined,
    videos: Array.isArray(body.videos) ? body.videos : undefined,
    documents: Array.isArray(body.documents) ? body.documents : undefined,
    bio: body.bio || undefined,
    events: Array.isArray(body.events) ? body.events : undefined,
    sources: Array.isArray(body.sources) ? body.sources : undefined,
    memories: Array.isArray(body.memories) ? body.memories : undefined,
    kind: body.kind === "cevre" ? "cevre" : undefined,
    associations: Array.isArray(body.associations) ? body.associations : undefined,
    confidential: body.confidential || undefined,
    privateFields:
      Array.isArray(body.privateFields) && body.privateFields.length ? body.privateFields : undefined,
    parentIds: Array.isArray(body.parentIds) ? body.parentIds.slice(0, 2) : [],
    parentLinks: body.parentLinks && typeof body.parentLinks === "object" ? body.parentLinks : undefined,
    spouseIds: Array.isArray(body.spouseIds) ? [...body.spouseIds] : [],
    formerSpouseIds: Array.isArray(body.formerSpouseIds) ? [...body.formerSpouseIds] : [],
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

  await saveFamilyData(userId, data);
  return NextResponse.json(person, { status: 201 });
}
