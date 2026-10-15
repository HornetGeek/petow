/**
 * SVG illustrations for the home screen, ported from the Stitch HTML
 * design v2. Each component is memoized and accepts an explicit `size`
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
  Rect,
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
// Sliders icon — refined: thinner strokes (1.8) and white-filled dots.
// ─────────────────────────────────────────────────────────────────────────
export const SlidersIcon: React.FC<IconProps> = React.memo(({ size = 26, color = '#2d9e99' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <G stroke={color} strokeWidth={1.8} strokeLinecap="round">
      <Line x1={4} y1={6} x2={20} y2={6} />
      <Line x1={4} y1={12} x2={20} y2={12} />
      <Line x1={4} y1={18} x2={20} y2={18} />
    </G>
    <G fill="#ffffff" stroke={color} strokeWidth={1.8}>
      <Circle cx={9} cy={6} r={2.1} />
      <Circle cx={15} cy={12} r={2.1} />
      <Circle cx={11} cy={18} r={2.1} />
    </G>
  </Svg>
));

// ─────────────────────────────────────────────────────────────────────────
// Adoption tile (v2) — refined heart with cleaner paw cluster.
// ─────────────────────────────────────────────────────────────────────────
export const AdoptionIllustration: React.FC<{ size?: number }> = React.memo(({ size = 62 }) => (
  <Svg width={size} height={size} viewBox="0 0 64 64">
    <Defs>
      <LinearGradient id="adoptionHeartV2" x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0%" stopColor="#FFC1CD" />
        <Stop offset="100%" stopColor="#F39AB1" />
      </LinearGradient>
    </Defs>
    <Path
      d="M32 54C17.5 43.5 10 35.7 10 24.8C10 17.8 15.5 13 22 13C26.3 13 29.7 14.8 32 18C34.3 14.8 37.7 13 42 13C48.5 13 54 17.8 54 24.8C54 35.7 46.5 43.5 32 54Z"
      fill="url(#adoptionHeartV2)"
    />
    <G fill="#FFF7F2">
      <Circle cx={24} cy={25} r={3.6} />
      <Circle cx={40} cy={25} r={3.6} />
      <Circle cx={28} cy={19.5} r={3.2} />
      <Circle cx={36} cy={19.5} r={3.2} />
      <Path d="M32 38c-5.7 0-9.3-2.7-9.3-6.8 0-2.7 2-4.6 4.6-4.6 1.9 0 3.3.8 4.7 2.3 1.4-1.5 2.8-2.3 4.7-2.3 2.6 0 4.6 1.9 4.6 4.6 0 4.1-3.6 6.8-9.3 6.8z" />
    </G>
  </Svg>
));

// ─────────────────────────────────────────────────────────────────────────
// Matches tile (v2) — two pad-rings with diamond gems above each.
// ─────────────────────────────────────────────────────────────────────────
export const MatchesIllustration: React.FC<{ size?: number }> = React.memo(({ size = 62 }) => (
  <Svg width={size} height={size} viewBox="0 0 64 64">
    <Defs>
      <LinearGradient id="matchesRingV2" x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0%" stopColor="#F4C7A7" />
        <Stop offset="100%" stopColor="#D89D75" />
      </LinearGradient>
      <LinearGradient id="matchesDiamondV2" x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0%" stopColor="#BDEBFF" />
        <Stop offset="100%" stopColor="#87CFFF" />
      </LinearGradient>
    </Defs>
    <G fill="none" stroke="url(#matchesRingV2)" strokeWidth={5.5}>
      <Circle cx={24} cy={35} r={12} />
      <Circle cx={40} cy={35} r={12} />
    </G>
    <G>
      <Path d="M17 14l4-4 4 4-4 4-4-4z" fill="url(#matchesDiamondV2)" />
      <Path d="M43 14l4-4 4 4-4 4-4-4z" fill="url(#matchesDiamondV2)" />
      <Path d="M18 18h6" stroke="#8FD4FF" strokeWidth={1.4} strokeLinecap="round" />
      <Path d="M44 18h6" stroke="#8FD4FF" strokeWidth={1.4} strokeLinecap="round" />
    </G>
  </Svg>
));

// ─────────────────────────────────────────────────────────────────────────
// Add-pet tile (v2) — chunkier plus with clustered paw at bottom-right.
// ─────────────────────────────────────────────────────────────────────────
export const AddPetIllustration: React.FC<{ size?: number }> = React.memo(({ size = 62 }) => (
  <Svg width={size} height={size} viewBox="0 0 64 64">
    <Defs>
      <LinearGradient id="addPetPlusV2" x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0%" stopColor="#60E0D2" />
        <Stop offset="100%" stopColor="#2EB8B0" />
      </LinearGradient>
      <LinearGradient id="addPetPawV2" x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0%" stopColor="#F4C6A2" />
        <Stop offset="100%" stopColor="#D8A57A" />
      </LinearGradient>
    </Defs>
    <Path
      d="M27 12c0-2.2 1.8-4 4-4h2c2.2 0 4 1.8 4 4v11h11c2.2 0 4 1.8 4 4v2c0 2.2-1.8 4-4 4H37v11c0 2.2-1.8 4-4 4h-2c-2.2 0-4-1.8-4-4V33H16c-2.2 0-4-1.8-4-4v-2c0-2.2 1.8-4 4-4h11V12z"
      fill="url(#addPetPlusV2)"
    />
    <G x={39} y={37} fill="url(#addPetPawV2)">
      <Circle cx={39 + 4} cy={37 + 4.5} r={2.4} />
      <Circle cx={39 + 11} cy={37 + 2.6} r={2.2} />
      <Circle cx={39 + 10} cy={37 + 9.5} r={2.2} />
      <Circle cx={39 + 17} cy={37 + 7} r={2.2} />
      <Path d="M49 55c-3.8 0-6.4-2.3-6.4-5.3 0-2.1 1.6-3.7 3.7-3.7 1.5 0 2.6.7 3.5 1.8.9-1.1 2-1.8 3.5-1.8 2.1 0 3.7 1.6 3.7 3.7 0 3-2.6 5.3-6.4 5.3H49z" />
    </G>
  </Svg>
));

// ─────────────────────────────────────────────────────────────────────────
// Vaccination service icon (v2) — needle with bandage diamonds.
// ─────────────────────────────────────────────────────────────────────────
export const VaccinationIcon: React.FC<IconProps> = React.memo(({ size = 58, color = '#37a7a2' }) => (
  <Svg width={size} height={size} viewBox="0 0 64 64" fill="none">
    <G stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M42 11l11 11" />
      <Path d="M44 9l13 13" />
      <Path d="M27 24l13 13" />
      <Path d="M20 31l13 13" />
      <Path d="M16 35l13 13" />
      <Path d="M14 50l8-8" />
    </G>
    <Path d="M39 14l11 11-12 12-11-11 12-12z" fill="#A6E7E1" stroke={color} strokeWidth={2.5} />
    <Path d="M22 31l11 11-12 12-11-11 12-12z" fill="#D7F6F3" stroke={color} strokeWidth={2.5} />
  </Svg>
));

// ─────────────────────────────────────────────────────────────────────────
// Grooming service icon (v2) — scissors + comb assembly.
// ─────────────────────────────────────────────────────────────────────────
export const GroomingIcon: React.FC<IconProps> = React.memo(({ size = 58, color = '#37a7a2' }) => (
  <Svg width={size} height={size} viewBox="0 0 64 64" fill="none">
    <G stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={16} cy={20} r={5} />
      <Circle cx={16} cy={44} r={5} />
      <Path d="M20 24l16 16" />
      <Path d="M20 40l16-16" />
      <Path d="M36 32l8 0" />
      <Rect x={42} y={16} width={12} height={28} rx={2.5} />
      <Path d="M42 47h12" />
      <Path d="M45 16v-3" />
      <Path d="M49 16v-3" />
      <Path d="M53 16v-3" />
    </G>
  </Svg>
));

// ─────────────────────────────────────────────────────────────────────────
// Dental service icon (v2) — single tooth outline.
// ─────────────────────────────────────────────────────────────────────────
export const DentalIcon: React.FC<IconProps> = React.memo(({ size = 58, color = '#37a7a2' }) => (
  <Svg width={size} height={size} viewBox="0 0 64 64" fill="none">
    <Path
      d="M32 10c-6.8 0-13 1.7-16.7 5.7-3 3.2-4.1 7.6-3.2 12.5 1.4 7.7 4.3 12.5 6.8 16 2 2.8 3.4 5.8 4.9 5.8 1.8 0 2.4-2.7 3.2-6.4.8-4 1.9-7.6 5-7.6s4.2 3.6 5 7.6c.8 3.7 1.4 6.4 3.2 6.4 1.5 0 2.9-3 4.9-5.8 2.5-3.5 5.4-8.3 6.8-16 .9-4.9-.2-9.3-3.2-12.5C45 11.7 38.8 10 32 10z"
      stroke={color}
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
));

// ─────────────────────────────────────────────────────────────────────────
// Heart fav button overlay (v2) — gradient heart, refined path.
// ─────────────────────────────────────────────────────────────────────────
export const FavHeartIcon: React.FC<{ size?: number }> = React.memo(({ size = 19 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Defs>
      <LinearGradient id="favHeartGrad" x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0%" stopColor="#FF8DA8" />
        <Stop offset="100%" stopColor="#F05D80" />
      </LinearGradient>
    </Defs>
    <Path
      d="M12 20.7s-6.5-4.2-8.9-7.8C1 10.2 1.5 6.9 4.4 5.5c2-.9 4.4-.4 5.9 1.3L12 8.5l1.7-1.7c1.5-1.7 3.9-2.2 5.9-1.3 2.9 1.4 3.4 4.7 1.3 7.4-2.4 3.6-8.9 7.8-8.9 7.8z"
      fill="url(#favHeartGrad)"
    />
  </Svg>
));
