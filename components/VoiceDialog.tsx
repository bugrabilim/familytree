"use client";

import { useCallback, useMemo, useState } from "react";
import type { Person } from "@/types/family";
import type { VoiceFact, VoicePerson } from "@/lib/voice";
import { applyFacts } from "@/lib/voice";
import { eligiblePrompts, promptKey, subjectFromPerson } from "@/lib/prompts";
import { fullName } from "@/lib/name";
import { useT, useLang } from "@/lib/i18n";
import Modal from "./ui/Modal";
import Button from "./ui/Button";
import AudioRecorder from "./AudioRecorder";
import PersonPicker, { pickerSelectCls } from "./PersonPicker";

/**
 * Sesli Şecere — rehberli kayıt → deşifre → ONAY → kayıt.
 *
 * Akışın omurgası "onay" adımı. Deşifre metni hemen kaydedilebilir (anlatının
 * kendisi zaten değerli ve tartışmasız kişinin ağzından), ama modelin
 * çıkardığı bilgiler tek tek işaretlenmeden ağaca girmez. Her adayın yanında
 * ALINDIĞI CÜMLE duruyor: kullanıcı "bunu gerçekten söyledi mi" sorusunu
 * modele değil, metne bakarak yanıtlıyor.
 */

type Step = "kayit" | "onay";

interface PendingFact extends VoiceFact {
  /** Kişide o an duran değer — çelişki varsa gösterilir. */
  current?: string;
}

interface VoiceResponse {
  transcript?: string;
  people?: VoicePerson[];
  facts?: PendingFact[];
  error?: string;
}

export default function VoiceDialog({
  people,
  onClose,
  onSaved,
}: {
  people: Person[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const { lang } = useLang();

  const [subjectId, setSubjectId] = useState("");
  const [promptId, setPromptId] = useState("");
  const [step, setStep] = useState<Step>("kayit");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [audioUrl, setAudioUrl] = useState<string>();
  const [transcript, setTranscript] = useState("");
  const [found, setFound] = useState<VoicePerson[]>([]);
  const [facts, setFacts] = useState<PendingFact[]>([]);
  const [checked, setChecked] = useState<Set<number>>(new Set());

  const subject = useMemo(
    () => people.find((p) => p.id === subjectId),
    [people, subjectId]
  );

  /*
   * Sorular `lib/prompts.ts`ten. Vefat etmiş kişiye "kendisi" sesiyle soru
   * sorulamayacağı (ona soru soramayız, onu TANIYANA sorarız) `isEligible`
   * içinde çözülmüş durumda.
   */
  const prompts = useMemo(() => {
    if (!subject) return [];
    return eligiblePrompts(subjectFromPerson(subject, people), { includeAnswered: true });
  }, [subject, people]);

  const question = useMemo(() => {
    const p = prompts.find((x) => x.id === promptId) ?? prompts[0];
    return p ? t(promptKey(p.id), { name: subject ? subject.firstName : "" }) : "";
  }, [prompts, promptId, t, subject]);

  const gonder = useCallback(
    async (file: File) => {
      setBusy(true);
      setError("");
      try {
        const fd = new FormData();
        fd.append("audio", file);
        fd.append("question", question);
        fd.append("subjectId", subjectId);
        fd.append("lang", lang);
        const res = await fetch("/api/ai/voice", { method: "POST", body: fd });
        const data = (await res.json()) as VoiceResponse;
        if (!res.ok) throw new Error(data.error ?? t("voice.failed"));
        setTranscript(data.transcript ?? "");
        setFound(data.people ?? []);
        const f = data.facts ?? [];
        setFacts(f);
        // Adaylar varsayılan olarak İŞARETLİ DEĞİL. Onay adımının anlamı,
        // kullanıcının tek tek bakması; hepsini önceden işaretlemek onayı
        // bir "kabul et" düğmesine indirger.
        setChecked(new Set());
        setStep("onay");
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [question, subjectId, lang, t]
  );

  const kaydet = useCallback(async () => {
    if (!subject) return;
    setBusy(true);
    setError("");
    try {
      const secili = facts.filter((_, i) => checked.has(i));
      const guncelleme: Record<string, unknown> = {
        ...applyFacts(subject, secili),
      };
      // Anlatının kendisi bir anı olarak kaydediliyor — ses kaydıyla birlikte.
      const memories = [
        ...(subject.memories ?? []),
        {
          id: `v${Date.now().toString(36)}`,
          prompt: promptId || undefined,
          text: transcript,
          ...(audioUrl ? { audio: audioUrl } : {}),
        },
      ];
      guncelleme.memories = memories;

      const res = await fetch(`/api/family/person/${subject.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(guncelleme),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? t("voice.failed"));
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }, [subject, facts, checked, transcript, audioUrl, promptId, onSaved, onClose, t]);

  const toggle = (i: number) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <Modal title={t("voice.title")} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-xs text-text-subtle leading-snug">{t("voice.subtitle")}</p>

        {step === "kayit" ? (
          <>
            <label className="block space-y-1">
              <span className="text-[11px] text-text-subtle">{t("voice.subject")}</span>
              <PersonPicker people={people} value={subjectId} onChange={(id) => {
                setSubjectId(id);
                setPromptId("");
              }} />
            </label>

            {subject && prompts.length > 0 && (
              <label className="block space-y-1">
                <span className="text-[11px] text-text-subtle">{t("voice.question")}</span>
                <select
                  value={promptId || prompts[0].id}
                  onChange={(e) => setPromptId(e.target.value)}
                  className={pickerSelectCls}
                  aria-label={t("voice.question")}
                >
                  {prompts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {t(promptKey(p.id), { name: subject.firstName })}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {subject && (
              <div className="p-3 rounded-xl bg-surface-2 border border-border space-y-2">
                <p className="text-sm text-text leading-snug">{question}</p>
                <p className="text-[11px] text-text-subtle leading-snug">{t("voice.recordHint")}</p>
                <AudioRecorder
                  onUploaded={setAudioUrl}
                  onFile={(f) => void gonder(f)}
                  disabled={busy}
                />
                {busy && <p className="text-xs text-text-subtle">{t("voice.transcribing")}</p>}
              </div>
            )}
          </>
        ) : (
          <>
            <section className="space-y-1">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-text-subtle">
                {t("voice.transcript")}
              </h3>
              {/*
                Deşifre DÜZENLENEBİLİR: model bir adı yanlış duyabilir ve
                anlatı ailenin kalıcı kaydı olacak. Salt okunur bırakmak,
                düzeltilebilir bir hatayı kalıcılaştırmak olurdu.
              */}
              <textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                rows={6}
                className="w-full p-2.5 rounded-xl bg-surface-2 border border-border text-sm text-text focus:outline-none focus:border-primary"
                aria-label={t("voice.transcript")}
              />
            </section>

            {facts.length > 0 && (
              <section className="space-y-1.5">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-text-subtle">
                  {t("voice.facts")}
                </h3>
                <p className="text-[11px] text-text-subtle leading-snug">{t("voice.factsHint")}</p>
                <ul className="space-y-1.5">
                  {facts.map((f, i) => (
                    <li key={`${f.personRef}-${f.field}-${i}`}>
                      <label className="flex items-start gap-2.5 p-2.5 rounded-xl bg-surface-2 border border-border cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked.has(i)}
                          onChange={() => toggle(i)}
                          className="mt-0.5 shrink-0"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm text-text">
                            {t(`voice.field.${f.field}`)}: <strong>{f.value}</strong>
                          </span>
                          {f.current && (
                            <span className="block text-[11px] text-amber-700 dark:text-amber-300 leading-snug">
                              {t("voice.overwrites", { old: f.current })}
                            </span>
                          )}
                          {/* Alındığı cümle — "gerçekten söyledi mi" sorusunun yanıtı. */}
                          <span className="block text-[11px] text-text-subtle italic leading-snug">
                            “{f.quote}”
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {found.length > 0 && (
              <section className="space-y-1">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-text-subtle">
                  {t("voice.mentioned")}
                </h3>
                {/*
                  Anlatıda geçen kişiler yalnız BİLGİ olarak listeleniyor;
                  buradan kişi eklenmiyor. Yapısal bağ (ebeveyn/eş) ağacın
                  şeklini değiştirir ve tek bir yanlış bağ tüm akrabalık
                  hesabını bozar — o karar kullanıcının, ağacın üstünde.
                */}
                <p className="text-[11px] text-text-subtle leading-snug">{t("voice.mentionedHint")}</p>
                <ul className="text-sm text-text space-y-0.5">
                  {found.map((p) => (
                    <li key={p.ref}>
                      • {p.firstName} {p.lastName ?? ""}
                      {p.relation ? <span className="text-text-subtle"> — {p.relation}</span> : null}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={kaydet} disabled={busy || !transcript.trim()}>
                {t("voice.save")}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setStep("kayit")} disabled={busy}>
                {t("voice.again")}
              </Button>
              {subject && (
                <span className="self-center text-[11px] text-text-subtle">
                  {t("voice.savesTo", { name: fullName(subject) })}
                </span>
              )}
            </div>
          </>
        )}

        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    </Modal>
  );
}
