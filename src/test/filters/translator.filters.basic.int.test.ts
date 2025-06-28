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

describe('TypeOrmMysqlTranslator - Basic Filters', () => {
  let translator: TypeOrmMysqlTranslator<ObjectLiteral>;
  let actualUsersFromDB: User[];
  let actualPostsFromDB: Post[];

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
    actualUsersFromDB = await dataSource
      .getRepository(UserEntity)
      .find({ loadEagerRelations: true });
    actualPostsFromDB = await dataSource
      .getRepository(PostEntity)
      .find({ loadEagerRelations: true });
  });

  beforeEach(() => {
    translator = new TypeOrmMysqlTranslator();
  });

  it('should translate ENDS_WITH operator for a root field', async () => {
    const suffixToMatch = '@example.com';
    const usersToExpect = actualUsersFromDB.filter((user) =>
      user.email.endsWith(suffixToMatch),
    );

    if (usersToExpect.length === 0) {
      throw new Error(
        `Test data setup issue: No users found matching the suffix "${suffixToMatch}". Ensure fake data includes such users.`,
      );
    }

    const criteria = CriteriaFactory.GetCriteria(CriteriaUserSchema).where({
      field: 'email',
      operator: FilterOperator.ENDS_WITH,
      value: suffixToMatch,
    });

    const qb = await translateAndGetQueryBuilder<User>(criteria, UserEntity);
    const sql = qb.getSql();
    const params = qb.getParameters();
    const fetchedUsers = await qb.getMany();

    expect(sql).toContain(`WHERE (\`${criteria.alias}\`.\`email\` LIKE ?)`);
    expect(params['param_0']).toBe(`%${suffixToMatch}`);
    expect(fetchedUsers.length).toBe(usersToExpect.length);
    fetchedUsers.forEach((fetchedUser) => {
      expect(fetchedUser.email.endsWith(suffixToMatch)).toBe(true);
    });
    usersToExpect.forEach((expectedUser) => {
      expect(
        fetchedUsers.find((u) => u.uuid === expectedUser.uuid),
      ).toBeDefined();
    });
  });

  it('should translate STARTS_WITH operator for a root field', async () => {
    const prefixToMatch = 'user_3';
    const usersToExpect = actualUsersFromDB.filter((user) =>
      user.username.startsWith(prefixToMatch),
    );

    if (usersToExpect.length === 0) {
      throw new Error(
        `Test data setup issue: No users found matching the prefix "${prefixToMatch}". Ensure fake data includes such users.`,
      );
    }

    const criteria = CriteriaFactory.GetCriteria(CriteriaUserSchema).where({
      field: 'username',
      operator: FilterOperator.STARTS_WITH,
      value: prefixToMatch,
    });

    const qb = await translateAndGetQueryBuilder<User>(criteria, UserEntity);
    const sql = qb.getSql();
    const params = qb.getParameters();
    const fetchedUsers = await qb.getMany();

    expect(sql).toContain(`WHERE (\`${criteria.alias}\`.\`username\` LIKE ?)`);
    expect(params['param_0']).toBe(`${prefixToMatch}%`);
    expect(fetchedUsers.length).toBe(usersToExpect.length);
    fetchedUsers.forEach((fetchedUser) => {
      expect(fetchedUser.username.startsWith(prefixToMatch)).toBe(true);
    });
    usersToExpect.forEach((expectedUser) => {
      expect(
        fetchedUsers.find((u) => u.uuid === expectedUser.uuid),
      ).toBeDefined();
    });
  });

  it('should translate NOT_CONTAINS operator', async () => {
    const substringToExclude = 'Authored by user_2';
    const postsToExpect = actualPostsFromDB.filter(
      (post) => !post.body.includes(substringToExclude),
    );
    const postsThatContainSubstring = actualPostsFromDB.filter((post) =>
      post.body.includes(substringToExclude),
    );

    if (postsThatContainSubstring.length === 0) {
      throw new Error(
        `Test data setup issue: No posts found containing "${substringToExclude}" to make exclusion meaningful.`,
      );
    }
    if (postsToExpect.length === 0 && actualPostsFromDB.length > 0) {
      throw new Error(
        `Test data setup issue: All posts contain "${substringToExclude}", so no posts would be expected by NOT_CONTAINS.`,
      );
    }

    const criteria = CriteriaFactory.GetCriteria(CriteriaPostSchema).where({
      field: 'body',
      operator: FilterOperator.NOT_CONTAINS,
      value: substringToExclude,
    });

    const qb = await translateAndGetQueryBuilder<Post>(criteria, PostEntity);
    const sql = qb.getSql();
    const params = qb.getParameters();
    const fetchedPosts = await qb.getMany();

    expect(sql).toContain(`WHERE (\`${criteria.alias}\`.\`body\` NOT LIKE ?)`);
    expect(params['param_0']).toBe(`%${substringToExclude}%`);
    expect(fetchedPosts.length).toBe(postsToExpect.length);
    fetchedPosts.forEach((fetchedPost) => {
      expect(fetchedPost.body.includes(substringToExclude)).toBe(false);
    });
    postsToExpect.forEach((expectedPost) => {
      expect(
        fetchedPosts.find((p) => p.uuid === expectedPost.uuid),
      ).toBeDefined();
    });
  });

  it('should translate NOT_LIKE operator', async () => {
    const patternToExclude = 'user_1%';
    const usersToExpect = actualUsersFromDB.filter(
      (user) => !user.username.startsWith('user_1'),
    );
    const usersThatMatchPattern = actualUsersFromDB.filter((user) =>
      user.username.startsWith('user_1'),
    );

    if (usersThatMatchPattern.length === 0) {
      throw new Error(
        `Test data setup issue: No users found matching pattern "${patternToExclude}" to make exclusion meaningful.`,
      );
    }
    if (usersToExpect.length === 0 && actualUsersFromDB.length > 0) {
      throw new Error(
        `Test data setup issue: All users match pattern "${patternToExclude}", so no users would be expected by NOT_LIKE.`,
      );
    }

    const criteria = CriteriaFactory.GetCriteria(CriteriaUserSchema).where({
      field: 'username',
      operator: FilterOperator.NOT_LIKE,
      value: patternToExclude,
    });

    const qb = await translateAndGetQueryBuilder<User>(criteria, UserEntity);
    const sql = qb.getSql();
    const params = qb.getParameters();
    const fetchedUsers = await qb.getMany();

    expect(sql).toContain(
      `WHERE (\`${criteria.alias}\`.\`username\` NOT LIKE ?)`,
    );
    expect(params['param_0']).toBe(patternToExclude);
    expect(fetchedUsers.length).toBe(usersToExpect.length);
    fetchedUsers.forEach((fetchedUser) => {
      expect(fetchedUser.username.startsWith('user_1')).toBe(false);
    });
    usersToExpect.forEach((expectedUser) => {
      expect(
        fetchedUsers.find((u) => u.uuid === expectedUser.uuid),
      ).toBeDefined();
    });
  });

  it('should translate NOT_IN operator', async () => {
    if (!actualUsersFromDB || actualUsersFromDB.length < 3) {
      throw new Error(
        'Test data setup issue: actualUsersFromDB needs at least 3 users for NOT_IN test.',
      );
    }
    const uuidsToExclude = [
      actualUsersFromDB[0]!.uuid,
      actualUsersFromDB[1]!.uuid,
    ];
    const usersToExpect = actualUsersFromDB.filter(
      (user) => !uuidsToExclude.includes(user.uuid),
    );

    const criteria = CriteriaFactory.GetCriteria(CriteriaUserSchema).where({
      field: 'uuid',
      operator: FilterOperator.NOT_IN,
      value: uuidsToExclude,
    });

    const qb = await translateAndGetQueryBuilder<User>(criteria, UserEntity);
    const sql = qb.getSql();
    const params = qb.getParameters();
    const fetchedUsers = await qb.getMany();

    expect(sql).toContain(
      `WHERE (\`${criteria.alias}\`.\`uuid\` NOT IN (?, ?))`,
    );
    expect(params['param_0']).toEqual(uuidsToExclude);
    expect(fetchedUsers.length).toBe(usersToExpect.length);
    fetchedUsers.forEach((fetchedUser) => {
      expect(uuidsToExclude.includes(fetchedUser.uuid)).toBe(false);
    });
    usersToExpect.forEach((expectedUser) => {
      expect(
        fetchedUsers.find((u) => u.uuid === expectedUser.uuid),
      ).toBeDefined();
    });
  });

  it('should throw an error for an unsupported filter operator', async () => {
    const unsupportedOperator = 'UNSUPPORTED_OPERATOR_VALUE' as FilterOperator;

    expect(() => {
      CriteriaFactory.GetCriteria(CriteriaUserSchema).where({
        field: 'email',
        operator: unsupportedOperator,
        value: 'test@example.com',
      });
    }).toThrowError(/Unhandled filter operator: UNSUPPORTED_OPERATOR_VALUE/);
  });

  it('should translate a simple WHERE clause with EQUALS operator', async () => {
    if (!actualUsersFromDB || actualUsersFromDB.length === 0) {
      throw new Error(
        'Test data setup issue: actualUsersFromDB is empty, cannot run test.',
      );
    }
    const testUser = actualUsersFromDB[0]!;

    const criteria = CriteriaFactory.GetCriteria(CriteriaUserSchema).where({
      field: 'email',
      operator: FilterOperator.EQUALS,
      value: testUser.email,
    });
    const qb = await translateAndGetQueryBuilder<User>(criteria, UserEntity);

    expect(qb.getSql()).toContain(
      `WHERE (\`${criteria.alias}\`.\`email\` = ?)`,
    );
    expect(qb.getParameters()).toEqual({ param_0: testUser.email });
  });

  it('should translate an AND WHERE clause', async () => {
    if (!actualUsersFromDB || actualUsersFromDB.length < 2) {
      throw new Error(
        'Test data setup issue: actualUsersFromDB needs at least 2 users for this test.',
      );
    }
    const userForLike = actualUsersFromDB[0]!;
    const userForNotEquals = actualUsersFromDB[1]!;

    const criteria = CriteriaFactory.GetCriteria(CriteriaUserSchema)
      .where({
        field: 'username',
        operator: FilterOperator.LIKE,
        value: `%${userForLike.username.substring(0, 3)}%`,
      })
      .andWhere({
        field: 'email',
        operator: FilterOperator.NOT_EQUALS,
        value: userForNotEquals.email,
      });
    const qb = await translateAndGetQueryBuilder<User>(criteria, UserEntity);

    expect(qb.getSql()).toContain(
      `WHERE (\`${criteria.alias}\`.\`username\` LIKE ? AND \`${criteria.alias}\`.\`email\` != ?)`,
    );
    expect(qb.getParameters()).toEqual({
      param_0: `%${userForLike.username.substring(0, 3)}%`,
      param_1: userForNotEquals.email,
    });
  });

  it('should translate an OR WHERE clause', async () => {
    if (!actualPostsFromDB || actualPostsFromDB.length < 2) {
      throw new Error(
        'Test data setup issue: actualPostsFromDB needs at least 2 posts for this test.',
      );
    }
    const postForEquals = actualPostsFromDB[0]!;
    const postForContains = actualPostsFromDB[1]!;

    const criteria = CriteriaFactory.GetCriteria(CriteriaPostSchema)
      .where({
        field: 'title',
        operator: FilterOperator.EQUALS,
        value: postForEquals.title,
      })
      .orWhere({
        field: 'body',
        operator: FilterOperator.CONTAINS,
        value: `${postForContains.body.substring(5, 15)}`,
      });
    const qb = await translateAndGetQueryBuilder<Post>(criteria, PostEntity);

    expect(qb.getSql()).toContain(
      `WHERE ((\`${criteria.alias}\`.\`title\` = ?) OR (\`${criteria.alias}\`.\`body\` LIKE ?))`,
    );
    expect(qb.getParameters()).toEqual({
      param_0: postForEquals.title,
      param_1: `%${postForContains.body.substring(5, 15)}%`,
    });
  });

  it('should translate complex nested AND/OR filters for root criteria', async () => {
    const criteria = CriteriaFactory.GetCriteria(CriteriaUserSchema)
      .where({
        field: 'email',
        operator: FilterOperator.LIKE,
        value: '%@example.com%',
      })
      .andWhere({
        field: 'username',
        operator: FilterOperator.EQUALS,
        value: 'user_1',
      })
      .orWhere({
        field: 'username',
        operator: FilterOperator.EQUALS,
        value: 'user_2',
      })
      .orWhere({
        field: 'uuid',
        operator: FilterOperator.EQUALS,
        value: 'some-uuid',
      });

    const qb = await translateAndGetQueryBuilder<User>(criteria, UserEntity);
    const sql = qb.getSql();

    expect(sql).toContain(
      `WHERE ((\`${criteria.alias}\`.\`email\` LIKE ? AND \`${criteria.alias}\`.\`username\` = ?) OR (\`${criteria.alias}\`.\`username\` = ?) OR (\`${criteria.alias}\`.\`uuid\` = ?))`,
    );
    expect(qb.getParameters()).toEqual({
      param_0: '%@example.com%',
      param_1: 'user_1',
      param_2: 'user_2',
      param_3: 'some-uuid',
    });
  });

  it('should translate IS NULL and IS NOT NULL operators', async () => {
    const criteria = CriteriaFactory.GetCriteria(CriteriaPostSchema)
      .where({
        field: 'body',
        operator: FilterOperator.IS_NULL,
        value: null,
      })
      .orWhere({
        field: 'title',
        operator: FilterOperator.IS_NOT_NULL,
        value: null,
      });
    const qb = await translateAndGetQueryBuilder<Post>(criteria, PostEntity);

    expect(qb.getSql()).toContain(
      `WHERE ((\`${criteria.alias}\`.\`body\` IS NULL) OR (\`${criteria.alias}\`.\`title\` IS NOT NULL))`,
    );
    expect(qb.getParameters()).toEqual({});
  });

  it('should translate IN operator', async () => {
    if (!actualUsersFromDB || actualUsersFromDB.length < 2) {
      throw new Error(
        'Test data setup issue: actualUsersFromDB needs at least 2 users for this test.',
      );
    }
    const userIds = [actualUsersFromDB[0]!.uuid, actualUsersFromDB[1]!.uuid];
    const expectedUsers = actualUsersFromDB.filter((user) =>
      userIds.includes(user.uuid),
    );

    const criteria = CriteriaFactory.GetCriteria(CriteriaUserSchema).where({
      field: 'uuid',
      operator: FilterOperator.IN,
      value: userIds,
    });

    const qb = await translateAndGetQueryBuilder<User>(criteria, UserEntity);
    const sql = qb.getSql();
    const params = qb.getParameters();
    const fetchedUsers = await qb.getMany();

    expect(sql).toContain(`WHERE (\`${criteria.alias}\`.\`uuid\` IN (?, ?))`);
    expect(params['param_0']).toEqual(userIds);
    expect(fetchedUsers.length).toBe(expectedUsers.length);

    const fetchedUserIds = fetchedUsers.map((u) => u.uuid).sort();
    const expectedUserIds = expectedUsers.map((u) => u.uuid).sort();
    expect(fetchedUserIds).toEqual(expectedUserIds);
  });
});
