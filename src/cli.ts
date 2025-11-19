#!/usr/bin/env node
import { Command } from 'commander';
import { createRequire } from 'node:module';
import { runInitCommand } from './commands/init.js';
import { runDevCommand } from './commands/dev.js';
import { runBuildCommand } from './commands/build.js';
import { runPackageCommand } from './commands/package.js';
import { runDeployCommand } from './commands/deploy.js';
import { runEndpointCommand } from './commands/endpoint.js';

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

program
  .command('endpoint')
  .description('Run a minimal remote deploy endpoint')
  .option('-p, --port <port>', 'Port to listen on', (value) => Number.parseInt(value, 10))
  .option('-H, --host <host>', 'Host to bind to (default 0.0.0.0)')
  .option('-s, --secret <secret>', 'Shared secret used for auth')
  .option('-t, --target <path>', 'Directory where extracted files should be written')
  .action(async (opts) => {
    await runEndpointCommand({
      port: opts.port,
      host: opts.host,
      secret: opts.secret,
      target: opts.target,
    });
  });

program.parseAsync(process.argv);

