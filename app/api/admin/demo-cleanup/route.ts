import { NextResponse } from "next/server";
import { operatorVerdict } from "@/lib/operator-access";
import { auth } from "@/auth";
import { deleteUserRow, findUserById } from "@/lib/users";
import { DEMO_USER_ID } from "@/lib/demo-id";

export const dynamic = "force-dynamic";

/**
 * DEMO KİMLİK SATIRINI SİL — `POST /api/admin/demo-cleanup`.
 *
 * Faz 4'ün (madde 45) kalan tek engeli. Demo artık bir hesap değil vitrin:
 * `lib/demo-account.ts` `users.json`a hiç yazmıyor ve kod o satıra
 * dayanmıyor (#325). Ama KOD'un ona dayanmaması, SATIRIN gitmesi demek
 * değil — üretimde şifre karmasıyla duruyor ve `users.json` emekliye
 * ayrılana kadar orada duracak. `/api/admin/phase4` bunu `demo-acikta`
 * engeli olarak bildiriyor.
 *
 * ## Neden girdi almıyor
 *
 * Bu uç bir kimlik parametresi KABUL ETMİYOR. Silinecek satır koddaki
 * sabitten geliyor. Sebebi tek: "hangi kullanıcıyı sil" diye soran bir
 * yönetim ucu, yanlış kimlikle çağrıldığında gerçek bir aileyi kimlik
 * sisteminden düşürür. Parametresiz bir uçta o hata YAPILAMAZ — en kötü
 * ihtimalle zaten silinmiş bir satır tekrar silinmeye çalışılır.
 *
 * ## Neden veriyi silmiyor
 *
 * Yalnız KİMLİK satırı gidiyor. Demo ağacı, 366 kişisi, kapak fotoğrafı ve
 * Postgres'teki `trees`/`people` satırları YERİNDE KALIYOR — demo girişi
 * (`signIn("demo")`) bunların hiçbirine `users.json` üzerinden ulaşmıyor.
 *
 * Tekrar çağrılabilir: satır yoksa `removed: false` döner, hata değil.
 */
async function guard() {
  const session = await auth();
  const karar = operatorVerdict(session?.user);
  if (!karar.ok)
    return { error: NextResponse.json({ error: karar.error }, { status: karar.status }) };
  return { ok: true as const };
}

export async function GET() {
  const g = await guard();
  if ("error" in g) return g.error;
  const satir = await findUserById(DEMO_USER_ID);
  return NextResponse.json({
    present: !!satir,
    note: satir
      ? "Demo satırı duruyor. Silmek için bu uca POST gönderin."
      : "Demo satırı yok — yapılacak bir şey kalmamış.",
  });
}

export async function POST() {
  const g = await guard();
  if ("error" in g) return g.error;
  const removed = await deleteUserRow(DEMO_USER_ID);
  return NextResponse.json({
    ok: true,
    removed,
    note: removed
      ? "Demo kimlik satırı silindi. Ağaç ve kişiler yerinde; demo girişi etkilenmez."
      : "Satır zaten yoktu; değişiklik olmadı.",
  });
}
