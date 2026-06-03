"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { registerAction } from "./actions";

export function RegisterForm() {
  const router = useRouter();
  const [role, setRole] = useState<"student" | "teacher">("student");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsPending(true);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    const result = await registerAction(formData);

    if (result.error || !result.success) {
      setError(result.error ?? "Could not create the account.");
      setIsPending(false);
      return;
    }

    const signInResult = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setIsPending(false);

    if (signInResult?.error) {
      router.push("/login");
      return;
    }

    router.push(result.redirectPath ?? "/student/dashboard");
    router.refresh();
  }

  return (
    <form className="grid gap-5" onSubmit={onSubmit}>
      <div className="grid gap-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" autoComplete="name" required />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="confirmPassword">Confirm password</Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="role">Account type</Label>
        <select
          id="role"
          name="role"
          value={role}
          onChange={(event) => setRole(event.target.value as "student" | "teacher")}
          className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="student">Student</option>
          <option value="teacher">Teacher</option>
        </select>
      </div>

      {role === "student" ? (
        <div className="grid gap-2">
          <Label htmlFor="inviteCode">Class invite code</Label>
          <Input
            id="inviteCode"
            name="inviteCode"
            autoComplete="off"
            placeholder="Provided by your teacher"
            required
          />
        </div>
      ) : (
        <div className="grid gap-2">
          <Label htmlFor="teacherSignupCode">Teacher signup code</Label>
          <Input
            id="teacherSignupCode"
            name="teacherSignupCode"
            type="password"
            autoComplete="off"
            placeholder="Provided by the platform admin"
            required
          />
        </div>
      )}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Button type="submit" disabled={isPending}>
        {isPending ? "Creating account..." : "Create account"}
      </Button>
    </form>
  );
}
