"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { PageBackground } from "@/app/components/PageBackground";
import { NoteScene } from "@/app/components/NoteScene";
import { PlaylistWorkspace } from "@/app/components/PlaylistWorkspace";
import { PlayButtonOrb } from "@/app/components/PlayButtonOrb";
import { WordmarkOverlay } from "@/app/components/WordmarkOverlay";
import { BottomPlayer } from "@/app/components/BottomPlayer";
import { LyricsOverlay } from "@/app/components/LyricsOverlay";
import type { PlaylistSong } from "@/lib/playlist-types";
import { fetchLyrics, TrackLyrics } from "@/lib/lyrics";
import { audioManager } from "@/lib/audioManager";

type ViewState = "home" | "toLogo" | "logo" | "toHome";

export default function Home() {
  const [viewState, setViewState] = useState<ViewState>("home");
  const [playingSong, setPlayingSong] = useState<PlaylistSong | null>(null);
  const [songs, setSongs] = useState<PlaylistSong[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showLyrics, setShowLyrics] = useState(true);
  const [currentLyrics, setCurrentLyrics] = useState<TrackLyrics | null>(null);

  useEffect(() => {
    const checkPlayState = () => {
      if (audioManager && audioManager.isPlaying !== isPlaying) {
        setIsPlaying(audioManager.isPlaying);
      }
    };
    const interval = setInterval(checkPlayState, 500);
    return () => clearInterval(interval);
  }, [isPlaying]);

  const handleNext = useCallback(() => {
    if (songs.length === 0) return;
    const currentIndex = songs.findIndex(s => s.id === playingSong?.id);
    let nextIndex = currentIndex + 1;
    if (nextIndex >= songs.length) nextIndex = 0;
    const nextSong = songs[nextIndex];
    if (nextSong) {
      setPlayingSong(nextSong);
      if (nextSong.previewUrl) audioManager?.play(nextSong.previewUrl);
    }
  }, [songs, playingSong]);

  const handlePrevious = useCallback(() => {
    if (songs.length === 0) return;
    const currentIndex = songs.findIndex(s => s.id === playingSong?.id);
    let prevIndex = currentIndex - 1;
    if (prevIndex < 0) prevIndex = songs.length - 1;
    const prevSong = songs[prevIndex];
    if (prevSong) {
      setPlayingSong(prevSong);
      if (prevSong.previewUrl) audioManager?.play(prevSong.previewUrl);
    }
  }, [songs, playingSong]);

  useEffect(() => {
    if (!audioManager) return;
    audioManager.setOnEnded(() => handleNext());
  }, [handleNext]);

  const isPlayingMode = playingSong !== null;
  const isTargetLogo = viewState === "toLogo" || viewState === "logo" || isPlayingMode;
  const isUiVisible = viewState === "home" && !isPlayingMode;
  const isScenePromoted = isPlayingMode;
  const isPlaylistWorkspaceVisible = viewState === "logo" && !isPlayingMode;

  useEffect(() => {
    if (playingSong) {
      setCurrentLyrics(null);
      fetchLyrics(
        playingSong.title, 
        playingSong.artists.join(", "), 
        playingSong.durationMs / 1000
      ).then(lyrics => {
        if (lyrics) setCurrentLyrics(lyrics);
      });
    } else {
      setCurrentLyrics(null);
    }
  }, [playingSong]);

  return (
    <main className="page">
      <PageBackground />
      <NoteScene
        isLogoMode={isTargetLogo}
        isPlayingMode={isPlayingMode}
        isPromoted={isScenePromoted}
        showLyrics={showLyrics}
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
      {isPlayingMode && (
        <LyricsOverlay lyrics={currentLyrics} isVisible={showLyrics} />
      )}
      <PlaylistWorkspace
        isVisible={isPlaylistWorkspaceVisible}
        songs={songs}
        onSongsChange={setSongs}
        onPlaySong={(song) => {
          setPlayingSong(song);
          if (song.previewUrl && audioManager) {
            audioManager.play(song.previewUrl);
          }
        }}
        onStopSong={() => {
          setPlayingSong(null);
          if (audioManager) audioManager.stop();
        }}
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
          isPlaying={isPlaying}
          onTogglePlay={() => {
            if (audioManager) {
              if (audioManager.isPlaying) audioManager.pause();
              else audioManager.resume();
            }
          }}
          onStop={() => setPlayingSong(null)}
          onNext={handleNext}
          onPrevious={handlePrevious}
          showLyrics={showLyrics}
          onToggleLyrics={() => setShowLyrics(!showLyrics)}
        />
      )}
    </main>
  );
}
