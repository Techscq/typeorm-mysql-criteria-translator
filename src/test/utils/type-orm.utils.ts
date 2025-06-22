import {
  DataSource,
  type EntitySchema,
  type ObjectLiteral,
  type QueryRunner,
} from 'typeorm';
import { generateFakeData } from './fake-entities.js';
import { initializeDatabase } from './mysql.utils.js';
import 'dotenv/config';
import { EventEntitySchema } from './entities/event.entity.js';
import { PostCommentEntity } from './entities/post-comments.entity.js';
import { UserEntity } from './entities/user.entity.js';
import { AddressEntity } from './entities/address.entity.js';
import { PostEntity } from './entities/post.entity.js';
import { PermissionEntity } from './entities/permission.entity.js';
import { UserProfileEntity } from './entities/user-profile.entity.js';

const dbHost = process.env.MYSQL_HOST || '';
const dbPort = parseInt(process.env.MYSQL_PORT || '', 10);
const dbUser = process.env.MYSQL_USER || '';
const dbPassword = process.env.MYSQL_PASSWORD || '';
const dbDatabase = process.env.MYSQL_DATABASE_NAME || '';

export const DbDatasourceConfigForGlobalSetup = {
  type: 'mysql' as const,
  host: dbHost,
  port: dbPort,
  username: dbUser,
  password: dbPassword,
  database: dbDatabase,
  entities: [
    UserEntity,
    AddressEntity,
    PostEntity,
    PermissionEntity,
    PostCommentEntity,
    EventEntitySchema,
    UserProfileEntity,
  ],
  synchronize: true,
  cache: false,
  dropSchema: true,
};

export const DbDatasourceConfigForTests = {
  ...DbDatasourceConfigForGlobalSetup,
  synchronize: false,
  dropSchema: false,
};

let AppDataSource: DataSource;

let hasEnsuredDatabaseExistsGlobally = false;

export async function initializeDataSourceService(
  isGlobalSetup: boolean = false,
) {
  const config = isGlobalSetup
    ? DbDatasourceConfigForGlobalSetup
    : DbDatasourceConfigForTests;

  if (!AppDataSource || !AppDataSource.isInitialized) {
    if (!hasEnsuredDatabaseExistsGlobally && isGlobalSetup) {
      await initializeDatabase();
      hasEnsuredDatabaseExistsGlobally = true;
    }

    AppDataSource = new DataSource(config);
    try {
      await AppDataSource.initialize();
    } catch (e: any) {
      if (e.message?.includes('DataSource already initialized')) {

      } else {
        console.error(
          `Error during DataSource initialization (isGlobalSetup: ${isGlobalSetup}): `,
          e,
        );
        throw e;
      }
    }
  }
  return AppDataSource;
}

export async function seedDatabaseService() {
  const currentDataSource = await initializeDataSourceService(false);
  if (!currentDataSource.isInitialized) {
    throw new Error('Cannot seed database: DataSource is not initialized.');
  }
  const queryRunner: QueryRunner = currentDataSource.createQueryRunner();
  await queryRunner.connect();
  const allFakeData = generateFakeData();
  try {
    const manager = queryRunner.manager;
    await manager.getRepository(PostCommentEntity).deleteAll();
    await manager.getRepository(EventEntitySchema).deleteAll();
    await manager.getRepository(PostEntity).deleteAll();
    await manager.getRepository(AddressEntity).deleteAll();
    await manager.getRepository(UserProfileEntity).deleteAll();
    await manager.getRepository(UserEntity).deleteAll();
    await manager.getRepository(PermissionEntity).deleteAll();

    for (const permission of allFakeData.fakePermissions) {
      await manager.getRepository(PermissionEntity).save(permission);
    }
    for (const user of allFakeData.fakeUsers) {
      await manager.getRepository(UserEntity).save(user);
    }
    for (const address of allFakeData.fakeAddresses) {
      await manager.getRepository(AddressEntity).save(address);
    }
    for (const post of allFakeData.fakePosts) {
      await manager.getRepository(PostEntity).save(post);
    }
    for (const comment of allFakeData.fakeComments) {
      await manager.getRepository(PostCommentEntity).save(comment);
    }
    for (const domainEvent of allFakeData.fakeDomainEvents) {
      await manager.getRepository(EventEntitySchema).save(domainEvent);
    }
  } catch (err) {
    console.error('--- seedDatabaseService: ERROR ---', err);
    throw err;
  } finally {
    await queryRunner.release();
  }
  return allFakeData;
}

export async function teardownDataSourceService() {
  if (AppDataSource && AppDataSource.isInitialized) {
    console.log('Attempting to destroy AppDataSource...');
    await AppDataSource.destroy();
    console.log('AppDataSource destroyed successfully.');
  } else {
    console.log('AppDataSource not initialized or already destroyed.');
  }
}

export class TypeORMUtils {
  static async getQueryBuilderFor<T extends ObjectLiteral>(
    entitySchema: EntitySchema<T>,
    alias: string,
  ) {
    const currentDataSource = await initializeDataSourceService(false);
    if (!currentDataSource.isInitialized) {
      throw new Error(
        'DataSource is not initialized. Worker context initialization failed.',
      );
    }
    return currentDataSource
      .getRepository(entitySchema)
      .createQueryBuilder(alias);
  }
  static async getEventsQueryBuilder(alias: string) {
    const currentDataSource = await initializeDataSourceService(false);
    if (!currentDataSource.isInitialized) {
      throw new Error(
        'DataSource is not initialized. Worker context initialization failed.',
      );
    }
    return currentDataSource
      .getRepository(EventEntitySchema)
      .createQueryBuilder(alias);
  }
}
