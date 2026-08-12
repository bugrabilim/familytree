"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { uploadAudio } from "@/lib/actions";
import { useT } from "@/lib/i18n";

interface Props {
  /** Yükleme bittiğinde Cloudinary URL'i döner. */
  onUploaded: (url: string) => void;
  disabled?: boolean;
}

/**
 * Sesli anı kaydedici — tarayıcı MediaRecorder'ı ile kayıt, ardından
 * Cloudinary'ye (ses = "video" kaynağı) yükleme. Mikrofon izni yoksa dosya
 * seçme yedeği sunar. Kayıt Blob'u webm/ogg olur; `<audio>` bunları oynatır.
 */
export default function AudioRecorder({ onUploaded, disabled }: Props) {
  const t = useT();
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string>();
  const [seconds, setSeconds] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => stopTimer, []);

  const doUpload = useCallback(
    async (file: File) => {
      setUploading(true);
      setError(undefined);
      try {
        const url = await uploadAudio(file);
        onUploaded(url);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setUploading(false);
      }
    },
    [onUploaded]
  );

  const start = useCallback(async () => {
    setError(undefined);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError(t("memory.micUnsupported"));
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((tr) => tr.stop());
        const type = rec.mimeType || "audio/webm";
        const ext = type.includes("ogg") ? "ogg" : "webm";
        const blob = new Blob(chunksRef.current, { type });
        void doUpload(new File([blob], `ani-${Date.now()}.${ext}`, { type }));
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      setError(t("memory.micDenied"));
    }
  }, [doUpload, t]);

  const stop = useCallback(() => {
    stopTimer();
    setRecording(false);
    recorderRef.current?.stop();
  }, []);

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!recording ? (
        <button
          type="button"
          onClick={start}
          disabled={disabled || uploading}
          className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-border text-xs text-text hover:bg-surface-2 disabled:opacity-50 transition-colors"
        >
          <span className="w-2 h-2 rounded-full bg-danger" />
          {uploading ? t("memory.uploading") : t("memory.record")}
        </button>
      ) : (
        <button
          type="button"
          onClick={stop}
          className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-danger-soft border border-danger/30 text-xs text-danger animate-pulse"
        >
          <span className="w-2 h-2 rounded-sm bg-danger" />
          {t("memory.stop")} · {fmt(seconds)}
        </button>
      )}

      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={disabled || uploading || recording}
        className="h-8 px-2.5 rounded-lg border border-border text-xs text-text-muted hover:bg-surface-2 disabled:opacity-50 transition-colors"
      >
        {t("memory.uploadFile")}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void doUpload(f);
          e.target.value = "";
        }}
      />

      {error && <span className="text-[11px] text-danger">{error}</span>}
    </div>
  );
}
