import { readFileSync } from "node:fs";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
/** Yorumları ayıkla: kuralı ANLATAN metin, kuralın kanıtı değildir. */
const kodu = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * KAPI: ağaç görünümünde denetimler TUVALİN ÜSTÜNDE DURMAZ (denetim H2).
 *
 * Bulgunun kalan yarısı şuydu: dinlenme hâlinde hiçbir kart engellenmiyor,
 * ama kullanıcı ağacı yukarı sürüklerse kartlar kuşak panelinin altına
 * giriyor ve tıklanamaz oluyor. #307 denetimleri `fitView`in bıraktığı kenar
 * boşluğunun içine çekerek engellenen kart sayısını sıfırladı — o ölçüm
 * doğruydu ama yalnız ilk kare için: boşluk bir armağan, garanti değil.
 *
 * Üst üste binen iki katman olduğu sürece, kartı denetimin altına götüren BİR
 * kaydırma her zaman vardır. Bu yüzden çözüm konum ayarı değil, yerleşim:
 * denetimler kendi satırına/sütununa çıktı, tuvalin dikdörtgeni yalnız tuvale
 * ait. Burası o yerleşimin geri katmanlaşmasını yakalıyor.
 *
 * Piksel ölçmüyor (ölçemez de); ÜST ÜSTE BİNMEYİ mümkün kılan mekanizmayı —
 * mutlak/sabit konumlu, tıklama yutan denetimi — yasaklıyor.
 */

const ft = kodu(read("../components/FamilyTree.tsx"));
const ws = kodu(read("../app/tree/Workspace.tsx"));

/* ══ 1. Tuval kutusunda tıklama yutan mutlak katman yok ══════════════════ */
{
  /*
   * `absolute`/`fixed` başlı başına suç değil: kipin açık olduğunu gösteren
   * kenar şeridi de mutlak konumlu. Ayıran şey TIKLAMAYI YUTMASI — bir kart
   * ancak üstündeki katman olayı alıyorsa erişilemez hâle gelir. Bu yüzden
   * iddia "mutlak yok" değil, "mutlak olan her şey `pointer-events-none`".
   */
  const kusurlu: string[] = [];
  for (const m of ft.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
    const cls = m[1] ?? m[2] ?? "";
    if (!/\b(absolute|fixed)\b/.test(cls)) continue;
    if (!/pointer-events-none/.test(cls)) kusurlu.push(cls.trim().slice(0, 70));
  }
  check(kusurlu.length === 0, `tuvalde tıklama yutan mutlak katman yok (bulunan: ${kusurlu.join(" | ")})`);
}

/* ══ 2. React Flow'un konumlandıran sarmalayıcıları kullanılmıyor ════════ */
{
  /*
   * `<Controls>` ve `<MiniMap>` içeride `<Panel>` çiziyor; `Panel`in CSS'i
   * `position:absolute` (bkz. @xyflow base.css). Yani bu iki bileşen
   * `<ReactFlow>` içindeyken TANIM GEREĞİ tuvalin üstünde durur — className
   * ile köşeye çekmek katmanı kaldırmaz, sadece küçültür.
   *
   * `Controls` tümüyle bırakıldı (zaten dört düğmesi de kapatılmıştı, içine
   * kendi `ControlButton`larımız konuyordu). `MiniMap` kaldı ama iki şey
   * değişti: `<ReactFlow>` ağacının DIŞINDA ve `position: static`.
   */
  check(!/<Controls\b/.test(ft), "konumlandıran <Controls> sarmalayıcısı kullanılmıyor");

  const mini = ft.indexOf("<MiniMap");
  const kapanis = ft.indexOf("</ReactFlow>");
  check(mini > 0 && kapanis > 0, "mini harita ve tuval bulundu");
  check(mini > kapanis, "mini harita <ReactFlow> ağacının dışında");
  check(/position: "static"/.test(ft.slice(mini, mini + 600)), "mini harita akışta konumlanıyor");
  /* Kendi sütunu var: `shrink-0` olmasaydı sütun tuvale ezdirilirdi. */
  check(/<aside[\s\S]{0,200}?shrink-0/.test(ft), "mini harita kendi sütununda");
}

/* ══ 3. Denetim satırı tuvalin kardeşi, üstü değil ═══════════════════════ */
{
  /*
   * Yerleşim: dikey `flex` sütun → üstte denetim satırı (`shrink-0`), altta
   * `flex-1 min-h-0` tuval. `min-h-0` olmazsa flex çocuğu içeriğine göre
   * taşar ve tuval satırı ekranın dışına iter.
   */
  check(/role="toolbar"/.test(ft), "denetim satırı var");
  const sat = ft.indexOf('role="toolbar"');
  const satirBlok = ft.slice(sat - 200, sat + 400);
  check(!/\b(absolute|fixed)\b/.test(satirBlok), "denetim satırı mutlak konumlu değil");
  check(/shrink-0/.test(satirBlok), "satır sıkışıp kaybolmuyor");
  check(/flex-1 min-h-0/.test(ft), "tuval kalan alanı alıyor");
  /* Sarmıyor, kayıyor — üst çubuktaki sekme şeridiyle (H3) aynı idiom. */
  check(/overflow-x-auto/.test(satirBlok) && !/flex-wrap/.test(satirBlok), "satır sarmıyor, kayıyor");
}

/* ══ 4. Workspace ağaç sekmesine tuval üstü denetim EKLEMİYOR ════════════ */
{
  /*
   * Asıl bulgu buradaydı: kuşak paneli ve "Bağ kur" düğmesi Workspace'te
   * `absolute … z-10` ile FamilyTree'nin YANINA konuyordu. Denetimin nereye
   * gideceğini artık FamilyTree biliyor (`toolbar` propu); Workspace yalnız
   * içeriği veriyor. İddia dalın TAMAMINI tarıyor: tek bir `absolute` bile
   * eski hatanın geri gelmesi demek.
   */
  const bas = ws.indexOf('view === "agac"');
  const son = ws.indexOf('view === "soy"');
  check(bas > 0 && son > bas, "ağaç dalı bulundu");
  const dal = ws.slice(bas, son);
  check(!/\b(absolute|fixed)\b/.test(dal), "ağaç dalında tuval üstü katman yok");
  check(!/\bz-\d/.test(dal), "ağaç dalında yığın sırası zorlaması yok");
  check(/toolbar=\{/.test(dal), "denetimler toolbar propuyla veriliyor");
  /* Ve gerçekten O propun içindeler — dalda başka yerde durmuyorlar. */
  const tb = dal.indexOf("toolbar={");
  check(tb > 0 && dal.indexOf("<TreeDepthControl") > tb, "kuşak paneli denetim satırına gidiyor");
  check(tb > 0 && dal.indexOf("reparent.mode") > tb, "bağ kurma düğmesi denetim satırına gidiyor");
}

/* ══ 5. Kuşak paneli artık yüzen bir kart değil ══════════════════════════ */
{
  /*
   * Panelin kendi kabuğu (mutlak konum + blur + gölge) kalkmalı: satırın
   * içinde duran bir denetimin "tuvalin üstünde yüzüyormuş" gibi görünmesi,
   * düzeltilen şeyin ta kendisini yeniden anlatırdı. Kaydırma da satıra
   * devredildi; iç içe iki yatay kaydırma alanı kullanıcıyı şaşırtırdı.
   */
  const i = ws.indexOf("function TreeDepthControl");
  check(i > 0, "kuşak paneli bileşeni bulundu");
  const kok = ws.slice(ws.indexOf("<div", ws.indexOf("return (", i)), ws.indexOf(">", ws.indexOf("<div", ws.indexOf("return (", i))));
  check(!/\b(absolute|fixed)\b/.test(kok), "panelin kökü mutlak konumlu değil");
  check(!/backdrop-blur|shadow-card/.test(kok), "panel yüzen kart görünümünde değil");
  check(!/overflow-x-auto/.test(kok), "kaydırma satıra devredildi");
}

/* ══ 6. Gömülü ağaç da aynı kuralda ══════════════════════════════════════ */
{
  /*
   * Aynı tuval, ikinci çağıran. Künye `absolute bottom-2 right-2 z-10` ile
   * tuvalin üstünde duruyor ve tıklamayı yutuyordu: o köşeye denk gelen kişi
   * kartı açılamıyordu. Gömme kutusu genelde 400-600px, orada kaybedilen bir
   * köşe oransal olarak daha pahalı.
   *
   * İddia FamilyTree'nin `toolbar` propuna değil, KURALA bakıyor: gömülü
   * görünümde tuval üstü katman yok. Yarın künyenin yerine başka bir şey
   * konursa da geçerli kalması gereken şey bu.
   */
  const emb = kodu(read("../components/EmbedTree.tsx"));
  check(!/\b(absolute|fixed)\b/.test(emb), "gömülü ağaçta tuval üstü katman yok");
  check(/toolbar=\{/.test(emb), "künye denetim satırında");
}

/* ══ 7. KAYDIRMA KABININ İÇİNDE `sticky` ÇOCUK YOK ═══════════════════════ */
/*
 * B1 — bu hata TAM OLARAK BİR KEZ yapıldı, düzeltildi ve geri geldi; bu
 * yüzden artık kural olarak yazılı.
 *
 * Yakınlaştırma kümesi "hep görünsün" diye kaydırılan denetim satırının
 * İÇİNE `sticky right-0` + opak zeminle konmuştu. Niyet doğru, mekanizma
 * yanlış: `sticky` bir çocuk kabın kaydırma genişliğinden yer AYIRMAZ. Kap
 * kendi içeriğini kümenin altına da dizer, küme opak zeminiyle onların
 * üstünde durur ve altta kalan her düğme tıklanamaz olur. Ölçüldü: 320px'te
 * kuşak düğmeleri 0-3, 390px'te 1-5, 768px'te "Bağ kur" — `elementFromPoint`
 * hepsinde kümeyi döndürüyordu. Toplam 11 denetim (320px) hiçbir kaydırma
 * konumunda erişilemiyordu, çünkü küme kaydırmayla birlikte hareket ediyor.
 *
 * Doğru yapı sabit elemanı kaydırma kabının KARDEŞİ yapmaktır: o zaman yer
 * kaplayan normal bir flex çocuğu olur, kaydırılan alan `flex-1 min-w-0` ile
 * KALAN genişliği alır ve "altı" diye bir yer kalmaz. Bir konum ayarıyla
 * (daha dar küme, daha az dolgu) kapatılamayacak bir açık bu; iddia da bu
 * yüzden piksel değil YAPI ölçüyor.
 *
 * Tarama girintiye dayanıyor: dosyalar tek biçimde biçimlendirilmiş, yani
 * bir öğenin alt ağacı, açılış etiketinden daha derin girintili satırlardır.
 * Kusursuz bir ayrıştırıcı değil ama yakalaması gereken şeyi — kaydırılan
 * kabın içine konmuş sabit bir kutuyu — kaçırmıyor (mutasyonla sınandı).
 */
{
  const girinti = (s: string) => s.length - s.trimStart().length;
  const KAYDIRAN = /overflow-(?:x-|y-)?(?:auto|scroll)/;

  const ihlaller = (src: string, dosya: string): string[] => {
    const satir = src.split("\n");
    const out: string[] = [];
    for (let i = 0; i < satir.length; i++) {
      if (!KAYDIRAN.test(satir[i])) continue;
      /* Kabın açılış etiketi: `className` çok satırlı olabiliyor. */
      let bas = i;
      while (bas > 0 && !/^\s*<[A-Za-z]/.test(satir[bas])) bas--;
      /* Açılış etiketinin bittiği satır — öznitelikler alt ağaç değildir. */
      let tagSonu = Math.max(bas, i);
      while (tagSonu < satir.length && !/>\s*$/.test(satir[tagSonu])) tagSonu++;
      const kok = girinti(satir[bas]);
      for (let j = tagSonu + 1; j < satir.length; j++) {
        if (!satir[j].trim()) continue;
        if (girinti(satir[j]) <= kok) break; /* alt ağaç bitti */
        if (/\bsticky\b/.test(satir[j]))
          out.push(`${dosya}:${j + 1} ${satir[j].trim().slice(0, 56)}`);
      }
    }
    return out;
  };

  const hepsi = [
    ...ihlaller(ft, "FamilyTree.tsx"),
    ...ihlaller(ws, "Workspace.tsx"),
    ...ihlaller(kodu(read("../components/EmbedTree.tsx")), "EmbedTree.tsx"),
  ];
  check(hepsi.length === 0, `kaydırılan kabın içinde sabit (sticky) çocuk yok (${hepsi.join(" | ")})`);

  /* Ve kümenin gerçekten kardeş olduğu YERİNDE duruyor: kaydırılan yarı
     `flex-1 min-w-0`, sabit yarı `shrink-0`. İkisi de olmazsa küme ya
     ezilir ya da kaydırma alanını iter. */
  const sat = ft.indexOf('role="toolbar"');
  const blok = ft.slice(sat, sat + 900);
  check(/flex-1 min-w-0/.test(blok), "kaydırılan yarı kalan genişliği alıyor");
  check(/overflow-x-auto/.test(blok) && /shrink-0/.test(blok.slice(blok.indexOf("overflow-x-auto"))),
    "sabit yarı kaydırma alanının dışında ve sıkışmıyor");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
