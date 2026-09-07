import { readdirSync, readFileSync, statSync } from "node:fs";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
/** Yorumları ayıkla: kuralı ANLATAN metin, kuralın kanıtı değildir. */
const kodu = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * KAPI: yazma yollarının ortak kuralları (denetim D bölümü).
 *
 * `version-lock-gate` "sürüm denetleniyor mu"yu tarıyor. Bu dosya üç başka
 * kapsamı tarıyor, hepsi aynı arıza türünden: bir kural bazı yollarda var,
 * bazılarında yok, ve eksik olan yol sessizce yanlış davranıyor.
 */

/* ══ 1. YAZAR (`by`) — akışta "biri" yazmasın ════════════════════════════ */
/*
 * `saveFamilyData(…, { by })` katkı akışının yazarını belirliyor. Dokuz
 * rota bunu geçirmiyordu ve akış o düzenlemeleri "biri" diye gösteriyordu.
 * En kötüsü aynı rotanın iki kipinde farklı davranmasıydı (`import` ve
 * `ai/extract`: "değiştir" kipinde yazar var, "ekle" kipinde yok) — aynı
 * kullanıcının aynı düğmesi, kipe göre farklı ad.
 *
 * Muafiyetler gerekçesiyle sayılıyor; liste değil TARAMA, yoksa yarın
 * eklenen rota sessizce yazarsız kalır.
 */
const BY_MUAF: Record<string, string> = {
  /*
   * Kapak: `saveFamilyData` geçmişe yalnız KİŞİ LİSTESİ değiştiğinde yazıyor
   * ve kapak listeye dokunmuyor. Yazarın gideceği bir kayıt yok.
   */
  "family/cover": "kişi listesi değişmiyor; geçmişe kayıt düşmüyor",
  /*
   * Zamanlanmış iş: oturum yok, dolayısıyla yazar da yok. Zaten geçmişe hiç
   * yazmıyor (`skipHistory`) — aşağıda ayrıca denetleniyor.
   */
  "cron/reminders": "zamanlanmış iş; oturum yok, geçmişe de yazmıyor",
};

function rotalar(dir: string, base = ""): string[] {
  const out: string[] = [];
  for (const ad of readdirSync(dir)) {
    const tam = `${dir}/${ad}`;
    if (statSync(tam).isDirectory()) out.push(...rotalar(tam, base ? `${base}/${ad}` : ad));
    else if (ad === "route.ts") out.push(base);
  }
  return out;
}

const kok = new URL("../app/api", import.meta.url).pathname;
const yazanlar = rotalar(kok).filter((r) =>
  /\bsaveFamilyData\s*\(/.test(readFileSync(`${kok}/${r}/route.ts`, "utf8"))
);
check(yazanlar.length >= 12, `yazan rotalar tarandı (${yazanlar.length})`);

for (const r of yazanlar) {
  const src = kodu(readFileSync(`${kok}/${r}/route.ts`, "utf8"));
  /* HER `saveFamilyData` çağrısı sayılıyor — biri yazarlı biri yazarsız olmasın. */
  const cagrilar = [...src.matchAll(/saveFamilyData\(/g)].map((c) => {
    /* Çağrının argüman listesi: parantez dengesiyle kes. */
    let derinlik = 0, son = c.index! + "saveFamilyData(".length - 1;
    for (let i = c.index! + "saveFamilyData".length; i < src.length; i++) {
      if (src[i] === "(") derinlik++;
      else if (src[i] === ")") { derinlik--; if (derinlik === 0) { son = i; break; } }
    }
    return src.slice(c.index!, son + 1);
  });
  /*
   * `by` bağlam nesnesinin adına göre `ctx.authorId`, `r.ctx.authorId`,
   * `g.ctx.authorId` olabiliyor — iddia adı değil ALANI arıyor. İlk yazdığımda
   * `ctx\.authorId` diye sabitlemiştim ve kuralı ZATEN uygulayan iki rota
   * sahte kırmızıya düşmüştü.
   */
  const yazarli = (a: string) => /\bby:\s*[\w.]*\bauthorId\b/.test(a);
  /* Geçmişe hiç yazmayan çağrının yazara ihtiyacı yok — yazar geçmiş kaydına gidiyor. */
  const atlayan = (a: string) => /skipHistory:\s*true/.test(a);
  const eksik = cagrilar.filter((a) => !yazarli(a) && !atlayan(a)).length;
  if (BY_MUAF[r])
    check(!cagrilar.some(yazarli), `${r}: muaf ve yazarsız (${BY_MUAF[r]})`);
  else
    check(eksik === 0, `${r}: her kayıt yazarı taşıyor (${eksik}/${cagrilar.length} taşımıyor)`);
}

/* ══ 2. ANONİM/OTOMATİK YAZMALAR GERİ ALMA RİNGİNİ YEMİYOR ══════════════ */
/*
 * Geri alma günlüğü 50 görüntüyle sınırlı ve amacı KULLANICININ kendi
 * düzenlemelerini geri alabilmesi. Postadaki bağlantıya tıklayan bir üçüncü
 * kişinin onayı ya da hatırlatma işinin jeton damgası bu ringi yediğinde iki
 * zarar birden veriyordu: kullanıcının gerçek bir düzenlemesi ringden
 * düşüyor, ve akışta hiç yapılmamış bir "düzenleme" görünüyordu.
 */
{
  const blob = kodu(read("../lib/blob.ts"));
  check(/skipHistory\?: boolean/.test(blob), "seçenek tanımlı");
  check(/if \(!opts\.skipHistory\)/.test(blob), "günlük yazımı seçeneğe bağlı");
  /*
   * KAYIT YİNE YAPILIYOR — atlanan YALNIZ geçmiş.
   *
   * İlk yazdığımda bu iddia konumla kuruluyordu ("`put` çağrısı guard'dan
   * SONRA geliyor mu") ve mutasyon testinde KAÇTI: guard ile `put` arasına
   * `if (opts.skipHistory) return;` eklendiğinde sıra hâlâ doğruydu, ama
   * seçenek artık kaydın kendisini de atlıyordu — yani "kaydet ama geçmişe
   * yazma" sessizce "hiç kaydetme"ye dönüşüyordu ve üçüncü kişinin onayı
   * hiçbir yere yazılmıyordu.
   *
   * İddia artık konuma değil KULLANIMA bakıyor: seçenek tek bir yerde ve
   * yalnız OLUMSUZ biçimde okunuyor. Olumlu bir `if (opts.skipHistory)`,
   * tanımı gereği yeni bir kapı demek.
   */
  check(!/if \(opts\.skipHistory\)/.test(blob), "seçenek yeni bir kapı açmıyor");
  const kullanim = (blob.match(/\bskipHistory\b/g) ?? []).length;
  check(kullanim === 2, `seçenek yalnız tanım ve tek guard'da geçiyor (${kullanim})`);
  const i = blob.indexOf("if (!opts.skipHistory)");
  const j = blob.indexOf("await put(blobPathname(userId)", i);
  check(j > i, "asıl kayıt guard'dan sonra");

  const lookup = kodu(read("../lib/contact-lookup.ts"));
  const kayitlar = [...lookup.matchAll(/saveFamilyData\([^)]*\)/g)];
  check(kayitlar.length >= 2, `anonim yazma yolları bulundu (${kayitlar.length})`);
  check(kayitlar.every((m) => /skipHistory: true/.test(m[0])),
    "üçüncü kişinin onay/çıkış tıklaması geçmişe YAZILMIYOR");

  const cron = kodu(read("../app/api/cron/reminders/route.ts"));
  check(/saveFamilyData\(u\.id, taze, \{ skipHistory: true \}\)/.test(cron),
    "zamanlanmış işin jeton damgası geçmişe YAZILMIYOR");
}

/* ══ 3. KİŞİ SİLİNCE AĞACIN DIŞI DA TEMİZLENİYOR ════════════════════════ */
/*
 * Kişiye işaret eden veri yalnız kişi listesinde değil: duygusal bağlar ve
 * hikâye talepleri ayrı blob'larda. Tekli silme baştan beri bağları
 * temizliyordu, TOPLU silme hiç uğramıyordu — yirmi kişi silindiğinde yirmi
 * kişinin bütün bağları ve onlar hakkındaki açık talepler kalıyordu. Açık
 * talep ölü veri değil, dışarıda dolaşan CANLI bir bağlantı.
 */
{
  const tekli = kodu(read("../app/api/family/person/[id]/route.ts"));
  const toplu = kodu(read("../app/api/family/bulk-delete/route.ts"));
  check(/forgetPeople\(/.test(tekli), "tekli silme ortak temizliği çağırıyor");
  check(/forgetPeople\(/.test(toplu), "toplu silme ortak temizliği çağırıyor");
  /* Temizlik kayıttan SONRA: başarısız olursa silme geri alınmamalı. */
  for (const [ad, src] of [["tekli", tekli], ["toplu", toplu]] as const) {
    const iKayit = src.lastIndexOf("await saveFamilyData(");
    const iTemiz = src.indexOf("forgetPeople(");
    check(iTemiz > iKayit, `${ad}: temizlik kişi kaydından SONRA`);
  }
  const forget = kodu(read("../lib/person-forget.ts"));
  check(/deleteBondsOfPeople\(/.test(forget), "bağlar temizleniyor");
  check(/closeRequestsOfPeople\(/.test(forget), "açık hikâye talepleri kapatılıyor");
  /*
   * İki depo AYRI `try` içinde: birinin okunamaması öbürünün temizlenmemesi
   * için sebep değil.
   */
  check((forget.match(/try \{/g) ?? []).length >= 2, "depolar birbirinden bağımsız");
  /*
   * Talep SİLİNMİYOR, kapatılıyor: gelmiş katkılar dışarıdan yazılmış aile
   * hikâyeleri ve geri getirilemezler.
   */
  const story = kodu(read("../lib/story-store.ts"));
  const i = story.indexOf("export async function closeRequestsOfPeople");
  const govde = story.slice(i, story.indexOf("\n}", i));
  check(/r\.closed = true/.test(govde), "talep kapatılıyor");
  check(!/splice|filter\(/.test(govde), "talep SİLİNMİYOR (katkılar duruyor)");
}

/* ══ 4. AĞAÇ BİRLEŞTİRME: `linked` de kaydediliyor ══════════════════════ */
/*
 * Koşul yalnız `added > 0` idi. Yeni kişi eklenmediği ama bağ birleştiği
 * durumda birleşmeler hesaplanıp yanıtta bildiriliyor, ama kaydedilmiyordu:
 * kullanıcı "0 eklendi · 5 bağlandı" görüyor, yenileyince beş bağın hiçbiri
 * yok. Sessiz bir kayıp değil, sessiz bir YALAN.
 */
{
  const mt = kodu(read("../app/api/tree/merge-tree/route.ts"));
  check(/if \(added > 0 \|\| linked > 0\)/.test(mt), "bağ birleşmesi de kaydediliyor");
  /* Kardeş uç aynı kuralı baştan doğru yazmıştı; ikisi ayrı düşmesin. */
  const gr = kodu(read("../app/api/tree/graft/route.ts"));
  check(/added === 0 && linked === 0/.test(gr), "aşılama ucunda kural aynı yönde");
}

/* ══ 5. İSTEMCİ SÜRÜM BAŞLIĞINI GÖNDERİYOR ═════════════════════════════ */
/*
 * Sunucu tarafı `reorder`da `versionMismatch`i baştan beri denetliyordu ama
 * istemci başlığı hiç göndermiyordu; `versionMismatch` başlık yokken `false`
 * döndüğü için kilit VARDI ama hiç devreye girmiyordu. Kodu okuyan "burası
 * korunuyor" diye geçiyordu — en sessiz koruma türü.
 */
{
  const actions = kodu(read("../lib/actions.ts"));
  const i = actions.indexOf("export async function reorderSiblings");
  const govde = actions.slice(i, actions.indexOf("\n}", i));
  check(/headers: mutationHeaders\(\)/.test(govde), "sıra değiştirme başlığı gönderiyor");
  check(!/"Content-Type": "application\/json"/.test(govde), "elle kurulmuş başlık kalmadı");

  /*
   * İÇE AKTARMA da aynı arızayı taşıyordu ve orada bedeli daha ağır:
   * "değiştir" kipi ağacın TAMAMINI dosyadaki listeyle eziyor, yani ekran
   * açıkken başkasının eklediği kişiler sessizce gidiyordu.
   */
  const imp = kodu(read("../lib/import-client.ts"));
  const cagrilar = [...imp.matchAll(/fetch\("\/api\/[^"]+", \{[^}]*\}/g)];
  check(cagrilar.length === 2, `içe aktarma uçları bulundu (${cagrilar.length})`);
  check(cagrilar.every((m) => /mutationHeaders\(false\)/.test(m[0])),
    "içe aktarma çağrıları sürüm başlığını gönderiyor");
  /*
   * `Content-Type` KONMUYOR: gövde `FormData` ve tarayıcı multipart sınırını
   * kendi üretiyor; elle konan bir başlık o sınırı bozar ve istek hiç
   * ayrıştırılamaz — kilidi eklerken içe aktarmayı tümden kırmanın yolu.
   */
  check(cagrilar.every((m) => !/Content-Type/.test(m[0])),
    "FormData gövdesine elle Content-Type konmuyor");

  const ws = kodu(read("../app/tree/Workspace.tsx"));
  const kapak = [...ws.matchAll(/fetch\("\/api\/family\/cover"[^)]*\)/g)];
  check(kapak.length === 2, `kapak çağrıları bulundu (${kapak.length})`);
  check(kapak.every((m) => /mutationHeaders\(/.test(m[0])), "kapak çağrıları da başlığı gönderiyor");
}

/* ══ 6. ÜYENİN GİRİŞ ADI AYNAYA GİDİYOR ════════════════════════════════ */
/*
 * Alan sonradan eklendi ve ayna güncellenmemişti: üye Blob'da adıyla vardı,
 * Postgres'te adsızdı. Bugün zararsız (okuma Blob'dan) ama Faz 3'ün varış
 * noktası okumayı Postgres'e çevirmek, ve o gün adıyla giriş yapan herkes
 * "böyle bir üye yok" görürdü.
 */
{
  const db = kodu(read("../lib/db.ts"));
  const i = db.indexOf("export async function dbReplaceMembers");
  const govde = db.slice(i, db.indexOf("\n}", i));
  check(/username: m\.username \?\? null/.test(govde), "giriş adı aynalanıyor");
  /*
   * Şema da taşımalı — yoksa `insert` her seferinde hata verir ve AYNANIN
   * TAMAMI ölür. Bu tam olarak bir kez oldu (`trees.updated_at`).
   */
  const sema = read("../supabase/schema.sql");
  const j = sema.indexOf("create table if not exists public.tree_members");
  const tablo = sema.slice(j, sema.indexOf(");", j));
  check(/username\s+text/.test(tablo), "şemada sütun var");
  check(!/username\s+text\s+not null/.test(tablo), "sütun boş bırakılabilir (eski üyeler)");
  check(/tree_members_username_idx/.test(sema), "ağaç içinde benzersizlik indeksi var");
  check(/lower\(username\)/.test(sema), "benzersizlik büyük/küçük harf duyarsız");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
