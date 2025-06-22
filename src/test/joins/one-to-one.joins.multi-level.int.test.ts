import { TypeOrmMysqlTranslator } from '../../type-orm.mysql.translator.js';
import {
  type EntitySchema,
  type ObjectLiteral,
  SelectQueryBuilder,
} from 'typeorm';
import {
  initializeDataSourceService,
  TypeORMUtils,
} from '../utils/type-orm.utils.js';
import {
  PostSchema as CriteriaPostSchema,
  UserSchema as CriteriaUserSchema,
  type User,
  PostCommentSchema,
  type EntityBase,
  type Post,
} from '../utils/fake-entities.js';
import { UserEntity } from '../utils/entities/user.entity.js';
import { beforeEach, describe, expect, it, beforeAll } from 'vitest';
import {
  CriteriaFactory,
  FilterOperator,
  OrderDirection,
  type RootCriteria,
} from '@nulledexp/translatable-criteria';

describe('TypeOrmMysqlTranslator - Multi-Level Join Translation', () => {
  let translator: TypeOrmMysqlTranslator<ObjectLiteral>;
  let actualUsersFromDB: User[];

  async function translateAndFetch<E extends EntityBase>(
    criteria: RootCriteria<any>,
    entitySchema: EntitySchema<E>,
    method: 'getMany',
  ): Promise<E[]>;
  async function translateAndFetch<E extends EntityBase>(
    criteria: RootCriteria<any>,
    entitySchema: EntitySchema<E>,
    method: 'getOne' | 'getMany',
  ): Promise<E[] | E | null> {
    const qb = await TypeORMUtils.getQueryBuilderFor<E>(
      entitySchema,
      criteria.alias,
    );
    translator.translate(criteria, qb as SelectQueryBuilder<ObjectLiteral>);
    if (method === 'getOne') {
      return qb.getOne();
    }
    return qb.getMany();
  }

  beforeAll(async () => {
    const dataSource = await initializeDataSourceService(false);
    actualUsersFromDB = await dataSource
      .getRepository(UserEntity)
      .find({ relations: ['posts', 'posts.comments', 'posts.comments.user'] });
  });

  beforeEach(() => {
    translator = new TypeOrmMysqlTranslator();
  });

  it('should translate a multi-level INNER JOIN (User -> Post -> Comment)', async () => {
    const targetUser = actualUsersFromDB.find(
      (u) =>
        u.username === 'user_1' &&
        u.posts.some((p) => p.comments && p.comments.length > 0),
    );
    if (!targetUser) {
      throw new Error(
        'Test data issue: User user_1 with posts and comments not found for multi-level INNER JOIN.',
      );
    }

    const rootCriteria = CriteriaFactory.GetCriteria(CriteriaUserSchema).where({
      field: 'uuid',
      operator: FilterOperator.EQUALS,
      value: targetUser.uuid,
    });

    const commentJoinCriteria = CriteriaFactory.GetInnerJoinCriteria(
      PostCommentSchema,
    ).where({
      field: 'comment_text',
      operator: FilterOperator.CONTAINS,
      value: 'Main comment',
    });

    const postJoinCriteria = CriteriaFactory.GetInnerJoinCriteria(
      CriteriaPostSchema,
    )
      .where({
        field: 'title',
        operator: FilterOperator.LIKE,
        value: '%Post Title%',
      })
      .join('comments', commentJoinCriteria, {
        parent_field: 'uuid',
        join_field: 'post_uuid',
      });

    rootCriteria.join('posts', postJoinCriteria, {
      parent_field: 'uuid',
      join_field: 'user_uuid',
    });

    const fetchedUsers = await translateAndFetch<User>(
      rootCriteria,
      UserEntity,
      'getMany',
    );

    expect(fetchedUsers.length).toBe(1);
    const fetchedUser = fetchedUsers[0]!;
    expect(fetchedUser.uuid).toBe(targetUser.uuid);
    expect(fetchedUser.posts).toBeDefined();
    expect(fetchedUser.posts.length).toBeGreaterThan(0);

    let foundMatchingComment = false;
    fetchedUser.posts.forEach((post) => {
      expect(post.title).toContain('Post Title');
      if (post.comments && post.comments.length > 0) {
        post.comments.forEach((comment) => {
          if (comment.comment_text.includes('Main comment')) {
            foundMatchingComment = true;
          }
        });
      }
    });
    expect(foundMatchingComment).toBeTruthy();
  });

  it('should translate a multi-level LEFT JOIN (User -> Post -> Comment) with specific selects', async () => {
    const targetUser = actualUsersFromDB.find((u) => u.username === 'user_2');
    if (!targetUser) {
      throw new Error(
        'Test data issue: User user_2 not found for multi-level LEFT JOIN.',
      );
    }

    const rootCriteria = CriteriaFactory.GetCriteria(CriteriaUserSchema)
      .setSelect(['uuid', 'username'])
      .where({
        field: 'uuid',
        operator: FilterOperator.EQUALS,
        value: targetUser.uuid,
      });

    const commentJoinCriteria =
      CriteriaFactory.GetLeftJoinCriteria(PostCommentSchema).setSelect([
        'comment_text',
      ]);

    const postJoinCriteria = CriteriaFactory.GetLeftJoinCriteria(
      CriteriaPostSchema,
    )
      .setSelect(['title'])
      .join('comments', commentJoinCriteria, {
        parent_field: 'uuid',
        join_field: 'post_uuid',
      });

    rootCriteria.join('posts', postJoinCriteria, {
      parent_field: 'uuid',
      join_field: 'user_uuid',
    });

    const fetchedUsers = await translateAndFetch<User>(
      rootCriteria,
      UserEntity,
      'getMany',
    );

    expect(fetchedUsers.length).toBe(1);
    const fetchedUser = fetchedUsers[0]!;
    expect(fetchedUser.uuid).toBe(targetUser.uuid);
    expect(fetchedUser.username).toBe(targetUser.username);
    expect(fetchedUser.email).toBeUndefined();

    if (fetchedUser.posts && fetchedUser.posts.length > 0) {
      fetchedUser.posts.forEach((post) => {
        expect(post.title).toBeDefined();
        expect(post.body).toBeUndefined();
        if (post.comments && post.comments.length > 0) {
          post.comments.forEach((comment) => {
            expect(comment.comment_text).toBeDefined();
          });
        }
      });
    }
  });

  it('should translate a multi-level INNER JOIN with orderBy on fields from different joined entities', async () => {
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

    const rootCriteria = CriteriaFactory.GetCriteria(CriteriaUserSchema).where({
      field: 'uuid',
      operator: FilterOperator.EQUALS,
      value: targetUserWithPostsAndComments.uuid,
    });

    const postJoinCriteria = CriteriaFactory.GetInnerJoinCriteria(
      CriteriaPostSchema,
    ).orderBy('title', OrderDirection.ASC);

    const commentJoinCriteria = CriteriaFactory.GetInnerJoinCriteria(
      PostCommentSchema,
    ).orderBy('created_at', OrderDirection.DESC);

    postJoinCriteria.join('comments', commentJoinCriteria, {
      parent_field: 'uuid',
      join_field: 'post_uuid',
    });

    rootCriteria.join('posts', postJoinCriteria, {
      parent_field: 'uuid',
      join_field: 'user_uuid',
    });

    const fetchedUsers = await translateAndFetch<User>(
      rootCriteria,
      UserEntity,
      'getMany',
    );

    expect(fetchedUsers.length).toBe(1);
    const fetchedUser = fetchedUsers[0]!;
    expect(fetchedUser.uuid).toBe(targetUserWithPostsAndComments.uuid);
    expect(fetchedUser.posts).toBeDefined();
    expect(fetchedUser.posts.length).toBeGreaterThan(0);

    const sortedPosts = [...fetchedUser.posts].sort((a: Post, b: Post) =>
      a.title.localeCompare(b.title),
    );
    expect(fetchedUser.posts.map((p) => p.uuid)).toEqual(
      sortedPosts.map((p) => p.uuid),
    );

    fetchedUser.posts.forEach((post) => {
      if (post.comments && post.comments.length > 1) {
        const sortedComments = [...post.comments].sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
        expect(post.comments.map((c) => c.uuid)).toEqual(
          sortedComments.map((c) => c.uuid),
        );
      }
    });
  });
});