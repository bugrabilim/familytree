"use client";

import { useEffect } from "react";

/**
 * Bir öğenin DIŞINA yapılan tıklamayı yakalar (menü/açılır kapatmak için).
 *
 * `fixed inset-0` kaplama div'lerine göre daha sağlamdır: kaplamanın z-index'i
 * başka arayüz (ör. z-45 başlık) altında kalıp tıklamayı yutabiliyordu. Bu
 * kanca doğrudan `document` üzerinde `pointerdown` dinler ve hedef `ref`
 * içinde değilse `onOutside` çağırır. Yalnız `active` iken bağlanır.
 */
export default function useClickOutside<T extends HTMLElement>(
  ref: React.RefObject<T | null>,
  onOutside: () => void,
  active = true
): void {
  useEffect(() => {
    if (!active) return;
    const onPointer = (e: PointerEvent) => {
      const el = ref.current;
      if (el && e.target instanceof Node && !el.contains(e.target)) onOutside();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOutside();
    };
    // `pointerdown` — tıklama tamamlanmadan kapatır, mobil dokunuşta da çalışır.
    document.addEventListener("pointerdown", onPointer, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [ref, onOutside, active]);
}
