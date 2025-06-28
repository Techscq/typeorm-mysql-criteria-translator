import { TypeOrmMysqlTranslator } from '../../../type-orm.mysql.translator.js';
import {
  type EntitySchema,
  type ObjectLiteral,
  SelectQueryBuilder,
} from 'typeorm';
import {
  initializeDataSourceService,
  TypeORMUtils,
} from '../../utils/type-orm.utils.js';
import {
  PostSchema as CriteriaPostSchema,
  UserSchema as CriteriaUserSchema,
  type Post,
  type User,
  PostCommentSchema,
  type EntityBase,
} from '../../utils/fake-entities.js';
import { UserEntity } from '../../utils/entities/user.entity.js';
import { PostEntity } from '../../utils/entities/post.entity.js';
import { beforeEach, describe, expect, it, beforeAll } from 'vitest';
import {
  CriteriaFactory,
  FilterOperator,
  type RootCriteria,
} from '@nulledexp/translatable-criteria';

describe('TypeOrmMysqlTranslator - One-to-Many Join Translation', () => {
  let translator: TypeOrmMysqlTranslator<ObjectLiteral>;
  let actualPostsFromDB: Post[];
  let actualUsersFromDB: User[];

  async function translateAndFetch<E extends EntityBase>(
    criteria: RootCriteria<any>,
    entitySchema: EntitySchema<E>,
  ): Promise<E[]> {
    const qb = await TypeORMUtils.getQueryBuilderFor<E>(
      entitySchema,
      criteria.alias,
    );
    translator.translate(criteria, qb as SelectQueryBuilder<ObjectLiteral>);
    return qb.getMany();
  }

  beforeAll(async () => {
    const dataSource = await initializeDataSourceService(false);
    actualPostsFromDB = await dataSource
      .getRepository(PostEntity)
      .find({ relations: ['comments', 'publisher'] });
    actualUsersFromDB = await dataSource
      .getRepository(UserEntity)
      .find({ relations: ['posts'] });
  });

  beforeEach(() => {
    translator = new TypeOrmMysqlTranslator();
  });

  it('should translate an INNER JOIN (User to Post) with a simple ON condition', async () => {
    const targetUserWithPosts = actualUsersFromDB.find(
      (u) => u.posts && u.posts.length > 0,
    );
    if (!targetUserWithPosts) {
      throw new Error(
        'Test data issue: No user with posts found for INNER JOIN test.',
      );
    }
    const testPost = targetUserWithPosts.posts[0]!;
    const titleForSubstring = testPost.title || 'DefaultTitle';
    const specificPostTitlePart = titleForSubstring.substring(
      0,
      Math.min(5, titleForSubstring.length),
    );

    const rootCriteria = CriteriaFactory.GetCriteria(CriteriaUserSchema).where({
      field: 'uuid',
      operator: FilterOperator.EQUALS,
      value: targetUserWithPosts.uuid,
    });

    const postJoinCriteria = CriteriaFactory.GetInnerJoinCriteria(
      CriteriaPostSchema,
    ).where({
      field: 'title',
      operator: FilterOperator.LIKE,
      value: `%${specificPostTitlePart}%`,
    });

    rootCriteria.join('posts', postJoinCriteria);

    const fetchedUsers = await translateAndFetch<User>(
      rootCriteria,
      UserEntity,
    );

    expect(fetchedUsers.length).toBe(1);
    const fetchedUser = fetchedUsers[0]!;
    expect(fetchedUser.uuid).toBe(targetUserWithPosts.uuid);
    expect(fetchedUser.posts).toBeDefined();
    const matchingPosts = fetchedUser.posts.filter((p) =>
      p.title.includes(specificPostTitlePart),
    );
    expect(matchingPosts.length).toBeGreaterThan(0);
    expect(matchingPosts.some((p) => p.uuid === testPost.uuid)).toBeTruthy();
  });

  it('should translate an INNER JOIN (User to Post) with complex nested AND/OR ON condition', async () => {
    const targetUserWithPosts = actualUsersFromDB.find(
      (u) => u.username === 'user_1',
    );
    if (!targetUserWithPosts) {
      throw new Error(
        'Test data issue: User user_1 not found for complex ON condition test.',
      );
    }

    const rootCriteria = CriteriaFactory.GetCriteria(CriteriaUserSchema).where({
      field: 'uuid',
      operator: FilterOperator.EQUALS,
      value: targetUserWithPosts.uuid,
    });

    const postJoinCriteria = CriteriaFactory.GetInnerJoinCriteria(
      CriteriaPostSchema,
    )
      .where({
        field: 'title',
        operator: FilterOperator.LIKE,
        value: '%Post Title%',
      })
      .andWhere({
        field: 'body',
        operator: FilterOperator.CONTAINS,
        value: 'Authored by user_1',
      })
      .orWhere({
        field: 'categories',
        operator: FilterOperator.SET_CONTAINS,
        value: 'tech',
      });

    rootCriteria.join('posts', postJoinCriteria);
    const fetchedUsers = await translateAndFetch<User>(
      rootCriteria,
      UserEntity,
    );

    expect(fetchedUsers.length).toBe(1);
    const fetchedUser = fetchedUsers[0]!;
    expect(fetchedUser.uuid).toBe(targetUserWithPosts.uuid);
    expect(fetchedUser.posts).toBeDefined();
    expect(fetchedUser.posts.length).toBeGreaterThan(0);

    fetchedUser.posts.forEach((post) => {
      const titleMatches = post.title.includes('Post Title');
      const bodyMatchesUser1 = post.body.includes('Authored by user_1');
      const categoryMatchesTech = post.categories?.includes('tech') || false;
      expect(
        (titleMatches && bodyMatchesUser1) || categoryMatchesTech,
      ).toBeTruthy();
    });
  });

  it('should translate a LEFT JOIN (Post to Comment) and select specific fields from joined entity', async () => {
    const targetPost = actualPostsFromDB.find(
      (p) => p.title === 'Post Title 1',
    );
    if (!targetPost) {
      throw new Error(
        'Test data issue: Post Title 1 not found for LEFT JOIN test.',
      );
    }

    const rootCriteria = CriteriaFactory.GetCriteria(CriteriaPostSchema).where({
      field: 'uuid',
      operator: FilterOperator.EQUALS,
      value: targetPost.uuid,
    });

    const commentJoinCriteria = CriteriaFactory.GetLeftJoinCriteria(
      PostCommentSchema,
    ).setSelect(['uuid', 'comment_text']);

    rootCriteria.join('comments', commentJoinCriteria);

    const fetchedPosts = await translateAndFetch<Post>(
      rootCriteria,
      PostEntity,
    );

    expect(fetchedPosts.length).toBe(1);
    const fetchedPost = fetchedPosts[0]!;
    expect(fetchedPost.uuid).toBe(targetPost.uuid);

    if (targetPost.comments && targetPost.comments.length > 0) {
      expect(fetchedPost.comments).toBeDefined();
      expect(fetchedPost.comments.length).toBe(targetPost.comments.length);
      fetchedPost.comments.forEach((comment) => {
        expect(comment.uuid).toBeDefined();
        expect(comment.comment_text).toBeDefined();
        expect(comment.user).toBeUndefined();
      });
    } else {
      expect(fetchedPost.comments).toEqual([]);
    }
  });

  it('should translate a LEFT JOIN (Post to Comment) with complex nested AND/OR ON condition', async () => {
    const targetPost = actualPostsFromDB.find(
      (p) => p.title === 'Post Title 2',
    );
    if (!targetPost) {
      throw new Error(
        'Test data issue: Post Title 2 not found for complex LEFT JOIN test.',
      );
    }

    const rootCriteria = CriteriaFactory.GetCriteria(CriteriaPostSchema).where({
      field: 'uuid',
      operator: FilterOperator.EQUALS,
      value: targetPost.uuid,
    });

    const commentJoinCriteria = CriteriaFactory.GetLeftJoinCriteria(
      PostCommentSchema,
    )
      .where({
        field: 'comment_text',
        operator: FilterOperator.NOT_LIKE,
        value: '%spam%',
      })
      .orWhere({
        field: 'user_uuid',
        operator: FilterOperator.EQUALS,
        value: 'specific-user-uuid-for-test',
      });

    rootCriteria.join('comments', commentJoinCriteria);

    const fetchedPosts = await translateAndFetch<Post>(
      rootCriteria,
      PostEntity,
    );

    expect(fetchedPosts.length).toBe(1);
    const fetchedPost = fetchedPosts[0]!;
    expect(fetchedPost.uuid).toBe(targetPost.uuid);

    if (fetchedPost.comments && fetchedPost.comments.length > 0) {
      fetchedPost.comments.forEach((comment) => {
        const textNotLikeSpam = !comment.comment_text.includes('spam');
        const userMatchesSpecific =
          comment.user?.uuid === 'specific-user-uuid-for-test';
        expect(textNotLikeSpam || userMatchesSpecific).toBeTruthy();
      });
    }
  });

  it('should translate an INNER JOIN with various operators in ON condition', async () => {
    const targetUser = actualUsersFromDB.find((u) => u.username === 'user_1');
    if (!targetUser)
      throw new Error('Test data issue: Test user user_1 not found.');

    const postForStartsWith = actualPostsFromDB.find(
      (p) =>
        p.publisher &&
        p.publisher.uuid === targetUser.uuid &&
        p.title.length > 3,
    );
    const startsWithValue = postForStartsWith
      ? postForStartsWith.title.substring(0, 3)
      : 'Def';

    const rootCriteria = CriteriaFactory.GetCriteria(CriteriaUserSchema).where({
      field: 'uuid',
      operator: FilterOperator.EQUALS,
      value: targetUser.uuid,
    });

    const postJoinCriteria = CriteriaFactory.GetInnerJoinCriteria(
      CriteriaPostSchema,
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

    rootCriteria.join('posts', postJoinCriteria);

    const fetchedUsers = await translateAndFetch<User>(
      rootCriteria,
      UserEntity,
    );

    expect(fetchedUsers.length).toBeGreaterThanOrEqual(0);
    if (fetchedUsers.length > 0) {
      const user = fetchedUsers[0]!;
      expect(user.uuid).toBe(targetUser.uuid);
      expect(user.posts.length).toBeGreaterThan(0);
      user.posts.forEach((post) => {
        expect(new Date(post.created_at).getTime()).toBeGreaterThan(
          new Date('2020-01-01T00:00:00.000Z').getTime(),
        );
        expect([
          'Post Title 1',
          'Post Title 2',
          'Post Title 3',
          'Post Title 7',
        ]).toContain(post.title);
        expect(post.body).not.toBeNull();
        expect(new Date(post.created_at).getTime()).toBeLessThanOrEqual(
          new Date().getTime(),
        );
        expect(post.title.startsWith(startsWithValue)).toBe(true);
      });
    }
  });
});
