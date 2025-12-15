#!/usr/bin/env node
import { Command } from 'commander';
import { createRequire } from 'node:module';
import { runInitCommand } from './commands/init.js';
import { runDevCommand } from './commands/dev.js';
import { runBuildCommand } from './commands/build.js';
import { runPackageCommand } from './commands/package.js';
import { runDeployCommand } from './commands/deploy.js';
import { runEndpointCommand } from './commands/endpoint.js';
import { runSeedCommand } from './commands/seed.js';
import { runMigrateCommand } from './commands/migrate.js';

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
  .option('--single-tenant-stripe', 'Enable single-tenant Stripe commerce mode with authentication')
  .option('--stripe-mode <mode>', 'Stripe environment mode: staging or production', 'staging')
  .action(async (opts) => {
    await runDevCommand({
      port: opts.port,
      singleTenantStripe: Boolean(opts.singleTenantStripe),
      stripeMode: opts.stripeMode === 'production' ? 'production' : 'staging',
    });
  });

program.command('build').description('Render content/templates into dist/').action(async () => {
  await runBuildCommand();
});

program.command('package').description('Zip the built site into dist/site-*.zip').action(async () => {
  await runPackageCommand();
});

program
  .command('deploy')
  .description('Deploy code changes to the remote server (content-preserving)')
  .option('--skip-schema-check', 'Skip schema compatibility check (dangerous)')
  .option('--force', 'Deploy even with uncommitted changes')
  .action(async (opts) => {
    await runDeployCommand({
      skipSchemaCheck: Boolean(opts.skipSchemaCheck),
      force: Boolean(opts.force),
    });
  });

program
  .command('seed')
  .description('Initialize remote server with content (one-time setup)')
  .option('--force', 'Overwrite existing content (dangerous)')
  .action(async (opts) => {
    await runSeedCommand({
      force: Boolean(opts.force),
    });
  });

program
  .command('migrate')
  .description('Manage content migrations for schema changes')
  .option('--list', 'List available migrations')
  .option('--create', 'Create a new migration scaffold')
  .option('--apply <path>', 'Apply a migration to remote content')
  .option('--name <name>', 'Migration name (for --create)')
  .option('--description <desc>', 'Migration description (for --create)')
  .option('--dry-run', 'Validate without applying (for --apply)')
  .action(async (opts) => {
    await runMigrateCommand({
      list: Boolean(opts.list),
      create: Boolean(opts.create),
      apply: opts.apply,
      name: opts.name,
      description: opts.description,
      dryRun: Boolean(opts.dryRun),
    });
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

