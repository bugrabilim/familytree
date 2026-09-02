import { NextRequest, NextResponse } from "next/server";
import { resolveActiveTree } from "@/lib/tree-context";
import { canEdit } from "@/lib/roles";
import {
  addLetter, countLetters, deleteLetter, readLetters, updateLetter,
} from "@/lib/letter-store";
import { MAX_LETTERS, publicView } from "@/lib/letters";
import type { Letter } from "@/types/letter";

export const dynamic = "force-dynamic";

/**
 * Zaman kilitli mektuplar.
 *
 * KİLİT BURADA UYGULANIR. Açılma tarihi gelmemiş bir mektubun metni yanıta
 * HİÇ konmaz — istemciye gönderip "gösterme" demek kilit değildir: metin ağ
 * sekmesinde, tarayıcı önbelleğinde ve sayfa kaynağında durur. `readLetters`
 * ve `publicView` bu yüzden tek kapıdır; yazma uçları da yanıtı onlardan
 * geçirir, yeni kaydedilen kilitli bir mektubun metnini geri yansıtmasınlar.
 *
 *  GET    → mektuplar (kilitlilerin metni yok)
 *  POST   → yeni mektup       (düzenleyici)
 *  PUT    → mektubu güncelle  (düzenleyici)
 *  DELETE → mektubu sil       (düzenleyici)
 */

async function guard(edit: boolean) {
  const ctx = await resolveActiveTree();
  if (!ctx.ok) return { error: NextResponse.json({ error: "Yetkisiz" }, { status: ctx.status }) };
  if (edit && !canEdit(ctx.role))
    return {
      error: NextResponse.json({ error: "Bu işlem için düzenleme yetkiniz yok." }, { status: 403 }),
    };
  return { treeId: ctx.treeId };
}

async function body(req: NextRequest): Promise<Partial<Letter> & { id?: string }> {
  try {
    return (await req.json()) as Partial<Letter> & { id?: string };
  } catch {
    return {};
  }
}

export async function GET() {
  const g = await guard(false);
  if ("error" in g) return g.error;
  return NextResponse.json({ letters: await readLetters(g.treeId) });
}

export async function POST(req: NextRequest) {
  const g = await guard(true);
  if ("error" in g) return g.error;
  const letter = await addLetter(g.treeId, await body(req));
  if (!letter) {
    const n = await countLetters(g.treeId);
    return NextResponse.json(
      {
        error:
          n >= MAX_LETTERS
            ? `Mektup kutusu dolu (en fazla ${MAX_LETTERS}).`
            : "Mektubun bir başlığı ve geçerli bir açılma tarihi olmalı.",
      },
      { status: 400 }
    );
  }
  // Yanıt da kapıdan geçer: kendi yazdığın mektubu bile kilitliyken geri
  // yansıtmayız — yansıtırsak "kilitli metin sunucudan çıkmaz" sözü delinir
  // ve bir sonraki okumada olmayan bir alan burada var olurdu.
  return NextResponse.json({ letters: await readLetters(g.treeId), letter: publicView(letter) });
}

export async function PUT(req: NextRequest) {
  const g = await guard(true);
  if ("error" in g) return g.error;
  const input = await body(req);
  if (!input.id) return NextResponse.json({ error: "id gerekli" }, { status: 400 });
  const letter = await updateLetter(g.treeId, input.id, input);
  if (!letter)
    return NextResponse.json(
      { error: "Mektup bulunamadı ya da başlık/tarih geçersiz." },
      { status: 404 }
    );
  return NextResponse.json({ letters: await readLetters(g.treeId), letter: publicView(letter) });
}

export async function DELETE(req: NextRequest) {
  const g = await guard(true);
  if ("error" in g) return g.error;
  const input = await body(req);
  if (!input.id) return NextResponse.json({ error: "id gerekli" }, { status: 400 });
  const silindi = await deleteLetter(g.treeId, input.id);
  if (!silindi) return NextResponse.json({ error: "Mektup bulunamadı" }, { status: 404 });
  return NextResponse.json({ letters: await readLetters(g.treeId) });
}
