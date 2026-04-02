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

type GoogleAccountsId = {
  initialize: (options: {
    callback: (response: GoogleCredentialResponse) => void;
    client_id: string;
  }) => void;
  renderButton: (
    element: HTMLElement,
    options: {
      shape?: "pill" | "rectangular";
      size?: "large" | "medium" | "small";
      text?: "signin_with" | "continue_with";
      theme?: "outline" | "filled_blue" | "filled_black";
      width?: number;
    }
  ) => void;
};

declare global {
  interface Window {
    google?: {
      accounts: {
        id: GoogleAccountsId;
      };
    };
  }
}

export function GoogleSignInPanel({
  mode,
  onSignedIn,
}: GoogleSignInPanelProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    if (window.google?.accounts.id) {
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
    if (!scriptReady || !overlayRef.current || !window.google?.accounts.id) {
      return;
    }

    window.google.accounts.id.initialize({
      callback: handleCredential,
      client_id: GOOGLE_CLIENT_ID,
    });

    overlayRef.current.innerHTML = "";
    window.google.accounts.id.renderButton(overlayRef.current, {
      shape: "pill",
      size: "large",
      text: "signin_with",
      theme: "outline",
      width: 320,
    });
  }, [handleCredential, scriptReady]);

  return (
    <div className="playlist-workspace__auth-card">
      <p className="playlist-workspace__songs-eyebrow">Google Sign-In</p>
      <h3 className="playlist-workspace__songs-title">
        {mode === "publish" ? "Sign In To Publish Playlists" : "Sign In To Vote"}
      </h3>
      <p className="playlist-workspace__copy">
        {mode === "publish"
          ? "Sign in with Google before loading, editing, and publishing a playlist."
          : "Sign in with Google before opening the song voting screen."}
      </p>
      <div className="playlist-workspace__auth-button-container">
        <div
          ref={overlayRef}
          className="google-signin-button-host"
        />
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
      width="20"
      height="20"
      style={{
        display: "block",
        flex: "0 0 auto",
        height: "20px",
        minHeight: "20px",
        minWidth: "20px",
        width: "20px",
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
