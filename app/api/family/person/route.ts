import { NextRequest, NextResponse } from "next/server";
import { getFamilyData, saveFamilyData, versionMismatch } from "@/lib/blob";
import { resolveActiveTree } from "@/lib/tree-context";
import { canContribute, canEdit } from "@/lib/roles";
import { createPerson, type CreateRelation } from "@/lib/person-create";

export type RelationType = "parent" | "child" | "spouse" | "sibling" | "associate";

export async function POST(req: NextRequest) {
  const ctx = await resolveActiveTree();
  if (!ctx.ok) return NextResponse.json({ error: "Yetkisiz" }, { status: ctx.status });
  /*
   * EKLEME kapısı (madde 35) — `canEdit` değil `canContribute`.
   *
   * Katkı vericinin yapabildiği tek doğrudan yazma işi bu: yeni kayıt
   * açmak. Var olana dokunmak (PUT/DELETE) hâlâ `canEdit` istiyor; oraya
   * onun yolu değişiklik önerisinden geçiyor.
   */
  if (!canContribute(ctx.role))
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

  /*
   * OLUŞTURMA `lib/person-create.ts`te — öneri akışının onay yolu da AYNI
   * işlevi çağırıyor. Kopyalansaydı ikisi ayrışırdı: kullanıcı kendi
   * eklediğinde kurulan bir bağ, öneriyle eklendiğinde kurulmazdı ve fark
   * aylar sonra tek yönlü kalmış bir eş bağı olarak ortaya çıkardı.
   */
  const sonuc = createPerson(data, {
    fields: body as Record<string, unknown>,
    relation: body.relation as CreateRelation | undefined,
    /*
     * İLİŞKİ DİZİLERİ TAM YETKİDE. Bu diziler var olan kişilerin kayıtlarına
     * yazıyor; gövdeden serbest bırakıldığında katkı verici tek istekle
     * ağaçtaki her kaydın eş listesine kendi eklediği kişiyi sokabiliyordu ve
     * silme yetkisi olmadığı için geri de alamıyordu.
     */
    allowLinkArrays: canEdit(ctx.role),
    addedBy: ctx.authorId,
  });
  if (!sonuc.ok)
    return NextResponse.json(
      {
        error:
          sonuc.fail === "iki-ebeveyn"
            ? "Bu kişinin zaten iki ebeveyni var"
            : "Bağlanacak kişi bulunamadı",
      },
      { status: 400 }
    );
  const person = sonuc.person;

  await saveFamilyData(userId, data, { by: ctx.authorId });
  return NextResponse.json(person, { status: 201 });
}
