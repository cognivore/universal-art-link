export type FieldDefinition = {
  readonly key: string;
  readonly label: string;
  readonly type: string;
  readonly placeholder?: string;
  readonly options?: ReadonlyArray<string>;
  readonly default?: unknown;
};

export type GroupDefinition = {
  readonly key: string;
  readonly label: string;
  readonly optional?: boolean;
  readonly default?: unknown;
  readonly fields?: ReadonlyArray<FieldDefinition>;
  readonly groups?: ReadonlyArray<GroupDefinition>;
  readonly lists?: ReadonlyArray<ListDefinition>;
};

export type ListDefinition = {
  readonly key: string;
  readonly label: string;
  readonly itemLabel?: string;
  readonly default?: unknown;
  readonly itemTemplate?: Record<string, unknown>;
  readonly fields?: ReadonlyArray<FieldDefinition>;
  readonly groups?: ReadonlyArray<GroupDefinition>;
  readonly lists?: ReadonlyArray<ListDefinition>;
};

export type SectionDefinition = {
  readonly type: string;
  readonly label?: string;
  readonly description?: string;
  readonly mode?: 'json' | 'form';
  readonly defaults?: Record<string, unknown>;
  readonly fields?: ReadonlyArray<FieldDefinition>;
  readonly lists?: ReadonlyArray<ListDefinition>;
  readonly groups?: ReadonlyArray<GroupDefinition>;
};

export type SchemaDefinition = {
  readonly site?: {
    readonly title?: string;
    readonly fields?: ReadonlyArray<FieldDefinition>;
    readonly lists?: ReadonlyArray<ListDefinition>;
    readonly groups?: ReadonlyArray<GroupDefinition>;
  };
  readonly page?: {
    readonly title?: string;
    readonly fields?: ReadonlyArray<FieldDefinition>;
    readonly defaults?: Record<string, unknown>;
    readonly lists?: ReadonlyArray<ListDefinition>;
    readonly groups?: ReadonlyArray<GroupDefinition>;
  };
  readonly sections?: ReadonlyArray<SectionDefinition>;
};

export type ContentPage = {
  readonly data: Record<string, unknown>;
};

export type ContentPayload = {
  readonly site: Record<string, unknown>;
  readonly pages: ContentPage[];
};

export type EditorStatus = {
  readonly message: string;
  readonly variant: 'muted' | 'success' | 'error';
};

