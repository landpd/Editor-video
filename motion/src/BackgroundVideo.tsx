import React from "react";
// ✅ Correcto: AbsoluteFill y staticFile vienen de "remotion"
import { AbsoluteFill, staticFile } from "remotion";
// ✅ Correcto: Video viene de "@remotion/media"
import { Video } from "@remotion/media";

/**
 * Fullscreen background video.
 * Plays resultado_genai.mp4 at natural speed, covering the frame.
 * The generate-videos.js pipeline produces 6 clips concatenated into one video.
 */
export const BackgroundVideo: React.FC = () => {
  return (
    <AbsoluteFill>
      <Video
        src={staticFile("resultado_genai.mp4")}
        style={{
          objectFit: "cover",
          width: "100%",
          height: "100%",
        }}
      />
    </AbsoluteFill>
  );
};