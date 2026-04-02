"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { audioManager } from "./audioManager";
import type { TrackLyrics } from "./lyrics";

type LyricsOverlayProps = {
  isVisible: boolean;
  lyrics: TrackLyrics | null;
};

function findActiveLine(lyrics: TrackLyrics, time: number): number {
  const lines = lyrics.lines;
  if (lines.length === 0) return -1;

  let low = 0;
  let high = lines.length - 1;
  let result = -1;

  while (low <= high) {
    const mid = (low + high) >>> 1;
    if (lines[mid].start <= time) {
      result = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return result;
}

export function LyricsOverlay({ lyrics, isVisible }: LyricsOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeIndexRef = useRef(-1);
  const [activeIndex, setActiveIndex] = useState(-1);

  const updateWords = useCallback(() => {
    const container = containerRef.current;
    if (!container || !audioManager) return;

    const currentTime = audioManager.getCurrentTime();
    const nextActiveLineIndex =
      lyrics && lyrics.synced ? findActiveLine(lyrics, currentTime) : -1;

    if (nextActiveLineIndex !== activeIndexRef.current) {
      activeIndexRef.current = nextActiveLineIndex;
      setActiveIndex(nextActiveLineIndex);
    }

    const spans = container.querySelectorAll<HTMLSpanElement>(".lyric-word");
    for (let index = 0; index < spans.length; index += 1) {
      const span = spans[index];
      const start = Number.parseFloat(span.dataset.start || "0");
      const end = Number.parseFloat(span.dataset.end || "0");

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
        const duration = end - start;
        const progress = (currentTime - start) / (duration || 1);
        const percent = Math.max(0, Math.min(100, (1 - progress) * 100));
        span.style.backgroundPosition = `${percent}% 0`;
      } else if (
        span.classList.contains("active") ||
        span.classList.contains("sung")
      ) {
        span.classList.remove("active", "sung");
        span.style.backgroundPosition = "100% 0";
      }
    }
  }, [lyrics]);

  useEffect(() => {
    let animationFrameId = 0;

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

  const startIdx = activeIndex;
  const endIdx = Math.min(lyrics.lines.length - 1, activeIndex + 1);
  const renderLines = lyrics.lines.slice(startIdx, endIdx + 1);

  return (
    <div className="lyrics-overlay" ref={containerRef}>
      <div className="lyrics-overlay__container">
        {renderLines.map((line) => {
          const lineIdx = lyrics.lines.indexOf(line);
          let lineClass = "lyrics-line lyrics-line--far";

          if (lineIdx === activeIndex) lineClass = "lyrics-line lyrics-line--active";
          else if (lineIdx === activeIndex - 1) lineClass = "lyrics-line lyrics-line--prev";
          else if (lineIdx === activeIndex + 1 || lineIdx === activeIndex + 2) {
            lineClass = "lyrics-line lyrics-line--next";
          }

          return (
            <div key={line.id} className={lineClass} data-line-idx={lineIdx}>
              {line.words.map((word) => {
                const duration = Math.max(0.1, word.end - word.start);

                return (
                  <span
                    key={word.id}
                    className="lyric-word"
                    data-start={word.start}
                    data-end={word.end}
                    style={
                      { "--sweep-duration": `${duration}s` } as React.CSSProperties
                    }
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
