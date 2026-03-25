"use client";

import { useState } from "react";
import { PageBackground } from "@/app/components/PageBackground";
import { NoteScene } from "@/app/components/NoteScene";
import { PlaylistWorkspace } from "@/app/components/PlaylistWorkspace";
import { PlayButtonOrb } from "@/app/components/PlayButtonOrb";
import { WordmarkOverlay } from "@/app/components/WordmarkOverlay";
import { BottomPlayer } from "@/app/components/BottomPlayer";
import type { PlaylistSong } from "@/lib/playlist-types";

type ViewState = "home" | "toLogo" | "logo" | "toHome";

export default function Home() {
  const [viewState, setViewState] = useState<ViewState>("home");
  const [playingSong, setPlayingSong] = useState<PlaylistSong | null>(null);

  const isPlayingMode = playingSong !== null;
  const isTargetLogo = viewState === "toLogo" || viewState === "logo" || isPlayingMode;
  const isUiVisible = viewState === "home" && !isPlayingMode;
  const isScenePromoted = isPlayingMode;
  const isPlaylistWorkspaceVisible = viewState === "logo" && !isPlayingMode;

  return (
    <main className="page">
      <PageBackground />
      <NoteScene
        isLogoMode={isTargetLogo}
        isPlayingMode={isPlayingMode}
        isPromoted={isScenePromoted}
        onNoteClick={() => {
          if (viewState === "logo" && !isPlayingMode) {
            setViewState("toHome");
          }
        }}
        onTransitionComplete={(mode) => {
          if (!isPlayingMode) {
            setViewState(mode === "logo" ? "logo" : "home");
          }
        }}
      />
      <PlaylistWorkspace
        isVisible={isPlaylistWorkspaceVisible}
        onPlaySong={(song) => setPlayingSong(song)}
        onStopSong={() => setPlayingSong(null)}
        activeSongId={playingSong?.id ?? null}
      />
      <WordmarkOverlay isVisible={isUiVisible} />
      <PlayButtonOrb
        isActivated={isTargetLogo}
        isVisible={isUiVisible}
        isDisabled={viewState !== "home"}
        onClick={() => {
          if (viewState === "home" && !isPlayingMode) {
            setViewState("toLogo");
          }
        }}
      />
      {playingSong && (
        <BottomPlayer
          song={playingSong}
          onPlay={() => { }}
          onPause={() => { }}
          onStop={() => setPlayingSong(null)}
        />
      )}
    </main>
  );
}
