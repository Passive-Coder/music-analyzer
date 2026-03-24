"use client";

import { useState } from "react";
import { PageBackground } from "@/app/components/PageBackground";
import { NoteScene } from "@/app/components/NoteScene";
import { PlaylistWorkspace } from "@/app/components/PlaylistWorkspace";
import { PlayButtonOrb } from "@/app/components/PlayButtonOrb";
import { WordmarkOverlay } from "@/app/components/WordmarkOverlay";

type ViewState = "home" | "toLogo" | "logo" | "toHome";

export default function Home() {
  const [viewState, setViewState] = useState<ViewState>("home");
  const isTargetLogo = viewState === "toLogo" || viewState === "logo";
  const isUiVisible = viewState === "home";
  const isScenePromoted = false;
  const isPlaylistWorkspaceVisible = viewState === "logo";

  return (
    <main className="page">
      <PageBackground />
      <NoteScene
        isLogoMode={isTargetLogo}
        isPromoted={isScenePromoted}
        onNoteClick={() => {
          if (viewState === "logo") {
            setViewState("toHome");
          }
        }}
        onTransitionComplete={(mode) => {
          setViewState(mode === "logo" ? "logo" : "home");
        }}
      />
      <PlaylistWorkspace isVisible={isPlaylistWorkspaceVisible} />
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
