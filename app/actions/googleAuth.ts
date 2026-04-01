"use server";

import {
  clearGoogleSession,
  persistGoogleSession,
  readGoogleSession,
} from "@/lib/google-auth";

export async function getGoogleSessionAction() {
  try {
    const session = await readGoogleSession();
    return { ok: true as const, session };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Checking the Google session failed.",
      ok: false as const,
      session: null,
    };
  }
}

export async function signInWithGoogleAction(credential: string) {
  try {
    const session = await persistGoogleSession(credential);
    return { ok: true as const, session };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Signing in with Google failed.",
      ok: false as const,
    };
  }
}

export async function signOutOfGoogleAction() {
  try {
    await clearGoogleSession();
    return { ok: true as const };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Signing out of Google failed.",
      ok: false as const,
    };
  }
}
