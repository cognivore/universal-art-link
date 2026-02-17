import React from 'react';

type Props = {
  readonly columns?: number;
  readonly gap?: number;
  readonly children: React.ReactNode;
  readonly className?: string;
};

/**
 * Magazine grid with responsive breakpoints.
 * Columns collapse to 1 on narrow viewports via CSS clamp.
 */
export const Grid: React.FC<Props> = ({ columns = 3, gap = 2, children, className }) => (
  <div
    className={className}
    style={{
      display: 'grid',
      gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${Math.floor(960 / columns)}px), 1fr))`,
      gap: `calc(var(--spacing-unit, 8px) * ${gap})`,
    }}
  >
    {children}
  </div>
);
