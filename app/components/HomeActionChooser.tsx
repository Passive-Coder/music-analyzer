"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";

type HomeActionChooserProps = {
  isActive?: boolean;
  onChooseSong?: () => void;
  onPublishPlaylist?: () => void;
};

export function HomeActionChooser({
  isActive = false,
  onChooseSong,
  onPublishPlaylist,
}: HomeActionChooserProps) {
  const [isReady, setIsReady] = useState(false);
  const {
    handleStart: handleLeftStart,
    handleStop: handleLeftStop,
    rotation: leftRotation,
  } = usePersistentRecordRotation();
  const {
    handleStart: handleRightStart,
    handleStop: handleRightStop,
    rotation: rightRotation,
  } = usePersistentRecordRotation();

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      if (!isActive) {
        handleLeftStop();
        handleRightStop();
      }

      setIsReady(isActive);
    }, isActive ? 660 : 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [handleLeftStop, handleRightStop, isActive]);

  return (
    <section
      className={`home-action-chooser${
        isActive ? " is-active" : " is-inactive"
      }${isReady ? " is-ready" : ""}`}
      aria-hidden={!isActive}
    >
      <button
        type="button"
        className="home-action-chooser__record home-action-chooser__record--left"
        onClick={onChooseSong}
        disabled={!isReady}
        onMouseEnter={handleLeftStart}
        onMouseLeave={handleLeftStop}
        onFocus={handleLeftStart}
        onBlur={handleLeftStop}
      >
        <span
          className="home-action-chooser__disc"
          aria-hidden="true"
          style={
            {
              "--record-rotation": `${leftRotation}deg`,
            } as CSSProperties
          }
        >
          <span className="home-action-chooser__disc-grooves" />
          <span className="home-action-chooser__disc-shine" />
        </span>
        <span className="home-action-chooser__label-core">
          <span className="home-action-chooser__label-text">Vote Song</span>
        </span>
      </button>

      <button
        type="button"
        className="home-action-chooser__record home-action-chooser__record--right"
        onClick={onPublishPlaylist}
        disabled={!isReady}
        onMouseEnter={handleRightStart}
        onMouseLeave={handleRightStop}
        onFocus={handleRightStart}
        onBlur={handleRightStop}
      >
        <span
          className="home-action-chooser__disc"
          aria-hidden="true"
          style={
            {
              "--record-rotation": `${rightRotation}deg`,
            } as CSSProperties
          }
        >
          <span className="home-action-chooser__disc-grooves" />
          <span className="home-action-chooser__disc-shine" />
        </span>
        <span className="home-action-chooser__label-core">
          <span className="home-action-chooser__label-text">
            Publish
            <br />
            Playlist
          </span>
        </span>
      </button>
    </section>
  );
}

function usePersistentRecordRotation() {
  const [, setStoredRotation] = useState(0);
  const [displayRotation, setDisplayRotation] = useState(0);
  const frameRef = useRef<number | null>(null);
  const lastTimestampRef = useRef<number | null>(null);
  const rotationRef = useRef(0);
  const storedRotationRef = useRef(0);
  const isRotatingRef = useRef(false);

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  const step = useCallback(
    function step(timestamp: number) {
      if (!isRotatingRef.current) {
        return;
      }

      const lastTimestamp = lastTimestampRef.current ?? timestamp;
      const delta = timestamp - lastTimestamp;
      lastTimestampRef.current = timestamp;
      rotationRef.current = normalizeRotation(
        rotationRef.current + delta * 0.018
      );
      setDisplayRotation(rotationRef.current);
      frameRef.current = window.requestAnimationFrame(step);
    },
    []
  );

  const handleStart = useCallback(() => {
    if (isRotatingRef.current) {
      return;
    }

    isRotatingRef.current = true;
    lastTimestampRef.current = null;
    frameRef.current = window.requestAnimationFrame(step);
  }, [step]);

  const handleStop = useCallback(() => {
    if (!isRotatingRef.current) {
      return;
    }

    isRotatingRef.current = false;

    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    lastTimestampRef.current = null;
    const nextRotation = normalizeRotation(rotationRef.current);
    setDisplayRotation(nextRotation);

    if (Math.abs(nextRotation - storedRotationRef.current) > 0.01) {
      storedRotationRef.current = nextRotation;
      setStoredRotation(nextRotation);
    }
  }, []);

  return {
    handleStart,
    handleStop,
    rotation: displayRotation,
  };
}

function normalizeRotation(angle: number) {
  const normalized = angle % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}
