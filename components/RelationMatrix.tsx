import { useMemo } from "react";
import type { Person } from "@/types/family";
import { fullName } from "@/lib/name";
import { describeRelation, indexPeople } from "@/lib/relations";
import { computeGenerations } from "@/lib/book-stats";
import { buildMatrixLayout, type MatrixEntry } from "@/lib/relation-matrix";
import { useT } from "@/lib/i18n";

/**
 * Çapraz İlişki Rehberi (Madde 14) — postacı sokak rehberi mantığıyla bir
 * kişiyi satırdan, diğerini sütundan seç; kesişimde ilişki. Altında alfabetik
 * koordinat indeksi. Gizlilik: çağıran taraf maskeli kopya (`view`) geçer.
 * Büyük ağaçlarda tablo taşmasın diye ilk `limit` kişi gösterilir.
 */
export default function RelationMatrix({ people, limit = 24, scroll = true }: { people: Person[]; limit?: number; scroll?: boolean }) {
  const t = useT();

  const { layout, cells, idOrder } = useMemo(() => {
    const idx = indexPeople(people);
    const genOf = computeGenerations(people);
    const entries: MatrixEntry[] = people.map((p) => ({
      id: p.id,
      name: fullName(p),
      gen: genOf.get(p.id) ?? 1,
      birthYear: p.birthDate ? Number(p.birthDate.slice(0, 4)) : undefined,
    }));
    const layout = buildMatrixLayout(entries, limit);
    const idOrder = layout.order.map((e) => e.id);

    // Hücreleri bir kez hesapla: cells[i][j] = j kişisinin i kişisine göre ilişkisi.
    const cells: string[][] = layout.order.map((rowE) =>
      layout.order.map((colE) => {
        if (rowE.id === colE.id) return t("panel.gv.self"); // "Kendisi"
        return describeRelation(rowE.id, colE.id, people, idx) ?? "—";
      })
    );
    return { layout, cells, idOrder };
  }, [people, limit, t]);

  if (layout.order.length < 2) return null;

  const short = (name: string) => (name.length > 16 ? `${name.slice(0, 15)}…` : name);

  return (
    <div className="font-serif text-current">
      {layout.truncated && (
        <p className="text-[11px] opacity-60 mb-2">
          {t("book.matrixTruncated", { n: layout.order.length, total: layout.total })}
        </p>
      )}

      <div className={scroll ? "overflow-x-auto -mx-2 px-2" : "inline-block"}>
        <table className="border-collapse text-[10px] leading-tight" style={{ borderColor: "currentColor" }}>
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-current/[0.06] border border-current/25 px-1.5 py-1 text-left align-bottom min-w-[92px]">
                <span className="opacity-60">#</span>
              </th>
              {layout.order.map((e, j) => (
                <th
                  key={e.id}
                  className="border border-current/25 px-1 py-1 align-bottom whitespace-nowrap"
                  title={`${e.name} (${t("print.generation", { n: e.gen })})`}
                >
                  <span className="tabular-nums opacity-50">{j + 1}</span>
                  <span className="block font-semibold">{short(e.name)}</span>
                  <span className="block opacity-55">{t("print.generation", { n: e.gen })}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {layout.order.map((rowE, i) => (
              <tr key={rowE.id}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-current/[0.06] border border-current/25 px-1.5 py-1 text-left whitespace-nowrap"
                  title={`${rowE.name} (${t("print.generation", { n: rowE.gen })})`}
                >
                  <span className="tabular-nums opacity-50 mr-1">{i + 1}</span>
                  <span className="font-semibold">{short(rowE.name)}</span>
                </th>
                {idOrder.map((colId, j) => (
                  <td
                    key={colId}
                    className={`border border-current/20 px-1 py-1 text-center align-middle ${
                      i === j ? "bg-current/10 font-semibold" : ""
                    }`}
                  >
                    {cells[i][j]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Koordinat indeksi (alfabetik) */}
      <div className="mt-5">
        <h3 className="text-xs font-semibold uppercase tracking-wide opacity-60 mb-2">{t("book.matrixIndexTitle")}</h3>
        <ul className="columns-2 sm:columns-3 gap-4 text-[11px]">
          {layout.index.map((e) => (
            <li key={e.id} className="break-inside-avoid mb-0.5 flex items-baseline justify-between gap-2">
              <span className="opacity-90 truncate">{e.name}</span>
              <span className="opacity-55 tabular-nums shrink-0">
                {t("book.matrixCoord", { row: e.row, col: e.col })}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
