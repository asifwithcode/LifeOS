import Link from "next/link";
import { SearchX } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <EmptyState icon={SearchX} title="Not found" description="This item doesn't exist, was deleted, or belongs to someone else.">
        <Link href="/search" className={buttonVariants({ variant: "secondary" })}>
          Search
        </Link>
        <Link href="/" className={buttonVariants({ variant: "primary" })}>
          Dashboard
        </Link>
      </EmptyState>
    </div>
  );
}
