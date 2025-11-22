/**
 * Template validation tests
 *
 * These tests ensure Handlebars templates remain syntactically valid
 * and contain required variables like {{themeVars}}.
 */

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs-extra';
import path from 'node:path';
import Handlebars from 'handlebars';
import { fileURLToPath } from 'node:url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(moduleDir, '../..');

const templateDirs = [
  path.join(projectRoot, 'templates/layouts'),
  path.join(projectRoot, 'starter/templates/layouts'),
];

const layoutFiles = [
  'default.hbs',
  'project.hbs',
  'journal.hbs',
  'index-grid.hbs',
  'blog.hbs',
];

// Test 1: Handlebars syntax validation
for (const templateDir of templateDirs) {
  for (const layoutFile of layoutFiles) {
    const templatePath = path.join(templateDir, layoutFile);
    const relativePath = path.relative(projectRoot, templatePath);

    test(`Handlebars compile: ${relativePath}`, async () => {
      const exists = await fs.pathExists(templatePath);
      assert.ok(exists, `Template not found: ${templatePath}`);

      const source = await fs.readFile(templatePath, 'utf8');

      // This will throw if syntax is invalid
      assert.doesNotThrow(() => {
        Handlebars.compile(source);
      }, `Template should compile without errors: ${relativePath}`);
    });
  }
}

// Test 2: Required variables
for (const templateDir of templateDirs) {
  for (const layoutFile of layoutFiles) {
    const templatePath = path.join(templateDir, layoutFile);
    const relativePath = path.relative(projectRoot, templatePath);

    test(`Contains {{themeVars}}: ${relativePath}`, async () => {
      const exists = await fs.pathExists(templatePath);
      assert.ok(exists, `Template not found: ${templatePath}`);

      const source = await fs.readFile(templatePath, 'utf8');

      // Must contain the themeVars variable with correct syntax in the :root block
      const rootStylePattern = /:root\s*\{\s*\{\{themeVars\}\}\s*\}/;
      assert.match(source, rootStylePattern, `Template must contain {{themeVars}} in :root style block: ${relativePath}`);
    });
  }
}

// Test 3: No malformed Handlebars syntax
for (const templateDir of templateDirs) {
  for (const layoutFile of layoutFiles) {
    const templatePath = path.join(templateDir, layoutFile);
    const relativePath = path.relative(projectRoot, templatePath);

    test(`No broken {{ }} delimiters: ${relativePath}`, async () => {
      const exists = await fs.pathExists(templatePath);
      assert.ok(exists, `Template not found: ${templatePath}`);

      const source = await fs.readFile(templatePath, 'utf8');

      // Check for the specific malformation pattern that was introduced:
      // Multiple lines with broken braces like:
      //   {
      //     {
      //     themeVars
      //   }
      // }
      const malformedMultiline = /\{\s*\n\s*\{\s*\n\s*themeVars/;
      assert.doesNotMatch(
        source,
        malformedMultiline,
        `Found malformed multi-line themeVars syntax in ${relativePath}. ` +
        `Must be {{themeVars}} on a single logical line.`
      );
    });
  }
}

