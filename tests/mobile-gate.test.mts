import { readFileSync } from "node:fs";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
/** Yorumları ayıkla: kuralı ANLATAN metin, kuralın kanıtı değildir. */
const kodu = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * KAPI: mobil gizlilik ve çoklu ağaç (denetim B7/F6).
 *
 * ## Neden bu dosya kökte
 *
 * `apps/mobile` kök `tsconfig` ve eslint dışında (`"apps"` hariç tutulmuş) ve
 * kendi araç zincirinde derleniyor. Yani mobil kodun otomatik denetimi YOK —
 * gizlilik katmanının orada hiç bulunmadığının fark edilmemesinin sebebi de
 * bu. Bu iddialar kaynak düzeyinde, kökteki koşucudan bakıyor.
 */

const family = kodu(read("../apps/mobile/src/lib/family.tsx"));
const api = kodu(read("../apps/mobile/src/lib/api.ts"));
const edit = kodu(read("../apps/mobile/app/(app)/person/edit/[id].tsx"));
const menu = kodu(read("../apps/mobile/app/(app)/menu.tsx"));

/* ══ 1. GİZLİLİK: varsayılan MASKELİ ═════════════════════════════════════ */
/*
 * Maskelemenin bağlamda, tek yerde olması bilinçli ve web'dekinden FARKLI:
 * web'de her çizim yeri `view()` çağırmayı hatırlamak zorunda ve unutulan
 * yer sessizce ham veri gösteriyor. Mobilde bu katman zaten hiç yoktu; aynı
 * tuzağı yeniden kurmamak için varsayılan ters çevrildi. Yeni bir ekran
 * yazan kişi hiçbir şey hatırlamasa da doğru olanı görüyor.
 */
check(/viewAll\(people, hideLiving\)/.test(family), "bağlam kişileri gizlilik katmanından geçiriyor");
check(/const byId = useMemo\(\(\) => new Map\(gorunur\.map/.test(family),
  "kimlik haritası da MASKELİ listeden kuruluyor");
check(/people: gorunur,/.test(family), "dışarı verilen liste maskeli olan");
/*
 * HAM kayıt YALNIZ düzenleme formuna. Maskeli kopyayı forma verip kaydetmek,
 * gizlenen alanları KALICI olarak silerdi: form bütün alanları gövdeye
 * koyuyor ve maskeli kopyada o alanlar yok.
 */
check(/rawById: Map<string, Person>;/.test(family), "ham harita ayrı bir kapı olarak duruyor");
check(/const \{ rawById \} = useFamily\(\);/.test(edit), "düzenleme formu HAM kaydı istiyor");
check(!/const \{ byId \} = useFamily\(\);/.test(edit), "düzenleme formu maskeli kaydı KULLANMIYOR");
/* Ekranlar bağlamdan geleni çiziyor; kendi maskeleme kopyalarını yazmıyorlar. */
for (const ekran of ["home", "tree", "map", "book"]) {
  const src = kodu(read(`../apps/mobile/app/(app)/${ekran}.tsx`));
  check(!/rawById/.test(src), `${ekran}: ham haritaya erişmiyor`);
}
{
  const detay = kodu(read("../apps/mobile/app/(app)/person/[id].tsx"));
  check(!/rawById/.test(detay), "kişi detayı ham haritaya erişmiyor");
}

/* ══ 2. Tercih kalıcı, `confidential` tercihten BAĞIMSIZ ════════════════ */
check(/HIDE_LIVING_KEY/.test(family), "tercih cihazda saklanıyor");
check(/setHideLiving/.test(menu), "tercih arayüzden değiştirilebiliyor");
{
  const gizlilik = kodu(read("../apps/mobile/src/lib/privacy.ts"));
  /*
   * `confidential` KOŞULSUZ maskeli: "bu kaydı kimse görmesin" demek ve bir
   * görüntü tercihine bağlanamaz. Birim testi bunu ayrıca sınıyor
   * (`tests/mobile-privacy.test.mts`); buradaki iddia kuralın YAZILI hâlini
   * koruyor.
   */
  check(/return !!p\.confidential \|\| \(hideLiving && isLiving\(p\)\)/.test(gizlilik),
    "gizli kayıt tercihten bağımsız maskeli");
  /* Beyaz liste: ileride eklenecek hassas alan varsayılan olarak gizli kalır. */
  check(/const masked: Person = \{/.test(gizlilik), "maskeleme beyaz liste");
  check(!/delete masked\[/.test(gizlilik), "kara liste (sil-sil) DEĞİL");
}

/* ══ 3. ÇOKLU AĞAÇ: `x-tree-id` gönderiliyor ═══════════════════════════ */
/*
 * Sunucu aktif ağacı bu başlıktan okuyor ve mobil onu HİÇ göndermiyordu:
 * birden çok ağacı olan bir kurucu telefonda yalnız ana ağacını
 * görebiliyordu — öbürlerini kurmuş, veri girmiş, hiçbirine ulaşamıyordu.
 */
check(/let aktifAgac: string \| null = null;/.test(api), "modülde aktif ağaç tutuluyor");
check(/const agac = opts\.treeId \?\? aktifAgac;/.test(api), "istek başlığı aktif ağacı taşıyor");
check(/if \(agac\) headers\["x-tree-id"\] = agac;/.test(api), "başlık yalnız değer varken konuyor");
check(/setActiveTreeId\(treeId\);/.test(family), "ağaç değişince modül değeri yazılıyor");
{
  /*
   * SIRA: modül değeri ÖNCE, durum sonra. `load` hemen ardından koşacak ve
   * isteğin başlığı YENİ ağacı taşımalı; ters sırada ilk istek eski ağaca
   * giderdi.
   */
  const i = family.indexOf("const switchTree = useCallback");
  const govde = family.slice(i, family.indexOf("}, []);", i));
  check(govde.indexOf("setActiveTreeId(treeId)") < govde.indexOf("setActiveTreeIdState(treeId)"),
    "modül değeri durumdan ÖNCE yazılıyor");
}
/*
 * Ağaç verisi, saklı tercih OKUNMADAN çekilmiyor: okumadan çekseydik
 * uygulama her açılışta önce ana ağacı gösterip sonra doğru ağaca atlardı ve
 * arada yapılan bir düzenleme yanlış ağaca gidebilirdi.
 */
check(/if \(!agacHazir\) return;/.test(family), "veri, saklı ağaç okunmadan çekilmiyor");
check(/trees\.length > 1 &&/.test(menu), "seçici yalnız birden çok ağaçta çiziliyor");

/* ══ 4. "Ağacı paylaş" GERÇEK bir bağlantı üretiyor ════════════════════ */
/*
 * Düğme "Ağacı paylaş" diyordu ama paylaştığı şey uygulamanın kök adresiydi:
 * bağlantıyı alan kişi bir giriş ekranı görüyordu, ağacı değil.
 */
check(/apiFetch<\{ shares\?: Array<\{ url\?: string \}> \}>\("\/api\/tree\/share"/.test(menu),
  "paylaşım ucu çağrılıyor");
check(/method: "POST"/.test(menu), "yeni bağlantı OLUŞTURULUYOR");
/*
 * YENİSİ BAŞTA: `createShare` listeye `unshift` ediyor. Sondan almak, aylar
 * önce oluşturulmuş başka bir bağlantıyı paylaşmak olurdu — ilk yazdığımda
 * sondan alıyordum ve kaynağa bakınca yanlış olduğu çıktı.
 */
check(/r\.shares\?\.\[0\]\?\.url/.test(menu), "yeni bağlantı listenin BAŞINDAN alınıyor");
check(/unshift\(share\)/.test(kodu(read("../lib/members.ts"))), "sunucu gerçekten başa ekliyor");
/* Etiket zorunlu (sunucu da istiyor) ve kullanıcının tercihini izliyor. */
check(/label: `Telefondan paylaşım/.test(menu), "bağlantı etiketleniyor");
check(/hideLiving \}/.test(menu), "paylaşım kullanıcının gizlilik tercihini izliyor");
/* Uç `canManage` istiyor; düğmeyi üyeye göstermek onu 403'e davet etmek olurdu. */
check(/canEdit\(role\) && \(/.test(menu), "düğme yalnız yöneticide görünüyor");
check(!/API_BASE_URL/.test(menu), "kök adres artık paylaşılmıyor");

/* ══ 5. ÇEVRİMDIŞI KUYRUK: sessiz üzerine yazma YOK ════════════════════ */
/*
 * Kuyruğun kararları `tests/outbox.test.mts`te birim testi ediliyor. Buradaki
 * iddialar BAĞLANTIYI koruyor: saf mantık doğru olsa bile yanlış bağlanırsa
 * (tüm gövde kuyruğa girerse, bayat damga gönderilirse, her hata kuyruğa
 * alınırsa) tasarım çöker.
 */
{
  const outbox = kodu(read("../apps/mobile/src/lib/outbox.ts"));
  const depo = kodu(read("../apps/mobile/src/lib/outbox-store.tsx"));
  const form = kodu(read("../apps/mobile/src/components/PersonForm.tsx"));
  const layout = kodu(read("../apps/mobile/app/(app)/_layout.tsx"));

  /*
   * ÜÇ YÖNLÜ BİRLEŞTİRME. Sunucunun kilidi ağacın TAMAMININ damgasına
   * dayanıyor; saatler sonra gönderilen her yazma 409 alırdı ve kullanıcı
   * ilgisiz çakışmaları tıklamayı öğrenirdi — yani koruma ortadan kalkardı.
   */
  check(/if \(ayniDeger\(sunucu, taban\)\)/.test(outbox), "dokunulmamış alan temiz uygulanıyor");
  check(/if \(ayniDeger\(sunucu, benim\)\) continue;/.test(outbox),
    "başkası aynı düzeltmeyi yaptıysa çakışma sayılmıyor");
  check(/cakisan\.push\(\{ alan, taban, benim, sunucu \}\)/.test(outbox),
    "gerçek çakışma üç değeriyle kullanıcıya taşınıyor");

  /* Damga DÜŞÜRÜLMÜYOR: sunucu başlık yokken çakışma denetimini hiç yapmıyor. */
  check(/const veri = await refresh\(\);/.test(depo), "gönderim turu TAZE veriyle başlıyor");
  check(/await gonderTek\(it, karar\.gonderilecek, damga\);/.test(depo),
    "yazma taze damgayla gönderiliyor (iyimser kilit devrede)");

  /*
   * YALNIZ AĞ HATASI kuyruğa giriyor. 403/400/409 sunucunun VERDİĞİ karardır;
   * onları kuyruğa almak reddedilmiş bir yazmayı sonsuza kadar denemek olurdu.
   */
  check(/e instanceof ApiError && e\.status === 0/.test(form), "yalnız bağlantı hatası yakalanıyor");
  check(/const \{ alanlar, taban \} = alanFarki\(/.test(form),
    "kuyruğa TÜM gövde değil değişen alanlar giriyor");

  /* Gönderim taze ağaç verisi ve damga istiyor; ikisi de aile bağlamından. */
  check(layout.indexOf("<FamilyProvider>") < layout.indexOf("<OutboxProvider>"),
    "kuyruk sağlayıcısı aile bağlamının İÇİNDE");
}


console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
