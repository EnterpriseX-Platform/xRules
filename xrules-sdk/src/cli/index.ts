#!/usr/bin/env node
/**
 * XRULES SDK CLI
 * Command-line interface for the XRULES SDK
 */

import { Command } from 'commander';
import chalk from 'chalk';
import * as initCommand from './commands/init';
import * as buildCommand from './commands/build';
import * as testCommand from './commands/test';
import * as publishCommand from './commands/publish';

const program = new Command();

// CLI metadata
program
  .name('xrules-sdk')
  .description('XRULES SDK - Custom Node Development CLI')
  .version('1.0.0');

// Init command
program
  .command('init')
  .description('Initialize a new node package from template')
  .argument('<name>', 'Name of the node package')
  .option('-t, --template <type>', 'Template type (typescript, javascript)', 'typescript')
  .option('-d, --directory <path>', 'Target directory')
  .option('-f, --force', 'Overwrite existing directory', false)
  .action(async (name, options) => {
    try {
      await initCommand.execute(name, options);
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

// Build command
program
  .command('build')
  .description('Build the node package for distribution')
  .option('-w, --watch', 'Watch for changes and rebuild', false)
  .option('-o, --output <path>', 'Output directory', 'dist')
  .option('--minify', 'Minify output', false)
  .action(async (options) => {
    try {
      await buildCommand.execute(options);
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

// Test command
program
  .command('test')
  .description('Test nodes locally')
  .option('-n, --node <id>', 'Test specific node by ID')
  .option('-i, --input <json>', 'Input data as JSON string')
  .option('-f, --file <path>', 'Input data from JSON file')
  .option('--watch', 'Watch for changes and re-run tests', false)
  .action(async (options) => {
    try {
      await testCommand.execute(options);
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

// Publish command
program
  .command('publish')
  .description('Publish nodes to the registry')
  .option('-r, --registry <url>', 'Registry URL')
  .option('-t, --tag <tag>', 'NPM dist-tag', 'latest')
  .option('--access <level>', 'Package access (public, restricted)', 'public')
  .option('--dry-run', 'Simulate publish without uploading', false)
  .action(async (options) => {
    try {
      await publishCommand.execute(options);
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

// Validate command
program
  .command('validate')
  .description('Validate node configurations')
  .option('-p, --path <path>', 'Path to node files', 'src')
  .action(async (options) => {
    try {
      const { validateCommand } = await import('./commands/validate');
      await validateCommand.execute(options);
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

// List command
program
  .command('list')
  .alias('ls')
  .description('List all registered nodes')
  .option('-c, --category <name>', 'Filter by category')
  .action(async (options) => {
    try {
      const { listCommand } = await import('./commands/list');
      await listCommand.execute(options);
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

// Info command
program
  .command('info')
  .description('Show detailed information about a node')
  .argument('<id>', 'Node ID')
  .action(async (id) => {
    try {
      const { infoCommand } = await import('./commands/info');
      await infoCommand.execute(id);
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

// Generate command (subcommands)
const generateCmd = program
  .command('generate')
  .alias('gen')
  .description('Generate code and files');

generateCmd
  .command('node')
  .description('Generate a new node definition file')
  .argument('<name>', 'Node name (e.g., my-custom-node)')
  .option('-c, --category <name>', 'Category', 'custom')
  .option('-o, --output <path>', 'Output file path')
  .action(async (name, options) => {
    try {
      const { generateNodeCommand } = await import('./commands/generate');
      await generateNodeCommand.execute(name, options);
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

// Parse arguments
program.parse();

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
