"use client";

import { useEffect, useRef } from "react";

const BASE_FONT_SIZE = 160;
const TARGET_WIDTH_RATIO = 0.8;

export function WordmarkOverlay() {
  const textRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const text = textRef.current;

    if (!text) {
      return undefined;
    }

    const updateSize = () => {
      const viewportWidth = window.innerWidth;
      const targetWidth = viewportWidth * TARGET_WIDTH_RATIO;

      text.style.fontSize = `${BASE_FONT_SIZE}px`;

      const measuredWidth = Math.max(text.scrollWidth, 1);
      const nextSize = Math.max(
        (BASE_FONT_SIZE * targetWidth) / measuredWidth,
        68
      );

      text.style.fontSize = `${nextSize}px`;
    };

    const initialize = async () => {
      if ("fonts" in document) {
        await document.fonts.ready;
      }

      updateSize();
    };

    void initialize();
    window.addEventListener("resize", updateSize);

    return () => {
      window.removeEventListener("resize", updateSize);
    };
  }, []);

  return (
    <div className="wordmark-overlay" aria-hidden="true">
      <div className="wordmark-shell">
        <h2 ref={textRef} className="wordmark-text" data-text="OCTAVE">
          OCTAVE
        </h2>
      </div>
    </div>
  );
}
