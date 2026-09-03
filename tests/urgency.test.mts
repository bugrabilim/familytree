import type { Person } from "../types/family.ts";
import { AGE_THRESHOLD, urgentPeople } from "../lib/urgency.ts";

let ok = 0, fail = 0;
function eq<T>(got: T, want: T, msg: string) {
  if (JSON.stringify(got) === JSON.stringify(want)) ok++;
  else { fail++; console.log(`✗ ${msg}: bekl ${JSON.stringify(want)}, geldi ${JSON.stringify(got)}`); }
}

// Sabit "bugün" — yaş hesabı buna bağlı, testin takvimle sürüklenmemesi için.
const BUGUN = new Date(2026, 0, 15);

const P = (id: string, extra: Partial<Person> = {}): Person => ({
  id, firstName: id, lastName: "Soy", gender: "female",
  parentIds: [], spouseIds: [], ...extra,
});
const ids = (x: ReturnType<typeof urgentPeople>) => x.map((i) => i.personId);
const kinds = (x: ReturnType<typeof urgentPeople>) => x.map((i) => i.kind);

/* --- Kim listeye girer --------------------------------------------------- */
{
  const p = [
    P("nine", { birthDate: "1935" }),                                  // 91, hiçbir şey yok
    P("genc", { birthDate: "1990" }),                                  // 36, eşiğin altında
    P("dede", { birthDate: "1940", memories: [{ id: "m", text: "Anlattı." }] }), // 86, sesi yok
    P("tam", { birthDate: "1938", memories: [{ id: "m", text: "x", audio: "s.webm" }] }), // eksiksiz
  ];
  const u = urgentPeople(p, BUGUN);
  eq(ids(u), ["nine", "dede"], "yalnız eksiği olan yaşlılar listede");
  eq(kinds(u), ["yasli-anisiz", "yasli-sessiz"], "türler doğru");
  eq(u[0].age, 91, "yaş bugüne göre hesaplandı");
}
{
  // Eşik sınırı: tam eşikte GİRER, bir yaş altında girmez.
  const dogum = (yas: number) => String(BUGUN.getFullYear() - yas);
  eq(urgentPeople([P("a", { birthDate: dogum(AGE_THRESHOLD) })], BUGUN).length, 1, "eşikte listeye girer");
  eq(urgentPeople([P("a", { birthDate: dogum(AGE_THRESHOLD - 1) })], BUGUN).length, 0, "eşiğin altı girmez");
}
{
  /*
   * Yaşı BİLİNMEYEN kişi girmez. "Belki 90 yaşındadır" diye uyarmak,
   * kullanıcıyı doğrulanmamış bir varsayımla telaşlandırmak olurdu.
   */
  eq(urgentPeople([P("meçhul")], BUGUN).length, 0, "yaşı bilinmeyen yaşayan listede yok");
}
{
  // Gizli kayıt hiçbir listeye taşınmaz — gizliliği delerdi.
  eq(urgentPeople([P("a", { birthDate: "1930", confidential: true })], BUGUN).length, 0,
    "gizli kişi listede yok");
}
{
  // Çevre kişileri soy kaydının konusu değil.
  eq(urgentPeople([P("a", { birthDate: "1930", kind: "cevre" })], BUGUN).length, 0,
    "çevre kişisi listede yok");
}

/* --- Biyografi de bir anlatıdır ----------------------------------------- */
{
  const u = urgentPeople([P("a", { birthDate: "1930", bio: "Rize'de doğdu, marangozdu." })], BUGUN);
  eq(kinds(u), ["yasli-sessiz"], "biyografi varsa 'hiç anlatı yok' denmiyor, ses eksiği kalıyor");
}
{
  // Boşluktan ibaret metin anlatı sayılmaz.
  const u = urgentPeople([P("a", { birthDate: "1930", bio: "   ", memories: [{ id: "m", text: " " }] })], BUGUN);
  eq(kinds(u), ["yasli-anisiz"], "boş metinler anlatı sayılmıyor");
}

/* --- Vefat edenler ------------------------------------------------------- */
{
  const p = [
    P("gecmis", { birthDate: "1920", deathDate: "1998" }),   // hiç anlatı yok
    P("anlatili", { birthDate: "1915", deathDate: "1990", memories: [{ id: "m", text: "var" }] }),
  ];
  const u = urgentPeople(p, BUGUN);
  eq(ids(u), ["gecmis"], "anlatısı olmayan vefat kaydı listede");
  eq(u[0].age, 78, "vefat edende ÖLÜM yaşı hesaplanıyor (bugünkü değil)");
}
{
  /*
   * Vefat edenlerde YAŞ EŞİĞİ YOK: genç yaşta kaybedilen birinin hiç
   * anlatısının olmaması, yaşlı birininkinden daha az önemli değil.
   */
  const u = urgentPeople([P("genc", { birthDate: "1980", deathDate: "2005" })], BUGUN);
  eq(kinds(u), ["gecti-anisiz"], "genç yaşta vefat eden de listede");
}
{
  // Vefat edenin SESİ yoksa uyarı verilmez: artık kaydedilemez.
  const u = urgentPeople([P("a", { birthDate: "1920", deathDate: "1998", bio: "Anlatıldı." })], BUGUN);
  eq(u.length, 0, "vefat edende 'sesi yok' uyarısı verilmiyor");
}

/* --- Sıralama: yaşayanlar önce, her grupta en yaşlı önce ---------------- */
{
  const p = [
    P("orta", { birthDate: "1950" }),                                   // 76, anlatısız
    P("enYasli", { birthDate: "1928" }),                                // 98, anlatısız
    P("sessiz", { birthDate: "1935", memories: [{ id: "m", text: "x" }] }), // 91, sesi yok
    P("gecmis", { birthDate: "1900", deathDate: "1980" }),              // vefat, anlatısız
  ];
  const u = urgentPeople(p, BUGUN);
  eq(ids(u), ["enYasli", "orta", "sessiz", "gecmis"], "önce anlatısı hiç olmayan yaşayanlar, en yaşlı başta");
}
{
  const p = Array.from({ length: 12 }, (_, i) => P(`p${i}`, { birthDate: String(1930 + i) }));
  eq(urgentPeople(p, BUGUN, 3).length, 3, "limit uygulanıyor");
  eq(urgentPeople(p, BUGUN, 0).length, 0, "sıfır limit boş liste");
  // Limit varken de EN YAŞLILAR seçilmeli, listenin ilk üçü değil.
  eq(ids(urgentPeople(p, BUGUN, 2)), ["p0", "p1"], "limit en yaşlıları koruyor");
}

/* --- i18n anahtarı ------------------------------------------------------- */
{
  const u = urgentPeople([P("a", { birthDate: "1930" })], BUGUN);
  eq(u[0].key, "urgency.yasli-anisiz", "anahtar türle eşleşiyor");
}

eq(urgentPeople([], BUGUN), [], "boş ağaç boş liste");

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
