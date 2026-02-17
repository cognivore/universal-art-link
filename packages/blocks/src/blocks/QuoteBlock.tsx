import React from 'react';

type Props = { readonly props: Record<string, unknown> };

export const QuoteBlock: React.FC<Props> = ({ props }) => {
  const text = (props['text'] as string) ?? '';
  const attribution = (props['attribution'] as string) ?? '';

  return (
    <blockquote className="block block--quote">
      <p>{text}</p>
      {attribution && <cite>{attribution}</cite>}
    </blockquote>
  );
};
