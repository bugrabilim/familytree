process.env.AUTH_SECRET = "test-gizli-anahtar";

const {
  isUnsubConfigured, makeAskToken, makeUnsubToken, matchesHash,
  packToken, parseToken, sha256, verifyUnsubToken,
} = await import("../lib/contact-token.ts");

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }

const LOC = { treeId: "agac-1", personId: "kisi-1" };

/* ── Adres bölümü ────────────────────────────────────────────────────────── */
{
  const t = packToken(LOC, "sir");
  const p = parseToken(t);
  check(p?.treeId === "agac-1", "ağaç kimliği geri okunuyor");
  check(p?.personId === "kisi-1", "kişi kimliği geri okunuyor");
  check(p?.proof === "sir", "sır geri okunuyor");

  // Nokta ayraç seçildiği için kimlikte nokta geçmesi bölümlemeyi kaydırırdı.
  const noktali = packToken({ treeId: "a.b.c", personId: "x.y" }, "s");
  const pn = parseToken(noktali);
  check(pn?.treeId === "a.b.c", "kimlikteki nokta bölümlemeyi bozmuyor");
  check(pn?.personId === "x.y", "kişi kimliğindeki nokta korunuyor");
}

/* --- Biçimsiz jetonlar reddediliyor -------------------------------------- */
{
  const bos = ["", "a", "a.b", "a.b.c.d", "..", "a..c", ".b.c", "a.b."];
  for (const t of bos) check(parseToken(t) === null, `biçimsiz jeton reddediliyor: "${t}"`);
  check(parseToken(null) === null, "null reddediliyor");
  check(parseToken(42) === null, "sayı reddediliyor");
  check(parseToken(undefined) === null, "undefined reddediliyor");
}

/* --- Base64url ÇİFT YÖNLÜ denetleniyor ----------------------------------- */
/*
 * `Buffer.from(x, "base64url")` geçersiz karakterleri SESSİZCE atıyor: "YWJj"
 * ile "YW!Jj" aynı sonuca çözülüyor. Geri kodlayıp karşılaştırmasaydık tek bir
 * kimlik için sonsuz sayıda geçerli yazım kabul edilirdi — ve bu, aynı kaydı
 * gösteren ama farklı görünen bağlantılar demek.
 */
{
  const gecerli = packToken(LOC, "s");
  const bozuk = gecerli.replace("YWdhYy0x", "YWdhYy0x!");
  check(parseToken(bozuk) === null, "kaçak karakterli base64url reddediliyor");
}

/* ── Onay jetonu — tek kullanımlık ───────────────────────────────────────── */
{
  const { token, hash } = makeAskToken(LOC);
  const p = parseToken(token);
  check(!!p, "üretilen jeton çözülebiliyor");
  check(p?.treeId === LOC.treeId && p?.personId === LOC.personId, "adres taşınıyor");
  check(matchesHash(p!.proof, hash), "sır kendi özetine uyuyor");

  // Ham sır KAYDA yazılmıyor: kayıtta yalnız özet durur.
  check(hash !== p!.proof, "kayda yazılan değer ham sır DEĞİL");
  check(hash === sha256(p!.proof), "özet sırdan türetiliyor");

  const b = makeAskToken(LOC);
  check(b.token !== token, "her üretim farklı jeton veriyor");
  check(!matchesHash(parseToken(b.token)!.proof, hash), "başka jetonun sırrı uymuyor");
}

/* --- Özet yoksa asla eşleşmiyor ------------------------------------------ */
/*
 * Yanıt gelince özet DÜŞÜYOR. O andan sonra aynı bağlantı bir daha karar
 * değiştiremesin diye, özetsiz kayıt her sırrı reddetmeli.
 */
{
  check(!matchesHash("herhangi", undefined), "özet yoksa eşleşme yok");
  check(!matchesHash("herhangi", ""), "boş özet eşleşmiyor");
  check(!matchesHash("", undefined), "boş sır + özetsiz kayıt eşleşmiyor");
}

/* ── Abonelikten çıkma jetonu — kalıcı ───────────────────────────────────── */
{
  check(isUnsubConfigured(), "sunucu sırrı varken çıkış jetonu üretilebiliyor");

  const t = makeUnsubToken(LOC)!;
  check(!!t, "çıkış jetonu üretiliyor");

  /*
   * BELİRLEYİCİ ve saklanmıyor. Her postada aynı bağlantı üretilebilmeli:
   * onay jetonu yanıt gelince düşüyor, ondan türetilemez; ve onay vermiş biri
   * fikrini yıllar sonra değiştirebilir.
   */
  check(makeUnsubToken(LOC) === t, "çıkış jetonu belirleyici (her seferinde aynı)");

  const geri = verifyUnsubToken(t);
  check(geri?.treeId === LOC.treeId && geri?.personId === LOC.personId, "çıkış jetonu kime ait olduğunu söylüyor");
}

/* --- ADRES OYNANIRSA imza tutmuyor --------------------------------------- */
/*
 * Bu, çıkış bağlantısının en kritik özelliği: HMAC adresin ÜSTÜNDEN
 * hesaplanıyor. Hesaplanmasaydı, kendi çıkış bağlantısını alan biri ağaç/kişi
 * kimliğini değiştirip BAŞKASINI abonelikten çıkarabilirdi.
 */
{
  const t = makeUnsubToken(LOC)!;
  const p = parseToken(t)!;
  const baskasi = packToken({ treeId: LOC.treeId, personId: "kisi-2" }, p.proof);
  check(verifyUnsubToken(baskasi) === null, "başka kişiye taşınan imza reddediliyor");
  const baskaAgac = packToken({ treeId: "agac-2", personId: LOC.personId }, p.proof);
  check(verifyUnsubToken(baskaAgac) === null, "başka ağaca taşınan imza reddediliyor");
  check(verifyUnsubToken(packToken(LOC, "uydurma")) === null, "uydurma imza reddediliyor");
  check(verifyUnsubToken(packToken(LOC, p.proof + "x")) === null, "uzatılmış imza reddediliyor");
  check(verifyUnsubToken("bozuk") === null, "biçimsiz çıkış jetonu reddediliyor");
}

/* --- Onay jetonu çıkış jetonu YERİNE geçemiyor --------------------------- */
/*
 * İki jeton aynı biçimi paylaşıyor. Doğrulamalar ayrı olmasaydı, rastgele
 * sırlı bir onay bağlantısı çıkış ucunda da kabul edilirdi.
 */
{
  const { token } = makeAskToken(LOC);
  check(verifyUnsubToken(token) === null, "onay jetonu çıkış olarak kabul edilmiyor");
}

/* --- Sunucu sırrı YOKSA kapalı düşüyor ----------------------------------- */
/*
 * Rastgele bir sırra düşülseydi, her yeniden başlatmada bütün çıkış
 * bağlantıları sessizce geçersiz olurdu — ve kimse nedenini anlamazdı.
 */
{
  const eski = process.env.AUTH_SECRET;
  delete process.env.AUTH_SECRET;
  check(!isUnsubConfigured(), "sır yokken yapılandırılmamış görünüyor");
  check(makeUnsubToken(LOC) === null, "sır yokken çıkış jetonu üretilmiyor");
  check(verifyUnsubToken(packToken(LOC, "x")) === null, "sır yokken hiçbir çıkış jetonu doğrulanmıyor");
  process.env.AUTH_SECRET = eski;
  check(isUnsubConfigured(), "sır geri gelince yeniden çalışıyor");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
