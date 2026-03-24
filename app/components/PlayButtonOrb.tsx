"use client";

import { useEffect, useRef, useState } from "react";

type RingConfig = {
  amplitude: number;
  baseRadius: number;
  color: string;
  fillColor: string;
  frequency: number;
  phase: number;
  speed: number;
  strokeWidth: number;
};

const VIEWBOX_SIZE = 260;
const CENTER = VIEWBOX_SIZE / 2;
const RING_STEPS = 180;

const RING_CONFIGS: RingConfig[] = [
  {
    amplitude: 2.8,
    baseRadius: 28,
    color: "rgba(214, 192, 255, 0.95)",
    fillColor: "rgba(214, 192, 255, 0.12)",
    frequency: 5,
    phase: 0.1,
    speed: 0.0015,
    strokeWidth: 1.8,
  },
  {
    amplitude: 3.8,
    baseRadius: 34,
    color: "rgba(176, 132, 255, 0.8)",
    fillColor: "rgba(176, 132, 255, 0.12)",
    frequency: 6,
    phase: 1.4,
    speed: 0.0012,
    strokeWidth: 1.5,
  },
  {
    amplitude: 4.8,
    baseRadius: 41,
    color: "rgba(142, 94, 255, 0.66)",
    fillColor: "rgba(142, 94, 255, 0.1)",
    frequency: 7,
    phase: 2.2,
    speed: 0.001,
    strokeWidth: 1.3,
  },
  {
    amplitude: 5.8,
    baseRadius: 49,
    color: "rgba(102, 62, 214, 0.5)",
    fillColor: "rgba(102, 62, 214, 0.1)",
    frequency: 8,
    phase: 3.4,
    speed: 0.00085,
    strokeWidth: 1.1,
  },
];

type PlayButtonOrbProps = {
  isActivated?: boolean;
  isDisabled?: boolean;
  isVisible?: boolean;
  onClick?: () => void;
};

export function PlayButtonOrb({
  isActivated = false,
  isDisabled = false,
  isVisible = true,
  onClick,
}: PlayButtonOrbProps) {
  const pathRefs = useRef<Array<SVGPathElement | null>>([]);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    let frameId = 0;

    const animate = (time: number) => {
      RING_CONFIGS.forEach((config, index) => {
        const path = pathRefs.current[index];

        if (!path) {
          return;
        }

        path.setAttribute("d", buildWavePath(config, time));
      });

      frameId = window.requestAnimationFrame(animate);
    };

    frameId = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  return (
    <div
      className={`play-orb-overlay${isVisible ? " is-visible" : " is-hidden"}`}
    >
      <div
        className="play-orb-shell"
        data-active={isActive && !isDisabled ? "true" : "false"}
      >
        <svg
          className="play-orb-waves"
          viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}
          aria-hidden="true"
        >
          {RING_CONFIGS.map((config, index) => (
            <path
              key={`${config.baseRadius}-${config.frequency}`}
              ref={(element) => {
                pathRefs.current[index] = element;
              }}
              className="play-orb-wave"
              d={buildWavePath(config, 0)}
              stroke={config.color}
              fill={config.fillColor}
              strokeWidth={config.strokeWidth}
            />
          ))}
        </svg>
        <button
          type="button"
          className="play-orb-button"
          aria-label="Play"
          aria-pressed={isActivated}
          disabled={isDisabled}
          onClick={() => {
            setIsActive(false);
            onClick?.();
          }}
          onPointerEnter={() => {
            if (!isDisabled && isVisible) {
              setIsActive(true);
            }
          }}
          onPointerLeave={() => setIsActive(false)}
          onFocus={() => {
            if (!isDisabled && isVisible) {
              setIsActive(true);
            }
          }}
          onBlur={() => setIsActive(false)}
        >
          <span className="play-orb-icon" />
        </button>
      </div>
    </div>
  );
}

function buildWavePath(config: RingConfig, time: number) {
  let path = "";

  for (let step = 0; step <= RING_STEPS; step += 1) {
    const theta = (step / RING_STEPS) * Math.PI * 2;
    const progress = time * config.speed + config.phase;
    const horizontalReflection =
      (Math.sin(theta * config.frequency + progress) +
        Math.sin((Math.PI - theta) * config.frequency + progress)) *
      0.5;
    const verticalReflection =
      (Math.sin(
        (theta + Math.PI / 2) * config.frequency + progress * 0.82
      ) +
        Math.sin(
          (Math.PI / 2 - theta) * config.frequency + progress * 0.82
        )) *
      0.5;
    const radius =
      config.baseRadius +
      horizontalReflection * config.amplitude +
      verticalReflection * (config.amplitude * 0.55);
    const x = CENTER + Math.cos(theta) * radius;
    const y = CENTER + Math.sin(theta) * radius;

    path += `${step === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)} `;
  }

  return `${path}Z`;
}
