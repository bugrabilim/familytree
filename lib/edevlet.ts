import type { Gender, Person } from "@/types/family";
import { nanoid } from "nanoid";

/**
 * e-Devlet "Alt-Üst Soy Belgesi" (NVİ) PDF metnini `Person[]`'e çevirir — SAF,
 * test edilebilir (yalnız Person TÜR'ü + nanoid).
 *
 * PDF'ten çıkarılan metin, her kişi için şu sütunları içerir:
 *   Sıra · C(insiyet E/K) · Yakınlık Derecesi · Ad · Soyad · Baba Adı · Ana Adı
 *   · Doğum Yeri · Doğum Tarihi · adres · Cilt-Hane-Birey · Medeni Hali · Durum
 *   (Ölüm + tarih | Sağ)
 *
 * İlişkiler, ADLARDAN DEĞİL, "Yakınlık Derecesi" zincirinden kurulur; bu zincir
 * kişinin ego'ya (Kendisi) göre kesin konumunu verir:
 *   "Babasının Babasının Annesinin Babası" → ego'dan yukarı: baba>baba>anne>baba
 * Zincirin ön-eki (son adım hariç) o kişinin çocuğudur → ebeveyn bağı kesindir.
 * Aynı çocuğu paylaşan baba+anne eş olarak bağlanır.
 */

const GENITIVE: Record<string, string> = {
  "babasının": "baba",
  "annesinin": "anne",
  "oğlunun": "c",
  "kızının": "c",
};
const TERMINAL: Record<string, string> = {
  "babası": "baba",
  "annesi": "anne",
  "oğlu": "c",
  "kızı": "c",
  "torunu": "c",
};

const trLower = (s: string) => s.toLocaleLowerCase("tr");

// e-Devlet PDF metninde doğum/ölüm tarihi biçimi tek düze değil: PDF çıkarımına
// göre gün/ay tek ya da çift haneli olabilir, ayraç "/" ya da "." gelebilir ve
// eski atalarda çoğu zaman yalnız yıl (örn. "1850") yazar. Hepsini yakala; aksi
// halde tarih token'ı ad bloğuna karışır, hem doğum tarihi hem yeri bozulurdu.
const FULL_DATE = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/;
const YEAR_ONLY = /^(1[0-9]{3}|20[0-9]{2})$/; // 1000–2099 arası makul yıl
const isCilt = (t: string) => /^\d+-\d+-\d+$/.test(t);
/** Doğum/ölüm tarihi olabilecek bir token mu (tam tarih ya da yalın yıl)? */
const isDate = (t: string) => FULL_DATE.test(t) || YEAR_ONLY.test(t);

/**
 * "01/07/1842" → "1842-07-01"; "1.7.1842" → "1842-07-01"; "1850" → "1850".
 * Tanınmayan biçimde undefined.
 */
function toStoredDate(d: string | null): string | undefined {
  if (!d) return undefined;
  const m = FULL_DATE.exec(d);
  if (m) {
    const [, dd, mm, yyyy] = m;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  if (YEAR_ONLY.test(d)) return d;
  return undefined;
}

/** TÜRKÇE başlık düzeni: "MEHMET ÇELİK" → "Mehmet Çelik", "BİLİM" → "Bilim". */
function titleCaseTr(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toLocaleUpperCase("tr") + trLower(w.slice(1)))
    .join(" ");
}

interface Rec {
  sira: string;
  gender: Gender;
  steps: string[]; // ego'dan adımlar (baba/anne/c)
  ego: boolean;
  ad: string;
  soyad: string;
  birth?: string;
  death?: string;
  yer: string;
}

/** Ham metni kişi kayıtlarına ayrıştırır (SAF token akışı). */
function parseRecords(text: string): Rec[] {
  const body = text.split(/\bAÇIKLAMALAR\b/)[0] ?? text;
  const tk = body.split(/\s+/).filter(Boolean);
  const N = tk.length;
  const recs: Rec[] = [];
  const isSira = (k: number) => /^\d+$/.test(tk[k]) && (tk[k + 1] === "E" || tk[k + 1] === "K");

  let i = 0;
  while (i < N) {
    if (!isSira(i)) { i++; continue; }
    const sira = tk[i];
    const gender: Gender = tk[i + 1] === "K" ? "female" : "male";
    i += 2;

    // Yakınlık derecesi zinciri
    const steps: string[] = [];
    let ego = false;
    while (i < N) {
      const t = trLower(tk[i]);
      if (t === "kendisi") { ego = true; i++; break; }
      if (GENITIVE[t] !== undefined) { steps.push(GENITIVE[t]); i++; continue; }
      if (TERMINAL[t] !== undefined) { steps.push(TERMINAL[t]); i++; break; }
      break;
    }

    // Ad bloğu — doğum tarihine kadar olan tokenler
    const nb: string[] = [];
    while (i < N && !isDate(tk[i])) { nb.push(tk[i]); i++; }
    const birth = i < N && isDate(tk[i]) ? tk[i++] : null;

    // Sondan ata: yer, ana, baba, soyad; kalanı ad (çok kelimeli ad desteği)
    const yer = nb[nb.length - 1] ?? "";
    let soyad = nb[nb.length - 4] ?? "";
    if (soyad === "-") soyad = "";
    const ad = nb.slice(0, Math.max(0, nb.length - 4)).join(" ");

    // Adresi atla → Cilt-Hane-Birey
    while (i < N && !isCilt(tk[i]) && !isSira(i)) i++;
    if (i < N && isCilt(tk[i])) i++; // cilt-hane

    // Durum sütunu. "Medeni Hali" TEK ya da ÇOK kelimeli olabilir ("Evli",
    // "Bekâr", "Dul", "Boşandı", "Eşi Ölmüş"…). Sabit sayıda token atlamak,
    // iki kelimeli hâllerde "Ölüm" işaretini kaydırıyor ve ölüm tarihini
    // KAYBETTİRİYORDU. Bunun yerine kaydın sonuna kadar tarayıp "Ölüm"/"Sağ"
    // işaretini arıyor, tarihi işaretten SONRAKİ ilk tarihten okuyoruz.
    // ("Ölmüş" medeni hâlin parçasıdır; ölüm işareti değildir.)
    let death: string | null = null;
    while (i < N && !isSira(i)) {
      const t = trLower(tk[i]);
      if (t === "ölüm" || t === "ölü" || t === "öldü") {
        i++;
        // Tarih hemen sonra gelir; araya yalnız "-" gibi bir dolgu girebilir.
        for (let k = 0; k < 2 && i < N && !isSira(i); k++) {
          if (isDate(tk[i])) { death = tk[i++]; break; }
          if (tk[i] === "-") { i++; continue; }
          break;
        }
        break;
      }
      if (t === "sağ") { i++; break; }
      i++;
    }

    recs.push({
      sira,
      gender,
      steps,
      ego,
      ad: titleCaseTr(ad),
      soyad: titleCaseTr(soyad),
      birth: toStoredDate(birth),
      death: toStoredDate(death),
      yer: titleCaseTr(yer),
    });
  }
  return recs;
}

export function parseEdevletText(text: string): Person[] {
  const recs = parseRecords(text);
  if (recs.length === 0) return [];

  const ids = recs.map(() => nanoid());
  const keyOf = (r: Rec) => (r.ego ? "" : r.steps.join("/"));
  const idxByKey = new Map<string, number>();
  recs.forEach((r, idx) => idxByKey.set(keyOf(r), idx));

  const parentIds: Set<string>[] = recs.map(() => new Set());
  const spouseIds: Set<string>[] = recs.map(() => new Set());

  // Ebeveyn bağları — zincir ön-ekinden
  recs.forEach((r, idx) => {
    if (r.ego || r.steps.length === 0) return;
    const last = r.steps[r.steps.length - 1];
    const prefixKey = r.steps.slice(0, -1).join("/");
    const other = idxByKey.get(prefixKey);
    if (other === undefined) return;
    if (last === "baba" || last === "anne") {
      // r bir atadır → person(prefix)'in ebeveyni
      parentIds[other].add(ids[idx]);
    } else {
      // r bir alt-soydur → person(prefix) onun ebeveyni
      parentIds[idx].add(ids[other]);
    }
  });

  // Eş bağları — aynı çocuğu paylaşan baba + anne
  const prefixes = new Set<string>();
  recs.forEach((r) => {
    if (!r.ego && r.steps.length > 0 && (r.steps[r.steps.length - 1] === "baba" || r.steps[r.steps.length - 1] === "anne")) {
      prefixes.add(r.steps.slice(0, -1).join("/"));
    }
  });
  for (const p of prefixes) {
    const fa = idxByKey.get(p ? `${p}/baba` : "baba");
    const mo = idxByKey.get(p ? `${p}/anne` : "anne");
    if (fa !== undefined && mo !== undefined) {
      spouseIds[fa].add(ids[mo]);
      spouseIds[mo].add(ids[fa]);
    }
  }

  return recs.map((r, idx) => {
    const person: Person = {
      id: ids[idx],
      firstName: r.ad,
      lastName: r.soyad,
      gender: r.gender,
      parentIds: [...parentIds[idx]],
      spouseIds: [...spouseIds[idx]],
    };
    if (r.birth) person.birthDate = r.birth;
    if (r.death) person.deathDate = r.death;
    if (r.yer) person.birthPlace = r.yer;
    return person;
  });
}
