import { TypeOrmMysqlTranslator } from '../type-orm.mysql.translator.js';
import { EntityNotFoundError, type ObjectLiteral } from 'typeorm';
import {
  CriteriaFactory,
  FilterOperator,
  OrderDirection,
} from '@nulledexp/translatable-criteria';
import {
  initializeDataSourceService,
  TypeORMUtils,
} from './utils/type-orm.utils.js';
import {
  PostSchema as CriteriaPostSchema,
  UserSchema as CriteriaUserSchema,
  PostCommentSchema as CriteriaCommentSchema,
  type User,
  type Post,
  type Comment,
} from './utils/fake-entities.js';
import { UserEntity } from './utils/entities/user.entity.js';
import { PostEntity } from './utils/entities/post.entity.js';
import { beforeEach, describe, expect, it, beforeAll } from 'vitest';

describe('TypeOrmMysqlTranslator - Data Hydration (getMany/getOne)', () => {
  let translator: TypeOrmMysqlTranslator<ObjectLiteral>;
  let actualUsersFromDB: User[];
  let actualPostsFromDB: Post[];

  beforeAll(async () => {
    const dataSource = await initializeDataSourceService(false);
    // Eager load necessary relations for the tests in this suite
    actualUsersFromDB = await dataSource
      .getRepository(UserEntity)
      .find({ relations: ['posts', 'permissions', 'addresses'] });
    actualPostsFromDB = await dataSource
      .getRepository(PostEntity)
      .find({ relations: ['publisher', 'comments', 'comments.user'] });
  });

  beforeEach(() => {
    translator = new TypeOrmMysqlTranslator();
  });

  it('should fetch all users matching fakeUsers data using getMany()', async () => {
    const alias = CriteriaUserSchema.alias[0];
    const criteria = CriteriaFactory.GetCriteria(CriteriaUserSchema, alias);

    const qb = await TypeORMUtils.getQueryBuilderFor<User>(UserEntity, alias);
    translator.translate(criteria, qb);
    const fetchedUsers = await qb.getMany();

    expect(fetchedUsers.length).toBe(actualUsersFromDB.length);
    actualUsersFromDB.forEach((expectedUser) => {
      const found = fetchedUsers.find((u) => u.uuid === expectedUser.uuid);
      expect(found, `User ${expectedUser.uuid} not found`).toBeDefined();
      if (found) {
        expect(found.email).toBe(expectedUser.email);
        // Add more checks for other fields if necessary
      }
    });
  });

  it('should fetch users filtered by email using getMany()', async () => {
    const alias = CriteriaUserSchema.alias[0];
    const targetEmail = 'user1@example.com';
    const targetUserFromDB = actualUsersFromDB.find(
      (u) => u.email === targetEmail,
    );

    if (!targetUserFromDB) {
      throw new Error(
        `Test data issue: User with email "${targetEmail}" not found in DB.`,
      );
    }

    const criteria = CriteriaFactory.GetCriteria(
      CriteriaUserSchema,
      alias,
    ).where({
      field: 'email',
      operator: FilterOperator.EQUALS,
      value: targetUserFromDB.email,
    });

    const qb = await TypeORMUtils.getQueryBuilderFor<User>(UserEntity, alias);
    translator.translate(criteria, qb);
    const fetchedUsers = await qb.getMany();

    expect(fetchedUsers).toHaveLength(1);
    expect(fetchedUsers[0]!.uuid).toBe(targetUserFromDB.uuid);
    expect(fetchedUsers[0]!.email).toBe(targetUserFromDB.email);
  });

  it('should fetch posts with their publisher (user) using INNER JOIN and getMany()', async () => {
    const postCriteriaRootAlias = CriteriaPostSchema.alias[0];
    const publisherRelationJoinAlias = 'publisher'; // Matches alias in PostSchema for publisher join

    const targetPublisherUsername = 'user_1';
    const postWithTargetPublisherFromDB = actualPostsFromDB.find(
      (p) => p.publisher?.username === targetPublisherUsername,
    );

    if (
      !postWithTargetPublisherFromDB ||
      !postWithTargetPublisherFromDB.publisher
    ) {
      throw new Error(
        `Test data issue: Post with publisher username "${targetPublisherUsername}" not found in DB.`,
      );
    }

    const criteria = CriteriaFactory.GetCriteria(
      CriteriaPostSchema,
      postCriteriaRootAlias,
    )
      .join(
        CriteriaFactory.GetInnerJoinCriteria(
          CriteriaUserSchema,
          publisherRelationJoinAlias,
        ),
        {
          parent_field: 'user_uuid', // Field in Post table
          join_field: 'uuid', // Field in User table
        },
      )
      .where({
        field: 'uuid', // Filter on the root Post entity
        operator: FilterOperator.EQUALS,
        value: postWithTargetPublisherFromDB.uuid,
      });

    const qb = await TypeORMUtils.getQueryBuilderFor<Post>(
      PostEntity,
      postCriteriaRootAlias,
    );
    translator.translate(criteria, qb);
    const fetchedPosts = await qb.getMany();

    expect(fetchedPosts).toHaveLength(1);
    const fetchedPost = fetchedPosts[0]!;
    expect(fetchedPost.uuid).toBe(postWithTargetPublisherFromDB.uuid);
    expect(fetchedPost.publisher).toBeDefined();
    if (fetchedPost.publisher) {
      expect(fetchedPost.publisher.uuid).toBe(
        postWithTargetPublisherFromDB.publisher.uuid,
      );
      expect(fetchedPost.publisher.username).toBe(
        postWithTargetPublisherFromDB.publisher.username,
      );
    }
  });

  it('should fetch root entities with complex nested AND/OR filters (hydration check)', async () => {
    const userAlias = CriteriaUserSchema.alias[0];
    const user1 = actualUsersFromDB.find((u) => u.username === 'user_1');
    const user2 = actualUsersFromDB.find((u) => u.username === 'user_2');

    if (!user1 || !user2) {
      throw new Error(
        'Test data issue: Users user_1 or user_2 not found in DB.',
      );
    }

    const criteria = CriteriaFactory.GetCriteria(CriteriaUserSchema, userAlias)
      .where({
        field: 'email',
        operator: FilterOperator.CONTAINS,
        value: user1.email.substring(0, user1.email.indexOf('@')),
      })
      .andWhere({
        field: 'username',
        operator: FilterOperator.EQUALS,
        value: user1.username,
      })
      .orWhere({
        field: 'email',
        operator: FilterOperator.CONTAINS,
        value: user2.email.substring(0, user2.email.indexOf('@')),
      })
      .andWhere({
        // This AND applies to the preceding OR group's last item
        field: 'username',
        operator: FilterOperator.EQUALS,
        value: user2.username,
      })
      .orderBy('email', OrderDirection.ASC);

    const qb = await TypeORMUtils.getQueryBuilderFor<User>(
      UserEntity,
      userAlias,
    );
    translator.translate(criteria, qb);
    const fetchedUsers = await qb.getMany();

    // Based on the logic (email1 AND username1) OR (email2 AND username2)
    const expectedUsers = actualUsersFromDB
      .filter(
        (u) =>
          (u.email.includes(
            user1.email.substring(0, user1.email.indexOf('@')),
          ) &&
            u.username === user1.username) ||
          (u.email.includes(
            user2.email.substring(0, user2.email.indexOf('@')),
          ) &&
            u.username === user2.username),
      )
      .sort((a, b) => a.email.localeCompare(b.email));

    expect(fetchedUsers.length).toBe(expectedUsers.length);
    fetchedUsers.forEach((fetchedUser, index) => {
      expect(fetchedUser.uuid).toBe(expectedUsers[index]!.uuid);
    });
  });

  it('should fetch entities with INNER JOIN and complex ON condition filters (hydration check)', async () => {
    const postAlias = CriteriaPostSchema.alias[0];
    const publisherAlias = 'publisher';
    const user1 = actualUsersFromDB.find((u) => u.username === 'user_1');
    const user2 = actualUsersFromDB.find((u) => u.username === 'user_2');

    if (!user1 || !user2) {
      throw new Error(
        'Test data issue: Users user_1 or user_2 not found for join hydration test.',
      );
    }

    const criteria = CriteriaFactory.GetCriteria(CriteriaPostSchema, postAlias)
      .join(
        CriteriaFactory.GetInnerJoinCriteria(CriteriaUserSchema, publisherAlias)
          .where({
            field: 'username',
            operator: FilterOperator.EQUALS,
            value: user1.username,
          })
          .andWhere({
            field: 'email',
            operator: FilterOperator.CONTAINS,
            value: user1.email.substring(0, user1.email.indexOf('@')),
          })
          .orWhere({
            // This OR is for the publisher conditions
            field: 'username',
            operator: FilterOperator.EQUALS,
            value: user2.username,
          })
          .andWhere({
            // This AND applies to the preceding OR group's last item (username = user2)
            field: 'email',
            operator: FilterOperator.CONTAINS,
            value: user2.email.substring(0, user2.email.indexOf('@')),
          }),
        {
          parent_field: 'user_uuid',
          join_field: 'uuid',
        },
      )
      .orderBy('created_at', OrderDirection.ASC);

    const qb = await TypeORMUtils.getQueryBuilderFor<Post>(
      PostEntity,
      postAlias,
    );
    translator.translate(criteria, qb);
    const fetchedPosts = await qb.getMany();

    expect(fetchedPosts.length).toBeGreaterThan(0);
    const expectedPublisherUsernames = [user1.username, user2.username];
    fetchedPosts.forEach((post) => {
      expect(post.publisher).toBeDefined();
      if (post.publisher) {
        expect(expectedPublisherUsernames).toContain(post.publisher.username);
      }
    });
  });

  it('should fetch a single user by UUID using getOne()', async () => {
    const alias = CriteriaUserSchema.alias[0];
    const targetUsername = 'user_2';
    const targetUserFromDB = actualUsersFromDB.find(
      (u) => u.username === targetUsername,
    );

    if (!targetUserFromDB) {
      throw new Error(
        `Test data issue: User "${targetUsername}" not found in DB.`,
      );
    }

    const criteria = CriteriaFactory.GetCriteria(
      CriteriaUserSchema,
      alias,
    ).where({
      field: 'uuid',
      operator: FilterOperator.EQUALS,
      value: targetUserFromDB.uuid,
    });

    const qb = await TypeORMUtils.getQueryBuilderFor<User>(UserEntity, alias);
    translator.translate(criteria, qb);
    const fetchedUser = await qb.getOne();

    expect(fetchedUser).not.toBeNull();
    expect(fetchedUser?.uuid).toBe(targetUserFromDB.uuid);
    expect(fetchedUser?.email).toBe(targetUserFromDB.email);
  });

  it('should return null with getOne() if no user matches', async () => {
    const alias = CriteriaUserSchema.alias[0];
    const nonExistentUuid = '00000000-0000-0000-0000-000000000000';

    const criteria = CriteriaFactory.GetCriteria(
      CriteriaUserSchema,
      alias,
    ).where({
      field: 'uuid',
      operator: FilterOperator.EQUALS,
      value: nonExistentUuid,
    });

    const qb = await TypeORMUtils.getQueryBuilderFor<User>(UserEntity, alias);
    translator.translate(criteria, qb);
    const fetchedUser = await qb.getOne();

    expect(fetchedUser).toBeNull();
  });

  it('should fetch a post and its comments using LEFT JOIN and getOne()', async () => {
    const postCriteriaRootAlias = CriteriaPostSchema.alias[0];
    const commentsRelationJoinAlias = 'comments'; // Matches alias in PostSchema for comments join

    const targetPostTitle = 'Post Title 1';
    const targetPostWithCommentsFromDB = actualPostsFromDB.find(
      (p) => p.title === targetPostTitle && p.comments && p.comments.length > 0,
    );

    if (
      !targetPostWithCommentsFromDB ||
      !targetPostWithCommentsFromDB.comments
    ) {
      throw new Error(
        `Test data issue: Post with title "${targetPostTitle}" and comments not found in DB.`,
      );
    }

    const criteria = CriteriaFactory.GetCriteria(
      CriteriaPostSchema,
      postCriteriaRootAlias,
    )
      .join(
        CriteriaFactory.GetLeftJoinCriteria(
          CriteriaCommentSchema,
          commentsRelationJoinAlias,
        ),
        {
          parent_field: 'uuid', // Field in Post table
          join_field: 'post_uuid', // Field in Comment table
        },
      )
      .where({
        field: 'uuid', // Filter on the root Post entity
        operator: FilterOperator.EQUALS,
        value: targetPostWithCommentsFromDB.uuid,
      });

    const qb = await TypeORMUtils.getQueryBuilderFor<Post>(
      PostEntity,
      postCriteriaRootAlias,
    );
    translator.translate(criteria, qb);
    const fetchedPost = await qb.getOne();

    expect(fetchedPost).not.toBeNull();
    expect(fetchedPost?.uuid).toBe(targetPostWithCommentsFromDB.uuid);
    expect(fetchedPost?.comments).toBeDefined();

    if (fetchedPost?.comments) {
      expect(fetchedPost.comments.length).toBe(
        targetPostWithCommentsFromDB.comments.length,
      );
      targetPostWithCommentsFromDB.comments.forEach((dbComment) => {
        const fetchedComment = fetchedPost!.comments.find(
          (c: Comment) => c.uuid === dbComment.uuid,
        );
        expect(
          fetchedComment,
          `Comment ${dbComment.uuid} not found on fetched post`,
        ).toBeDefined();
        if (fetchedComment) {
          expect(fetchedComment.comment_text).toBe(dbComment.comment_text);
        }
      });
    }
  });

  it('should throw EntityNotFoundError with getOneOrFail() if no user matches', async () => {
    const alias = CriteriaUserSchema.alias[0];
    const nonExistentUuid = '11111111-1111-1111-1111-111111111111';

    const criteria = CriteriaFactory.GetCriteria(
      CriteriaUserSchema,
      alias,
    ).where({
      field: 'uuid',
      operator: FilterOperator.EQUALS,
      value: nonExistentUuid,
    });

    const qb = await TypeORMUtils.getQueryBuilderFor<User>(UserEntity, alias);
    translator.translate(criteria, qb);

    await expect(qb.getOneOrFail()).rejects.toThrow(EntityNotFoundError);
  });
});
