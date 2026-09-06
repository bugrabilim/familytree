import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveActiveTree } from "@/lib/tree-context";
import { canPropose } from "@/lib/roles";
import { withdraw } from "@/lib/proposals";
import { findProposal, replaceProposal } from "@/lib/proposal-store";

export const dynamic = "force-dynamic";

/**
 * ÖNERİYİ GERİ ÇEKME — madde 35/D.
 *
 * ## Neden AYRI bir uç, kuyruğun PATCH'ine eklenmedi
 *
 * `PATCH /api/family/proposals` karar ucu ve `canEdit` istiyor; istemesi de
 * şart, çünkü `canPropose` yetseydi üye kendi önerisini onaylayıp yazma
 * kapısını tamamen dolanırdı — öneri akışının bütün amacı buharlaşırdı.
 * Geri çekme ise tam tersi yetkiye ait: karar verene değil, ÖNERENE.
 *
 * İkisi tek gövdeye sığdırılsaydı o gövdede hem `canPropose` hem `canEdit`
 * dalları olurdu ve hangi dalın hangi kapıdan geçtiği, gövde büyüdükçe
 * okunması gereken bir şeye dönerdi. Ayrı dosyada her ucun tek bir kapısı
 * var: burası `canPropose`, orası `canEdit`. Kuyruğun kapı testi de bunu
 * kilitliyor ("PATCH dalında `canPropose` hiç geçmiyor").
 *
 * ## Ağaca dokunmuyor
 *
 * Geri çekme yalnız öneri kaydının durumunu değiştiriyor; `saveFamilyData`
 * burada YOK ve olmamalı. Bekleyen bir öneri ağaca hiç uygulanmadığı için
 * geri alınacak bir şey de yok.
 */
export async function POST(req: NextRequest) {
  const ctx = await resolveActiveTree();
  if (!ctx.ok) return NextResponse.json({ error: "Yetkisiz" }, { status: ctx.status });
  if (!canPropose(ctx.role)) return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { id?: unknown };
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });

  const p = await findProposal(ctx.treeId, id);
  if (!p) return NextResponse.json({ error: "Öneri bulunamadı" }, { status: 404 });

  const session = await auth();
  const cekildi = withdraw(p, ctx.authorId, session?.user?.name ?? "", new Date().toISOString());
  if (!cekildi.ok)
    return NextResponse.json(
      {
        error:
          cekildi.fail === "sahibi-degil"
            ? "Yalnız kendi önerini geri çekebilirsin."
            : "Bu öneri zaten karara bağlanmış.",
      },
      /*
       * Sahibi olmamak 403, karara bağlanmış olmak 409: ikisi farklı şeyler
       * ve istemci ikisine farklı davranıyor — 409'da kuyruğu tazelemek
       * kullanıcıya olan biteni gösteriyor, 403'te tazelemenin faydası yok.
       */
      { status: cekildi.fail === "sahibi-degil" ? 403 : 409 }
    );

  const yazildi = await replaceProposal(ctx.treeId, cekildi.proposal);
  if (!yazildi) return NextResponse.json({ error: "Öneri bulunamadı" }, { status: 404 });
  return NextResponse.json({ ok: true, proposal: cekildi.proposal });
}
