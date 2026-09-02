import { parseExtractedJson, buildExtractPrompt, buildExtractSystem, buildRetryPrompt } from "../lib/ai-extract.ts";

let ok = 0, fail = 0;
const check = (name: string, cond: boolean) => { if (cond) ok++; else { fail++; console.log(`✗ ${name}`); } };

// Modelin döndürebileceği tipik çıktı (kod bloklu, baş/son gürültülü).
const modelOut = "İşte ağaç:\n```json\n" + JSON.stringify({
  people: [
    { id: "p1", firstName: "Ahmet", lastName: "Yıldız", gender: "male", birthDate: "1950", officialBirthDate: "1948", deathDate: "2010", birthPlace: "Ankara", fatherId: null, motherId: null, spouseIds: ["p2"] },
    { id: "p2", firstName: "Ayşe", lastName: "Yıldız", gender: "female", birthDate: "1955", spouseIds: ["p1"] },
    { id: "p3", firstName: "Zeynep", lastName: "Yıldız", gender: "female", fatherId: "p1", motherId: "p2", spouseIds: [] },
    { id: "p4", firstName: "", lastName: "", gender: "unknown" },
  ],
}) + "\n```\n";

const people = parseExtractedJson(modelOut);
const by = (n: string) => people.find((p) => p.firstName === n)!;

check("boş kişi elendi (3 kişi)", people.length === 3);
check("cinsiyet eşleme", by("Ahmet").gender === "male" && by("Ayşe").gender === "female");
check("doğum/ölüm/yer", by("Ahmet").birthDate === "1950" && by("Ahmet").deathDate === "2010" && by("Ahmet").birthPlace === "Ankara");
check("nüfusa göre (resmi) doğum tarihi", by("Ahmet").officialBirthDate === "1948");
const zeynepParents = by("Zeynep").parentIds.map((id) => people.find((p) => p.id === id)!.firstName).sort();
check("ebeveyn bağı (father/mother→parentIds)", zeynepParents.join(",") === "Ahmet,Ayşe");
check("eş bağı çift yönlü", by("Ahmet").spouseIds.includes(by("Ayşe").id) && by("Ayşe").spouseIds.includes(by("Ahmet").id));
// Kastedilen: geçici "p1..p4" kimlikleri kalıcı kimliklerle DEĞİŞTİ.
// "p ile başlamasın" demek yanlıştı: nanoid alfabesi küçük harf içerdiğinden
// üretilen kimlik meşru olarak "p" ile başlayabiliyor (3 kişide ~%4,6) ve test
// arada bir sebepsiz kırılıyordu.
const gecici = new Set(["p1", "p2", "p3", "p4"]);
check("geçici id'ler kalıcıya çevrildi (nanoid)", !people.some((p) => gecici.has(p.id)));
check("kimlikler benzersiz", new Set(people.map((p) => p.id)).size === people.length);

// Bozuk/boş girişte güvenli
check("boş metin → []", parseExtractedJson("").length === 0);
check("JSON değil → []", parseExtractedJson("merhaba dünya").length === 0);

// İstem içeriği
check("istem: uydurma yasağı (system)", buildExtractSystem("tr").toLowerCase().includes("uydurma"));
check("istem: JSON şeması", buildExtractPrompt("tr").includes("spouseIds"));
check("istem EN", buildExtractSystem("en").toLowerCase().includes("genealogist") && buildExtractPrompt("en").includes("spouseIds"));
check("istem: nüfus terimleri (baba adı)", buildExtractPrompt("tr").toLowerCase().includes("baba adı"));
check("istem: officialBirthDate şemada", buildExtractPrompt("tr").includes("officialBirthDate"));
check("ikinci geçiş istemi (retry)", buildRetryPrompt("tr").includes("spouseIds") && buildRetryPrompt("en").includes("spouseIds"));

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail) process.exit(1);
