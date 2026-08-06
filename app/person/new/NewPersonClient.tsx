"use client";

import { useRouter } from "next/navigation";
import PersonForm from "@/components/PersonForm";
import type { Person } from "@/types/family";

export default function NewPersonClient({ people }: { people: Person[] }) {
  const router = useRouter();
  return (
    <PersonForm
      people={people}
      onClose={() => router.back()}
      onSaved={(person) => router.push(`/person/${person.id}`)}
    />
  );
}
