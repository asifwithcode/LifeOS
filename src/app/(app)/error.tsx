"use client";

import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <EmptyState icon={AlertTriangle} title="This page couldn't load" description={error.digest ? `Something went wrong (ref ${error.digest}). Your data is safe.` : "Something went wrong. Your data is safe."}>
        <Button variant="primary" onClick={reset}>
          Try again
        </Button>
        <Button variant="ghost" onClick={() => router.push("/")}>
          Go to dashboard
        </Button>
      </EmptyState>
    </div>
  );
}
