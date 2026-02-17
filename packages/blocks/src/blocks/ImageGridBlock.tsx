import React from 'react';
import { Grid } from '@ual/ui';

type ImageItem = { mediaId: string; alt?: string; caption?: string };
type Props = { readonly props: Record<string, unknown> };

export const ImageGridBlock: React.FC<Props> = ({ props }) => {
  const images = (props['images'] as ImageItem[]) ?? [];
  const columns = (props['columns'] as number) ?? 3;

  return (
    <Grid columns={columns} className="block block--image-grid">
      {images.map((img, i) => (
        <figure key={i}>
          <img src={`/media/${img.mediaId}`} alt={img.alt ?? ''} />
          {img.caption && <figcaption>{img.caption}</figcaption>}
        </figure>
      ))}
    </Grid>
  );
};
