import type { Person } from "../types/family.ts";
import {
  VOICE_FIELDS,
  applyFacts,
  buildVoicePrompt,
  buildVoiceSystem,
  isVoiceField,
  parseVoiceJson,
  pendingFacts,
  quoteIsGrounded,
} from "../lib/voice.ts";

let ok = 0, fail = 0;
function eq<T>(got: T, want: T, msg: string) {
  if (JSON.stringify(got) === JSON.stringify(want)) ok++;
  else { fail++; console.log(`✗ ${msg}: bekl ${JSON.stringify(want)}, geldi ${JSON.stringify(got)}`); }
}
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }

const P = (id: string, extra: Partial<Person> = {}): Person => ({
  id, firstName: `Ad${id}`, lastName: "Soy", gender: "male",
  parentIds: [], spouseIds: [], ...extra,
});

const ANLATI =
  "Babam Selanik'ten gelmiş, mübadelede. Rize'ye yerleşmişler. " +
  "Dedemin adı Şaban'dı, marangozdu. 1923'te doğmuş.";

const json = (o: unknown) => JSON.stringify(o);

/* --- quoteIsGrounded: bu dosyanın asıl işi ------------------------------ */
eq(quoteIsGrounded("Rize'ye yerleşmişler", ANLATI), true, "birebir alıntı geçerli");
eq(quoteIsGrounded("RİZE'YE YERLEŞMİŞLER", ANLATI), true, "büyük harf sapması hoş görülür");
eq(quoteIsGrounded("Rize'ye   yerleşmişler", ANLATI), true, "çoklu boşluk hoş görülür");
eq(quoteIsGrounded("Rizeye yerlesmisler", ANLATI), false, "kesme ve aksan silinmiş metin GEÇMEZ");
eq(quoteIsGrounded("Trabzon'a yerleşmişler", ANLATI), false, "UYDURULMUŞ alıntı reddedilir");
eq(quoteIsGrounded("", ANLATI), false, "boş alıntı reddedilir");
eq(quoteIsGrounded("a", ANLATI), false, "aşırı kısa alıntı reddedilir (her metinde geçer)");
eq(quoteIsGrounded("Şaban'dı", ANLATI), true, "Türkçe karakterli alıntı");

/* --- parseVoiceJson: alıntısı tutmayan aday ATILIR ---------------------- */
{
  const cikti = json({
    transcript: ANLATI,
    people: [
      { ref: "new:1", firstName: "Şaban", relation: "dede", quote: "Dedemin adı Şaban'dı" },
      // UYDURMA: anlatıda "Hatice" hiç geçmiyor.
      { ref: "new:2", firstName: "Hatice", relation: "nine", quote: "Ninemin adı Hatice'ydi" },
    ],
    facts: [
      { personRef: "k1", field: "birthPlace", value: "Rize", quote: "Rize'ye yerleşmişler" },
      { personRef: "new:1", field: "occupation", value: "marangoz", quote: "marangozdu" },
      // UYDURMA: model 1925 diyor ama metinde 1923 var.
      { personRef: "new:1", field: "birthDate", value: "1925", quote: "1925'te doğmuş" },
    ],
  });
  const r = parseVoiceJson(cikti);
  eq(r.transcript, ANLATI, "deşifre metni geliyor");
  eq(r.people.map((p) => p.firstName), ["Şaban"], "uydurulmuş kişi elendi");
  eq(r.facts.map((f) => f.value), ["Rize", "marangoz"], "uydurulmuş tarih elendi");
  eq(r.facts[0].field, "birthPlace", "alan korunuyor");
}

/* --- Şema disiplini ------------------------------------------------------ */
{
  const r = parseVoiceJson(json({
    transcript: ANLATI,
    facts: [
      // İzin verilmeyen alanlar — gizlilik ve yapı asla sesle değişmez.
      { personRef: "k1", field: "confidential", value: "true", quote: "Rize'ye yerleşmişler" },
      { personRef: "k1", field: "parentIds", value: "x", quote: "Rize'ye yerleşmişler" },
      { personRef: "k1", field: "photos", value: "x", quote: "Rize'ye yerleşmişler" },
      { personRef: "k1", field: "birthPlace", value: "Rize", quote: "Rize'ye yerleşmişler" },
    ],
  }));
  eq(r.facts.map((f) => f.field), ["birthPlace"], "yalnız izinli alanlar geçiyor");
  check(!isVoiceField("confidential"), "confidential izinli alan değil");
  check(!isVoiceField("parentIds"), "parentIds izinli alan değil");
  check(!isVoiceField("privateFields"), "privateFields izinli alan değil");
  for (const f of VOICE_FIELDS) check(isVoiceField(f), `${f} izinli`);
}
{
  // `new:` kimliği, gerçekten önerilmiş bir kişiye işaret etmeli.
  const r = parseVoiceJson(json({
    transcript: ANLATI,
    people: [],
    facts: [{ personRef: "new:7", field: "occupation", value: "marangoz", quote: "marangozdu" }],
  }));
  eq(r.facts.length, 0, "sahipsiz `new:` kimliğine bilgi yazılmaz");
}
{
  // Aynı kişi + aynı alan iki kez gelirse ilki kalır (çelişkiyi çoğaltma).
  const r = parseVoiceJson(json({
    transcript: ANLATI,
    facts: [
      { personRef: "k1", field: "birthPlace", value: "Rize", quote: "Rize'ye yerleşmişler" },
      { personRef: "k1", field: "birthPlace", value: "Selanik", quote: "Selanik'ten gelmiş" },
    ],
  }));
  eq(r.facts.map((f) => f.value), ["Rize"], "aynı alan için tek aday");
}

/* --- Bozuk çıktı: anlatı yine de kurtarılmalı ---------------------------- */
{
  const r = parseVoiceJson("Babam Selanik'ten gelmiş. Rize'ye yerleşmişler.");
  eq(r.transcript, "Babam Selanik'ten gelmiş. Rize'ye yerleşmişler.", "düz metin deşifre sayılır");
  eq(r.facts.length, 0, "çıkarım yok ama anlatı duruyor");
}
{
  const r = parseVoiceJson("```json\n" + json({ transcript: ANLATI, facts: [] }) + "\n```");
  eq(r.transcript, ANLATI, "kod bloğu soyuluyor");
}
{
  eq(parseVoiceJson(""), { transcript: "", people: [], facts: [] }, "boş çıktı");
  eq(parseVoiceJson(json({ people: [], facts: [] })), { transcript: "", people: [], facts: [] },
    "deşifresiz çıktıdan aday çıkmaz");
  const r = parseVoiceJson(json({ transcript: ANLATI, people: "hayır", facts: 42 }));
  eq([r.people.length, r.facts.length], [0, 0], "yanlış tipli alanlar yok sayılıyor");
}

/* --- pendingFacts: zaten doğru olanı sorma ------------------------------ */
{
  const people = [P("k1", { birthPlace: "Rize", occupation: "öğretmen" })];
  const facts = [
    { personRef: "k1", field: "birthPlace" as const, value: "Rize", quote: "q" },
    { personRef: "k1", field: "occupation" as const, value: "marangoz", quote: "q" },
    { personRef: "k1", field: "nickname" as const, value: "Topal", quote: "q" },
    { personRef: "new:1", field: "birthDate" as const, value: "1923", quote: "q" },
  ];
  const bekleyen = pendingFacts(facts, people);
  eq(bekleyen.map((f) => f.field), ["occupation", "nickname", "birthDate"],
    "zaten aynı olan alan sorulmuyor");
  eq(bekleyen[0].current, "öğretmen", "ÇELİŞEN alanda eski değer gösteriliyor");
  check(!("current" in bekleyen[1]), "boş alanda eski değer yok");
  check(!("current" in bekleyen[2]), "yeni kişide eski değer yok");
}
{
  // Büyük/küçük ve aksan farkı "aynı" sayılmalı: kullanıcıyı boşuna
  // "Rize mi RİZE mi" diye onaylatmayalım.
  const people = [P("k1", { birthPlace: "rize" })];
  const f = [{ personRef: "k1", field: "birthPlace" as const, value: "RİZE", quote: "q" }];
  eq(pendingFacts(f, people).length, 0, "yalnız yazım farkı aday sayılmaz");
}

/* --- applyFacts ---------------------------------------------------------- */
{
  const p = P("k1", { bio: "Eski hikâye." });
  const out = applyFacts(p, [
    { personRef: "k1", field: "birthPlace", value: "Rize", quote: "q" },
    { personRef: "k1", field: "bio", value: "Mübadelede gelmiş.", quote: "q" },
    { personRef: "baska", field: "occupation", value: "x", quote: "q" },
  ]);
  eq(out.birthPlace, "Rize", "alan yazılıyor");
  eq(out.bio, "Eski hikâye.\n\nMübadelede gelmiş.", "bio BİRİKİYOR, üzerine yazmıyor");
  check(!("occupation" in out), "başka kişinin bilgisi sızmıyor");
}
{
  // İki `bio` adayı da birikmeli, ikincisi birinciyi ezmemeli.
  const out = applyFacts(P("k1"), [
    { personRef: "k1", field: "bio", value: "Bir.", quote: "q" },
    { personRef: "k1", field: "bio", value: "İki.", quote: "q" },
  ]);
  eq(out.bio, "Bir.\n\nİki.", "iki bio adayı da korunuyor");
  eq(applyFacts(P("k1"), []), {}, "aday yoksa boş güncelleme");
}

/* --- İstem metni --------------------------------------------------------- */
{
  const s = buildVoiceSystem("tr");
  check(/BİREBİR/.test(s), "sistem istemi birebir deşifre istiyor");
  check(/TAHMİN ETME/.test(s), "sistem istemi tahmini yasaklıyor");
  check(buildVoiceSystem("en").length > 20, "İngilizce karşılığı var");

  const p = buildVoicePrompt(P("k1", { firstName: "Şaban" }), "Dedeni anlatır mısın?", [P("k2")], "tr");
  check(p.includes("Şaban"), "konuşulan kişi isteme giriyor");
  check(p.includes("Dedeni anlatır mısın?"), "soru isteme giriyor");
  check(p.includes("k1"), "konuşulan kişinin kimliği personRef olarak veriliyor");
  check(VOICE_FIELDS.every((f) => p.includes(f)), "izinli alanlar şemada sayılıyor");
  // Konuşulan kişi olmadan da çalışmalı (serbest kayıt).
  check(buildVoicePrompt(undefined, "Anlat", [], "tr").includes("Anlat"), "kişisiz kayıt");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
