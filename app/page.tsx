"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { PageBackground } from "@/app/components/PageBackground";
import { NoteScene } from "@/app/components/NoteScene";
import { PlayButtonOrb } from "@/app/components/PlayButtonOrb";

const PlaylistWorkspace = dynamic(
  () =>
    import("@/app/components/PlaylistWorkspace").then(
      (module) => module.PlaylistWorkspace
    ),
  { ssr: false }
);

const WordmarkOverlay = dynamic(
  () =>
    import("@/app/components/WordmarkOverlay").then(
      (module) => module.WordmarkOverlay
    ),
  { ssr: false }
);

type ViewState = "home" | "toLogo" | "logo" | "toHome";

export default function Home() {
  const [viewState, setViewState] = useState<ViewState>("home");
  const isTargetLogo = viewState === "toLogo" || viewState === "logo";
  const isUiVisible = viewState === "home";
  const isScenePromoted = false;
  const isPlaylistWorkspaceVisible = viewState === "logo";
  const isPlaylistThemeActive = viewState === "toLogo" || viewState === "logo";

  return (
    <main className={`page${isPlaylistThemeActive ? " page--playlist" : ""}`}>
      <PageBackground isPlaylistMode={isPlaylistThemeActive} />
      <div
        className={`page-playlist-transition${
          isPlaylistThemeActive ? " is-active" : ""
        }`}
        aria-hidden="true"
      />
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
