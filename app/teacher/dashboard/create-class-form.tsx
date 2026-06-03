"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { createClassAction, type CreateClassState } from "./actions";

type SubjectOption = {
  id: string;
  name: string;
};

const initialState: CreateClassState = {};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Creating..." : "Create class"}
    </Button>
  );
}

export function CreateClassForm({ subjects }: { subjects: SubjectOption[] }) {
  const [state, formAction] = useActionState(createClassAction, initialState);

  return (
    <form action={formAction} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="name">Class name</Label>
        <Input id="name" name="name" placeholder="IB CS IA 2026" required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="examSession">Exam session</Label>
        <Input id="examSession" name="examSession" placeholder="May 2027" required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="subjectId">Subject</Label>
        <select
          id="subjectId"
          name="subjectId"
          className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          required
        >
          <option value="">Choose a subject</option>
          {subjects.map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.name}
            </option>
          ))}
        </select>
      </div>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <SubmitButton />
    </form>
  );
}

