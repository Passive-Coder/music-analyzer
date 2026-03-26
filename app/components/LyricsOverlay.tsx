"use client";

import { useEffect, useRef, useCallback } from "react";
import { audioManager } from "@/lib/audioManager";
import { TrackLyrics } from "@/lib/lyrics";

interface LyricsOverlayProps {
  lyrics: TrackLyrics;
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

  // result is the last line whose start <= time
  if (result !== -1) {
    const line = lines[result];
    // Allow a 2-second grace after the line ends for visual persistence
    if (time <= line.end + 2) {
      return result;
    }
    // Check if we're in a gap close to the next line
    if (result + 1 < lines.length && lines[result + 1].start - time < 2) {
      return result + 1;
    }
  } else if (lines.length > 0 && lines[0].start - time < 2) {
    return 0;
  }

  return result !== -1 ? result : -1;
}

export function LyricsOverlay({ lyrics }: LyricsOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeLineRef = useRef(-1);

  const updateWords = useCallback(() => {
    const container = containerRef.current;
    if (!container || !audioManager) return;

    const currentTime = audioManager.getCurrentTime();

    // Find active line via binary search
    const newActiveLineIndex = lyrics.synced
      ? findActiveLine(lyrics, currentTime)
      : -1;

    // Update line visibility if the active line changed
    if (newActiveLineIndex !== activeLineRef.current) {
      activeLineRef.current = newActiveLineIndex;

      const lineEls = container.querySelectorAll<HTMLElement>(".lyrics-line");
      for (let i = 0; i < lineEls.length; i++) {
        const lineEl = lineEls[i];
        const lineIdx = parseInt(lineEl.dataset.lineIdx || "-1", 10);

        lineEl.classList.remove(
          "lyrics-line--active",
          "lyrics-line--prev",
          "lyrics-line--next",
          "lyrics-line--far"
        );

        if (lineIdx === newActiveLineIndex) {
          lineEl.classList.add("lyrics-line--active");
        } else if (lineIdx === newActiveLineIndex - 1) {
          lineEl.classList.add("lyrics-line--prev");
        } else if (
          lineIdx === newActiveLineIndex + 1 ||
          lineIdx === newActiveLineIndex + 2
        ) {
          lineEl.classList.add("lyrics-line--next");
        } else {
          lineEl.classList.add("lyrics-line--far");
        }
      }

      // Auto-scroll to keep active line centered
      const activeLine = container.querySelector(".lyrics-line--active");
      if (activeLine) {
        activeLine.scrollIntoView({ behavior: "smooth", block: "center" });
      }
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
        }
      } else if (currentTime >= start && currentTime < end) {
        if (!span.classList.contains("active")) {
          span.classList.add("active");
          span.classList.remove("sung");
        }
      } else {
        if (span.classList.contains("active") || span.classList.contains("sung")) {
          span.classList.remove("active", "sung");
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

  if (!lyrics || !lyrics.synced || lyrics.lines.length === 0) {
    return null;
  }

  // Render a window of lines around the expected playback area
  // We render ALL lines but CSS controls visibility via class states
  const activeIdx = activeLineRef.current;
  const startIdx = Math.max(0, activeIdx - 2);
  const endIdx = Math.min(lyrics.lines.length - 1, activeIdx + 4);
  const renderLines = lyrics.lines.slice(
    startIdx < 0 ? 0 : startIdx,
    (endIdx < 0 ? 6 : endIdx) + 1
  );

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
