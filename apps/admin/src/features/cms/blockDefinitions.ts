import type { BlockDefinition } from './types';

const textBlock: BlockDefinition = {
  type: 'text',
  label: 'Text block',
  description: 'Stacked heading and paragraph copy.',
  template: {
    type: 'text',
    title: '',
    body: '',
  },
  fields: [
    { key: 'title', label: 'Title', type: 'text' },
    { key: 'body', label: 'Body', type: 'textarea' },
  ],
};

const imageBlock: BlockDefinition = {
  type: 'image',
  label: 'Image block',
  description: 'Single media with optional caption and bleed toggle.',
  template: {
    type: 'image',
    media: { src: '', alt: '' },
    caption: '',
    bleed: false,
  },
  fields: [
    { key: 'caption', label: 'Caption', type: 'text' },
    { key: 'bleed', label: 'Full-bleed', type: 'checkbox', default: false },
  ],
  groups: [
    {
      key: 'media',
      label: 'Media',
      fields: [
        { key: 'src', label: 'Image URL', type: 'text' },
        { key: 'alt', label: 'Alt text', type: 'text' },
      ],
    },
  ],
};

const imageGridBlock: BlockDefinition = {
  type: 'image-grid',
  label: 'Image grid',
  description: 'Two-up image grid with captions.',
  template: {
    type: 'image-grid',
    items: [
      { media: { src: '', alt: '' }, caption: '' },
      { media: { src: '', alt: '' }, caption: '' },
    ],
  },
  lists: [
    {
      key: 'items',
      label: 'Images',
      itemLabel: 'Image',
      fields: [{ key: 'caption', label: 'Caption', type: 'text' }],
      groups: [
        {
          key: 'media',
          label: 'Media',
          fields: [
            { key: 'src', label: 'Image URL', type: 'text' },
            { key: 'alt', label: 'Alt text', type: 'text' },
            { key: 'focalPoint', label: 'Focal point', type: 'select', options: ['left', 'center', 'right'], default: 'center' },
          ],
        },
      ],
    },
  ],
};

const quoteBlock: BlockDefinition = {
  type: 'quote',
  label: 'Quote',
  description: 'Pull quote with optional citation and role.',
  template: {
    type: 'quote',
    quote: '',
    cite: '',
    role: '',
  },
  fields: [
    { key: 'quote', label: 'Quote', type: 'textarea' },
    { key: 'cite', label: 'Attribution', type: 'text' },
    { key: 'role', label: 'Role', type: 'text' },
  ],
};

const embedBlock: BlockDefinition = {
  type: 'embed',
  label: 'Embed',
  description: 'Raw HTML embed for Vimeo, SoundCloud, etc.',
  template: {
    type: 'embed',
    label: '',
    html: '',
  },
  fields: [
    { key: 'label', label: 'Label', type: 'text' },
    { key: 'html', label: 'Embed HTML', type: 'textarea' },
  ],
};

export const blockDefinitions: Record<string, BlockDefinition> = {
  [textBlock.type]: textBlock,
  [imageBlock.type]: imageBlock,
  [imageGridBlock.type]: imageGridBlock,
  [quoteBlock.type]: quoteBlock,
  [embedBlock.type]: embedBlock,
};

export const blockDefinitionList = Object.values(blockDefinitions);

