"use client";

import { useCallback, useEffect, useState } from "react";
import { audioManager } from "./audioManager";
import { LyricsOverlay } from "./LyricsOverlay";
import { fetchLyrics, type TrackLyrics } from "./lyrics";
import { NoteScene } from "./NoteScene";

export type ReusableSong = {
  artists: string[];
  durationMs: number;
  id: string;
  previewUrl: string | null;
  title: string;
};

type VisualizeExperienceProps = {
  songs: ReusableSong[];
};

export function VisualizeExperience({
  songs,
}: VisualizeExperienceProps) {
  const [playingSong, setPlayingSong] = useState<ReusableSong | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showLyrics, setShowLyrics] = useState(true);
  const [currentLyrics, setCurrentLyrics] = useState<TrackLyrics | null>(null);

  const handleNext = useCallback(() => {
    if (songs.length === 0) return;

    const currentIndex = songs.findIndex((song) => song.id === playingSong?.id);
    let nextIndex = currentIndex + 1;
    if (nextIndex >= songs.length) nextIndex = 0;

    const nextSong = songs[nextIndex];
    if (!nextSong) return;

    setCurrentLyrics(null);
    setPlayingSong(nextSong);
    if (nextSong.previewUrl) {
      void audioManager?.play(nextSong.previewUrl);
    }
  }, [playingSong, songs]);

  useEffect(() => {
    const syncPlayState = () => {
      if (audioManager && audioManager.isPlaying !== isPlaying) {
        setIsPlaying(audioManager.isPlaying);
      }
    };

    const interval = window.setInterval(syncPlayState, 500);
    return () => window.clearInterval(interval);
  }, [isPlaying]);

  useEffect(() => {
    if (!audioManager) return;
    audioManager.setOnEnded(() => {
      handleNext();
    });
  }, [handleNext]);

  useEffect(() => {
    if (!playingSong) return;

    let isCancelled = false;

    void fetchLyrics(
      playingSong.title,
      playingSong.artists.join(", "),
      playingSong.durationMs / 1000
    ).then((lyrics) => {
      if (!isCancelled) {
        setCurrentLyrics(lyrics);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [playingSong]);

  const isPlayingMode = playingSong !== null;

  return (
    <main className="page">
      <NoteScene
        isLogoMode
        isPlayingMode={isPlayingMode}
        isPromoted={isPlayingMode}
        showLyrics={showLyrics}
        onNoteClick={() => {}}
        onTransitionComplete={() => {}}
      />

      {isPlayingMode ? (
        <LyricsOverlay lyrics={currentLyrics} isVisible={showLyrics} />
      ) : null}

      <div
        style={{
          position: "fixed",
          left: 24,
          bottom: 24,
          zIndex: 20,
          display: "flex",
          gap: 12,
        }}
      >
        <button
          onClick={() => {
            const firstSong = songs[0];
            if (!firstSong?.previewUrl) return;
            setCurrentLyrics(null);
            setPlayingSong(firstSong);
            void audioManager?.play(firstSong.previewUrl);
          }}
        >
          Start
        </button>
        <button
          onClick={() => {
            if (audioManager?.isPlaying) {
              audioManager.pause();
            } else {
              void audioManager?.resume();
            }
          }}
        >
          {isPlaying ? "Pause" : "Resume"}
        </button>
        <button
          onClick={() => {
            audioManager?.stop();
            setCurrentLyrics(null);
            setPlayingSong(null);
          }}
        >
          Stop
        </button>
        <button onClick={() => setShowLyrics((current) => !current)}>
          {showLyrics ? "Hide Lyrics" : "Show Lyrics"}
        </button>
      </div>
    </main>
  );
}
