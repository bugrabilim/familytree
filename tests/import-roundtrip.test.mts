import { exportJson, parseJson } from "../lib/import.ts";
import { PERSON_FIELDS, EXCLUDED_FIELDS } from "../lib/person-fields.ts";
import type { Person } from "../types/family.ts";

let ok = 0, fail = 0;
const check = (name: string, cond: boolean) => { if (cond) ok++; else { fail++; console.log(`✗ ${name}`); } };

/**
 * GİDİŞ-DÖNÜŞ: dışa aktarılan yedek GERİ YÜKLENEBİLİR olmalı.
 *
 * Uygulamanın kullanıcıya verdiği söz tek dosyalık yedeğin "hem bakılan hem
 * geri yüklenebilen" bir arşiv olması (Kullanım Şartları → "Arşiv ve dışa
 * aktarım"; `docs/YEDEKLEME.md` §0). O söz `parseJson`da tutulur.
 *
 * Tutmuyordu: `parseJson` elle yazılmış altı alanlık bir beyaz liste
 * kullanıyordu ve OTUZ YEDİ alan geri yüklemede düşüyordu — anılar, ses
 * kayıtları, kaynaklar, galeri, videolar, belgeler, yaşam olayları, evlat
 * edinme bağları, `confidential`/`privateFields` gizlilik işaretleri dâhil.
 *
 * En kötü yanı SESSİZLİĞİYDİ: rota `{ count: N }` döner ve kişi sayısı
 * doğrudur, dolayısıyla kayıp fark edilmez. Kullanıcı ağacını kaybettikten
 * SONRA öğrenir.
 *
 * ## Bu test neden kayıt defterinden besleniyor
 *
 * Elle yazılmış bir alan listesi, düzelttiğimiz hatanın aynısını testin
 * içinde tekrar kurardı: yeni bir alan eklenir, listeye yazılmaz, test yeşil
 * kalır. `PERSON_FIELDS` tek kaynak — yarın eklenen alan bu testi
 * KENDİLİĞİNDEN kapsar ve gidiş-dönüşte düşerse test kırmızıya döner.
 */

/** Alan türüne göre ayırt edici bir örnek değer. */
function ornek(key: string, merge: string): unknown {
  switch (merge) {
    case "bool": return true;
    case "obj": return { lat: 39.92, lon: 32.85 };
    case "array":
      if (key === "events") return [{ id: "e1", type: "askerlik", title: "Ankara'da er", date: "1975" }];
      if (key === "sources") return [{ id: "s1", title: "1927 Nüfus Sayımı", kind: "kayit" }];
      if (key === "memories") return [{ id: "m1", text: "Bahçedeki dut ağacı", audio: "https://x/a.mp3" }];
      if (key === "privateFields") return ["health"];
      return [`https://ornek/${key}-1`, `https://ornek/${key}-2`];
    default:
      if (key === "gender") return "erkek";
      if (key === "confidential") return true;
      return `deger-${key}`;
  }
}

/* --- 1. Kayıt defterindeki HER alan gidiş-dönüşte hayatta kalıyor ------ */

{
  const kisi: Record<string, unknown> = {
    id: "kaynak-1", firstName: "Mehmed", lastName: "Yılmaz",
    parentIds: [], spouseIds: [],
  };
  for (const f of PERSON_FIELDS) {
    const k = String(f.key);
    if (k === "firstName" || k === "lastName" || k === "gender") continue;
    kisi[k] = ornek(k, f.merge);
  }
  kisi.gender = "erkek";

  const geri = parseJson(exportJson([kisi as unknown as Person]));
  check("tek kişi geri geldi", geri.length === 1);
  const p = geri[0] as unknown as Record<string, unknown>;

  for (const f of PERSON_FIELDS) {
    const k = String(f.key);
    if (k === "associations") continue; // kimlik çevirisi ayrı sınanıyor
    check(`gidiş-dönüş: ${k} korunuyor`, p[k] !== undefined);
  }
}

/* --- 2. Sunucunun sahip olduğu alanlar DOSYADAN yazılamıyor ----------- */
/*
 * Kapsam genişledi ama güven sınırı aynı kalmalı: yabancı bir dosya
 * `addedBy` yazabilseydi, katkı verici başkasının kaydını ele geçirirdi
 * (madde 35); `contactTokenHash` bir sunucu sırrı; `code` çakışırdı.
 */
{
  const kotu = {
    id: "x", firstName: "A", lastName: "B", gender: "erkek", parentIds: [], spouseIds: [],
    addedBy: "baskasi", code: "SAHTE-1", contactTokenHash: "sizinti",
    contactEmail: "kurban@example.com", contactConsent: true, entrySource: "elle",
  };
  const p = parseJson(JSON.stringify([kotu]))[0] as unknown as Record<string, unknown>;
  for (const k of ["addedBy", "code", "contactTokenHash", "contactEmail", "contactConsent", "entrySource"]) {
    check(`dosyadan yazılamaz: ${k}`, p[k] === undefined);
    check(`${k} gerekçesiyle dışarıda`, typeof EXCLUDED_FIELDS[k] === "string");
  }
  check("kimlik dosyadakinden ALINMIYOR", p.id !== "x");
}

/* --- 3. Kimlik taşıyan alanlar ÇEVRİLİYOR ----------------------------- */
/*
 * `parentLinks` anahtarları ve `associations[].personId` dosyadaki
 * kimliklere bakıyor. Ham kopyalansalardı ağaçtaki hiç kimseye denk
 * gelmezlerdi: veri "geldi" görünür, hiçbir yerde görünmezdi.
 */
{
  const dosya = [
    { id: "A", firstName: "Ana", lastName: "K", gender: "kadin", parentIds: [], spouseIds: [] },
    {
      id: "C", firstName: "Cocuk", lastName: "K", gender: "erkek", parentIds: ["A"], spouseIds: [],
      parentLinks: { A: { kind: "adoptive", note: "teyzesi evlat edindi" }, YOK: { kind: "step" } },
      associations: [
        { id: "as1", personId: "A", type: "kirve", note: "çocuğun kirvesi" },
        { id: "as2", personId: "OLMAYAN", type: "komsu" },
      ],
    },
  ];
  const geri = parseJson(JSON.stringify(dosya));
  const anaId = geri.find((x) => x.firstName === "Ana")!.id;
  const c = geri.find((x) => x.firstName === "Cocuk")! as unknown as Record<string, unknown>;

  const baglar = c.parentLinks as Record<string, { kind?: string; note?: string }>;
  check("parentLinks anahtarı YENİ kimliğe çevrildi", !!baglar[anaId]);
  check("parentLinks içeriği korundu", baglar[anaId]?.kind === "adoptive");
  check("parentLinks notu korundu", /teyzesi/.test(baglar[anaId]?.note ?? ""));
  check("çözülemeyen parentLinks anahtarı ATILDI", baglar.YOK === undefined && !("YOK" in baglar));

  const bagli = c.associations as Array<{ personId: string; type: string; note?: string }>;
  check("associations personId çevrildi", bagli.length === 1 && bagli[0].personId === anaId);
  check("associations türü korundu", bagli[0].type === "kirve");
  check("karşılığı olmayan association ATILDI", !bagli.some((a) => a.personId === "OLMAYAN"));
}

/* --- 4. Tür uyuşmazlığı sessizce kabul edilmiyor ---------------------- */
/*
 * Dosya YABANCI olabilir. Metin alanına sayı, dizi alanına nesne gelirse
 * alan atlanmalı — yoksa `events.map(e => e.title)` gibi her yer dosyanın
 * biçimine güvenmek zorunda kalır.
 */
{
  const bozuk = {
    id: "z", firstName: "A", lastName: "B", gender: "erkek", parentIds: [], spouseIds: [],
    occupation: 42, events: { hepsi: "nesne" }, confidential: "evet", birthCoords: [1, 2],
  };
  const p = parseJson(JSON.stringify([bozuk]))[0] as unknown as Record<string, unknown>;
  check("metin alanına sayı kabul edilmiyor", p.occupation === undefined);
  check("dizi alanına nesne kabul edilmiyor", p.events === undefined);
  check("boolean alanına metin kabul edilmiyor", p.confidential === undefined);
  check("nesne alanına dizi kabul edilmiyor", p.birthCoords === undefined);
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail) process.exit(1);
