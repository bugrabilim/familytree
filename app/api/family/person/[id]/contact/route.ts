import { NextRequest, NextResponse } from "next/server";
import { getFamilyData, saveFamilyData, versionMismatch } from "@/lib/blob";
import { resolveActiveTree } from "@/lib/tree-context";
import { canEdit } from "@/lib/roles";
import { applyContactChange, planContactChange } from "@/lib/contact-consent";

export const dynamic = "force-dynamic";

/**
 * AĞAÇTAKİ KİŞİNİN E-POSTA ADRESİ — kendi ucu (madde 47/48 uzantısı).
 *
 * ## Neden kişi rotasının içinde değil
 *
 * Adres, ağaç yükünde TAŞINMIYOR: `lib/privacy.ts`teki `viewPerson` dördünü
 * de koşulsuz siliyor, çünkü o yük ağacın bütün üyelerine ve paylaşım
 * bağlantısını açan herkese gidiyor. Adres oraya binseydi tek bir paylaşım
 * bağlantısı, ağaçtaki herkesin adresini dışarı taşırdı.
 *
 * Taşınmadığı için de formun onu ayrı sorması gerekiyor — bu uç o yüzden var.
 * Dar bir uç olması bir yan etki değil, tasarımın kendisi: adres yalnız onu
 * yazabilen kişiye, yalnız açıkça istendiğinde gidiyor.
 *
 * ## Neden alan kayıt defterinde değil
 *
 * `lib/person-fields.ts` düz metin birleştirmesi yapıyor ("boş temizler,
 * değer ayarlar"). Buradaki kural onunla ifade edilemez: adres DEĞİŞİRSE
 * onay sıfırlanmalı. Kayıt defterinden geçseydi, onaylı bir adresin üstüne
 * başka bir adres yazılır ve o kişi hiç onay vermeden "onaylı" görünürdü.
 */

const conflict = () =>
  NextResponse.json(
    { error: "Ağaç bu sırada başka bir yerde değişti. Sayfayı yenileyip tekrar deneyin." },
    { status: 409 }
  );

const forbidden = () =>
  NextResponse.json({ error: "Bu işlem için düzenleme yetkiniz yok." }, { status: 403 });

async function editorCtx(id: string) {
  const ctx = await resolveActiveTree();
  if (!ctx.ok) return { error: NextResponse.json({ error: "Yetkisiz" }, { status: ctx.status }) };
  if (!canEdit(ctx.role)) return { error: forbidden() };
  const data = await getFamilyData(ctx.treeId, { skipCache: true });
  const index = data.people.findIndex((p) => p.id === id);
  if (index === -1) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  return { ctx, data, index };
}

/** Formun doldurması için: adres + onay durumu. Jeton özeti DÖNMEZ. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await editorCtx(id);
  if ("error" in r) return r.error;
  const p = r.data.people[r.index];
  return NextResponse.json({
    contactEmail: p.contactEmail ?? "",
    contactConsent: p.contactConsent ?? null,
    contactAskedAt: p.contactAskedAt ?? null,
  });
}

/**
 * Adresi yazar / temizler. Onay durumunu KULLANICI belirleyemez — yalnız
 * adresin sahibi kendi tıklamasıyla belirler; buradan gelen `contactConsent`
 * gibi alanlar okunmuyor bile.
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await editorCtx(id);
  if ("error" in r) return r.error;

  let body: { contactEmail?: unknown };
  try {
    body = (await req.json()) as { contactEmail?: unknown };
  } catch {
    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  }

  /*
   * İYİMSER KİLİT. Bu uç tek bir alan yazıyor ama YAZDIĞI ŞEY ağacın
   * tamamı: `data` okunup bütün olarak geri kaydediliyor. Kilitsiz olsaydı,
   * bu arada başka bir düzenleyicinin eklediği kişi sessizce silinirdi —
   * "küçük bir alan" olması, yazmanın küçük olduğu anlamına gelmiyor.
   */
  if (versionMismatch(req, r.data.updatedAt)) return conflict();

  const kisi = r.data.people[r.index];
  const plan = planContactChange(kisi, body.contactEmail);
  if (plan.kind === "gecersiz")
    return NextResponse.json({ error: "Geçerli bir e-posta adresi yazın." }, { status: 400 });

  const yeni = applyContactChange(plan);
  // Değişiklik yoksa yazmıyoruz: gereksiz bir blob sürümü üretmenin anlamı yok.
  if (!yeni)
    return NextResponse.json({
      contactEmail: kisi.contactEmail ?? "",
      contactConsent: kisi.contactConsent ?? null,
      contactAskedAt: kisi.contactAskedAt ?? null,
    });

  r.data.people[r.index] = {
    ...kisi,
    contactEmail: yeni.contactEmail || undefined,
    contactConsent: yeni.contactConsent,
    contactTokenHash: yeni.contactTokenHash,
    contactAskedAt: yeni.contactAskedAt,
  };
  await saveFamilyData(r.ctx.treeId, r.data, { by: r.ctx.authorId });

  return NextResponse.json({
    contactEmail: yeni.contactEmail ?? "",
    contactConsent: yeni.contactConsent ?? null,
    contactAskedAt: null,
  });
}
