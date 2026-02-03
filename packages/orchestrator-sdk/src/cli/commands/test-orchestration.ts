/**
 * Test Orchestration Command - CLI operations for running E2E orchestration tests
 *
 * Provides commands for running the orchestration test suite:
 * - test-orchestration: Run all tests
 * - test-orchestration --test <id>: Run specific test
 * - test-orchestration --verbose: Verbose output
 */

import type { Command, GlobalOptions, CommandResult } from '@elemental/sdk/cli';
import { success, failure, ExitCode } from '@elemental/sdk/cli';
import type { TestContext } from '../../testing/test-context.js';
import type { OrchestrationTest } from '../../testing/orchestration-tests.js';

// ============================================================================
// Types
// ============================================================================

interface TestOrchestrationOptions {
  /** Filter tests by ID (substring match) */
  test?: string;
  /** Enable verbose logging */
  verbose?: boolean;
  /** Timeout for each test in milliseconds */
  timeout?: number;
  /** Skip cleanup on failure (for debugging) */
  skipCleanup?: boolean;
}

interface TestRunResult {
  passed: boolean;
  message: string;
  duration: number;
  details?: Record<string, unknown>;
}

// ============================================================================
// Test Runner
// ============================================================================

async function runOrchestrationTests(options: TestOrchestrationOptions): Promise<CommandResult> {
  const { setupTestContext } = await import('../../testing/test-context.js');
  const { allTests } = await import('../../testing/orchestration-tests.js');

  console.log('🧪 Orchestration Test Suite\n');
  console.log('═'.repeat(60));

  // Setup isolated test environment
  console.log('\nCreating isolated test workspace...');
  let ctx: TestContext | undefined;

  try {
    ctx = await setupTestContext({
      verbose: options.verbose ?? false,
    });
    console.log(`  ✓ Temp workspace: ${ctx.tempWorkspace}`);
    console.log('  ✓ Git repo initialized');
    console.log('  ✓ Project structure created');
    console.log('  ✓ Database initialized');
    console.log('\n✓ Test environment ready\n');

    // Start daemon
    ctx.daemon.start();
    console.log('✓ Dispatch daemon running\n');
    console.log('═'.repeat(60));
    console.log('');

    // Get tests to run
    const tests = options.test
      ? allTests.filter((t: OrchestrationTest) => t.id.includes(options.test!))
      : allTests;

    if (tests.length === 0) {
      return failure(`No tests matching "${options.test}"`, ExitCode.GENERAL_ERROR);
    }

    console.log(`Running ${tests.length} test(s)...\n`);

    // Run tests
    const results: TestRunResult[] = [];

    for (const test of tests) {
      console.log(`▶ ${test.name}`);
      if (options.verbose) {
        console.log(`  ${test.description}`);
      }

      const startTime = Date.now();
      try {
        const result = await runSingleTest(test, ctx, options);
        result.duration = Date.now() - startTime;
        results.push(result);

        const icon = result.passed ? '✓' : '✗';
        const color = result.passed ? '\x1b[32m' : '\x1b[31m';
        const reset = '\x1b[0m';
        console.log(`  ${color}${icon}${reset} ${result.message} (${formatDuration(result.duration)})`);

        if (!result.passed && options.verbose && result.details) {
          console.log(`    Details: ${JSON.stringify(result.details, null, 2)}`);
        }
        console.log('');
      } catch (error) {
        const duration = Date.now() - startTime;
        const message = error instanceof Error ? error.message : String(error);
        results.push({
          passed: false,
          message: `Error: ${message}`,
          duration,
        });
        console.log(`  \x1b[31m✗\x1b[0m Error: ${message} (${formatDuration(duration)})\n`);
      }
    }

    // Summary
    const passed = results.filter(r => r.passed).length;
    const failed = results.length - passed;
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

    console.log('═'.repeat(60));
    console.log('\n📊 Results Summary\n');

    if (failed === 0) {
      console.log(`  \x1b[32m✓ All ${passed} tests passed\x1b[0m`);
    } else {
      console.log(`  \x1b[32m✓ ${passed} passed\x1b[0m`);
      console.log(`  \x1b[31m✗ ${failed} failed\x1b[0m`);
    }
    console.log(`  ⏱ Total time: ${formatDuration(totalDuration)}`);
    console.log('');

    // Cleanup
    if (!options.skipCleanup) {
      console.log('Cleaning up...');
      await ctx.cleanup();
      console.log('  ✓ Stopped daemon');
      console.log('  ✓ Deleted temp workspace');
      console.log('');
    } else {
      console.log(`\n⚠ Skipping cleanup. Temp workspace: ${ctx.tempWorkspace}\n`);
      ctx.daemon.stop();
    }

    return passed === results.length ? success() : failure('Some tests failed', ExitCode.GENERAL_ERROR);

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n\x1b[31mFatal error: ${message}\x1b[0m\n`);

    if (ctx && !options.skipCleanup) {
      try {
        await ctx.cleanup();
      } catch {
        // Ignore cleanup errors
      }
    }

    return failure(message, ExitCode.GENERAL_ERROR);
  }
}

/**
 * Run a single test with timeout
 */
async function runSingleTest(
  test: OrchestrationTest,
  ctx: TestContext,
  options: TestOrchestrationOptions
): Promise<TestRunResult> {
  const testTimeout = options.timeout ?? test.timeout;

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve({
        passed: false,
        message: `Test timed out after ${testTimeout}ms`,
        duration: testTimeout,
      });
    }, testTimeout);

    test.run(ctx)
      .then((result) => {
        clearTimeout(timer);
        resolve({
          ...result,
          duration: 0, // Will be set by caller
        });
      })
      .catch((error) => {
        clearTimeout(timer);
        resolve({
          passed: false,
          message: error instanceof Error ? error.message : String(error),
          duration: 0,
        });
      });
  });
}

/**
 * Format duration in human-readable format
 */
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

// ============================================================================
// Command Definitions
// ============================================================================

const testOrchestrationOptions = [
  {
    name: 'test',
    short: 't',
    description: 'Run specific test by ID (substring match)',
    hasValue: true,
  },
  {
    name: 'verbose',
    short: 'v',
    description: 'Enable verbose logging',
  },
  {
    name: 'timeout',
    description: 'Timeout for each test in milliseconds',
    hasValue: true,
  },
  {
    name: 'skip-cleanup',
    description: 'Skip cleanup on failure (for debugging)',
  },
];

async function testOrchestrationHandler(
  _args: string[],
  options: GlobalOptions & { test?: string; timeout?: string; 'skip-cleanup'?: boolean }
): Promise<CommandResult> {
  const testOptions: TestOrchestrationOptions = {
    test: options.test,
    verbose: options.verbose,
    timeout: options.timeout ? parseInt(options.timeout, 10) : undefined,
    skipCleanup: options['skip-cleanup'],
  };

  return runOrchestrationTests(testOptions);
}

const testOrchestrationCommand: Command = {
  name: 'test-orchestration',
  description: 'Run orchestration E2E test suite',
  usage: 'el test-orchestration [options]',
  options: testOrchestrationOptions,
  handler: testOrchestrationHandler as Command['handler'],
};

// ============================================================================
// Exports
// ============================================================================

export const testOrchestrationCommands: readonly Command[] = [
  testOrchestrationCommand,
];

export { runOrchestrationTests };

// ============================================================================
// CLI Entry Point
// ============================================================================

/**
 * Run as CLI when executed directly
 */
async function main() {
  const args = process.argv.slice(2);

  const options: TestOrchestrationOptions = {};

  // Parse args
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--test' || arg === '-t') {
      options.test = args[++i];
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg === '--timeout') {
      options.timeout = parseInt(args[++i], 10);
    } else if (arg === '--skip-cleanup') {
      options.skipCleanup = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Orchestration E2E Test Suite

Usage: bun run test:orchestration [options]

Options:
  -t, --test <id>      Run specific test by ID (substring match)
  -v, --verbose        Enable verbose logging
  --timeout <ms>       Timeout for each test in milliseconds
  --skip-cleanup       Skip cleanup on failure (for debugging)
  -h, --help           Show this help message

Examples:
  bun run test:orchestration
  bun run test:orchestration --test "director"
  bun run test:orchestration --verbose --skip-cleanup
`);
      process.exit(0);
    }
  }

  const result = await runOrchestrationTests(options);
  process.exit(result.exitCode);
}

// Run if this file is executed directly
if (import.meta.main) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
