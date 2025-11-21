import type { SchemaDefinition, SectionDefinition } from './types';

export const clone = <T>(value: T): T => structuredClone(value);

const dotPattern = /\./g;

export const pathSegments = (path: string): Array<string | number> =>
  path
    .split('.')
    .filter(Boolean)
    .map((segment) => {
      if (/^\d+$/.test(segment)) {
        return Number(segment);
      }
      return segment.replace(dotPattern, '.');
    });

export const joinPath = (base: string, key: string | undefined): string => {
  if (!base) return key ?? '';
  if (!key) return base;
  return `${base}.${key}`;
};

export const getByPath = (target: unknown, path: string): unknown => {
  if (!path) return target;
  return pathSegments(path).reduce<unknown>((acc, key) => {
    if (acc == null) return undefined;
    // @ts-expect-error dynamic access
    return acc[key];
  }, target);
};

export const ensureContainer = (parent: Record<string, unknown> | unknown[], key: string | number, hint?: string | number): void => {
  const isArray = typeof hint === 'number';
  if (parent[key as keyof typeof parent] == null) {
    // @ts-expect-error dynamic assign
    parent[key] = isArray ? [] : {};
  }
};

export const setByPath = (target: Record<string, unknown>, path: string, value: unknown): void => {
  const segments = pathSegments(path);
  if (!segments.length) return;
  let pointer: Record<string, unknown> | unknown[] = target;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const key = segments[i];
    const nextKey = segments[i + 1];
    if (typeof pointer !== 'object' || pointer == null) {
      return;
    }
    ensureContainer(pointer as Record<string, unknown>, key, nextKey);
    // @ts-expect-error dynamic
    pointer = pointer[key];
  }
  const lastKey = segments[segments.length - 1]!;
  // @ts-expect-error dynamic assign
  pointer[lastKey] = value;
};

export const deleteByPath = (target: Record<string, unknown>, path: string): void => {
  const segments = pathSegments(path);
  if (!segments.length) return;
  const lastKey = segments.pop()!;
  const parent = getByPath(target, segments.join('.'));
  if (parent == null || typeof parent !== 'object') return;
  if (Array.isArray(parent) && typeof lastKey === 'number') {
    parent.splice(lastKey, 1);
    return;
  }
  // @ts-expect-error dynamic
  delete parent[lastKey];
};

export const buildSchemaMap = (schema: SchemaDefinition | null | undefined): Map<string, SectionDefinition> => {
  const map = new Map<string, SectionDefinition>();
  schema?.sections?.forEach((section) => {
    map.set(section.type, section);
  });
  return map;
};

export const buildDefaultFromFields = (
  fields: ReadonlyArray<FieldDefinition> = [],
  groups: ReadonlyArray<GroupDefinition> = [],
): Record<string, unknown> => {
  const next: Record<string, unknown> = {};
  fields.forEach((field) => {
    if (field.type === 'checkbox') {
      next[field.key] = Boolean(field.default ?? false);
      return;
    }
    if (field.type === 'list') {
      next[field.key] = [];
      return;
    }
    next[field.key] = field.default ?? '';
  });
  groups.forEach((group) => {
    if (group.default != null) {
      next[group.key] = clone(group.default);
    }
  });
  return next;
};

const applyFieldDefaults = (
  target: Record<string, unknown>,
  fields: ReadonlyArray<FieldDefinition> = [],
  lists: ReadonlyArray<ListDefinition> = [],
  groups: ReadonlyArray<GroupDefinition> = [],
): void => {
  fields.forEach((field) => {
    if (target[field.key] == null) {
      if (field.type === 'checkbox') {
        target[field.key] = Boolean(field.default ?? false);
      } else if (field.type === 'list') {
        target[field.key] = [];
      } else {
        target[field.key] = field.default ?? '';
      }
    }
  });
  lists.forEach((list) => {
    if (!Array.isArray(target[list.key])) {
      target[list.key] = [];
    }
  });
  groups.forEach((group) => {
    if (target[group.key] == null && group.default != null) {
      target[group.key] = clone(group.default);
    }
  });
};

export const buildSectionTemplate = (sectionType: string, schemaMap: Map<string, SectionDefinition>): Record<string, unknown> => {
  const def = schemaMap.get(sectionType);
  if (!def) {
    return { type: sectionType };
  }
  const template = clone(def.defaults ?? { type: sectionType });
  template.type = sectionType;
  applyFieldDefaults(template, def.fields, def.lists, def.groups);
  return template;
};

// re-export field definition to avoid circular types import errors
export type FieldDefinition = import('./types').FieldDefinition;
export type GroupDefinition = import('./types').GroupDefinition;
export type ListDefinition = import('./types').ListDefinition;

