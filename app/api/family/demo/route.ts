import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { saveFamilyData } from "@/lib/blob";
import { canEdit } from "@/lib/roles";
import { DEMO_PEOPLE } from "@/lib/demo-data";

/**
 * Demo ağacını yükler. Mevcut veriyi değiştirir — arayüz onay alır.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  if (!canEdit(session.user.role))
    return NextResponse.json({ error: "Bu işlem için düzenleme yetkiniz yok." }, { status: 403 });

  await saveFamilyData(session.user.id, {
    people: DEMO_PEOPLE,
    updatedAt: new Date().toISOString(),
  });

  return NextResponse.json({ count: DEMO_PEOPLE.length });
}
