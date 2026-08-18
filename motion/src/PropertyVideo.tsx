import React from "react";
import { AbsoluteFill, Sequence, staticFile, Video } from "remotion";
import { Audio } from "@remotion/media";
import { loadFont } from "@remotion/google-fonts/EBGaramond";

import type { PropertyVideoProps } from "./types";
import { TIMING } from "./types";
import { CinematicTitleIntro } from "./CinematicTitleIntro";
import { LocationLowerThird } from "./LocationLowerThird";
import { LogoBlurReveal } from "./LogoBlurReveal";
import { Watermark } from "./Watermark";

const { fontFamily: ebGaramond } = loadFont("normal", {
  weights: ["400"],
  subsets: ["latin"],
});

/** Main composition — 6 clips x 75 frames each = 450 total */
export const PropertyVideo: React.FC<PropertyVideoProps> = ({ data }) => {
  const { CLIP_FRAMES } = TIMING;

  const bgVideos = [
    "toma_01.mp4",
    "toma_02.mp4",
    "toma_03.mp4",
    "toma_04.mp4",
    "toma_05.mp4",
    "toma_06.mp4",
  ];

  return (
    <AbsoluteFill
      style={{
        fontFamily: ebGaramond,
        backgroundColor: "#212322",
      }}
    >
      {/* 🎵 PISTA DE AUDIO REUTILIZABLE Y DINÁMICA 🎵 */}
      {/* El archivo "audio_background.mp3" es resuelto dinámicamente en cada ingesta */}
      <Audio src={staticFile("audio_background.mp3")} />

     {/* ✅ CORREGIDO: La marca de agua se muestra del frame 75 al 375 (Clips 1 al 4) */}
      <Sequence name="Global-Watermark" from={75} durationInFrames={300} layout="none">
        <Watermark
          neighborhood={data.location.neighborhood}
          city={data.location.city}
          state={data.location.state}
        />
      </Sequence>

      {/* ── Clips 0-5: background video per clip ── */}
      {bgVideos.map((video, idx) => (
        <Sequence
          key={idx}
          name={`Clip-${idx}-BG`}
          from={idx * CLIP_FRAMES}
          durationInFrames={CLIP_FRAMES}
        >
          <Video
            src={staticFile(video)}
            startFrom={30}
            muted
            style={{ objectFit: "cover", width: "100%", height: "100%" }}
          />
        </Sequence>
      ))}

      {/* ── Clip 0 (frames 0-74): CinematicTitleIntro ── */}
      <Sequence name="Clip-0-Intro" from={0} durationInFrames={CLIP_FRAMES} layout="none">
        <CinematicTitleIntro data={data} />
      </Sequence>

      {/* ── Clips 1-4 (frames 75-374): LocationLowerThird ── */}
      {data.phrases.slice(0, 4).map((phrase, idx) => (
        <Sequence
          key={idx}
          name={`Clip-${idx + 1}-LowerThird`}
          from={(idx + 1) * CLIP_FRAMES}
          durationInFrames={CLIP_FRAMES}
          layout="none"
        >
          <LocationLowerThird phrase={phrase} />
        </Sequence>
      ))}

      {/* ── Clip 5 (frames 375-449): LogoBlurReveal ── */}
      <Sequence
        name="Clip-5-Outro"
        from={5 * CLIP_FRAMES}
        durationInFrames={CLIP_FRAMES}
        layout="none"
      >
        <LogoBlurReveal data={data} />
      </Sequence>
    </AbsoluteFill>
  );
};