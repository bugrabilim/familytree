import type { Person } from "@/types/family";

const SIZES = {
  xs: "w-7 h-7 text-[10px]",
  sm: "w-9 h-9 text-xs",
  md: "w-12 h-12 text-sm",
  lg: "w-16 h-16 text-lg",
  xl: "w-24 h-24 text-2xl",
} as const;

export type AvatarSize = keyof typeof SIZES;

export function genderTone(gender: Person["gender"]) {
  if (gender === "female") return { bg: "bg-female-soft", text: "text-female", ring: "ring-female/30", border: "border-female/40" };
  if (gender === "male") return { bg: "bg-male-soft", text: "text-male", ring: "ring-male/30", border: "border-male/40" };
  return { bg: "bg-neutral-soft", text: "text-neutral", ring: "ring-neutral/25", border: "border-neutral/30" };
}

export function initials(person: Pick<Person, "firstName" | "lastName">) {
  const a = person.firstName?.trim()?.[0] ?? "";
  const b = person.lastName?.trim()?.[0] ?? "";
  return `${a}${b}`.toLocaleUpperCase("tr") || "?";
}

interface Props {
  person: Pick<Person, "firstName" | "lastName" | "gender" | "photo">;
  size?: AvatarSize;
  className?: string;
  ring?: boolean;
}

export default function Avatar({ person, size = "md", className = "", ring = false }: Props) {
  const tone = genderTone(person.gender);
  const ringCls = ring ? `ring-2 ${tone.ring}` : "";

  if (person.photo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={person.photo}
        alt={`${person.firstName} ${person.lastName}`}
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
