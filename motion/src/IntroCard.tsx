import React from "react";
import { AbsoluteFill } from "remotion";
import { loadFont as loadNunito } from "@remotion/google-fonts/NunitoSans";

import type { CinematicData } from "./types";

const { fontFamily: nunitoSans } = loadNunito();

/** Pure white minimal canvas with centered hero text + isotipo at bottom */
export const IntroCard: React.FC<{ data: CinematicData }> = ({ data }) => {
  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#FFFFFF",
        justifyContent: "center",
        alignItems: "center",
        padding: 60,
      }}
    >
      {/* Title — property code */}
      <div
        style={{
          fontFamily: "EB Garamond",
          fontSize: 72,
          fontWeight: 400,
          fontStyle: "Regular",
          color: "#212322",
          textShadow: "0 2px 8px rgba(0,0,0,0.08)",
          textAlign: "center",
          letterSpacing: "0.02em",
          lineHeight: 1.1,
          marginBottom: 16,
        }}
      >
        {data.hero.title}
      </div>

      {/* Subtitle — full address */}
      <div
        style={{
          fontFamily: nunitoSans,
          fontSize: 20,
          fontWeight: 400,
          color: "#B7B7B7",
          textAlign: "center",
          marginBottom: "auto",
        }}
      >
        {data.hero.subtitle}
      </div>

      {/* Isotipo Pulppo at bottom */}
      <div style={{ position: "absolute", bottom: 60 }}>
        <svg width="28" height="24" viewBox="0 0 28 24" fill="none">
          <rect x="0" y="0" width="6" height="24" rx="2" fill="#212322" />
          <rect x="11" y="4" width="3" height="20" rx="1.5" fill="#212322" />
          <rect x="22" y="0" width="6" height="24" rx="2" fill="#212322" />
        </svg>
      </div>
    </AbsoluteFill>
  );
};