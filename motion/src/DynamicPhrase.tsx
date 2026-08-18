import React from "react";
import { useCurrentFrame, interpolate, Easing } from "remotion";

import type { Phrase } from "./types";
import { TIMING } from "./types";

/** Lower-third overlay: capsule badge + main text with spring entrance + fade exit */
export const DynamicPhrase: React.FC<{ phrase: Phrase }> = ({ phrase }) => {
  const frame = useCurrentFrame();
  const { PHRASE_FRAMES } = TIMING;
  const FADE_IN = 15;
  const FADE_OUT_START = PHRASE_FRAMES - 15;

  // Entry: slide up + fade in over first 15 frames
  const entryProgress = interpolate(frame, [0, FADE_IN], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.spring({ damping: 200 }),
  });

  // Exit: fade out in last 15 frames
  const exitProgress = interpolate(frame, [FADE_OUT_START, PHRASE_FRAMES], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const opacity = Math.min(entryProgress, exitProgress);
  const translateY = interpolate(entryProgress, [0, 1], [30, 0]);

  return (
    <div
      style={{
        position: "absolute",
        bottom: "18%",
        left: "50%",
        transform: `translateX(-50%) translateY(${translateY}px)`,
        opacity,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
        width: "80%",
        maxWidth: 800,
      }}
    >
      {/* Capsule — small pill badge */}
      <span
        style={{
          display: "inline-block",
          backgroundColor: "#C59B6C",
          color: "#FFFFFF",
          fontFamily: "Nunito Sans",
          fontWeight: 600,
          fontSize: 14,
          textTransform: "lowercase",
          padding: "6px 20px",
          borderRadius: 9999,
          letterSpacing: "0.04em",
          whiteSpace: "nowrap",
        }}
      >
        {phrase.capsule}
      </span>

      {/* Main text — large italic serif */}
      <span
        style={{
          fontFamily: "EB Garamond",
          fontStyle: "italic",
          fontWeight: 400,
          fontSize: 56,
          color: "#FFFFFF",
          textAlign: "center",
          textShadow: "0 2px 12px rgba(0,0,0,0.5)",
          lineHeight: 1.1,
        }}
      >
        {phrase.main}
      </span>
    </div>
  );
};