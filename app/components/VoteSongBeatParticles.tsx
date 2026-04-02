import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
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
  lane: "field" | "top-right";
  radius: number;
  size: number;
  speed: number;
  tint: "bright" | "violet";
  x: number;
  y: number;
};

const FALLBACK_TEMPO_MS = 620;
const PARTICLE_COUNT = 1380;

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
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    // Create a high-density particle system covering the full viewport
    const particles: Particle[] = Array.from({ length: PARTICLE_COUNT }, () => ({
      alphaSeed: Math.random() * Math.PI * 2,
      angle: Math.random() * Math.PI * 2,
      drift: 0.12 + Math.random() * 0.38,
      lane: Math.random() < 0.28 ? "top-right" : "field",
      radius: 0.08 + Math.random() * 1.4,
      size: Math.random() < 0.12 ? 1.2 + Math.random() * 1.1 : 0.38 + Math.random() * 0.9,
      speed: 0.0003 + Math.random() * 0.0011,
      tint: Math.random() < 0.72 ? "bright" : "violet",
      x: Math.random(),
      y: Math.random(),
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
    let smoothedPulse = 0;

    const render = () => {
      elapsed += 1;
      const width = window.innerWidth;
      const height = window.innerHeight;
      
      const currentTimeMs = resolvePlaybackTimeMs(currentSong, playbackTimeMs, startedAt);
      const targetPulse = getPulseStrength(pulseEvents, currentTimeMs, tempoMs);
      smoothedPulse = THREE.MathUtils.lerp(smoothedPulse, targetPulse, 0.42);
      const pulse = Math.max(targetPulse, smoothedPulse);
      
      const centerX = width * 0.5;
      const centerY = height * 0.55;
      const visualizerExclusionRadius = Math.min(width, height) * 0.17;
      const roomEnergy = currentSong ? 0.18 : 0;

      context.clearRect(0, 0, width, height);

      for (const p of particles) {
        p.angle += p.speed * (1 + pulse * 2.2);
        let x = 0;
        let y = 0;

        const driftBoost = 0.00018 + pulse * 0.00042;
        p.x += Math.cos(p.angle + p.alphaSeed) * driftBoost * p.drift;
        p.y += Math.sin(p.angle * 0.86 + p.alphaSeed) * driftBoost * p.drift;

        if (p.lane === "top-right") {
          p.x += 0.00014 + pulse * 0.00016;
          p.y -= 0.00012 + pulse * 0.00012;
        }

        if (p.x < -0.08) p.x = 1.08;
        if (p.x > 1.08) p.x = -0.08;
        if (p.y < -0.08) p.y = 1.08;
        if (p.y > 1.08) p.y = -0.08;

        x = p.x * width;
        y = p.y * height;

        const distanceFromVisualizer = Math.hypot(x - centerX, y - centerY);
        if (distanceFromVisualizer < visualizerExclusionRadius) {
          continue;
        }

        const twinkle = 0.4 + Math.sin(elapsed * 0.022 + p.alphaSeed) * 0.22;
        const alpha = Math.max(0, Math.min(1, (twinkle + pulse * 0.58 + roomEnergy)));
        const size = p.size * (1 + pulse * 0.82);

        context.fillStyle = p.tint === "bright" 
          ? `rgba(238, 244, 255, ${alpha * 0.85})` 
          : `rgba(172, 116, 255, ${alpha * 0.72})`;
        
        context.beginPath();
        context.arc(x, y, size, 0, Math.PI * 2);
        context.fill();
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

// Logic helpers (preserved from original)
function buildPulseEvents(lyrics: TrackLyrics | null) {
  const events: PulseEvent[] = [];
  const lines = lyrics?.lines ?? [];
  for (const line of lines) {
    events.push({
      durationMs: Math.max(line.endTimeMs - line.startTimeMs, 220),
      strength: 0.74,
      timeMs: line.startTimeMs,
    });
    if (!lyrics?.hasWordTiming) continue;
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
  if (intervals.length > 0) return intervals[Math.floor(intervals.length / 2)];
  return durationMs > 0 ? Math.max(400, Math.min(720, durationMs / 320)) : FALLBACK_TEMPO_MS;
}

function resolvePlaybackTimeMs(currentSong: PlaylistSong | null, playbackTimeMs: number | null, startedAt: string | null) {
  if (typeof playbackTimeMs === "number") return playbackTimeMs;
  if (!currentSong || !startedAt) return 0;
  return Math.max(0, Math.min(Date.now() - Date.parse(startedAt), currentSong.durationMs));
}

function getPulseStrength(pulseEvents: PulseEvent[], currentTimeMs: number, tempoMs: number) {
  let pulse = 0;
  for (const event of pulseEvents) {
    const deltaMs = Math.abs(currentTimeMs - event.timeMs);
    if (deltaMs > 420) continue;
    pulse = Math.max(pulse, event.strength * Math.exp(-1 * Math.pow(deltaMs / 96, 2)));
  }
  const beatPhase = ((currentTimeMs % tempoMs) + tempoMs) % tempoMs;
  return Math.max(pulse, Math.exp(-1 * Math.pow(beatPhase / 104, 2)) * 0.82);
}
