"use client";

import { Button } from "@/components/ui/button";

type PrintButtonProps = {
  label?: string;
};

export function PrintButton({ label = "Print" }: PrintButtonProps) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="print:hidden"
      onClick={() => window.print()}
    >
      {label}
    </Button>
  );
}
