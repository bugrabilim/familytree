import type { TreeRole } from "../types/user";

/**
 * ROL YETKİLERİ — iki kademe (madde 35, ikinci tur).
 *
 * `yonetici` ağacı kuran hesap; `uye` okuyan ve ÖNEREN herkes. Aradaki tek
 * fark yazma yetkisi değil, yazmanın YOLU: üyenin her değişikliği öneri
 * kuyruğundan geçip yöneticinin onayıyla gerçekleşiyor.
 *
 * ## Hiyerarşi neden kalktı
 *
 * Burada sıralı bir dizi (`ORDER`) ve `roleAtLeast` vardı; dört kademe için
 * gerekliydi. İkiye inince taşıdığı tek bilgi "yonetici > uye" oldu ve bir
 * dizinin indeksini karşılaştırmak, doğrudan eşitlik denetiminden ne daha
 * okunur ne daha güvenli. Dizi kaldırıldı: araya kademe sokmanın sessizce
 * kapı kaydırma riski de onunla birlikte gitti.
 */

/** Ağacı kuran hesap mı? Doğrudan yazan, karar veren, üye yöneten kademe. */
export function isYonetici(role: TreeRole | undefined | null): boolean {
  return role === "yonetici";
}

/**
 * Var olanı DOĞRUDAN değiştirme/silme ve yeni kayıt açma yetkisi.
 *
 * Artık yalnız yöneticide. Üyenin yolu öneri; bu ayrım rolün bütün varlık
 * sebebi ve `canEdit`ten geçen her uç, üyeye kapalı demek.
 */
export function canEdit(role: TreeRole | undefined | null): boolean {
  return isYonetici(role);
}

/** Üye ve davet yönetimi — yalnız yönetici. */
export function canManage(role: TreeRole | undefined | null): boolean {
  return isYonetici(role);
}

/**
 * ÖNERİ açabilir mi? Ağacın her üyesi açabilir.
 *
 * `canContribute`in yerini aldı ve anlamı DEĞİŞTİ: o "doğrudan ekleyebilir"
 * demekti, bu "önerebilir" demek. Ad da değişti, çünkü aynı adı bırakıp
 * anlamını kaydırmak, çağrı yerlerini okuyan birine eski anlamı düşündürürdü
 * — ve o yerlerden biri yanlış anlaşılırsa üye doğrudan yazar hâle gelirdi.
 */
export function canPropose(role: TreeRole | undefined | null): boolean {
  return role === "yonetici" || role === "uye";
}

/**
 * Bu kişiyi DOĞRUDAN düzenleyebilir mi?
 *
 * Artık sahiplik istisnası YOK ve imzadan da kalktı. Önceki kademede katkı
 * verici kendi eklediği kaydı düzeltebiliyordu; yeni modelde üyenin
 * EKLEMESİ de onaydan geçtiği için "kendi eklediği" diye doğrudan yazılmış
 * bir kayıt zaten oluşmuyor.
 *
 * Parametreleri "ileride lazım olur" diye tutmadım: kullanılmayan bir
 * parametre, çağıranlara hâlâ bir kural varmış izlenimi verir ve o izlenim
 * yanlış yerde güvene dönüşür. Gerekirse geri eklemek kolay.
 */
export function canEditPerson(role: TreeRole | undefined | null): boolean {
  return canEdit(role);
}
