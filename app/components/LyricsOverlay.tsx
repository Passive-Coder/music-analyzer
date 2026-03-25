"use client";

import { useEffect, useRef, useState } from "react";
import { audioManager } from "@/lib/audioManager";
import { TrackLyrics, LyricLine } from "@/lib/lyrics";

interface LyricsOverlayProps {
  lyrics: TrackLyrics;
}

export function LyricsOverlay({ lyrics }: LyricsOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeLineIndex, setActiveLineIndex] = useState(-1);

  useEffect(() => {
    let animationFrameId: number;

    const tick = () => {
      if (!audioManager) return;
      const currentTime = audioManager.getCurrentTime();

      if (containerRef.current && lyrics.synced) {
        // Binary search or linear scan for active line
        let currentLine = -1;
        for (let i = 0; i < lyrics.lines.length; i++) {
          const line = lyrics.lines[i];
          if (currentTime >= line.start && currentTime <= line.end + 2) {
            currentLine = i;
            break;
          } else if (currentTime < line.start && currentLine === -1) {
            // Gap between lines, show the upcoming one if close
            if (line.start - currentTime < 2) {
              currentLine = i;
            }
            break;
          }
        }

        if (currentLine !== activeLineIndex) {
          setActiveLineIndex(currentLine);
        }

        // Loop through spans to update word highlights explicitly via DOM class
        const spans = containerRef.current.querySelectorAll(".lyric-word");
        for (let i = 0; i < spans.length; i++) {
          const span = spans[i] as HTMLSpanElement;
          const start = parseFloat(span.dataset.start || "0");
          const end = parseFloat(span.dataset.end || "0");

          if (currentTime >= end) {
            if (!span.classList.contains("sung")) {
              span.classList.remove("active");
              span.classList.add("sung");
            }
          } else if (currentTime >= start && currentTime < end) {
            if (!span.classList.contains("active")) {
              span.classList.add("active");
              span.classList.remove("sung");
            }
          } else {
            span.classList.remove("active", "sung");
          }
        }
      }

      animationFrameId = requestAnimationFrame(tick);
    };

    animationFrameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrameId);
  }, [lyrics, activeLineIndex]);

  if (!lyrics || !lyrics.synced || lyrics.lines.length === 0) {
    return null;
  }

  // Calculate the lines to show (active + a few upcoming)
  const renderLines = [];
  const startIdx = Math.max(0, activeLineIndex - 1);
  const endIdx = Math.min(lyrics.lines.length - 1, activeLineIndex + 1);

  for (let i = startIdx; i <= endIdx; i++) {
    renderLines.push(lyrics.lines[i]);
  }

  return (
    <div className="lyrics-overlay" ref={containerRef}>
      <div className="lyrics-overlay__container">
        {renderLines.map((line, idx) => {
          const isActiveLine = line.id === lyrics.lines[activeLineIndex]?.id;
          return (
            <div 
              key={line.id} 
              className={`lyrics-line ${isActiveLine ? 'lyrics-line--active' : 'lyrics-line--waiting'}`}
            >
              {line.words.map(word => {
                const duration = Math.max(0.1, word.end - word.start);
                return (
                  <span
                    key={word.id}
                    id={word.id}
                    className="lyric-word"
                    data-start={word.start}
                    data-end={word.end}
                    style={{ "--sweep-duration": `${duration}s` } as React.CSSProperties}
                  >
                    {word.text}
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
