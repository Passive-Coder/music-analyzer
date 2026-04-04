import "server-only";

import { cookies } from "next/headers";

import { GOOGLE_CLIENT_ID, type GoogleSession } from "@/lib/google-session";

const GOOGLE_ID_TOKEN_COOKIE_NAME = "octave_google_id_token";
const GOOGLE_ISSUERS = new Set([
  "accounts.google.com",
  "https://accounts.google.com",
]);

type GoogleTokenInfoResponse = {
  aud?: string;
  email?: string;
  email_verified?: string;
  exp?: string;
  iss?: string;
  name?: string;
  picture?: string;
};

type GoogleUserInfoResponse = {
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

export async function readGoogleSession() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(GOOGLE_ID_TOKEN_COOKIE_NAME)?.value;

  if (!sessionToken) {
    return null;
  }

  try {
    return await verifyGoogleSessionToken(sessionToken);
  } catch {
    cookieStore.delete(GOOGLE_ID_TOKEN_COOKIE_NAME);
    return null;
  }
}

export async function requireGoogleSession() {
  const session = await readGoogleSession();

  if (!session) {
    throw new Error("Sign in with Google to continue.");
  }

  return session;
}

export async function persistGoogleSession(idToken: string) {
  const session = await verifyGoogleSessionToken(idToken);
  const cookieStore = await cookies();

  cookieStore.set(GOOGLE_ID_TOKEN_COOKIE_NAME, idToken, {
    httpOnly: true,
    maxAge: 60 * 60,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return session;
}

export async function clearGoogleSession() {
  const cookieStore = await cookies();
  cookieStore.delete(GOOGLE_ID_TOKEN_COOKIE_NAME);
}

async function verifyGoogleSessionToken(sessionToken: string): Promise<GoogleSession> {
  if (sessionToken.split(".").length === 3) {
    return verifyGoogleIdToken(sessionToken);
  }

  return verifyGoogleAccessToken(sessionToken);
}

async function verifyGoogleIdToken(idToken: string): Promise<GoogleSession> {
  const response = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(
      idToken
    )}`,
    {
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
    }
  );

  if (!response.ok) {
    throw new Error("Google could not verify this sign-in.");
  }

  const payload = (await response.json()) as GoogleTokenInfoResponse;
  const expiresAt = Number(payload.exp ?? "0");

  if (payload.aud !== GOOGLE_CLIENT_ID) {
    throw new Error("That Google sign-in was issued for a different app.");
  }

  if (!payload.iss || !GOOGLE_ISSUERS.has(payload.iss)) {
    throw new Error("That Google sign-in issuer is invalid.");
  }

  if (payload.email_verified !== "true" || !payload.email) {
    throw new Error("Your Google email address could not be verified.");
  }

  if (!Number.isFinite(expiresAt) || expiresAt * 1000 <= Date.now()) {
    throw new Error("That Google sign-in has expired.");
  }

  return {
    email: payload.email,
    name: payload.name ?? null,
    picture: payload.picture ?? null,
  };
}

async function verifyGoogleAccessToken(
  accessToken: string
): Promise<GoogleSession> {
  const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error("Google could not verify this sign-in.");
  }

  const payload = (await response.json()) as GoogleUserInfoResponse;

  if (!payload.email_verified || !payload.email) {
    throw new Error("Your Google email address could not be verified.");
  }

  return {
    email: payload.email,
    name: payload.name ?? null,
    picture: payload.picture ?? null,
  };
}
