'use client';

import { useMemo } from 'react';
import { useTheme } from 'next-themes';

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Light mode — soft pale blue / sky blue (celestial)
const LIGHT = {
  PIPE_TRACE: 'rgba(100, 149, 237, 0.28)',
  PIPE_GLOW: 'rgba(135, 206, 250, 0.48)',
  STAGE_FILL: 'rgba(176, 196, 222, 0.55)',
  STAGE_BORDER: 'rgba(25, 25, 112, 0.35)',
  STAGE_GLOW_FILL: 'rgba(25, 25, 112, 0.78)',
  STAGE_GLOW_NEIGHBOR: 'rgba(70, 130, 180, 0.5)',
  FLOW_HEAD: 'rgba(25, 25, 112, 0.25)',
  FLOW_TAIL: 'rgba(230, 240, 255, 0.2)',
} as const;

// Dark mode — deep blue / navy with steel-blue accent (pipeline control room)
const DARK = {
  PIPE_TRACE: 'rgba(70, 130, 180, 0.2)',
  PIPE_GLOW: 'rgba(100, 149, 237, 0.35)',
  STAGE_FILL: 'rgba(25, 25, 56, 0.55)',
  STAGE_BORDER: 'rgba(100, 149, 237, 0.45)',
  STAGE_GLOW_FILL: 'rgba(100, 149, 237, 0.82)',
  STAGE_GLOW_NEIGHBOR: 'rgba(30, 60, 100, 0.62)',
  FLOW_HEAD: 'rgba(173, 216, 230, 0.22)',
  FLOW_TAIL: 'rgba(10, 15, 35, 0.2)',
} as const;

const VIEW_W = 1000;
const VIEW_H = 800;

// Pipeline rows: each row is [y, stageCount]. Stages are evenly spaced horizontally, connected by pipes.
const PIPELINE_ROWS = [
  { y: 120, stages: 6 },
  { y: 280, stages: 5 },
  { y: 440, stages: 7 },
  { y: 600, stages: 5 },
  { y: 720, stages: 6 },
];

const STAGE_W = 72;
const STAGE_H = 36;
const PIPE_Y_OFFSET = 0; // center of stage vertically

// Build stage positions and pipe segments for each row
type Stage = { x: number; y: number; w: number; h: number; rowIndex: number; stageIndex: number };
type PipeSegment = { x1: number; y1: number; x2: number; y2: number; rowIndex: number; segmentIndex: number };

const { stages: STAGES, pipes: PIPE_SEGMENTS } = (() => {
  const stages: Stage[] = [];
  const pipes: PipeSegment[] = [];
  const padX = 80;

  PIPELINE_ROWS.forEach((row, rowIndex) => {
    const { y, stages: count } = row;
    const totalWidth = VIEW_W - 2 * padX;
    const gap = count > 1 ? (totalWidth - count * STAGE_W) / (count - 1) : 0;

    for (let i = 0; i < count; i++) {
      const x = padX + i * (STAGE_W + gap);
      stages.push({
        x,
        y: y - STAGE_H / 2,
        w: STAGE_W,
        h: STAGE_H,
        rowIndex,
        stageIndex: i,
      });
      // Pipe from this stage's right edge to next stage's left edge
      if (i < count - 1) {
        const x1 = x + STAGE_W;
        const x2 = padX + (i + 1) * (STAGE_W + gap);
        const cy = y + PIPE_Y_OFFSET;
        pipes.push({
          x1,
          y1: cy,
          x2,
          y2: cy,
          rowIndex,
          segmentIndex: i,
        });
      }
    }
  });

  return { stages, pipes };
})();

const STAGE_OPACITY_BASE = 0.5;
const STAGE_OPACITY_GLOW = 1;
const STAGE_OPACITY_NEIGHBOR = 0.5 + (STAGE_OPACITY_GLOW - STAGE_OPACITY_BASE) * 0.5;

function getStageNeighborIndices(index: number): number[] {
  const s = STAGES[index];
  const out: number[] = [];
  STAGES.forEach((other, i) => {
    if (i === index) return;
    if (other.rowIndex !== s.rowIndex) return;
    if (other.stageIndex === s.stageIndex - 1 || other.stageIndex === s.stageIndex + 1) out.push(i);
  });
  return out;
}

// Horizontal pipe paths for dashed animation (grid variant) — pipeline-style conduits
const H_PIPES = [
  { y: 140, d: 'M 0 140 L 1000 140', dash: 6, speed: 3.2 },
  { y: 300, d: 'M 0 300 L 200 300 L 200 320 L 500 320 L 500 300 L 1000 300', dash: 7, speed: 2.8 },
  { y: 320, d: 'M 0 320 L 1000 320', dash: 5, speed: 3.4 },
  { y: 460, d: 'M 0 460 L 1000 460', dash: 6, speed: 3.0 },
  { y: 620, d: 'M 0 620 L 320 620 L 320 640 L 680 640 L 680 620 L 1000 620', dash: 8, speed: 2.6 },
  { y: 640, d: 'M 0 640 L 1000 640', dash: 5, speed: 3.2 },
  { y: 740, d: 'M 0 740 L 1000 740', dash: 6, speed: 2.9 },
];

const V_PIPES = [
  { x: 100, d: 'M 100 0 L 100 800', dash: 6, speed: 3.0 },
  { x: 300, d: 'M 300 0 L 300 280 L 320 280 L 320 520 L 300 520 L 300 800', dash: 7, speed: 2.7 },
  { x: 500, d: 'M 500 0 L 500 800', dash: 5, speed: 3.3 },
  { x: 700, d: 'M 700 0 L 700 400 L 720 400 L 720 600 L 700 600 L 700 800', dash: 8, speed: 2.5 },
  { x: 900, d: 'M 900 0 L 900 800', dash: 6, speed: 3.1 },
];

/** Rounded rect path for pipeline stage */
function stagePath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(w, h) * 0.35;
  return `M ${x + r} ${y} L ${x + w - r} ${y} Q ${x + w} ${y} ${x + w} ${y + r} L ${x + w} ${y + h - r} Q ${x + w} ${y + h} ${x + w - r} ${y + h} L ${x + r} ${y + h} Q ${x} ${y + h} ${x} ${y + h - r} L ${x} ${y + r} Q ${x} ${y} ${x + r} ${y} Z`;
}

interface LivingBackgroundProps {
  variant?: 'default' | 'grid';
}

export function LivingBackground({ variant = 'default' }: LivingBackgroundProps) {
  const { resolvedTheme } = useTheme();
  const isGridVariant = variant === 'grid';
  const isDark = isGridVariant || resolvedTheme === 'dark';
  const c = isDark ? DARK : LIGHT;

  const glowOrder = useMemo(() => shuffle(STAGES.map((_, i) => i)), []);

  const n = STAGES.length;
  const quarter = Math.max(1, Math.floor(n / 4));
  const primaryIndex = glowOrder[0];
  const primaryIndex2 = glowOrder[quarter % n];
  const primaryIndex3 = glowOrder[(quarter * 2) % n];
  const primaryIndex4 = glowOrder[(quarter * 3) % n];
  const neighborSet = useMemo(() => {
    const set = new Set<number>([
      ...getStageNeighborIndices(primaryIndex),
      ...getStageNeighborIndices(primaryIndex2),
      ...getStageNeighborIndices(primaryIndex3),
      ...getStageNeighborIndices(primaryIndex4),
    ]);
    set.delete(primaryIndex);
    set.delete(primaryIndex2);
    set.delete(primaryIndex3);
    set.delete(primaryIndex4);
    return set;
  }, [primaryIndex, primaryIndex2, primaryIndex3, primaryIndex4]);

  return (
    <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden" aria-hidden>
      <div className="absolute inset-0 opacity-60">
        {/* Base gradient - light: soft pale blue / sky */}
        <div
          className="absolute inset-0 dark:opacity-0"
          style={{
            background: 'linear-gradient(160deg, #E6F0FF 0%, #D6E8F7 45%, #E0EFFF 100%)',
            opacity: isGridVariant ? 0 : undefined,
          }}
        />
        {/* Base gradient - dark: deep blue / navy (pipeline control) */}
        <div
          className="absolute inset-0 opacity-0 dark:opacity-100 transition-opacity duration-300"
          style={{
            background: isGridVariant
              ? 'linear-gradient(160deg, #0a0f1a 0%, #0f1729 35%, #1e3a5f 65%, #0d1525 100%)'
              : 'linear-gradient(160deg, #0A1628 0%, #0F2847 35%, #1A3A5C 65%, #0F1F33 100%)',
            opacity: isGridVariant ? 1 : undefined,
          }}
        />

        {!isGridVariant && (
          <div
            className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-[0.5]"
            style={{ backgroundImage: 'url(/hero-earth-overlay.png)' }}
          />
        )}

        <div
          className="absolute inset-0 opacity-[0.025] dark:opacity-[0.04]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'repeat',
          }}
        />
      </div>
    </div>
  );
}
