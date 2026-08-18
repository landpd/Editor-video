import React from "react";
import {
  AbsoluteFill,
  staticFile,
  Img,
  useCurrentFrame,
  interpolate,
} from "remotion";
import { loadFont as loadNunito } from "@remotion/google-fonts/NunitoSans";
import type { CinematicData } from "./types";
import { invert } from "@remotion/effects/invert";

const { fontFamily: nunitoSans } = loadNunito("normal", {
  weights: ["400"],
  subsets: ["latin"],
});

/** Clip 5 (frames 375-449): Dark overlay + logo blur reveal + CTA */
export const LogoBlurReveal: React.FC<{ data: CinematicData }> = ({
  data,
}) => {
  const frame = useCurrentFrame();

  // Blur reveal over first 40 frames
  const blur = interpolate(frame, [0, 40], [20, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const logoOpacity = interpolate(frame, [0, 40], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // CTA fades in after frame 50
  const ctaOpacity = interpolate(frame, [50, 70], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill>
      {/* Dark overlay #212322 at 60% */}
      <AbsoluteFill
        style={{
          backgroundColor: "#212322",
          opacity: 0.6,
        }}
      />
      {/* Logo + CTA centered */}
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          padding: 60,
        }}
      >
        {/* Agency logo — inverted to white via CSS filter, blur reveal */}
        <Img
          src={staticFile(data.cobrand_logo)}
          style={{
            maxWidth: "60%",
            maxHeight: "40%",
            objectFit: "contain",
            marginBottom: 50,
            opacity: logoOpacity,
            WebkitFilter: `blur(${blur}px)`,
          }}
          effects={[invert({})]} />

        {/* CTA — dynamic AI-generated copy */}
        <div
          style={{
            fontFamily: nunitoSans,
            fontWeight: 400,
            fontSize: 20,
            color: "#FFFFFF",
            textAlign: "center",
            opacity: ctaOpacity,
            lineHeight: 1.5,
          }}
        >
          Contáctanos para agendar una visita privada.
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};