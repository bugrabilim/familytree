"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import Link from "next/link";
import type { Person } from "@/types/family";

export type PersonNodeData = Person & { record: Person };

export default function PersonNode({ data }: NodeProps) {
  const person = data as unknown as Person;
  const initials =
    `${person.firstName?.[0] ?? ""}${person.lastName?.[0] ?? ""}`.toUpperCase();

  const birthYear = person.birthDate?.slice(0, 4);
  const deathYear = person.deathDate?.slice(0, 4);
  const years =
    birthYear ? (deathYear ? `${birthYear} – ${deathYear}` : `d. ${birthYear}`) : "";

  return (
    <Link href={`/person/${person.id}`}>
      <div
        className={`
          bg-white rounded-xl shadow-md border-2 p-3 w-44 cursor-pointer
          hover:shadow-lg hover:scale-105 transition-all duration-150
          ${person.gender === "female" ? "border-pink-200" : person.gender === "male" ? "border-blue-200" : "border-gray-200"}
        `}
      >
        <Handle type="target" position={Position.Top} className="!bg-green-500" />
        <Handle type="source" position={Position.Bottom} className="!bg-green-500" />

        <div className="flex items-center gap-2.5">
          {person.photo ? (
            <img
              src={person.photo}
              alt={`${person.firstName} ${person.lastName}`}
              className="w-11 h-11 rounded-full object-cover flex-shrink-0 border border-gray-200"
            />
          ) : (
            <div
              className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold
                ${person.gender === "female" ? "bg-pink-100 text-pink-700" : person.gender === "male" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"}
              `}
            >
              {initials || "?"}
            </div>
          )}
          <div className="min-w-0">
            <p className="font-semibold text-sm text-gray-800 truncate">
              {person.firstName}
            </p>
            <p className="text-xs text-gray-500 truncate">{person.lastName}</p>
            {years && <p className="text-xs text-gray-400 mt-0.5">{years}</p>}
          </div>
        </div>
      </div>
    </Link>
  );
}
