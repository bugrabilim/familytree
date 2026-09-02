"use client";

import type { Person } from "@/types/family";
import Avatar from "./ui/Avatar";
import { formatLong, lifeSpan, calcAge } from "@/lib/date";
import { fullName } from "@/lib/name";
import { googleMapsUrl } from "@/lib/places";
import { useT } from "@/lib/i18n";

/** Künye satırı — değeri boşsa hiç çizilmez. */
function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className="flex gap-3 py-1.5 border-b border-border/60 last:border-0">
      <span className="text-[11px] uppercase tracking-wide text-text-subtle w-28 shrink-0 pt-0.5">
        {label}
      </span>
      <span className="text-sm text-text flex-1 min-w-0">{value}</span>
    </div>
  );
}

/** Yakınlar tek satırda, adlarıyla. Bağlantı YOK: sayfa bir yaprak. */
function People({ label, list }: { label: string; list: Person[] }) {
  if (list.length === 0) return null;
  return <Row label={label} value={list.map((p) => fullName(p)).join(" · ")} />;
}

/**
 * Tek kişilik, girişsiz anma sayfası — mezar taşına basılan QR'ın açtığı yer.
 *
 * Neden ağacın tamamı değil: taş herkesin görebileceği bir yerdedir. Tarayan
 * kişi çoğu zaman aileden biri değildir; ona tüm soy ağacını açmak paylaşımın
 * ölçüsünü kaçırır. Bu yüzden jeton `personId` taşıdığında `/g/<jeton>` ağacı
 * değil BURAYI açar ve gezinilecek başka bir yer sunmaz.
 *
 * Gelen `person` ve `relatives` SUNUCUDA maskelenmiş kopyalardır; bu bileşen
 * kendi başına gizlilik kararı vermez, yalnız eline geçeni çizer.
 */
export default function MemorialPage({
  person,
  parents,
  spouses,
  kids,
  treeName,
}: {
  person: Person;
  parents: Person[];
  spouses: Person[];
  /** `children` DEĞİL: o ad React'in ayrılmış prop'u. */
  kids: Person[];
  treeName: string;
}) {
  const t = useT();
  const span = lifeSpan(person.birthDate, person.deathDate);
  const age = calcAge(person.birthDate, person.deathDate);
  /*
   * Baba adı — mezar taşının geleneksel ikinci satırı.
   *
   * `primaryName` baba adını YALNIZ soyadsız (1934 öncesi) kayıtlarda başlığa
   * koyar; soyadı olan bir kayıtta `patronymic` dolu olsa bile hiçbir yerde
   * görünmez. Burada onu geri getiriyoruz — ama başlıkta zaten varsa tekrar
   * etmemek için soyadı olan kayıtlarla sınırlı.
   */
  const second = person.lastName?.trim() ? person.patronymic?.trim() : "";
  const memories = (person.memories ?? []).filter((m) => m.text?.trim());

  return (
    <main className="min-h-screen bg-surface-2">
      <div className="max-w-xl mx-auto px-4 py-10 sm:py-16">
        <div className="rounded-3xl border border-border bg-surface p-6 sm:p-8">
          {/* Portre */}
          <div className="flex flex-col items-center text-center">
            {/* `Avatar` fotoğrafı, yükleme hatasını ve fotoğraf yoksa üretilen
               portreyi kendisi hallediyor — burada tekrar etmeye gerek yok. */}
            <Avatar person={person} size="xl" className="w-32 h-32 border border-border" />
            <h1 className="font-serif text-2xl sm:text-3xl font-semibold text-text mt-4">
              {fullName(person)}
            </h1>
            {second && <p className="text-sm text-text-muted mt-0.5">{second}</p>}
            {span && <p className="text-sm text-text-muted mt-2 tabular-nums">{span}</p>}
          </div>

          {/* Künye */}
          <div className="mt-6">
            <Row label={t("memorialPage.born")} value={formatLong(person.birthDate)} />
            <Row label={t("memorialPage.died")} value={formatLong(person.deathDate)} />
            {age !== null && person.deathDate && (
              <Row label={t("memorialPage.age")} value={t("memorialPage.ageValue", { age })} />
            )}
            <Row label={t("memorialPage.birthPlace")} value={person.birthPlace} />
            <Row label={t("memorialPage.occupation")} value={person.occupation} />
            <People label={t("memorialPage.parents")} list={parents} />
            <People label={t("memorialPage.spouses")} list={spouses} />
            <People label={t("memorialPage.children")} list={kids} />
            <Row
              label={t("memorialPage.burialPlace")}
              value={
                person.burialPlace ? (
                  <a
                    href={googleMapsUrl(
                      person.burialCoords
                        ? `${person.burialCoords.lat},${person.burialCoords.lng}`
                        : person.burialPlace
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    {person.burialPlace}
                  </a>
                ) : null
              }
            />
          </div>

          {/* Hikâye */}
          {person.bio?.trim() && (
            <section className="mt-6 pt-5 border-t border-border">
              <p className="text-sm text-text leading-relaxed whitespace-pre-wrap">{person.bio}</p>
            </section>
          )}

          {/* Anılar */}
          {memories.length > 0 && (
            <section className="mt-6 pt-5 border-t border-border">
              <h2 className="font-serif text-base font-semibold text-text mb-3">
                {t("memorialPage.memories")}
              </h2>
              <ul className="space-y-4">
                {memories.map((m) => (
                  <li key={m.id}>
                    {m.prompt && (
                      <p className="text-[11px] uppercase tracking-wide text-text-subtle mb-1">
                        {m.prompt}
                      </p>
                    )}
                    <p className="text-sm text-text leading-relaxed whitespace-pre-wrap">{m.text}</p>
                    {m.date && (
                      <p className="text-[11px] text-text-subtle mt-1">{formatLong(m.date)}</p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <p className="text-center text-[11px] text-text-subtle mt-6">
          {t("memorialPage.footer", { tree: treeName })}
        </p>
      </div>
    </main>
  );
}
