/**
 * SVG illustrations for the home screen, ported from the Stitch HTML
 * design. Each component is memoized and accepts an explicit `size`
 * (square; the source viewBoxes are square). Icons whose source uses
 * `currentColor` accept an optional `color` prop so callers can tint.
 */
import React from 'react';
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient,
  Path,
  Stop,
} from 'react-native-svg';

type IconProps = { size?: number; color?: string };

// ─────────────────────────────────────────────────────────────────────────
// Hero avatar fallback — cute character face inside a soft circle.
// ─────────────────────────────────────────────────────────────────────────
export const HeroAvatarFace: React.FC<{ size?: number }> = React.memo(({ size = 80 }) => (
  <Svg width={size} height={size} viewBox="0 0 80 80">
    <Circle cx={40} cy={40} r={40} fill="#C8EEE8" />
    <Path
      d="M22 67C22 56.5066 30.5066 48 41 48H42C52.4934 48 61 56.5066 61 67V73H22V67Z"
      fill="#F5C06A"
    />
    <Circle cx={41} cy={30} r={14} fill="#FFD9B3" />
    <Path
      d="M30 23C31.5 15 39.5 11 46 13C52 14.8 56 20 55 27C49 26 46 22 43.5 19.5C40.5 23.5 35.5 25.5 30 23Z"
      fill="#6A4434"
    />
    <Circle cx={36} cy={31} r={1.8} fill="#2A2A2A" />
    <Circle cx={46} cy={31} r={1.8} fill="#2A2A2A" />
    <Path
      d="M37 37C39.5 39.5 43 39.5 45 37"
      stroke="#A35A4E"
      strokeWidth={2.2}
      strokeLinecap="round"
      fill="none"
    />
  </Svg>
));

// ─────────────────────────────────────────────────────────────────────────
// Sliders icon for the search card. `color` tints both lines and dots.
// ─────────────────────────────────────────────────────────────────────────
export const SlidersIcon: React.FC<IconProps> = React.memo(({ size = 28, color = '#149995' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Line x1={4} y1={6} x2={20} y2={6} stroke={color} strokeWidth={2} />
    <Circle cx={9} cy={6} r={2} fill="white" stroke={color} strokeWidth={2} />
    <Line x1={4} y1={12} x2={20} y2={12} stroke={color} strokeWidth={2} />
    <Circle cx={15} cy={12} r={2} fill="white" stroke={color} strokeWidth={2} />
    <Line x1={4} y1={18} x2={20} y2={18} stroke={color} strokeWidth={2} />
    <Circle cx={11} cy={18} r={2} fill="white" stroke={color} strokeWidth={2} />
  </Svg>
));

// ─────────────────────────────────────────────────────────────────────────
// Adoption tile — pink heart with paw prints inside.
// ─────────────────────────────────────────────────────────────────────────
export const AdoptionIllustration: React.FC<{ size?: number }> = React.memo(({ size = 54 }) => (
  <Svg width={size} height={size} viewBox="0 0 64 64">
    <Defs>
      <LinearGradient id="adoptionGrad" x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0%" stopColor="#FF9AB0" />
        <Stop offset="100%" stopColor="#F07B97" />
      </LinearGradient>
    </Defs>
    <Path
      d="M32 55C18 45 10 37 10 25C10 18 15 13 21 13C25.5 13 29 15.5 32 19C35 15.5 38.5 13 43 13C49 13 54 18 54 25C54 37 46 45 32 55Z"
      fill="url(#adoptionGrad)"
    />
    <G fill="#FFF7F2">
      <Circle cx={22} cy={27} r={4.5} />
      <Circle cx={42} cy={27} r={4.5} />
      <Circle cx={28} cy={20} r={4} />
      <Circle cx={36} cy={20} r={4} />
      <Path d="M32 39C25.5 39 22 35.5 22 31.5C22 28.5 24.4 26.5 27.2 26.5C29.4 26.5 30.8 27.7 32 29.3C33.2 27.7 34.6 26.5 36.8 26.5C39.6 26.5 42 28.5 42 31.5C42 35.5 38.5 39 32 39Z" />
    </G>
  </Svg>
));

// ─────────────────────────────────────────────────────────────────────────
// Matches tile — two intersecting circles with sparkles.
// ─────────────────────────────────────────────────────────────────────────
export const MatchesIllustration: React.FC<{ size?: number }> = React.memo(({ size = 54 }) => (
  <Svg width={size} height={size} viewBox="0 0 64 64">
    <Defs>
      <LinearGradient id="matchesGrad" x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0%" stopColor="#E5B28D" />
        <Stop offset="100%" stopColor="#D18E67" />
      </LinearGradient>
    </Defs>
    <G fill="none" stroke="url(#matchesGrad)" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={24} cy={34} r={12} />
      <Circle cx={40} cy={34} r={12} />
    </G>
    <G fill="#8EDBFF">
      <Path d="M46 13l8 3-6 6-2-9z" />
      <Path d="M18 13l8 3-6 6-2-9z" opacity={0.7} />
    </G>
  </Svg>
));

// ─────────────────────────────────────────────────────────────────────────
// Add-pet tile — teal plus with paw prints scattered.
// ─────────────────────────────────────────────────────────────────────────
export const AddPetIllustration: React.FC<{ size?: number }> = React.memo(({ size = 54 }) => (
  <Svg width={size} height={size} viewBox="0 0 64 64">
    <Defs>
      <LinearGradient id="addPetGrad" x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0%" stopColor="#4ED4C7" />
        <Stop offset="100%" stopColor="#1CA8A2" />
      </LinearGradient>
    </Defs>
    <Path
      d="M28 12C28 9.8 29.8 8 32 8C34.2 8 36 9.8 36 12V24H48C50.2 24 52 25.8 52 28C52 30.2 50.2 32 48 32H36V44C36 46.2 34.2 48 32 48C29.8 48 28 46.2 28 44V32H16C13.8 32 12 30.2 12 28C12 25.8 13.8 24 16 24H28V12Z"
      fill="url(#addPetGrad)"
    />
    <G fill="#E9C09A">
      <Circle cx={44.5} cy={44} r={3.5} />
      <Circle cx={53} cy={41} r={3.2} />
      <Circle cx={50} cy={49} r={3.2} />
      <Circle cx={58} cy={47} r={3.2} />
      <Path d="M51.5 58C47.2 58 44 55.3 44 51.7C44 49.2 45.9 47.5 48.2 47.5C50 47.5 51.2 48.4 52 49.7C52.8 48.4 54 47.5 55.8 47.5C58.1 47.5 60 49.2 60 51.7C60 55.3 56.8 58 52.5 58H51.5Z" />
    </G>
  </Svg>
));

// ─────────────────────────────────────────────────────────────────────────
// Vaccination service icon — bandage / X-shaped patches.
// ─────────────────────────────────────────────────────────────────────────
export const VaccinationIcon: React.FC<IconProps> = React.memo(({ size = 54, color = '#39a9a4' }) => (
  <Svg width={size} height={size} viewBox="0 0 64 64" fill="none">
    <Path d="M45 10L54 19L38 35L29 26L45 10Z" fill="#7BD8D2" />
    <Path d="M26 29L10 45L19 54L35 38L26 29Z" fill="#9FE7E1" />
    <Path d="M47 8L56 17" stroke={color} strokeWidth={3} strokeLinecap="round" />
    <Path d="M8 56L18 46" stroke={color} strokeWidth={3} strokeLinecap="round" />
  </Svg>
));

// ─────────────────────────────────────────────────────────────────────────
// Grooming service icon — clippers.
// ─────────────────────────────────────────────────────────────────────────
export const GroomingIcon: React.FC<IconProps> = React.memo(({ size = 54, color = '#39a9a4' }) => (
  <Svg width={size} height={size} viewBox="0 0 64 64" fill="none">
    <Path d="M18 10L28 20L17 31L7 21L18 10Z" stroke={color} strokeWidth={3} />
    <Path d="M32 13L51 32" stroke={color} strokeWidth={3} strokeLinecap="round" />
    <Path d="M28 36L47 55" stroke={color} strokeWidth={3} strokeLinecap="round" />
    <Path d="M44 12H54V44H44V12Z" stroke={color} strokeWidth={3} />
    <Path d="M48 16V40" stroke={color} strokeWidth={3} />
  </Svg>
));

// ─────────────────────────────────────────────────────────────────────────
// Dental service icon — a tooth.
// ─────────────────────────────────────────────────────────────────────────
export const DentalIcon: React.FC<IconProps> = React.memo(({ size = 54, color = '#39a9a4' }) => (
  <Svg width={size} height={size} viewBox="0 0 64 64" fill="none">
    <Path
      d="M32 10C20 10 10 20 10 33C10 43 17 52 27 54H37C47 52 54 43 54 33C54 20 44 10 32 10Z"
      stroke={color}
      strokeWidth={3}
    />
    <Path d="M25 39C27 42 37 42 39 39" stroke={color} strokeWidth={3} strokeLinecap="round" />
    <Path
      d="M24 25C24 22.8 25.8 21 28 21H36C38.2 21 40 22.8 40 25V32C40 34.2 38.2 36 36 36H28C25.8 36 24 34.2 24 32V25Z"
      stroke={color}
      strokeWidth={3}
    />
  </Svg>
));

// ─────────────────────────────────────────────────────────────────────────
// Heart fav button overlay on pet cards.
// ─────────────────────────────────────────────────────────────────────────
export const FavHeartIcon: React.FC<IconProps> = React.memo(({ size = 20, color = '#ef6b8d' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path
      d="M12 21s-6.7-4.3-9.2-8C.8 10.5 1.3 6.8 4.5 5.3C6.7 4.2 9.2 4.8 10.8 6.5L12 7.8L13.2 6.5C14.8 4.8 17.3 4.2 19.5 5.3C22.7 6.8 23.2 10.5 21.2 13C18.7 16.7 12 21 12 21Z"
      fill={color}
    />
  </Svg>
));
