"use client";

import { useEffect, useMemo, useState } from "react";
import type { Person } from "@/types/family";
import type { PersonRef, RecordYear } from "@/lib/report-card";
import { reportCard, reportYears } from "@/lib/report-card";
import { useT } from "@/lib/i18n";

/**
 * AİLE KARNESİ — bir yılın dökümü.
 *
 * İki bölüm bilerek AYRI başlıklar altında: "ailede olanlar" gerçek hayat
 * olayları, "kayda geçenler" o dönem ağaca eklenen bilgi. Gerekçe
 * `lib/report-card.ts` başında — ikisini tek sayıda toplamak kullanıcıya
 * ailesi hakkında yanlış bir cümle söylemek olurdu.
 *
 * Adlar burada `view()`den geçmiyor çünkü karne zaten ad taşımıyor: gizli
 * kayıtlar `lib/report-card.ts` içinde adsız geliyor ve burada "gizli kayıt"
 * olarak çiziliyor.
 */

type Cevap = { year: number; record: RecordYear | null; reason?: string };

/**
 * Gizli kayıt adsız çizilir. Ad zaten `lib/report-card.ts`ten boş geliyor;
 * burası yalnız o boşluğa okunur bir etiket koyuyor.
 */
function Ad({ name, gizli, gizliMetin }: { name: string; gizli: boolean; gizliMetin: string }) {
  if (gizli || !name) return <i className="text-text-subtle">{gizliMetin}</i>;
  return <>{name}</>;
}

function KisiListesi({
  baslik, kisiler, gizliMetin, onSelect,
}: {
  baslik: string;
  kisiler: PersonRef[];
  gizliMetin: string;
  onSelect: (id: string) => void;
}) {
  if (kisiler.length === 0) return null;
  return (
    <section className="space-y-1">
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-text-subtle">{baslik}</h4>
      <ul className="flex flex-wrap gap-1.5">
        {kisiler.map((k) => (
          <li key={k.id}>
            <button
              onClick={() => onSelect(k.id)}
              className="px-2.5 py-1 rounded-full bg-surface-2 border border-border text-[12px] text-text hover:border-primary transition-colors"
            >
              <Ad name={k.name} gizli={k.confidential} gizliMetin={gizliMetin} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Satir({ ad, deger }: { ad: string; deger: number }) {
  if (deger === 0) return null;
  return (
    <li className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-text-muted">{ad}</span>
      {/* Eksilme gizlenmiyor; işaretiyle birlikte yazılıyor. */}
      <b className={`tabular-nums ${deger < 0 ? "text-text-subtle" : "text-text"}`}>
        {deger > 0 ? `+${deger}` : deger}
      </b>
    </li>
  );
}

export default function ReportCardView({
  people,
  onSelect,
}: {
  people: Person[];
  onSelect: (id: string) => void;
}) {
  const t = useT();
  const buYil = new Date().getFullYear();
  const yillar = useMemo(() => {
    // İçinde bulunulan yıl her zaman seçilebilir olmalı — henüz hiçbir şey
    // olmamışsa bile "bu yıl" sorusunun bir yanıtı vardır.
    const bulunanlar = reportYears(people, 12);
    return [...new Set([buYil, ...bulunanlar])].sort((a, b) => b - a).slice(0, 12);
  }, [people, buYil]);

  const [yil, setYil] = useState(buYil);
  const [kayit, setKayit] = useState<Cevap | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        /*
         * Kendi saat farkımızı da yolluyoruz: sunucu UTC'de çalışıyor ve yılın
         * ilk (ya da son) saatlerinde iki taraf farklı yıllarda oluyor.
         */
        const tz = new Date().getTimezoneOffset();
        const res = await fetch(`/api/family/report-card?year=${yil}&tz=${tz}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as Cevap;
        if (alive) setKayit(data);
      } catch {
        /* karnenin bu yarısı isteğe bağlı — sessizce yok sayılır */
      }
    })();
    return () => { alive = false; };
  }, [yil]);

  const karne = useMemo(() => reportCard(people, yil), [people, yil]);
  const record = kayit && kayit.year === yil ? kayit.record : null;
  const gizliMetin = t("report.hidden");
  const { births, deaths, events, anniversaries } = karne.life;

  return (
    <div className="space-y-4">
      {/* Yıl seçici — yalnız gerçekten bir şey olan yıllar + bu yıl. */}
      <div className="flex flex-wrap gap-1.5">
        {yillar.map((y) => (
          <button
            key={y}
            onClick={() => setYil(y)}
            aria-pressed={y === yil}
            className={`h-8 px-3 rounded-xl border text-[12px] tabular-nums transition-colors ${
              y === yil
                ? "bg-primary text-primary-text border-primary"
                : "bg-surface-2 border-border text-text-muted hover:text-text"
            }`}
          >
            {y}
          </button>
        ))}
      </div>

      {karne.empty && !record ? (
        <p className="text-sm text-text-muted leading-relaxed">{t("report.empty", { year: yil })}</p>
      ) : (
        <>
          <KisiListesi baslik={t("report.births")} kisiler={births} gizliMetin={gizliMetin} onSelect={onSelect} />
          <KisiListesi baslik={t("report.deaths")} kisiler={deaths} gizliMetin={gizliMetin} onSelect={onSelect} />

          {events.length > 0 && (
            <section className="space-y-1">
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-text-subtle">
                {t("report.events")}
              </h4>
              <ul className="space-y-1">
                {events.map((e, i) => (
                  <li key={`${e.id}-${i}`} className="text-sm text-text leading-snug">
                    <button onClick={() => onSelect(e.id)} className="hover:underline text-left">
                      <Ad name={e.name} gizli={e.confidential} gizliMetin={gizliMetin} />
                    </button>
                    <span className="text-text-muted"> — {e.title}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {anniversaries.length > 0 && (
            <section className="space-y-1">
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-text-subtle">
                {t("report.anniversaries")}
              </h4>
              <ul className="space-y-1">
                {anniversaries.slice(0, 8).map((a, i) => (
                  <li key={`${a.id}-${a.kind}-${i}`} className="text-sm text-text leading-snug">
                    <button onClick={() => onSelect(a.id)} className="hover:underline text-left">
                      <Ad name={a.name} gizli={a.confidential} gizliMetin={gizliMetin} />
                    </button>
                    <span className="text-text-muted">
                      {" "}
                      — {t(a.kind === "dogum" ? "report.annBirth" : "report.annDeath", {
                        years: a.years,
                        from: a.from,
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/*
            KAYDA GEÇENLER ayrı bir başlık ve ayrı bir cümle. Etiket "bu yıl"
            demiyor, karşılaştırmanın gerçekten başladığı tarihi yazıyor —
            tarihçe yılın başına kadar uzanmayabilir.
          */}
          {record && (
            <section className="space-y-1 pt-1 border-t border-border/60">
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-text-subtle">
                {t("report.recorded")}
              </h4>
              <p className="text-[11px] text-text-subtle">
                {t("report.since", { date: record.since.slice(0, 10) })}
              </p>
              <ul className="space-y-0.5 mt-1">
                <Satir ad={t("report.rec.people")} deger={record.people} />
                <Satir ad={t("report.rec.photos")} deger={record.photos} />
                <Satir ad={t("report.rec.memories")} deger={record.memories} />
                <Satir ad={t("report.rec.sources")} deger={record.sources} />
                <Satir ad={t("report.rec.events")} deger={record.events} />
                <Satir ad={t("report.rec.filledIn")} deger={record.filledIn} />
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
