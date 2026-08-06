"use client";

import { useState, useRef } from "react";
import type { Person } from "@/types/family";

// ── Date helpers ──────────────────────────────────────────────────────────────

function storedToDisplay(stored: string): string {
  if (!stored) return "";
  if (/^\d{4}$/.test(stored)) return stored;
  if (/^\d{4}-\d{2}-\d{2}$/.test(stored)) {
    const [y, m, d] = stored.split("-");
    return `${d}.${m}.${y}`;
  }
  return stored;
}

function displayToStored(display: string): string {
  const t = display.trim();
  if (!t) return "";
  if (/^\d{4}$/.test(t)) return t;
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(t)) {
    const [d, m, y] = t.split(".");
    return `${y}-${m}-${d}`;
  }
  return t;
}

function isValidDate(display: string): boolean {
  const t = display.trim();
  if (!t) return true;
  if (/^\d{4}$/.test(t)) {
    const y = parseInt(t);
    return y >= 1 && y <= new Date().getFullYear() + 1;
  }
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(t)) {
    const [d, m, y] = t.split(".").map(Number);
    if (m < 1 || m > 12 || d < 1 || d > 31) return false;
    const dt = new Date(y, m - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
  }
  return false;
}

function parseDisplay(display: string): Date | null {
  const t = display.trim();
  if (/^\d{4}$/.test(t)) return new Date(parseInt(t), 6, 1);
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(t)) {
    const [d, m, y] = t.split(".").map(Number);
    return new Date(y, m - 1, d);
  }
  return null;
}

function calcAge(birthDisplay: string, deathDisplay?: string): number | null {
  const birth = parseDisplay(birthDisplay);
  if (!birth) return null;
  const end = deathDisplay ? parseDisplay(deathDisplay) : new Date();
  if (!end) return null;
  let age = end.getFullYear() - birth.getFullYear();
  const m = end.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && end.getDate() < birth.getDate())) age--;
  return age >= 0 ? age : null;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  people: Person[];
  initial?: Partial<Person>;
  personId?: string;
  onClose: () => void;
  onSaved?: (person: Person) => void;
}

export default function PersonForm({ people, initial, personId, onClose, onSaved }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    firstName: initial?.firstName ?? "",
    lastName: initial?.lastName ?? "",
    gender: (initial?.gender ?? "unknown") as Person["gender"],
    birthDate: storedToDisplay(initial?.birthDate ?? ""),
    deathDate: storedToDisplay(initial?.deathDate ?? ""),
    birthPlace: initial?.birthPlace ?? "",
    bio: initial?.bio ?? "",
    photo: initial?.photo ?? "",
    parentIds: initial?.parentIds ?? [] as string[],
    spouseIds: initial?.spouseIds ?? [] as string[],
  });

  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const age = form.birthDate ? calcAge(form.birthDate, form.deathDate || undefined) : null;

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!form.firstName.trim()) e.firstName = "Ad zorunludur.";
    if (!form.lastName.trim()) e.lastName = "Soyad zorunludur.";
    if (form.birthDate && !isValidDate(form.birthDate))
      e.birthDate = "GG.AA.YYYY veya YYYY formatında girin.";
    if (form.deathDate && !isValidDate(form.deathDate))
      e.deathDate = "GG.AA.YYYY veya YYYY formatında girin.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handlePhoto = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const { url } = await res.json();
    setForm((f) => ({ ...f, photo: url }));
    setUploading(false);
  };

  const toggleMulti = (field: "parentIds" | "spouseIds", id: string) => {
    setForm((f) => {
      const arr = f[field];
      return {
        ...f,
        [field]: arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id],
      };
    });
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setSaving(true);

    const payload = {
      ...form,
      birthDate: displayToStored(form.birthDate),
      deathDate: displayToStored(form.deathDate),
    };

    const url = personId ? `/api/family/person/${personId}` : "/api/family/person";
    const res = await fetch(url, {
      method: personId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErrors({ general: data.error ?? "Kaydedilemedi. Lütfen tekrar deneyin." });
      return;
    }

    const person: Person = await res.json();
    onSaved?.(person);
    onClose();
  };

  const others = people.filter((p) => p.id !== personId);
  const inp = (err?: boolean) =>
    `w-full px-3 py-2 border ${err ? "border-red-400 bg-red-50" : "border-gray-300"} rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-gray-900 text-sm`;
  const lbl = "block text-sm font-medium text-gray-700 mb-1";

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">

      {/* Photo */}
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full overflow-hidden bg-gray-100 border-2 border-gray-200 flex items-center justify-center flex-shrink-0">
          {form.photo
            ? <img src={form.photo} alt="" className="w-full h-full object-cover" />
            : <span className="text-2xl text-gray-400">👤</span>}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
          >
            {uploading ? "Yükleniyor…" : "Fotoğraf Seç"}
          </button>
          {form.photo && (
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, photo: "" }))}
              className="text-sm text-red-500 hover:text-red-700"
            >
              Kaldır
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
        </div>
      </div>

      {/* Ad / Soyad */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Ad <span className="text-red-500">*</span></label>
          <input
            className={inp(!!errors.firstName)}
            value={form.firstName}
            onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
          />
          {errors.firstName && <p className="text-xs text-red-500 mt-0.5">{errors.firstName}</p>}
        </div>
        <div>
          <label className={lbl}>Soyad <span className="text-red-500">*</span></label>
          <input
            className={inp(!!errors.lastName)}
            value={form.lastName}
            onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
          />
          {errors.lastName && <p className="text-xs text-red-500 mt-0.5">{errors.lastName}</p>}
        </div>
      </div>

      {/* Cinsiyet */}
      <div>
        <label className={lbl}>Cinsiyet</label>
        <select
          className={inp()}
          value={form.gender}
          onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value as Person["gender"] }))}
        >
          <option value="unknown">Belirtilmemiş</option>
          <option value="male">Erkek</option>
          <option value="female">Kadın</option>
        </select>
      </div>

      {/* Tarihler */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Doğum Tarihi</label>
          <input
            className={inp(!!errors.birthDate)}
            placeholder="GG.AA.YYYY veya YYYY"
            value={form.birthDate}
            onChange={(e) => setForm((f) => ({ ...f, birthDate: e.target.value }))}
          />
          {errors.birthDate
            ? <p className="text-xs text-red-500 mt-0.5">{errors.birthDate}</p>
            : age !== null && (
              <p className="text-xs text-green-700 mt-0.5 font-medium">
                {form.deathDate ? `Vefat yaşı: ${age}` : `Yaş: ${age}`}
              </p>
            )}
        </div>
        <div>
          <label className={lbl}>Ölüm Tarihi</label>
          <input
            className={inp(!!errors.deathDate)}
            placeholder="GG.AA.YYYY veya YYYY"
            value={form.deathDate}
            onChange={(e) => setForm((f) => ({ ...f, deathDate: e.target.value }))}
          />
          {errors.deathDate && <p className="text-xs text-red-500 mt-0.5">{errors.deathDate}</p>}
        </div>
      </div>

      {/* Doğum Yeri */}
      <div>
        <label className={lbl}>Doğum Yeri</label>
        <input
          className={inp()}
          placeholder="Şehir, Ülke"
          value={form.birthPlace}
          onChange={(e) => setForm((f) => ({ ...f, birthPlace: e.target.value }))}
        />
      </div>

      {/* Biyografi */}
      <div>
        <label className={lbl}>Biyografi / Notlar</label>
        <textarea
          className={`${inp()} h-20 resize-none`}
          placeholder="Bu kişi hakkında notlar…"
          value={form.bio}
          onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
        />
      </div>

      {/* Ebeveynler */}
      {others.length > 0 && (
        <div>
          <label className={lbl}>Ebeveynler (max 2)</label>
          <div className="space-y-1 max-h-32 overflow-y-auto border border-gray-200 rounded-lg p-2">
            {others.map((p) => (
              <label key={p.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 px-2 py-1 rounded">
                <input
                  type="checkbox"
                  checked={form.parentIds.includes(p.id)}
                  disabled={!form.parentIds.includes(p.id) && form.parentIds.length >= 2}
                  onChange={() => toggleMulti("parentIds", p.id)}
                  className="accent-green-600"
                />
                <span className="text-sm text-gray-700">{p.firstName} {p.lastName}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Eşler */}
      {others.length > 0 && (
        <div>
          <label className={lbl}>Eş / Eşler</label>
          <div className="space-y-1 max-h-32 overflow-y-auto border border-gray-200 rounded-lg p-2">
            {others.map((p) => (
              <label key={p.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 px-2 py-1 rounded">
                <input
                  type="checkbox"
                  checked={form.spouseIds.includes(p.id)}
                  onChange={() => toggleMulti("spouseIds", p.id)}
                  className="accent-pink-500"
                />
                <span className="text-sm text-gray-700">{p.firstName} {p.lastName}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {errors.general && (
        <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">{errors.general}</p>
      )}

      <div className="flex gap-3 pt-1">
        <button
          type="submit"
          disabled={saving || uploading}
          className="flex-1 py-2.5 bg-green-700 hover:bg-green-800 disabled:bg-green-400 text-white font-semibold rounded-lg transition-colors text-sm"
        >
          {saving ? "Kaydediliyor…" : personId ? "Güncelle" : "Kaydet"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors text-sm font-medium"
        >
          İptal
        </button>
      </div>
    </form>
  );
}
