/**
 * Aile Kitabı önsözü — ağacın verisinden (yıl aralığı + en sık şehirler)
 * anlatısal, tarihsel bir metin üretir. SAF mantık (server-only değil, test
 * edilebilir). AI gerektirmez; dönem notları verideki yıllara göre seçilir.
 */

export interface PrefaceInput {
  familyName?: string;
  from?: number;
  to?: number;
  /** En sık geçen yer adları (çoktan aza), en fazla ~5. */
  places?: string[];
  lang?: "tr" | "en";
}

interface Era {
  start: number;
  end: number;
  tr: string;
  en: string;
}

/** Osmanlı sonu → Cumhuriyet dönemi başlıca olaylar. Aralığı ağacın yıllarıyla
 *  kesişenler önsöze eklenir. */
const ERAS: Era[] = [
  { start: 1853, end: 1856, tr: "Kırım Savaşı'nın çalkantılı yıllarında", en: "in the turbulent years of the Crimean War" },
  { start: 1877, end: 1878, tr: "93 Harbi'nin (1877–78 Osmanlı-Rus Savaşı) yol açtığı büyük göç dalgalarında", en: "amid the great migrations caused by the 1877–78 Russo-Turkish War" },
  { start: 1912, end: 1913, tr: "Balkan Savaşları'nın kayıpları ve göçleri arasında", en: "through the losses and displacements of the Balkan Wars" },
  { start: 1914, end: 1918, tr: "I. Dünya Savaşı'nın kıtlık, seferberlik ve ayrılıklarla dolu yıllarında", en: "during the First World War, years of famine, mobilisation and separation" },
  { start: 1919, end: 1923, tr: "Kurtuluş Savaşı'nın ve yeni bir ülkenin doğuşunun tam ortasında", en: "in the very midst of the War of Independence and the birth of a new country" },
  { start: 1923, end: 1938, tr: "genç Cumhuriyet'in kurulduğu ve harflerin, ölçülerin, soyadların değiştiği yıllarda", en: "as the young Republic took shape and letters, measures and surnames all changed" },
  { start: 1939, end: 1945, tr: "II. Dünya Savaşı'nın gölgesinde — ülke savaşa girmese de karne, kıtlık ve Milli Korunma yıllarında", en: "under the shadow of the Second World War — years of rationing and scarcity even as the country stayed out of the fighting" },
  { start: 1950, end: 1970, tr: "köyden kente büyük göçün, ilk yolların ve fabrikaların açıldığı yıllarda", en: "during the great migration from village to city, when the first roads and factories opened" },
  { start: 1999, end: 1999, tr: "1999 Marmara depreminin acısıyla", en: "with the grief of the 1999 Marmara earthquake" },
];

function joinList(items: string[], lang: "tr" | "en"): string {
  if (items.length <= 1) return items[0] ?? "";
  const last = items[items.length - 1];
  const head = items.slice(0, -1).join(", ");
  return lang === "tr" ? `${head} ve ${last}` : `${head} and ${last}`;
}

/** Önsöz paragraflarını döndürür (kitapta alt alta basılır). */
export function generatePreface(input: PrefaceInput): string[] {
  const lang = input.lang === "en" ? "en" : "tr";
  const name = input.familyName?.trim();
  const from = input.from;
  const to = input.to;
  const places = (input.places ?? []).filter((p) => p && p.trim()).slice(0, 4);
  const paras: string[] = [];

  /* 1) Açılış — aile + yıl aralığı */
  if (lang === "tr") {
    const aile = name ? `${name} ailesinin` : "bu ailenin";
    paras.push(
      from && to
        ? `Bu kitap, ${aile} ${from} ile ${to} yılları arasına uzanan hikâyesidir. Sararmış kayıtların ardındaki kuru isimleri, bir zamanlar gerçekten yaşamış, sevmiş, çalışmış ve umut etmiş insanlara dönüştürmek için yazıldı.`
        : `Bu kitap, ${aile} hikâyesidir. Sararmış kayıtların ardındaki kuru isimleri, bir zamanlar gerçekten yaşamış, sevmiş ve umut etmiş insanlara dönüştürmek için yazıldı.`
    );
  } else {
    const fam = name ? `the ${name} family` : "this family";
    paras.push(
      from && to
        ? `This book tells the story of ${fam}, reaching from ${from} to ${to}. It was written to turn the dry names behind yellowed records into people who once truly lived, loved, worked and hoped.`
        : `This book tells the story of ${fam}. It was written to turn the dry names behind yellowed records into people who once truly lived, loved and hoped.`
    );
  }

  /* 2) Yerler */
  if (places.length) {
    const list = joinList(places, lang);
    paras.push(
      lang === "tr"
        ? `Bu aile başta ${list} olmak üzere pek çok toprağa kök saldı. O yerlerin taşı, suyu, rüzgârı ve mevsimleri; doğumlara, düğünlere ve vedalara sessizce şahitlik etti.`
        : `This family put down roots in many lands, above all ${list}. The stone, water, wind and seasons of those places quietly witnessed its births, weddings and farewells.`
    );
  }

  /* 3) Tarihsel dönemler — yıl aralığıyla kesişenler */
  if (from && to) {
    const hits = ERAS.filter((e) => e.end >= from && e.start <= to).map((e) => (lang === "tr" ? e.tr : e.en));
    if (hits.length) {
      const list = joinList(hits.slice(0, 5), lang);
      paras.push(
        lang === "tr"
          ? `Bu ömürler kolay bir çağa denk gelmedi. Aile; ${list} yaşadı. Kışlar sert, yollar uzun, haberler geç geliyordu; yine de her nesil bir sonrakine bir sofra, bir dua ve bir isim bıraktı.`
          : `These lives did not fall in an easy age. The family lived ${list}. Winters were harsh, roads long and news slow; yet every generation left the next a table, a prayer and a name.`
      );
    }
  }

  /* 4) Kapanış */
  paras.push(
    lang === "tr"
      ? "Buradaki her sayfa, o isimlerden birine ait. Onları okuyarak hatırlayın; çünkü hatırlanan hiç kimse gerçekten kaybolmaz."
      : "Every page here belongs to one of those names. Remember them by reading; for no one who is remembered is ever truly lost."
  );

  return paras;
}
