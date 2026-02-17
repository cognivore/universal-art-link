import React from 'react';

type Props = { readonly props: Record<string, unknown> };

export const TextBlock: React.FC<Props> = ({ props }) => {
  const body = (props['body'] as string) ?? '';
  const alignment = (props['alignment'] as string) ?? 'left';

  return (
    <section className="block block--text" style={{ textAlign: alignment as 'left' | 'center' | 'right' }}>
      <div>{body}</div>
    </section>
  );
};
