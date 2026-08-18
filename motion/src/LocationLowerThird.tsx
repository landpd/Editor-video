import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, Easing } from "remotion";

import { TIMING } from "./types";

/** Clips 1-4 (frames 75-374): Phrase centered in EB Garamond regular over video */
export const LocationLowerThird: React.FC<{ phrase: string }> = ({ phrase }) => {
  const frame = useCurrentFrame();
  const { CLIP_FRAMES } = TIMING;

  // Entry: spring fade in over first 20 frames
  const entryProgress = interpolate(frame, [0, 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.spring({ damping: 200 }),
  });

  // Exit: fade out in last 15 frames
  const exitProgress = interpolate(frame, [CLIP_FRAMES - 15, CLIP_FRAMES], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const opacity = Math.min(entryProgress, exitProgress);
  const translateY = interpolate(entryProgress, [0, 1], [30, 0]);

  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          top: "45%",
          left: "50%",
          transform: `translateX(-50%) translateY(-50%) translateY(${translateY}px)`,
          opacity,
          width: "85%",
          maxWidth: 600,
        }}
      >
        <div
          style={{
            fontFamily: "EB Garamond",
            fontStyle: "normal",
            fontSize: 32,
            color: "#FFFFFF",
            textAlign: "center",
            textShadow: "0px 2px 8px rgba(0, 0, 0, 0.9)",
            lineHeight: 1.3,
          }}
        >
          {phrase}
        </div>
      </div>
    </AbsoluteFill>
  );
};