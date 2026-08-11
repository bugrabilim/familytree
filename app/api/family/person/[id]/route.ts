import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getFamilyData, saveFamilyData } from "@/lib/blob";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;
  const { id } = await params;
  const body = await req.json();
  const data = await getFamilyData(userId);

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
    congenitalCondition: body.congenitalCondition ?? data.people[index].congenitalCondition,
    healthCondition: body.healthCondition ?? data.people[index].healthCondition,
    deathCause: body.deathCause ?? data.people[index].deathCause,
    photo: body.photo ?? data.people[index].photo,
    bio: body.bio ?? data.people[index].bio,
    events: Array.isArray(body.events) ? body.events : data.people[index].events,
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
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;
  const { id } = await params;
  const data = await getFamilyData(userId);

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
