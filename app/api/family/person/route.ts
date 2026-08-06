import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getFamilyData, saveFamilyData } from "@/lib/blob";
import type { Person } from "@/types/family";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;
  const body = await req.json();
  const data = await getFamilyData(userId);

  const person: Person = {
    id: crypto.randomUUID(),
    firstName: body.firstName ?? "",
    lastName: body.lastName ?? "",
    gender: body.gender ?? "unknown",
    birthDate: body.birthDate || undefined,
    deathDate: body.deathDate || undefined,
    birthPlace: body.birthPlace || undefined,
    photo: body.photo || undefined,
    bio: body.bio || undefined,
    parentIds: Array.isArray(body.parentIds) ? body.parentIds : [],
    spouseIds: Array.isArray(body.spouseIds) ? body.spouseIds : [],
  };

  data.people.push(person);

  for (const spouseId of person.spouseIds) {
    const spouse = data.people.find((p) => p.id === spouseId);
    if (spouse && !spouse.spouseIds.includes(person.id)) {
      spouse.spouseIds.push(person.id);
    }
  }

  await saveFamilyData(userId, data);
  return NextResponse.json(person, { status: 201 });
}
