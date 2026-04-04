"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { signInWithGoogleAction } from "@/app/actions/googleAuth";
import { GOOGLE_CLIENT_ID, type GoogleSession } from "@/lib/google-session";

type GoogleSignInPanelProps = {
  mode: "publish" | "vote";
  onSignedIn: (session: GoogleSession) => void;
};

type GoogleCredentialResponse = {
  credential?: string;
};

type GoogleTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

type GoogleTokenClient = {
  requestAccessToken: (overrides?: {
    prompt?: string;
  }) => void;
};

type GoogleAccountsOauth2 = {
  initTokenClient: (options: {
    callback: (response: GoogleTokenResponse) => void;
    client_id: string;
    error_callback?: () => void;
    scope: string;
  }) => GoogleTokenClient;
};

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: GoogleAccountsOauth2;
      };
    };
  }
}

export function GoogleSignInPanel({
  mode,
  onSignedIn,
}: GoogleSignInPanelProps) {
  const tokenClientRef = useRef<GoogleTokenClient | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCredential = useCallback(
    async (response: GoogleCredentialResponse) => {
      const credential = response.credential;

      if (!credential) {
        setError("Google did not return a sign-in credential.");
        return;
      }

      setIsSubmitting(true);
      setError(null);

      const result = await signInWithGoogleAction(credential);

      setIsSubmitting(false);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      onSignedIn(result.session);
    },
    [onSignedIn]
  );

  const handleTokenResponse = useCallback(
    async (response: GoogleTokenResponse) => {
      const accessToken = response.access_token;

      if (response.error || !accessToken) {
        setError(
          response.error_description ??
            (response.error === "access_denied"
              ? "Google sign-in was cancelled."
              : "Google did not return a sign-in credential.")
        );
        setIsSubmitting(false);
        return;
      }

      await handleCredential({ credential: accessToken });
    },
    [handleCredential]
  );

  useEffect(() => {
    if (window.google?.accounts.oauth2) {
      setScriptReady(true);
      return;
    }

    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src="https://accounts.google.com/gsi/client"]'
    );

    if (existingScript) {
      existingScript.addEventListener("load", handleLoad);
      existingScript.addEventListener("error", handleError);

      return () => {
        existingScript.removeEventListener("load", handleLoad);
        existingScript.removeEventListener("error", handleError);
      };
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.addEventListener("load", handleLoad);
    script.addEventListener("error", handleError);
    document.head.appendChild(script);

    return () => {
      script.removeEventListener("load", handleLoad);
      script.removeEventListener("error", handleError);
    };

    function handleLoad() {
      setScriptReady(true);
    }

    function handleError() {
      setError("Google sign-in could not be loaded.");
    }
  }, []);

  useEffect(() => {
    if (!scriptReady || !window.google?.accounts.oauth2) {
      return;
    }

    tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
      callback: handleTokenResponse,
      client_id: GOOGLE_CLIENT_ID,
      error_callback: () => {
        setError("Google sign-in was cancelled.");
        setIsSubmitting(false);
      },
      scope: "openid email profile",
    });
  }, [handleTokenResponse, scriptReady]);

  const handleSignInClick = useCallback(() => {
    if (!scriptReady || isSubmitting) {
      return;
    }

    const tokenClient = tokenClientRef.current;

    if (!tokenClient) {
      setError("Google sign-in could not be loaded.");
      return;
    }

    setError(null);
    setIsSubmitting(true);
    tokenClient.requestAccessToken({ prompt: "select_account" });
  }, [isSubmitting, scriptReady]);

  return (
    <div className="playlist-workspace__auth-card">
      <div className="playlist-workspace__auth-button-container">
        <button
          type="button"
          className="playlist-workspace__google-shell"
          onClick={handleSignInClick}
          disabled={!scriptReady || isSubmitting}
        >
          <span className="playlist-workspace__google-shell-orbit playlist-workspace__google-shell-orbit--blue" />
          <span className="playlist-workspace__google-shell-orbit playlist-workspace__google-shell-orbit--red" />
          <span className="playlist-workspace__google-shell-orbit playlist-workspace__google-shell-orbit--yellow" />
          <span className="playlist-workspace__google-shell-orbit playlist-workspace__google-shell-orbit--green" />
          <span className="playlist-workspace__google-shell-logo">
            <GoogleLogo />
          </span>
          <span className="playlist-workspace__google-shell-copy">
            <strong>
              {isSubmitting ? "Signing You In..." : "Continue With Google"}
            </strong>
            <span>
              {mode === "publish"
                ? "Use your Google account to publish this playlist."
                : "Use your Google account to enter the vote room."}
            </span>
          </span>
        </button>
      </div>

      {!scriptReady ? (
        <p className="playlist-workspace__auth-status">
          Loading Google sign-in...
        </p>
      ) : null}
      {isSubmitting ? (
        <p className="playlist-workspace__auth-status">Signing you in...</p>
      ) : null}

      {error ? <p className="playlist-workspace__error">{error}</p> : null}
    </div>
  );
}

function GoogleLogo() {
  return (
    <svg
      className="google-logo"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      width="45"
      height="45"
      style={{
        display: "block",
        flex: "0 0 auto",
        height: "45px",
        minHeight: "45px",
        minWidth: "45px",
        width: "45px",
      }}
    >
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}
