import { kindOf, type Proposal } from "@/lib/proposals";
import { addRecipe, type RecipeInput } from "@/lib/recipe-store";
import { addGathering } from "@/lib/gathering-store";
import { addLetter } from "@/lib/letter-store";
import type { Gathering } from "@/types/gathering";
import type { Letter } from "@/types/letter";

/**
 * ONAYLANAN "icerik" ÖNERİSİNİ DEPOSUNA YAZAR (madde 37).
 *
 * ## Neden `applyToTree`ten ayrı
 *
 * Kişi önerileri ağacın anlık görüntüsünü YERİNDE değiştiriyor ve çağıran
 * sonunda tek bir `saveFamilyData` yapıyor — bu yüzden `applyToTree`
 * eşzamanlı (senkron) ve yazma yapmıyor. İçerik önerisi ise BAŞKA bir
 * dosyaya yazıyor: tarif defteri, etkinlikler, mektuplar ayrı bloblar.
 * İkisini tek işleve sığdırmak, senkron bir uygulayıcıyı asenkron yapıp her
 * çağıranı değiştirmek ve "ağaç değişti mi" sorusunu bulanıklaştırmak
 * olurdu.
 *
 * ## Derin doğrulama YOK — deponun kendi işlevi çağrılıyor
 *
 * Tarifin adı, mektubun açılış tarihi, etkinliğin sınırları… hepsi
 * depoların içinde. Buraya kopyalansaydı iki kural zamanla ayrışır ve
 * kullanıcının kendi eklediğinde geçen bir kayıt, öneriyle eklendiğinde
 * reddedilirdi (ya da tersi). Depo `null` dönerse onay reddediliyor ve
 * öneri kuyrukta "bekliyor" kalıyor — kurtarılabilir.
 *
 * Her onay kendi deposuna ayrı yazıyor; depoların toplu ekleme işlevi yok.
 * Toplu onayda bu N yazma demek, ama gerçek kullanımda bir kuyrukta yüzlerce
 * tarif birikmiyor; üç yeni depo işlevi eklemek bugün karşılığı olmayan bir
 * karmaşıklık olurdu.
 */
export async function applyContent(
  treeId: string,
  p: Proposal
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (kindOf(p) !== "icerik" || !p.content) return { ok: false, error: "Öneri içerik taşımıyor." };
  const { store, item } = p.content;

  switch (store) {
    case "recipes": {
      const r = await addRecipe(treeId, item as RecipeInput);
      return r ? { ok: true } : { ok: false, error: "Tarif eklenemedi (defter dolu ya da adı boş)." };
    }
    case "gatherings": {
      const g = await addGathering(treeId, item as Partial<Gathering>);
      return g ? { ok: true } : { ok: false, error: "Etkinlik eklenemedi (liste dolu ya da başlığı boş)." };
    }
    case "letters": {
      const l = await addLetter(treeId, item as Partial<Letter>);
      return l ? { ok: true } : { ok: false, error: "Mektup eklenemedi (liste dolu ya da içeriği boş)." };
    }
  }
}
