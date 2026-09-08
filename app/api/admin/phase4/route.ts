import { NextResponse } from "next/server";
import { operatorVerdict } from "@/lib/operator-access";
import { auth } from "@/auth";
import { isSupabaseConfigured } from "@/lib/supabase";
import { readFamilyFromBlob } from "@/lib/blob";
import { listTrees } from "@/lib/trees";
import { getUsersData } from "@/lib/users";
import { isSoftDeleted } from "@/lib/retention";
import { DEMO_FAMILY_NAME, DEMO_USER_ID } from "@/lib/demo-account";
import { dbCountPeople, dbGetPeopleRows, dbGetTreeRow } from "@/lib/db";
import { treeDrift } from "@/lib/drift";
import {
  authEmailForAccount,
  isBcryptFallbackEnabled,
  isSupabaseLoginEnabled,
  listAuthUsers,
  type AuthUserOzeti,
} from "@/lib/auth-users";
import {
  olculdu,
  olculemedi,
  phase4Readiness,
  type AgacOlgusu,
  type HesapOlgusu,
  type Olcum,
} from "@/lib/phase4-readiness";

export const dynamic = "force-dynamic";

/**
 * FAZ 4 KAPISI — `GET /api/admin/phase4`. SALT OKUMA.
 *
 * Bu uç Faz 4'ü UYGULAMAZ. Faz 4'ün ön koşullarını ÖLÇER ve
 * `lib/phase4-readiness.ts`teki saf kapıya sorar: "hazır mıyız, değilsek
 * neden?".
 *
 * ## Neden yalnız GET
 *
 * `docs/SUPABASE-GECIS.md` Faz 4'ün ön koşullarını düzyazı olarak yazıyordu;
 * yani "hazır mıyız?" sorusunun ölçülebilir bir cevabı yoktu ve geri dönüşü
 * olmayan iş ölçülmeden basılabiliyordu. Eksik olan ÖLÇÜM'dü, bir otomasyon
 * değil. Bu uca bir POST eklemek — "hazırsa uygula" — kapıyı, koruduğu
 * şeyin tetiğine bağlamak olurdu: ölçümdeki tek bir hata doğrudan geri
 * alınamaz bir işe dönüşürdü. Faz 4 elle, insan kararıyla yapılacak; bu uç
 * yalnız o kararın dayanağını üretir.
 *
 * `/api/admin/drift` GET denetler + POST onarır; oradaki onarım Blob'u kaynak
 * alan, tersi alınabilir bir hizalama. Buradaki iş öyle değil, bu yüzden
 * kalıp bilerek yarısıyla kopyalanıyor.
 *
 * ## Kapsam ve gizlilik
 *
 * Ağaçlar da HESAPLAR da GENEL. Ağaç kapsamı önce çağıranın ağaçlarıyla
 * sınırlıydı (drift ucundaki kapsamı kopyalayarak) ve kapı bu yüzden
 * envanterdeki başka ağaçları hiç ölçmeden "hazır" diyebiliyordu — bkz.
 * ağaç bloğundaki gerekçe. Hesaplar zaten genel: "her hesap
 * Auth'a taşındı mı" sorusu doğası gereği tek bir hesaba bakarak
 * cevaplanamaz, ve yalnız çağıranın hesabına bakan bir kapı, başka bir
 * hesabın kilitlenmesini görmeden "hazır" derdi (geri dönüşü olmayan işte en
 * pahalı yanlış cevap).
 *
 * Bunun bedeli ödenmeden alınıyor: başkasının hesabı rapora yalnız KİMLİĞİYLE
 * (UUID) giriyor, aile adı MASKELİ. Kurucunun kendi hesabı ve herkese açık
 * demo hesabı adıyla görünür — biri zaten kendisinin, öbürünün adı
 * (`DEMO_FAMILY_NAME`) koddaki bir sabit.
 */

/** Drift ucundaki kapının AYNISI — yeni bir yetki kavramı icat edilmiyor. */
async function guard() {
  const session = await auth();
  const karar = operatorVerdict(session?.user);
  if (!karar.ok)
    return { error: NextResponse.json({ error: karar.error }, { status: karar.status }) };
  if (!isSupabaseConfigured())
    return { error: NextResponse.json({ error: "Supabase yapılandırılmamış." }, { status: 503 }) };
  return {
    accountId: karar.accountId,
    homeName: session?.user?.treeName ?? session?.user?.name ?? "Ağaç",
  };
}

const neden = (e: unknown) => (e as Error)?.message || "bilinmeyen hata";

/* ── Ağaç olguları ────────────────────────────────────────────────────────── */

/**
 * Tek ağacın ölçümü. HER ölçüm kendi `try/catch`inde.
 *
 * Sebep: bir ölçümün düşmesi öbürlerini de "bilinmiyor" yapmamalı ve hiçbiri
 * bütün ucu 500'lememeli. Düşen ölçüm `olculemedi` olarak işaretleniyor;
 * kapı da (şüphede daima "hazır değil" kuralı) onu hazır saymıyor. Yani
 * kısmi ölçüm kısmi cevap verir, sahte bir yeşil değil.
 */
/*
 * KARŞILAŞTIRMA ADI İLE RAPOR ADI AYRI — ve bu ayrım bir hatanın bedeliyle
 * öğrenildi.
 *
 * `treeDrift` Blob'daki ağaç adını Postgres'teki adla karşılaştırıyor
 * (`lib/drift.ts`). Kapsam genişletilirken (#335) başkasının ağacına maskeli
 * bir YER TUTUCU ad veriliyordu (`ağaç <id>`) ve o yer tutucu doğrudan
 * karşılaştırmaya giriyordu. Sonuç: Postgres'teki gerçek adla hiçbir zaman
 * eşleşmiyor, yani ÇAĞIRANIN KENDİSİNE AİT OLMAYAN HER AĞAÇ sahte bir
 * "kayma var" engeli üretiyordu. Üretimde iki ağaç bu yüzden kirli göründü.
 *
 * Maskeleme bir RAPORLAMA kuralı; ölçümün girdisi olamaz. `ad` gerçek adı
 * taşıyor ve yalnız karşılaştırmada kullanılıyor, `etiket` ise rapora çıkan.
 */
async function agacOlcusu(
  t: { treeId: string; name: string },
  etiket?: string
): Promise<AgacOlgusu> {
  /*
   * SALT BLOB. `getFamilyData` KULLANILAMAZ: Faz 2d'den beri önce Postgres'e
   * bakıyor, yani "ayna kaynağı yakalamış mı" sorusunu Postgres'i
   * Postgres'le karşılaştırarak cevaplardı ve her ağaç için "eksik yok"
   * derdi. Aynı tuzağın drift ucundaki anlatımı: `lib/blob.ts:120`.
   */
  let blob: Awaited<ReturnType<typeof readFamilyFromBlob>> = null;
  let blobPeople: Olcum<number>;
  try {
    blob = await readFamilyFromBlob(t.treeId);
    blobPeople = blob
      ? olculdu(blob.people.length)
      : /*
         * Dosya YOK. Bu "sıfır kişi" DEĞİL, "kaynak okunamadı": ikisini
         * karıştırmak, boş bir aynayı kaynağa eşit görüp "ayna tam" demek
         * olurdu.
         */
        olculemedi<number>("Blob'da veri dosyası bulunamadı");
  } catch (e) {
    blobPeople = olculemedi<number>(neden(e));
  }

  let row: Awaited<ReturnType<typeof dbGetTreeRow>> = null;
  let inDb: Olcum<boolean>;
  let stamp: Olcum<string | null>;
  try {
    row = await dbGetTreeRow(t.treeId);
    inDb = olculdu(!!row);
    stamp = olculdu(row?.updated_at ?? null);
  } catch (e) {
    inDb = olculemedi<boolean>(neden(e));
    stamp = olculemedi<string | null>(neden(e));
  }

  /*
   * Sayım, satırları çekmekten AYRI: ucuz bir `count` sorgusu (kafa isteği).
   * Satır çekimi büyük ağaçta düşebilir; o düştüğünde bile "ayna kaç kişi
   * tutuyor" sorusu cevapsız kalmasın istiyoruz — eksik ayna, kayma
   * denetiminden bağımsız ve ondan daha ağır bir bulgu.
   */
  let dbPeople: Olcum<number>;
  try {
    dbPeople = olculdu(await dbCountPeople(t.treeId));
  } catch (e) {
    dbPeople = olculemedi<number>(neden(e));
  }

  let driftClean: Olcum<boolean>;
  try {
    if (!blob) {
      driftClean = olculemedi<boolean>("Blob kaynağı okunamadı — karşılaştırma yapılamaz");
    } else if (!inDb.olculdu) {
      driftClean = olculemedi<boolean>("ağaç satırı okunamadı — karşılaştırma yapılamaz");
    } else {
      const rows = row ? await dbGetPeopleRows(t.treeId) : [];
      const d = treeDrift(
        {
          treeId: t.treeId,
          name: t.name,
          inDb: !!row,
          blobPeople: blob.people,
          dbPeople: rows.map((r) => r.data).filter(Boolean),
          rows,
          dbName: row?.name,
        },
        /*
         * `max: 0` — ayrıntı listesi İSTEMİYORUZ. Kapının sorusu "temiz mi",
         * "neresi kirli" değil; ikincisinin adresi `/api/admin/drift`.
         * Ayrıntıyı burada da üretmek, aynı raporu iki yerde tutmak ve
         * kişi verisini ikinci bir uçtan sızdırma riskini kopyalamak olurdu.
         */
        { max: 0 }
      );
      driftClean = olculdu(d.clean);
    }
  } catch (e) {
    driftClean = olculemedi<boolean>(neden(e));
  }

  return { treeId: t.treeId, name: etiket ?? t.name, blobPeople, dbPeople, inDb, driftClean, stamp };
}

/* ── Hesap olguları ───────────────────────────────────────────────────────── */

/**
 * Hesabın Auth karşılığını bulur.
 *
 * Üç anahtar deneniyor, çünkü eşleşme zaman içinde üç farklı yoldan kurulmuş
 * olabilir: (1) kimlik — `importAccountToAuth` accountId bir UUID ise auth
 * id'sini ona eşitliyor; (2) sentetik iç e-posta — UUID olmayan hesaplarda
 * (demo) tek bağ bu; (3) hesabın bağladığı GERÇEK e-posta (Faz 3e), çünkü
 * bağlama sentetik adresin ÜZERİNE yazıyor. Yalnız kimliğe bakan bir eşleme,
 * e-postasını bağlamış bir hesabı "Auth'ta yok" diye raporlar ve kullanıcıyı
 * gereksiz bir göçe gönderirdi.
 */
function authEslesmesi(
  hesap: { id: string; authEmail?: string },
  idler: Map<string, AuthUserOzeti>,
  epostalar: Map<string, AuthUserOzeti>
): AuthUserOzeti | undefined {
  return (
    idler.get(hesap.id.toLowerCase()) ??
    epostalar.get(authEmailForAccount(hesap.id)) ??
    (hesap.authEmail ? epostalar.get(hesap.authEmail.trim().toLowerCase()) : undefined)
  );
}

export async function GET() {
  const g = await guard();
  if ("error" in g) return g.error;

  /* --- Ağaçlar ----------------------------------------------------------- */
  /*
   * KAPSAM GENEL — ve bu bir düzeltme.
   *
   * Bu blok önce `listTrees(g.accountId)` ile YALNIZ ÇAĞIRANIN ağaçlarına
   * bakıyordu, drift ucundaki kapsamı kopyalayarak. Üretimde ölçünce hata
   * ortaya çıktı: kapı "hazır" dedi ve raporunda tek ağaç vardı, oysa
   * envanterde üç hesap ve üç ağaç daha duruyordu. Yani kapı, korumakla
   * görevli olduğu yerde kördü.
   *
   * Drift ucunda dar kapsam DOĞRU: orası bir onarım aracı ve kimse
   * başkasının ağacını onarmamalı. Burası ölçüm aracı ve sorusu "Faz 4
   * HERKES için güvenli mi" — tek bir ağacı ölçmeden verilen "evet", geri
   * dönüşü olmayan işte en pahalı yanlış cevap.
   *
   * Bir hesabın ağaç kaydı OKUNAMAZSA bütün olgu `olculemedi` olur; o
   * hesabın ağaçları sessizce listeden düşmez. Düşseydi kör nokta biçim
   * değiştirip geri gelirdi: "listede yok" ile "sorunu yok" aynı şey
   * sanılırdı.
   *
   * Demo bu döngüye girmiyor, çünkü kimlik deposunda satırı yok. Girseydi
   * de anlamı olmazdı: demo verisi her girişte yeniden üretiliyor,
   * kaybedilecek bir şey taşımıyor.
   */
  let trees: Olcum<AgacOlgusu[]>;
  try {
    const { users } = await getUsersData();
    const out: AgacOlgusu[] = [];
    for (const u of users.filter((x) => !isSoftDeleted(x))) {
      if (u.id === g.accountId) {
        // Kendi ağaçları: gerçek adlarıyla.
        for (const t of await listTrees(g.accountId, g.homeName)) out.push(await agacOlcusu(t));
      } else {
        /*
         * Başkasının ağacı: ad rapora GİRMİYOR, yalnız kimliği — hesap
         * etiketlerindeki maskeleme kuralının aynısı.
         */
        for (const t of await listTrees(u.id, u.familyName)) {
          out.push(await agacOlcusu(t, `ağaç ${t.treeId}`));
        }
      }
    }
    trees = olculdu(out);
  } catch (e) {
    trees = olculemedi<AgacOlgusu[]>(neden(e));
  }

  /* --- Auth envanteri ---------------------------------------------------- */
  /*
   * Tek seferde çekiliyor ve hesap başına ayrı sorgu yapılmıyor: hesap
   * sayısı kadar `getUserById` hem gereksiz, hem de `last_sign_in_at`i
   * getirmiyor. Düşerse bütün hesap olguları `olculemedi` olur — sessizce
   * "Auth'ta yok" olmaz.
   */
  let authListesi: AuthUserOzeti[] | null = null;
  let authHatasi = "";
  try {
    authListesi = await listAuthUsers();
  } catch (e) {
    authHatasi = neden(e);
  }
  const authIdler = new Map<string, AuthUserOzeti>();
  const authEpostalar = new Map<string, AuthUserOzeti>();
  for (const u of authListesi ?? []) {
    authIdler.set(u.id.toLowerCase(), u);
    if (u.email) authEpostalar.set(u.email.toLowerCase(), u);
  }

  /* --- Hesaplar ---------------------------------------------------------- */
  let accounts: Olcum<HesapOlgusu[]>;
  try {
    const { users } = await getUsersData();
    const out: HesapOlgusu[] = users
      /*
       * Yumuşak silinmiş hesap Auth'a taşınmak ZORUNDA değil: zaten
       * kalıcı silme kuyruğunda. Kapsama alınsaydı kapı, bilerek terk
       * edilmiş bir hesap yüzünden sonsuza dek kırmızı kalırdı.
       */
      .filter((u) => !isSoftDeleted(u))
      .map((u) => {
        /*
         * Demonun BURADA GÖRÜNMESİ başlı başına bulgu.
         *
         * Demo bir hesap değil, bir vitrin (`lib/demo-account.ts`) ve kimlik
         * deposuna hiç yazılmıyor. Yani sağlıklı bir kurulumda bu döngü demo
         * satırına HİÇ rastlamaz. Rastlıyorsa, o satır koddan önce yazılmış
         * bir kalıntıdır ve kapı bunu `demo-acikta` engeliyle bildirir —
         * ölçüm bu yüzden kaldırılmadı: yokluğu kanıtlamanın tek yolu, varsa
         * göstermek.
         */
        const demo = u.id === DEMO_USER_ID;
        const eslesme = authListesi ? authEslesmesi(u, authIdler, authEpostalar) : undefined;
        return {
          accountId: u.id,
          // Başkasının aile adı rapora GİRMİYOR — bkz. dosya başlığı.
          label:
            u.id === g.accountId
              ? u.familyName
              : demo
                ? DEMO_FAMILY_NAME
                : `hesap ${u.id}`,
          isDemo: demo,
          hasPasswordHash: !!u.passwordHash,
          authUser: authListesi ? olculdu(!!eslesme) : olculemedi<boolean>(authHatasi),
          lastSignInAt: authListesi
            ? olculdu(eslesme?.lastSignInAt ?? null)
            : olculemedi<string | null>(authHatasi),
        } satisfies HesapOlgusu;
      });
    accounts = olculdu(out);
  } catch (e) {
    accounts = olculemedi<HesapOlgusu[]>(neden(e));
  }

  const olgular = {
    trees,
    accounts,
    supabaseLoginEnabled: isSupabaseLoginEnabled(),
    bcryptFallbackEnabled: isBcryptFallbackEnabled(),
  };
  const karar = phase4Readiness(olgular);

  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    ...karar,
    olgular,
    note: karar.hazir
      ? "Ölçülen olguların hepsi temiz — Faz 4'ün ön koşulları sağlanıyor. Uygulama elle yapılır; bu uç hiçbir şey değiştirmez."
      : "Faz 4 HAZIR DEĞİL. Engellerin her biri kendi gerekçesini taşıyor; 'ölçülemedi' kodu 'sorun yok' demek değildir.",
  });
}
