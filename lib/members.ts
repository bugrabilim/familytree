import { mutateStore } from "@/lib/store-mutate";
import { put, get, list } from "@vercel/blob";
import { createHash, randomBytes } from "crypto";
import { compare } from "bcryptjs";
import type { Invite, Member, Pairing, PairInvite, ShareLink, TreeAccess, TreeRole } from "@/types/user";
import type { ShareScope } from "@/lib/share-scope";
import { dbReplaceInvites, dbReplaceMembers } from "@/lib/db";
import { withTimeout, MIRROR_TIMEOUT_MS } from "@/lib/with-timeout";
import { findUserById } from "@/lib/users";
// Saf normalleştirme `lib/tree-access.ts`te (birim testli): `shares` alanı
// burada DÜŞÜRÜLMEMELİ — düşerse tüm paylaşım bağlantıları kaybolur.
import { normalizeAccess, normalizeShares } from "@/lib/tree-access";
import { isSoftDeleted } from "@/lib/retention";
import { normalizeUsername, usernameTaken } from "@/lib/username";

/**
 * Ağaç erişim (üye + davet) deposu — Madde 13.
 *
 * Her ağaç için ayrı blob: `tree-access-<treeId>.json`. treeId, ağacı kuran
 * (founder) hesabın kimliğidir; founder her zaman admin sayılır ve burada
 * saklanmaz. Yalnız davetle katılan üyeler ve bekleyen davetler tutulur.
 */

function accessPathname(treeId: string) {
  return `tree-access-${treeId}.json`;
}

const empty = (): TreeAccess & { updatedAt: string } => ({
  members: [],
  invites: [],
  /*
   * Damga BOŞ kayıtta da var. `mutateStore` iki okumanın damgasını
   * karşılaştırıyor; `undefined` bırakılsaydı henüz hiç yazılmamış bir ağaç
   * için koruma çalışmazdı — ve ilk üyenin eklendiği an tam da iki isteğin
   * çakışmaya en yatkın olduğu an.
   */
  updatedAt: new Date(0).toISOString(),
});

/**
 * OKU → DEĞİŞTİR → YAZ, çakışma denetimiyle (`lib/store-mutate.ts`).
 *
 * Bu dosya üyeleri, davetleri, PAYLAŞIM BAĞLANTILARINI ve eşleşmeleri tek bir
 * blob'da tutuyor; her değişiklik dosyanın tamamını geri yazıyor. Kilit
 * yokken iki eşzamanlı işlem birbirini siliyordu — ve buradaki kayıtlar
 * yalnız veri değil YETKİ: silinen bir üye satırı erişim kaybı, silinen bir
 * davet "bağlantım çalışmıyor", silinen bir paylaşım bağlantısı ise
 * dışarıya verilmiş bir adresin ölmesi demek.
 *
 * `mirror: false` seçeneği geçiriliyor olabilir; sarmalayıcı onu da taşıyor.
 */
function mutate<T>(
  treeId: string,
  degistir: (data: TreeAccess & { updatedAt: string }) => { yaz: boolean; sonuc: T } | Promise<{ yaz: boolean; sonuc: T }>,
  opts: { mirror?: boolean } = {}
): Promise<T> {
  return mutateStore(
    () => getTreeAccess(treeId),
    (d) => saveTreeAccess(treeId, d, opts),
    degistir,
    "Erişim kaydı"
  );
}

/**
 * OKUNAMAYAN DOSYA, BOŞ DOSYA DEĞİLDİR.
 *
 * Burada tutulan şey üyeler, davetler, paylaşım bağlantıları ve eşleştirmeler.
 * Geçici bir okuma hatasında boş kayıt dönmek, `oku → değiştir → yaz`
 * yapan her çağıranın (davet oluştur, üye çıkar, daveti iptal et,
 * eşleştirme kabul et…) bunların HEPSİNİ silmesi demekti.
 *
 * `strict` bayrağı bu tehlike için eklenmişti ama koruma eksikti: "yanıt
 * geldi ama 200 değil" dalı bayrağa hiç BAKMIYORDU ve koşulsuz boş
 * dönüyordu. Yani `strict: true` yazan çağıran bile korunmuyordu.
 *
 * Bayrak kaldırıldı. Artık tek davranış var ve güvenli olan o: dosya
 * GERÇEKTEN yoksa boş, "var ama okuyamadım" HATA. Bir yüzey geçici hatada
 * boş görünmeyi tercih ediyorsa bunu KENDİ çağrısında yakalamalı — orada
 * görünür olur; burada bir bayrağın arkasında görünmez oluyordu.
 */
/**
 * Dönüş tipi damgayı ZORUNLU sayıyor (`TreeAccess`te isteğe bağlı).
 *
 * `normalizeAccess` her okumada bir değer koyuyor — depolanan eski dosyada
 * alan olmasa bile. Tipin bunu söylemesi şart: `mutateStore` iki okumanın
 * damgasını karşılaştırıyor ve `undefined === undefined` her eski ağacı
 * "değişmemiş" gösterirdi, yani koruma tam da en eski ağaçlarda çalışmazdı.
 */
export async function getTreeAccess(treeId: string): Promise<TreeAccess & { updatedAt: string }> {
  const pathname = accessPathname(treeId);

  // (1) Önce DOĞRUDAN pathname ile `get` — YENİ yazılan kaydı hemen görür (güçlü
  //     tutarlılık; #2 ilk-paylaşım penceresi için). Ancak bazı ortamlarda
  //     pathname'den URL çözümü blob'u bulamayıp `null`/304 dönebiliyor — bu
  //     durumda paylaşım "geçersiz" görünüyordu. O yüzden başarısızsa (2)'ye düş.
  try {
    const direct = await get(pathname, { access: "private", useCache: false });
    if (direct && direct.statusCode === 200) {
      return normalizeAccess((await new Response(direct.stream).json()) as TreeAccess);
    }
    // direct === null (blob yok gibi görünüyor) ya da 304 → list yedeğine düş.
  } catch {
    /* doğrudan get hata verdi → (2) list yedeğine düş */
  }

  // (2) `list({prefix}) + get(latest.pathname)` — uygulamanın geri kalanında
  //     (aile verisi okuması) ÇALIŞTIĞI KANITLI yol. `addRandomSuffix:false`
  //     olsa da bu ortamda güvenilir okuma yolu budur; doğrudan get bazı
  //     blob'ları çözemediğinde kaydı yine de bulur.
  try {
    const { blobs } = await list({ prefix: pathname });
    if (blobs.length === 0) return empty(); // gerçekten hiç kayıt yok
    const latest = blobs.sort(
      (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    )[0];
    const result = await get(latest.pathname, { access: "private", useCache: false });
    if (!result || result.statusCode !== 200)
      throw new Error(`ağaç erişim kaydı okunamadı (HTTP ${result?.statusCode ?? "yanıt yok"})`);
    return normalizeAccess((await new Response(result.stream).json()) as TreeAccess);
  } catch (e) {
    /*
     * Yükseliyor. Eskiden burada `strict` değilse boş kayıt dönülüyordu ve
     * bayrağı geçirmeyi unutan yedi işlev (davet oluştur/kabul et/iptal et,
     * üye çıkar, paylaşımları sıfırla, eşleştirme oluştur/kabul et) o boş
     * kaydı diske yazıyordu.
     */
    throw e;
  }
}

/**
 * Erişim kaydını yazar.
 *
 * `mirror: false` yalnız ÜYE/DAVET DIŞI bir alan değiştiğinde kullanılır
 * (bugün: ziyaret sayacı). Ayna `dbReplaceMembers`/`dbReplaceInvites` ile
 * çalışıyor, yani "sil ve yeniden yaz": üyelerle ilgisi olmayan bir yazımda
 * onu çağırmak, her anonim sayfa görüntülemesinde bütün üye ve davet
 * satırlarını silip yeniden kurmak demekti.
 */
async function saveTreeAccess(
  treeId: string,
  data: TreeAccess,
  opts: { mirror?: boolean } = {}
): Promise<void> {
  /* Damga her yazmada tazeleniyor — çakışma denetiminin dayanağı bu. */
  data.updatedAt = new Date().toISOString();
  await put(accessPathname(treeId), JSON.stringify(data), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
  if (opts.mirror === false) return;
  // Faz 2c — çift-yazma (best-effort): üye/davetleri Postgres'e de yaz.
  // Blob kaynaktır; hata kullanıcının işlemini etkilemez. Ayna YANIT VERMEZSE
  // (duraklatılmış/yavaş Supabase) istek asılı kalmasın diye süre sınırı var —
  // aksi hâlde "paylaşım bağlantısı oluştur" bekleyip sonuçsuz kalıyordu (#3).
  try {
    await withTimeout(
      (async () => {
        await dbReplaceMembers(treeId, data.members);
        await dbReplaceInvites(treeId, data.invites);
      })(),
      MIRROR_TIMEOUT_MS,
      "access→postgres"
    );
  } catch (e) {
    console.warn(`[cift-yazma] access→postgres (${treeId}):`, (e as Error).message);
  }
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/* ── YUMUŞAK SİLİNMİŞ AĞAÇ: yalnız `treeId` bilen yüzeylerin kapısı ─────────
 *
 * Yumuşak silmenin asıl kaydı hesabın ağaç kaydında (`lib/trees.ts`), ama
 * paylaşım bağlantısı, davet, üye girişi, RSVP ve hikâye bağlantısı sahibin
 * kim olduğunu BİLMİYOR — ellerinde yalnız bir `treeId` var. O yüzden damga
 * ağacın kendi erişim dosyasında da duruyor ve bu dosyadaki bütün jeton/şifre
 * çözümleri ona bakıyor.
 *
 * Yarı gizlenmiş bir ağaç en kötüsü: kullanıcı sildiğini sanar, WhatsApp'taki
 * bağlantı hâlâ açılır.
 * ------------------------------------------------------------------------ */

/**
 * Ağaç yumuşak silinmiş mi? (yalnız `treeId` bilen çağıranlar için).
 *
 * Okuma başarısız olursa HATA yükselir, "silinmemiş" denmez. Bu bir gizleme
 * kapısı; okunamayan dosyayı "canlı" saymak, geçici bir Blob hatasında
 * silinmiş ağacın bağlantılarını yeniden açardı. Çağıranlar (girişsiz uçlar)
 * hatayı "bağlantı geçersiz" diye karşılar. Davranış artık `getTreeAccess`in
 * kendisinde ve tek — ayrı bir bayrağa gerek kalmadı.
 */
export async function isTreeDeleted(treeId: string): Promise<boolean> {
  return isSoftDeleted(await getTreeAccess(treeId));
}

/**
 * Ağacın erişim dosyasına silme damgasını yazar (`null` → damgayı kaldırır).
 *
 * HATA YÜKSELİR. Çağıran (`lib/trees.ts`) damgayı kayda yazmadan ÖNCE burayı
 * çağırıyor: bu yazma başarısızsa ağaç listeden düşer ama bağlantıları açık
 * kalırdı — silmenin en kötü yarım hâli.
 *
 * `mirror: false`: üye/davet listeleri değişmiyor, yalnız damga. Ayna "sil ve
 * yeniden yaz" ile çalıştığı için gereksiz yere bütün üye satırlarını
 * döndürmenin anlamı yok.
 */
export async function markTreeDeleted(treeId: string, deletedAt: string | null): Promise<void> {
  return mutate<void>(treeId, (data) => {
    if (deletedAt) data.deletedAt = deletedAt;
    else delete data.deletedAt;
    return { yaz: true, sonuc: undefined };
  }, { mirror: false });
}

/**
 * Davet oluştur. Ham jeton `<treeId>.<secret>` biçiminde döner (yalnız
 * bağlantıda görünür); blob'da secret'ın SHA-256 özeti saklanır. Tek kullanım,
 * varsayılan 7 gün geçerli.
 */
export async function createInvite(
  treeId: string,
  role: TreeRole,
  createdBy: string,
  ttlDays = 7
): Promise<{ token: string; invite: Invite }> {
  const secret = randomBytes(24).toString("hex");
  const token = `${treeId}.${secret}`;
  const now = Date.now();
  const invite: Invite = {
    tokenHash: sha256(secret),
    role,
    createdBy,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttlDays * 86400_000).toISOString(),
  };
  return mutate<{ token: string; invite: Invite }>(treeId, (data) => {
    data.invites.push(invite);
    return { yaz: true, sonuc: { token, invite } };
  });
}

/** Davet bağlantısındaki ham jetondan treeId'yi ayıkla (`<treeId>.<secret>`). */
export function parseInviteToken(token: string): { treeId: string; secret: string } | null {
  const i = token.indexOf(".");
  if (i <= 0 || i === token.length - 1) return null;
  return { treeId: token.slice(0, i), secret: token.slice(i + 1) };
}

/** Geçerli, kullanılmamış, süresi dolmamış daveti döndürür (yoksa null). */
export async function findValidInvite(token: string): Promise<{ treeId: string; invite: Invite } | null> {
  const parsed = parseInviteToken(token);
  if (!parsed) return null;
  const { treeId, secret } = parsed;
  const hash = sha256(secret);
  const data = await getTreeAccess(treeId);
  if (isSoftDeleted(data)) return null; // silinmiş ağaca davet geçersizdir
  const invite = data.invites.find((iv) => iv.tokenHash === hash);
  if (!invite || invite.usedAt) return null;
  if (new Date(invite.expiresAt).getTime() < Date.now()) return null;
  return { treeId, invite };
}

/**
 * Daveti kullanıp üye oluştur (atomik: daveti "kullanıldı" işaretler ve üyeyi
 * aynı yazıda ekler). Jeton geçersizse null.
 */
export async function acceptInvite(
  token: string,
  displayName: string,
  passwordHash: string,
  /**
   * Düz-metin şifre — YALNIZ çakışma denetimi için (saklanmıyor).
   *
   * Kullanıcı adı VERİLMEYEN eski yolda kimlik şifreye göre çözülüyor
   * (`findMemberByPassword`), dolayısıyla aynı ağaçta iki üye aynı şifreyi
   * seçerse biri ötekinin kimliğiyle VE ROLÜYLE oturum açardı. Kapı o yol
   * için hâlâ burada.
   *
   * Kullanıcı adı VERİLDİĞİNDE bu denetim çalıştırılmıyor ve
   * çalıştırılmamalı: kimlik artık adla çözülüyor, şifre yalnız o üyenin
   * özetiyle karşılaştırılıyor. Denetimi sürdürmek, geçerli bir şifreyi
   * "başkası kullanıyor" diye reddetmek — yani var olmayan bir çakışmayı
   * duyurmak — olurdu.
   */
  plainPassword?: string,
  /** Giriş adı (madde 36). Ham hâliyle gelir; normalleştirilip saklanır. */
  username?: string
): Promise<
  { treeId: string; member: Member } | { error: "sifre-dolu" | "ad-dolu" } | null
> {
  const parsed = parseInviteToken(token);
  if (!parsed) return null;
  const { treeId, secret } = parsed;
  const hash = sha256(secret);

  /*
   * KAYIP YAZMA KORUMASI burada özellikle gerekiyordu: davet bağlantısı bir
   * aileye toplu gidiyor ve iki kişinin aynı dakikada katılması beklenen
   * durum. Korumasızken ikincisi birincinin üyelik satırını siliyordu —
   * kişi "katıldım" görüyor, ertesi gün giriş yapamıyordu.
   *
   * Gövde ASENKRON: şifre çakışması `compare` ile, kurucunun şifresi ayrı
   * bir okumayla denetleniyor. Doğrulama okuması gövdeden sonra, yazmadan
   * hemen önce yapıldığı için bu pencereyi genişletmiyor.
   */
  type Sonuc = { treeId: string; member: Member } | { error: "sifre-dolu" | "ad-dolu" } | null;
  return mutate<Sonuc>(treeId, async (data) => {
  if (isSoftDeleted(data)) return { yaz: false, sonuc: null }; // silinmiş ağaca yeni üye alınmaz
  const invite = data.invites.find((iv) => iv.tokenHash === hash);
  if (!invite || invite.usedAt) return { yaz: false, sonuc: null };
  if (new Date(invite.expiresAt).getTime() < Date.now()) return { yaz: false, sonuc: null };

  /*
   * Aynı ağaçta AYNI ŞİFRE olamaz (yukarıdaki gerekçe). Kurucunun şifresi de
   * denetleniyor: `verifyLogin` önce onu deniyor, dolayısıyla kurucunun
   * şifresini seçen bir üye hiç giriş yapamaz — sessiz bir kilit olurdu.
   */
  const ad = normalizeUsername(username);
  if (ad && usernameTaken(data.members, ad)) return { yaz: false, sonuc: { error: "ad-dolu" } };

  /*
   * Şifre çakışması denetimi YALNIZ adsız katılımda. Ad varsa kimlik adla
   * çözülüyor ve iki üyenin aynı şifreyi seçmesinin bir zararı yok;
   * denetimi sürdürmek, geçerli bir şifreyi "başkası kullanıyor" diye
   * reddetmek olurdu — üstelik bu, başkasının şifresini doğrulayan bir
   * bilgi sızıntısı.
   */
  if (!ad && plainPassword) {
    for (const m of data.members) {
      if (await compare(plainPassword, m.passwordHash))
        return { yaz: false, sonuc: { error: "sifre-dolu" } };
    }
    const kurucu = await findUserById(treeId);
    if (kurucu && (await compare(plainPassword, kurucu.passwordHash)))
      return { yaz: false, sonuc: { error: "sifre-dolu" } };
  }

  const member: Member = {
    id: crypto.randomUUID(),
    displayName: displayName.trim(),
    ...(ad ? { username: ad } : {}),
    passwordHash,
    role: invite.role,
    joinedAt: new Date().toISOString(),
  };
  invite.usedAt = new Date().toISOString();
  data.members.push(member);
  return { yaz: true, sonuc: { treeId, member } };
  });
}

/**
 * Giriş için: verilen şifre bir üyenin şifresiyle eşleşiyor mu?
 *
 * DİKKAT — bu, ŞİFREYE göre kimlik çözüyor: giriş formu ağaç adı + şifre
 * istiyor, üye seçtirmiyor. İki üye aynı şifreyi seçerse listedeki İLK
 * eşleşen kazanır, yani bir `viewer` kendi şifresini yazıp bir `admin`in
 * kimliğiyle oturum açabilir (rolü ve `authorId`si de onun olur).
 *
 * Kapı bu yüzden KATILMA anına kondu (`acceptInvite`): aynı ağaçta aynı
 * şifreye izin verilmiyor. Burada çözmek mümkün değil — elde yalnız şifre
 * var, hangi üyenin kastedildiğini söyleyecek başka bir bilgi yok.
 */
export async function findMemberByPassword(
  treeId: string,
  password: string
): Promise<Member | null> {
  const data = await getTreeAccess(treeId);
  // Ağaç silinmişse üye de giremez: yoksa kurucu giremezken davetlisi
  // girebilirdi ve ağaç "silinmiş" görünürken yaşamaya devam ederdi.
  if (isSoftDeleted(data)) return null;
  for (const m of data.members) {
    /*
     * KULLANICI ADI OLAN ÜYE BU YOLDAN GİREMEZ (madde 36).
     *
     * Girebilseydi belirsizlik geri gelirdi: adlı bir üyeyle adsız bir üye
     * aynı şifreyi taşıyabiliyor (adlı katılımda şifre çakışması artık
     * denetlenmiyor) ve bu döngü ilk eşleşeni döndürüyor — yani adsız üye,
     * adlı üyenin kimliğiyle VE ROLÜYLE oturum açabilirdi.
     *
     * Adını belirleyen üye bundan sonra adıyla giriyor; eski yol yalnız
     * hiç adı olmayanlar için duruyor.
     */
    if (m.username) continue;
    if (await compare(password, m.passwordHash)) return m;
  }
  return null;
}

/**
 * Giriş için: kullanıcı adına göre üye (madde 36).
 *
 * Şifre BURADA karşılaştırılmıyor — çağıran yalnız BU üyenin özetiyle
 * karşılaştırıyor. Bütün üyeleri gezen eski yolun aksine giriş maliyeti
 * artık üye sayısından bağımsız: tek bcrypt.
 */
export async function findMemberByUsername(
  treeId: string,
  username: string
): Promise<Member | null> {
  const ad = normalizeUsername(username);
  if (!ad) return null;
  const data = await getTreeAccess(treeId);
  if (isSoftDeleted(data)) return null;
  return data.members.find((m) => normalizeUsername(m.username) === ad) ?? null;
}

export async function removeMember(treeId: string, memberId: string): Promise<void> {
  return mutate<void>(treeId, (data) => {
    data.members = data.members.filter((m) => m.id !== memberId);
    return { yaz: true, sonuc: undefined };
  });
}

/** Bekleyen (kullanılmamış) bir daveti özet-hash ile iptal et. */
export async function revokeInvite(treeId: string, tokenHash: string): Promise<void> {
  return mutate<void>(treeId, (data) => {
    data.invites = data.invites.filter((iv) => iv.tokenHash !== tokenHash);
    return { yaz: true, sonuc: undefined };
  });
}

/* ── Herkese açık salt-okunur paylaşım (üyeliksiz görüntüleme) ──────────────── */
/*
 * Çoklu, kalıcı paylaşım bağlantıları (#7): sahip birden çok bağlantı üretebilir;
 * her biri kullanıcı silene kadar sabittir. Her bağlantı ziyaret sayısı ve son
 * ziyaretleri (anonim: ülke/şehir/cihaz/zaman) tutar. İsteğe bağlı süre (#8):
 * `expiresAt` geçmişteyse bağlantı ölür. Eski tekil `share` okurken `shares`'e
 * taşınır (geri uyumluluk).
 */

const MAX_VISITS = 50;

/**
 * Bir ağaçta tutulan en fazla paylaşım bağlantısı. Herkese açık demo gibi ortak
 * hesaplarda ziyaretçiler sürekli bağlantı üretebilir; sınırsız birikim hem
 * kaydı hem de her istekte üretilen QR'lar yüzünden yanıtı yavaşlatır (bağlantı
 * oluştur düğmesi "yanıt vermiyor" görünür). En yeni bağlantılar korunur.
 */
const MAX_SHARES = 50;

/** Erişim kaydındaki paylaşımları döndürür; eski tekil `share`'i diziye taşır. */

function daysToExpiry(days?: number | null): string | null {
  if (!days || days <= 0 || !Number.isFinite(days)) return null; // süresiz
  return new Date(Date.now() + days * 86400000).toISOString();
}

function isExpired(s: ShareLink): boolean {
  return !!s.expiresAt && new Date(s.expiresAt).getTime() <= Date.now();
}

/** Ağacın tüm paylaşım bağlantıları (en yeni önce). */
export async function listShares(treeId: string): Promise<ShareLink[]> {
  return mutate<ShareLink[]>(treeId, (data) => {
    const shares = normalizeShares(data);
    // Eski tekil share'i kalıcı olarak diziye yaz (bir kereye mahsus geçiş).
    if (data.share && !Array.isArray(data.shares)) {
      data.shares = shares;
      data.share = undefined;
      return { yaz: true, sonuc: shares };
    }
    return { yaz: false, sonuc: shares };
  });
}

/** Yeni bir paylaşım bağlantısı oluşturur. */
export async function createShare(
  treeId: string,
  treeName: string,
  opts: {
    hideLiving: boolean; label?: string; expiresDays?: number | null; personId?: string;
    /** Açılacak görünümler; verilmezse kısıt yok (`lib/share-scope.ts`). */
    scope?: ShareScope[];
  }
): Promise<{ share: ShareLink; shares: ShareLink[] }> {
  const secret = randomBytes(18).toString("base64url");
  const share: ShareLink = {
    id: randomBytes(6).toString("base64url"),
    token: `${treeId}.${secret}`,
    treeName,
    hideLiving: opts.hideLiving,
    createdAt: new Date().toISOString(),
    label: opts.label?.trim() || undefined,
    expiresAt: daysToExpiry(opts.expiresDays),
    personId: opts.personId || undefined,
    scope: opts.scope,
    views: 0,
    visits: [],
  };
  return mutate<{ share: ShareLink; shares: ShareLink[] }>(treeId, (data) => {
    const shares = normalizeShares(data);
    shares.unshift(share);
    if (shares.length > MAX_SHARES) shares.length = MAX_SHARES;
    data.shares = shares;
    data.share = undefined;
    // Güncel listeyi DE döndür: çağıran, yazdıktan hemen sonra tekrar OKUMASIN.
    // Blob `list()` eventually-consistent'tır; yeni yazılan kayıt hemen
    // görünmeyebilir ve yanıt boş dönerdi ("bağlantı oluşmuyor" hatası, #3).
    return { yaz: true, sonuc: { share, shares } };
  });
}

/** Bir paylaşımın seçeneklerini günceller (jeton değişmez). */
export async function updateShare(
  treeId: string,
  id: string,
  opts: {
    hideLiving?: boolean; label?: string; expiresDays?: number | null; personId?: string | null;
    /** `null` → kısıtı KALDIR (hepsini aç). `undefined` → bu alana dokunma. */
    scope?: ShareScope[] | null;
  }
): Promise<ShareLink[] | null> {
  return mutate<ShareLink[] | null>(treeId, (data) => {
  const shares = normalizeShares(data);
  const s = shares.find((x) => x.id === id);
  if (!s) return { yaz: false, sonuc: null };
  if (opts.hideLiving !== undefined) s.hideLiving = opts.hideLiving;
  if (opts.label !== undefined) s.label = opts.label.trim() || undefined;
  if (opts.expiresDays !== undefined) s.expiresAt = daysToExpiry(opts.expiresDays);
  // `null` → daraltmayı kaldır (ağacın tümüne dön); "" de aynı anlama gelir.
  if (opts.personId !== undefined) s.personId = opts.personId || undefined;
  /*
   * `null` ile `undefined` AYRI şeyler — `personId` ile aynı tuzak. `null`
   * "kısıtı kaldır" demek; araya bir `?? undefined` koymak o kararı "bu
   * alana dokunma"ya çevirir ve daraltılmış bir bağlantı bir daha ASLA
   * tümüne açılamazdı.
   */
  if (opts.scope !== undefined) s.scope = opts.scope ?? undefined;
  data.shares = shares;
  data.share = undefined;
  return { yaz: true, sonuc: shares };
  });
}

/** Bir paylaşım bağlantısını siler (kalıcı). Güncel listeyi döndürür. */
export async function deleteShare(treeId: string, id: string): Promise<ShareLink[]> {
  return mutate<ShareLink[]>(treeId, (data) => {
    const shares = normalizeShares(data).filter((s) => s.id !== id);
    data.shares = shares;
    data.share = undefined;
    return { yaz: true, sonuc: shares };
  });
}

/** Bir ağacın tüm paylaşım bağlantılarını temizler (ör. demo sıfırlaması). */
export async function resetShares(treeId: string): Promise<void> {
  return mutate<void>(treeId, (data) => {
    if ((data.shares?.length ?? 0) === 0 && !data.share) return { yaz: false, sonuc: undefined };
    data.shares = [];
    data.share = undefined;
    return { yaz: true, sonuc: undefined };
  });
}

/** Genel görüntüleme için: jeton geçerli, etkin ve süresi dolmamış mı? */
export async function findValidShare(
  token: string
): Promise<{ treeId: string; share: ShareLink } | null> {
  const parsed = parseInviteToken(token);
  if (!parsed) return null;

  // Erişim kaydını OKU ve jetonu bul. Okuma hatası VEYA henüz görünmeyen taze
  // kayıt (blob eventual-consistency) yüzünden jeton bulunamazsa, bağlantıyı
  // hemen "geçersiz" saymak yanlış olur (#2/#6). Bu yüzden bulunana kadar kısa
  // aralıklarla birkaç kez dener. Jeton gerçekten yoksa 3 denemede null döner.
  for (let attempt = 0; attempt < 3; attempt++) {
    let data: TreeAccess | null = null;
    try {
      data = await getTreeAccess(parsed.treeId);
    } catch {
      data = null;
    }
    // Silinmiş ağacın bağlantısı ölüdür — tekrar denemenin de anlamı yok.
    if (data && isSoftDeleted(data)) return null;
    if (data) {
      const share = normalizeShares(data).find((s) => s.token === token);
      if (share) return isExpired(share) ? null : { treeId: parsed.treeId, share };
    }
    if (attempt < 2) await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
  }
  return null;
}

/** Bir ziyareti kaydeder (best-effort; anonim). */
export async function recordShareVisit(
  treeId: string,
  id: string,
  visit: { country?: string; city?: string; device?: string }
): Promise<void> {
  try {
    /*
     * Okuma başarısız olursa buradan yazmaya DEVAM ETMEMEK gerekiyordu:
     * geçici bir okuma hatasında üyeleri ve davetleri boş bir kayıtla ezmek
     * olurdu — hem de oturumsuz, anonim bir sayfa görüntülemesinin
     * tetiklediği yazımda. Sayaç kaybetmek, erişim kaydı kaybetmekten iyidir.
     * `getTreeAccess` artık bu durumda fırlatıyor ve dıştaki `catch` yutuyor:
     * ziyaret sayılmaz, kayıt korunur.
     */
    /*
     * Çakışma koruması BURADA özellikle değerli: sayaç okunup bir artırılıp
     * geri yazılıyor ve bu, kayıp güncellemenin ders kitabı örneği. Aynı
     * bağlantı bir gruba gönderildiğinde birkaç kişinin aynı anda açması
     * beklenen durum; korumasızken sayaç birden fazla ziyareti tek ziyaret
     * sayıyordu — ve aynı yazma erişim kaydının TAMAMINI geri yazdığı için
     * arada eklenen bir üye ya da davet de siliniyordu.
     */
    await mutate<void>(treeId, (data) => {
    const shares = normalizeShares(data);
    const s = shares.find((x) => x.id === id);
    if (!s) return { yaz: false, sonuc: undefined };
    s.views = (s.views ?? 0) + 1;
    const entry = { at: new Date().toISOString(), ...visit };
    s.visits = [entry, ...(s.visits ?? [])].slice(0, MAX_VISITS);
    data.shares = shares;
    data.share = undefined;
    /*
     * AYNA YOK. Değişen tek şey ziyaret sayacı; üyeler ve davetler bu yazımda
     * hiç değişmiyor. Aynayı çağırmak, her anonim `/g/` ve `/embed/`
     * görüntülemesinde Postgres'teki bütün üye ve davet satırlarını silip
     * yeniden yazmak demekti — ziyaretçi sayısıyla ölçeklenen, işi olmayan
     * bir yazma yükü.
     */
    return { yaz: true, sonuc: undefined };
    }, { mirror: false });
  } catch {
    /* istatistik yazımı görüntülemeyi engellemez */
  }
}

/* ── Hesaplar arası eşleştirme (P1–P4) ─────────────────────────────────────── */

/** Ağacın onaylı bağlı ağaçları. */
export async function listPairings(treeId: string): Promise<Pairing[]> {
  const data = await getTreeAccess(treeId);
  const pairings = data.pairings ?? [];
  if (pairings.length === 0) return [];
  /*
   * KARŞI ağaç silinmişse eşleşme de listelenmez. `/p/<treeId>`,
   * `/pair/compare/<treeId>`, aşılama ve birleştirme yetkiyi bu listeden
   * alıyor; filtre burada olmasaydı, komşu hesabın sildiği ağaç bizim
   * ekranımızda okunmaya devam ederdi.
   *
   * Maliyet: eşleşme başına bir erişim dosyası okuması. Eşleşme sayısı
   * elle kurulan bir şey (tipik olarak 0–3), o yüzden kabul edilebilir.
   */
  const durum = await Promise.all(
    pairings.map(async (p) => {
      try {
        return await isTreeDeleted(p.peerTreeId);
      } catch {
        return false; // okunamadıysa eşleşmeyi gizleme; hata gizlilik kararı değil
      }
    })
  );
  return pairings.filter((_, i) => !durum[i]);
}

/**
 * İki ağaç onaylı bağlı mı? (her iki blob'da da kayıt olması beklenir).
 *
 * Aşılama (`/api/tree/graft`) ve tam birleştirme (`/api/tree/merge-tree`)
 * yetkiyi buradan alıyor, `listPairings`ten değil — o yüzden silinmiş ağaç
 * denetimi burada da ayrıca yapılıyor. Yoksa komşu hesabın sildiği ağacın
 * kişileri, silme sonrasında bizim ağacımıza kopyalanabilirdi.
 *
 * Denetim İKİ TARAF için: bizim ağacımız silinmişse de bağ yoktur (silinmiş
 * bir ağaca veri yazmak, onu yaşatmak olur).
 */
export async function arePaired(treeId: string, peerTreeId: string): Promise<boolean> {
  const data = await getTreeAccess(treeId);
  if (isSoftDeleted(data)) return false;
  if (!(data.pairings ?? []).some((p) => p.peerTreeId === peerTreeId)) return false;
  try {
    return !(await isTreeDeleted(peerTreeId));
  } catch {
    return false; // okunamayan komşu, bağlı sayılmaz (yazma yolunda kapı kapalı düşer)
  }
}

/**
 * Eşleştirme daveti oluştur. Ham jeton `<treeId>.<secret>` döner (bağlantıda);
 * blob'da secret'ın özeti + davet edenin adı saklanır. Varsayılan 14 gün.
 */
export async function createPairInvite(
  treeId: string,
  inviterName: string,
  ttlDays = 14
): Promise<string> {
  const secret = randomBytes(24).toString("hex");
  const token = `${treeId}.${secret}`;
  const now = Date.now();
  const invite: PairInvite = {
    tokenHash: sha256(secret),
    inviterName,
    createdBy: treeId,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttlDays * 86400_000).toISOString(),
  };
  return mutate<string>(treeId, (data) => {
    data.pairInvites = [...(data.pairInvites ?? []), invite];
    return { yaz: true, sonuc: token };
  });
}

/**
 * Eşleştirme davetini kabul et: her iki ağaca da karşılıklı `Pairing` yazar ve
 * daveti tüketir. Kabul eden taraf `peerTreeId` (kendi ağacı) ve `peerName`'ini
 * verir. Kendi kendine ya da zaten bağlıysa hata döndürür.
 */
export async function acceptPairInvite(
  token: string,
  accepterTreeId: string,
  accepterName: string
): Promise<{ inviterTreeId: string; inviterName: string } | { error: string }> {
  const parsed = parseInviteToken(token);
  if (!parsed) return { error: "Geçersiz davet." };
  const inviterTreeId = parsed.treeId;
  if (inviterTreeId === accepterTreeId) return { error: "Bir ağacı kendisiyle eşleştiremezsiniz." };

  const hash = sha256(parsed.secret);

  /*
   * İKİ AĞAÇ, İKİ AYRI BLOB — dolayısıyla İKİ ayrı korumalı yazma.
   *
   * Çakışma koruması ağaç başına çalışıyor; iki blob'u tek bir işlemde
   * yazmanın yolu bu mimaride yok (ve eskiden de yoktu — bu değişiklik o
   * eksiği getirmiyor, var olanı koruyor). Yarıda kalırsa ortaya tek yönlü
   * bir eşleşme çıkıyor ve `arePaired` iki tarafı da sorduğu için o hâl
   * "eşleşme yok" gibi davranıyor: davet tüketilmiş ama eşleşme kurulmamış.
   * Gürültüsüz ama güvenli yön — ters hâl (tek taraflı erişim) daha kötü
   * olurdu.
   */
  const ilk = await mutate<{ inviterName: string } | { error: string }>(
    inviterTreeId,
    (inviterData) => {
      const invite = (inviterData.pairInvites ?? []).find((iv) => iv.tokenHash === hash);
      if (!invite)
        return { yaz: false, sonuc: { error: "Davet bulunamadı ya da kullanılmış." } };
      if (new Date(invite.expiresAt).getTime() < Date.now())
        return { yaz: false, sonuc: { error: "Davetin süresi dolmuş." } };

      // Daveti tüket + karşılıklı eşleştirme yaz.
      inviterData.pairInvites = (inviterData.pairInvites ?? []).filter(
        (iv) => iv.tokenHash !== hash
      );
      if (!(inviterData.pairings ?? []).some((p) => p.peerTreeId === accepterTreeId)) {
        inviterData.pairings = [
          ...(inviterData.pairings ?? []),
          { peerTreeId: accepterTreeId, peerName: accepterName, createdAt: new Date().toISOString() },
        ];
      }
      return { yaz: true, sonuc: { inviterName: invite.inviterName } };
    }
  );
  if ("error" in ilk) return ilk;
  const { inviterName } = ilk;

  await mutate<void>(accepterTreeId, (accepterData) => {
    if ((accepterData.pairings ?? []).some((p) => p.peerTreeId === inviterTreeId))
      return { yaz: false, sonuc: undefined };
    accepterData.pairings = [
      ...(accepterData.pairings ?? []),
      { peerTreeId: inviterTreeId, peerName: inviterName, createdAt: new Date().toISOString() },
    ];
    return { yaz: true, sonuc: undefined };
  });

  return { inviterTreeId, inviterName };
}

/** Eşleştirmeyi kaldır — her iki taraftan da siler. */
export async function removePairing(treeId: string, peerTreeId: string): Promise<void> {
  const vardi = await mutate<boolean>(treeId, (a) => {
    const vardiMi = (a.pairings ?? []).some((p) => p.peerTreeId === peerTreeId);
    a.pairings = (a.pairings ?? []).filter((p) => p.peerTreeId !== peerTreeId);
    return { yaz: true, sonuc: vardiMi };
  });

  /*
   * KARŞI TARAFA yalnız gerçekten eşleşme VARSA dokunuluyor.
   *
   * Eskiden `peerTreeId` gövdeden geldiği gibi kullanılıyordu ve hiç
   * eşleşme olmasa bile karşı ağacın erişim kaydı yeniden yazılıyordu. O
   * kayıt üyeleri, davetleri, paylaşımları ve eşleşmeleri tutuyor;
   * `getTreeAccess` katı olmayan kipte okuma hatasında BOŞ döndüğü için,
   * bir okuma aksaklığı karşı tarafın tüm üye listesini silebilirdi —
   * üstelik `saveTreeAccess` bunu Postgres'e de aynalıyor.
   *
   * Katı okuma da şart: boş bir kayıt üstüne yazmak yerine hata versin.
   */
  if (!vardi) return;
  await mutate<void>(peerTreeId, (b) => {
    b.pairings = (b.pairings ?? []).filter((p) => p.peerTreeId !== treeId);
    return { yaz: true, sonuc: undefined };
  });
}
