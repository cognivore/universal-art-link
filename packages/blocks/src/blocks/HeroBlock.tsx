import React from 'react';

type Props = { readonly props: Record<string, unknown> };

export const HeroBlock: React.FC<Props> = ({ props }) => {
  const heading = (props['heading'] as string) ?? '';
  const subheading = (props['subheading'] as string) ?? '';
  const ctaLabel = (props['ctaLabel'] as string) ?? '';
  const ctaUrl = (props['ctaUrl'] as string) ?? '';

  return (
    <section className="block block--hero">
      {heading && <h1>{heading}</h1>}
      {subheading && <p className="hero-sub">{subheading}</p>}
      {ctaUrl && <a href={ctaUrl} className="cta">{ctaLabel}</a>}
    </section>
  );
};
