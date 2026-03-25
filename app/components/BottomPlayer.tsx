"use client";

import { useEffect, useRef, useState } from "react";
import type { PlaylistSong } from "@/lib/playlist-types";
import { audioManager } from "@/lib/audioManager";

type BottomPlayerProps = {
  song: PlaylistSong;
  onPause: () => void;
  onPlay: () => void;
  onStop: () => void;
};

export function BottomPlayer({ song, onPause, onPlay, onStop }: BottomPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const sliderRef = useRef<HTMLInputElement>(null);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    let animationFrame: number;

    const updatePlayState = () => {
      if (!audioManager) return;
      
      const newIsPlaying = audioManager.isPlaying;
      if (newIsPlaying !== isPlaying) setIsPlaying(newIsPlaying);
      
      const rawDuration = audioManager.getDuration();
      const newDuration = Number.isFinite(rawDuration) && rawDuration > 0 ? rawDuration : 30;
      if (Math.abs(duration - newDuration) > 1) setDuration(newDuration);
      
      if (!isDraggingRef.current) {
        const time = audioManager.getCurrentTime();
        setCurrentTime(time);
        if (sliderRef.current) {
          sliderRef.current.value = time.toString();
        }
      }

      animationFrame = requestAnimationFrame(updatePlayState);
    };

    animationFrame = requestAnimationFrame(updatePlayState);

    return () => cancelAnimationFrame(animationFrame);
  }, [isPlaying, duration]);

  const togglePlay = () => {
    if (!audioManager) return;
    if (audioManager.isPlaying) {
      audioManager.pause();
      onPause();
    } else {
      if (song.previewUrl) audioManager.play(song.previewUrl);
      onPlay();
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);
    if (audioManager) {
      audioManager.seek(newTime);
    }
  };

  return (
    <div className="bottom-player">
      <div className="bottom-player__info">
        <div className="bottom-player__title-row">
          <h3 className="bottom-player__title" title={song.title}>
            {song.title}
          </h3>
          {!song.spotifyUrl ? (
            <span className="bottom-player__badge">Local</span>
          ) : null}
        </div>
        <p className="bottom-player__artist" title={song.artists.join(", ")}>
          {song.artists.join(", ")}
        </p>
      </div>
      
      <div className="bottom-player__controls">
        <button 
          className="bottom-player__play-btn" 
          onClick={togglePlay}
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? "⏸" : "▶"}
        </button>
        <button 
          className="bottom-player__stop-btn" 
          onClick={() => { if (audioManager) audioManager.stop(); onStop(); }}
          aria-label="Stop"
        >
          ⏹
        </button>
        
        <div className="bottom-player__progress">
          <span className="bottom-player__time">{formatTime(currentTime)}</span>
          <input
            ref={sliderRef}
            type="range"
            min={0}
            max={duration || 30}
            step={0.01}
            defaultValue={0}
            onMouseDown={() => { isDraggingRef.current = true; }}
            onMouseUp={() => { isDraggingRef.current = false; }}
            onPointerDown={() => { isDraggingRef.current = true; }}
            onPointerUp={() => { isDraggingRef.current = false; }}
            onChange={handleSeek}
            className="bottom-player__slider"
          />
          <span className="bottom-player__time">{formatTime(duration)}</span>
        </div>
      </div>
    </div>
  );
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
