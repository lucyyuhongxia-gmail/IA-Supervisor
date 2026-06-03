"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { joinClassAction, type JoinClassState } from "./actions";

const initialState: JoinClassState = {};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} className="h-9">
      {pending ? "Joining..." : "Join class"}
    </Button>
  );
}

export function JoinClassForm() {
  const [state, formAction] = useActionState(joinClassAction, initialState);

  return (
    <form action={formAction} className="grid flex-1 gap-2 sm:grid-cols-[minmax(220px,1fr)_auto] sm:items-end">
      <div className="grid gap-1">
        <Label htmlFor="inviteCode" className="text-xs">
          Invite code
        </Label>
        <Input
          id="inviteCode"
          name="inviteCode"
          placeholder="ABC123"
          className="h-9 uppercase"
          required
        />
      </div>
      <SubmitButton />
      {state.error ? (
        <p className="text-sm text-destructive sm:col-span-2">{state.error}</p>
      ) : null}
      {state.success ? (
        <p className="text-sm text-emerald-700 sm:col-span-2">{state.success}</p>
      ) : null}
    </form>
  );
}
