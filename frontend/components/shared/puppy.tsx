import { cn } from '@/lib/utils';

/**
 * "Star", the school's puppy mascot: an original SVG drawing (no image files, sharp at any size).
 * Animations (tail wag, blink, paw wave, floating hearts / z's) live in globals.css and stop for reduced motion.
 */
const OUTLINE = '#5A3E2B';
const FUR = '#F4D9B0';
const CREAM = '#FFF4E3';
const EAR = '#B9784A';
const PATCH = '#E7B77F';
const CORAL = '#FF7A6B';
const SUNNY = '#FFC93C';

function starPoints(cx: number, cy: number, outer: number, inner: number) {
  return Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 ? inner : outer;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  }).join(' ');
}

const HEART = 'M0 -3 C -3 -8 -10 -6 -10 0 C -10 5 -3 9 0 12 C 3 9 10 5 10 0 C 10 -6 3 -8 0 -3 Z';

export function Puppy({
  mood = 'happy',
  wave = false,
  hearts = false,
  className,
  label,
}: {
  mood?: 'happy' | 'sleepy';
  /** Raise the right front paw and wave hello. */
  wave?: boolean;
  /** Little hearts floating above the head. */
  hearts?: boolean;
  className?: string;
  /** Accessible name; the drawing is decorative when omitted. */
  label?: string;
}) {
  const sleepy = mood === 'sleepy';
  return (
    <svg
      viewBox="0 0 200 220"
      className={cn('overflow-visible', className)}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {/* Tail, behind the body */}
      <g className={sleepy ? undefined : 'puppy-tail'} style={{ transformOrigin: '140px 172px' }}>
        <path
          d="M140 172 C 164 166, 176 142, 168 122"
          fill="none"
          stroke={OUTLINE}
          strokeWidth={17}
          strokeLinecap="round"
        />
        <path
          d="M140 172 C 164 166, 176 142, 168 122"
          fill="none"
          stroke={FUR}
          strokeWidth={11}
          strokeLinecap="round"
        />
      </g>

      {/* Body, belly and feet */}
      <ellipse cx={100} cy={168} rx={50} ry={44} fill={FUR} stroke={OUTLINE} strokeWidth={3} />
      <ellipse cx={100} cy={178} rx={28} ry={28} fill={CREAM} />
      <ellipse cx={62} cy={204} rx={21} ry={11} fill={FUR} stroke={OUTLINE} strokeWidth={3} />
      <ellipse cx={138} cy={204} rx={21} ry={11} fill={FUR} stroke={OUTLINE} strokeWidth={3} />
      <ellipse cx={84} cy={205} rx={13} ry={10} fill={CREAM} stroke={OUTLINE} strokeWidth={3} />
      {!wave && <ellipse cx={116} cy={205} rx={13} ry={10} fill={CREAM} stroke={OUTLINE} strokeWidth={3} />}
      <path d="M80 207 v4 M88 207 v4" stroke={OUTLINE} strokeWidth={2} strokeLinecap="round" />
      {!wave && <path d="M112 207 v4 M120 207 v4" stroke={OUTLINE} strokeWidth={2} strokeLinecap="round" />}

      {/* Collar with the school's gold star tag */}
      <path d="M62 130 Q100 150 138 130" fill="none" stroke={OUTLINE} strokeWidth={14} strokeLinecap="round" />
      <path d="M62 130 Q100 150 138 130" fill="none" stroke={CORAL} strokeWidth={9} strokeLinecap="round" />
      <polygon
        points={starPoints(100, 150, 10, 4.5)}
        fill={SUNNY}
        stroke={OUTLINE}
        strokeWidth={2}
        strokeLinejoin="round"
      />

      {/* Head */}
      <ellipse cx={100} cy={90} rx={52} ry={46} fill={FUR} stroke={OUTLINE} strokeWidth={3} />
      <ellipse cx={79} cy={86} rx={16} ry={18} fill={PATCH} />
      <ellipse cx={100} cy={52} rx={12} ry={6} fill={PATCH} />
      {/* Floppy ears */}
      <path
        d="M58 60 C 32 64, 26 108, 42 128 C 51 139, 67 129, 67 112 C 67 94, 72 76, 58 60 Z"
        fill={EAR}
        stroke={OUTLINE}
        strokeWidth={3}
        strokeLinejoin="round"
      />
      <path
        d="M142 60 C 168 64, 174 108, 158 128 C 149 139, 133 129, 133 112 C 133 94, 128 76, 142 60 Z"
        fill={EAR}
        stroke={OUTLINE}
        strokeWidth={3}
        strokeLinejoin="round"
      />

      {/* Eyes */}
      {sleepy ? (
        <path
          d="M71 90 Q80 97 89 90 M111 90 Q120 97 129 90"
          fill="none"
          stroke={OUTLINE}
          strokeWidth={3.2}
          strokeLinecap="round"
        />
      ) : (
        <g className="puppy-blink">
          <ellipse cx={80} cy={88} rx={8.5} ry={10.5} fill="#2B2118" />
          <ellipse cx={120} cy={88} rx={8.5} ry={10.5} fill="#2B2118" />
          <circle cx={83} cy={84} r={3.2} fill="#fff" />
          <circle cx={123} cy={84} r={3.2} fill="#fff" />
          <circle cx={77.5} cy={92.5} r={1.5} fill="#fff" />
          <circle cx={117.5} cy={92.5} r={1.5} fill="#fff" />
        </g>
      )}

      {/* Cheeks, muzzle, nose and mouth */}
      <ellipse cx={64} cy={108} rx={8} ry={5} fill="#FF9AA2" opacity={0.6} />
      <ellipse cx={136} cy={108} rx={8} ry={5} fill="#FF9AA2" opacity={0.6} />
      <ellipse cx={100} cy={111} rx={24} ry={17} fill={CREAM} />
      {!sleepy && (
        <>
          <path
            d="M94 117 Q94 131 100 131 Q106 131 106 117 Z"
            fill="#FF7A8A"
            stroke={OUTLINE}
            strokeWidth={2}
            strokeLinejoin="round"
          />
          <path d="M100 120 V127" stroke="#E0566B" strokeWidth={1.6} strokeLinecap="round" />
        </>
      )}
      <path
        d={sleepy ? 'M100 109 V113 M93 114 Q100 118 107 114' : 'M100 109 V115 M88 114 Q94 121 100 115 Q106 121 112 114'}
        fill="none"
        stroke={OUTLINE}
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M89 100 Q100 93 111 100 Q109 108 100 110 Q91 108 89 100 Z" fill="#3B2A1F" />
      <ellipse cx={96} cy={99.5} rx={3.2} ry={1.7} fill="#fff" opacity={0.8} />

      {/* Waving paw, in front of the head so the ear never hides it */}
      {wave && (
        <g className="puppy-wave" style={{ transformOrigin: '132px 150px' }}>
          <path
            d="M130 152 C 150 146, 168 130, 176 108"
            fill="none"
            stroke={OUTLINE}
            strokeWidth={21}
            strokeLinecap="round"
          />
          <path
            d="M130 152 C 150 146, 168 130, 176 108"
            fill="none"
            stroke={FUR}
            strokeWidth={15}
            strokeLinecap="round"
          />
          <circle cx={178} cy={100} r={14} fill={CREAM} stroke={OUTLINE} strokeWidth={3} />
          <circle cx={178} cy={104} r={4.8} fill="#FF9AA2" />
          <circle cx={170.5} cy={95} r={2.6} fill="#FF9AA2" />
          <circle cx={178} cy={91.5} r={2.6} fill="#FF9AA2" />
          <circle cx={185.5} cy={95} r={2.6} fill="#FF9AA2" />
        </g>
      )}

      {sleepy && (
        <g fill="#6A5CF0" fontFamily="inherit" fontWeight={800}>
          <text x={146} y={48} fontSize={30} className="puppy-z">
            z
          </text>
          <text x={168} y={24} fontSize={22} className="puppy-z puppy-z-2">
            z
          </text>
        </g>
      )}
      {hearts && !sleepy && (
        <>
          {/* Position on the group: the CSS animation replaces the inner path's transform. */}
          <g transform="translate(40 30) scale(0.9)">
            <path d={HEART} fill={CORAL} className="puppy-heart" />
          </g>
          <g transform="translate(160 22) scale(0.7)">
            <path d={HEART} fill="#FF9AA2" className="puppy-heart puppy-heart-2" />
          </g>
        </>
      )}
    </svg>
  );
}
