"use client";

import { useEffect, useState, useCallback } from "react";
import { PageBackground } from "@/app/components/PageBackground";
import { NoteScene } from "@/app/components/NoteScene";
import { PlaylistWorkspace } from "@/app/components/PlaylistWorkspace";
import { BottomPlayer } from "@/app/components/BottomPlayer";
import { LyricsOverlay } from "@/app/components/LyricsOverlay";
import type { PlaylistSong } from "@/lib/playlist-types";
import { fetchLyrics, TrackLyrics } from "@/lib/lyrics";
import { audioManager } from "@/lib/audioManager";

export default function VisualizePage() {
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
      setCurrentLyrics(null);
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
      setCurrentLyrics(null);
      setPlayingSong(prevSong);
      if (prevSong.previewUrl) audioManager?.play(prevSong.previewUrl);
    }
  }, [songs, playingSong]);

  useEffect(() => {
    if (!audioManager) return;
    audioManager.setOnEnded(() => handleNext());
  }, [handleNext]);

  const isPlayingMode = playingSong !== null;

  useEffect(() => {
    if (!playingSong) {
      return;
    }

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

  return (
    <main className="page">
      <PageBackground />
      <NoteScene
        isLogoMode={true}
        isPlayingMode={isPlayingMode}
        isPromoted={isPlayingMode}
        showLyrics={showLyrics}
        onNoteClick={() => {}}
        onTransitionComplete={() => {}}
      />
      {isPlayingMode && (
        <LyricsOverlay lyrics={currentLyrics} isVisible={showLyrics} />
      )}
      <PlaylistWorkspace
        isVisible={!isPlayingMode}
        songs={songs}
        onSongsChange={setSongs}
        onPlaySong={(song) => {
          setCurrentLyrics(null);
          setPlayingSong(song);
          if (song.previewUrl && audioManager) {
            audioManager.play(song.previewUrl);
          }
        }}
        onStopSong={() => {
          setCurrentLyrics(null);
          setPlayingSong(null);
          if (audioManager) audioManager.stop();
        }}
        activeSongId={playingSong?.id ?? null}
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
          onStop={() => {
            setCurrentLyrics(null);
            setPlayingSong(null);
          }}
          onNext={handleNext}
          onPrevious={handlePrevious}
          showLyrics={showLyrics}
          onToggleLyrics={() => setShowLyrics(!showLyrics)}
        />
      )}
    </main>
  );
}
