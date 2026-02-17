import React from 'react';

type Props = { readonly props: Record<string, unknown> };

export const ContactFormBlock: React.FC<Props> = ({ props }) => {
  const heading = (props['heading'] as string) ?? '';
  const email = (props['email'] as string) ?? '';
  const description = (props['description'] as string) ?? '';

  return (
    <section className="block block--contact-form">
      {heading && <h2>{heading}</h2>}
      {description && <p>{description}</p>}
      {email && <a href={`mailto:${email}`} className="cta">{email}</a>}
    </section>
  );
};
