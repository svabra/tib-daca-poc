#!/usr/bin/env node

import { execFileSync } from 'node:child_process';

try {
  execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { stdio: 'ignore' });
  console.log('Git hooks use .githooks.');
} catch (error) {
  console.warn(`Git hooks could not be configured: ${error instanceof Error ? error.message : String(error)}`);
}
