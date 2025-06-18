import { TypeOrmMysqlTranslator } from '../type-orm.mysql.translator.js';
import { IsNull, Not, type ObjectLiteral } from 'typeorm';
import {
  initializeDataSourceService,
  TypeORMUtils,
} from './utils/type-orm.utils.js';
import {
  PostSchema as CriteriaPostSchema,
  UserSchema as CriteriaUserSchema,
  type Post,
  type User,
  type DomainEvent,
  DomainEventsSchema,
  EventType,
} from './utils/fake-entities.js';
import { UserEntity } from './utils/entities/user.entity.js';
import { PostEntity } from './utils/entities/post.entity.js';
import { beforeEach, describe, expect, it, beforeAll } from 'vitest';
import { EventEntitySchema } from './utils/entities/event.entity.js';
import {
  CriteriaFactory,
  FilterOperator,
} from '@nulledexp/translatable-criteria';

describe('TypeOrmMysqlTranslator - Basic Filters', () => {
  let translator: TypeOrmMysqlTranslator<ObjectLiteral>;
  let actualUsersFromDB: User[];
  let actualPostsFromDB: Post[];

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
    const alias = CriteriaUserSchema.alias[0];
    const suffixToMatch = '@example.com';
    const usersToExpect = actualUsersFromDB.filter((user) =>
      user.email.endsWith(suffixToMatch),
    );

    if (usersToExpect.length === 0) {
      throw new Error(
        `Test data setup issue: No users found matching the suffix "${suffixToMatch}". Ensure fake data includes such users.`,
      );
    }

    const criteria = CriteriaFactory.GetCriteria(
      CriteriaUserSchema,
      alias,
    ).where({
      field: 'email',
      operator: FilterOperator.ENDS_WITH,
      value: suffixToMatch,
    });

    const qb = await TypeORMUtils.getQueryBuilderFor<User>(UserEntity, alias);
    translator.translate(criteria, qb);
    const sql = qb.getSql();
    const params = qb.getParameters();

    expect(sql).toContain(`WHERE (\`${alias}\`.\`email\` LIKE ?)`);
    expect(params['param_0']).toBe(`%${suffixToMatch}`);

    const fetchedUsers = await qb.getMany();
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
    const alias = CriteriaUserSchema.alias[0];
    const prefixToMatch = 'user_3';
    const usersToExpect = actualUsersFromDB.filter((user) =>
      user.username.startsWith(prefixToMatch),
    );

    if (usersToExpect.length === 0) {
      throw new Error(
        `Test data setup issue: No users found matching the prefix "${prefixToMatch}". Ensure fake data includes such users.`,
      );
    }

    const criteria = CriteriaFactory.GetCriteria(
      CriteriaUserSchema,
      alias,
    ).where({
      field: 'username',
      operator: FilterOperator.STARTS_WITH,
      value: prefixToMatch,
    });

    const qb = await TypeORMUtils.getQueryBuilderFor<User>(UserEntity, alias);
    translator.translate(criteria, qb);
    const sql = qb.getSql();
    const params = qb.getParameters();

    expect(sql).toContain(`WHERE (\`${alias}\`.\`username\` LIKE ?)`);
    expect(params['param_0']).toBe(`${prefixToMatch}%`);

    const fetchedUsers = await qb.getMany();
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
    const alias = CriteriaPostSchema.alias[0];
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

    const criteria = CriteriaFactory.GetCriteria(
      CriteriaPostSchema,
      alias,
    ).where({
      field: 'body',
      operator: FilterOperator.NOT_CONTAINS,
      value: substringToExclude,
    });

    const qb = await TypeORMUtils.getQueryBuilderFor<Post>(PostEntity, alias);
    translator.translate(criteria, qb);
    const sql = qb.getSql();
    const params = qb.getParameters();

    expect(sql).toContain(`WHERE (\`${alias}\`.\`body\` NOT LIKE ?)`);
    expect(params['param_0']).toBe(`%${substringToExclude}%`);

    const fetchedPosts = await qb.getMany();
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
    const alias = CriteriaUserSchema.alias[0];
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

    const criteria = CriteriaFactory.GetCriteria(
      CriteriaUserSchema,
      alias,
    ).where({
      field: 'username',
      operator: FilterOperator.NOT_LIKE,
      value: patternToExclude,
    });

    const qb = await TypeORMUtils.getQueryBuilderFor<User>(UserEntity, alias);
    translator.translate(criteria, qb);
    const sql = qb.getSql();
    const params = qb.getParameters();

    expect(sql).toContain(`WHERE (\`${alias}\`.\`username\` NOT LIKE ?)`);
    expect(params['param_0']).toBe(patternToExclude);

    const fetchedUsers = await qb.getMany();
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
    const alias = CriteriaUserSchema.alias[0];
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

    const criteria = CriteriaFactory.GetCriteria(
      CriteriaUserSchema,
      alias,
    ).where({
      field: 'uuid',
      operator: FilterOperator.NOT_IN,
      value: uuidsToExclude,
    });

    const qb = await TypeORMUtils.getQueryBuilderFor<User>(UserEntity, alias);
    translator.translate(criteria, qb);
    const sql = qb.getSql();
    const params = qb.getParameters();

    expect(sql).toContain(`WHERE (\`${alias}\`.\`uuid\` NOT IN (?, ?))`);
    expect(params['param_0']).toEqual(uuidsToExclude);

    const fetchedUsers = await qb.getMany();
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
    const alias = CriteriaUserSchema.alias[0];
    // This operator value will cause the default case in the switch to be hit.
    const unsupportedOperator = 'UNSUPPORTED_OPERATOR_VALUE' as FilterOperator;

    const criteria = CriteriaFactory.GetCriteria(
      CriteriaUserSchema,
      alias,
    ).where({
      field: 'email',
      operator: unsupportedOperator,
      value: 'test@example.com',
    });

    const qb = await TypeORMUtils.getQueryBuilderFor<User>(UserEntity, alias);

    expect(() => translator.translate(criteria, qb)).toThrowError(
      /Unsupported filter operator/,
    );
  });

  it('should translate a simple WHERE clause with EQUALS operator', async () => {
    const alias = CriteriaUserSchema.alias[0];
    if (!actualUsersFromDB || actualUsersFromDB.length === 0) {
      throw new Error(
        'Test data setup issue: actualUsersFromDB is empty, cannot run test.',
      );
    }
    const testUser = actualUsersFromDB[0]!;

    const criteria = CriteriaFactory.GetCriteria(
      CriteriaUserSchema,
      alias,
    ).where({
      field: 'email',
      operator: FilterOperator.EQUALS,
      value: testUser.email,
    });
    const qb = await TypeORMUtils.getQueryBuilderFor<User>(UserEntity, alias);
    translator.translate(criteria, qb);

    expect(qb.getSql()).toContain(`WHERE (\`${alias}\`.\`email\` = ?)`);
    expect(qb.getParameters()).toEqual({ param_0: testUser.email });
  });

  it('should translate an AND WHERE clause', async () => {
    const alias = CriteriaUserSchema.alias[0];
    if (!actualUsersFromDB || actualUsersFromDB.length < 2) {
      throw new Error(
        'Test data setup issue: actualUsersFromDB needs at least 2 users for this test.',
      );
    }
    const userForLike = actualUsersFromDB[0]!;
    const userForNotEquals = actualUsersFromDB[1]!;

    const criteria = CriteriaFactory.GetCriteria(CriteriaUserSchema, alias)
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
    const qb = await TypeORMUtils.getQueryBuilderFor<User>(UserEntity, alias);
    translator.translate(criteria, qb);

    expect(qb.getSql()).toContain(
      `WHERE (\`${alias}\`.\`username\` LIKE ? AND \`${alias}\`.\`email\` != ?)`,
    );
    expect(qb.getParameters()).toEqual({
      param_0: `%${userForLike.username.substring(0, 3)}%`,
      param_1: userForNotEquals.email,
    });
  });

  it('should translate an OR WHERE clause', async () => {
    const alias = CriteriaPostSchema.alias[0];
    if (!actualPostsFromDB || actualPostsFromDB.length < 2) {
      throw new Error(
        'Test data setup issue: actualPostsFromDB needs at least 2 posts for this test.',
      );
    }
    const postForEquals = actualPostsFromDB[0]!;
    const postForContains = actualPostsFromDB[1]!;

    const criteria = CriteriaFactory.GetCriteria(CriteriaPostSchema, alias)
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
    const qb = await TypeORMUtils.getQueryBuilderFor<Post>(PostEntity, alias);
    translator.translate(criteria, qb);

    expect(qb.getSql()).toContain(
      `WHERE ((\`${alias}\`.\`title\` = ?) OR (\`${alias}\`.\`body\` LIKE ?))`,
    );
    expect(qb.getParameters()).toEqual({
      param_0: postForEquals.title,
      param_1: `%${postForContains.body.substring(5, 15)}%`,
    });
  });

  it('should translate complex nested AND/OR filters for root criteria', async () => {
    const alias = CriteriaUserSchema.alias[0];
    const criteria = CriteriaFactory.GetCriteria(CriteriaUserSchema, alias)
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
        value: 'some-uuid', // Using a fixed value for predictability
      });

    const qb = await TypeORMUtils.getQueryBuilderFor<User>(UserEntity, alias);
    translator.translate(criteria, qb);
    const sql = qb.getSql();
    expect(sql).toContain(
      `WHERE ((\`${alias}\`.\`email\` LIKE ? AND \`${alias}\`.\`username\` = ?) OR (\`${alias}\`.\`username\` = ?) OR (\`${alias}\`.\`uuid\` = ?))`,
    );
    expect(qb.getParameters()).toEqual({
      param_0: '%@example.com%',
      param_1: 'user_1',
      param_2: 'user_2',
      param_3: 'some-uuid',
    });
  });

  it('should translate IS NULL and IS NOT NULL operators', async () => {
    const alias = CriteriaPostSchema.alias[0];
    const criteria = CriteriaFactory.GetCriteria(CriteriaPostSchema, alias)
      .where({
        field: 'body', // Assuming 'body' can be null
        operator: FilterOperator.IS_NULL,
        value: null,
      })
      .orWhere({
        field: 'title', // Assuming 'title' is generally not null
        operator: FilterOperator.IS_NOT_NULL,
        value: null,
      });
    const qb = await TypeORMUtils.getQueryBuilderFor<Post>(PostEntity, alias);
    translator.translate(criteria, qb);

    expect(qb.getSql()).toContain(
      `WHERE ((\`${alias}\`.\`body\` IS NULL) OR (\`${alias}\`.\`title\` IS NOT NULL))`,
    );
    expect(qb.getParameters()).toEqual({}); // IS NULL/IS NOT NULL don't use parameters
  });

  it('should translate IN operator', async () => {
    const alias = CriteriaUserSchema.alias[0];
    if (!actualUsersFromDB || actualUsersFromDB.length < 2) {
      throw new Error(
        'Test data setup issue: actualUsersFromDB needs at least 2 users for this test.',
      );
    }
    const userIds = [actualUsersFromDB[0]!.uuid, actualUsersFromDB[1]!.uuid];

    const criteria = CriteriaFactory.GetCriteria(
      CriteriaUserSchema,
      alias,
    ).where({
      field: 'uuid',
      operator: FilterOperator.IN,
      value: userIds,
    });
    const qb = await TypeORMUtils.getQueryBuilderFor<User>(UserEntity, alias);
    translator.translate(criteria, qb);

    expect(qb.getSql()).toContain(`WHERE (\`${alias}\`.\`uuid\` IN (?, ?))`);
    expect(qb.getParameters()).toEqual({ param_0: userIds });
  });
});

describe('TypeOrmMysqlTranslator - JSON/Array Operators', () => {
  let translator: TypeOrmMysqlTranslator<ObjectLiteral>;
  let actualDomainEventsFromDB: DomainEvent<any>[];
  let postsWithMetadataFromDB: Post[];

  beforeAll(async () => {
    const dataSource = await initializeDataSourceService(false);
    actualDomainEventsFromDB = await dataSource
      .getRepository(EventEntitySchema)
      .find();
    // Specifically fetch posts that have metadata for relevant tests
    postsWithMetadataFromDB = await dataSource
      .getRepository(PostEntity)
      .find({ where: { metadata: Not(IsNull()) } });
  });

  beforeEach(() => {
    translator = new TypeOrmMysqlTranslator();
  });

  it('should translate JSON_CONTAINS for a top-level key-value pair', async () => {
    const alias = DomainEventsSchema.alias[0];
    const targetEvent = actualDomainEventsFromDB.find(
      (e) => e.event_body.status === 'published',
    );
    if (!targetEvent)
      throw new Error(
        'Test data issue: Event with event_body.status "published" not found.',
      );

    const criteria = CriteriaFactory.GetCriteria(
      DomainEventsSchema,
      alias,
    ).where({
      field: 'event_body',
      operator: FilterOperator.JSON_CONTAINS,
      value: { status: 'published' },
    });
    const qb = await TypeORMUtils.getEventsQueryBuilder(alias);
    translator.translate(criteria, qb);
    const sql = qb.getSql();
    expect(sql).toContain(
      `JSON_EXTRACT(\`${alias}\`.\`event_body\`, '$.status') = ?`,
    );
    expect(qb.getParameters()).toEqual({ param_0_json_0: 'published' });
    const results = await qb.getMany();
    expect(results.some((r) => r.id === targetEvent.id)).toBe(true);
  });

  it('should translate JSON_CONTAINS for a nested path', async () => {
    const alias = DomainEventsSchema.alias[0];
    const targetEvent = actualDomainEventsFromDB.find(
      (e) => e.event_body.details?.ip_address === '192.168.1.100',
    );
    if (!targetEvent)
      throw new Error(
        'Test data issue: Event with event_body.details.ip_address "192.168.1.100" not found.',
      );

    const criteria = CriteriaFactory.GetCriteria(
      DomainEventsSchema,
      alias,
    ).where({
      field: 'event_body',
      operator: FilterOperator.JSON_CONTAINS,
      value: { 'details.ip_address': '192.168.1.100' },
    });
    const qb = await TypeORMUtils.getEventsQueryBuilder(alias);
    translator.translate(criteria, qb);
    const sql = qb.getSql();
    expect(sql).toContain(
      `JSON_EXTRACT(\`${alias}\`.\`event_body\`, '$.details.ip_address') = ?`,
    );
    expect(qb.getParameters()).toEqual({ param_0_json_0: '192.168.1.100' });
    const results = await qb.getMany();
    expect(results.some((r) => r.id === targetEvent.id)).toBe(true);
  });

  it('should translate JSON_NOT_CONTAINS for a top-level key (checking current behavior)', async () => {
    const alias = DomainEventsSchema.alias[0];
    const valueToExclude = 'some_value_to_exclude';
    const criteria = CriteriaFactory.GetCriteria(
      DomainEventsSchema,
      alias,
    ).where({
      field: 'event_body',
      operator: FilterOperator.JSON_NOT_CONTAINS,
      value: { status: valueToExclude }, // Assuming 'status' is a common key
    });
    const qb = await TypeORMUtils.getEventsQueryBuilder(alias);
    translator.translate(criteria, qb);
    const sql = qb.getSql();

    // This test verifies the (IS NULL OR <> ?) logic for JSON_NOT_CONTAINS
    expect(sql).toContain(
      `(JSON_EXTRACT(\`${alias}\`.\`event_body\`, '$.status') IS NULL OR JSON_EXTRACT(\`${alias}\`.\`event_body\`, '$.status') <> ?)`,
    );
    expect(qb.getParameters()).toEqual({ param_0_json_0: valueToExclude });

    const results = await qb.getMany();
    const expectedResults = actualDomainEventsFromDB.filter(
      (e) =>
        e.event_body.status === undefined ||
        e.event_body.status !== valueToExclude,
    );
    expect(results.length).toBe(expectedResults.length);
  });

  it('should translate ARRAY_CONTAINS_ELEMENT for a direct value in JSON array path', async () => {
    const alias = DomainEventsSchema.alias[0];
    const targetEvent = actualDomainEventsFromDB.find((e) =>
      e.event_body.tags?.includes('security'),
    );
    if (!targetEvent)
      throw new Error('Test data issue: Event with tag "security" not found.');

    const criteria = CriteriaFactory.GetCriteria(
      DomainEventsSchema,
      alias,
    ).where({
      field: 'event_body',
      operator: FilterOperator.ARRAY_CONTAINS_ELEMENT,
      value: { tags: 'security' },
    });
    const qb = await TypeORMUtils.getEventsQueryBuilder(alias);
    translator.translate(criteria, qb);
    const sql = qb.getSql();
    expect(sql).toContain(
      `JSON_CONTAINS(\`${alias}\`.\`event_body\`, ?, '$.tags')`,
    );
    expect(qb.getParameters()).toEqual({
      param_0: JSON.stringify('security'),
    });
    const results = await qb.getMany();
    expect(results.some((r) => r.id === targetEvent.id)).toBe(true);
  });

  it('should translate ARRAY_CONTAINS_ELEMENT for a direct value in a top-level JSON array field (Post metadata)', async () => {
    const alias = CriteriaPostSchema.alias[0];
    const targetPost = postsWithMetadataFromDB.find((p) =>
      p.metadata?.tags?.includes('common_tag'),
    );
    if (!targetPost)
      throw new Error(
        'Test data issue: Post with metadata.tags containing "common_tag" not found.',
      );

    const criteria = CriteriaFactory.GetCriteria(
      CriteriaPostSchema,
      alias,
    ).where({
      field: 'metadata',
      operator: FilterOperator.ARRAY_CONTAINS_ELEMENT,
      value: { tags: 'common_tag' },
    });
    const qb = await TypeORMUtils.getQueryBuilderFor<Post>(PostEntity, alias);
    translator.translate(criteria, qb);
    const sql = qb.getSql();
    expect(sql).toContain(
      `JSON_CONTAINS(\`${alias}\`.\`metadata\`, ?, '$.tags')`,
    );
    expect(qb.getParameters()).toEqual({
      param_0: JSON.stringify('common_tag'),
    });
    const results = await qb.getMany();
    expect(results.some((r) => r.uuid === targetPost.uuid)).toBe(true);
  });

  it('should translate ARRAY_CONTAINS_ALL_ELEMENTS for a JSON array path', async () => {
    const alias = DomainEventsSchema.alias[0];
    const targetEvent = actualDomainEventsFromDB.find(
      (e) =>
        e.event_type === EventType.User.Permission.Changed &&
        e.event_body.added_permissions?.includes('read') &&
        e.event_body.added_permissions?.includes('write') &&
        e.event_body.added_permissions?.length === 2,
    );

    if (!targetEvent)
      throw new Error(
        'Test data issue: Specific Event with added_permissions ["read", "write"] not found.',
      );

    const criteria = CriteriaFactory.GetCriteria(
      DomainEventsSchema,
      alias,
    ).where({
      field: 'event_body',
      operator: FilterOperator.ARRAY_CONTAINS_ALL_ELEMENTS,
      value: { added_permissions: ['read', 'write'] },
    });
    const qb = await TypeORMUtils.getEventsQueryBuilder(alias);
    translator.translate(criteria, qb);
    const sql = qb.getSql();
    expect(sql).toContain(
      `JSON_CONTAINS(\`${alias}\`.\`event_body\`, ?, '$.added_permissions') AND JSON_CONTAINS(\`${alias}\`.\`event_body\`, ?, '$.added_permissions')`,
    );
    expect(qb.getParameters()).toEqual({
      param_0_all_0: JSON.stringify('read'),
      param_0_all_1: JSON.stringify('write'),
    });
    const results = await qb.getMany();
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe(targetEvent.id);
  });

  it('should translate ARRAY_CONTAINS_ANY_ELEMENT for a JSON array path', async () => {
    const alias = CriteriaPostSchema.alias[0];
    const targetPost = postsWithMetadataFromDB.find(
      (p) =>
        p.metadata?.tags?.includes('tag0') ||
        p.metadata?.tags?.includes('common_tag'),
    );
    if (!targetPost)
      throw new Error(
        'Test data issue: Post with metadata.tags containing "tag0" or "common_tag" not found.',
      );

    const criteria = CriteriaFactory.GetCriteria(
      CriteriaPostSchema,
      alias,
    ).where({
      field: 'metadata',
      operator: FilterOperator.ARRAY_CONTAINS_ANY_ELEMENT,
      value: { tags: ['tag0', 'common_tag'] },
    });
    const qb = await TypeORMUtils.getQueryBuilderFor<Post>(PostEntity, alias);
    translator.translate(criteria, qb);
    const sql = qb.getSql();
    expect(sql).toContain(
      `JSON_CONTAINS(\`${alias}\`.\`metadata\`, ?, '$.tags') OR JSON_CONTAINS(\`${alias}\`.\`metadata\`, ?, '$.tags')`,
    );
    expect(qb.getParameters()).toEqual({
      param_0_any_0: JSON.stringify('tag0'),
      param_0_any_1: JSON.stringify('common_tag'),
    });
    const results = await qb.getMany();
    expect(results.some((r) => r.uuid === targetPost.uuid)).toBe(true);
  });

  it('should translate ARRAY_EQUALS for a JSON array path', async () => {
    const alias = DomainEventsSchema.alias[0];
    const exactArray = ['read', 'write'];
    const targetEvent = actualDomainEventsFromDB.find(
      (e) =>
        e.event_type === EventType.User.Permission.Changed &&
        JSON.stringify(e.event_body.added_permissions) ===
          JSON.stringify(exactArray),
    );
    if (!targetEvent)
      throw new Error(
        `Test data issue: Specific Event with exact added_permissions ${JSON.stringify(exactArray)} not found.`,
      );

    const criteria = CriteriaFactory.GetCriteria(
      DomainEventsSchema,
      alias,
    ).where({
      field: 'event_body',
      operator: FilterOperator.ARRAY_EQUALS,
      value: { added_permissions: exactArray },
    });
    const qb = await TypeORMUtils.getEventsQueryBuilder(alias);
    translator.translate(criteria, qb);
    const sql = qb.getSql();

    expect(sql).toContain(
      `JSON_LENGTH(JSON_EXTRACT(\`${alias}\`.\`event_body\`, '$.added_permissions')) = ?`,
    );
    expect(sql).toContain(
      // For each element, it checks if the whole array contains that element.
      // This is part of ensuring all elements are present.
      `JSON_CONTAINS(JSON_EXTRACT(\`${alias}\`.\`event_body\`, '$.added_permissions'), ?, '$')`,
    );

    expect(qb.getParameters()).toEqual({
      param_0_len: exactArray.length,
      param_0_eq_el_0: JSON.stringify(exactArray[0]),
      param_0_eq_el_1: JSON.stringify(exactArray[1]),
    });

    const results = await qb.getMany();
    expect(results.some((r) => r.id === targetEvent.id)).toBe(true);
  });

  it('should translate JSON_NOT_CONTAINS correctly when the key does not exist', async () => {
    const alias = DomainEventsSchema.alias[0];
    const nonExistentKey = 'this_key_really_does_not_exist';
    const someValue = 'any_value';
    const expectedEventsCount = actualDomainEventsFromDB.length;

    const criteria = CriteriaFactory.GetCriteria(
      DomainEventsSchema,
      alias,
    ).where({
      field: 'event_body',
      operator: FilterOperator.JSON_NOT_CONTAINS,
      value: { [nonExistentKey]: someValue },
    });

    const qb = await TypeORMUtils.getEventsQueryBuilder(alias);
    translator.translate(criteria, qb);
    const sql = qb.getSql();
    const params = qb.getParameters();

    expect(sql).toContain(
      `(JSON_EXTRACT(\`${alias}\`.\`event_body\`, '$.${nonExistentKey}') IS NULL OR JSON_EXTRACT(\`${alias}\`.\`event_body\`, '$.${nonExistentKey}') <> ?)`,
    );
    expect(params['param_0_json_0']).toBe(someValue);

    const fetchedEvents = await qb.getMany();
    expect(fetchedEvents.length).toBe(expectedEventsCount);
  });

  it('should translate JSON_NOT_CONTAINS correctly when key exists but value is different', async () => {
    const alias = DomainEventsSchema.alias[0];
    const targetEvent = actualDomainEventsFromDB.find(
      (e) => e.event_body.status === 'published',
    );
    if (!targetEvent) {
      throw new Error(
        'Test data issue: Event with status "published" not found for JSON_NOT_CONTAINS test.',
      );
    }
    const valueToExclude = 'a_completely_different_status';
    const expectedEvents = actualDomainEventsFromDB.filter(
      (e) =>
        e.event_body.status === undefined ||
        e.event_body.status !== valueToExclude,
    );

    const criteria = CriteriaFactory.GetCriteria(
      DomainEventsSchema,
      alias,
    ).where({
      field: 'event_body',
      operator: FilterOperator.JSON_NOT_CONTAINS,
      value: { status: valueToExclude },
    });

    const qb = await TypeORMUtils.getEventsQueryBuilder(alias);
    translator.translate(criteria, qb);
    const sql = qb.getSql();
    const params = qb.getParameters();

    expect(sql).toContain(
      `(JSON_EXTRACT(\`${alias}\`.\`event_body\`, '$.status') IS NULL OR JSON_EXTRACT(\`${alias}\`.\`event_body\`, '$.status') <> ?)`,
    );
    expect(params['param_0_json_0']).toBe(valueToExclude);

    const fetchedEvents = await qb.getMany();
    expect(fetchedEvents.length).toBe(expectedEvents.length);
    expect(fetchedEvents.some((fe) => fe.id === targetEvent.id)).toBe(true);
  });

  it('should translate ARRAY_CONTAINS_ELEMENT for a top-level JSON array column (DomainEvent direct_tags)', async () => {
    const alias = DomainEventsSchema.alias[0];
    const targetTag = 'user_event';
    const expectedEvents = actualDomainEventsFromDB.filter((e) =>
      e.direct_tags?.includes(targetTag),
    );

    if (expectedEvents.length === 0) {
      throw new Error(
        `Test data issue: No domain events with direct_tags containing "${targetTag}" found.`,
      );
    }

    const criteria = CriteriaFactory.GetCriteria(
      DomainEventsSchema,
      alias,
    ).where({
      field: 'direct_tags',
      operator: FilterOperator.ARRAY_CONTAINS_ELEMENT,
      value: targetTag,
    });

    const qb = await TypeORMUtils.getEventsQueryBuilder(alias);
    translator.translate(criteria, qb);
    const sql = qb.getSql();
    const params = qb.getParameters();

    expect(sql).toContain(`JSON_CONTAINS(\`${alias}\`.\`direct_tags\`, ?)`);
    expect(params['param_0']).toBe(JSON.stringify(targetTag));

    const fetchedEvents = await qb.getMany();
    expect(fetchedEvents.length).toBe(expectedEvents.length);
    fetchedEvents.forEach((fe) => {
      expect(fe.direct_tags).toBeDefined();
      expect(fe.direct_tags).toContain(targetTag);
    });
  });

  it('should translate ARRAY_EQUALS with an empty array for a JSON path (event_body.tags)', async () => {
    const alias = DomainEventsSchema.alias[0];
    const emptyArray: string[] = [];
    const expectedEvents = actualDomainEventsFromDB.filter(
      (e) => Array.isArray(e.event_body.tags) && e.event_body.tags.length === 0,
    );

    if (expectedEvents.length === 0) {
      throw new Error(
        'Test data issue: No domain events with empty event_body.tags found.',
      );
    }

    const criteria = CriteriaFactory.GetCriteria(
      DomainEventsSchema,
      alias,
    ).where({
      field: 'event_body',
      operator: FilterOperator.ARRAY_EQUALS,
      value: { tags: emptyArray },
    });

    const qb = await TypeORMUtils.getEventsQueryBuilder(alias);
    translator.translate(criteria, qb);
    const sql = qb.getSql();
    const params = qb.getParameters();

    expect(sql).toContain(
      `JSON_LENGTH(JSON_EXTRACT(\`${alias}\`.\`event_body\`, '$.tags')) = ?`,
    );
    const lengthParamKey = Object.keys(params).find((key) =>
      key.endsWith('_len'),
    );
    expect(lengthParamKey).toBeDefined();
    if (lengthParamKey) {
      expect(params[lengthParamKey]).toBe(0);
    }
    expect(Object.keys(params).some((key) => key.includes('_eq_el_'))).toBe(
      false,
    );

    const fetchedEvents = await qb.getMany();
    expect(fetchedEvents.length).toBe(expectedEvents.length);
    fetchedEvents.forEach((fe) => {
      expect(
        Array.isArray(fe.event_body.tags) && fe.event_body.tags.length === 0,
      ).toBe(true);
    });
  });

  it('should translate ARRAY_EQUALS with an empty array for a top-level JSON array column (direct_tags)', async () => {
    const alias = DomainEventsSchema.alias[0];
    const emptyArray: string[] = [];
    const expectedEvents = actualDomainEventsFromDB.filter(
      (e) => Array.isArray(e.direct_tags) && e.direct_tags.length === 0,
    );

    if (expectedEvents.length === 0) {
      throw new Error(
        'Test data issue: No domain events with empty direct_tags found.',
      );
    }

    const criteria = CriteriaFactory.GetCriteria(
      DomainEventsSchema,
      alias,
    ).where({
      field: 'direct_tags',
      operator: FilterOperator.ARRAY_EQUALS,
      value: emptyArray,
    });

    const qb = await TypeORMUtils.getEventsQueryBuilder(alias);
    translator.translate(criteria, qb);
    const sql = qb.getSql();
    const params = qb.getParameters();

    expect(sql).toContain(`JSON_LENGTH(\`${alias}\`.\`direct_tags\`) = ?`);
    const lengthParamKey = Object.keys(params).find((key) =>
      key.endsWith('_len'),
    );
    expect(lengthParamKey).toBeDefined();
    if (lengthParamKey) {
      expect(params[lengthParamKey]).toBe(0);
    }
    expect(Object.keys(params).some((key) => key.includes('_eq_el_'))).toBe(
      false,
    );

    const fetchedEvents = await qb.getMany();
    expect(fetchedEvents.length).toBe(expectedEvents.length);
    fetchedEvents.forEach((fe) => {
      expect(Array.isArray(fe.direct_tags) && fe.direct_tags.length === 0).toBe(
        true,
      );
    });
  });

  describe('TypeOrmMysqlTranslator - Simple Array (categories) Filters', () => {
    let allPostsFromDB: Post[];

    beforeAll(async () => {
      const dataSource = await initializeDataSourceService(false);
      allPostsFromDB = await dataSource.getRepository(PostEntity).find();
    });

    it('should translate IS_NULL for categories field', async () => {
      const alias = CriteriaPostSchema.alias[0];
      const postsWithNullCategories = allPostsFromDB.filter(
        (p) => p.categories === null,
      );
      if (postsWithNullCategories.length === 0) {
        throw new Error(
          'Test data issue: No posts with NULL categories found.',
        );
      }

      const criteria = CriteriaFactory.GetCriteria(
        CriteriaPostSchema,
        alias,
      ).where({
        field: 'categories',
        operator: FilterOperator.IS_NULL,
        value: null,
      });
      const qb = await TypeORMUtils.getQueryBuilderFor<Post>(PostEntity, alias);
      translator.translate(criteria, qb);
      const sql = qb.getSql();

      expect(sql).toContain(`\`${alias}\`.\`categories\` IS NULL`);
      const fetchedPosts = await qb.getMany();
      expect(fetchedPosts.length).toBe(postsWithNullCategories.length);
      fetchedPosts.forEach((fp) => expect(fp.categories).toBeNull());
    });

    it('should translate IS_NOT_NULL for categories field', async () => {
      const alias = CriteriaPostSchema.alias[0];
      const postsWithNonNullCategories = allPostsFromDB.filter(
        (p) => p.categories !== null,
      );
      if (postsWithNonNullCategories.length === 0) {
        throw new Error(
          'Test data issue: No posts with NON-NULL categories found.',
        );
      }

      const criteria = CriteriaFactory.GetCriteria(
        CriteriaPostSchema,
        alias,
      ).where({
        field: 'categories',
        operator: FilterOperator.IS_NOT_NULL,
        value: null,
      });
      const qb = await TypeORMUtils.getQueryBuilderFor<Post>(PostEntity, alias);
      translator.translate(criteria, qb);
      const sql = qb.getSql();

      expect(sql).toContain(`\`${alias}\`.\`categories\` IS NOT NULL`);
      const fetchedPosts = await qb.getMany();
      expect(fetchedPosts.length).toBe(postsWithNonNullCategories.length);
      fetchedPosts.forEach((fp) => expect(fp.categories).not.toBeNull());
    });

    it('should translate SET_CONTAINS for categories field', async () => {
      const alias = CriteriaPostSchema.alias[0];
      const targetCategory = 'tech';
      const postsWithTechCategory = allPostsFromDB.filter((p) =>
        p.categories?.includes(targetCategory),
      );

      if (postsWithTechCategory.length === 0) {
        throw new Error(
          `Test data issue: No posts with category "${targetCategory}" found.`,
        );
      }

      const criteria = CriteriaFactory.GetCriteria(
        CriteriaPostSchema,
        alias,
      ).where({
        field: 'categories',
        operator: FilterOperator.SET_CONTAINS,
        value: targetCategory,
      });
      const qb = await TypeORMUtils.getQueryBuilderFor<Post>(PostEntity, alias);
      translator.translate(criteria, qb);
      const sql = qb.getSql();
      const params = qb.getParameters();

      expect(sql).toContain(
        `(\`${alias}\`.\`categories\` IS NOT NULL AND FIND_IN_SET(?, \`${alias}\`.\`categories\`) > 0)`,
      );
      expect(params['param_0']).toBe(targetCategory);

      const fetchedPosts = await qb.getMany();
      expect(fetchedPosts.length).toBe(postsWithTechCategory.length);
      fetchedPosts.forEach((fp) =>
        expect(fp.categories).toContain(targetCategory),
      );
    });

    it('should translate SET_NOT_CONTAINS for categories field', async () => {
      const alias = CriteriaPostSchema.alias[0];
      const targetCategoryToExclude = 'news';
      const postsWithoutNewsCategory = allPostsFromDB.filter(
        (p) => !p.categories?.includes(targetCategoryToExclude),
      );

      if (postsWithoutNewsCategory.length === 0 && allPostsFromDB.length > 0) {
        throw new Error(
          `Test data issue: All posts seem to contain "${targetCategoryToExclude}".`,
        );
      }

      const criteria = CriteriaFactory.GetCriteria(
        CriteriaPostSchema,
        alias,
      ).where({
        field: 'categories',
        operator: FilterOperator.SET_NOT_CONTAINS,
        value: targetCategoryToExclude,
      });
      const qb = await TypeORMUtils.getQueryBuilderFor<Post>(PostEntity, alias);
      translator.translate(criteria, qb);
      const sql = qb.getSql();
      const params = qb.getParameters();

      expect(sql).toContain(
        `(\`${alias}\`.\`categories\` IS NULL OR FIND_IN_SET(?, \`${alias}\`.\`categories\`) = 0)`,
      );
      expect(params['param_0']).toBe(targetCategoryToExclude);

      const fetchedPosts = await qb.getMany();
      expect(fetchedPosts.length).toBe(postsWithoutNewsCategory.length);
      fetchedPosts.forEach((fp) => {
        if (fp.categories !== null) {
          expect(fp.categories).not.toContain(targetCategoryToExclude);
        }
      });
    });

    it('should translate SET_CONTAINS for a category that does not exist in any post', async () => {
      const alias = CriteriaPostSchema.alias[0];
      const nonExistentCategory = 'non_existent_category_xyz123';

      const criteria = CriteriaFactory.GetCriteria(
        CriteriaPostSchema,
        alias,
      ).where({
        field: 'categories',
        operator: FilterOperator.SET_CONTAINS,
        value: nonExistentCategory,
      });
      const qb = await TypeORMUtils.getQueryBuilderFor<Post>(PostEntity, alias);
      translator.translate(criteria, qb);
      const sql = qb.getSql();
      const params = qb.getParameters();

      expect(sql).toContain(
        `(\`${alias}\`.\`categories\` IS NOT NULL AND FIND_IN_SET(?, \`${alias}\`.\`categories\`) > 0)`,
      );
      expect(params['param_0']).toBe(nonExistentCategory);

      const fetchedPosts = await qb.getMany();
      expect(fetchedPosts.length).toBe(0);
    });
  });
});
