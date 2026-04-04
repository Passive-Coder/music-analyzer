import type { PlaylistSong } from "@/lib/playlist-types";

export type PlaybackClockSample = {
  capturedAtMs: number;
  currentMs: number | null;
  isPlaying: boolean;
  songId: string | null;
};

const STALE_SAMPLE_THRESHOLD_MS = 1_400;
const VISUAL_LATENCY_COMPENSATION_MS = 120;

export function createPlaybackClockSample(
  currentMs: number | null,
  songId: string | null,
  isPlaying = false
): PlaybackClockSample {
  return {
    capturedAtMs:
      typeof performance !== "undefined" ? performance.now() : Date.now(),
    currentMs:
      typeof currentMs === "number" && Number.isFinite(currentMs)
        ? Math.max(currentMs, 0)
        : null,
    isPlaying,
    songId,
  };
}

export function resolvePlaybackTimeMs(
  currentSong: PlaylistSong | null,
  playbackSample: PlaybackClockSample | null | undefined
) {
  if (!currentSong) {
    return 0;
  }

  const durationMs = Math.max(currentSong.durationMs, 0);

  if (
    !playbackSample ||
    playbackSample.songId !== currentSong.id ||
    typeof playbackSample.currentMs !== "number"
  ) {
    return 0;
  }

  if (!playbackSample.isPlaying) {
    return clampPlaybackMs(playbackSample.currentMs, durationMs);
  }

  const nowPerformanceMs =
    typeof performance !== "undefined" ? performance.now() : Date.now();
  const sampleAgeMs = Math.max(0, nowPerformanceMs - playbackSample.capturedAtMs);

  if (sampleAgeMs > STALE_SAMPLE_THRESHOLD_MS) {
    return clampPlaybackMs(playbackSample.currentMs, durationMs);
  }

  return clampPlaybackMs(
    playbackSample.currentMs + sampleAgeMs + VISUAL_LATENCY_COMPENSATION_MS,
    durationMs
  );
}

function clampPlaybackMs(value: number, durationMs: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(value, durationMs));
}
