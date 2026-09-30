import 'dotenv/config';
import { execSync } from 'child_process';

/** Recreates the test database schema once before the whole suite. */
export default function globalSetup(): void {
  const url = process.env.TEST_DATABASE_URL ?? 'mysql://school:school_pass@127.0.0.1:3307/school_test';
  if (!/test/i.test(url)) throw new Error(`Refusing to reset a non-test database: ${url}`);
  execSync('npx prisma migrate reset --force --skip-seed --skip-generate', {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
}
