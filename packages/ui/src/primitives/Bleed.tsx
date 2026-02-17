import React from 'react';

type Props = {
  readonly children: React.ReactNode;
  readonly className?: string;
};

/** Full-bleed container that breaks out of content column. */
export const Bleed: React.FC<Props> = ({ children, className }) => (
  <div
    className={className}
    style={{
      width: '100vw',
      position: 'relative',
      left: '50%',
      marginLeft: '-50vw',
    }}
  >
    {children}
  </div>
);
