import React from "react";
import { Composition } from "remotion";
import { PropertyVideo } from "./PropertyVideo";
import type { CinematicData, PropertyVideoProps } from "./types";
import { TIMING } from "./types";
import data from "./cinematic-data.json";

const typedData = data as unknown as CinematicData;

export const Root: React.FC = () => {
  const defaultProps: PropertyVideoProps = { data: typedData };

  return (
    <Composition
      id="PropertyVideo"
      component={PropertyVideo as any}
      durationInFrames={TIMING.TOTAL_FRAMES}
      fps={TIMING.FPS}
      width={720}
      height={1280}
      defaultProps={defaultProps}
    />
  );
};