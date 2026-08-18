import React from 'react';
import { Easing, AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { loadFont as loadNunito } from "@remotion/google-fonts/NunitoSans";

const { fontFamily: nunitoSans } = loadNunito("normal", {
  weights: ["400", "700"],
  subsets: ["latin"],
});

interface WatermarkProps {
  neighborhood: string;
  city: string;
  state: string;
}

export const Watermark: React.FC<WatermarkProps> = ({
  neighborhood,
  city,
  state,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const locationText = neighborhood;
  const venueText = `${city}, ${state}`;

  // Entrada en los primeros 25 cuadros de su secuencia (frames 75 a 100 del video global)
  const entry = interpolate(frame, [0, 25], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Salida en los últimos 25 cuadros de su secuencia (frames 350 a 375 del video global)
  const exit = interpolate(frame, [durationInFrames - 25, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const opacity = Math.min(entry, exit);

  const visibleLocationCharacters = Math.floor(
    interpolate(frame, [10, 35], [0, locationText.length], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    })
  );

  const visibleVenueCharacters = Math.floor(
    interpolate(frame, [20, 45], [0, venueText.length], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    })
  );

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          bottom: 100, // 📐 Margen de seguridad desde el borde inferior
          left: '50%',
          transform: 'translateX(-50%)',
          width: 500, // ✅ Reducido a un máximo de 500px
          display: 'flex', // ✅ Flexbox para alineación fluida y centrada
          alignItems: 'center',
          justifyContent: 'center',
          boxSizing: 'border-box',
          fontFamily: nunitoSans,
          zIndex: 99,
          opacity,
        }}
      >
        {/* 📍 Pin de Ubicación animado */}
        <svg
          viewBox="0 0 64 80"
          style={{
            width: 64, // Un poco más pequeño proporcional al contenedor de 500px
            height: 80,
            overflow: 'visible',
            filter: 'drop-shadow(0 6px 8px rgba(24, 24, 27, 0.25))',
            transform: `translateY(${interpolate(
              frame,
              [0, 15],
              [-15, 0],
              {
                easing: Easing.out(Easing.cubic),
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
              }
            )}px) scale(${interpolate(
              frame,
              [0, 15],
              [0.8, 1],
              {
                easing: Easing.out(Easing.cubic),
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
              }
            )})`,
            transformOrigin: '32px 76px',
          }}
        >
          <path
            d="M32 3C15.4 3 4 15.4 4 31C4 50.8 22.1 69.6 29.3 76.2C30.8 77.6 33.2 77.6 34.7 76.2C41.9 69.6 60 50.8 60 31C60 15.4 48.6 3 32 3Z"
            pathLength={1}
            fill="#f6be00" // Amarillo Corporativo Pulppo
            fillOpacity={interpolate(frame, [5, 18], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            })}
            stroke="#d49e00"
            strokeDasharray="1"
            strokeDashoffset={interpolate(frame, [0, 15], [1, 0], {
              easing: Easing.out(Easing.cubic),
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            })}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2.5"
          />
          <circle
            cx="32"
            cy="30"
            r={interpolate(frame, [8, 20], [0, 9], {
              easing: Easing.out(Easing.cubic),
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            })}
            fill="#eff6ff"
          />
        </svg>

        {/* 📝 Bloque de Textos alineados fluidamente a la derecha del Pin */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            marginLeft: 16, // Espacio inteligente entre el pin y el texto
            maxWidth: 420,
          }}
        >
          {/* Línea 1 (Colonia) */}
          <div style={{ height: 38, display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
            <div
              style={{
                color: '#FFFFFF',
                fontSize: 26, // Ligeramente más pequeña para balancear
                fontWeight: 700,
                letterSpacing: -0.5,
                lineHeight: 1,
                clipPath: `inset(0 ${100 - (visibleLocationCharacters / locationText.length) * 100}% 0 0)`,
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                textShadow: "0px 2px 8px rgba(0, 0, 0, 0.9)",
              }}
            >
              {locationText}
            </div>
          </div>

          {/* Línea 2 (Ciudad / Estado) */}
          <div style={{ height: 26, display: 'flex', alignItems: 'center', overflow: 'hidden', marginTop: 2 }}>
            <div
              style={{
                color: '#E5E7EB',
                fontSize: 16, // Proporcional al nuevo contenedor
                fontWeight: 400,
                lineHeight: 1,
                clipPath: `inset(0 ${100 - (visibleVenueCharacters / venueText.length) * 100}% 0 0)`,
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                textShadow: "0px 2px 6px rgba(0, 0, 0, 0.9)",
              }}
            >
              {venueText}
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};