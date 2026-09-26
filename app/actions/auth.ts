"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { clearAuthCookies } from "@/lib/auth";

/**
 * Ends the MailPilot browser session: deletes auth cookies and sends the
 * user to the login splash. Does not unlink Gmail credentials.
 */
export async function logoutSession(): Promise<never> {
  await clearAuthCookies();
  revalidatePath("/", "layout");
  redirect("/login");
}
