// Runs before each test file, before the app (and its env validation) is imported.
import 'dotenv/config';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'mysql://school:school_pass@127.0.0.1:3307/school_test';
process.env.LOGIN_RATE_LIMIT = '10000';
process.env.DISABLE_CRON = 'true';
process.env.UPLOAD_DIR = 'uploads-test';
