"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { audioManager } from "@/lib/audioManager";
import { TrackLyrics } from "@/lib/lyrics";

interface LyricsOverlayProps {
  lyrics: TrackLyrics | null;
  isVisible: boolean;
}

/**
 * Binary search to find the active line index for a given time.
 * Returns -1 if no line is active.
 */
function findActiveLine(lyrics: TrackLyrics, time: number): number {
  const lines = lyrics.lines;
  if (lines.length === 0) return -1;

  let lo = 0;
  let hi = lines.length - 1;
  let result = -1;

  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (lines[mid].start <= time) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  // Greedy persistence: if we found a line that started before/at current time, 
  // return it even if it was a while ago. This keeps the 'window' anchored 
  // correctly during long instrumentals.
  return result;
}

export function LyricsOverlay({ lyrics, isVisible }: LyricsOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const activeIndexRef = useRef(-1);

  const updateWords = useCallback(() => {
    const container = containerRef.current;
    if (!container || !audioManager) return;

    const currentTime = audioManager.getCurrentTime();
    
    // Find active line via binary search
    const newActiveLineIndex = (lyrics && lyrics.synced)
      ? findActiveLine(lyrics, currentTime)
      : -1;

    // Update line visibility if the active line changed
    if (newActiveLineIndex !== activeIndexRef.current) {
      activeIndexRef.current = newActiveLineIndex;
      setActiveIndex(newActiveLineIndex);

      // Perform a small delay to let React re-render the new lines before 
      // class manipulation, or just rely on the next animation frame.
      // Actually, since we use state, we can move the class logic into the render phase
      // for line-level states, which is more idiomatic React anyway.
    }

    // Update word-level highlights via direct DOM manipulation (no React re-render)
    const spans = container.querySelectorAll<HTMLSpanElement>(".lyric-word");
    for (let i = 0; i < spans.length; i++) {
      const span = spans[i];
      const start = parseFloat(span.dataset.start || "0");
      const end = parseFloat(span.dataset.end || "0");

      if (currentTime >= end) {
        if (!span.classList.contains("sung")) {
          span.classList.remove("active");
          span.classList.add("sung");
          span.style.backgroundPosition = "0 0";
        }
      } else if (currentTime >= start && currentTime < end) {
        if (!span.classList.contains("active")) {
          span.classList.add("active");
          span.classList.remove("sung");
        }
        // Direct sync: calculate sweep percentage based on exact current time
        const duration = end - start;
        const progress = (currentTime - start) / (duration || 1);
        const percent = Math.max(0, Math.min(100, (1 - progress) * 100));
        span.style.backgroundPosition = `${percent}% 0`;
      } else {
        if (span.classList.contains("active") || span.classList.contains("sung")) {
          span.classList.remove("active", "sung");
          span.style.backgroundPosition = "100% 0";
        }
      }
    }
  }, [lyrics]);

  useEffect(() => {
    let animationFrameId: number;

    const tick = () => {
      updateWords();
      animationFrameId = requestAnimationFrame(tick);
    };

    animationFrameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrameId);
  }, [updateWords]);

  if (!isVisible) return null;

  if (!lyrics || !lyrics.synced || lyrics.lines.length === 0) {
    return (
      <div className="lyrics-overlay lyrics-overlay--empty">
        <div className="lyrics-overlay__container">
          <div className="lyrics-line lyrics-line--active">
            Lyrics not available
          </div>
        </div>
      </div>
    );
  }

  // Render a small window at the bottom: 
  // Show the previous line, active line, and next 2 lines if possible.
  const activeIdx = activeIndex;
  // Show active line and next 1 line only for maximum clarity/minimal overlap
  const startIdx = activeIdx; 
  const endIdx = Math.min(lyrics.lines.length - 1, activeIdx + 1);
  const renderLines = lyrics.lines.slice(startIdx, endIdx + 1);

  return (
    <div className="lyrics-overlay" ref={containerRef}>
      <div className="lyrics-overlay__container">
        {renderLines.map((line) => {
          const lineIdx = lyrics.lines.indexOf(line);
          let lineClass = "lyrics-line lyrics-line--far";
          if (lineIdx === activeIdx) lineClass = "lyrics-line lyrics-line--active";
          else if (lineIdx === activeIdx - 1) lineClass = "lyrics-line lyrics-line--prev";
          else if (lineIdx === activeIdx + 1 || lineIdx === activeIdx + 2) lineClass = "lyrics-line lyrics-line--next";

          return (
            <div
              key={line.id}
              className={lineClass}
              data-line-idx={lineIdx}
            >
              {line.words.map((word) => {
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
