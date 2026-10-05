import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/dal";
import { registrationOpen, userCount } from "@/server/services/users";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage(props: PageProps<"/login">) {
  if (await getCurrentUser()) redirect("/");
  if ((await userCount()) === 0) redirect("/register");
  const { next } = await props.searchParams;
  return <AuthForm mode="login" next={typeof next === "string" ? next : undefined} registrationOpen={await registrationOpen()} />;
}
