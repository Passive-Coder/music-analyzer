"use client";

import { useEffect, useRef, useState } from "react";
import type { PlaylistSong } from "@/lib/playlist-types";
import { audioManager } from "@/lib/audioManager";

type BottomPlayerProps = {
  song: PlaylistSong;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onStop: () => void;
  showLyrics: boolean;
  onToggleLyrics: () => void;
};

export function BottomPlayer({ 
  song, 
  isPlaying, 
  onTogglePlay, 
  onNext, 
  onPrevious, 
  onStop,
  showLyrics,
  onToggleLyrics
}: BottomPlayerProps) {
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const sliderRef = useRef<HTMLInputElement>(null);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    let animationFrame: number;

    const updatePlayState = () => {
      if (!audioManager) return;
      
      const rawDuration = audioManager.getDuration();
      const newDuration = Number.isFinite(rawDuration) && rawDuration > 0 ? rawDuration : 30;
      if (Math.abs(duration - newDuration) > 1) setDuration(newDuration);
      
      if (!isDraggingRef.current) {
        const time = audioManager.getCurrentTime();
        setCurrentTime(time);
        if (sliderRef.current) {
          sliderRef.current.value = time.toString();
          const progress = (time / newDuration) * 100;
          sliderRef.current.style.setProperty('--progress', `${progress}%`);
        }
      }

      animationFrame = requestAnimationFrame(updatePlayState);
    };

    animationFrame = requestAnimationFrame(updatePlayState);

    return () => cancelAnimationFrame(animationFrame);
  }, [duration]);

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
        <h3 className="bottom-player__title" title={song.title}>
          {song.title}
        </h3>
        <p className="bottom-player__artist" title={song.artists.join(", ")}>
          {song.artists.join(", ")}
        </p>
      </div>
      
      <div className="bottom-player__controls">
        <button 
          className="bottom-player__nav-btn" 
          onClick={onPrevious}
          aria-label="Previous"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
            <path d="M6 18V6h2v12H6zm3.5-6L18 18V6l-8.5 6z" />
          </svg>
        </button>

        <button 
          className="bottom-player__play-btn glass" 
          onClick={onTogglePlay}
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? (
            <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
              <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24" style={{ marginLeft: "4px" }}>
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        <button 
          className="bottom-player__nav-btn" 
          onClick={onNext}
          aria-label="Next"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
            <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
          </svg>
        </button>

        <button 
          className={`bottom-player__nav-btn ${showLyrics ? 'active' : ''}`} 
          onClick={onToggleLyrics} 
          aria-label="Toggle Lyrics"
          title="Toggle Lyrics"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
            <path d="M21 3H3C1.9 3 1 3.9 1 5V17C1 18.1 1.9 19 3 19H7L12 24L17 19H21C22.1 19 23 18.1 23 17V5C23 3.9 22.1 3 21 3ZM21 17H16.2L12 21.2L7.8 17H3V5H21V17ZM7 7H17V9H7V7ZM7 11H17V13H7V11ZM7 15H14V17H7V15Z" />
          </svg>
        </button>

        <button 
          className="bottom-player__stop-btn glass" 
          onClick={() => { if (audioManager) audioManager.stop(); onStop(); }}
          aria-label="Stop"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
            <path d="M6 6h12v12H6z" />
          </svg>
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
            onChange={(e) => {
              handleSeek(e);
              const progress = (parseFloat(e.target.value) / (duration || 30)) * 100;
              e.target.style.setProperty('--progress', `${progress}%`);
            }}
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
