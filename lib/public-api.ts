import type { Person } from "../types/family.ts";

/**
 * Herkese açık okuma API'si — yanıt biçimi (v1).
 *
 * ## Neden `Person`i olduğu gibi döndürmüyoruz
 *
 * Bir genel API SÖZLEŞMEDİR. `Person` ise ürünle birlikte büyüyen bir iç
 * tür: bu depoda son turlarda `lineage`, `publicVisibility`, `birthTime`
 * gibi alanlar eklendi ve daha da eklenecek. Maskelenmiş `Person`i doğrudan
 * döndürseydik, ileride eklenen HER alan kimse karar vermeden genel API'nin
 * çıktısına girerdi — gizlilik maskesinden geçse bile, kimsenin
 * yayımlamaya karar vermediği bir alan yayımlanmış olurdu.
 *
 * Bu yüzden burada AÇIK bir yansıtma var: yalnız aşağıda adı geçen alanlar
 * dışarı çıkar. Yeni bir `Person` alanı varsayılan olarak DIŞARIDA kalır.
 * Aynı gerekçe `maskPerson`ın beyaz liste olmasının gerekçesiyle aynı.
 *
 * ## Sürümleme
 *
 * Yol baştan `/api/v1/...`. Biçimi değiştirmek gerekirse `/v2` açılır;
 * mevcut tüketiciler kırılmaz. Sürümsüz bir genel API, ilk değişiklikte
 * başkasının kodunu bozar.
 */

export const PUBLIC_API_VERSION = "1";

/** v1 kişi kaydı. Alan eklemek GERİYE UYUMLU, çıkarmak değildir. */
export interface PublicPerson {
  id: string;
  firstName: string;
  lastName: string;
  gender: string;
  /** İnsan-okur kod (varsa). */
  code?: string;
  nickname?: string;
  patronymic?: string;
  birthDate?: string;
  deathDate?: string;
  birthPlace?: string;
  occupation?: string;
  /** Ebeveyn kimlikleri (en fazla iki). */
  parentIds: string[];
  spouseIds: string[];
  formerSpouseIds?: string[];
}

export interface PublicTree {
  version: string;
  /** Ağacın görünen adı (paylaşım bağlantısında verilen). */
  name?: string;
  /** Yaşayanlar gizli mi — tüketici eksik veriyi yorumlayabilsin diye. */
  hideLiving: boolean;
  count: number;
  people: PublicPerson[];
}

const metin = (v: unknown): string | undefined => {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t || undefined;
};

/**
 * Maskelenmiş bir `Person`i v1 kaydına yansıtır.
 *
 * GİRDİ ZATEN MASKELENMİŞ OLMALI. Bu işlev gizlilik uygulamaz, yalnız
 * sözleşmeyi dar tutar; iki iş birbirine karıştırılmamalı. Maskeleme
 * `lib/privacy.ts` ve `lib/public-visibility.ts`in işi ve rotada ondan
 * ÖNCE çalışır.
 */
export function toPublicPerson(p: Person): PublicPerson {
  const out: PublicPerson = {
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    gender: p.gender,
    parentIds: [...p.parentIds],
    spouseIds: [...p.spouseIds],
  };
  const kod = metin(p.code);
  if (kod) out.code = kod;
  const lakap = metin(p.nickname);
  if (lakap) out.nickname = lakap;
  const baba = metin(p.patronymic);
  if (baba) out.patronymic = baba;
  const dogum = metin(p.birthDate);
  if (dogum) out.birthDate = dogum;
  const olum = metin(p.deathDate);
  if (olum) out.deathDate = olum;
  const yer = metin(p.birthPlace);
  if (yer) out.birthPlace = yer;
  const meslek = metin(p.occupation);
  if (meslek) out.occupation = meslek;
  if (p.formerSpouseIds?.length) out.formerSpouseIds = [...p.formerSpouseIds];
  return out;
}

export function toPublicTree(
  people: readonly Person[],
  opts: { name?: string; hideLiving: boolean }
): PublicTree {
  const list = (people as Person[]).map(toPublicPerson);
  return {
    version: PUBLIC_API_VERSION,
    ...(opts.name ? { name: opts.name } : {}),
    hideLiving: opts.hideLiving,
    count: list.length,
    people: list,
  };
}

/**
 * v1'de dışarı çıkan alanların listesi — testin karşılaştırma tabanı.
 *
 * Elle tutulan bir liste, ama burada AMACI bu: yeni bir alan eklendiğinde
 * testin kırılmasını ve birinin "bu gerçekten genel mi olmalı" diye
 * düşünmesini istiyoruz. Sessizce genişleyen bir sözleşme istemiyoruz.
 */
export const PUBLIC_PERSON_FIELDS: readonly string[] = [
  "id",
  "firstName",
  "lastName",
  "gender",
  "code",
  "nickname",
  "patronymic",
  "birthDate",
  "deathDate",
  "birthPlace",
  "occupation",
  "parentIds",
  "spouseIds",
  "formerSpouseIds",
];
