import React from "react";

export interface Hero {
  title: string;
  subtitle: string;
  price: string;
}

export interface Location {
  neighborhood: string;
  city: string;
  state: string;
}

export interface CinematicData {
  hero: Hero;
  location: Location;
  phrases: string[];
  cobrand_logo: string;
}

export interface PropertyVideoProps {
  data: CinematicData;
}

export const TIMING = {
  FPS: 30,
  CLIP_FRAMES: 75,
  TOTAL_CLIPS: 6,
  get TOTAL_FRAMES() {
    return this.CLIP_FRAMES * this.TOTAL_CLIPS;
  },
} as const;