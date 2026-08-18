import { NextRequest, NextResponse } from "next/server";
import { getFamilyData, saveFamilyData, versionMismatch } from "@/lib/blob";
import { resolveActiveTree } from "@/lib/tree-context";
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

  const updated = {
    ...data.people[index],
    firstName: body.firstName ?? data.people[index].firstName,
    lastName: body.lastName ?? data.people[index].lastName,
    gender: body.gender ?? data.people[index].gender,
    nickname: body.nickname ?? data.people[index].nickname,
    patronymic: body.patronymic ?? data.people[index].patronymic,
    orientation: body.orientation ?? data.people[index].orientation,
    birthDate: body.birthDate || data.people[index].birthDate,
    deathDate: body.deathDate || data.people[index].deathDate,
    birthPlace: body.birthPlace || data.people[index].birthPlace,
    religion: body.religion ?? data.people[index].religion,
    denomination: body.denomination ?? data.people[index].denomination,
    language: body.language ?? data.people[index].language,
    ethnicity: body.ethnicity ?? data.people[index].ethnicity,
    nationality: body.nationality ?? data.people[index].nationality,
    occupation: body.occupation ?? data.people[index].occupation,
    education: body.education ?? data.people[index].education,
    congenitalCondition: body.congenitalCondition ?? data.people[index].congenitalCondition,
    healthCondition: body.healthCondition ?? data.people[index].healthCondition,
    deathCause: body.deathCause ?? data.people[index].deathCause,
    photo: body.photo ?? data.people[index].photo,
    photos: Array.isArray(body.photos) ? body.photos : data.people[index].photos,
    videos: Array.isArray(body.videos) ? body.videos : data.people[index].videos,
    documents: Array.isArray(body.documents) ? body.documents : data.people[index].documents,
    bio: body.bio ?? data.people[index].bio,
    events: Array.isArray(body.events) ? body.events : data.people[index].events,
    sources: Array.isArray(body.sources) ? body.sources : data.people[index].sources,
    memories: Array.isArray(body.memories) ? body.memories : data.people[index].memories,
    confidential:
      typeof body.confidential === "boolean" ? body.confidential : data.people[index].confidential,
    privateFields: Array.isArray(body.privateFields)
      ? body.privateFields
      : data.people[index].privateFields,
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
