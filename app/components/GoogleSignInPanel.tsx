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
  const buttonRef = useRef<HTMLDivElement>(null);
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
    if (!scriptReady || !buttonRef.current || !window.google?.accounts.id) {
      return;
    }

    window.google.accounts.id.initialize({
      callback: handleCredential,
      client_id: GOOGLE_CLIENT_ID,
    });

    buttonRef.current.innerHTML = "";
    window.google.accounts.id.renderButton(buttonRef.current, {
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
      <div className="playlist-workspace__auth-button-row">
        <div
          ref={buttonRef}
          className="playlist-workspace__google-button"
          aria-live="polite"
        />
        {!scriptReady ? (
          <p className="playlist-workspace__auth-status">
            Loading Google sign-in...
          </p>
        ) : null}
        {isSubmitting ? (
          <p className="playlist-workspace__auth-status">
            Signing you in...
          </p>
        ) : null}
      </div>
      {error ? <p className="playlist-workspace__error">{error}</p> : null}
    </div>
  );
}
