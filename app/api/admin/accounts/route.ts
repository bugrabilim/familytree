import { NextRequest, NextResponse } from "next/server";
import { purgeAccount, softDeleteAccount } from "@/lib/account-lifecycle";
import { getUsersData } from "@/lib/users";
import { allTreeIds } from "@/lib/trees";
import { confirmMatches, GRACE_DAYS, graceInfo, isSoftDeleted } from "@/lib/retention";
import { DEMO_USER_ID } from "@/lib/demo-id";

export const dynamic = "force-dynamic";

/**
 * OPERATÖR UCU — hesapları listeler ve siler. `/api/admin/accounts`
 *
 *   GET  → hesap listesi (yalnız okur).
 *   POST → `{ accountId, mode: "soft" | "purge", confirm? }`
 *
 * ## Neden oturumla değil, sırla korunuyor
 *
 * Bu uygulamada HER kurucu kendi ağacının yöneticisidir; yani `canManage`
 * ile korunan bir "hesap sil" ucu, pratikte "her kurucu HERKESİN hesabını
 * silebilir" demek olurdu. Diğer yönetim uçları (`migrate`, `drift`,
 * `phase4`) yalnız çağıranın KENDİ verisine dokunduğu için o kapı orada
 * yeterli; burada değil.
 *
 * Bu yüzden sınır operatörlük: `Authorization: Bearer <CRON_SECRET>`.
 * Çağırabilen tek kişi Vercel ortam değişkenlerine erişebilen kişidir.
 * Depoda bu kalıp yeni değil — `/api/health` ve zamanlanmış işler aynı
 * sınırı kullanıyor.
 *
 * Sır TANIMSIZSA uç kapalı düşer (503). "Sır yoksa serbest" davranışı, bu uç
 * için tek bir yapılandırma hatasının bütün hesapları silinebilir yapması
 * demek olurdu.
 *
 * ## Neden listede maskeleme YOK
 *
 * `GET` aile adını ve kimliği olduğu gibi döndürüyor. Maskelemek burada
 * koruma değil, engel olurdu: silinecek hesabı SEÇEN kişi zaten sırra sahip
 * ve maskelenmiş bir listede yanlış satıra basma ihtimali artar. Gizlilik
 * katmanı (`lib/privacy.ts`) ağaçtaki KİŞİLERİ okuyan yüzeyler için; burada
 * gösterilen kişi verisi değil, hesap kaydının kendisi.
 *
 * ## İki kip
 *
 * `soft` — bugünkü davranış: hesap `GRACE_DAYS` günlük beklemeye alınır,
 * her yüzeyden düşer ama veri durur; `POST /api/account/restore` ya da
 * süre dolmadan tekrar giriş geri alır. Onay metni gerekmez, çünkü yanlış
 * satıra basmanın bedeli bir "geri al" tıklamasıdır.
 *
 * `purge` — KALICI. Ağaçların deposu, hesabın ağaç kaydı, Postgres satırları,
 * Supabase Auth kullanıcısı ve en sonda `users.json` satırı gider. Geri
 * dönüşü yok; elde kalan tek şey o güne ait yedek (`backups/<gün>/`,
 * varsayılan 14 gün) ve onu geri yüklemek elle iş.
 *
 * Bu kip bilerek uzun süre YOKTU ve gerekçesi hâlâ geçerli: operatör eliyle
 * çalışan bir kapıda geri dönüşü olmayan bir düğme, yanlış kimlikle
 * basıldığında telafisi olmayan kayıp demek. Şimdi eklendi çünkü ürün
 * sahibinin elinde şifresini hatırlamadığı hesaplar var — yani şifre teyitli
 * `/api/account/delete` yolu onlara kapalı. Düğmenin geri alınamazlığı
 * kaldırılmadı, KARŞILIĞI istendi: aile adının birebir yazılması.
 *
 * ## Neden ad teyidi (`confirm`)
 *
 * Şifre "sen misin" sorusunun yanıtı; ad "ne yaptığının farkında mısın"
 * sorusununki (`confirmMatches`, `lib/retention.ts`). Burada şifre sorulamaz
 * — sırrı taşıyan operatör hedef hesabın şifresini tanımı gereği bilmiyor —
 * ve o zaman geriye kalan tek koruma İKİNCİ SORUDUR. Sırrı olan biri için
 * `accountId` bir listeden kopyalanan opak bir dizedir; yanlış satırı
 * kopyalamak sessiz ve kolay bir hata. Aile adını EL İLE yazmak, kullanıcıyı
 * "hangi aileyi siliyorum" sorusunu bir kez daha yanıtlamaya zorluyor:
 * kopyalanan kimlik yanlışsa yazılan ad ona uymaz ve silme olmaz.
 *
 * Onay yalnız `purge` kipinde: `soft`ta geri alma yolu açık olduğu için
 * ikinci soru sürtünmeden başka bir şey üretmezdi.
 *
 * ## Silme sırası buraya YAZILMIYOR
 *
 * Kalıcı silme `lib/account-lifecycle.ts`teki `purgeAccount`la yapılıyor.
 * O dosya "önce depolama, kimlik EN SON" sırasını gerekçesiyle çözmüş
 * durumda: ters sırada yarıda kalan bir silme, sahibi olmayan ve kimsenin
 * bulamayacağı yetim veri bırakıyor. Buraya ikinci bir sıra yazmak, o
 * kararın sessizce ayrışacağı ikinci bir kopya demek olurdu.
 *
 * ## Demo
 *
 * Demo kimliği HER İKİ kipte de reddediliyor — `softDeleteAccount` ve
 * `purgeAccount` zaten reddediyor, burada kip dallanmasından ÖNCE bir kez
 * daha denetleniyor: kapının hangi katmanda durduğu okunabilir olmalı ve
 * demo, herkese açık ortak oyun alanı (`lib/demo-account.ts`).
 */
function yetkili(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

/** İki uçta da aynı kapı; ilk satırda çağrılır. Geçerse `null` döner. */
function kapi(req: NextRequest): NextResponse | null {
  if (!process.env.CRON_SECRET)
    return NextResponse.json(
      { error: "CRON_SECRET tanımlı değil; bu uç kapalı." },
      { status: 503 }
    );
  if (!yetkili(req)) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  return null;
}

/**
 * HESAP LİSTESİ — hiçbir şey yazmaz.
 *
 * Ağaç sayısı `allTreeIds` ile okunuyor (silinmiş ağaçlar dahil): burada
 * sorulan soru "kullanıcı ne görüyor" değil, "kalıcı silme neye dokunacak".
 *
 * Bir hesabın ağaç kaydı okunamazsa o SATIR hatalanır, liste değil: tek bir
 * bozuk kayıt yüzünden bütün listeyi 500'e düşürmek, operatörü tam da
 * temizlik yapmak istediği anda kör bırakırdı.
 */
export async function GET(req: NextRequest) {
  const kapali = kapi(req);
  if (kapali) return kapali;

  let users;
  try {
    ({ users } = await getUsersData());
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  const accounts = await Promise.all(
    users.map(async (u) => {
      const temel = {
        accountId: u.id,
        familyName: u.familyName,
        createdAt: u.createdAt,
        deletedAt: u.deletedAt ?? null,
        isDemo: u.id === DEMO_USER_ID,
        ...(isSoftDeleted(u) ? graceInfo(u.deletedAt!) : {}),
      };
      try {
        const treeIds = await allTreeIds(u.id);
        return { ...temel, treeCount: treeIds.length, treeIds };
      } catch (e) {
        return { ...temel, treeCount: null, treeIds: [], error: (e as Error).message };
      }
    })
  );

  return NextResponse.json({ accounts, graceDays: GRACE_DAYS });
}

export async function POST(req: NextRequest) {
  const kapali = kapi(req);
  if (kapali) return kapali;

  const body = await req.json().catch(() => ({}));
  const accountId = typeof body.accountId === "string" ? body.accountId.trim() : "";
  const mode = body.mode;

  if (!accountId) return NextResponse.json({ error: "accountId gerekli." }, { status: 400 });

  /*
   * DEMO KİP DALLANMASINDAN ÖNCE. Aşağıdaki iki dalın ikisi de demoyu ayrıca
   * reddediyor; buradaki denetim onların yerine geçmiyor, kapının en dışta da
   * durduğunu okunur kılıyor. Yeni bir kip eklenirse bu satır onu da kapsar.
   */
  if (accountId === DEMO_USER_ID)
    return NextResponse.json({ error: "Demo hesabı silinemez." }, { status: 403 });

  /*
   * KİP AÇIKÇA İSTENİYOR — varsayılan YOK. `purge`a düşen bir varsayılan
   * felaket olurdu; `soft`a düşen bir varsayılan ise yazım hatasını sessizce
   * yutar ve operatör "hemen sildim" sanırken hesap 30 gün ayakta kalırdı.
   */
  if (mode !== "soft" && mode !== "purge")
    return NextResponse.json(
      { error: 'mode "soft" ya da "purge" olmalı.' },
      { status: 400 }
    );

  const { users } = await getUsersData();
  const user = users.find((u) => u.id === accountId);
  if (!user) return NextResponse.json({ error: "Hesap bulunamadı." }, { status: 404 });

  if (mode === "purge") {
    /*
     * AD TEYİDİ — dosya başındaki gerekçe. Depodaki tek karşılaştırma
     * `confirmMatches`; ikinci bir kopya yazmak, bir gün birinin gevşetmesi
     * (ör. küçük harfe indirme) hâlinde iki yüzeyin farklı davranması demek.
     */
    if (!confirmMatches(body.confirm, user.familyName))
      return NextResponse.json(
        {
          error: `Kalıcı silme için aile adını birebir yazın: ${user.familyName}`,
          needsConfirm: true,
        },
        { status: 400 }
      );

    /* Kalıcı silme geri alınamaz; kayıt SİLMEDEN ÖNCE düşsün ki işlem
       yarıda kalsa bile günlükte "denendi" izi kalsın. */
    console.warn(`[operator-silme] ${accountId} (${user.familyName}) KALICI siliniyor`);

    const r = await purgeAccount(user);
    const govde = {
      ok: r.failed.length === 0,
      accountId,
      familyName: user.familyName,
      mode: "purge",
      note: "Kalıcı silme. Geri alınamaz; yalnız o güne ait yedek kaldı.",
    };
    /*
     * 207: hesap silindi AMA bir yol temizlenemedi. Sessizce 200 dönmek,
     * operatöre yanlış bir "her şey gitti" demek olurdu — oysa arkada duran
     * blob ya da Postgres satırı elle temizlenmeli.
     */
    if (r.failed.length > 0)
      return NextResponse.json({ ...govde, failed: r.failed }, { status: 207 });
    return NextResponse.json({ ...govde, failed: [] });
  }

  const r = await softDeleteAccount(accountId);
  if (!r.ok) {
    const mesaj =
      r.reason === "demo"
        ? "Demo hesabı silinemez."
        : r.reason === "already-deleted"
          ? "Bu hesap zaten silinmiş."
          : "Hesap bulunamadı.";
    return NextResponse.json({ error: mesaj, reason: r.reason }, { status: 400 });
  }

  /* Operatör eliyle yapılan silme iz bırakmalı: kim çağırdığı bilinmiyor
     (sır paylaşılabilir), ama NE ZAMAN ve HANGİ hesap kayda geçsin. */
  console.warn(`[operator-silme] ${accountId} yumuşak silindi (purge: ${r.purgeAt})`);

  const govde = {
    ok: true,
    accountId,
    familyName: user.familyName,
    mode: "soft",
    deletedAt: r.deletedAt,
    purgeAt: r.purgeAt,
    daysLeft: r.daysLeft,
    graceDays: GRACE_DAYS,
    note: `Yumuşak silme. Veri ${GRACE_DAYS} gün duruyor; kalıcı silmeyi zamanlanmış iş yapar.`,
  };
  if (r.failed.length > 0)
    return NextResponse.json({ ...govde, failed: r.failed }, { status: 207 });
  return NextResponse.json({ ...govde, failed: [] });
}
