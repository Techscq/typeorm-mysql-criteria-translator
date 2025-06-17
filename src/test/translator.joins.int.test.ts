import { TypeOrmMysqlTranslator } from '../type-orm.mysql.translator.js';
import { type ObjectLiteral } from 'typeorm';
import {
  initializeDataSourceService,
  TypeORMUtils,
} from './utils/type-orm.utils.js';
import {
  PostSchema as CriteriaPostSchema,
  UserSchema as CriteriaUserSchema,
  type Post,
  type User,
  PostCommentSchema,
} from './utils/fake-entities.js';
import { UserEntity } from './utils/entities/user.entity.js';
import { PostEntity } from './utils/entities/post.entity.js';
import { beforeEach, describe, expect, it, beforeAll } from 'vitest';
import {
  CriteriaFactory,
  FilterOperator,
  OrderDirection,
} from '@nulledexp/translatable-criteria';

describe('TypeOrmMysqlTranslator - Join Translation', () => {
  let translator: TypeOrmMysqlTranslator<ObjectLiteral>;
  let actualPostsFromDB: Post[];
  let actualUsersFromDB: User[];

  beforeAll(async () => {
    const dataSource = await initializeDataSourceService(false);
    // Eager load relations needed for join tests
    actualPostsFromDB = await dataSource
      .getRepository(PostEntity)
      .find({ relations: ['publisher', 'comments'] });
    actualUsersFromDB = await dataSource
      .getRepository(UserEntity)
      .find({ relations: ['posts', 'posts.comments'] });
  });

  beforeEach(() => {
    translator = new TypeOrmMysqlTranslator();
  });

  it('should translate an INNER JOIN with a simple ON condition', async () => {
    const userAlias = 'users';
    const postRelationAlias = 'posts';

    if (!actualPostsFromDB || actualPostsFromDB.length === 0) {
      throw new Error(
        'Test data issue: actualPostsFromDB is empty for ON condition test.',
      );
    }
    const testPost = actualPostsFromDB[0]!;
    const titleForSubstring = testPost.title || 'DefaultTitle';
    const specificPostTitlePart = titleForSubstring.substring(
      0,
      Math.min(5, titleForSubstring.length),
    );

    const rootCriteria = CriteriaFactory.GetCriteria(
      CriteriaUserSchema,
      userAlias,
    );
    const postJoinCriteria = CriteriaFactory.GetInnerJoinCriteria(
      CriteriaPostSchema,
      postRelationAlias,
    ).where({
      field: 'title',
      operator: FilterOperator.LIKE,
      value: `%${specificPostTitlePart}%`,
    });

    rootCriteria.join(postJoinCriteria, {
      parent_field: 'uuid',
      join_field: 'user_uuid',
    });

    const qb = await TypeORMUtils.getQueryBuilderFor<User>(
      UserEntity,
      userAlias,
    );
    translator.translate(rootCriteria, qb);
    const sql = qb.getSql();
    const params = qb.getParameters();

    expect(sql).toContain(`INNER JOIN \`post\` \`${postRelationAlias}\``);
    expect(sql).toContain(
      `ON \`${postRelationAlias}\`.\`user_uuid\`=\`${userAlias}\`.\`uuid\` AND (\`${postRelationAlias}\`.\`title\` LIKE ?)`,
    );
    expect(params['param_0']).toBe(`%${specificPostTitlePart}%`);
  });

  it('should translate an INNER JOIN with complex nested AND/OR ON condition', async () => {
    const userAlias = 'users';
    const postRelationAlias = 'posts';

    const rootCriteria = CriteriaFactory.GetCriteria(
      CriteriaUserSchema,
      userAlias,
    );
    const postJoinCriteria = CriteriaFactory.GetInnerJoinCriteria(
      CriteriaPostSchema,
      postRelationAlias,
    )
      .where({
        field: 'title',
        operator: FilterOperator.LIKE,
        value: '%TypeORM%',
      })
      .andWhere({
        field: 'body',
        operator: FilterOperator.CONTAINS,
        value: 'important',
      })
      .orWhere({
        field: 'body',
        operator: FilterOperator.CONTAINS,
        value: 'relevant',
      });

    rootCriteria.join(postJoinCriteria, {
      parent_field: 'uuid',
      join_field: 'user_uuid',
    });
    const qb = await TypeORMUtils.getQueryBuilderFor<User>(
      UserEntity,
      userAlias,
    );
    translator.translate(rootCriteria, qb);
    const sql = qb.getSql();

    expect(sql).toContain(
      `ON \`${postRelationAlias}\`.\`user_uuid\`=\`${userAlias}\`.\`uuid\` AND ((\`${postRelationAlias}\`.\`title\` LIKE ? AND \`${postRelationAlias}\`.\`body\` LIKE ?) OR (\`${postRelationAlias}\`.\`body\` LIKE ?))`,
    );
    expect(qb.getParameters()).toEqual({
      param_0: '%TypeORM%',
      param_1: '%important%',
      param_2: '%relevant%',
    });
  });

  it('should translate a simple INNER JOIN (User to Post) and select all from joined entity', async () => {
    const userAlias = 'users';
    const postRelationAlias = 'posts';

    const rootCriteria = CriteriaFactory.GetCriteria(
      CriteriaUserSchema,
      userAlias,
    );
    const postJoinCriteria = CriteriaFactory.GetInnerJoinCriteria(
      CriteriaPostSchema,
      postRelationAlias,
    );

    rootCriteria.join(postJoinCriteria, {
      parent_field: 'uuid',
      join_field: 'user_uuid',
    });

    const qb = await TypeORMUtils.getQueryBuilderFor<User>(
      UserEntity,
      userAlias,
    );
    translator.translate(rootCriteria, qb);
    const sql = qb.getSql();

    expect(sql).toContain(`INNER JOIN \`post\` \`${postRelationAlias}\``);
    expect(sql).toMatch(
      new RegExp(
        `SELECT .*?\`${userAlias}\`\\.\`\\w+\` AS \`${userAlias}_\\w+\``,
      ),
    );
    expect(sql).toMatch(
      new RegExp(
        `\`${postRelationAlias}\`\\.\`\\w+\` AS \`${postRelationAlias}_\\w+\``,
      ),
    );
    expect(sql).toContain(`\`${userAlias}\`.\`uuid\` AS \`${userAlias}_uuid\``);
  });

  it('should translate a LEFT JOIN (Post to Comment) and select specific fields from joined entity', async () => {
    const postAlias = 'posts';
    const commentRelationAlias = 'comments';

    const rootCriteria = CriteriaFactory.GetCriteria(
      CriteriaPostSchema,
      postAlias,
    );
    const commentJoinCriteria = CriteriaFactory.GetLeftJoinCriteria(
      PostCommentSchema,
      commentRelationAlias,
    ).setSelect(['uuid', 'comment_text']); // Select only specific fields

    rootCriteria.join(commentJoinCriteria, {
      parent_field: 'uuid',
      join_field: 'post_uuid',
    });

    const qb = await TypeORMUtils.getQueryBuilderFor<Post>(
      PostEntity,
      postAlias,
    );
    translator.translate(rootCriteria, qb);
    const sql = qb.getSql();

    expect(sql).toContain(
      `LEFT JOIN \`post_comment\` \`${commentRelationAlias}\``,
    );
    const selectClause = sql.substring(
      sql.indexOf('SELECT ') + 7,
      sql.indexOf(' FROM'),
    );

    expect(selectClause).toContain(
      `\`${commentRelationAlias}\`.\`uuid\` AS \`${commentRelationAlias}_uuid\``,
    );
    expect(selectClause).toContain(
      `\`${commentRelationAlias}\`.\`comment_text\` AS \`${commentRelationAlias}_comment_text\``,
    );
    // Ensure other fields from the joined entity are not selected
    expect(selectClause).not.toContain(
      `\`${commentRelationAlias}\`.\`created_at\``,
    );
    // Ensure root entity fields are still selected (or as per its own setSelect)
    expect(selectClause).toContain(`\`${postAlias}\`.\`uuid\``);
  });

  it('should translate an INNER JOIN (Post to User/Publisher) with a simple ON condition and correct field exclusion', async () => {
    const postAlias = 'posts';
    const publisherRelationAlias = 'publisher';

    if (!actualPostsFromDB || actualPostsFromDB.length === 0) {
      throw new Error(
        'Test data issue: actualPostsFromDB is empty for ON condition test.',
      );
    }
    const testPost = actualPostsFromDB[0]!;
    const usernamePart = testPost.publisher.username.substring(0, 3);

    const rootCriteria = CriteriaFactory.GetCriteria(
      CriteriaPostSchema,
      postAlias,
    );
    const publisherJoinCriteria = CriteriaFactory.GetInnerJoinCriteria(
      CriteriaUserSchema,
      publisherRelationAlias,
    ).where({
      field: 'username',
      operator: FilterOperator.LIKE,
      value: `%${usernamePart}%`,
    });

    rootCriteria.join(publisherJoinCriteria, {
      parent_field: 'user_uuid', // This is the FK in Post table
      join_field: 'uuid', // This is the PK in User table
    });

    const qb = await TypeORMUtils.getQueryBuilderFor<Post>(
      PostEntity,
      postAlias,
    );
    translator.translate(rootCriteria, qb);
    const sql = qb.getSql();
    const params = qb.getParameters();

    expect(sql).toContain(`INNER JOIN \`user\` \`${publisherRelationAlias}\``);
    expect(sql).toContain(
      `ON \`${publisherRelationAlias}\`.\`uuid\`=\`${postAlias}\`.\`user_uuid\` AND (\`${publisherRelationAlias}\`.\`username\` LIKE ?)`,
    );
    expect(params['param_0']).toBe(`%${usernamePart}%`);

    // Check that the foreign key from the parent ('posts'.'user_uuid') is NOT selected
    // because it's a many-to-one, and the joined entity 'publisher' provides these details.
    const selectClause = sql.substring(
      sql.indexOf('SELECT ') + 7,
      sql.indexOf(' FROM'),
    );
    expect(selectClause).not.toContain(`\`${postAlias}\`.\`user_uuid\``);
  });

  it('should translate an INNER JOIN (Post to User/Publisher) with complex ON condition and field exclusion', async () => {
    const postAlias = 'posts';
    const publisherRelationAlias = 'publisher';

    const rootCriteria = CriteriaFactory.GetCriteria(
      CriteriaPostSchema,
      postAlias,
    );
    const publisherJoinCriteria = CriteriaFactory.GetInnerJoinCriteria(
      CriteriaUserSchema,
      publisherRelationAlias,
    )
      .where({
        field: 'username',
        operator: FilterOperator.LIKE,
        value: '%user%',
      })
      .andWhere({
        field: 'email',
        operator: FilterOperator.CONTAINS,
        value: 'example.com',
      })
      .orWhere({
        field: 'username',
        operator: FilterOperator.EQUALS,
        value: 'user_2',
      });

    rootCriteria.join(publisherJoinCriteria, {
      parent_field: 'user_uuid',
      join_field: 'uuid',
    });
    const qb = await TypeORMUtils.getQueryBuilderFor<Post>(
      PostEntity,
      postAlias,
    );
    translator.translate(rootCriteria, qb);
    const sql = qb.getSql();

    expect(sql).toContain(
      `ON \`${publisherRelationAlias}\`.\`uuid\`=\`${postAlias}\`.\`user_uuid\` AND ((\`${publisherRelationAlias}\`.\`username\` LIKE ? AND \`${publisherRelationAlias}\`.\`email\` LIKE ?) OR (\`${publisherRelationAlias}\`.\`username\` = ?))`,
    );
    expect(qb.getParameters()).toEqual({
      param_0: '%user%',
      param_1: '%example.com%',
      param_2: 'user_2',
    });
    const selectClause = sql.substring(
      sql.indexOf('SELECT ') + 7,
      sql.indexOf(' FROM'),
    );
    expect(selectClause).not.toContain(`\`${postAlias}\`.\`user_uuid\``);
  });

  it('should translate a LEFT JOIN (Post to Comment) with complex nested AND/OR ON condition', async () => {
    const postAlias = 'posts';
    const commentRelationAlias = 'comments';

    const rootCriteria = CriteriaFactory.GetCriteria(
      CriteriaPostSchema,
      postAlias,
    );
    const commentJoinCriteria = CriteriaFactory.GetLeftJoinCriteria(
      PostCommentSchema,
      commentRelationAlias,
    )
      .where({
        field: 'comment_text',
        operator: FilterOperator.NOT_LIKE,
        value: '%spam%',
      })
      .orWhere({
        field: 'user_uuid',
        operator: FilterOperator.EQUALS,
        value: 'specific-user-uuid',
      })
      .andWhere({
        field: 'created_at',
        operator: FilterOperator.GREATER_THAN,
        value: '2023-01-01',
      });

    rootCriteria.join(commentJoinCriteria, {
      parent_field: 'uuid',
      join_field: 'post_uuid',
    });
    const qb = await TypeORMUtils.getQueryBuilderFor<Post>(
      PostEntity,
      postAlias,
    );
    translator.translate(rootCriteria, qb);
    const sql = qb.getSql();

    expect(sql).toContain(
      `ON \`${commentRelationAlias}\`.\`post_uuid\`=\`${postAlias}\`.\`uuid\` AND ((\`${commentRelationAlias}\`.\`comment_text\` NOT LIKE ?) OR (\`${commentRelationAlias}\`.\`user_uuid\` = ? AND \`${commentRelationAlias}\`.\`created_at\` > ?))`,
    );
    expect(qb.getParameters()).toEqual({
      param_0: '%spam%',
      param_1: 'specific-user-uuid',
      param_2: '2023-01-01',
    });
  });

  it('should translate an INNER JOIN with various operators in ON condition', async () => {
    const userAlias = 'users';
    const postRelationAlias = 'posts';

    const targetUser = actualUsersFromDB.find((u) => u.username === 'user_1');
    if (!targetUser)
      throw new Error('Test data issue: Test user user_1 not found.');

    const postForStartsWith = actualPostsFromDB.find(
      (p) => p.publisher.uuid === targetUser.uuid && p.title.length > 3,
    );
    const startsWithValue = postForStartsWith
      ? postForStartsWith.title.substring(0, 3)
      : 'Def'; // Default if no suitable post found

    const rootCriteria = CriteriaFactory.GetCriteria(
      CriteriaUserSchema,
      userAlias,
    ).where({
      field: 'uuid',
      operator: FilterOperator.EQUALS,
      value: targetUser.uuid,
    });

    const postJoinCriteria = CriteriaFactory.GetInnerJoinCriteria(
      CriteriaPostSchema,
      postRelationAlias,
    )
      .where({
        field: 'created_at',
        operator: FilterOperator.GREATER_THAN,
        value: '2020-01-01T00:00:00.000Z',
      })
      .andWhere({
        field: 'title',
        operator: FilterOperator.IN,
        value: ['Post Title 1', 'Post Title 2', 'Post Title 3', 'Post Title 7'],
      })
      .andWhere({
        field: 'body',
        operator: FilterOperator.IS_NOT_NULL,
        value: null,
      })
      .andWhere({
        field: 'created_at',
        operator: FilterOperator.LESS_THAN_OR_EQUALS,
        value: new Date().toISOString(),
      })
      .andWhere({
        field: 'title',
        operator: FilterOperator.STARTS_WITH,
        value: startsWithValue,
      })
      .andWhere({
        field: 'user_uuid',
        operator: FilterOperator.EQUALS,
        value: targetUser.uuid,
      });

    rootCriteria.join(postJoinCriteria, {
      parent_field: 'uuid',
      join_field: 'user_uuid',
    });

    const qb = await TypeORMUtils.getQueryBuilderFor<User>(
      UserEntity,
      userAlias,
    );
    translator.translate(rootCriteria, qb);
    const sql = qb.getSql();
    const params = qb.getParameters();

    expect(sql).toContain(`INNER JOIN \`post\` \`${postRelationAlias}\``);
    expect(sql).toContain(
      `ON \`${postRelationAlias}\`.\`user_uuid\`=\`${userAlias}\`.\`uuid\` AND (` +
        `\`${postRelationAlias}\`.\`created_at\` > ? AND ` +
        `\`${postRelationAlias}\`.\`title\` IN (?, ?, ?, ?) AND ` +
        `\`${postRelationAlias}\`.\`body\` IS NOT NULL AND ` +
        `\`${postRelationAlias}\`.\`created_at\` <= ? AND ` +
        `\`${postRelationAlias}\`.\`title\` LIKE ? AND ` +
        `\`${postRelationAlias}\`.\`user_uuid\` = ?` +
        `)`,
    );

    expect(params['param_1']).toBe('2020-01-01T00:00:00.000Z');
    expect(params['param_2']).toEqual([
      'Post Title 1',
      'Post Title 2',
      'Post Title 3',
      'Post Title 7',
    ]);
    expect(params['param_3']).toBeDefined(); // Value for LESS_THAN_OR_EQUALS
    expect(params['param_4']).toBe(`${startsWithValue}%`);
    expect(params['param_5']).toBe(targetUser.uuid);
  });

  it('should translate a multi-level INNER JOIN (User -> Post -> Comment)', async () => {
    const userAlias = 'users';
    const postRelationAlias = 'posts';
    const commentRelationAlias = 'comments';

    const targetUser = actualUsersFromDB.find(
      (u) =>
        u.username === 'user_1' &&
        u.posts.some((p) => p.comments && p.comments.length > 0),
    );
    if (!targetUser)
      throw new Error(
        'Test data issue: User user_1 with posts and comments not found.',
      );

    const rootCriteria = CriteriaFactory.GetCriteria(
      CriteriaUserSchema,
      userAlias,
    ).where({
      field: 'uuid',
      operator: FilterOperator.EQUALS,
      value: targetUser.uuid,
    });

    const commentJoinCriteria = CriteriaFactory.GetInnerJoinCriteria(
      PostCommentSchema,
      commentRelationAlias,
    ).where({
      field: 'comment_text',
      operator: FilterOperator.CONTAINS,
      value: 'Main comment',
    });

    const postJoinCriteria = CriteriaFactory.GetInnerJoinCriteria(
      CriteriaPostSchema,
      postRelationAlias,
    )
      .where({
        field: 'title',
        operator: FilterOperator.LIKE,
        value: '%Post Title%',
      })
      .join(commentJoinCriteria, {
        parent_field: 'uuid',
        join_field: 'post_uuid',
      });

    rootCriteria.join(postJoinCriteria, {
      parent_field: 'uuid',
      join_field: 'user_uuid',
    });

    const qb = await TypeORMUtils.getQueryBuilderFor<User>(
      UserEntity,
      userAlias,
    );
    translator.translate(rootCriteria, qb);
    const sql = qb.getSql();

    expect(sql).toContain(`INNER JOIN \`post\` \`${postRelationAlias}\``);
    expect(sql).toContain(
      `ON \`${postRelationAlias}\`.\`user_uuid\`=\`${userAlias}\`.\`uuid\` AND (\`${postRelationAlias}\`.\`title\` LIKE ?)`,
    );
    expect(sql).toContain(
      `INNER JOIN \`post_comment\` \`${commentRelationAlias}\``,
    );
    expect(sql).toContain(
      `ON \`${commentRelationAlias}\`.\`post_uuid\`=\`${postRelationAlias}\`.\`uuid\` AND (\`${commentRelationAlias}\`.\`comment_text\` LIKE ?)`,
    );
    expect(qb.getParameters()).toEqual(
      expect.objectContaining({
        param_1: '%Post Title%', // Corresponds to postJoinCriteria's filter
        param_2: '%Main comment%', // Corresponds to commentJoinCriteria's filter
      }),
    );
  });

  it('should translate a multi-level LEFT JOIN (User -> Post -> Comment) with specific selects', async () => {
    const userAlias = 'users';
    const postRelationAlias = 'posts';
    const commentRelationAlias = 'comments';

    const targetUser = actualUsersFromDB.find((u) => u.username === 'user_2');
    if (!targetUser) throw new Error('Test data issue: User user_2 not found.');

    const rootCriteria = CriteriaFactory.GetCriteria(
      CriteriaUserSchema,
      userAlias,
    )
      .setSelect(['uuid', 'username'])
      .where({
        field: 'uuid',
        operator: FilterOperator.EQUALS,
        value: targetUser.uuid,
      });

    const commentJoinCriteria = CriteriaFactory.GetLeftJoinCriteria(
      PostCommentSchema,
      commentRelationAlias,
    ).setSelect(['comment_text']);

    const postJoinCriteria = CriteriaFactory.GetLeftJoinCriteria(
      CriteriaPostSchema,
      postRelationAlias,
    )
      .setSelect(['title'])
      .join(commentJoinCriteria, {
        parent_field: 'uuid',
        join_field: 'post_uuid',
      });

    rootCriteria.join(postJoinCriteria, {
      parent_field: 'uuid',
      join_field: 'user_uuid',
    });

    const qb = await TypeORMUtils.getQueryBuilderFor<User>(
      UserEntity,
      userAlias,
    );
    translator.translate(rootCriteria, qb);
    const sql = qb.getSql();
    const selectClause = sql.substring(
      sql.indexOf('SELECT ') + 7,
      sql.indexOf(' FROM'),
    );

    expect(sql).toContain(`LEFT JOIN \`post\` \`${postRelationAlias}\``);
    expect(sql).toContain(
      `LEFT JOIN \`post_comment\` \`${commentRelationAlias}\` ON \`${commentRelationAlias}\`.\`post_uuid\`=\`${postRelationAlias}\`.\`uuid\``,
    );

    expect(selectClause).toContain(
      `\`${userAlias}\`.\`uuid\` AS \`${userAlias}_uuid\``,
    );
    expect(selectClause).toContain(
      `\`${userAlias}\`.\`username\` AS \`${userAlias}_username\``,
    );
    expect(selectClause).not.toContain(`\`${userAlias}\`.\`email\``);

    expect(selectClause).toContain(
      `\`${postRelationAlias}\`.\`title\` AS \`${postRelationAlias}_title\``,
    );
    expect(selectClause).not.toContain(`\`${postRelationAlias}\`.\`body\``);

    expect(selectClause).toContain(
      `\`${commentRelationAlias}\`.\`comment_text\` AS \`${commentRelationAlias}_comment_text\``,
    );
    expect(selectClause).not.toContain(
      `\`${commentRelationAlias}\`.\`uuid\` AS \`${commentRelationAlias}_uuid\``,
    );
  });

  it('should translate a multi-level INNER JOIN with orderBy on fields from different joined entities', async () => {
    const userAlias = 'users';
    const postRelationAlias = 'posts';
    const commentRelationAlias = 'comments';

    const targetUserWithPostsAndComments = actualUsersFromDB.find(
      (u) =>
        u.posts.length > 0 &&
        u.posts.some((p) => p.comments && p.comments.length > 0),
    );

    if (!targetUserWithPostsAndComments) {
      throw new Error(
        'Test data issue: User with posts and comments not found for multi-level join orderBy test.',
      );
    }

    const rootCriteria = CriteriaFactory.GetCriteria(
      CriteriaUserSchema,
      userAlias,
    ).where({
      field: 'uuid',
      operator: FilterOperator.EQUALS,
      value: targetUserWithPostsAndComments.uuid,
    });

    // OrderBy for posts.title is defined first
    const postJoinCriteria = CriteriaFactory.GetInnerJoinCriteria(
      CriteriaPostSchema,
      postRelationAlias,
    ).orderBy('title', OrderDirection.ASC);

    // OrderBy for comments.created_at is defined second
    const commentJoinCriteria = CriteriaFactory.GetInnerJoinCriteria(
      PostCommentSchema,
      commentRelationAlias,
    ).orderBy('created_at', OrderDirection.DESC);

    postJoinCriteria.join(commentJoinCriteria, {
      parent_field: 'uuid',
      join_field: 'post_uuid',
    });

    rootCriteria.join(postJoinCriteria, {
      parent_field: 'uuid',
      join_field: 'user_uuid',
    });

    const qb = await TypeORMUtils.getQueryBuilderFor<User>(
      UserEntity,
      userAlias,
    );
    translator.translate(rootCriteria, qb);
    const sql = qb.getSql();
    const orderByClause = sql.substring(sql.toUpperCase().indexOf('ORDER BY'));

    // TypeORM aliases selected fields from joins with `joinAlias_fieldName`
    const expectedPostOrder = `\`${postRelationAlias}_title\` ASC`;
    const expectedCommentOrder = `\`${commentRelationAlias}_created_at\` DESC`;

    expect(orderByClause).toContain(expectedPostOrder);
    expect(orderByClause).toContain(expectedCommentOrder);

    const indexOfPostOrder = orderByClause.indexOf(expectedPostOrder);
    const indexOfCommentOrder = orderByClause.indexOf(expectedCommentOrder);

    expect(indexOfPostOrder).toBeGreaterThan(-1);
    expect(indexOfCommentOrder).toBeGreaterThan(-1);
    // Post.title ASC should appear before Comment.created_at DESC due to sequenceId
    expect(indexOfPostOrder).toBeLessThan(indexOfCommentOrder);

    const fetchedUsers = await qb.getMany();
    expect(fetchedUsers.length).toBeGreaterThanOrEqual(0);
  });
});
