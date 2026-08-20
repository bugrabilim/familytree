/**
 * Tek dosya seçimiyle "her dosyayı içeri al" istemci mantığı (2B/2C).
 *
 * Dosya türüne göre doğru uca yönlendirir:
 *  · Yapısal soy dosyaları (.ftz / GEDCOM / CSV / JSON / TSV / TXT) → /api/family/import
 *  · PDF → önce e-Devlet ayrıştırıcısı (/api/family/import); kişi çıkmazsa yapay
 *    zekâ (/api/ai/extract)'e düşer.
 *  · Görsel / Excel / Word / diğer → yapay zekâ (/api/ai/extract).
 *
 * Böylece kullanıcı hangi dosyayı seçerse seçsin tek "Dosya seç" akışı çalışır.
 */

export class ImportError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

interface Attempt {
  ok: boolean;
  count: number;
  status: number;
  error?: string;
}

async function postFamilyImport(file: File, mode: string): Promise<Attempt> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("mode", mode);
  const res = await fetch("/api/family/import", { method: "POST", body: fd });
  const data = await res.json().catch(() => null);
  return { ok: res.ok, count: data?.count ?? 0, status: res.status, error: data?.error };
}

async function postAiExtract(file: File, mode: string, lang: string): Promise<Attempt> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("mode", mode);
  fd.append("lang", lang);
  const res = await fetch("/api/ai/extract", { method: "POST", body: fd });
  const data = await res.json().catch(() => null);
  return { ok: res.ok, count: data?.count ?? 0, status: res.status, error: data?.error };
}

const STRUCTURED = /\.(ftz|ged|gedcom|csv|tsv|json|txt)$/i;

export interface ImportOptions {
  mode: "merge" | "replace";
  lang: "tr" | "en";
  /** AI yapılandırılmamışsa gösterilecek metin (503). */
  aiNotConfigured?: string;
  /** Dosyadan kişi çıkmadıysa gösterilecek metin. */
  emptyMessage?: string;
}

/** Dosyayı uygun uca gönderir, içe aktarılan kişi sayısını döndürür. */
export async function importAnyFile(file: File, opts: ImportOptions): Promise<number> {
  const name = file.name || "";
  const isPdf = /\.pdf$/i.test(name) || file.type === "application/pdf";

  const finish = (a: Attempt): number => {
    if (a.status === 503 && opts.aiNotConfigured) throw new ImportError(opts.aiNotConfigured, 503);
    if (!a.ok) throw new ImportError(a.error ?? "İçe aktarılamadı.", a.status);
    if (!a.count) throw new ImportError(opts.emptyMessage ?? "Dosyadan kişi bulunamadı.", 422);
    return a.count;
  };

  if (STRUCTURED.test(name)) {
    return finish(await postFamilyImport(file, opts.mode));
  }

  if (isPdf) {
    // Önce e-Devlet PDF ayrıştırıcısı; kişi çıkmazsa yapay zekâya düş.
    const first = await postFamilyImport(file, opts.mode);
    if (first.ok && first.count > 0) return first.count;
    return finish(await postAiExtract(file, opts.mode, opts.lang));
  }

  // Görsel / tablo / belge / metin / bilinmeyen → yapay zekâ.
  return finish(await postAiExtract(file, opts.mode, opts.lang));
}
