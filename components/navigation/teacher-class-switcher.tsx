"use client";

import { useRouter } from "next/navigation";

type TeacherClassOption = {
  id: string;
  name: string;
  examSession: string;
};

type TeacherClassSwitcherProps = {
  classes: TeacherClassOption[];
};

export function TeacherClassSwitcher({ classes }: TeacherClassSwitcherProps) {
  const router = useRouter();

  if (classes.length === 0) {
    return null;
  }

  return (
    <label className="grid gap-1 text-xs text-muted-foreground">
      <span>Switch class</span>
      <select
        defaultValue=""
        className="h-9 min-w-52 rounded-md border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onChange={(event) => {
          if (event.target.value) {
            router.push(event.target.value);
            event.target.value = "";
          }
        }}
      >
        <option value="">Choose destination...</option>
        <optgroup label="Class dashboards">
          {classes.map((classRecord) => (
            <option
              key={`class-${classRecord.id}`}
              value={`/teacher/classes/${classRecord.id}`}
            >
              {classRecord.name} ({classRecord.examSession})
            </option>
          ))}
        </optgroup>
        <optgroup label="Analytics">
          {classes.map((classRecord) => (
            <option
              key={`analytics-${classRecord.id}`}
              value={`/teacher/classes/${classRecord.id}/analytics`}
            >
              {classRecord.name} analytics
            </option>
          ))}
        </optgroup>
      </select>
    </label>
  );
}
