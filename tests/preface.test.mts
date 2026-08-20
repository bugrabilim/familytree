import { generatePreface } from "../lib/preface.ts";

let ok = 0,
  fail = 0;
const check = (name: string, cond: boolean) => {
  if (cond) ok++;
  else {
    fail++;
    console.log(`✗ ${name}`);
  }
};

const tr = generatePreface({ familyName: "Bilim", from: 1910, to: 1990, places: ["Larende", "İstanbul"], lang: "tr" });
check("tr: birden çok paragraf", tr.length >= 3);
check("tr: aile adı geçer", tr[0].includes("Bilim"));
check("tr: yıllar geçer", tr[0].includes("1910") && tr[0].includes("1990"));
check("tr: yerler geçer", tr.some((p) => p.includes("Larende") && p.includes("İstanbul")));
check("tr: I. Dünya Savaşı dönemi (1914-18) eklendi", tr.some((p) => p.includes("I. Dünya Savaşı")));
check("tr: II. Dünya Savaşı dönemi (1939-45) eklendi", tr.some((p) => p.includes("II. Dünya Savaşı")));

const en = generatePreface({ familyName: "Bilim", from: 2000, to: 2020, places: [], lang: "en" });
check("en: İngilizce açılış", en[0].includes("This book tells the story"));
check("en: yer yoksa yer paragrafı yok", !en.some((p) => p.includes("put down roots")));
check("en: 2000-2020 aralığında eski savaş dönemleri yok", !en.some((p) => p.includes("First World War")));

const bos = generatePreface({ lang: "tr" });
check("veri yoksa yine de paragraf üretir", bos.length >= 2);

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail) process.exit(1);
