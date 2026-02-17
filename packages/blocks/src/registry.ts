import React from 'react';
import type { BlockType } from '@ual/core';
import { HeroBlock } from './blocks/HeroBlock.js';
import { TextBlock } from './blocks/TextBlock.js';
import { ImageBlock } from './blocks/ImageBlock.js';
import { ImageGridBlock } from './blocks/ImageGridBlock.js';
import { QuoteBlock } from './blocks/QuoteBlock.js';
import { EmbedBlock } from './blocks/EmbedBlock.js';
import { ContactFormBlock } from './blocks/ContactFormBlock.js';

type BlockComponent = React.FC<{ props: Record<string, unknown> }>;

/**
 * Block component registry.
 * Maps block type string to its React component.
 * Used by both admin preview and renderer.
 */
export const blockRegistry: Record<BlockType, BlockComponent> = {
  hero: HeroBlock,
  text: TextBlock,
  image: ImageBlock,
  imageGrid: ImageGridBlock,
  quote: QuoteBlock,
  embed: EmbedBlock,
  projectsGrid: ({ props }) => React.createElement('div', null, `Projects grid (${(props['columns'] as number) ?? 3} cols)`),
  contactForm: ContactFormBlock,
  blogRoll: ({ props }) => React.createElement('div', null, `Blog roll (max ${(props['maxPosts'] as number) ?? 10})`),
};

/** Render a block by type. Returns null for unknown types. */
export const renderBlockComponent = (
  type: string,
  props: Record<string, unknown>,
): React.ReactElement | null => {
  const Component = blockRegistry[type as BlockType];
  if (!Component) return null;
  return React.createElement(Component, { props });
};
