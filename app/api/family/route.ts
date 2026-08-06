import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getFamilyData } from "@/lib/blob";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await getFamilyData(session.user.id);
  return NextResponse.json(data);
}
