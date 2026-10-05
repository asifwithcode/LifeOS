"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { appearanceInput, lifeAreaInput, profileInput } from "@/lib/validation";
import { invalidateAllSessions } from "@/server/auth/session";
import {
  changePassword,
  createLifeArea,
  setLifeAreaArchived,
  updateAppearance,
  updateDashboardWidgets,
  updateLifeArea,
  updateProfile,
} from "@/server/services/users";
import { formToObject, run } from "./_run";
import type { ActionResult } from "./result";

export async function updateProfileAction(_prev: ActionResult | null, fd: FormData) {
  return run(async ({ user }) => {
    await updateProfile(user.id, profileInput.parse(formToObject(fd)));
    return { ok: true as const, message: "Profile saved" };
  });
}

export async function updateAppearanceAction(theme: string, accent: string) {
  return run(async ({ user }) => {
    const input = appearanceInput.parse({ theme, accent });
    await updateAppearance(user.id, input);
    const store = await cookies();
    const opts = { path: "/", sameSite: "lax" as const, maxAge: 60 * 60 * 24 * 365 };
    store.set("lifeos_theme", input.theme, opts);
    store.set("lifeos_accent", input.accent, opts);
  });
}

export async function updateWidgetsAction(widgets: { id: string; visible: boolean }[]) {
  return run(({ user }) =>
    updateDashboardWidgets(user.id, z.array(z.object({ id: z.string().max(40), visible: z.boolean() })).max(30).parse(widgets)),
  );
}

export async function saveLifeAreaAction(_prev: ActionResult | null, fd: FormData) {
  return run(async ({ user }) => {
    const raw = formToObject(fd);
    const input = lifeAreaInput.parse(raw);
    if (raw.id) await updateLifeArea(user.id, z.uuid().parse(raw.id), input);
    else await createLifeArea(user.id, input);
    return { ok: true as const, message: "Saved" };
  });
}

export async function archiveLifeAreaAction(id: string, archived: boolean) {
  return run(({ user }) => setLifeAreaArchived(user.id, z.uuid().parse(id), archived));
}

export async function changePasswordAction(_prev: ActionResult | null, fd: FormData) {
  return run(async ({ user }) => {
    const data = z
      .object({ current: z.string().min(1, "Required"), next: z.string().min(10, "Use at least 10 characters").max(200) })
      .parse(formToObject(fd));
    await changePassword(user.id, data.current, data.next);
    return { ok: true as const, message: "Password changed" };
  });
}

export async function signOutEverywhereAction() {
  return run(({ user }) => invalidateAllSessions(user.id));
}
