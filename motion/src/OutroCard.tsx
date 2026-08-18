import React from "react";
import { AbsoluteFill, staticFile, CanvasImage } from "remotion";

import type { CinematicData } from "./types";

/** Dark closing card with agency logo + CTA */
export const OutroCard: React.FC<{ data: CinematicData }> = ({ data }) => {
  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#212322",
        justifyContent: "center",
        alignItems: "center",
        padding: 60,
      }}
    >
      {/* Agency logo */}
      <CanvasImage
        src={staticFile(data.cobrand_logo)}
        style={{
          maxWidth: "60%",
          maxHeight: "40%",
          objectFit: "contain",
          marginBottom: 40,
        }}
      />

      {/* CTA */}
      <div
        style={{
          fontFamily: "EB Garamond",
          fontStyle: "Regular",
          fontSize: 28,
          color: "#FFFFFF",
          textAlign: "center",
          opacity: 0.85,
        }}
      >
        Te invitamos a conocer <br /> tu próximo hogar.
      </div>
    </AbsoluteFill>
  );
};