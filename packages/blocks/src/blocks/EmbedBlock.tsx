import React from 'react';

type Props = { readonly props: Record<string, unknown> };

export const EmbedBlock: React.FC<Props> = ({ props }) => {
  const url = (props['url'] as string) ?? '';
  const caption = (props['caption'] as string) ?? '';

  if (!url) return null;

  return (
    <section className="block block--embed">
      <iframe src={url} loading="lazy" title={caption || 'Embedded content'} />
      {caption && <p>{caption}</p>}
    </section>
  );
};
