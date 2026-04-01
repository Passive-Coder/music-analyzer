"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageBackground } from "@/app/components/PageBackground";
import { NoteScene } from "@/app/components/NoteScene";
import { PlayButtonOrb } from "@/app/components/PlayButtonOrb";
import { WordmarkOverlay } from "@/app/components/WordmarkOverlay";

type ViewState = "home" | "toLogo" | "logo" | "toHome";

export default function Home() {
  const [viewState, setViewState] = useState<ViewState>("home");
  const router = useRouter();

  const isTargetLogo = viewState === "toLogo" || viewState === "logo";
  const isUiVisible = viewState === "home";

  return (
    <main className="page">
      <PageBackground />
      <NoteScene
        isLogoMode={isTargetLogo}
        isPlayingMode={false}
        isPromoted={false}
        showLyrics={false}
        onNoteClick={() => {
          if (viewState === "logo") {
            setViewState("toHome");
          }
        }}
        onTransitionComplete={(mode) => {
          if (mode === "logo") {
            setViewState("logo");
            router.push("/visualize");
          } else {
            setViewState("home");
          }
        }}
      />
      <WordmarkOverlay isVisible={isUiVisible} />
      <PlayButtonOrb
        isActivated={isTargetLogo}
        isVisible={isUiVisible}
        isDisabled={viewState !== "home"}
        onClick={() => {
          if (viewState === "home") {
            setViewState("toLogo");
          }
        }}
      />
    </main>
  );
}
