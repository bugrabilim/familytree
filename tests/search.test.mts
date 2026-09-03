import {
  matchesQuery,
  matchesFields,
  activeFieldCount,
  emptyFieldFilters,
  yearOf,
  type FieldFilters,
} from "../lib/search.ts";
import type { Person } from "../types/family.ts";

let ok = 0, fail = 0;
const check = (ad: string, kosul: boolean, detay = "") =>
  kosul ? ok++ : (fail++, console.log(`✗ ${ad} ${detay}`));

const P = (over: Partial<Person>): Person => ({
  id: "x", firstName: "Ali", lastName: "Yılmaz", gender: "male", parentIds: [], spouseIds: [], ...over,
});

// --- yearOf ---
check("yearOf tam tarih", yearOf("1980-05-03") === 1980);
check("yearOf yıl", yearOf("1925") === 1925);
check("yearOf tanımsız", yearOf(undefined) === undefined);

// --- matchesQuery ---
const mehmet = P({ firstName: "Mehmet", lastName: "Demir", birthPlace: "İstanbul", occupation: "Terzi", code: "289012" });
check("boş sorgu hepsini geçer", matchesQuery(mehmet, ""));
check("ada göre", matchesQuery(mehmet, "meh"));
check("Türkçe küçük harf (İ)", matchesQuery(mehmet, "istanbul"));
check("koda göre", matchesQuery(mehmet, "289012"));
check("mesleğe göre", matchesQuery(mehmet, "terzi"));
check("eşleşmeyen", !matchesQuery(mehmet, "zzz"));

// --- matchesFields: cinsiyet ---
const f0 = emptyFieldFilters();
check("boş süzgeç geçer", matchesFields(mehmet, f0));
check("cinsiyet eşleşir", matchesFields(P({ gender: "female" }), { ...f0, genders: ["female"] }));
check("cinsiyet elenir", !matchesFields(P({ gender: "male" }), { ...f0, genders: ["female"] }));
check("çoklu cinsiyet", matchesFields(P({ gender: "other" }), { ...f0, genders: ["female", "other"] }));

// --- doğum yılı aralığı ---
const inRange: FieldFilters = { ...f0, birthYearMin: 1900, birthYearMax: 1950 };
check("yıl aralığı içinde", matchesFields(P({ birthDate: "1925" }), inRange));
check("yıl aralığı altında elenir", !matchesFields(P({ birthDate: "1890" }), inRange));
check("yıl aralığı üstünde elenir", !matchesFields(P({ birthDate: "1980" }), inRange));
check("tarihsiz, aralık varsa elenir", !matchesFields(P({}), inRange));
check("yalnız alt sınır", matchesFields(P({ birthDate: "2000" }), { ...f0, birthYearMin: 1990 }));

// --- yer / meslek / eğitim ---
check("yer içerir", matchesFields(P({ birthPlace: "Kayseri, Develi" }), { ...f0, place: "develi" }));
check("yer eşleşmez", !matchesFields(P({ birthPlace: "İzmir" }), { ...f0, place: "develi" }));
check("meslek içerir", matchesFields(P({ occupation: "İlkokul öğretmeni" }), { ...f0, occupation: "öğretmen" }));
check("eğitim tam eşleşir", matchesFields(P({ education: "lisans" }), { ...f0, education: "lisans" }));
check("eğitim eşleşmez", !matchesFields(P({ education: "lise" }), { ...f0, education: "lisans" }));
check("eğitim boşsa hepsi", matchesFields(P({ education: "lise" }), f0));

// --- activeFieldCount ---
check("etkin süzgeç sayısı 0", activeFieldCount(f0) === 0);
check("etkin süzgeç sayısı 3", activeFieldCount({ ...f0, genders: ["male"], place: "İzmir", education: "lisans" }) === 3, String(activeFieldCount({ ...f0, genders: ["male"], place: "İzmir", education: "lisans" })));

/* --- Tarih ve kod aramaları: iki taraf da KATLANMALI ------------------- */
/*
 * `norm` `foldKey` olduğunda sorgu "1985-04-23" → "1985 04 23"e dönüşüyor.
 * Bu iki alan bir dönem HAM hâlleriyle karşılaştırılıyordu, dolayısıyla tam
 * tarih yazan kullanıcı hiçbir şey bulamıyordu — arama testleri ad, yer,
 * meslek ve kodu kapsıyordu ama TARİHİ hiç sorgulamıyordu, o yüzden
 * gerileme sessizce yaşadı.
 */
{
  const t = P({ id: "t", birthDate: "1985-04-23", code: "289042" });
  check("tam tarihle aranabiliyor", matchesQuery(t, "1985-04-23"));
  check("yıl-ay ile aranabiliyor", matchesQuery(t, "1985-04"));
  check("yalnız yılla aranabiliyor", matchesQuery(t, "1985"));
  check("ay-gün ile aranabiliyor", matchesQuery(t, "04-23"));
  // Ayırıcı ne olursa olsun aynı sonuç: iki taraf da katlandığı için.
  check("farklı ayırıcı da bulur", matchesQuery(t, "1985/04/23"));
  check("kodla aranabiliyor", matchesQuery(t, "289042"));
  check("başka tarih eşleşmiyor", !matchesQuery(t, "1986-04-23"));
  check("başka kod eşleşmiyor", !matchesQuery(t, "289043"));
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
