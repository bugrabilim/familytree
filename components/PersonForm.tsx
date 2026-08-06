"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import type { Person } from "@/types/family";

interface Props {
  people: Person[];
  initial?: Partial<Person>;
  personId?: string;
}

export default function PersonForm({ people, initial, personId }: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    firstName: initial?.firstName ?? "",
    lastName: initial?.lastName ?? "",
    gender: initial?.gender ?? "unknown",
    birthDate: initial?.birthDate ?? "",
    deathDate: initial?.deathDate ?? "",
    birthPlace: initial?.birthPlace ?? "",
    bio: initial?.bio ?? "",
    photo: initial?.photo ?? "",
    parentIds: initial?.parentIds ?? [],
    spouseIds: initial?.spouseIds ?? [],
  });

  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);

    const url = personId
      ? `/api/family/person/${personId}`
      : "/api/family/person";
    const method = personId ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    setSaving(false);
    if (!res.ok) {
      setError("Kaydedilemedi. Lütfen tekrar deneyin.");
      return;
    }

    const person: Person = await res.json();
    router.push(`/person/${person.id}`);
    router.refresh();
  };

  const others = people.filter((p) => p.id !== personId);

  const inputCls =
    "w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-gray-900 text-sm";
  const labelCls = "block text-sm font-medium text-gray-700 mb-1";

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Photo */}
      <div className="flex items-center gap-4">
        <div className="w-20 h-20 rounded-full overflow-hidden bg-gray-100 border-2 border-gray-200 flex items-center justify-center flex-shrink-0">
          {form.photo ? (
            <img src={form.photo} alt="Fotoğraf" className="w-full h-full object-cover" />
          ) : (
            <span className="text-3xl text-gray-400">👤</span>
          )}
        </div>
        <div>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
          >
            {uploading ? "Yükleniyor..." : "Fotoğraf Seç"}
          </button>
          {form.photo && (
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, photo: "" }))}
              className="ml-2 text-sm text-red-500 hover:text-red-700"
            >
              Kaldır
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePhoto}
          />
        </div>
      </div>

      {/* Name & gender */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Ad *</label>
          <input
            className={inputCls}
            required
            value={form.firstName}
            onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
          />
        </div>
        <div>
          <label className={labelCls}>Soyad *</label>
          <input
            className={inputCls}
            required
            value={form.lastName}
            onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
          />
        </div>
      </div>

      <div>
        <label className={labelCls}>Cinsiyet</label>
        <select
          className={inputCls}
          value={form.gender}
          onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value as Person["gender"] }))}
        >
          <option value="unknown">Belirtilmemiş</option>
          <option value="male">Erkek</option>
          <option value="female">Kadın</option>
        </select>
      </div>

      {/* Dates */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Doğum Tarihi</label>
          <input
            className={inputCls}
            type="text"
            placeholder="YYYY veya YYYY-AA-GG"
            value={form.birthDate}
            onChange={(e) => setForm((f) => ({ ...f, birthDate: e.target.value }))}
          />
        </div>
        <div>
          <label className={labelCls}>Ölüm Tarihi</label>
          <input
            className={inputCls}
            type="text"
            placeholder="YYYY veya YYYY-AA-GG"
            value={form.deathDate}
            onChange={(e) => setForm((f) => ({ ...f, deathDate: e.target.value }))}
          />
        </div>
      </div>

      <div>
        <label className={labelCls}>Doğum Yeri</label>
        <input
          className={inputCls}
          placeholder="Şehir, Ülke"
          value={form.birthPlace}
          onChange={(e) => setForm((f) => ({ ...f, birthPlace: e.target.value }))}
        />
      </div>

      <div>
        <label className={labelCls}>Biyografi / Notlar</label>
        <textarea
          className={`${inputCls} h-24 resize-none`}
          placeholder="Bu kişi hakkında notlar..."
          value={form.bio}
          onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
        />
      </div>

      {/* Parents */}
      {others.length > 0 && (
        <div>
          <label className={labelCls}>Ebeveynler (max 2)</label>
          <div className="space-y-1 max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-2">
            {others.map((p) => (
              <label key={p.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 px-2 py-1 rounded">
                <input
                  type="checkbox"
                  checked={form.parentIds.includes(p.id)}
                  disabled={!form.parentIds.includes(p.id) && form.parentIds.length >= 2}
                  onChange={() => toggleMulti("parentIds", p.id)}
                  className="accent-green-600"
                />
                <span className="text-sm text-gray-700">
                  {p.firstName} {p.lastName}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Spouses */}
      {others.length > 0 && (
        <div>
          <label className={labelCls}>Eş / Eşler</label>
          <div className="space-y-1 max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-2">
            {others.map((p) => (
              <label key={p.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 px-2 py-1 rounded">
                <input
                  type="checkbox"
                  checked={form.spouseIds.includes(p.id)}
                  onChange={() => toggleMulti("spouseIds", p.id)}
                  className="accent-pink-500"
                />
                <span className="text-sm text-gray-700">
                  {p.firstName} {p.lastName}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      {error && (
        <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</p>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={saving || uploading}
          className="flex-1 py-2.5 bg-green-700 hover:bg-green-800 disabled:bg-green-400 text-white font-semibold rounded-lg transition-colors"
        >
          {saving ? "Kaydediliyor..." : personId ? "Güncelle" : "Kaydet"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="px-5 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors text-sm font-medium"
        >
          İptal
        </button>
      </div>
    </form>
  );
}
