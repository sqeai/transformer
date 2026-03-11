'use client';

import { useTheme } from 'next-themes';

interface LivingBackgroundProps {
  variant?: 'default' | 'grid';
}

export function LivingBackground({ variant = 'default' }: LivingBackgroundProps) {
  const { resolvedTheme } = useTheme();
  const isGridVariant = variant === 'grid';

  return (
    <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden" aria-hidden>
      <div className="absolute inset-0 opacity-60">
        <div
          className="absolute inset-0 dark:opacity-0"
          style={{
            background: 'linear-gradient(160deg, #E6F0FF 0%, #D6E8F7 45%, #E0EFFF 100%)',
            opacity: isGridVariant ? 0 : undefined,
          }}
        />
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
      </div>
    </div>
  );
}
