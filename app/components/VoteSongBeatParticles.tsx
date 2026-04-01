"use client";

import { useEffect, useMemo, useRef } from "react";

import type { TrackLyrics } from "@/lib/lyrics";
import type { PlaylistSong } from "@/lib/playlist-types";

type PulseEvent = {
  durationMs: number;
  strength: number;
  timeMs: number;
};

type VoteSongBeatParticlesProps = {
  currentSong: PlaylistSong | null;
  lyrics: TrackLyrics | null;
  playbackTimeMs: number | null;
  startedAt: string | null;
};

type Particle = {
  alphaSeed: number;
  angle: number;
  drift: number;
  orbit: number;
  radius: number;
  size: number;
  speed: number;
  tint: "bright" | "violet";
};

const FALLBACK_TEMPO_MS = 620;
const PARTICLE_COUNT = 520;

export function VoteSongBeatParticles({
  currentSong,
  lyrics,
  playbackTimeMs,
  startedAt,
}: VoteSongBeatParticlesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pulseEvents = useMemo(() => buildPulseEvents(lyrics), [lyrics]);
  const tempoMs = useMemo(
    () => estimateTempoMs(pulseEvents, currentSong?.durationMs ?? 0),
    [currentSong?.durationMs, pulseEvents]
  );

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");

    if (!context) {
      return;
    }

    const particles: Particle[] = Array.from({ length: PARTICLE_COUNT }, () => ({
      alphaSeed: Math.random() * Math.PI * 2,
      angle: Math.random() * Math.PI * 2,
      drift: 0.16 + Math.random() * 0.42,
      orbit: 0.6 + Math.random() * 1.8,
      radius: 0.18 + Math.random() * 0.92,
      size: Math.random() < 0.12 ? 2.4 + Math.random() * 2.4 : 0.8 + Math.random() * 1.8,
      speed: 0.0006 + Math.random() * 0.0016,
      tint: Math.random() < 0.74 ? "bright" : "violet",
    }));

    const resize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      canvas.width = Math.max(1, Math.floor(width * window.devicePixelRatio));
      canvas.height = Math.max(1, Math.floor(height * window.devicePixelRatio));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
    };

    resize();
    window.addEventListener("resize", resize);

    let frameId = 0;
    let elapsed = 0;

    const render = () => {
      elapsed += 1;
      const width = window.innerWidth;
      const height = window.innerHeight;
      const currentTimeMs = resolvePlaybackTimeMs(
        currentSong,
        playbackTimeMs,
        startedAt
      );
      const pulse = getPulseStrength(pulseEvents, currentTimeMs, tempoMs);
      const centerX = width * 0.5;
      const centerY = height * 0.55;
      const maxRadius = Math.max(width, height) * 0.58;

      context.clearRect(0, 0, width, height);

      for (const particle of particles) {
        particle.angle += particle.speed * (1 + pulse * 2.8);

        const orbitRadius =
          particle.radius * maxRadius * (0.45 + particle.orbit * 0.42 + pulse * 0.18);
        const wobble = Math.sin(elapsed * 0.014 + particle.alphaSeed) * particle.drift * 34;
        const x = centerX + Math.cos(particle.angle) * orbitRadius + wobble;
        const y =
          centerY +
          Math.sin(particle.angle * (1.08 + particle.orbit * 0.12)) * orbitRadius * 0.72 +
          Math.cos(elapsed * 0.011 + particle.alphaSeed) * particle.drift * 26;
        const twinkle = 0.46 + Math.sin(elapsed * 0.024 + particle.alphaSeed) * 0.24;
        const alpha = Math.min(1, twinkle + pulse * 0.58);
        const size = particle.size * (1 + pulse * 1.25);

        context.fillStyle =
          particle.tint === "bright"
            ? `rgba(236, 230, 255, ${alpha})`
            : `rgba(175, 106, 255, ${alpha * 0.88})`;
        context.fillRect(x, y, size, size);
      }

      frameId = window.requestAnimationFrame(render);
    };

    frameId = window.requestAnimationFrame(render);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", resize);
    };
  }, [currentSong, playbackTimeMs, pulseEvents, startedAt, tempoMs]);

  return <canvas ref={canvasRef} className="vote-song-workspace__particles" aria-hidden="true" />;
}

function buildPulseEvents(lyrics: TrackLyrics | null) {
  const events: PulseEvent[] = [];
  const lines = lyrics?.lines ?? [];

  for (const line of lines) {
    events.push({
      durationMs: Math.max(line.endTimeMs - line.startTimeMs, 220),
      strength: 0.74,
      timeMs: line.startTimeMs,
    });

    if (!lyrics?.hasWordTiming) {
      continue;
    }

    for (const word of line.words) {
      events.push({
        durationMs: Math.max(word.endTimeMs - word.startTimeMs, 90),
        strength: Math.max(0.52, Math.min(1.18, word.text.trim().length / 5)),
        timeMs: word.startTimeMs,
      });
    }
  }

  events.sort((left, right) => left.timeMs - right.timeMs);

  return events.reduce<PulseEvent[]>((deduped, event) => {
    const previous = deduped[deduped.length - 1];

    if (previous && Math.abs(previous.timeMs - event.timeMs) <= 60) {
      previous.durationMs = Math.max(previous.durationMs, event.durationMs);
      previous.strength = Math.max(previous.strength, event.strength);
      return deduped;
    }

    deduped.push({ ...event });
    return deduped;
  }, []);
}

function estimateTempoMs(pulseEvents: PulseEvent[], durationMs: number) {
  const intervals = pulseEvents
    .slice(1)
    .map((event, index) => event.timeMs - pulseEvents[index].timeMs)
    .filter((interval) => interval >= 180 && interval <= 860)
    .sort((left, right) => left - right);

  if (intervals.length > 0) {
    return intervals[Math.floor(intervals.length / 2)];
  }

  return durationMs > 0 ? Math.max(400, Math.min(720, durationMs / 320)) : FALLBACK_TEMPO_MS;
}

function resolvePlaybackTimeMs(
  currentSong: PlaylistSong | null,
  playbackTimeMs: number | null,
  startedAt: string | null
) {
  if (typeof playbackTimeMs === "number") {
    return playbackTimeMs;
  }

  if (!currentSong || !startedAt) {
    return 0;
  }

  return Math.max(0, Math.min(Date.now() - Date.parse(startedAt), currentSong.durationMs));
}

function getPulseStrength(
  pulseEvents: PulseEvent[],
  currentTimeMs: number,
  tempoMs: number
) {
  let pulse = 0;

  if (pulseEvents.length > 0) {
    for (const event of pulseEvents) {
      const deltaMs = Math.abs(currentTimeMs - event.timeMs);
      if (deltaMs > 420) {
        continue;
      }

      pulse = Math.max(
        pulse,
        event.strength * Math.exp(-1 * Math.pow(deltaMs / 96, 2))
      );
    }
  }

  const beatPhase = ((currentTimeMs % tempoMs) + tempoMs) % tempoMs;
  const beatPulse = Math.exp(-1 * Math.pow(beatPhase / 104, 2));

  return Math.max(pulse, beatPulse * 0.82);
}
