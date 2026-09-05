"use client";

import { useMemo, useState } from "react";
import { historicHint, searchPlaces } from "@/lib/place-search";
import { useT } from "@/lib/i18n";

/**
 * YER ADI GİRDİSİ — modern ve tarihî adlarda öneri (madde 38).
 *
 * ## Yazılanı DEĞİŞTİRMİYOR
 *
 * Dedenin nüfus kâğıdında "Elaziz" yazıyorsa kayıtta da öyle kalabilmeli.
 * Ailenin belgesinde duran adı bugünkü adla değiştirmek, kaydı "temizlemek"
 * adına tarihî bilgiyi silmek olurdu. Bu yüzden alan serbest metin olarak
 * kalıyor: öneriye tıklamak isteğe bağlı, ve tıklanmasa bile
 * `lib/places.ts` eski adı zaten haritaya oturtuyor.
 *
 * Bileşenin asıl işi bunu GÖRÜNÜR kılmak: kullanıcı "Elaziz"in tanındığını
 * bilmiyorsa yazmaktan vazgeçer ve bilgiyi kendisi kaybeder.
 *
 * ## Öneri listesi türetilmiş, effect DEĞİL
 *
 * Liste yalnız yazılan metnin bir işlevi; `useEffect` + `setState` ile
 * kurmak hem gereksiz bir tur hem de deponun lint kuralının haklı olarak
 * işaret ettiği desen olurdu (`react-hooks/set-state-in-effect`).
 */

interface Props {
  id: string;
  value: string;
  onChange: (v: string) => void;
  className: string;
  placeholder?: string;
}

export default function PlaceInput({ id, value, onChange, className, placeholder }: Props) {
  const t = useT();
  const [acik, setAcik] = useState(false);

  const oneriler = useMemo(() => (acik ? searchPlaces(value, 6) : []), [acik, value]);
  const ipucu = useMemo(() => historicHint(value), [value]);

  return (
    <div className="relative">
      <input
        id={id}
        className={className}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => {
          onChange(e.target.value);
          setAcik(true);
        }}
        onFocus={() => setAcik(true)}
        /*
         * `onBlur` gecikmeli değil; öneriye `onMouseDown` ile basılıyor ve o
         * olay `blur`dan ÖNCE tetikleniyor. Gecikmeli kapatma (setTimeout)
         * yaygın ama kırılgan bir çözüm: yavaş bir cihazda tıklama kaçar.
         */
        onBlur={() => setAcik(false)}
      />

      {/*
        İPUCU: yazılan ad tam olarak bilinen bir eski adsa, bugünkü karşılığı
        söyleniyor. "Değiştir" demiyoruz — yalnız haritada nereye oturacağını.
      */}
      {ipucu && (
        <p className="text-[11px] text-text-subtle mt-1 leading-relaxed">
          {t("place.historicHint", { old: ipucu.typed, modern: ipucu.modern })}
        </p>
      )}

      {oneriler.length > 0 && (
        <ul className="absolute z-20 left-0 right-0 mt-1 rounded-xl border border-border bg-surface shadow-card overflow-hidden">
          {oneriler.map((o) => (
            <li key={o.name}>
              <button
                type="button"
                // `blur`dan önce çalışsın diye `onMouseDown`.
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(o.name);
                  setAcik(false);
                }}
                className="w-full text-left px-3 py-2 hover:bg-surface-2 transition-colors"
              >
                <span className="block text-sm text-text">{o.name}</span>
                {o.matchedAs && (
                  <span className="block text-[11px] text-text-subtle">
                    {t("place.matchedAs", { old: o.matchedAs })}
                  </span>
                )}
                {!o.matchedAs && o.historic && o.historic.length > 0 && (
                  <span className="block text-[11px] text-text-subtle">
                    {t("place.alsoKnown", { names: o.historic.slice(0, 3).join(", ") })}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
