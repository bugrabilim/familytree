import { parseCommands, type TreeCommand } from "../lib/ai-commands.ts";

let ok = 0, fail = 0;
const check = (ad: string, kosul: boolean, detay = "") =>
  kosul ? ok++ : (fail++, console.log(`✗ ${ad} ${detay}`));

const kinds = (cs: TreeCommand[]) => cs.map((c) => c.kind).sort().join(",");
const has = (cs: TreeCommand[], pred: (c: TreeCommand) => boolean) => cs.some(pred);

// Kullanıcının ekran görüntüsündeki örnekler
const a = parseCommands("herkese açık paylaşım yap");
check("herkese açık paylaşım → share", has(a, (c) => c.kind === "share"));

const b = parseCommands("karanlık tema yap, arkadaşları gizle");
check("bileşik: tema + arkadaş gizle (2 komut)", b.length === 2, kinds(b));
check("karanlık tema", has(b, (c) => c.kind === "theme" && c.value === "dark"));
check("arkadaşları gizle → showAssociates false", has(b, (c) => c.kind === "showAssociates" && c.value === false));

// Tema
check("aydınlık tema", has(parseCommands("açık tema yap"), (c) => c.kind === "theme" && c.value === "light"));
check("dark theme (en)", has(parseCommands("switch to dark theme"), (c) => c.kind === "theme" && c.value === "dark"));

// Yaşayanlar
check("yaşayanları gizle", has(parseCommands("yaşayanları gizle"), (c) => c.kind === "hideLiving" && c.value === true));
check("yaşayanları göster", has(parseCommands("yaşayanları göster"), (c) => c.kind === "hideLiving" && c.value === false));

// Arkadaşlar
check("arkadaşları göster", has(parseCommands("arkadaşları göster"), (c) => c.kind === "showAssociates" && c.value === true));

// Dil
check("ingilizceye çevir", has(parseCommands("ingilizceye çevir"), (c) => c.kind === "lang" && c.value === "en"));
check("türkçe yap", has(parseCommands("türkçe yap"), (c) => c.kind === "lang" && c.value === "tr"));

// Görünümler
check("haritayı aç → view harita", has(parseCommands("haritayı aç"), (c) => c.kind === "view" && c.value === "harita"));
check("yelpaze göster → view yelpaze", has(parseCommands("yelpaze görünümünü göster"), (c) => c.kind === "view" && c.value === "yelpaze"));
check("zaman çizelgesine geç", has(parseCommands("zaman çizelgesine geç"), (c) => c.kind === "view" && c.value === "zaman"));
check("istatistikleri aç", has(parseCommands("istatistikleri aç"), (c) => c.kind === "view" && c.value === "istatistik"));

// Kitap / kişi ekle
check("aile kitabını aç → book", has(parseCommands("aile kitabını aç"), (c) => c.kind === "book"));
check("yeni kişi ekle → addPerson", has(parseCommands("yeni kişi ekle"), (c) => c.kind === "addPerson"));

// Komut olmayan sorular → boş (modele düşer)
check("soru komut değil", parseCommands("kaç kişi var?").length === 0, kinds(parseCommands("kaç kişi var?")));
check("isim sorusu komut değil", parseCommands("en yaşlı kim?").length === 0);

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
