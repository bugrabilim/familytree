"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * Baskı-önce (print-first) sayfalama motoru (Madde: "flippingbook gibi").
 *
 * Fikir: bir flipbook aslında SABİT sayfalı bir ortamdır — önce içerik gerçek
 * bir kitap gibi sabit boyutlu sayfalara BÖLÜNÜR, sonra çevirme görüntüleyicisi
 * (react-pageflip) bu sayfaların üstüne oturur. Bu modül, içerik "blok"larını
 * ekran-dışı ölçüp sabit yükseklikli sayfa kutularına yerleştirir; sığmayanları
 * ARKA sayfalara akıtır (uzun biyografiler satır satır bölünür), hiçbir şey
 * kırpılmaz.
 *
 * Ölçüm saf DOM ile yapılır (React ağacı ekran dışında bir kez render edilir);
 * çıktı, doğrudan react-pageflip'e beslenebilen sabit sayfa listesidir.
 */

export type Unit =
  // Bölünmez blok (başlık, künye, olay satırı, istatistik ızgarası…). Sığmazsa
  // bütün olarak sonraki sayfaya iner.
  | {
      kind: "block";
      key: string;
      node: ReactNode;
      age: number;
      personId?: string;
      section?: string;
      keepWithNext?: boolean;
      breakBefore?: boolean;
    }
  // Bölünebilir metin (biyografi, önsöz paragrafı). Satır satır bölünür.
  | {
      kind: "text";
      key: string;
      text: string;
      className: string;
      leadClassName?: string;
      age: number;
      personId?: string;
      section?: string;
      breakBefore?: boolean;
    }
  // Kendi tam sayfasını kaplayan blok (harita, şema, matris, kapak).
  | {
      kind: "full";
      key: string;
      node: ReactNode;
      age: number;
      personId?: string;
      section?: string;
    };

export interface RenderedPage {
  key: string;
  age: number;
  personId?: string;
  section?: string;
  isFull?: boolean;
  /** Bu sayfa bir önceki sayfadan taşan kişi kaydını sürdürüyor. */
  continues?: boolean;
  nodes: ReactNode[];
}

export interface Geometry {
  contentW: number;
  contentH: number;
  /** Yeniden ölçümü tetikleyen imza (contentW/H'yi kapsar). */
  sig: string;
}

/** Blok/metin birimini BFC içine alır: iç kenar boşlukları yükseklik ölçümüne
 *  dâhil olur (margin-collapse belirsizliği ortadan kalkar). Ölçüm ve gerçek
 *  render aynı sarmalayıcıyı kullanır → yükseklikler toplanabilir. */
function UnitBox({ children }: { children: ReactNode }) {
  return <div style={{ display: "flow-root" }}>{children}</div>;
}

const WS = /(\s+)/;

/** Verilen yüksekliğe (avail) sığan en uzun ön-eki bulur; kalanı döndürür.
 *  measure(text) → o metnin (aynı className/genişlikte) piksel yüksekliği. */
function splitToFit(
  text: string,
  measure: (s: string) => number,
  avail: number
): { head: string; tail: string } {
  if (measure(text) <= avail) return { head: text, tail: "" };
  const tokens = text.split(WS); // kelime + boşluk jetonları (boşluklar korunur)
  // Kelime indeksleri (boşluk olmayan jetonlar)
  const wordIdx: number[] = [];
  for (let i = 0; i < tokens.length; i++) if (tokens[i] && !/^\s+$/.test(tokens[i])) wordIdx.push(i);
  if (wordIdx.length <= 1) return { head: text, tail: "" }; // tek kelime: bölme

  const upTo = (wi: number) => tokens.slice(0, wordIdx[wi] + 1).join("");
  // En büyük wi (0..wordIdx.length-1) öyle ki upTo(wi) <= avail
  let lo = 0,
    hi = wordIdx.length - 1,
    best = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (measure(upTo(mid)) <= avail) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  const cut = wordIdx[best] + 1;
  const head = tokens.slice(0, cut).join("").replace(/\s+$/, "");
  const tail = tokens.slice(cut).join("").replace(/^\s+/, "");
  if (!head) return { head: text, tail: "" }; // güvenlik: sonsuz döngü olmasın
  return { head, tail };
}

/**
 * Birimleri ölç ve sabit yükseklikli sayfalara paketle. `probe` her zaman
 * (gizli) render edilmelidir; `pages` ölçüm bitene kadar null'dur.
 */
export function usePaginate(units: Unit[], geom: Geometry): { probe: ReactNode; pages: RenderedPage[] | null } {
  const [pages, setPages] = useState<RenderedPage[] | null>(null);
  const blockRootRef = useRef<HTMLDivElement>(null);
  const textWrapRef = useRef<HTMLDivElement>(null);
  const textParaRef = useRef<HTMLParagraphElement>(null);

  useLayoutEffect(() => {
    let cancelled = false;
    // Yeniden ölçüm sırasında sayfaları temizle ("hazırlanıyor" göster).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPages(null);

    const run = () => {
      const root = blockRootRef.current;
      const wrap = textWrapRef.current;
      const para = textParaRef.current;
      if (!root || !wrap || !para) return;

      // 1) Blok/metin-as-block yüksekliklerini oku.
      const heights = new Map<string, number>();
      root.querySelectorAll<HTMLElement>("[data-uk]").forEach((el) => {
        heights.set(el.dataset.uk!, Math.ceil(el.getBoundingClientRect().height));
      });

      // 2) Metin ölçer (imperatif). Sarmalayıcı flow-root olduğundan paragrafın
      // kendi kenar boşluğu (mb) ölçüme dâhil olur → render'la birebir eşleşir.
      const measureText = (s: string, className: string): number => {
        para.className = className;
        para.textContent = s;
        return Math.ceil(wrap.getBoundingClientRect().height);
      };

      const H = geom.contentH;
      const out: RenderedPage[] = [];
      let cur: ReactNode[] = [];
      let used = 0;
      // Sayfa nitelikleri, sayfaya konan İLK birimden alınır (koşan başlık, yaş,
      // kişi). Böylece başlık sayfanın gerçek içeriğini yansıtır.
      let pageAge = 1;
      let pageSection: string | undefined;
      let pagePerson: string | undefined;
      let continues = false;
      let seq = 0;

      const flush = () => {
        if (cur.length === 0) return;
        out.push({ key: `pg${seq++}`, age: pageAge, personId: pagePerson, section: pageSection, continues, nodes: cur });
        cur = [];
        used = 0;
        continues = false;
      };
      const startIfEmpty = (u: Exclude<Unit, { kind: "full" }>) => {
        if (cur.length === 0) {
          pageAge = u.age;
          pageSection = u.section;
          pagePerson = u.personId;
        }
      };

      for (let i = 0; i < units.length; i++) {
        const u = units[i];

        if (u.kind === "full") {
          flush();
          out.push({ key: `pg${seq++}`, age: u.age, personId: u.personId, section: u.section, isFull: true, nodes: [u.node] });
          continue;
        }

        if (u.breakBefore && cur.length) flush();

        if (u.kind === "block") {
          const h = heights.get(u.key) ?? 0;
          // keepWithNext: başlık bir sonraki birimden en az ~64px için yer
          // bırakamıyorsa yeni sayfaya al (başlık sayfanın dibinde yalnız kalmasın).
          const need = u.keepWithNext ? h + 64 : h;
          if (cur.length && need > H - used) {
            const contPerson = u.personId !== undefined && u.personId === pagePerson;
            flush();
            continues = contPerson;
          }
          startIfEmpty(u);
          cur.push(<UnitBox key={u.key}>{u.node}</UnitBox>);
          used += h;
        } else {
          // Bölünebilir metin — mevcut sayfadan başlayarak satır satır akıt.
          let text = u.text;
          let first = true;
          while (text.length) {
            const cls = first && u.leadClassName ? u.leadClassName : u.className;
            // Kalan alan bir satırı bile almıyorsa yeni sayfa aç.
            if (H - used < 24 && cur.length) {
              const contPerson = u.personId !== undefined && u.personId === pagePerson;
              flush();
              continues = contPerson;
            }
            startIfEmpty(u);
            const measure = (s: string) => measureText(s, cls);
            const { head, tail } = splitToFit(text, measure, H - used);
            cur.push(<p key={`${u.key}-${first ? "a" : "b"}${text.length}`} className={cls}>{head}</p>);
            used += measure(head);
            text = tail;
            first = false;
            if (text.length) {
              const contPerson = u.personId !== undefined && u.personId === pagePerson;
              flush();
              continues = contPerson;
            }
          }
        }
      }
      flush();
      if (!cancelled) setPages(out);
    };

    // Yazı tipleri yüklenince ve düzen oturunca ölç (yanlış satır yüksekliği olmasın).
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    const ready = fonts?.ready ?? Promise.resolve();
    ready.then(() => {
      requestAnimationFrame(() => requestAnimationFrame(() => { if (!cancelled) run(); }));
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [units, geom.sig]);

  const probe = (
    <div
      aria-hidden
      className="font-serif"
      style={{ position: "absolute", left: -100000, top: 0, width: geom.contentW, visibility: "hidden", pointerEvents: "none" }}
    >
      <div ref={blockRootRef}>
        {units.map((u) =>
          u.kind === "block" ? (
            <div key={u.key} data-uk={u.key} style={{ display: "flow-root", width: geom.contentW }}>
              {u.node}
            </div>
          ) : null
        )}
      </div>
      {/* Metin ölçüm düğümü: flow-root sarmalayıcı + p (p'nin mb'si dâhil ölçülür). */}
      <div ref={textWrapRef} style={{ display: "flow-root", width: geom.contentW }}>
        <p ref={textParaRef} />
      </div>
    </div>
  );

  return { probe, pages };
}
