"use client";

import { useEffect, useRef } from "react";

type BlobConfig = {
  className: string;
  startX: number;
  startY: number;
  velocityX: number;
  velocityY: number;
  pulseSpeed: number;
  pulseRange: number;
};

const BACKGROUND_MOTION_MULTIPLIER = 2;

const BLOB_CONFIGS: BlobConfig[] = [
  {
    className: "page-blob-a",
    startX: 0.14,
    startY: 0.2,
    velocityX: 34,
    velocityY: 22,
    pulseSpeed: 0.85,
    pulseRange: 0.08,
  },
  {
    className: "page-blob-b",
    startX: 0.86,
    startY: 0.18,
    velocityX: -28,
    velocityY: 30,
    pulseSpeed: 0.72,
    pulseRange: 0.1,
  },
  {
    className: "page-blob-c",
    startX: 0.32,
    startY: 0.82,
    velocityX: 24,
    velocityY: -20,
    pulseSpeed: 0.94,
    pulseRange: 0.07,
  },
  {
    className: "page-blob-d",
    startX: 0.74,
    startY: 0.68,
    velocityX: -22,
    velocityY: -26,
    pulseSpeed: 0.78,
    pulseRange: 0.09,
  },
  {
    className: "page-blob-e",
    startX: 0.52,
    startY: 0.42,
    velocityX: 18,
    velocityY: 16,
    pulseSpeed: 1.02,
    pulseRange: 0.06,
  },
  {
    className: "page-blob-f",
    startX: 0.08,
    startY: 0.56,
    velocityX: 20,
    velocityY: -18,
    pulseSpeed: 0.88,
    pulseRange: 0.08,
  },
  {
    className: "page-blob-g",
    startX: 0.64,
    startY: 0.12,
    velocityX: -16,
    velocityY: 24,
    pulseSpeed: 1.1,
    pulseRange: 0.07,
  },
  {
    className: "page-blob-h",
    startX: 0.9,
    startY: 0.48,
    velocityX: -26,
    velocityY: -16,
    pulseSpeed: 0.76,
    pulseRange: 0.1,
  },
];

export function PageBackground() {
  const containerRef = useRef<HTMLDivElement>(null);
  const blobRefs = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return undefined;
    }

    const bounds = {
      width: container.clientWidth || window.innerWidth,
      height: container.clientHeight || window.innerHeight,
    };

    const bodies = BLOB_CONFIGS.map((config, index) => ({
      element: blobRefs.current[index],
      x: bounds.width * config.startX,
      y: bounds.height * config.startY,
      vx: config.velocityX,
      vy: config.velocityY,
      pulseSpeed: config.pulseSpeed,
      pulseRange: config.pulseRange,
      phase: Math.random() * Math.PI * 2,
      radius: 220,
      maxSpeed: Math.max(Math.abs(config.velocityX), Math.abs(config.velocityY)) * 1.35,
    }));

    const clamp = (value: number, min: number, max: number) =>
      Math.min(Math.max(value, min), max);

    const updateBounds = () => {
      bounds.width = container.clientWidth || window.innerWidth;
      bounds.height = container.clientHeight || window.innerHeight;

      bodies.forEach((body) => {
        body.radius = (body.element?.offsetWidth ?? 440) / 2;
        body.x = clamp(body.x, -body.radius, bounds.width + body.radius);
        body.y = clamp(body.y, -body.radius, bounds.height + body.radius);
      });
    };

    let frameId = 0;
    let previousTime = performance.now();

    const animate = (now: number) => {
      const delta =
        Math.min((now - previousTime) / 1000, 0.033) *
        BACKGROUND_MOTION_MULTIPLIER;
      previousTime = now;

      bodies.forEach((body) => {
        if (!body.element) {
          return;
        }

        body.vx += Math.sin(now * 0.00042 + body.phase) * 4.4 * delta;
        body.vy += Math.cos(now * 0.00036 + body.phase * 1.7) * 4.4 * delta;
        body.vx = clamp(body.vx, -body.maxSpeed, body.maxSpeed);
        body.vy = clamp(body.vy, -body.maxSpeed, body.maxSpeed);

        body.x += body.vx * delta;
        body.y += body.vy * delta;

        if (body.x < -body.radius || body.x > bounds.width + body.radius) {
          body.vx *= -1;
          body.x = clamp(body.x, -body.radius, bounds.width + body.radius);
        }

        if (body.y < -body.radius || body.y > bounds.height + body.radius) {
          body.vy *= -1;
          body.y = clamp(body.y, -body.radius, bounds.height + body.radius);
        }

        const scale =
          1 + Math.sin(now * 0.001 * body.pulseSpeed + body.phase) * body.pulseRange;

        body.element.style.transform =
          `translate3d(${body.x}px, ${body.y}px, 0) translate(-50%, -50%) scale(${scale})`;
      });

      frameId = window.requestAnimationFrame(animate);
    };

    updateBounds();
    frameId = window.requestAnimationFrame(animate);
    window.addEventListener("resize", updateBounds);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", updateBounds);
    };
  }, []);

  return (
    <div ref={containerRef} className="page-background" aria-hidden="true">
      {BLOB_CONFIGS.map((config, index) => (
        <div
          key={config.className}
          ref={(element) => {
            blobRefs.current[index] = element;
          }}
          className={`page-blob ${config.className}`}
        />
      ))}
    </div>
  );
}
