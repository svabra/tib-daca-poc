import { spawnSync } from 'node:child_process';
import path from 'node:path';

const policyDirectories = [
  path.resolve('policies'),
  path.resolve('services/catalog-api/tests/opa'),
];

for (const policyDirectory of policyDirectories) {
  const result = spawnSync(
    'docker',
    [
      'run',
      '--rm',
      '-v',
      `${policyDirectory}:/policy:ro`,
      'openpolicyagent/opa:1.18.2',
      'test',
      '/policy',
      '-v',
    ],
    { stdio: 'inherit' },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
