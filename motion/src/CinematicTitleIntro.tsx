import React from "react";
import { AbsoluteFill, useCurrentFrame, interpolate, Easing } from "remotion";
import { loadFont as loadNunito } from "@remotion/google-fonts/NunitoSans";
import type { CinematicData } from "./types";

const { fontFamily: nunitoSans } = loadNunito("normal", {
  weights: ["400"],
  subsets: ["latin"],
});

/** Clip 0 (frames 0-74): Dark overlay + spring-animated serif title + underline + subtitle */
export const CinematicTitleIntro: React.FC<{ data: CinematicData }> = ({
  data,
}) => {
  const frame = useCurrentFrame();
  const DUR = 75;
  const FADE_START = DUR - 15; // frame 60

  // Spring-based title entry
  const titleY = interpolate(frame, [0, 30], [80, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.spring({ damping: 200 }),
  });
  const titleOpacity = interpolate(frame, [0, 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const underlineWidth = interpolate(frame, [10, 40], [0, 160], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.spring({ damping: 150 }),
  });

  // Subtitle fade in
  const subtitleOpacity = interpolate(frame, [20, 45], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Exit fade — last 15 frames
  const exitOpacity = interpolate(frame, [FADE_START, DUR], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const overlayOpacity = interpolate(frame, [FADE_START, DUR], [0.6, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const textOpacity = Math.min(titleOpacity, exitOpacity);

  return (
    <AbsoluteFill>
      {/* Dark overlay #212322 @ 60% */}
      <AbsoluteFill
        style={{
          backgroundColor: "#212322",
          opacity: overlayOpacity,
        }} />
      {/* Centered text block */}
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          padding: 60,
          opacity: textOpacity,
        }}>
        {/* Title — regular serif */}
        <div
          style={{
            fontFamily: "EB Garamond",
            fontStyle: "regular",
            fontSize: "4rem",
            color: "#FFFFFF",
            textAlign: "center",
            lineHeight: 1.15,
            maxWidth: "85%",
            transform: `translateY(${titleY}px)`,
          }}
        >
          {data.hero.title}
        </div>

        {/* Underline — gold #F6BE00 */}
        <div
          style={{
            width: underlineWidth,
            height: 2,
            backgroundColor: "#F6BE00",
            marginTop: 16,
            marginBottom: 20,
            borderRadius: 1,
          }}
        />

        {/* Subtitle — sans-serif */}
        <div
          style={{
            fontFamily: nunitoSans,
            fontSize: "1.5rem",
            fontWeight: 400,
            color: "#B7B7B7",
            textAlign: "center",
            letterSpacing: "0.03em",
            opacity: Math.min(subtitleOpacity, exitOpacity),
          }}
        >
          {data.hero.subtitle}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};