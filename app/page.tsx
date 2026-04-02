"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { HomeActionChooser } from "@/app/components/HomeActionChooser";
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

type ViewState =
  | "home"
  | "choice"
  | "toPublish"
  | "publish"
  | "toVote"
  | "vote"
  | "toHome";

export default function Home() {
  const [viewState, setViewState] = useState<ViewState>("home");
  const [publishEffectToken, setPublishEffectToken] = useState(0);
  const [isPublishImpactActive, setIsPublishImpactActive] = useState(false);
  const [voteVolumeLevel, setVoteVolumeLevel] = useState(72);
  const impactStartTimeoutRef = useRef<number | null>(null);
  const impactEndTimeoutRef = useRef<number | null>(null);
  const noteDock =
    viewState === "toPublish" || viewState === "publish"
      ? "top-right"
      : viewState === "toVote" || viewState === "vote"
        ? "top-left"
        : "center";
  const wordmarkMode =
    viewState === "choice"
      ? "choice"
      : viewState === "home"
        ? "home"
        : "hidden";
  const isChoiceActive = viewState === "choice";
  const isPlayButtonVisible = viewState === "home" || viewState === "choice";
  const isScenePromoted = false;
  const isPlaylistWorkspaceVisible =
    viewState === "publish" ||
    viewState === "vote" ||
    viewState === "toPublish" ||
    viewState === "toVote";
  const isPlaylistThemeActive =
    viewState !== "home" && viewState !== "choice";
  const isPlaylistTransitionActive =
    viewState === "toPublish" || viewState === "toVote";
  const noteTextureFill =
    noteDock === "top-left" ? voteVolumeLevel / 100 : 0;

  useEffect(() => {
    return () => {
      if (impactStartTimeoutRef.current !== null) {
        window.clearTimeout(impactStartTimeoutRef.current);
      }

      if (impactEndTimeoutRef.current !== null) {
        window.clearTimeout(impactEndTimeoutRef.current);
      }
    };
  }, []);

  const triggerPublishEffect = () => {
    if (impactStartTimeoutRef.current !== null) {
      window.clearTimeout(impactStartTimeoutRef.current);
    }

    if (impactEndTimeoutRef.current !== null) {
      window.clearTimeout(impactEndTimeoutRef.current);
    }

    setPublishEffectToken((currentToken) => currentToken + 1);
    setIsPublishImpactActive(false);

    impactStartTimeoutRef.current = window.setTimeout(() => {
      setIsPublishImpactActive(true);
    }, 16);

    impactEndTimeoutRef.current = window.setTimeout(() => {
      setIsPublishImpactActive(false);
    }, 1380);
  };

  return (
    <main className={`page${isPlaylistThemeActive ? " page--playlist" : ""}`}>
      <PageBackground isPlaylistMode={isPlaylistThemeActive} />
      <div
        className={`page-playlist-transition${
          isPlaylistTransitionActive ? " is-active" : ""
        }`}
        aria-hidden="true"
      />
      <div
        className={`page-impact-wave${
          isPublishImpactActive ? " is-active" : ""
        }`}
        aria-hidden="true"
      />
      <HomeActionChooser
        isActive={isChoiceActive}
        onChooseSong={() => {
          if (viewState === "choice") {
            setViewState("toVote");
          }
        }}
        onPublishPlaylist={() => {
          if (viewState === "choice") {
            setViewState("toPublish");
          }
        }}
      />
      <NoteScene
        dock={noteDock}
        isPromoted={isScenePromoted}
        publishEffectToken={publishEffectToken}
        volumeFill={noteTextureFill}
        onNoteClick={() => {
          if (viewState === "publish" || viewState === "vote") {
            setViewState("toHome");
          }
        }}
        onTransitionComplete={(dock) => {
          if (dock === "top-right") {
            setViewState("publish");
            return;
          }

          if (dock === "top-left") {
            setViewState("vote");
            return;
          }

          setViewState("home");
        }}
      />
      {viewState === "publish" || viewState === "vote" ? (
        <button
          type="button"
          className={`note-scene__page-button note-scene__page-button--${
            viewState === "publish" ? "top-right" : "top-left"
          }`}
          aria-label="Return home"
          onClick={() => {
            setViewState("toHome");
          }}
        />
      ) : null}
      <PlaylistWorkspace
        isVisible={isPlaylistWorkspaceVisible}
        mode={viewState === "vote" ? "vote" : "publish"}
        onPublish={() => {
          triggerPublishEffect();
          setViewState("toVote");
        }}
        onVoteVolumeChange={setVoteVolumeLevel}
        voteVolumeLevel={voteVolumeLevel}
      />
      <WordmarkOverlay mode={wordmarkMode} />
      <PlayButtonOrb
        isActivated={viewState === "choice"}
        isVisible={isPlayButtonVisible}
        isDisabled={false}
        onClick={() => {
          if (viewState === "home") {
            setViewState("choice");
            return;
          }

          if (viewState === "choice") {
            setViewState("home");
          }
        }}
      />
    </main>
  );
}
