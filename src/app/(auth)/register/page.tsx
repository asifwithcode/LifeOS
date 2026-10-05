import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/dal";
import { registrationOpen } from "@/server/services/users";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Create account" };

export default async function RegisterPage() {
  if (await getCurrentUser()) redirect("/");
  if (!(await registrationOpen())) redirect("/login");
  return <AuthForm mode="register" registrationOpen />;
}
