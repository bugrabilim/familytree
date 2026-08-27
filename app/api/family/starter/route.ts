import { NextResponse } from "next/server";
import { getFamilyData, saveFamilyData } from "@/lib/blob";
import { resolveActiveTree } from "@/lib/tree-context";
import { canEdit } from "@/lib/roles";
import { buildStarterTree } from "@/lib/starter";
import { nextCode } from "@/lib/code";
import type { Person } from "@/types/family";

export const dynamic = "force-dynamic";

/**
 * Başlangıç iskeleti (Madde: yeni kullanıcı deneyimi) — boş ağaca kendisi,
 * anne–baba ve dört büyükanne/büyükbaba için doldurulacak boş kartlar ekler.
 * Yalnız düzenleyici ve YALNIZ ağaç boşken; var olan veriyi asla ezmez.
 */
export async function POST() {
  const ctx = await resolveActiveTree();
  if (!ctx.ok) return NextResponse.json({ error: "Yetkisiz" }, { status: ctx.status });
  if (!canEdit(ctx.role))
    return NextResponse.json({ error: "Bu işlem için düzenleme yetkiniz yok." }, { status: 403 });

  const data = await getFamilyData(ctx.treeId, { skipCache: true });
  if (data.people.length > 0)
    return NextResponse.json({ error: "Ağaç zaten dolu." }, { status: 409 });

  const people: Person[] = buildStarterTree();
  for (let i = 0; i < people.length; i++) {
    people[i] = { ...people[i], code: nextCode(people.slice(0, i)), entrySource: "iskelet" };
  }

  await saveFamilyData(ctx.treeId, { people, updatedAt: new Date().toISOString() });
  return NextResponse.json({ count: people.length });
}
