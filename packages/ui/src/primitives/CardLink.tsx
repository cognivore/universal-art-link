import React from 'react';

type Props = {
  readonly href: string;
  readonly children: React.ReactNode;
  readonly className?: string;
};

/**
 * The one blessed "fully clickable card" pattern.
 * One interactive root per card region -- no nested buttons inside links.
 * Tap target >= 44x44 enforced via min-height.
 */
export const CardLink: React.FC<Props> = ({ href, children, className }) => (
  <a
    href={href}
    className={className}
    style={{
      display: 'block',
      textDecoration: 'none',
      color: 'inherit',
      minHeight: '44px',
      minWidth: '44px',
      borderRadius: 'var(--radius-md, 8px)',
      transition: 'box-shadow 0.15s ease, transform 0.15s ease',
    }}
  >
    {children}
  </a>
);
