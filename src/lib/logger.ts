import { bold, cyan, gray, green, red, yellow } from 'kleur/colors';

const timestamp = (): string => {
  const date = new Date();
  return date.toISOString().split('T')[1]?.replace('Z', '') ?? '';
};

const format = (label: string, color: (value: string) => string, message: string): string =>
  `${gray(`[${timestamp()}]`)} ${color(bold(label))} ${message}`;

export const log = {
  info: (message: string): void => {
    console.log(format('info', cyan, message));
  },
  success: (message: string): void => {
    console.log(format('done', green, message));
  },
  warn: (message: string): void => {
    console.warn(format('warn', yellow, message));
  },
  error: (message: string, error?: unknown): void => {
    const extra = error instanceof Error ? `\n${error.message}\n${error.stack ?? ''}` : '';
    console.error(format('fail', red, `${message}${extra}`));
  },
};

export type Logger = typeof log;

