import type { Obituary } from "@/types/obituary";
import { formatLong } from "@/lib/date";

/**
 * Herkese açık paylaşım sayfasının üstündeki taziye şeridi.
 *
 * Sunucu bileşeni: buraya gelen liste `readPublicObituaries` ile SÜZÜLMÜŞTÜR,
 * yani yalnız ailenin paylaşmayı seçtikleri. Süzme burada YAPILMAZ — bu
 * bileşen bir bayrağa bakıp karar verseydi, süzmeyi çağıranın unutması
 * mümkün olurdu.
 *
 * Metin ailenindir; burada eklenen tek şey "Taziye" başlığıdır.
 */
export default function PublicObituaries({
  obituaries,
  heading,
  labels,
}: {
  obituaries: Obituary[];
  heading: string;
  labels: { serviceOn: string; serviceAt: string; burialAt: string; condolenceAt: string };
}) {
  if (obituaries.length === 0) return null;
  const row = (label: string, value?: string) =>
    value ? (
      <p className="text-[11px] text-neutral-600 dark:text-neutral-400">
        <span className="uppercase tracking-wide opacity-70">{label}:</span> {value}
      </p>
    ) : null;

  return (
    <section className="border-b border-border bg-surface-2/60 px-4 py-3">
      <div className="max-w-3xl mx-auto grid gap-3">
        <h2 className="font-serif text-sm font-semibold text-text">{heading}</h2>
        {obituaries.map((o) => (
          <article key={o.id} className="grid gap-0.5">
            <p className="text-sm text-text">
              {o.personName}
              {o.diedOn ? <span className="text-text-subtle"> · {formatLong(o.diedOn)}</span> : null}
            </p>
            {row(labels.serviceOn, o.serviceOn ? formatLong(o.serviceOn) : undefined)}
            {row(labels.serviceAt, o.serviceAt)}
            {row(labels.burialAt, o.burialAt)}
            {row(labels.condolenceAt, o.condolenceAt)}
            {o.message && (
              <p className="text-[13px] text-text-muted whitespace-pre-wrap mt-1">{o.message}</p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
