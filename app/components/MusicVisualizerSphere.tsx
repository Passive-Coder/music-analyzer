"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import type { TrackLyrics } from "@/lib/lyrics";
import type { ActivePlaylistSongVote, PlaylistSong } from "@/lib/playlist-types";

const WIREFRAME_COLOR = new THREE.Color(0xf1dcff);
const AURA_COLOR = new THREE.Color(0xb892ff);
const STAR_COLOR = new THREE.Color(0xd8c8ff);
const FALLBACK_TEMPO_MS = 620;

type PulseEvent = {
  durationMs: number;
  strength: number;
  timeMs: number;
};

export function MusicVisualizerSphere({
  currentSong,
  lyrics,
  playbackTimeMs,
  songList,
  startedAt,
}: {
  currentSong: PlaylistSong | null;
  lyrics: TrackLyrics | null;
  playbackTimeMs?: number | null;
  songList: ActivePlaylistSongVote[];
  startedAt: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const roomTimeRef = useRef(0);
  const pulseEventsRef = useRef<PulseEvent[]>([]);
  const pulseEvents = useMemo(() => buildPulseEvents(lyrics), [lyrics]);
  const tempoMs = useMemo(
    () => estimatePulseTempoMs(pulseEvents, currentSong?.durationMs ?? 0),
    [currentSong?.durationMs, pulseEvents]
  );
  const beatAnchorMs = pulseEvents[0]?.timeMs ?? 0;
  const currentVotes = useMemo(
    () => songList.find((entry) => entry.songId === currentSong?.id)?.vote ?? 0,
    [currentSong?.id, songList]
  );
  const maxVotes = useMemo(
    () => Math.max(...songList.map((entry) => entry.vote), 1),
    [songList]
  );
  const roomEnergy = useMemo(
    () => 0.42 + (currentVotes / maxVotes) * 0.58,
    [currentVotes, maxVotes]
  );

  useEffect(() => {
    pulseEventsRef.current = pulseEvents;
  }, [pulseEvents]);

  useEffect(() => {
    if (!currentSong || !startedAt) {
      roomTimeRef.current = 0;
      return;
    }

    let frameId = 0;
    const startedAtMs = Date.parse(startedAt);
    const durationMs = Math.max(currentSong.durationMs, 0);

    const tick = () => {
      const elapsedMs =
        typeof playbackTimeMs === "number"
          ? playbackTimeMs
          : Number.isFinite(startedAtMs)
            ? Date.now() - startedAtMs
            : 0;
      roomTimeRef.current = Math.max(0, Math.min(elapsedMs, durationMs));
      frameId = window.requestAnimationFrame(tick);
    };

    frameId = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [currentSong, playbackTimeMs, startedAt]);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return undefined;
    }

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.className = "vote-song-visualizer__canvas";
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    camera.position.set(0, 0, 16);

    const ambientLight = new THREE.AmbientLight(0xe9dfff, 0.58);
    scene.add(ambientLight);

    const keyLight = new THREE.PointLight(0xffffff, 5.2, 32, 2);
    keyLight.position.set(4.4, 4.8, 8.4);
    scene.add(keyLight);

    const rimLight = new THREE.PointLight(0x9c63ff, 4.8, 36, 2);
    rimLight.position.set(-5.8, -4.6, 7.8);
    scene.add(rimLight);

    const backLight = new THREE.PointLight(0x5d43d6, 2.8, 34, 2);
    backLight.position.set(0, 0, -8);
    scene.add(backLight);

    const sphereRig = new THREE.Group();
    scene.add(sphereRig);

    const wireframeGeometry = new THREE.IcosahedronGeometry(3.05, 4);
    const wireframeMaterial = new THREE.MeshBasicMaterial({
      color: WIREFRAME_COLOR.clone(),
      depthWrite: false,
      opacity: 0.92,
      transparent: true,
      wireframe: true,
    });
    const wireframeSphere = new THREE.Mesh(wireframeGeometry, wireframeMaterial);
    sphereRig.add(wireframeSphere);

    const auraGeometry = new THREE.IcosahedronGeometry(3.52, 2);
    const auraMaterial = new THREE.MeshBasicMaterial({
      blending: THREE.AdditiveBlending,
      color: AURA_COLOR.clone(),
      depthWrite: false,
      opacity: 0.08,
      side: THREE.BackSide,
      transparent: true,
    });
    const auraSphere = new THREE.Mesh(auraGeometry, auraMaterial);
    sphereRig.add(auraSphere);

    const glowTexture = createGlowTexture();
    const glowSprite = createGlowSprite(glowTexture);
    scene.add(glowSprite);

    const starGeometry = createStarFieldGeometry();
    const starMaterial = new THREE.PointsMaterial({
      blending: THREE.AdditiveBlending,
      color: STAR_COLOR.clone(),
      depthWrite: false,
      opacity: 0.82,
      size: 0.045,
      sizeAttenuation: true,
      transparent: true,
    });
    const stars = new THREE.Points(starGeometry, starMaterial);
    scene.add(stars);

    const resize = () => {
      const width = container.clientWidth || 1;
      const height = container.clientHeight || 1;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };

    resize();
    window.addEventListener("resize", resize);

    const clock = new THREE.Clock();
    let smoothedPulse = 0;

    renderer.setAnimationLoop(() => {
      const elapsed = clock.getElapsedTime();
      const currentTimeMs = roomTimeRef.current;
      const targetPulse = getPulseStrength(
        pulseEventsRef.current,
        currentTimeMs,
        tempoMs,
        beatAnchorMs
      );
      smoothedPulse = THREE.MathUtils.lerp(smoothedPulse, targetPulse, 0.3);
      const pulse = Math.max(targetPulse, smoothedPulse);
      const scale = 1 + pulse * 0.2 + roomEnergy * 0.04;

      sphereRig.rotation.y += 0.002 + pulse * 0.0045;
      sphereRig.rotation.x = Math.sin(elapsed * 0.32) * 0.08;
      sphereRig.rotation.z = Math.cos(elapsed * 0.27) * 0.05;
      sphereRig.scale.setScalar(scale);
      sphereRig.position.y = Math.sin(elapsed * 0.68) * 0.16 - pulse * 0.08;

      wireframeSphere.rotation.y -= 0.0016 + pulse * 0.0021;
      wireframeSphere.rotation.x += 0.001 + pulse * 0.0012;
      auraSphere.rotation.x -= 0.0012;
      auraSphere.rotation.z += 0.0014 + pulse * 0.0018;
      auraSphere.scale.setScalar(1.04 + pulse * 0.12);

      wireframeMaterial.opacity = 0.74 + pulse * 0.28;
      auraMaterial.opacity = 0.05 + pulse * 0.18 + roomEnergy * 0.02;
      glowSprite.material.opacity = 0.08 + pulse * 0.22 + roomEnergy * 0.02;
      glowSprite.scale.setScalar(11 + pulse * 2.8);

      keyLight.intensity = 4.8 + pulse * 5.2 + roomEnergy * 1.4;
      rimLight.intensity = 3.9 + pulse * 4.6 + roomEnergy * 1.2;
      backLight.intensity = 2.4 + pulse * 2.2;

      stars.rotation.y = elapsed * 0.01;
      stars.rotation.x = elapsed * 0.004;
      starMaterial.opacity = 0.36 + pulse * 0.34;
      starMaterial.size = 0.034 + pulse * 0.022;

      renderer.render(scene, camera);
    });

    return () => {
      renderer.setAnimationLoop(null);
      window.removeEventListener("resize", resize);
      wireframeGeometry.dispose();
      wireframeMaterial.dispose();
      auraGeometry.dispose();
      auraMaterial.dispose();
      starGeometry.dispose();
      starMaterial.dispose();
      disposeMaterial(glowSprite.material);
      glowTexture.dispose();
      renderer.dispose();

      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [beatAnchorMs, roomEnergy, tempoMs]);

  return (
    <div className="vote-song-visualizer" aria-hidden="true">
      <div className="vote-song-visualizer__shell">
        <div ref={containerRef} className="vote-song-visualizer__viewport" />
      </div>
    </div>
  );
}

function buildPulseEvents(lyrics: TrackLyrics | null) {
  const events: PulseEvent[] = [];
  const lines = lyrics?.lines ?? [];

  for (const line of lines) {
    events.push({
      durationMs: Math.max(line.endTimeMs - line.startTimeMs, 220),
      strength: 0.82,
      timeMs: line.startTimeMs,
    });

    if (!lyrics?.hasWordTiming) {
      continue;
    }

    for (const word of line.words) {
      events.push({
        durationMs: Math.max(word.endTimeMs - word.startTimeMs, 100),
        strength: Math.max(0.5, Math.min(1.22, word.text.trim().length / 5)),
        timeMs: word.startTimeMs,
      });
    }
  }

  events.sort((left, right) => left.timeMs - right.timeMs);

  return events.reduce<PulseEvent[]>((deduped, event) => {
    const previous = deduped[deduped.length - 1];

    if (previous && Math.abs(previous.timeMs - event.timeMs) <= 70) {
      previous.durationMs = Math.max(previous.durationMs, event.durationMs);
      previous.strength = Math.max(previous.strength, event.strength);
      return deduped;
    }

    deduped.push({ ...event });
    return deduped;
  }, []);
}

function estimatePulseTempoMs(pulseEvents: PulseEvent[], durationMs: number) {
  const startTimes = pulseEvents.map((event) => event.timeMs);
  const intervals = startTimes
    .slice(1)
    .map((time, index) => time - startTimes[index])
    .filter((interval) => interval >= 180 && interval <= 840)
    .sort((left, right) => left - right);

  if (intervals.length > 0) {
    return intervals[Math.floor(intervals.length / 2)];
  }

  return durationMs > 0 ? Math.max(400, Math.min(720, durationMs / 320)) : FALLBACK_TEMPO_MS;
}

function getPulseStrength(
  pulseEvents: PulseEvent[],
  currentTimeMs: number,
  tempoMs: number,
  beatAnchorMs: number
) {
  let pulse = 0;

  if (pulseEvents.length > 0) {
    const currentIndex = findLatestEventIndex(pulseEvents, currentTimeMs);
    const candidateIndices = [currentIndex - 1, currentIndex, currentIndex + 1];

    for (const index of candidateIndices) {
      const event = pulseEvents[index];

      if (!event) {
        continue;
      }

      const deltaMs = Math.abs(currentTimeMs - event.timeMs);
      pulse = Math.max(
        pulse,
        event.strength * Math.exp(-1 * Math.pow(deltaMs / 96, 2))
      );

      if (
        currentTimeMs >= event.timeMs &&
        currentTimeMs <= event.timeMs + event.durationMs
      ) {
        const progress =
          (currentTimeMs - event.timeMs) / Math.max(event.durationMs, 1);
        pulse = Math.max(
          pulse,
          0.3 + event.strength * Math.sin(progress * Math.PI) * 0.66
        );
      }
    }
  }

  const beatPhase =
    (((currentTimeMs - beatAnchorMs) % tempoMs) + tempoMs) % tempoMs;
  const beatPulse = Math.exp(-1 * Math.pow(beatPhase / 112, 2));
  const offBeatPulse = Math.exp(
    -1 *
      Math.pow(
        ((((beatPhase - tempoMs / 2) % tempoMs) + tempoMs) % tempoMs) / 172,
        2
      )
  );

  return Math.max(pulse, beatPulse * 0.82 + offBeatPulse * 0.22);
}

function findLatestEventIndex(
  pulseEvents: PulseEvent[],
  currentTimeMs: number
) {
  let low = 0;
  let high = pulseEvents.length - 1;
  let result = 0;

  while (low <= high) {
    const mid = (low + high) >>> 1;

    if (pulseEvents[mid].timeMs <= currentTimeMs) {
      result = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return result;
}

function createStarFieldGeometry() {
  const starCount = 980;
  const positions = new Float32Array(starCount * 3);

  for (let index = 0; index < starCount; index += 1) {
    const radius = 8.5 + Math.random() * 20;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 2 - 1);
    const offset = index * 3;
    positions[offset] = radius * Math.sin(phi) * Math.cos(theta);
    positions[offset + 1] = radius * Math.sin(phi) * Math.sin(theta);
    positions[offset + 2] = radius * Math.cos(phi);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  return geometry;
}

function createGlowTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Unable to create glow texture.");
  }

  const gradient = context.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2
  );
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.26, "rgba(238,214,255,0.38)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createGlowSprite(texture: THREE.Texture) {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      color: 0xcaa2ff,
      depthWrite: false,
      map: texture,
      opacity: 0.12,
      transparent: true,
    })
  );
  sprite.scale.set(10.5, 10.5, 1);
  sprite.position.set(0, 0, -0.8);
  return sprite;
}

function disposeMaterial(material: THREE.Material | THREE.Material[]) {
  if (Array.isArray(material)) {
    material.forEach((entry) => entry.dispose());
    return;
  }

  material.dispose();
}
