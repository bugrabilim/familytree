"use client";

import { useEffect, useRef } from "react";

type Handler = () => void;

/**
 * Katmanlı ESC yönetimi.
 *
 * Her katman (modal, panel, arama) kendi `document` dinleyicisini kaydetseydi
 * iki sorun çıkardı:
 *
 *  1. ESC tüm katmanları aynı anda kapatırdı.
 *  2. keydown React'te senkron flush eden bir olay olduğu için, alttaki
 *     katmanın işleyicisi state'i güncelleyince üstteki katman kendi
 *     dinleyicisini olay dağıtımının ortasında kaldırır ve ESC'yi hiç görmez.
 *
 * Bunun yerine tek bir dinleyici tutup yığının en üstündeki işleyiciyi
 * çağırıyoruz — yani ESC yalnızca en üstteki katmanı kapatır.
 */
const stack: Array<{ current: Handler }> = [];
let bound = false;

function onKeyDown(e: KeyboardEvent) {
  if (e.key !== "Escape") return;
  const top = stack[stack.length - 1];
  if (!top) return;
  e.preventDefault();
  e.stopPropagation();
  top.current();
}

export default function useEscapeKey(handler: Handler) {
  const ref = useRef(handler);

  useEffect(() => {
    ref.current = handler;
  });

  useEffect(() => {
    const entry = ref;
    stack.push(entry);
    if (!bound) {
      document.addEventListener("keydown", onKeyDown);
      bound = true;
    }
    return () => {
      const i = stack.lastIndexOf(entry);
      if (i !== -1) stack.splice(i, 1);
    };
  }, []);
}
