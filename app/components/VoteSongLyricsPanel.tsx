"use client";

import { useMemo, type CSSProperties } from "react";

import {
  getActiveLyricLineIndex,
  type TrackLyrics,
} from "@/lib/lyrics";

type VoteSongLyricsPanelProps = {
  artistText: string;
  currentTimeMs: number;
  lyrics: TrackLyrics | null;
  onBackToPlayer: () => void;
  plainLyrics: string | null;
  songTitle: string;
  status: "idle" | "loading" | "ready" | "missing" | "error";
};

export function VoteSongLyricsPanel({
  artistText,
  currentTimeMs,
  lyrics,
  onBackToPlayer,
  plainLyrics,
  songTitle,
  status,
}: VoteSongLyricsPanelProps) {
  const activeIndex = useMemo(
    () => getActiveLyricLineIndex(lyrics, currentTimeMs),
    [currentTimeMs, lyrics]
  );

  const visibleLines = useMemo(() => {
    const allLines = lyrics?.lines ?? [];

    if (allLines.length === 0) {
      return [];
    }

    const startIndex = activeIndex >= 0 ? activeIndex : 0;
    return allLines.slice(startIndex, startIndex + 5);
  }, [activeIndex, lyrics]);
  const plainLyricLines = useMemo(
    () =>
      (plainLyrics ?? "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean),
    [plainLyrics]
  );

  return (
    <div className="vote-song-player__lyrics-screen">
      <div className="vote-song-player__lyrics-backdrop" aria-hidden="true" />
      <button
        type="button"
        className="vote-song-player__inline-toggle vote-song-player__inline-toggle--lyrics"
        onClick={onBackToPlayer}
      >
        PLAYER
      </button>
      <div className="vote-song-player__lyrics-body">
        {status === "loading" ? (
          <p className="vote-song-player__lyrics-empty">Loading synced lyrics...</p>
        ) : status === "error" ? (
          <p className="vote-song-player__lyrics-empty">
            Timed lyrics could not be loaded right now.
          </p>
        ) : status === "missing" ? (
          <p className="vote-song-player__lyrics-empty">
            Timestamped lyrics are not available for this song yet.
          </p>
        ) : visibleLines.length > 0 ? (
          <div className="vote-song-player__lyrics-lines vote-song-player__lyrics-lines--overlay">
            {visibleLines.map((line, index) => {
              const absoluteIndex = (activeIndex >= 0 ? activeIndex : 0) + index;
              const lineClassName =
                absoluteIndex === activeIndex
                  ? "vote-song-player__lyrics-line is-active"
                  : index === 0 && activeIndex < 0
                    ? "vote-song-player__lyrics-line is-active"
                    : "vote-song-player__lyrics-line is-queued";

              return (
                <div key={line.id} className={lineClassName}>
                  {line.words.map((word) => {
                    const wordClassName = getLyricWordClassName(word, currentTimeMs);
                    const wordStyle = getLyricWordStyle(word, currentTimeMs);

                    return (
                      <span
                        key={word.id}
                        className={wordClassName}
                        style={wordStyle}
                      >
                        {word.text}
                      </span>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ) : plainLyricLines.length > 0 ? (
          <div className="vote-song-player__lyrics-lines vote-song-player__lyrics-lines--plain">
            {plainLyricLines.map((line, index) => (
              <div key={`${songTitle}-${index}`} className="vote-song-player__lyrics-line is-active">
                {line}
              </div>
            ))}
          </div>
        ) : (
          <p className="vote-song-player__lyrics-empty">
            Start a song to view synced lyrics.
          </p>
        )}
      </div>
    </div>
  );
}

function getLyricWordClassName(
  word: TrackLyrics["lines"][number]["words"][number],
  currentTimeMs: number
) {
  if (currentTimeMs >= word.endTimeMs) {
    return "vote-song-player__lyric-word is-sung";
  }

  if (currentTimeMs >= word.startTimeMs) {
    return "vote-song-player__lyric-word is-active";
  }

  return "vote-song-player__lyric-word";
}

function getLyricWordStyle(
  word: TrackLyrics["lines"][number]["words"][number],
  currentTimeMs: number
) {
  if (currentTimeMs >= word.endTimeMs) {
    return { backgroundPosition: "0 0" } as CSSProperties;
  }

  if (currentTimeMs < word.startTimeMs) {
    return { backgroundPosition: "100% 0" } as CSSProperties;
  }

  const durationMs = Math.max(word.endTimeMs - word.startTimeMs, 1);
  const progress = Math.max(
    0,
    Math.min(1, (currentTimeMs - word.startTimeMs) / durationMs)
  );

  return {
    backgroundPosition: `${(1 - progress) * 100}% 0`,
  } as CSSProperties;
}
