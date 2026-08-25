"use client";

import { useMemo, useRef, useState } from "react";
import {
  EDUCATION_LEVELS,
  ESTRANGEMENT_LABELS,
  LIFE_EVENT_TYPES,
  ASSOCIATION_TYPES,
  MEMORY_PROMPTS,
  PARENT_KIND_LABELS,
  PRIVATE_GROUPS,
  SOURCE_KINDS,
  type Association,
  type LifeEvent,
  type Memory,
  type ParentLink,
  type Person,
  type Source,
} from "@/types/family";
import AudioRecorder from "./AudioRecorder";
import Avatar from "./ui/Avatar";
import LocationPicker from "./LocationPicker";
import { generateAvatar } from "@/lib/avatar";
import Button from "./ui/Button";
import {
  calcAge,
  displayToStored,
  isValidDateInput,
  storedToDisplay,
} from "@/lib/date";
import {
  createPerson,
  updatePerson,
  uploadPhoto,
  uploadVideo,
  uploadDocument,
  type PersonPayload,
  type RelationType,
} from "@/lib/actions";
import { useT } from "@/lib/i18n";
import { fullName } from "@/lib/name";

interface Props {
  people: Person[];
  initial?: Person;
  personId?: string;
  /** Yeni kişi, mevcut birine bağlanarak ekleniyorsa */
  relation?: { type: RelationType; target: Person };
  onCancel: () => void;
  onSaved: (person: Person) => void;
}

type Errors = Partial<Record<"firstName" | "lastName" | "birthDate" | "deathDate" | "gender" | "events" | "form", string>>;

/** Formda düzenlenen olay satırı — tarih görüntü biçiminde tutulur (GG.AA.YYYY). */
interface EventRow {
  id: string;
  date: string;
  type: string;
  title: string;
  place: string;
}

/** Formda düzenlenen kaynak satırı. */
interface SourceRow {
  id: string;
  kind: string;
  title: string;
  url: string;
  note: string;
}

const field =
  "w-full h-10 px-3 rounded-xl bg-surface border border-border text-text text-sm placeholder:text-text-subtle " +
  "focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all";
const label = "block text-xs font-medium text-text-muted mb-1.5";

/**
 * Türkçe-duyarlı normalleştirme: küçük harf + aksan/harf katlama, alfasayısal
 * dışı at. "Öğretmen" ve "ogretmen" aynı anahtara iner → meslek önerilerinde
 * yazım/harf farkına takılmadan eşleşme sağlar.
 */
function normalizeTr(s: string): string {
  return s
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "");
}

export default function PersonForm({
  people,
  initial,
  personId,
  relation,
  onCancel,
  onSaved,
}: Props) {
  const t = useT();
  const fileRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    firstName: initial?.firstName ?? "",
    lastName: initial?.lastName ?? relation?.target.lastName ?? "",
    nickname: initial?.nickname ?? "",
    patronymic: initial?.patronymic ?? "",
    orientation: initial?.orientation ?? "",
    // Madde 15 — "bilinmiyor" cinsiyet yok; yeni kişide seçim zorunlu (boş başlar).
    // Eski kayıtlarda "unknown" gelirse boş sayılır ve kaydetmeden önce seçtirilir.
    gender: (initial?.gender && initial.gender !== "unknown" ? initial.gender : "") as Person["gender"] | "",
    birthDate: storedToDisplay(initial?.birthDate),
    deathDate: storedToDisplay(initial?.deathDate),
    birthPlace: initial?.birthPlace ?? "",
    bio: initial?.bio ?? "",
    photo: initial?.photo ?? "",
    photos: (initial?.photos ?? []) as string[],
    videos: (initial?.videos ?? []) as string[],
    documents: (initial?.documents ?? []) as string[],
    religion: initial?.religion ?? "",
    denomination: initial?.denomination ?? "",
    language: initial?.language ?? "",
    ethnicity: initial?.ethnicity ?? "",
    nationality: initial?.nationality ?? "",
    occupation: initial?.occupation ?? "",
    education: initial?.education ?? "",
    congenitalCondition: initial?.congenitalCondition ?? "",
    healthCondition: initial?.healthCondition ?? "",
    deathCause: initial?.deathCause ?? "",
    burialPlace: initial?.burialPlace ?? "",
    burialCoords: (initial?.burialCoords ?? null) as { lat: number; lng: number } | null,
    parentIds: initial?.parentIds ?? [],
    spouseIds: initial?.spouseIds ?? [],
    formerSpouseIds: initial?.formerSpouseIds ?? [],
    parentLinks: (initial?.parentLinks ?? {}) as Record<string, ParentLink>,
  });

  const [events, setEvents] = useState<EventRow[]>(
    (initial?.events ?? []).map((e) => ({
      id: e.id,
      date: storedToDisplay(e.date),
      type: e.type || "diger",
      title: e.title ?? "",
      place: e.place ?? "",
    }))
  );

  const [sources, setSources] = useState<SourceRow[]>(
    (initial?.sources ?? []).map((s) => ({
      id: s.id,
      kind: s.kind || "belge",
      title: s.title ?? "",
      url: s.url ?? "",
      note: s.note ?? "",
    }))
  );

  const [memories, setMemories] = useState<Memory[]>(
    (initial?.memories ?? []).map((m) => ({
      id: m.id,
      prompt: m.prompt,
      text: m.text ?? "",
      audio: m.audio,
      date: m.date,
    }))
  );

  const [confidential, setConfidential] = useState(initial?.confidential ?? false);
  const [privateFields, setPrivateFields] = useState<string[]>(initial?.privateFields ?? []);

  // Kişi türü + yakın çevre bağları (aile-dışı yakınlar). "Yakın çevre ekle"
  // hızlı-eklemesinde yeni kişi doğrudan çevre olarak başlar.
  const [kind, setKind] = useState<"uye" | "cevre">(
    initial?.kind === "cevre" || relation?.type === "associate" ? "cevre" : "uye"
  );
  const [associations, setAssociations] = useState<Association[]>(initial?.associations ?? []);
  // "associate" bağında yeni kişinin hedefe bağ türü (arkadas, komsu…).
  const [relAssocType, setRelAssocType] = useState<string>("arkadas");

  const [errors, setErrors] = useState<Errors>({});
  const [uploading, setUploading] = useState(false);
  const [galleryUploading, setGalleryUploading] = useState(false);
  const [mediaUploading, setMediaUploading] = useState<"videos" | "documents" | null>(null);
  const [saving, setSaving] = useState(false);
  const [showLinks, setShowLinks] = useState(false);
  const [avatarSecici, setAvatarSecici] = useState(false);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (key in errors) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const age = useMemo(() => {
    if (!isValidDateInput(form.birthDate) || !form.birthDate) return null;
    return calcAge(
      displayToStored(form.birthDate),
      isValidDateInput(form.deathDate) && form.deathDate ? displayToStored(form.deathDate) : undefined
    );
  }, [form.birthDate, form.deathDate]);

  const others = useMemo(
    () => people.filter((p) => p.id !== personId),
    [people, personId]
  );

  /**
   * Meslek önerileri — ağaçta girilmiş mesleklerden türetilir (çoktan-seçmeli
   * datalist). Türkçe-duyarlı anahtarla tekilleştirilir; en sık kullanılan
   * yazım kanonik kabul edilir. `occupationCanon` ile "ogretmen" → "Öğretmen".
   */
  const occupationOptions = useMemo(() => {
    const byKey = new Map<string, { display: string; count: number }>();
    for (const p of people) {
      const v = p.occupation?.trim();
      if (!v) continue;
      const key = normalizeTr(v);
      if (!key) continue;
      const cur = byKey.get(key);
      if (cur) cur.count++;
      else byKey.set(key, { display: v, count: 1 });
    }
    return [...byKey.values()]
      .sort((a, b) => b.count - a.count || a.display.localeCompare(b.display, "tr"))
      .map((o) => o.display);
  }, [people]);

  const occupationCanon = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of occupationOptions) m.set(normalizeTr(d), d);
    return m;
  }, [occupationOptions]);

  /** Avatar seçici için aynı kişinin farklı görünümleri */
  const avatarSecenekleri = useMemo(() => {
    const seed = personId || `${form.firstName} ${form.lastName}`.trim() || "yeni";
    const yil = isValidDateInput(form.birthDate) && form.birthDate
      ? Number(displayToStored(form.birthDate).slice(0, 4))
      : undefined;
    return Array.from({ length: 24 }, (_, i) => generateAvatar(seed, (form.gender || "unknown") as Person["gender"], yil, i));
  }, [personId, form.firstName, form.lastName, form.gender, form.birthDate]);

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadPhoto(file);
      set("photo", url);
    } catch (err) {
      setErrors((prev) => ({ ...prev, form: (err as Error).message }));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  /** Galeriye birden çok fotoğraf yükle — her dosya mevcut yükleyiciyle gider. */
  const handleGallery = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setGalleryUploading(true);
    try {
      const urls: string[] = [];
      for (const file of files) {
        urls.push(await uploadPhoto(file));
      }
      setForm((f) => ({ ...f, photos: [...f.photos, ...urls] }));
    } catch (err) {
      setErrors((prev) => ({ ...prev, form: (err as Error).message }));
    } finally {
      setGalleryUploading(false);
      if (galleryRef.current) galleryRef.current.value = "";
    }
  };

  const removeGalleryPhoto = (url: string) =>
    setForm((f) => ({ ...f, photos: f.photos.filter((u) => u !== url) }));

  /** Video / belge yükleme — tek dosya, ilgili listeye eklenir. */
  const handleMedia = async (
    e: React.ChangeEvent<HTMLInputElement>,
    kind: "videos" | "documents"
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMediaUploading(kind);
    try {
      const url = kind === "videos" ? await uploadVideo(file) : await uploadDocument(file);
      setForm((f) => ({ ...f, [kind]: [...f[kind], url] }));
    } catch (err) {
      setErrors((prev) => ({ ...prev, form: (err as Error).message }));
    } finally {
      setMediaUploading(null);
      const ref = kind === "videos" ? videoRef : docRef;
      if (ref.current) ref.current.value = "";
    }
  };
  const removeMedia = (kind: "videos" | "documents", url: string) =>
    setForm((f) => ({ ...f, [kind]: f[kind].filter((u) => u !== url) }));

  /** Galerideki bir fotoğrafı kapak (avatar) yap. */
  const setCover = (url: string) => set("photo", url);

  const addEvent = () =>
    setEvents((es) => [
      ...es,
      { id: crypto.randomUUID(), date: "", type: "diger", title: "", place: "" },
    ]);
  const removeEvent = (id: string) =>
    setEvents((es) => es.filter((e) => e.id !== id));
  const updateEvent = (id: string, patch: Partial<EventRow>) => {
    setEvents((es) => es.map((e) => (e.id === id ? { ...e, ...patch } : e)));
    if (errors.events) setErrors((prev) => ({ ...prev, events: undefined }));
  };

  const addSource = () =>
    setSources((ss) => [
      ...ss,
      { id: crypto.randomUUID(), kind: "belge", title: "", url: "", note: "" },
    ]);
  const removeSource = (id: string) =>
    setSources((ss) => ss.filter((s) => s.id !== id));
  const updateSource = (id: string, patch: Partial<SourceRow>) =>
    setSources((ss) => ss.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const addMemory = (prompt?: string) =>
    setMemories((ms) => [...ms, { id: crypto.randomUUID(), prompt, text: "" }]);
  const removeMemory = (id: string) =>
    setMemories((ms) => ms.filter((m) => m.id !== id));
  const updateMemory = (id: string, patch: Partial<Memory>) =>
    setMemories((ms) => ms.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  const addAssociation = () =>
    setAssociations((as) => [...as, { id: crypto.randomUUID(), personId: "", type: "arkadas" }]);
  const removeAssociation = (id: string) =>
    setAssociations((as) => as.filter((a) => a.id !== id));
  const updateAssociation = (id: string, patch: Partial<Association>) =>
    setAssociations((as) => as.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  /** Yazılan etiketi bilinen bir bağ türü anahtarına çevirir; değilse serbest metin. */
  const assocKeyFromLabel = (val: string): string => {
    const v = val.trim().toLocaleLowerCase("tr");
    const hit = Object.entries(ASSOCIATION_TYPES).find(([, meta]) => meta.label.toLocaleLowerCase("tr") === v);
    return hit ? hit[0] : val.trim();
  };
  const sortedPeople = useMemo(() => {
    const coll = new Intl.Collator("tr");
    return [...people].sort((a, b) => coll.compare(fullName(a), fullName(b)));
  }, [people]);

  const toggleLink = (kind: "parentIds" | "spouseIds" | "formerSpouseIds", id: string) => {
    setForm((f) => {
      const arr = f[kind];
      const next = arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id];
      if (kind === "parentIds" && next.length > 2) return f;
      return { ...f, [kind]: next };
    });
  };

  const validate = (): boolean => {
    const e: Errors = {};
    if (!form.firstName.trim()) e.firstName = t("form.errFirstName");
    // Baba adı (patronim) varsa soyad zorunlu değil — Soyadı Kanunu öncesi
    // kuşaklar "Şaban oğlu Hüseyin" gibi soyadsız kaydedilebilir.
    if (!form.lastName.trim() && !form.patronymic.trim()) e.lastName = t("form.errLastName");
    // Madde 15 — cinsiyet zorunlu (bilinmiyor yok).
    if (form.gender !== "female" && form.gender !== "male" && form.gender !== "other") {
      e.gender = t("form.errGender");
    }
    if (!isValidDateInput(form.birthDate)) e.birthDate = t("form.errDate");
    if (!isValidDateInput(form.deathDate)) e.deathDate = t("form.errDate");

    if (!e.birthDate && !e.deathDate && form.birthDate && form.deathDate) {
      if (displayToStored(form.deathDate) < displayToStored(form.birthDate)) {
        e.deathDate = t("form.errDeathBeforeBirth");
      }
    }

    if (events.some((ev) => !isValidDateInput(ev.date))) {
      e.events = t("form.eventDateError");
    }

    // Kaydet düğmesinin yanında özet: hangi alan(lar) neden engelliyor. Böylece
    // katlanmış bölümlerdeki (ör. cinsiyet aşağıda) hatalar da tek yerde görünür.
    const labels: Record<string, string> = {
      firstName: t("form.field.firstName"),
      lastName: t("form.field.lastName"),
      gender: t("form.field.gender"),
      birthDate: t("form.field.birthDate"),
      deathDate: t("form.field.deathDate"),
      events: t("form.field.events"),
    };
    const missing = (Object.keys(e) as Array<keyof Errors>).filter((k) => k !== "form");
    if (missing.length > 0) {
      const names = missing.map((k) => labels[k] ?? k).join(", ");
      e.form = t("form.fixFields", { fields: names });
    }

    setErrors(e);
    return missing.length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSaving(true);
    setErrors({});

    // Boş satırları at, tarihi depolama biçimine çevir
    const builtEvents: LifeEvent[] = events
      .filter((ev) => ev.title.trim() || ev.date.trim() || ev.place.trim())
      .map((ev) => ({
        id: ev.id,
        date: ev.date.trim() ? displayToStored(ev.date) : undefined,
        type: ev.type,
        title: ev.title.trim(),
        place: ev.place.trim() || undefined,
      }));

    // Başlıksız (boş) satırları at; kaynağı temiz biçimde kur
    const builtSources: Source[] = sources
      .filter((s) => s.title.trim())
      .map((s) => ({
        id: s.id,
        title: s.title.trim(),
        kind: s.kind || undefined,
        url: s.url.trim() || undefined,
        note: s.note.trim() || undefined,
      }));

    // Anılar: en az metni ya da sesi olanları tut (boş satırları at).
    const builtMemories: Memory[] = memories
      .filter((m) => (m.text ?? "").trim() || m.audio)
      .map((m) => ({
        id: m.id,
        prompt: m.prompt || undefined,
        text: (m.text ?? "").trim() || undefined,
        audio: m.audio || undefined,
        date: m.date || undefined,
      }));

    const payload: PersonPayload = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      nickname: form.nickname.trim() || undefined,
      patronymic: form.patronymic.trim() || undefined,
      orientation: form.orientation.trim() || undefined,
      gender: form.gender as Person["gender"],
      birthDate: form.birthDate ? displayToStored(form.birthDate) : undefined,
      deathDate: form.deathDate ? displayToStored(form.deathDate) : undefined,
      birthPlace: form.birthPlace.trim() || undefined,
      religion: form.religion.trim() || undefined,
      denomination: form.denomination.trim() || undefined,
      language: form.language.trim() || undefined,
      ethnicity: form.ethnicity.trim() || undefined,
      nationality: form.nationality.trim() || undefined,
      occupation: form.occupation.trim()
        ? occupationCanon.get(normalizeTr(form.occupation)) ?? form.occupation.trim()
        : undefined,
      education: form.education.trim() || undefined,
      congenitalCondition: form.congenitalCondition.trim() || undefined,
      healthCondition: form.healthCondition.trim() || undefined,
      deathCause: form.deathCause.trim() || undefined,
      // Defin yeri yalnız vefat edenlerde saklanır. Temizlemenin de kaydedilmesi
      // için açıkça boş dize / null gönderilir (undefined "değiştirme" demek olur).
      burialPlace: form.deathDate.trim() ? form.burialPlace.trim() : "",
      burialCoords: form.deathDate.trim() ? form.burialCoords : null,
      bio: form.bio.trim() || undefined,
      photo: form.photo || undefined,
      photos: form.photos.length ? form.photos : undefined,
      videos: form.videos.length ? form.videos : undefined,
      documents: form.documents.length ? form.documents : undefined,
      events: builtEvents,
      sources: builtSources.length ? builtSources : undefined,
      memories: builtMemories.length ? builtMemories : undefined,
      kind,
      associations: associations.filter((a) => a.personId).length
        ? associations.filter((a) => a.personId).map((a) => ({ id: a.id, personId: a.personId, type: (a.type || "diger").trim(), note: a.note?.trim() || undefined }))
        : undefined,
      confidential: confidential || undefined,
      privateFields: privateFields.length ? privateFields : undefined,
    };

    if (relation) {
      payload.relation = {
        type: relation.type,
        targetId: relation.target.id,
        ...(relation.type === "associate" ? { assocType: relAssocType } : {}),
      };
    } else {
      payload.parentIds = form.parentIds;
      // Yalnızca hâlâ seçili olan ebeveynlerin bağ bilgisini gönder
      const links: Record<string, ParentLink> = {};
      for (const pid of form.parentIds) {
        const l = form.parentLinks[pid];
        if (l && (l.kind || l.estranged || l.note)) links[pid] = l;
      }
      payload.parentLinks = Object.keys(links).length ? links : undefined;
      payload.spouseIds = form.spouseIds;
      payload.formerSpouseIds = form.formerSpouseIds;
    }

    try {
      const saved = personId
        ? await updatePerson(personId, payload)
        : await createPerson(payload);
      onSaved(saved);
    } catch (err) {
      setErrors({ form: (err as Error).message });
      setSaving(false);
    }
  };

  const previewPerson = {
    id: personId,
    firstName: form.firstName,
    lastName: form.lastName,
    gender: (form.gender || "unknown") as Person["gender"],
    photo: form.photo,
    birthDate: isValidDateInput(form.birthDate) && form.birthDate
      ? displayToStored(form.birthDate)
      : undefined,
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {/* İlişki bağlamı */}
      {relation && (
        <div className="flex items-center gap-2.5 p-3 rounded-xl bg-primary-soft border border-primary/15">
          <Avatar person={relation.target} size="sm" />
          {/* Dile göre sıralama: TR "<ad> kişisinin <ilişki> olarak eklenecek",
              EN "Adding as <ad>'s <ilişki>". Önek/bağlaç/sonek sözlükten gelir. */}
          <p className="text-xs text-text leading-snug">
            {t("form.relCtxPrefix")}
            <span className="font-semibold">
              {relation.target.firstName} {relation.target.lastName}
            </span>
            {t("form.relCtxConnector")}
            <span className="font-semibold text-primary">
              {t(`relation.${relation.type}.verb`)}
            </span>
            {t("form.relCtxSuffix")}
          </p>
        </div>
      )}

      {/* Yakın çevre bağında: bağ türü seçimi (arkadaş, komşu, aile dostu…) */}
      {relation?.type === "associate" && (
        <div>
          <label className={label} htmlFor="pf-rel-assoc">{t("assoc.relTypeLabel")}</label>
          <input
            id="pf-rel-assoc"
            list="pf-assoc-types"
            value={ASSOCIATION_TYPES[relAssocType]?.label ?? relAssocType}
            onChange={(e) => setRelAssocType(assocKeyFromLabel(e.target.value))}
            placeholder={t("assoc.typePlaceholder")}
            className={field}
          />
        </div>
      )}

      {/* Fotoğraf ve avatar */}
      <div className="space-y-3">
        <div className="flex items-center gap-4">
          <Avatar person={previewPerson} size="lg" ring />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? t("form.uploading") : t("form.uploadPhoto")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setAvatarSecici((o) => !o)}
            >
              {t("form.chooseAvatar")}
            </Button>
            {form.photo && (
              <Button type="button" variant="ghost" size="sm" onClick={() => set("photo", "")}>
                {t("form.remove")}
              </Button>
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

        {avatarSecici && (
          <div className="rounded-xl border border-border bg-surface-2 p-3">
            <p className="text-[11px] text-text-muted mb-2.5">
              {t("form.avatarHint")}
            </p>
            <div className="grid grid-cols-6 sm:grid-cols-8 gap-2">
              {avatarSecenekleri.map((src, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => set("photo", src)}
                  aria-label={t("form.avatarAria", { n: i + 1 })}
                  className={`aspect-square rounded-full overflow-hidden border-2 transition-all hover:scale-105 ${
                    form.photo === src ? "border-primary ring-2 ring-primary/30" : "border-border"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Galeri — birden çok fotoğraf */}
        <div className="rounded-xl border border-border bg-surface-2 p-3">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-xs font-medium text-text">
              {t("form.gallery")}
              {form.photos.length > 0 && (
                <span className="ml-1.5 text-primary">· {form.photos.length}</span>
              )}
            </span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => galleryRef.current?.click()}
              disabled={galleryUploading}
            >
              {galleryUploading ? t("form.uploading") : t("form.addPhoto")}
            </Button>
          </div>

          {form.photos.length === 0 ? (
            <p className="text-[11px] text-text-subtle">
              {t("form.galleryEmpty")}
            </p>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
              {form.photos.map((src) => {
                const isCover = form.photo === src;
                return (
                  <div
                    key={src}
                    className={`relative group aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                      isCover ? "border-primary ring-2 ring-primary/30" : "border-border"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt="" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeGalleryPhoto(src)}
                      aria-label={t("form.removePhoto")}
                      className="absolute top-0.5 right-0.5 w-5 h-5 grid place-items-center rounded-md bg-black/55 text-white hover:bg-danger transition-colors"
                    >
                      <svg width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden>
                        <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    </button>
                    {isCover ? (
                      <span className="absolute bottom-0 inset-x-0 bg-primary/85 text-white text-[9px] font-medium text-center py-0.5">
                        {t("form.cover")}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setCover(src)}
                        className="absolute bottom-0 inset-x-0 bg-black/55 text-white text-[9px] font-medium text-center py-0.5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-primary"
                      >
                        {t("form.makeCover")}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <input
            ref={galleryRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleGallery}
          />
        </div>

        {/* Video kayıtları */}
        <div className="rounded-xl border border-border bg-surface-2 p-3">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-xs font-medium text-text">
              {t("form.videos")}
              {form.videos.length > 0 && <span className="ml-1.5 text-primary">· {form.videos.length}</span>}
            </span>
            <Button type="button" variant="secondary" size="sm" onClick={() => videoRef.current?.click()} disabled={mediaUploading !== null}>
              {mediaUploading === "videos" ? t("form.uploading") : t("form.addVideo")}
            </Button>
          </div>
          {form.videos.length === 0 ? (
            <p className="text-[11px] text-text-subtle">{t("form.videosEmpty")}</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {form.videos.map((src) => (
                <div key={src} className="relative rounded-lg overflow-hidden border border-border bg-black">
                  <video src={src} className="w-full aspect-video object-cover" controls preload="metadata" />
                  <button
                    type="button"
                    onClick={() => removeMedia("videos", src)}
                    aria-label={t("form.remove")}
                    className="absolute top-0.5 right-0.5 w-5 h-5 grid place-items-center rounded-md bg-black/55 text-white hover:bg-danger transition-colors"
                  >
                    <svg width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                  </button>
                </div>
              ))}
            </div>
          )}
          <input ref={videoRef} type="file" accept="video/*" className="hidden" onChange={(e) => handleMedia(e, "videos")} />
        </div>

        {/* Belge / el yazısı taramaları */}
        <div className="rounded-xl border border-border bg-surface-2 p-3">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-xs font-medium text-text">
              {t("form.documents")}
              {form.documents.length > 0 && <span className="ml-1.5 text-primary">· {form.documents.length}</span>}
            </span>
            <Button type="button" variant="secondary" size="sm" onClick={() => docRef.current?.click()} disabled={mediaUploading !== null}>
              {mediaUploading === "documents" ? t("form.uploading") : t("form.addDocument")}
            </Button>
          </div>
          {form.documents.length === 0 ? (
            <p className="text-[11px] text-text-subtle">{t("form.documentsEmpty")}</p>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
              {form.documents.map((src) => {
                const isImg = /\.(jpe?g|png|gif|webp|bmp|tiff?)(?:$|[?#])/i.test(src);
                return (
                  <div key={src} className="relative group aspect-square rounded-lg overflow-hidden border border-border bg-surface">
                    {isImg ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={src} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <a href={src} target="_blank" rel="noopener noreferrer" className="w-full h-full grid place-items-center text-[10px] text-text-muted">
                        📄 {t("form.document")}
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => removeMedia("documents", src)}
                      aria-label={t("form.remove")}
                      className="absolute top-0.5 right-0.5 w-5 h-5 grid place-items-center rounded-md bg-black/55 text-white hover:bg-danger transition-colors"
                    >
                      <svg width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <input ref={docRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => handleMedia(e, "documents")} />
        </div>
      </div>

      {/* Lakap — eski kuşaklar için */}
      <div>
        <label className={label} htmlFor="pf-lakap">{t("form.nickname")}</label>
        <input
          id="pf-lakap"
          className={field}
          value={form.nickname}
          onChange={(e) => set("nickname", e.target.value)}
          placeholder={t("form.nicknamePlaceholder")}
        />
      </div>

      {/* Ad / Soyad */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label} htmlFor="pf-ad">{t("form.firstName")}</label>
          <input
            id="pf-ad"
            className={`${field} ${errors.firstName ? "border-danger ring-2 ring-danger/15" : ""}`}
            value={form.firstName}
            onChange={(e) => set("firstName", e.target.value)}
            placeholder={t("form.firstNamePlaceholder")}
            autoFocus
          />
          {errors.firstName && <p className="text-[11px] text-danger mt-1">{errors.firstName}</p>}
        </div>
        <div>
          <label className={label} htmlFor="pf-soyad">
            Soyad {form.patronymic.trim() ? <span className="text-text-subtle font-normal">(baba adı var — opsiyonel)</span> : "*"}
          </label>
          <input
            id="pf-soyad"
            className={`${field} ${errors.lastName ? "border-danger ring-2 ring-danger/15" : ""}`}
            value={form.lastName}
            onChange={(e) => set("lastName", e.target.value)}
            placeholder="Yılmaz"
          />
          {errors.lastName && <p className="text-[11px] text-danger mt-1">{errors.lastName}</p>}
        </div>
      </div>

      {/* Cinsiyet — segmented (Madde 15: "bilinmiyor" yok) */}
      <div>
        <span className={label}>Cinsiyet</span>
        <div className={`grid grid-cols-3 gap-1 p-1 rounded-xl bg-surface-2 border ${errors.gender ? "border-danger ring-2 ring-danger/15" : "border-border"}`}>
          {([
            { v: "female", l: "Kadın" },
            { v: "male", l: "Erkek" },
            { v: "other", l: "Diğer" },
          ] as const).map((o) => (
            <button
              key={o.v}
              type="button"
              onClick={() => set("gender", o.v)}
              className={`h-8 rounded-lg text-[11px] font-medium transition-all ${
                form.gender === o.v
                  ? "bg-bg-elevated text-text shadow-soft"
                  : "text-text-muted hover:text-text"
              }`}
            >
              {o.l}
            </button>
          ))}
        </div>
        {errors.gender && <p className="text-[11px] text-danger mt-1">{errors.gender}</p>}
      </div>

      {/* Tarihler */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label} htmlFor="pf-dogum">Doğum tarihi</label>
          <input
            id="pf-dogum"
            inputMode="numeric"
            className={`${field} tabular-nums ${errors.birthDate ? "border-danger ring-2 ring-danger/15" : ""}`}
            value={form.birthDate}
            onChange={(e) => set("birthDate", e.target.value)}
            placeholder="GG.AA.YYYY"
          />
          {errors.birthDate ? (
            <p className="text-[11px] text-danger mt-1">{errors.birthDate}</p>
          ) : age !== null ? (
            <p className="text-[11px] text-primary mt-1 font-medium">
              {form.deathDate ? `${age} yaşında vefat etti` : `${age} yaşında`}
            </p>
          ) : (
            <p className="text-[11px] text-text-subtle mt-1">Sadece yıl da olur</p>
          )}
        </div>
        <div>
          <label className={label} htmlFor="pf-olum">Ölüm tarihi</label>
          <input
            id="pf-olum"
            inputMode="numeric"
            className={`${field} tabular-nums ${errors.deathDate ? "border-danger ring-2 ring-danger/15" : ""}`}
            value={form.deathDate}
            onChange={(e) => set("deathDate", e.target.value)}
            placeholder="Yaşıyorsa boş"
          />
          {errors.deathDate && <p className="text-[11px] text-danger mt-1">{errors.deathDate}</p>}
        </div>
      </div>

      {/* Ölüm nedeni — yalnızca vefat tarihi varsa göster */}
      {form.deathDate.trim() && (
        <div>
          <label className={label} htmlFor="pf-olum-neden">Ölüm nedeni</label>
          <input
            id="pf-olum-neden"
            className={field}
            value={form.deathCause}
            onChange={(e) => set("deathCause", e.target.value)}
            placeholder="Kalp yetmezliği, trafik kazası…"
          />
        </div>
      )}

      {/* Defin yeri — yalnızca vefat edenlerde: adres + harita konum seçimi */}
      {form.deathDate.trim() && (
        <div>
          <label className={label} htmlFor="pf-defin">{t("burial.label")}</label>
          <input
            id="pf-defin"
            className={field}
            value={form.burialPlace}
            onChange={(e) => set("burialPlace", e.target.value)}
            placeholder={t("burial.placeholder")}
          />
          <div className="mt-2">
            <LocationPicker
              coords={form.burialCoords}
              onChange={(c) => set("burialCoords", c)}
              addressForGeocode={form.burialPlace || form.birthPlace}
            />
          </div>
        </div>
      )}

      {/* Doğum yeri */}
      <div>
        <label className={label} htmlFor="pf-yer">Doğum yeri</label>
        <input
          id="pf-yer"
          className={field}
          value={form.birthPlace}
          onChange={(e) => set("birthPlace", e.target.value)}
          placeholder="Trabzon, Türkiye"
        />
      </div>

      {/* Kimlik ve aidiyet — katlanır, isteğe bağlı */}
      <details className="rounded-xl border border-border overflow-hidden group">
        <summary className="flex items-center justify-between px-3.5 py-2.5 bg-surface-2 hover:bg-surface-3 transition-colors cursor-pointer list-none">
          <span className="text-xs font-medium text-text">Köken bilgileri</span>
          <span className="text-[11px] text-text-subtle">isteğe bağlı</span>
        </summary>
        <div className="p-3 space-y-3 bg-surface">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label} htmlFor="pf-din">Din</label>
              <input id="pf-din" className={field} value={form.religion}
                onChange={(e) => set("religion", e.target.value)} placeholder="İslam, Hristiyanlık…" />
            </div>
            <div>
              <label className={label} htmlFor="pf-mezhep">Mezhep / cemaat</label>
              <input id="pf-mezhep" className={field} value={form.denomination}
                onChange={(e) => set("denomination", e.target.value)} placeholder="Hanefi, Alevi, Ortodoks…" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label} htmlFor="pf-dil">Ana dil</label>
              <input id="pf-dil" className={field} value={form.language}
                onChange={(e) => set("language", e.target.value)} placeholder="Türkçe, Kürtçe, Rumca…" />
            </div>
            <div>
              <label className={label} htmlFor="pf-koken">Etnik köken</label>
              <input id="pf-koken" className={field} value={form.ethnicity}
                onChange={(e) => set("ethnicity", e.target.value)} placeholder="Türk, Çerkes, Arnavut…" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label} htmlFor="pf-uyruk">Uyruk</label>
              <input id="pf-uyruk" className={field} value={form.nationality}
                onChange={(e) => set("nationality", e.target.value)} placeholder="Türkiye, Almanya…" />
            </div>
            <div>
              <label className={label} htmlFor="pf-yonelim">Cinsel yönelim</label>
              <input id="pf-yonelim" className={field} value={form.orientation}
                onChange={(e) => set("orientation", e.target.value)} placeholder="Eşcinsel, Biseksüel…" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label} htmlFor="pf-meslek">Meslek</label>
              <input id="pf-meslek" className={field} value={form.occupation}
                list="pf-meslek-list"
                onChange={(e) => set("occupation", e.target.value)}
                onBlur={() => {
                  // Yazımı ağaçtaki kanonik mesleğe hizala (ogretmen → Öğretmen).
                  const v = form.occupation.trim();
                  const canon = v ? occupationCanon.get(normalizeTr(v)) : undefined;
                  if (canon && canon !== form.occupation) set("occupation", canon);
                }}
                placeholder="Öğretmen, Balıkçı, Terzi…" />
              <datalist id="pf-meslek-list">
                {occupationOptions.map((o) => (
                  <option key={o} value={o} />
                ))}
              </datalist>
            </div>
            <div>
              <label className={label} htmlFor="pf-egitim">{t("form.education")}</label>
              <select id="pf-egitim" className={field} value={form.education}
                onChange={(e) => set("education", e.target.value)}>
                <option value="">{t("form.educationNone")}</option>
                {EDUCATION_LEVELS.map((k) => (
                  <option key={k} value={k}>{t(`education.${k}`)}</option>
                ))}
                {/* İçe aktarımdan gelen, listede olmayan serbest metni koru */}
                {form.education && !(EDUCATION_LEVELS as readonly string[]).includes(form.education) && (
                  <option value={form.education}>{form.education}</option>
                )}
              </select>
            </div>
          </div>
          <div>
            <label className={label} htmlFor="pf-patronim">Baba adı (soyadı yoksa)</label>
            <input id="pf-patronim" className={field} value={form.patronymic}
              onChange={(e) => set("patronymic", e.target.value)}
              placeholder="Şaban oğlu, Veli kızı… (Soyadı Kanunu öncesi)" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label} htmlFor="pf-dogustan">Doğuştan sağlık durumu</label>
              <input id="pf-dogustan" className={field} value={form.congenitalCondition}
                onChange={(e) => set("congenitalCondition", e.target.value)}
                placeholder="Down sendromu, doğuştan görme engeli…" />
            </div>
            <div>
              <label className={label} htmlFor="pf-hastalik">Yaşarken sağlık sorunu</label>
              <input id="pf-hastalik" className={field} value={form.healthCondition}
                onChange={(e) => set("healthCondition", e.target.value)}
                placeholder="Bel fıtığı, diyabet, çocuk felci…" />
            </div>
          </div>
          <p className="text-[11px] text-text-subtle -mt-1">
            Kalıtsal ve sonradan gelen durumları izlemek isteyen aileler için. Boş bırakabilirsin.
          </p>
        </div>
      </details>

      {/* Yaşam olayları — katlanır, isteğe bağlı */}
      <details className="rounded-xl border border-border overflow-hidden group">
        <summary className="flex items-center justify-between px-3.5 py-2.5 bg-surface-2 hover:bg-surface-3 transition-colors cursor-pointer list-none">
          <span className="text-xs font-medium text-text">
            Yaşam olayları
            {events.length > 0 && <span className="ml-1.5 text-primary">· {events.length}</span>}
          </span>
          <span className="text-[11px] text-text-subtle">isteğe bağlı</span>
        </summary>
        <div className="p-3 space-y-3 bg-surface">
          {events.length === 0 ? (
            <p className="text-[11px] text-text-subtle">
              Evlilik, mezuniyet, göç, askerlik… ömrün dönüm noktalarını ekle. Zaman
              çizelgesinde sıralı gösterilir.
            </p>
          ) : (
            events.map((ev) => (
              <div key={ev.id} className="rounded-lg bg-surface-2 p-2.5 space-y-2">
                <div className="flex gap-1.5">
                  <input
                    inputMode="numeric"
                    aria-label="Olay tarihi"
                    className={`${field} tabular-nums flex-1`}
                    value={ev.date}
                    onChange={(e) => updateEvent(ev.id, { date: e.target.value })}
                    placeholder="GG.AA.YYYY"
                  />
                  <select
                    aria-label="Olay türü"
                    value={ev.type in LIFE_EVENT_TYPES ? ev.type : "diger"}
                    onChange={(e) => updateEvent(ev.id, { type: e.target.value })}
                    className="h-10 px-2 rounded-xl bg-surface border border-border text-xs text-text focus:outline-none focus:border-primary flex-1 min-w-0"
                  >
                    {Object.entries(LIFE_EVENT_TYPES).map(([k, v]) => (
                      <option key={k} value={k}>{v.icon} {v.label}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => removeEvent(ev.id)}
                    aria-label="Olayı kaldır"
                    className="w-10 h-10 shrink-0 grid place-items-center rounded-xl text-text-subtle hover:text-danger hover:bg-danger-soft transition-colors"
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
                <input
                  aria-label="Olay başlığı"
                  className={field}
                  value={ev.title}
                  onChange={(e) => updateEvent(ev.id, { title: e.target.value })}
                  placeholder="Başlık — ör. İlkokul mezuniyeti"
                />
                <input
                  aria-label="Olay yeri"
                  className={field}
                  value={ev.place}
                  onChange={(e) => updateEvent(ev.id, { place: e.target.value })}
                  placeholder="Yer (isteğe bağlı)"
                />
              </div>
            ))
          )}

          {errors.events && <p className="text-[11px] text-danger">{errors.events}</p>}

          <button
            type="button"
            onClick={addEvent}
            className="flex items-center gap-1.5 text-xs text-primary hover:underline font-medium"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
              <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Olay ekle
          </button>
        </div>
      </details>

      {/* Kaynaklar — katlanır, isteğe bağlı */}
      <details className="rounded-xl border border-border overflow-hidden group">
        <summary className="flex items-center justify-between px-3.5 py-2.5 bg-surface-2 hover:bg-surface-3 transition-colors cursor-pointer list-none">
          <span className="text-xs font-medium text-text">
            Kaynaklar
            {sources.length > 0 && <span className="ml-1.5 text-primary">· {sources.length}</span>}
          </span>
          <span className="text-[11px] text-text-subtle">isteğe bağlı</span>
        </summary>
        <div className="p-3 space-y-3 bg-surface">
          {sources.length === 0 ? (
            <p className="text-[11px] text-text-subtle">
              Bu bilgiyi nereden biliyoruz? Belge, nüfus kaydı, fotoğraf, mezar
              taşı, kitap, sözlü anlatım… Kaynağı ekleyip kişi panelinde gösterebilirsin.
            </p>
          ) : (
            sources.map((s) => (
              <div key={s.id} className="rounded-lg bg-surface-2 p-2.5 space-y-2">
                <div className="flex gap-1.5">
                  <select
                    aria-label="Kaynak türü"
                    value={s.kind in SOURCE_KINDS ? s.kind : "diger"}
                    onChange={(e) => updateSource(s.id, { kind: e.target.value })}
                    className="h-10 px-2 rounded-xl bg-surface border border-border text-xs text-text focus:outline-none focus:border-primary flex-1 min-w-0"
                  >
                    {Object.entries(SOURCE_KINDS).map(([k, v]) => (
                      <option key={k} value={k}>{v.icon} {v.label}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => removeSource(s.id)}
                    aria-label="Kaynağı kaldır"
                    className="w-10 h-10 shrink-0 grid place-items-center rounded-xl text-text-subtle hover:text-danger hover:bg-danger-soft transition-colors"
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
                <input
                  aria-label="Kaynak başlığı"
                  className={field}
                  value={s.title}
                  onChange={(e) => updateSource(s.id, { title: e.target.value })}
                  placeholder="Başlık — ör. 1927 Nüfus Sayımı"
                />
                <input
                  aria-label="Kaynak bağlantısı"
                  className={field}
                  value={s.url}
                  onChange={(e) => updateSource(s.id, { url: e.target.value })}
                  placeholder="Bağlantı (isteğe bağlı)"
                />
                <input
                  aria-label="Kaynak notu"
                  className={field}
                  value={s.note}
                  onChange={(e) => updateSource(s.id, { note: e.target.value })}
                  placeholder="Not / atıf (isteğe bağlı)"
                />
              </div>
            ))
          )}

          <button
            type="button"
            onClick={addSource}
            className="flex items-center gap-1.5 text-xs text-primary hover:underline font-medium"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
              <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Kaynak ekle
          </button>
        </div>
      </details>

      {/* Anılar — rehberli sorular + sesli hikâye (katlanır, isteğe bağlı) */}
      <details className="rounded-xl border border-border overflow-hidden group">
        <summary className="flex items-center justify-between px-3.5 py-2.5 bg-surface-2 hover:bg-surface-3 transition-colors cursor-pointer list-none">
          <span className="text-xs font-medium text-text">
            {t("memory.section")}
            {memories.length > 0 && <span className="ml-1.5 text-primary">· {memories.length}</span>}
          </span>
          <span className="text-[11px] text-text-subtle">isteğe bağlı</span>
        </summary>
        <div className="p-3 space-y-3 bg-surface">
          <p className="text-[11px] text-text-subtle">{t("memory.hint")}</p>

          {/* Rehberli soru çipleri — tıklayınca o soruyla bir anı ekler */}
          <div className="flex flex-wrap gap-1.5">
            {MEMORY_PROMPTS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => addMemory(t(`memoryPrompt.${k}`))}
                className="px-2.5 py-1 rounded-lg bg-surface-2 border border-border text-[11px] text-text hover:bg-surface-3 transition-colors"
              >
                + {t(`memoryPrompt.${k}`)}
              </button>
            ))}
          </div>

          {memories.map((m) => (
            <div key={m.id} className="rounded-lg bg-surface-2 p-2.5 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <input
                  aria-label={t("memory.promptLabel")}
                  className={`${field} h-9 font-medium`}
                  value={m.prompt ?? ""}
                  onChange={(e) => updateMemory(m.id, { prompt: e.target.value })}
                  placeholder={t("memory.promptPlaceholder")}
                />
                <button
                  type="button"
                  onClick={() => removeMemory(m.id)}
                  aria-label={t("memory.remove")}
                  className="w-9 h-9 shrink-0 grid place-items-center rounded-lg text-text-subtle hover:text-danger hover:bg-danger-soft transition-colors"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                    <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
              <textarea
                aria-label={t("memory.textLabel")}
                className={`${field} h-20 py-2 resize-none leading-relaxed`}
                value={m.text ?? ""}
                onChange={(e) => updateMemory(m.id, { text: e.target.value })}
                placeholder={t("memory.textPlaceholder")}
              />
              {m.audio ? (
                <div className="flex items-center gap-2">
                  <audio controls src={m.audio} className="h-8 max-w-full" />
                  <button
                    type="button"
                    onClick={() => updateMemory(m.id, { audio: undefined })}
                    className="text-[11px] text-text-subtle hover:text-danger"
                  >
                    {t("memory.removeAudio")}
                  </button>
                </div>
              ) : (
                <AudioRecorder onUploaded={(url) => updateMemory(m.id, { audio: url })} />
              )}
            </div>
          ))}

          <button
            type="button"
            onClick={() => addMemory()}
            className="flex items-center gap-1.5 text-xs text-primary hover:underline font-medium"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
              <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            {t("memory.add")}
          </button>
        </div>
      </details>

      {/* Kişi türü + Yakın çevre (aile-dışı yakınlar) */}
      <details className="rounded-xl border border-border overflow-hidden group">
        <summary className="flex items-center justify-between px-3.5 py-2.5 bg-surface-2 hover:bg-surface-3 transition-colors cursor-pointer list-none">
          <span className="text-xs font-medium text-text">
            {t("assoc.section")}
            {kind === "cevre" && <span className="ml-1.5 text-accent">· {t("assoc.isAssociate")}</span>}
            {associations.length > 0 && <span className="ml-1.5 text-primary">· {associations.length}</span>}
          </span>
          <span className="text-[11px] text-text-subtle">isteğe bağlı</span>
        </summary>
        <div className="p-3 space-y-3 bg-surface">
          {/* Kişi türü */}
          <div>
            <p className="text-[11px] text-text-subtle mb-1.5">{t("assoc.kindHint")}</p>
            <div className="inline-flex rounded-lg border border-border overflow-hidden text-xs">
              <button type="button" onClick={() => setKind("uye")}
                className={`px-3 py-1.5 transition-colors ${kind === "uye" ? "bg-primary text-primary-text" : "text-text-muted hover:text-text"}`}>
                {t("assoc.kindMember")}
              </button>
              <button type="button" onClick={() => { setKind("cevre"); if (initial?.confidential === undefined) setConfidential(true); }}
                className={`px-3 py-1.5 transition-colors ${kind === "cevre" ? "bg-accent text-white" : "text-text-muted hover:text-text"}`}>
                {t("assoc.kindAssociate")}
              </button>
            </div>
            {kind === "cevre" && <p className="text-[11px] text-text-subtle mt-1.5">{t("assoc.associateHint")}</p>}
          </div>

          {/* Bağlar */}
          <div>
            <p className="text-[11px] text-text-subtle mb-1.5">{t("assoc.listHint")}</p>
            <datalist id="pf-assoc-types">
              {Object.values(ASSOCIATION_TYPES).map((v) => <option key={v.label} value={v.label} />)}
            </datalist>
            <div className="space-y-2">
              {associations.map((a) => (
                <div key={a.id} className="flex flex-wrap items-center gap-1.5">
                  <select
                    value={a.personId}
                    onChange={(e) => updateAssociation(a.id, { personId: e.target.value })}
                    className="h-8 min-w-[8rem] flex-1 px-2 rounded-lg bg-surface-2 border border-border text-sm text-text focus:outline-none focus:border-primary"
                  >
                    <option value="">{t("common.choosePerson")}</option>
                    {sortedPeople.filter((p) => p.id !== personId).map((p) => (
                      <option key={p.id} value={p.id}>{fullName(p)}{p.birthDate ? ` · ${p.birthDate.slice(0, 4)}` : ""}</option>
                    ))}
                  </select>
                  <input
                    list="pf-assoc-types"
                    value={ASSOCIATION_TYPES[a.type]?.label ?? a.type}
                    onChange={(e) => updateAssociation(a.id, { type: assocKeyFromLabel(e.target.value) })}
                    placeholder={t("assoc.typePlaceholder")}
                    className="h-8 w-28 px-2 rounded-lg bg-surface-2 border border-border text-sm text-text focus:outline-none focus:border-primary"
                  />
                  <input
                    value={a.note ?? ""}
                    onChange={(e) => updateAssociation(a.id, { note: e.target.value })}
                    placeholder={t("assoc.notePlaceholder")}
                    className="h-8 flex-1 min-w-[6rem] px-2 rounded-lg bg-surface-2 border border-border text-sm text-text focus:outline-none focus:border-primary"
                  />
                  <button type="button" onClick={() => removeAssociation(a.id)} aria-label={t("common.remove")}
                    className="h-8 w-8 grid place-items-center rounded-lg text-text-subtle hover:text-danger hover:bg-danger-soft transition-colors">
                    ×
                  </button>
                </div>
              ))}
            </div>
            <button type="button" onClick={addAssociation}
              className="mt-2 h-8 px-3 rounded-lg border border-border bg-surface hover:bg-surface-2 text-xs font-medium text-text">
              + {t("assoc.add")}
            </button>
          </div>
        </div>
      </details>

      {/* Gizlilik — ince ayrım (Madde 5): kayıt-bazlı + alan-bazlı */}
      <details className="rounded-xl border border-border overflow-hidden group">
        <summary className="flex items-center justify-between px-3.5 py-2.5 bg-surface-2 hover:bg-surface-3 transition-colors cursor-pointer list-none">
          <span className="text-xs font-medium text-text">
            {t("private.section")}
            {(confidential || privateFields.length > 0) && (
              <span className="ml-1.5 text-primary">
                · {confidential ? t("private.confidentialShort") : privateFields.length}
              </span>
            )}
          </span>
          <span className="text-[11px] text-text-subtle">isteğe bağlı</span>
        </summary>
        <div className="p-3 space-y-3 bg-surface">
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={confidential}
              onChange={(e) => setConfidential(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-[var(--primary)]"
            />
            <span className="min-w-0">
              <span className="block text-sm text-text">{t("private.confidential")}</span>
              <span className="block text-[11px] text-text-subtle leading-snug">{t("private.confidentialHint")}</span>
            </span>
          </label>

          <div className={confidential ? "opacity-40 pointer-events-none" : ""}>
            <p className="text-[11px] text-text-subtle mb-1.5">{t("private.fieldsHint")}</p>
            <div className="flex flex-wrap gap-1.5">
              {PRIVATE_GROUPS.map((g) => {
                const on = privateFields.includes(g);
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() =>
                      setPrivateFields((cur) => (on ? cur.filter((x) => x !== g) : [...cur, g]))
                    }
                    className={`h-7 px-2.5 rounded-lg text-[11px] border transition-colors ${
                      on
                        ? "border-primary bg-primary-soft text-primary"
                        : "border-border bg-surface-2 text-text-muted hover:text-text"
                    }`}
                  >
                    {t(`private.${g}`)}
                  </button>
                );
              })}
            </div>
          </div>
          <p className="text-[11px] text-text-subtle -mt-1">{t("private.note")}</p>
        </div>
      </details>

      {/* Notlar */}
      <div>
        <label className={label} htmlFor="pf-bio">Hikâyesi</label>
        <textarea
          id="pf-bio"
          className={`${field} h-24 py-2.5 resize-none leading-relaxed`}
          value={form.bio}
          onChange={(e) => set("bio", e.target.value)}
          placeholder="Mesleği, anıları, aile içindeki yeri…"
        />
      </div>

      {/* Bağlantılar — sadece serbest eklemede */}
      {!relation && others.length > 0 && (
        <div className="rounded-xl border border-border overflow-hidden">
          <button
            type="button"
            onClick={() => setShowLinks((s) => !s)}
            className="w-full flex items-center justify-between px-3.5 py-2.5 bg-surface-2 hover:bg-surface-3 transition-colors"
          >
            <span className="text-xs font-medium text-text">
              Aile bağları
              {form.parentIds.length + form.spouseIds.length + form.formerSpouseIds.length > 0 && (
                <span className="ml-1.5 text-primary">
                  · {form.parentIds.length + form.spouseIds.length + form.formerSpouseIds.length} seçili
                </span>
              )}
            </span>
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden
              className={`text-text-muted transition-transform ${showLinks ? "rotate-180" : ""}`}
            >
              <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {showLinks && (
            <div className="p-3 space-y-3.5 bg-surface">
              <LinkPicker
                title="Ebeveynler"
                hint="en fazla 2"
                people={others}
                selected={form.parentIds}
                disabledWhenUnselected={form.parentIds.length >= 2}
                onToggle={(id) => toggleLink("parentIds", id)}
              />

              {form.parentIds.length > 0 && (
                <div className="space-y-2">
                  {form.parentIds.map((pid) => {
                    const par = people.find((x) => x.id === pid);
                    if (!par) return null;
                    const link = form.parentLinks[pid] ?? {};
                    const setLink = (patch: Partial<ParentLink>) =>
                      setForm((f) => ({
                        ...f,
                        parentLinks: { ...f.parentLinks, [pid]: { ...f.parentLinks[pid], ...patch } },
                      }));
                    return (
                      <div key={pid} className="rounded-lg bg-surface-2 p-2.5">
                        <p className="text-[11px] font-medium text-text mb-1.5">
                          {par.firstName} {par.lastName} ile bağ
                        </p>
                        <div className="grid grid-cols-2 gap-1.5">
                          <select
                            aria-label="Bağ türü"
                            value={link.kind ?? "biological"}
                            onChange={(e) =>
                              setLink({ kind: e.target.value as ParentLink["kind"] })
                            }
                            className="h-8 px-2 rounded-lg bg-surface border border-border text-[11px] text-text focus:outline-none focus:border-primary"
                          >
                            <option value="biological">Kan bağı</option>
                            {Object.entries(PARENT_KIND_LABELS).map(([k, l]) => (
                              <option key={k} value={k}>{l}</option>
                            ))}
                          </select>
                          <select
                            aria-label="İlişki durumu"
                            value={link.estranged ?? ""}
                            onChange={(e) =>
                              setLink({
                                estranged: (e.target.value || undefined) as ParentLink["estranged"],
                              })
                            }
                            className="h-8 px-2 rounded-lg bg-surface border border-border text-[11px] text-text focus:outline-none focus:border-primary"
                          >
                            <option value="">İlişki sürüyor</option>
                            {Object.entries(ESTRANGEMENT_LABELS).map(([k, l]) => (
                              <option key={k} value={k}>{l.child}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <LinkPicker
                title="Eş / eşler"
                people={others}
                selected={form.spouseIds}
                onToggle={(id) => toggleLink("spouseIds", id)}
              />
              <LinkPicker
                title="Eski eş / eşler"
                hint="boşanma"
                people={others}
                selected={form.formerSpouseIds}
                onToggle={(id) => toggleLink("formerSpouseIds", id)}
              />
            </div>
          )}
        </div>
      )}

      {errors.form && (
        <p className="text-xs text-danger bg-danger-soft px-3 py-2.5 rounded-xl">{errors.form}</p>
      )}

      <div className="flex gap-2 pt-1">
        <Button type="submit" disabled={saving || uploading || galleryUploading || mediaUploading !== null} full>
          {saving ? "Kaydediliyor…" : personId ? "Güncelle" : "Kaydet"}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          İptal
        </Button>
      </div>
    </form>
  );
}

function LinkPicker({
  title,
  hint,
  people,
  selected,
  disabledWhenUnselected = false,
  onToggle,
}: {
  title: string;
  hint?: string;
  people: Person[];
  selected: string[];
  disabledWhenUnselected?: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <div>
      <p className="text-[11px] font-medium text-text-muted mb-1.5">
        {title}
        {hint && <span className="text-text-subtle font-normal"> ({hint})</span>}
      </p>
      <div className="max-h-36 overflow-y-auto space-y-0.5 pr-0.5">
        {people.map((p) => {
          const isSel = selected.includes(p.id);
          const disabled = !isSel && disabledWhenUnselected;
          return (
            <button
              key={p.id}
              type="button"
              disabled={disabled}
              onClick={() => onToggle(p.id)}
              className={`
                w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors
                ${isSel ? "bg-primary-soft" : "hover:bg-surface-2"}
                ${disabled ? "opacity-35 pointer-events-none" : ""}
              `}
            >
              <Avatar person={p} size="xs" />
              <span className="text-xs text-text truncate flex-1">
                {p.firstName} {p.lastName}
              </span>
              {isSel && (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden className="text-primary shrink-0">
                  <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
