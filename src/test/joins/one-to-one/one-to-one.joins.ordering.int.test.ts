import {
  type EntitySchema,
  type ObjectLiteral,
  SelectQueryBuilder,
} from 'typeorm';
import { TypeOrmMysqlTranslator } from '../../../type-orm.mysql.translator.js';
import {
  UserSchema as CriteriaUserSchema,
  type User,
  type UserProfile,
  UserProfileSchema as CriteriaUserProfileSchema,
  type EntityBase,
  type DomainEvent,
  DomainEventsSchema,
  type Post,
  PostSchema as CriteriaPostSchema,
} from '../../utils/fake-entities.js';
import {
  CriteriaFactory,
  FilterOperator,
  OrderDirection,
  type RootCriteria,
} from '@nulledexp/translatable-criteria';
import {
  initializeDataSourceService,
  TypeORMUtils,
} from '../../utils/type-orm.utils.js';
import { UserEntity } from '../../utils/entities/user.entity.js';
import { UserProfileEntity } from '../../utils/entities/user-profile.entity.js';
import { EventEntitySchema } from '../../utils/entities/event.entity.js';
import { PostEntity } from '../../utils/entities/post.entity.js';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

describe('TypeOrmMysqlTranslator - Ordering with One-to-One Joins', () => {
  let translator: TypeOrmMysqlTranslator<ObjectLiteral>;
  let actualUsersFromDB: User[];
  let actualUserProfilesFromDB: UserProfile[];
  let actualPostsFromDB: Post[];
  let actualDomainEventsFromDB: DomainEvent<any>[];

  async function translateAndFetch<E extends EntityBase>(
    criteria: RootCriteria<any>,
    entitySchema: EntitySchema<E>,
    method: 'getOne',
  ): Promise<E | null>;
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
    actualUsersFromDB = (
      await dataSource
        .getRepository(UserEntity)
        .find({ relations: ['profile', 'posts'] })
    ).sort((a, b) => a.email.localeCompare(b.email));

    actualUserProfilesFromDB = await dataSource
      .getRepository(UserProfileEntity)
      .find({ relations: ['user'] });
    actualDomainEventsFromDB = await dataSource
      .getRepository(EventEntitySchema)
      .find();
    actualPostsFromDB = await dataSource
      .getRepository(PostEntity)
      .find({ relations: ['publisher'] });
  });

  beforeEach(() => {
    translator = new TypeOrmMysqlTranslator();
  });

  it('should fetch Users ordered by a field in their UserProfile', async () => {
    const usersWithProfilesFromDB = actualUsersFromDB
      .filter((u) => u.profile !== null && u.profile !== undefined)
      .sort((a, b) => {
        const bioA = a.profile!.bio || '';
        const bioB = b.profile!.bio || '';
        return bioA.localeCompare(bioB);
      });

    if (usersWithProfilesFromDB.length === 0) {
      throw new Error(
        'Test data issue: No users with profiles found for ordering test.',
      );
    }

    const profileJoinCriteria = CriteriaFactory.GetInnerJoinCriteria(
      CriteriaUserProfileSchema,
    ).orderBy('bio', OrderDirection.ASC);

    const rootCriteria = CriteriaFactory.GetCriteria(CriteriaUserSchema)
      .join('profile', profileJoinCriteria)
      .setSelect(['uuid', 'username']);

    const fetchedUsers = await translateAndFetch<User>(
      rootCriteria,
      UserEntity,
      'getMany',
    );

    expect(fetchedUsers.length).toBe(usersWithProfilesFromDB.length);
    fetchedUsers.forEach((fetchedUser, index) => {
      expect(fetchedUser.uuid).toBe(usersWithProfilesFromDB[index]!.uuid);
    });
  });

  it('should fetch UserProfiles ordered by a field in their User (inverse)', async () => {
    const profilesWithUserFromDB = actualUserProfilesFromDB
      .filter((up) => up.user !== null && up.user !== undefined)
      .sort((a, b) => {
        const usernameA = a.user!.username || '';
        const usernameB = b.user!.username || '';
        return usernameA.localeCompare(usernameB);
      });

    if (profilesWithUserFromDB.length === 0) {
      throw new Error(
        'Test data issue: No user profiles with associated users found for ordering test.',
      );
    }

    const userJoinCriteria = CriteriaFactory.GetInnerJoinCriteria(
      CriteriaUserSchema,
    ).orderBy('username', OrderDirection.ASC);

    const rootCriteria = CriteriaFactory.GetCriteria(CriteriaUserProfileSchema)
      .join('user', userJoinCriteria)
      .setSelect(['uuid', 'bio']);

    const fetchedUserProfiles = await translateAndFetch<UserProfile>(
      rootCriteria,
      UserProfileEntity,
      'getMany',
    );

    expect(fetchedUserProfiles.length).toBe(profilesWithUserFromDB.length);
    fetchedUserProfiles.forEach((fetchedProfile, index) => {
      expect(fetchedProfile.uuid).toBe(profilesWithUserFromDB[index]!.uuid);
    });
  });

  it('should fetch the last page using orderBy, take, and skip', async () => {
    const pageSize = 3;
    const totalUsers = actualUsersFromDB.length;

    if (totalUsers < pageSize + 1) {
      throw new Error(
        `Test data issue: Need at least ${
          pageSize + 1
        } users for this test. Have ${totalUsers}.`,
      );
    }

    const skipForLastPage = totalUsers - pageSize + 1;

    const criteria = CriteriaFactory.GetCriteria(CriteriaUserSchema)
      .orderBy('email', OrderDirection.ASC)
      .setTake(pageSize)
      .setSkip(skipForLastPage);

    const qb = await TypeORMUtils.getQueryBuilderFor<User>(
      UserEntity,
      criteria.alias,
    );
    translator.translate(criteria, qb);
    const fetchedUsers = await qb.getMany();

    const expectedUsersSlice = actualUsersFromDB.slice(
      skipForLastPage,
      skipForLastPage + pageSize,
    );
    expect(fetchedUsers.length).toBe(expectedUsersSlice.length);

    fetchedUsers.forEach((fetchedUser, index) => {
      expect(fetchedUser.uuid).toBe(expectedUsersSlice[index]!.uuid);
    });
  });

  it('should return an empty array when skipping beyond the last page', async () => {
    const pageSize = 3;
    const totalUsers = actualUsersFromDB.length;

    const skipBeyondLastPage = totalUsers + 1;

    const criteria = CriteriaFactory.GetCriteria(CriteriaUserSchema)
      .orderBy('email', OrderDirection.ASC)
      .setTake(pageSize)
      .setSkip(skipBeyondLastPage);

    const qb = await TypeORMUtils.getQueryBuilderFor<User>(
      UserEntity,
      criteria.alias,
    );
    translator.translate(criteria, qb);
    const fetchedUsers = await qb.getMany();

    expect(fetchedUsers).toHaveLength(0);
  });

  it('should fetch the last page using cursor-based pagination (created_at ASC, uuid ASC)', async () => {
    const pageSize = 2;
    const totalUsers = actualUsersFromDB.length;

    const sortedUsersForCursor = [...actualUsersFromDB].sort((a, b) => {
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      if (dateA !== dateB) return dateA - dateB;
      return a.uuid.localeCompare(b.uuid);
    });

    if (sortedUsersForCursor.length < pageSize + 1) {
      throw new Error(
        `Test data issue: Need at least ${
          pageSize + 1
        } users for this cursor test. Have ${sortedUsersForCursor.length}.`,
      );
    }

    const skipForPreviousToLastPage = totalUsers - pageSize - 1;

    const criteriaPreviousPage = CriteriaFactory.GetCriteria(CriteriaUserSchema)
      .orderBy('created_at', OrderDirection.ASC)
      .orderBy('uuid', OrderDirection.ASC)
      .setTake(pageSize)
      .setSkip(skipForPreviousToLastPage);

    const qbPreviousPage = await TypeORMUtils.getQueryBuilderFor<User>(
      UserEntity,
      criteriaPreviousPage.alias,
    );
    translator.translate(criteriaPreviousPage, qbPreviousPage);
    const previousPageUsers = await qbPreviousPage.getMany();

    if (previousPageUsers.length === 0) {
      throw new Error(
        'Test data issue: Could not fetch the page before the last page to get cursor.',
      );
    }

    const lastUserOfPreviousPage =
      previousPageUsers[previousPageUsers.length - 1]!;

    const criteriaLastPage = CriteriaFactory.GetCriteria(CriteriaUserSchema);
    criteriaLastPage
      .setCursor(
        [
          { field: 'created_at', value: lastUserOfPreviousPage.created_at },
          { field: 'uuid', value: lastUserOfPreviousPage.uuid },
        ],
        FilterOperator.GREATER_THAN,
        OrderDirection.ASC,
      )
      .orderBy('created_at', OrderDirection.ASC)
      .orderBy('uuid', OrderDirection.ASC)
      .setTake(pageSize);

    const qbLastPage = await TypeORMUtils.getQueryBuilderFor<User>(
      UserEntity,
      criteriaLastPage.alias,
    );
    translator.translate(criteriaLastPage, qbLastPage);
    const lastPageUsers = await qbLastPage.getMany();

    const expectedLastPageUsers = sortedUsersForCursor.slice(
      skipForPreviousToLastPage + previousPageUsers.length,
    );

    expect(lastPageUsers.length).toBe(expectedLastPageUsers.length);
    lastPageUsers.forEach((fetchedUser, index) => {
      expect(fetchedUser.uuid).toBe(expectedLastPageUsers[index]!.uuid);
    });
  });

  it('should return an empty array when cursor is beyond the last result (created_at ASC, uuid ASC)', async () => {
    const pageSize = 2;
    const totalUsers = actualUsersFromDB.length;

    const sortedUsersForCursor = [...actualUsersFromDB].sort((a, b) => {
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      if (dateA !== dateB) return dateA - dateB;
      return a.uuid.localeCompare(b.uuid);
    });

    if (sortedUsersForCursor.length === 0) {
      throw new Error('Test data issue: No users found for this cursor test.');
    }

    const lastUser = sortedUsersForCursor[totalUsers - 1]!;

    const criteriaBeyondLast = CriteriaFactory.GetCriteria(CriteriaUserSchema);
    criteriaBeyondLast
      .setCursor(
        [
          { field: 'created_at', value: lastUser.created_at },
          { field: 'uuid', value: lastUser.uuid },
        ],
        FilterOperator.GREATER_THAN,
        OrderDirection.ASC,
      )
      .orderBy('created_at', OrderDirection.ASC)
      .orderBy('uuid', OrderDirection.ASC)
      .setTake(pageSize);

    const qbBeyondLast = await TypeORMUtils.getQueryBuilderFor<User>(
      UserEntity,
      criteriaBeyondLast.alias,
    );
    translator.translate(criteriaBeyondLast, qbBeyondLast);
    const fetchedUsers = await qbBeyondLast.getMany();

    expect(fetchedUsers).toHaveLength(0);
  });

  it('should fetch root entities ordered by multiple fields with different directions', async () => {
    const take = 5;

    const expectedSortedUsers = [...actualUsersFromDB].sort((a, b) => {
      const usernameComparison = a.username.localeCompare(b.username);
      if (usernameComparison !== 0) {
        return usernameComparison;
      }
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      return dateB - dateA;
    });

    if (expectedSortedUsers.length === 0) {
      throw new Error(
        'Test data issue: No users found for multi-field ordering test.',
      );
    }

    const criteria = CriteriaFactory.GetCriteria(CriteriaUserSchema)
      .orderBy('username', OrderDirection.ASC)
      .orderBy('created_at', OrderDirection.DESC)
      .setTake(take);

    const qb = await TypeORMUtils.getQueryBuilderFor<User>(
      UserEntity,
      criteria.alias,
    );
    translator.translate(criteria, qb);
    const fetchedUsers = await qb.getMany();

    const expectedSlice = expectedSortedUsers.slice(0, take);
    expect(fetchedUsers.length).toBe(expectedSlice.length);

    fetchedUsers.forEach((fetchedUser, index) => {
      expect(fetchedUser.uuid).toBe(expectedSlice[index]!.uuid);
      expect(fetchedUser.username).toBe(expectedSlice[index]!.username);
      expect(new Date(fetchedUser.created_at).toISOString()).toBe(
        new Date(expectedSlice[index]!.created_at).toISOString(),
      );
    });
  });

  it('should fetch root entities ordered by a numeric field (event_version) in ASC and DESC directions', async () => {
    if (actualDomainEventsFromDB.length === 0) {
      throw new Error(
        'Test data issue: No domain events found for numeric ordering test.',
      );
    }

    const expectedSortedEventsAsc = [...actualDomainEventsFromDB].sort(
      (a, b) => a.event_version - b.event_version,
    );

    const criteriaAsc = CriteriaFactory.GetCriteria(DomainEventsSchema).orderBy(
      'event_version',
      OrderDirection.ASC,
    );

    const qbAsc = await TypeORMUtils.getEventsQueryBuilder(criteriaAsc.alias);
    translator.translate(criteriaAsc, qbAsc);
    const fetchedEventsAsc = await qbAsc.getMany();

    expect(fetchedEventsAsc.length).toBe(expectedSortedEventsAsc.length);
    fetchedEventsAsc.forEach((fetchedEvent, index) => {
      expect(fetchedEvent.id).toBe(expectedSortedEventsAsc[index]!.id);
      expect(fetchedEvent.event_version).toBe(
        expectedSortedEventsAsc[index]!.event_version,
      );
    });

    const expectedSortedEventsDesc = [...actualDomainEventsFromDB].sort(
      (a, b) => b.event_version - a.event_version,
    );

    const criteriaDesc = CriteriaFactory.GetCriteria(
      DomainEventsSchema,
    ).orderBy('event_version', OrderDirection.DESC);

    const qbDesc = await TypeORMUtils.getEventsQueryBuilder(criteriaDesc.alias);
    translator.translate(criteriaDesc, qbDesc);
    const fetchedEventsDesc = await qbDesc.getMany();

    expect(fetchedEventsDesc.length).toBe(expectedSortedEventsDesc.length);
    fetchedEventsDesc.forEach((fetchedEvent, index) => {
      expect(fetchedEvent.id).toBe(expectedSortedEventsDesc[index]!.id);
      expect(fetchedEvent.event_version).toBe(
        expectedSortedEventsDesc[index]!.event_version,
      );
    });
  });

  it('should fetch Users ordered by a User field ASC and then by a UserProfile field DESC', async () => {
    const usersWithProfilesFromDB = actualUsersFromDB
      .filter((u) => u.profile !== null && u.profile !== undefined)
      .sort((a, b) => {
        const usernameComparison = a.username.localeCompare(b.username);
        if (usernameComparison !== 0) {
          return usernameComparison;
        }
        const bioA = a.profile!.bio || '';
        const bioB = b.profile!.bio || '';
        return bioB.localeCompare(bioA);
      });

    if (usersWithProfilesFromDB.length === 0) {
      throw new Error(
        'Test data issue: No users with profiles found for multi-field ordering test.',
      );
    }

    const profileJoinCriteria = CriteriaFactory.GetInnerJoinCriteria(
      CriteriaUserProfileSchema,
    );

    const rootCriteria = CriteriaFactory.GetCriteria(CriteriaUserSchema)
      .orderBy('username', OrderDirection.ASC)
      .join('profile', profileJoinCriteria)
      .setSelect(['uuid', 'username']);
    profileJoinCriteria.orderBy('bio', OrderDirection.DESC);

    const fetchedUsers = await translateAndFetch<User>(
      rootCriteria,
      UserEntity,
      'getMany',
    );

    expect(fetchedUsers.length).toBe(usersWithProfilesFromDB.length);
    fetchedUsers.forEach((fetchedUser, index) => {
      const expectedUser = usersWithProfilesFromDB[index]!;
      expect(fetchedUser.uuid).toBe(expectedUser.uuid);
      expect(fetchedUser.username).toBe(expectedUser.username);
      if (fetchedUser.profile && expectedUser.profile) {
        expect(fetchedUser.profile.bio).toBe(expectedUser.profile.bio);
      }
    });
  });

  it('should fetch root entities with specific fields selected, including those needed for ordering', async () => {
    const take = 5;

    const expectedSortedUsers = [...actualUsersFromDB].sort((a, b) => {
      const usernameComparison = a.username.localeCompare(b.username);
      if (usernameComparison !== 0) {
        return usernameComparison;
      }
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      return dateB - dateA;
    });

    if (expectedSortedUsers.length === 0) {
      throw new Error(
        'Test data issue: No users found for setSelect with ordering test.',
      );
    }

    const criteria = CriteriaFactory.GetCriteria(CriteriaUserSchema)
      .setSelect(['email'])
      .orderBy('username', OrderDirection.ASC)
      .orderBy('created_at', OrderDirection.DESC)
      .setTake(take);

    const qb = await TypeORMUtils.getQueryBuilderFor<User>(
      UserEntity,
      criteria.alias,
    );
    translator.translate(criteria, qb);
    const fetchedUsers = await qb.getMany();

    const expectedSlice = expectedSortedUsers.slice(0, take);
    expect(fetchedUsers.length).toBe(expectedSlice.length);

    fetchedUsers.forEach((fetchedUser, index) => {
      const expectedUserFromFullList = expectedSlice[index]!;

      expect(fetchedUser.email).toBe(expectedUserFromFullList.email);
      expect(fetchedUser.username).toBe(expectedUserFromFullList.username);
      expect(new Date(fetchedUser.created_at).toISOString()).toBe(
        new Date(expectedUserFromFullList.created_at).toISOString(),
      );
      expect(fetchedUser.uuid).toBe(expectedUserFromFullList.uuid);
    });
  });

  it('should fetch root entities with selected fields and joined entities with selected fields, including those needed for ordering from both', async () => {
    const take = 5;

    const postsWithPublisherFromDB = actualPostsFromDB.filter(
      (p) => p.publisher,
    );

    if (postsWithPublisherFromDB.length === 0) {
      throw new Error(
        'Test data issue: No posts with publishers found for this test.',
      );
    }

    const expectedSortedPosts = [...postsWithPublisherFromDB].sort((a, b) => {
      const createdAtA = new Date(a.created_at).getTime();
      const createdAtB = new Date(b.created_at).getTime();
      if (createdAtA !== createdAtB) {
        return createdAtB - createdAtA;
      }

      const usernameA = a.publisher!.username;
      const usernameB = b.publisher!.username;
      return usernameA.localeCompare(usernameB);
    });

    const publisherJoinCriteria = CriteriaFactory.GetInnerJoinCriteria(
      CriteriaUserSchema,
    ).setSelect(['email']);

    const criteria = CriteriaFactory.GetCriteria(CriteriaPostSchema)
      .setSelect(['title'])
      .orderBy('created_at', OrderDirection.DESC)
      .join('publisher', publisherJoinCriteria)
      .setTake(take);
    publisherJoinCriteria.orderBy('username', OrderDirection.ASC);

    const qb = await TypeORMUtils.getQueryBuilderFor<Post>(
      PostEntity,
      criteria.alias,
    );
    translator.translate(criteria, qb);
    const fetchedPosts = await qb.getMany();

    const expectedSlice = expectedSortedPosts.slice(0, take);
    expect(fetchedPosts.length).toBe(expectedSlice.length);

    fetchedPosts.forEach((fetchedPost, index) => {
      const expectedPost = expectedSlice[index]!;

      expect(fetchedPost.title).toBe(expectedPost.title);
      expect(new Date(fetchedPost.created_at).toISOString()).toBe(
        new Date(expectedPost.created_at).toISOString(),
      );
      expect(fetchedPost.body).toBeUndefined();

      expect(fetchedPost.publisher).toBeDefined();
      if (fetchedPost.publisher && expectedPost.publisher) {
        expect(fetchedPost.publisher.email).toBe(expectedPost.publisher.email);
        expect(fetchedPost.publisher.username).toBe(
          expectedPost.publisher.username,
        );
        expect(fetchedPost.publisher.uuid).toBe(expectedPost.publisher.uuid);
      }
    });
  });

  it('should fetch root Users with selected fields and their Posts with selected fields, including fields needed for ordering, in a one-to-many join', async () => {
    const usersWithPostsForTest = actualUsersFromDB
      .filter((u) => u.posts && u.posts.length > 0)
      .map((u) => ({
        ...u,
        posts: [...u.posts].sort(
          (p1, p2) =>
            new Date(p2.created_at).getTime() -
            new Date(p1.created_at).getTime(),
        ),
      }))
      .sort((a, b) => a.username.localeCompare(b.username));

    if (usersWithPostsForTest.length === 0) {
      throw new Error(
        'Test data issue: No users with posts found for this test.',
      );
    }

    const postsJoinCriteria = CriteriaFactory.GetInnerJoinCriteria(
      CriteriaPostSchema,
    )
      .setSelect(['title'])
      .orderBy('created_at', OrderDirection.DESC);

    const criteria = CriteriaFactory.GetCriteria(CriteriaUserSchema)
      .setSelect(['email'])
      .orderBy('username', OrderDirection.ASC)
      .join('posts', postsJoinCriteria);

    const qb = await TypeORMUtils.getQueryBuilderFor<User>(
      UserEntity,
      criteria.alias,
    );
    translator.translate(criteria, qb);
    const fetchedUsers = await qb.getMany();

    expect(fetchedUsers.length).toBe(usersWithPostsForTest.length);

    fetchedUsers.forEach((fetchedUser, userIndex) => {
      const expectedUser = usersWithPostsForTest[userIndex]!;

      expect(fetchedUser.email).toBe(expectedUser.email);
      expect(fetchedUser.username).toBe(expectedUser.username);
      expect(fetchedUser.uuid).toBe(expectedUser.uuid);
      expect(fetchedUser.created_at).toBeUndefined();

      expect(fetchedUser.posts).toBeDefined();
      expect(fetchedUser.posts.length).toBeGreaterThan(0);
      expect(fetchedUser.posts.length).toBe(expectedUser.posts.length);

      fetchedUser.posts.forEach((fetchedPost, postIndex) => {
        const expectedPost = expectedUser.posts[postIndex]!;
        expect(fetchedPost.title).toBe(expectedPost.title);
        expect(new Date(fetchedPost.created_at).toISOString()).toBe(
          new Date(expectedPost.created_at).toISOString(),
        );
        expect(fetchedPost.uuid).toBe(expectedPost.uuid);
        expect(fetchedPost.body).toBeUndefined();
      });
    });
  });
});
