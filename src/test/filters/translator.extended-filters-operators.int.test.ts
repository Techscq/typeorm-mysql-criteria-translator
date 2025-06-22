import {
  type ObjectLiteral,
  type SelectQueryBuilder,
  type EntitySchema,
} from 'typeorm';
import { TypeOrmMysqlTranslator } from '../../type-orm.mysql.translator.js';
import {
  initializeDataSourceService,
  TypeORMUtils,
} from '../utils/type-orm.utils.js';
import {
  PostSchema as CriteriaPostSchema,
  UserSchema as CriteriaUserSchema,
  type Post,
  type User,
} from '../utils/fake-entities.js';
import { UserEntity } from '../utils/entities/user.entity.js';
import { PostEntity } from '../utils/entities/post.entity.js';
import { beforeEach, describe, expect, it, beforeAll } from 'vitest';
import {
  CriteriaFactory,
  FilterOperator,
  type RootCriteria,
} from '@nulledexp/translatable-criteria';

describe('TypeOrmMysqlTranslator - Extended Filter Operators', () => {
  let translator: TypeOrmMysqlTranslator<ObjectLiteral>;
  let allPostsFromDB: Post[];
  let allUsersFromDB: User[];

  async function translateAndGetQueryBuilder<E extends ObjectLiteral>(
    criteria: RootCriteria<any>,
    entitySchema: EntitySchema<E>,
  ): Promise<SelectQueryBuilder<E>> {
    const qb = await TypeORMUtils.getQueryBuilderFor<E>(
      entitySchema,
      criteria.alias,
    );
    translator.translate(criteria, qb as SelectQueryBuilder<ObjectLiteral>);
    return qb;
  }

  beforeAll(async () => {
    const dataSource = await initializeDataSourceService(false);
    allPostsFromDB = await dataSource.getRepository(PostEntity).find();
    allUsersFromDB = await dataSource.getRepository(UserEntity).find();
  });

  beforeEach(() => {
    translator = new TypeOrmMysqlTranslator();
  });

  it('should translate SET_CONTAINS_ANY for categories field', async () => {
    const targetCategories = ['tech', 'news'];
    const expectedPosts = allPostsFromDB.filter(
      (p) =>
        p.categories !== null &&
        targetCategories.some((cat) => p.categories!.includes(cat)),
    );

    if (expectedPosts.length === 0) {
      throw new Error(
        `Test data issue: No posts found with any of the categories: ${targetCategories.join(', ')}.`,
      );
    }

    const criteria = CriteriaFactory.GetCriteria(CriteriaPostSchema).where({
      field: 'categories',
      operator: FilterOperator.SET_CONTAINS_ANY,
      value: targetCategories,
    });

    const qb = await translateAndGetQueryBuilder<Post>(criteria, PostEntity);
    const sql = qb.getSql();
    const params = qb.getParameters();
    const fetchedPosts = await qb.getMany();

    expect(sql).toContain(
      `(\`${criteria.alias}\`.\`categories\` IS NOT NULL AND (FIND_IN_SET(?, \`${criteria.alias}\`.\`categories\`) > 0 OR FIND_IN_SET(?, \`${criteria.alias}\`.\`categories\`) > 0))`,
    );
    expect(params['param_0']).toBe(targetCategories[0]);
    expect(params['param_1']).toBe(targetCategories[1]);
    expect(fetchedPosts.length).toBe(expectedPosts.length);
    fetchedPosts.forEach((fp) => {
      expect(fp.categories).not.toBeNull();
      expect(
        targetCategories.some((cat) => fp.categories!.includes(cat)),
      ).toBe(true);
    });
  });

  it('should translate SET_CONTAINS_ALL for categories field', async () => {
    const targetCategories = ['tech', 'typeorm'];
    const expectedPosts = allPostsFromDB.filter(
      (p) =>
        p.categories !== null &&
        targetCategories.every((cat) => p.categories!.includes(cat)),
    );

    if (expectedPosts.length === 0) {
      throw new Error(
        `Test data issue: No posts found with all categories: ${targetCategories.join(', ')}. Check fake data.`,
      );
    }

    const criteria = CriteriaFactory.GetCriteria(CriteriaPostSchema).where({
      field: 'categories',
      operator: FilterOperator.SET_CONTAINS_ALL,
      value: targetCategories,
    });

    const qb = await translateAndGetQueryBuilder<Post>(criteria, PostEntity);
    const sql = qb.getSql();
    const params = qb.getParameters();
    const fetchedPosts = await qb.getMany();

    expect(sql).toContain(
      `(\`${criteria.alias}\`.\`categories\` IS NOT NULL AND (FIND_IN_SET(?, \`${criteria.alias}\`.\`categories\`) > 0 AND FIND_IN_SET(?, \`${criteria.alias}\`.\`categories\`) > 0))`,
    );
    expect(params['param_0']).toBe(targetCategories[0]);
    expect(params['param_1']).toBe(targetCategories[1]);
    expect(fetchedPosts.length).toBe(expectedPosts.length);
    fetchedPosts.forEach((fp) => {
      expect(fp.categories).not.toBeNull();
      expect(
        targetCategories.every((cat) => fp.categories!.includes(cat)),
      ).toBe(true);
    });
  });

  it('should translate BETWEEN for a date field (created_at)', async () => {
    const sortedUsersByDate = [...allUsersFromDB].sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    if (sortedUsersByDate.length < 3) {
      throw new Error(
        'Test data issue: Need at least 3 users for BETWEEN test.',
      );
    }
    const dateMin = sortedUsersByDate[1]!.created_at;
    const dateMax = sortedUsersByDate[sortedUsersByDate.length - 2]!.created_at;

    const expectedUsers = allUsersFromDB.filter((user) => {
      const userDate = new Date(user.created_at).getTime();
      return (
        userDate >= new Date(dateMin).getTime() &&
        userDate <= new Date(dateMax).getTime()
      );
    });

    if (expectedUsers.length === 0) {
      throw new Error(
        `Test data issue: No users found between ${dateMin} and ${dateMax}.`,
      );
    }

    const criteria = CriteriaFactory.GetCriteria(CriteriaUserSchema).where({
      field: 'created_at',
      operator: FilterOperator.BETWEEN,
      value: [dateMin, dateMax],
    });

    const qb = await translateAndGetQueryBuilder<User>(criteria, UserEntity);
    const sql = qb.getSql();
    const params = qb.getParameters();
    const fetchedUsers = await qb.getMany();

    expect(sql).toContain(
      `WHERE \`${criteria.alias}\`.\`created_at\` BETWEEN ? AND ?`,
    );
    expect(params['param_0']).toBe(dateMin);
    expect(params['param_1']).toBe(dateMax);
    expect(fetchedUsers.length).toBe(expectedUsers.length);
    fetchedUsers.forEach((fetchedUser) => {
      const userDate = new Date(fetchedUser.created_at).getTime();
      expect(userDate).toBeGreaterThanOrEqual(new Date(dateMin).getTime());
      expect(userDate).toBeLessThanOrEqual(new Date(dateMax).getTime());
    });
  });

  it('should translate NOT_BETWEEN for a date field (created_at)', async () => {
    const sortedUsersByDate = [...allUsersFromDB].sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    if (sortedUsersByDate.length < 3) {
      throw new Error(
        'Test data issue: Need at least 3 users for NOT_BETWEEN test.',
      );
    }
    const dateMin = sortedUsersByDate[1]!.created_at;
    const dateMax = sortedUsersByDate[sortedUsersByDate.length - 2]!.created_at;

    const expectedUsers = allUsersFromDB.filter((user) => {
      const userDate = new Date(user.created_at).getTime();
      return (
        userDate < new Date(dateMin).getTime() ||
        userDate > new Date(dateMax).getTime()
      );
    });

    if (expectedUsers.length === 0 && allUsersFromDB.length > 0) {
      throw new Error(
        `Test data issue: All users fall between ${dateMin} and ${dateMax}, NOT_BETWEEN would yield 0 results.`,
      );
    }

    const criteria = CriteriaFactory.GetCriteria(CriteriaUserSchema).where({
      field: 'created_at',
      operator: FilterOperator.NOT_BETWEEN,
      value: [dateMin, dateMax],
    });

    const qb = await translateAndGetQueryBuilder<User>(criteria, UserEntity);
    const sql = qb.getSql();
    const params = qb.getParameters();
    const fetchedUsers = await qb.getMany();

    expect(sql).toContain(
      `WHERE \`${criteria.alias}\`.\`created_at\` NOT BETWEEN ? AND ?`,
    );
    expect(params['param_0']).toBe(dateMin);
    expect(params['param_1']).toBe(dateMax);
    expect(fetchedUsers.length).toBe(expectedUsers.length);
    fetchedUsers.forEach((fetchedUser) => {
      const userDate = new Date(fetchedUser.created_at).getTime();
      const isOutsideRange =
        userDate < new Date(dateMin).getTime() ||
        userDate > new Date(dateMax).getTime();
      expect(isOutsideRange).toBe(true);
    });
  });

  it('should translate MATCHES_REGEX for username', async () => {
    const regex = '^user_[1-3]$';
    const expectedUsers = allUsersFromDB.filter((user) =>
      new RegExp(regex).test(user.username),
    );

    if (expectedUsers.length === 0) {
      throw new Error(
        `Test data issue: No users found matching regex "${regex}".`,
      );
    }

    const criteria = CriteriaFactory.GetCriteria(CriteriaUserSchema).where({
      field: 'username',
      operator: FilterOperator.MATCHES_REGEX,
      value: regex,
    });

    const qb = await translateAndGetQueryBuilder<User>(criteria, UserEntity);
    const sql = qb.getSql();
    const params = qb.getParameters();
    const fetchedUsers = await qb.getMany();

    expect(sql).toContain(`WHERE \`${criteria.alias}\`.\`username\` REGEXP ?`);
    expect(params['param_0']).toBe(regex);
    expect(fetchedUsers.length).toBe(expectedUsers.length);
    fetchedUsers.forEach((fetchedUser) => {
      expect(new RegExp(regex).test(fetchedUser.username)).toBe(true);
    });
  });

  it('should translate ILIKE for email', async () => {
    const pattern = '%@EXAMPLE.COM';
    const expectedUsers = allUsersFromDB.filter((user) =>
      user.email.toLowerCase().endsWith('@example.com'),
    );

    if (expectedUsers.length === 0) {
      throw new Error(
        `Test data setup issue: No users found matching ILIKE pattern "${pattern}".`,
      );
    }

    const criteria = CriteriaFactory.GetCriteria(CriteriaUserSchema).where({
      field: 'email',
      operator: FilterOperator.ILIKE,
      value: pattern,
    });

    const qb = await translateAndGetQueryBuilder<User>(criteria, UserEntity);
    const sql = qb.getSql();
    const params = qb.getParameters();
    const fetchedUsers = await qb.getMany();

    expect(sql).toContain(`WHERE \`${criteria.alias}\`.\`email\` LIKE ?`);
    expect(params['param_0']).toBe(pattern);
    expect(fetchedUsers.length).toBe(expectedUsers.length);
    fetchedUsers.forEach((fetchedUser) => {
      expect(fetchedUser.email.toLowerCase().endsWith('@example.com')).toBe(
        true,
      );
    });
  });

  it('should translate NOT_ILIKE for email', async () => {
    const patternToExclude = 'USER1@%';
    const expectedUsers = allUsersFromDB.filter(
      (user) => !user.email.toLowerCase().startsWith('user1@'),
    );

    const usersMatchingPattern = allUsersFromDB.filter((user) =>
      user.email.toLowerCase().startsWith('user1@'),
    );
    if (usersMatchingPattern.length === 0) {
      throw new Error(
        `Test data issue: No users found matching pattern "${patternToExclude}" to make NOT_ILIKE meaningful.`,
      );
    }
    if (expectedUsers.length === 0 && allUsersFromDB.length > 0) {
      throw new Error(
        `Test data issue: All users match pattern "${patternToExclude}", NOT_ILIKE would yield 0 results.`,
      );
    }

    const criteria = CriteriaFactory.GetCriteria(CriteriaUserSchema).where({
      field: 'email',
      operator: FilterOperator.NOT_ILIKE,
      value: patternToExclude,
    });

    const qb = await translateAndGetQueryBuilder<User>(criteria, UserEntity);
    const sql = qb.getSql();
    const params = qb.getParameters();
    const fetchedUsers = await qb.getMany();

    expect(sql).toContain(`WHERE \`${criteria.alias}\`.\`email\` NOT LIKE ?`);
    expect(params['param_0']).toBe(patternToExclude);
    expect(fetchedUsers.length).toBe(expectedUsers.length);
    fetchedUsers.forEach((fetchedUser) => {
      expect(fetchedUser.email.toLowerCase().startsWith('user1@')).toBe(false);
    });
  });
});