import { type ObjectLiteral } from 'typeorm';
import {
  type Post,
  PostSchema as CriteriaPostSchema,
  type User,
  UserSchema as CriteriaUserSchema,
} from './utils/fake-entities.js';
import {
  initializeDataSourceService,
  TypeORMUtils,
} from './utils/type-orm.utils.js';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { UserEntity } from './utils/entities/user.entity.js';
import { PostEntity } from './utils/entities/post.entity.js';
import { TypeOrmMysqlTranslator } from '../type-orm.mysql.translator.js';
import {
  CriteriaFactory,
  OrderDirection,
  FilterOperator,
} from '@nulledexp/translatable-criteria';

describe('TypeOrmMysqlTranslator - Pagination and Ordering', () => {
  let translator: TypeOrmMysqlTranslator<ObjectLiteral>;
  let actualUsersFromDB: User[];
  let actualPostsFromDB: Post[];

  beforeAll(async () => {
    const dataSource = await initializeDataSourceService(false);
    actualUsersFromDB = (
      await dataSource.getRepository(UserEntity).find()
    ).sort((a, b) => a.email.localeCompare(b.email));

    actualPostsFromDB = (
      await dataSource.getRepository(PostEntity).find({
        relations: ['publisher'],
      })
    ).sort((a, b) => {
      if (a.publisher && b.publisher) {
        const usernameComparison = b.publisher.username.localeCompare(
          a.publisher.username,
        );
        if (usernameComparison !== 0) return usernameComparison;
      } else if (a.publisher) {
        return -1;
      } else if (b.publisher) {
        return 1;
      }

      return a.uuid.localeCompare(b.uuid);
    });
  });

  beforeEach(() => {
    translator = new TypeOrmMysqlTranslator();
  });

  it('should fetch root entities with orderBy, take, and skip', async () => {
    const take = 2;
    const skip = 1;

    if (actualUsersFromDB.length < skip + take) {
      throw new Error(
        `Test data issue: Not enough users in DB for pagination test (need ${
          skip + take
        }, have ${actualUsersFromDB.length})`,
      );
    }

    const criteria = CriteriaFactory.GetCriteria(CriteriaUserSchema)
      .orderBy('email', OrderDirection.ASC)
      .setTake(take)
      .setSkip(skip);

    const qb = await TypeORMUtils.getQueryBuilderFor<User>(
      UserEntity,
      criteria.alias,
    );
    translator.translate(criteria, qb);
    const fetchedUsers = await qb.getMany();

    expect(fetchedUsers).toHaveLength(take);
    expect(fetchedUsers[0]!.uuid).toBe(actualUsersFromDB[skip]!.uuid);
    expect(fetchedUsers[1]!.uuid).toBe(actualUsersFromDB[skip + 1]!.uuid);
  });

  it('should fetch entities ordered by a field in a joined table with pagination', async () => {
    const take = 3;
    const skip = 0;

    const postsWithPublisher = actualPostsFromDB.filter((p) => p.publisher);
    if (postsWithPublisher.length === 0) {
      throw new Error('Test data issue: No posts with publishers found in DB.');
    }
    const sortedPostsForThisTest = postsWithPublisher;

    const publisherJoinCriteria = CriteriaFactory.GetInnerJoinCriteria(
      CriteriaUserSchema,
    ).orderBy('username', OrderDirection.DESC);

    const criteria = CriteriaFactory.GetCriteria(CriteriaPostSchema)
      .orderBy('uuid', OrderDirection.ASC)
      .join('publisher', publisherJoinCriteria, {
        parent_field: 'user_uuid',
        join_field: 'uuid',
      })
      .setTake(take)
      .setSkip(skip);

    const qb = await TypeORMUtils.getQueryBuilderFor<Post>(
      PostEntity,
      criteria.alias,
    );
    translator.translate(criteria, qb);

    const fetchedPosts = await qb.getMany();

    const expectedSlice = sortedPostsForThisTest.slice(skip, skip + take);
    expect(fetchedPosts.length).toBe(expectedSlice.length);

    fetchedPosts.forEach((fetchedPost, index) => {
      expect(fetchedPost.uuid).toBe(expectedSlice[index]!.uuid);
      expect(fetchedPost.publisher).toBeDefined();
      if (fetchedPost.publisher && expectedSlice[index]!.publisher) {
        expect(fetchedPost.publisher.username).toBe(
          expectedSlice[index]!.publisher!.username,
        );
      }
    });
  });

  it('should fetch root entities using cursor-based pagination (created_at ASC, uuid ASC)', async () => {
    const pageSize = 2;

    const sortedUsersForCursor = [...actualUsersFromDB].sort((a, b) => {
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      if (dateA !== dateB) return dateA - dateB;
      return a.uuid.localeCompare(b.uuid);
    });

    if (sortedUsersForCursor.length < pageSize) {
      throw new Error(
        `Test data issue: Not enough users for page size ${pageSize} in cursor test.`,
      );
    }

    const criteriaPage1 = CriteriaFactory.GetCriteria(CriteriaUserSchema)
      .orderBy('created_at', OrderDirection.ASC)
      .orderBy('uuid', OrderDirection.ASC)
      .setTake(pageSize);

    const qbPage1 = await TypeORMUtils.getQueryBuilderFor<User>(
      UserEntity,
      criteriaPage1.alias,
    );
    translator.translate(criteriaPage1, qbPage1);
    const page1Users = await qbPage1.getMany();

    expect(page1Users.length).toBe(pageSize);
    if (page1Users.length === 0) {
      throw new Error(
        'Test data issue: Page 1 of cursor test returned no users.',
      );
    }
    const lastUserPage1 = page1Users[page1Users.length - 1]!;

    const criteriaPage2 = CriteriaFactory.GetCriteria(CriteriaUserSchema);
    criteriaPage2
      .setCursor(
        [
          { field: 'created_at', value: lastUserPage1.created_at },
          { field: 'uuid', value: lastUserPage1.uuid },
        ],
        FilterOperator.GREATER_THAN,
        OrderDirection.ASC,
      )
      .orderBy('created_at', OrderDirection.ASC)
      .orderBy('uuid', OrderDirection.ASC)
      .setTake(pageSize);

    const qbPage2 = await TypeORMUtils.getQueryBuilderFor<User>(
      UserEntity,
      criteriaPage2.alias,
    );
    translator.translate(criteriaPage2, qbPage2);
    const page2Users = await qbPage2.getMany();

    expect(page2Users.length).toBeLessThanOrEqual(pageSize);
    if (page2Users.length > 0) {
      const firstUserPage2 = page2Users[0]!;
      const expectedNextUser = sortedUsersForCursor[pageSize];

      expect(firstUserPage2.uuid).toBe(expectedNextUser?.uuid);
      expect(
        page1Users.find((u) => u.uuid === firstUserPage2.uuid),
      ).toBeUndefined();
    }
  });

  it('should fetch root entities using cursor-based pagination (created_at DESC, uuid DESC)', async () => {
    const pageSize = 2;

    const sortedUsersForCursorDesc = [...actualUsersFromDB].sort((a, b) => {
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      if (dateA !== dateB) return dateB - dateA;
      return b.uuid.localeCompare(a.uuid);
    });

    if (sortedUsersForCursorDesc.length < pageSize) {
      throw new Error(
        `Test data issue: Not enough users for page size ${pageSize} in DESC cursor test.`,
      );
    }

    const criteriaPage1Desc = CriteriaFactory.GetCriteria(CriteriaUserSchema)
      .orderBy('created_at', OrderDirection.DESC)
      .orderBy('uuid', OrderDirection.DESC)
      .setTake(pageSize);

    const qbPage1Desc = await TypeORMUtils.getQueryBuilderFor<User>(
      UserEntity,
      criteriaPage1Desc.alias,
    );
    translator.translate(criteriaPage1Desc, qbPage1Desc);
    const page1UsersDesc = await qbPage1Desc.getMany();

    expect(page1UsersDesc.length).toBe(pageSize);
    page1UsersDesc.forEach((user, index) => {
      expect(user.uuid).toBe(sortedUsersForCursorDesc[index]!.uuid);
    });

    if (page1UsersDesc.length === 0) {
      throw new Error(
        'Test data issue: Page 1 of DESC cursor test returned no users.',
      );
    }
    const lastUserPage1Desc = page1UsersDesc[page1UsersDesc.length - 1]!;

    const criteriaPage2Desc = CriteriaFactory.GetCriteria(CriteriaUserSchema);
    criteriaPage2Desc
      .setCursor(
        [
          { field: 'created_at', value: lastUserPage1Desc.created_at },
          { field: 'uuid', value: lastUserPage1Desc.uuid },
        ],
        FilterOperator.LESS_THAN,
        OrderDirection.DESC,
      )
      .orderBy('created_at', OrderDirection.DESC)
      .orderBy('uuid', OrderDirection.DESC)
      .setTake(pageSize);

    const qbPage2Desc = await TypeORMUtils.getQueryBuilderFor<User>(
      UserEntity,
      criteriaPage2Desc.alias,
    );
    translator.translate(criteriaPage2Desc, qbPage2Desc);
    const page2UsersDesc = await qbPage2Desc.getMany();

    expect(page2UsersDesc.length).toBeLessThanOrEqual(pageSize);
    if (page2UsersDesc.length > 0) {
      const firstUserPage2Desc = page2UsersDesc[0]!;
      const expectedNextUser = sortedUsersForCursorDesc[pageSize];

      expect(firstUserPage2Desc.uuid).toBe(expectedNextUser?.uuid);
      expect(
        page1UsersDesc.find((u) => u.uuid === firstUserPage2Desc.uuid),
      ).toBeUndefined();

      page2UsersDesc.forEach((user, index) => {
        expect(user.uuid).toBe(
          sortedUsersForCursorDesc[pageSize + index]!.uuid,
        );
      });
    }
  });
});