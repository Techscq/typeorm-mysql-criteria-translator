import { TypeOrmMysqlTranslator } from '../../type-orm.mysql.translator.js';
import { type ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import {
  initializeDataSourceService,
  TypeORMUtils,
} from '../utils/type-orm.utils.js';
import {
  UserSchema as CriteriaUserSchema,
  PostSchema as CriteriaPostSchema,
  UserProfileSchema as CriteriaUserProfileSchema,
  PermissionSchema as CriteriaPermissionSchema,
  PostCommentSchema as CriteriaCommentSchema,
  AddressSchema as CriteriaAddressSchema,
  type User,
  type Post,
} from './../utils/fake-entities.js';
import { UserEntity } from '../utils/entities/user.entity.js';
import { PostEntity } from '../utils/entities/post.entity.js';
import { beforeEach, describe, expect, it, beforeAll } from 'vitest';
import {
  CriteriaFactory,
  FilterOperator,
  SelectType,
} from '@nulledexp/translatable-criteria';

/**
 * Integration tests for advanced join scenarios and edge cases.
 * Covers:
 * - Column name collisions (e.g., 'created_at' in multiple tables).
 * - Performance optimizations (joining without selecting).
 * - Complex nested joins with alias collisions (same relation name in different branches).
 */
describe('TypeOrmMysqlTranslator - Advanced Joins & Edge Cases', () => {
  let translator: TypeOrmMysqlTranslator<ObjectLiteral>;
  let actualUsersFromDB: User[];

  beforeAll(async () => {
    const dataSource = await initializeDataSourceService(false);
    actualUsersFromDB = await dataSource.getRepository(UserEntity).find({
      relations: ['profile', 'permissions', 'posts', 'posts.comments'],
    });
  });

  beforeEach(() => {
    translator = new TypeOrmMysqlTranslator();
  });

  it('should handle column name collisions (created_at) correctly when joining and selecting', async () => {
    const targetUser = actualUsersFromDB.find(
      (u) => u.posts && u.posts.length > 0,
    );
    if (!targetUser) throw new Error('No user with posts found');

    const criteria = CriteriaFactory.GetCriteria(CriteriaUserSchema)
      .where({
        field: 'uuid',
        operator: FilterOperator.EQUALS,
        value: targetUser.uuid,
      })
      .join('posts', CriteriaFactory.GetInnerJoinCriteria(CriteriaPostSchema), {
        select: SelectType.FULL_ENTITY,
      });

    const qb = await TypeORMUtils.getQueryBuilderFor<User>(
      UserEntity,
      criteria.alias,
    );
    translator.translate(criteria, qb as SelectQueryBuilder<ObjectLiteral>);

    const result = await qb.getOne();

    expect(result).toBeDefined();
    expect(result!.uuid).toBe(targetUser.uuid);

    // Verify root entity 'created_at' is correct
    expect(new Date(result!.created_at).getTime()).toBe(
      new Date(targetUser.created_at).getTime(),
    );

    // Verify joined entity 'created_at' is correct and distinct from root
    const targetPost = targetUser.posts[0]!;
    const resultPost = result!.posts.find((p) => p.uuid === targetPost.uuid);
    expect(resultPost).toBeDefined();
    expect(new Date(resultPost!.created_at).getTime()).toBe(
      new Date(targetPost.created_at).getTime(),
    );
  });

  it('should apply JOIN for filtering but NOT select fields when SelectType.NO_SELECTION (One-to-One)', async () => {
    const targetUser = actualUsersFromDB.find((u) => u.profile);
    if (!targetUser) throw new Error('No user with profile found');

    const criteria = CriteriaFactory.GetCriteria(CriteriaUserSchema)
      .where({
        field: 'uuid',
        operator: FilterOperator.EQUALS,
        value: targetUser.uuid,
      })
      .join(
        'profile',
        CriteriaFactory.GetInnerJoinCriteria(CriteriaUserProfileSchema).where({
          field: 'bio',
          operator: FilterOperator.IS_NOT_NULL,
          value: null,
        }),
        { select: SelectType.NO_SELECTION },
      );

    const qb = await TypeORMUtils.getQueryBuilderFor<User>(
      UserEntity,
      criteria.alias,
    );
    translator.translate(criteria, qb as SelectQueryBuilder<ObjectLiteral>);

    const result = await qb.getOne();

    expect(result).toBeDefined();
    expect(result!.uuid).toBe(targetUser.uuid);
    // Profile should be used for filtering but not hydrated in the result
    expect(result!.profile).toBeUndefined();
  });

  it('should apply JOIN for filtering but NOT select fields when SelectType.NO_SELECTION (Many-to-Many)', async () => {
    const targetUser = actualUsersFromDB.find(
      (u) => u.permissions && u.permissions.length > 0,
    );
    if (!targetUser) throw new Error('No user with permissions found');

    const targetPermission = targetUser.permissions[0]!;

    const criteria = CriteriaFactory.GetCriteria(CriteriaUserSchema)
      .where({
        field: 'uuid',
        operator: FilterOperator.EQUALS,
        value: targetUser.uuid,
      })
      .join(
        'permissions',
        CriteriaFactory.GetInnerJoinCriteria(CriteriaPermissionSchema).where({
          field: 'name',
          operator: FilterOperator.EQUALS,
          value: targetPermission.name,
        }),
        { select: SelectType.NO_SELECTION }, // with_select: false
      );

    const qb = await TypeORMUtils.getQueryBuilderFor<User>(
      UserEntity,
      criteria.alias,
    );
    translator.translate(criteria, qb as SelectQueryBuilder<ObjectLiteral>);

    const result = await qb.getOne();

    expect(result).toBeDefined();
    expect(result!.uuid).toBe(targetUser.uuid);
    expect(result!.permissions).toBeUndefined();
  });

  it('should apply JOIN for filtering but NOT select fields when SelectType.NO_SELECTION (One-to-Many)', async () => {
    const targetUser = actualUsersFromDB.find(
      (u) => u.posts && u.posts.length > 0,
    );
    if (!targetUser) throw new Error('No user with posts found');

    const criteria = CriteriaFactory.GetCriteria(CriteriaUserSchema)
      .where({
        field: 'uuid',
        operator: FilterOperator.EQUALS,
        value: targetUser.uuid,
      })
      .join(
        'posts',
        CriteriaFactory.GetInnerJoinCriteria(CriteriaPostSchema).where({
          field: 'title',
          operator: FilterOperator.IS_NOT_NULL,
          value: null,
        }),
        { select: SelectType.NO_SELECTION },
      );

    const qb = await TypeORMUtils.getQueryBuilderFor<User>(
      UserEntity,
      criteria.alias,
    );
    translator.translate(criteria, qb as SelectQueryBuilder<ObjectLiteral>);

    const result = await qb.getOne();

    expect(result).toBeDefined();
    expect(result!.uuid).toBe(targetUser.uuid);
    expect(result!.posts).toBeUndefined();
  });

  it('should handle nested joins where intermediate relation is selected but leaf is NOT selected', async () => {
    const targetUser = actualUsersFromDB.find(
      (u) =>
        u.posts && u.posts.some((p) => p.comments && p.comments.length > 0),
    );
    if (!targetUser) throw new Error('No user with posts and comments found');

    const criteria = CriteriaFactory.GetCriteria(CriteriaUserSchema)
      .where({
        field: 'uuid',
        operator: FilterOperator.EQUALS,
        value: targetUser.uuid,
      })
      .join(
        'posts',
        CriteriaFactory.GetInnerJoinCriteria(CriteriaPostSchema).join(
          'comments',
          CriteriaFactory.GetInnerJoinCriteria(CriteriaCommentSchema).where({
            field: 'comment_text',
            operator: FilterOperator.IS_NOT_NULL,
            value: null,
          }),
          { select: SelectType.NO_SELECTION }, // Leaf join (comments) is NOT selected
        ),
        { select: SelectType.FULL_ENTITY }, // Intermediate join (posts) IS selected
      );

    const qb = await TypeORMUtils.getQueryBuilderFor<User>(
      UserEntity,
      criteria.alias,
    );
    translator.translate(criteria, qb as SelectQueryBuilder<ObjectLiteral>);

    const result = await qb.getOne();

    expect(result).toBeDefined();
    expect(result!.posts).toBeDefined();
    expect(result!.posts.length).toBeGreaterThan(0);

    result!.posts.forEach((post) => {
      expect(post.comments).toBeUndefined();
    });
  });

  it('should handle shared alias "publisher" in nested joins (Post -> Publisher and Post -> Comments -> Publisher)', async () => {
    const dataSource = await initializeDataSourceService(false);
    const postRepo = dataSource.getRepository(PostEntity);

    const targetPost = await postRepo.findOne({
      where: { title: 'Post Title 1' },
      relations: ['publisher', 'comments', 'comments.publisher'],
    });

    if (!targetPost) {
      throw new Error('Test data issue: "Post Title 1" not found.');
    }
    if (!targetPost.comments || targetPost.comments.length === 0) {
      throw new Error('Test data issue: "Post Title 1" has no comments.');
    }

    const criteria = CriteriaFactory.GetCriteria(CriteriaPostSchema)
      .where({
        field: 'uuid',
        operator: FilterOperator.EQUALS,
        value: targetPost.uuid,
      })
      // First usage of 'publisher' alias (Post Author)
      .join(
        'publisher',
        CriteriaFactory.GetInnerJoinCriteria(CriteriaUserSchema),
      )
      // Second usage of 'publisher' alias (Comment Author) nested under comments
      .join(
        'comments',
        CriteriaFactory.GetInnerJoinCriteria(CriteriaCommentSchema).join(
          'publisher',
          CriteriaFactory.GetInnerJoinCriteria(CriteriaUserSchema),
        ),
      );

    const qb = await TypeORMUtils.getQueryBuilderFor<Post>(
      PostEntity,
      criteria.alias,
    );
    translator.translate(criteria, qb as SelectQueryBuilder<ObjectLiteral>);

    const result = await qb.getOne();

    expect(result).toBeDefined();
    expect(result!.uuid).toBe(targetPost.uuid);

    // Check Post -> Publisher
    expect(result!.publisher).toBeDefined();
    expect(result!.publisher!.uuid).toBe(targetPost!.publisher!.uuid);

    // Check Post -> Comments
    expect(result!.comments).toBeDefined();
    expect(result!.comments!.length).toBeGreaterThan(0);

    // Check Post -> Comments -> Publisher
    const resultComment = result!.comments![0]!;
    const targetComment = targetPost.comments.find(
      (c) => c.uuid === resultComment.uuid,
    );

    expect(targetComment).toBeDefined();
    expect(resultComment.publisher).toBeDefined();
    expect(resultComment!.publisher!.uuid).toBe(targetComment!.publisher!.uuid);

    // Check implicit FK loading
    expect(resultComment.post_uuid).toBeDefined();
    expect(resultComment.post_uuid).toBe(targetPost.uuid);
  });

  it('should correctly map deep nested relations when alias collision occurs (Post -> Publisher vs Comments -> Publisher -> Addresses)', async () => {
    const dataSource = await initializeDataSourceService(false);
    const postRepo = dataSource.getRepository(PostEntity);

    // Scenario:
    // 1. Root: Post
    // 2. Branch A: Post -> Publisher (User A)
    // 3. Branch B: Post -> Comments -> Publisher (User B) -> Addresses
    //
    // Both branches use the relation alias 'publisher'.
    // We need to ensure that when we fetch addresses for User B (comment author),
    // we don't accidentally fetch addresses for User A (post author) due to alias collision.
    const targetPost = await postRepo.findOne({
      where: { title: 'Post Title 1' },
      relations: [
        'publisher',
        'publisher.addresses',
        'comments',
        'comments.publisher',
        'comments.publisher.addresses',
      ],
    });

    if (!targetPost) throw new Error('Post Title 1 not found');

    const commentByOtherUser = targetPost!.comments!.find(
      (c) => c!.publisher!.uuid !== targetPost!.publisher!.uuid,
    );
    if (!commentByOtherUser)
      throw new Error('Test data needs a comment by a different user');

    const criteria = CriteriaFactory.GetCriteria(CriteriaPostSchema)
      .where({
        field: 'uuid',
        operator: FilterOperator.EQUALS,
        value: targetPost.uuid,
      })
      // Branch A: Uses alias 'publisher'
      .join(
        'publisher',
        CriteriaFactory.GetInnerJoinCriteria(CriteriaUserSchema),
      )
      // Branch B: Uses alias 'publisher' again (nested)
      .join(
        'comments',
        CriteriaFactory.GetInnerJoinCriteria(CriteriaCommentSchema).join(
          'publisher',
          CriteriaFactory.GetInnerJoinCriteria(CriteriaUserSchema).join(
            'addresses',
            CriteriaFactory.GetInnerJoinCriteria(CriteriaAddressSchema),
          ),
        ),
      );

    const qb = await TypeORMUtils.getQueryBuilderFor<Post>(
      PostEntity,
      criteria.alias,
    );
    translator.translate(criteria, qb as SelectQueryBuilder<ObjectLiteral>);

    const result = await qb.getOne();

    expect(result).toBeDefined();

    const resultComment = result!.comments!.find(
      (c) => c.uuid === commentByOtherUser.uuid,
    );
    expect(resultComment).toBeDefined();
    expect(resultComment!.publisher).toBeDefined();

    // Verification:
    // The address loaded for the comment's publisher must belong to the comment author,
    // NOT the post author.
    const expectedDirections = commentByOtherUser!.publisher!.addresses.map(
      (a) => a.direction,
    );
    const actualAddress = resultComment!.publisher!.addresses[0]?.direction;

    expect(expectedDirections).toContain(actualAddress);
    expect(actualAddress).not.toBe(
      targetPost.publisher!.addresses[0]!.direction,
    );
  });
});
