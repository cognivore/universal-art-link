#!/usr/bin/env node
import { Command } from 'commander';
import { createRequire } from 'node:module';
import { runInitCommand } from './commands/init.js';
import { runDevCommand } from './commands/dev.js';
import { runBuildCommand } from './commands/build.js';
import { runPackageCommand } from './commands/package.js';
import { runDeployCommand } from './commands/deploy.js';

const require = createRequire(import.meta.url);
const { version, description } = require('../package.json') as { version: string; description: string };

const program = new Command();

program.name('universal-art-link').description(description).version(version);

program
  .command('init')
  .description('Scaffold starter content, templates, and assets')
  .option('-f, --force', 'Overwrite existing files')
  .option('-t, --target <path>', 'Destination directory (defaults to cwd)')
  .action(async (opts) => {
    await runInitCommand({ force: Boolean(opts.force), target: opts.target });
  });

program
  .command('dev')
  .description('Run local dev server with rebuild-on-change')
  .option('-p, --port <port>', 'Port to run the dev server on', (value) => Number.parseInt(value, 10))
  .action(async (opts) => {
    await runDevCommand({ port: opts.port });
  });

program.command('build').description('Render content/templates into dist/').action(async () => {
  await runBuildCommand();
});

program.command('package').description('Zip the built site into dist/site-*.zip').action(async () => {
  await runPackageCommand();
});

program.command('deploy').description('POST the packaged site to configured endpoint').action(async () => {
  await runDeployCommand();
});

program.parseAsync(process.argv);

