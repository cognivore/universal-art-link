import path from 'node:path';

export type PathConfig = {
  readonly rootDir: string;
  readonly contentDir: string;
  readonly pagesDir: string;
  readonly templatesDir: string;
  readonly layoutsDir: string;
  readonly partialsDir: string;
  readonly stylesDir: string;
  readonly scriptsDir: string;
  readonly assetsDir: string;
  readonly outputDir: string;
};

export const createPathConfig = (rootDir: string, outputDir = 'dist'): PathConfig => {
  const resolve = (...segments: readonly string[]): string => path.resolve(rootDir, ...segments);

  return {
    rootDir,
    contentDir: resolve('content'),
    pagesDir: resolve('content/pages'),
    templatesDir: resolve('templates'),
    layoutsDir: resolve('templates/layouts'),
    partialsDir: resolve('templates/partials'),
    stylesDir: resolve('templates/styles'),
    scriptsDir: resolve('templates/scripts'),
    assetsDir: resolve('assets'),
    outputDir: resolve(outputDir),
  };
};

