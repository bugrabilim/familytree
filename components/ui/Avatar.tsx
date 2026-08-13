"use client";

import { useState } from "react";
import type { Gender, Person } from "@/types/family";
import { generateAvatar } from "@/lib/avatar";

const SIZES = {
  xs: "w-7 h-7 text-[10px]",
  sm: "w-9 h-9 text-xs",
  md: "w-12 h-12 text-sm",
  lg: "w-16 h-16 text-lg",
  xl: "w-24 h-24 text-2xl",
} as const;

export type AvatarSize = keyof typeof SIZES;

export function genderTone(gender: Gender) {
  if (gender === "female")
    return { bg: "bg-female-soft", text: "text-female", ring: "ring-female/30", border: "border-female/40", css: "var(--female)" };
  if (gender === "male")
    return { bg: "bg-male-soft", text: "text-male", ring: "ring-male/30", border: "border-male/40", css: "var(--male)" };
  if (gender === "other")
    return { bg: "bg-other-soft", text: "text-other", ring: "ring-other/30", border: "border-other/40", css: "var(--other)" };
  return { bg: "bg-neutral-soft", text: "text-neutral", ring: "ring-neutral/25", border: "border-neutral/30", css: "var(--neutral)" };
}

export function initials(person: Pick<Person, "firstName" | "lastName">) {
  const a = person.firstName?.trim()?.[0] ?? "";
  const b = person.lastName?.trim()?.[0] ?? "";
  return `${a}${b}`.toLocaleUpperCase("tr") || "?";
}

interface Props {
  person: Pick<Person, "firstName" | "lastName" | "gender" | "photo"> &
    Partial<Pick<Person, "id" | "birthDate">>;
  size?: AvatarSize;
  className?: string;
  ring?: boolean;
}

export default function Avatar({ person, size = "md", className = "", ring = false }: Props) {
  // Fotoğraf yüklenemezse üretilmiş portreye düş — kırık resim simgesi gösterme
  const [failed, setFailed] = useState(false);
  const tone = genderTone(person.gender);
  const ringCls = ring ? `ring-2 ${tone.ring}` : "";

  /* Fotoğraf yoksa avatar HER ZAMAN otomatik gelsin: kimlikten (yoksa ad, o da
     yoksa sabit tohum) deterministik portre üretilir. Böylece hiçbir kart boş
     ya da baş-harf kutusu olarak kalmaz. */
  const seed =
    person.id ?? (`${person.firstName ?? ""} ${person.lastName ?? ""}`.trim() || "anon");
  const uretilmis = generateAvatar(
    seed,
    person.gender,
    person.birthDate ? Number(person.birthDate.slice(0, 4)) : undefined
  );

  const kaynak = (!failed && person.photo) || uretilmis;

  if (kaynak) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={kaynak}
        alt={`${person.firstName} ${person.lastName}`}
        onError={() => setFailed(true)}
        className={`${SIZES[size]} rounded-full object-cover shrink-0 bg-surface-2 ${ringCls} ${className}`}
      />
    );
  }

  return (
    <div
      className={`${SIZES[size]} ${tone.bg} ${tone.text} rounded-full shrink-0 grid place-items-center font-semibold tracking-tight select-none ${ringCls} ${className}`}
      aria-label={`${person.firstName} ${person.lastName}`}
    >
      {initials(person)}
    </div>
  );
}
