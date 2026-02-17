import React from 'react';

type Props = { readonly props: Record<string, unknown> };

export const ImageBlock: React.FC<Props> = ({ props }) => {
  const mediaId = (props['mediaId'] as string) ?? '';
  const alt = (props['alt'] as string) ?? '';
  const caption = (props['caption'] as string) ?? '';
  const fullBleed = (props['fullBleed'] as boolean) ?? false;

  return (
    <figure className={`block block--image${fullBleed ? ' block--full-bleed' : ''}`}>
      {mediaId && <img src={`/media/${mediaId}`} alt={alt} />}
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
};
