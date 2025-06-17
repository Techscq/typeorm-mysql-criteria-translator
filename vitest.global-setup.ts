import {
  initializeDataSourceService,
  seedDatabaseService,
  teardownDataSourceService,
} from './src/test/utils/type-orm.utils.js';
import { closeMysqlPool } from './src/test/utils/mysql.utils.js';

export async function setup() {
  await initializeDataSourceService(true);
  await seedDatabaseService();
}

export async function teardown() {
  await teardownDataSourceService();
  await closeMysqlPool();
}
