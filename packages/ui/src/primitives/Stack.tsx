import React from 'react';

type Props = {
  readonly gap?: number;
  readonly as?: keyof JSX.IntrinsicElements;
  readonly children: React.ReactNode;
  readonly className?: string;
};

/** Vertical rhythm stack. Gap in spacing units (multiples of --spacing-unit). */
export const Stack: React.FC<Props> = ({ gap = 2, as: Tag = 'div', children, className }) => (
  <Tag
    className={className}
    style={{
      display: 'flex',
      flexDirection: 'column',
      gap: `calc(var(--spacing-unit, 8px) * ${gap})`,
    }}
  >
    {children}
  </Tag>
);
