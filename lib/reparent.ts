import type { Person } from "../types/family.ts";
import { descendantDepths } from "./relations.ts";
import { isAssociate } from "./associates.ts";

/**
 * Tuval üstü ebeveyn değiştirme — saf mantık.
 *
 * Bu özelliğin gerçek riski arayüz değil, SESSİZ VERİ BOZULMASI. Ağaçta
 * kartlar zaten serbestçe sürükleniyor (oturum içi konum); yanlış bir
 * bırakma bir kişinin soyunu değiştirirse kimse fark etmez, ama akrabalık
 * hesabı, kuşak sayımı, kan derecesi ve kitap — hepsi sessizce yanlışlanır.
 *
 * Bu yüzden bırakma İŞLEM DEĞİL, ÖNERİ üretir: bu dosya bir `ReparentPlan`
 * döndürür, arayüz onu kullanıcıya okur, kullanıcı onaylarsa yazılır.
 * Buradaki her `error` bir onay ekranı yerine bir ret demektir.
 */

export type ReparentError =
  /** Kişi kendisinin ebeveyni olamaz. */
  | "ayni"
  /** Kişilerden biri bulunamadı (silinmiş / süzülmüş). */
  | "yok"
  /** Çevre kişisi soy bağına giremez — akrabalık motoruna katılmıyorlar. */
  | "cevre"
  /** Döngü: yeni ebeveyn, çocuğun kendi soyundan geliyor. */
  | "dongu"
  /** Bu bağ zaten var. */
  | "zaten"
  /** Çocuğun iki ebeveyni dolu; hangisinin yerine geçeceği seçilmeli. */
  | "secim";

export interface ReparentPlan {
  childId: string;
  parentId: string;
  /** Yerine geçilen ebeveyn (varsa) — onay ekranında adıyla gösterilir. */
  replaces?: string;
  /** Uygulanınca çocuğun yeni `parentIds` listesi. */
  nextParentIds: string[];
}

export type ReparentResult =
  | { ok: true; plan: ReparentPlan }
  /** `secim` hatasında çocuğun mevcut ebeveynleri — kullanıcı birini seçer. */
  | { ok: false; error: ReparentError; current?: string[] };

/**
 * Bir ebeveyn değişikliğini planlar; geçersizse nedeniyle birlikte reddeder.
 *
 * `replace` verilmezse ve çocuğun iki ebeveyni doluysa `secim` döner — üçüncü
 * bir ebeveyn EKLEMEK yerine hangisinin yerine geçileceğini sormak doğru.
 * Sessizce birini atmak tam da "sessiz veri bozulması" olurdu; üçüncüyü
 * eklemek ise modeli (en fazla iki ebeveyn) bozardı.
 */
export function planReparent(
  childId: string,
  parentId: string,
  people: readonly Person[],
  opts: { replace?: string } = {}
): ReparentResult {
  if (childId === parentId) return { ok: false, error: "ayni" };

  const list = people as Person[];
  const child = list.find((p) => p.id === childId);
  const parent = list.find((p) => p.id === parentId);
  if (!child || !parent) return { ok: false, error: "yok" };

  // Çevre kişileri soy ağacına, kuşak ve kan derecesi hesabına KATILMIYOR;
  // onlara ebeveyn bağı kurmak o ayrımı sessizce delerdi.
  if (isAssociate(child) || isAssociate(parent)) return { ok: false, error: "cevre" };

  if (child.parentIds.includes(parentId)) return { ok: false, error: "zaten" };

  /*
   * DÖNGÜ. Bir kişinin kendi torununu ebeveyni yapmak ağacı sonsuz bir
   * halkaya çevirir: kuşak hesabı, ata yürüyüşü ve yerleşim algoritması
   * durmadan dönerdi. `descendantDepths` çocuğun altındaki herkesi verir;
   * yeni ebeveyn oradaysa bağ döngü kurar.
   */
  if (descendantDepths(childId, list).has(parentId)) return { ok: false, error: "dongu" };

  const mevcut = child.parentIds;
  if (mevcut.length < 2) {
    return { ok: true, plan: { childId, parentId, nextParentIds: [...mevcut, parentId] } };
  }

  const replace = opts.replace;
  if (!replace) return { ok: false, error: "secim", current: [...mevcut] };
  if (!mevcut.includes(replace)) return { ok: false, error: "yok" };

  return {
    ok: true,
    plan: {
      childId,
      parentId,
      replaces: replace,
      // Sıra korunuyor: yerine geçen, çıkanın yerinde durur. Ebeveyn sırası
      // görünürde anlamsız ama kart yerleşimini etkiliyor; korumak, onaydan
      // sonra ağacın "zıplamamasını" sağlıyor.
      nextParentIds: mevcut.map((id) => (id === replace ? parentId : id)),
    },
  };
}

/**
 * Planı çocuğun güncelleme yüküne çevirir.
 *
 * `parentLinks` de temizleniyor. Bu ayrıntı gözden kaçarsa sessiz bozulma
 * doğar: kopan ebeveyne ait `kind`/`estranged`/`note` kaydı kişide kalır ve
 * ileride o kişiye yeniden ebeveyn olarak eklenirse eski, alakasız notu
 * ("1999 depreminde evlat edindi") diriltir.
 */
export function applyReparent(child: Person, plan: ReparentPlan): Partial<Person> {
  const out: Partial<Person> = { parentIds: plan.nextParentIds };

  if (child.parentLinks) {
    const kalan = Object.fromEntries(
      Object.entries(child.parentLinks).filter(([pid]) => plan.nextParentIds.includes(pid))
    );
    /*
     * Boşalırsa alanı `undefined` ile TEMİZLİYORUZ, boş nesne bırakmıyoruz.
     * Kişi rotası `?? existing` kullanıyor; boş nesne göndermek "değişmedi"
     * değil "boş" demek olsun diye alan açıkça siliniyor.
     */
    out.parentLinks = Object.keys(kalan).length ? kalan : undefined;
  }

  return out;
}

/** Onay ekranı için: bu plan neyi bozuyor/kuruyor. */
export interface ReparentSummary {
  childName: string;
  parentName: string;
  /** Kopacak bağın diğer ucu — varsa. */
  removedName?: string;
}

export function summarize(
  plan: ReparentPlan,
  people: readonly Person[],
  nameOf: (p: Person) => string
): ReparentSummary {
  const ad = (id?: string) => {
    if (!id) return undefined;
    const p = (people as Person[]).find((x) => x.id === id);
    return p ? nameOf(p) : undefined;
  };
  return {
    childName: ad(plan.childId) ?? "",
    parentName: ad(plan.parentId) ?? "",
    ...(plan.replaces ? { removedName: ad(plan.replaces) } : {}),
  };
}
