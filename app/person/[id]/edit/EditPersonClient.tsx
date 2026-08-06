"use client";

import { useRouter } from "next/navigation";
import PersonForm from "@/components/PersonForm";
import type { Person } from "@/types/family";

interface Props {
  people: Person[];
  person: Person;
}

export default function EditPersonClient({ people, person }: Props) {
  const router = useRouter();
  return (
    <PersonForm
      people={people}
      initial={person}
      personId={person.id}
      onClose={() => router.back()}
      onSaved={() => router.push(`/person/${person.id}`)}
    />
  );
}
