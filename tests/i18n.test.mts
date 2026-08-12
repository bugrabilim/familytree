import { tr, en, translate } from "../lib/i18n-dict.ts";

let ok = 0, fail = 0;
const check = (ad: string, kosul: boolean, detay = "") =>
  kosul ? ok++ : (fail++, console.log(`✗ ${ad} ${detay}`));

// --- Anahtar eşliği: tr ve en birebir aynı anahtar kümesine sahip olmalı ---
const trKeys = new Set(Object.keys(tr));
const enKeys = new Set(Object.keys(en));

const enMissing = [...trKeys].filter((k) => !enKeys.has(k));
const trMissing = [...enKeys].filter((k) => !trKeys.has(k));
check("en tüm tr anahtarlarını içeriyor", enMissing.length === 0, enMissing.slice(0, 8).join(", "));
check("tr tüm en anahtarlarını içeriyor", trMissing.length === 0, trMissing.slice(0, 8).join(", "));
check("anahtar sayısı eşit", trKeys.size === enKeys.size, `tr=${trKeys.size} en=${enKeys.size}`);

// --- Değerler okunur olmalı ---
check("tr değerleri okunur", Object.values(tr).every((v) => typeof v === "string"));
check("en değerleri okunur", Object.values(en).every((v) => typeof v === "string"));

// --- Interpolasyon ---
check("interpolasyon", translate("en", "common.peopleCount", { count: 5 }) === "5 people",
  translate("en", "common.peopleCount", { count: 5 }));
check("interpolasyon tr", translate("tr", "common.peopleCount", { count: 3 }) === "3 kişi",
  translate("tr", "common.peopleCount", { count: 3 }));
check("çoklu interpolasyon", translate("en", "map.placeAria", { place: "İzmir", count: 4 }) === "İzmir: 4 people");

// --- Eksik anahtar tr'ye, o da yoksa anahtara düşer ---
check("eksik anahtar geri düşme", translate("en", "yok.olan.anahtar") === "yok.olan.anahtar");
// en'de olmayan ama tr'de olan bir anahtar → tr'ye düşer (parite testi bunu engeller ama davranış doğru olmalı)
check("dil sözlüğü seçimi", translate("tr", "topbar.appName") === "Soy Ağacı" && translate("en", "topbar.appName") === "Family Tree");

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
