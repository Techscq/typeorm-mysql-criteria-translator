import {
  type EntitySchema,
  type ObjectLiteral,
  SelectQueryBuilder,
} from 'typeorm';
import { TypeOrmMysqlTranslator } from '../../../type-orm.mysql.translator.js';
import {
  UserSchema as CriteriaUserSchema,
  type User,
  UserProfileSchema as CriteriaUserProfileSchema,
  type EntityBase,
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
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

const sortUsersByUsernameAndUuid = (
  users: User[],
  direction: OrderDirection,
): User[] => {
  const dir = direction === OrderDirection.ASC ? 1 : -1;
  return [...users].sort((a, b) => {
    const usernameComparison = a.username.localeCompare(b.username);
    if (usernameComparison !== 0) return usernameComparison * dir;
    return a.uuid.localeCompare(b.uuid) * dir;
  });
};

const sortUsersByProfileBioAndUuid = (
  users: User[],
  direction: OrderDirection,
): User[] => {
  return [...users].sort((a, b) => {
    const profileA = a.profile;
    const profileB = b.profile;
    const dir = direction === OrderDirection.ASC ? 1 : -1;
    const isANull = profileA?.bio === null || profileA?.bio === undefined;
    const isBNull = profileB?.bio === null || profileB?.bio === undefined;

    if (isANull !== isBNull) {
      const nullsFirst = direction === OrderDirection.ASC;
      if (isANull) return nullsFirst ? -1 : 1;
      return nullsFirst ? 1 : -1;
    }

    if (!isANull && !isBNull) {
      const bioComparison = (profileA!.bio as string).localeCompare(
        profileB!.bio as string,
      );
      if (bioComparison !== 0) return bioComparison * dir;
    }

    return a.uuid.localeCompare(b.uuid) * dir;
  });
};

describe('TypeOrmMysqlTranslator - Cursor Pagination with One-to-One Joins', () => {
  let translator: TypeOrmMysqlTranslator<ObjectLiteral>;
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
    actualUsersFromDB = await dataSource
      .getRepository(UserEntity)
      .find({ relations: ['profile'] });
  });

  beforeEach(() => {
    translator = new TypeOrmMysqlTranslator();
  });

  it('should paginate with a composite cursor on the root entity (INNER JOIN)', async () => {
    const pageSize = 2;
    const usersWithProfilesFromDB = actualUsersFromDB.filter((u) => u.profile);
    const sortedUsers = sortUsersByUsernameAndUuid(
      usersWithProfilesFromDB,
      OrderDirection.ASC,
    );

    if (sortedUsers.length < pageSize) {
      throw new Error('Not enough test data for this scenario.');
    }

    const page1Criteria = CriteriaFactory.GetCriteria(CriteriaUserSchema)
      .join(
        'profile',
        CriteriaFactory.GetInnerJoinCriteria(CriteriaUserProfileSchema),
      )
      .orderBy('username', OrderDirection.ASC)
      .orderBy('uuid', OrderDirection.ASC)
      .setTake(pageSize);

    const page1Users = await translateAndFetch<User>(page1Criteria, UserEntity);

    expect(page1Users.length).toBe(pageSize);
    expect(page1Users[0]!.uuid).toBe(sortedUsers[0]!.uuid);
    const lastUserOfPage1 = page1Users[page1Users.length - 1]!;

    const page2Criteria = CriteriaFactory.GetCriteria(CriteriaUserSchema)
      .join(
        'profile',
        CriteriaFactory.GetInnerJoinCriteria(CriteriaUserProfileSchema),
      )
      .setCursor(
        [
          { field: 'username', value: lastUserOfPage1.username },
          { field: 'uuid', value: lastUserOfPage1.uuid },
        ],
        FilterOperator.GREATER_THAN,
        OrderDirection.ASC,
      )
      .orderBy('username', OrderDirection.ASC)
      .orderBy('uuid', OrderDirection.ASC)
      .setTake(pageSize);

    const page2Users = await translateAndFetch<User>(page2Criteria, UserEntity);

    expect(page2Users.length).toBeLessThanOrEqual(pageSize);
    if (page2Users.length > 0) {
      expect(page2Users[0]!.uuid).toBe(sortedUsers[pageSize]!.uuid);
    }
  });

  it('should paginate with a composite cursor on the root entity (LEFT JOIN)', async () => {
    const pageSize = 3;
    const sortedUsers = sortUsersByUsernameAndUuid(
      actualUsersFromDB,
      OrderDirection.ASC,
    );

    if (sortedUsers.length < pageSize) {
      throw new Error('Not enough test data for this scenario.');
    }

    const page1Criteria = CriteriaFactory.GetCriteria(CriteriaUserSchema)
      .join(
        'profile',
        CriteriaFactory.GetLeftJoinCriteria(CriteriaUserProfileSchema),
      )
      .orderBy('username', OrderDirection.ASC)
      .orderBy('uuid', OrderDirection.ASC)
      .setTake(pageSize);

    const page1Users = await translateAndFetch<User>(page1Criteria, UserEntity);

    expect(page1Users.length).toBe(pageSize);
    expect(page1Users[0]!.uuid).toBe(sortedUsers[0]!.uuid);
    const lastUserOfPage1 = page1Users[page1Users.length - 1]!;

    const page2Criteria = CriteriaFactory.GetCriteria(CriteriaUserSchema)
      .join(
        'profile',
        CriteriaFactory.GetLeftJoinCriteria(CriteriaUserProfileSchema),
      )
      .setCursor(
        [
          { field: 'username', value: lastUserOfPage1.username },
          { field: 'uuid', value: lastUserOfPage1.uuid },
        ],
        FilterOperator.GREATER_THAN,
        OrderDirection.ASC,
      )
      .orderBy('username', OrderDirection.ASC)
      .orderBy('uuid', OrderDirection.ASC)
      .setTake(pageSize);

    const page2Users = await translateAndFetch<User>(page2Criteria, UserEntity);

    expect(page2Users.length).toBeLessThanOrEqual(pageSize);
    if (page2Users.length > 0) {
      expect(page2Users[0]!.uuid).toBe(sortedUsers[pageSize]!.uuid);
    }
  });

  it('should paginate with a composite cursor across root and joined entities (ASC)', async () => {
    const pageSize = 3;
    const sortedUsers = sortUsersByProfileBioAndUuid(
      actualUsersFromDB,
      OrderDirection.ASC,
    );

    if (sortedUsers.length < pageSize) {
      throw new Error('Not enough test data for this scenario.');
    }

    const profileJoinPage1 = CriteriaFactory.GetLeftJoinCriteria(
      CriteriaUserProfileSchema,
    ).orderBy('bio', OrderDirection.ASC);
    const page1Criteria = CriteriaFactory.GetCriteria(CriteriaUserSchema)
      .join('profile', profileJoinPage1)
      .orderBy('uuid', OrderDirection.ASC)
      .setTake(pageSize);

    const page1Users = await translateAndFetch<User>(page1Criteria, UserEntity);

    expect(page1Users.length).toBe(pageSize);
    page1Users.forEach((user, index) => {
      expect(user.uuid).toBe(sortedUsers[index]!.uuid);
    });
    const lastUserOfPage1 = page1Users[page1Users.length - 1]!;

    const profileJoinPage2 = CriteriaFactory.GetLeftJoinCriteria(
      CriteriaUserProfileSchema,
    )
      .setCursor(
        [{ field: 'bio', value: lastUserOfPage1.profile?.bio ?? null }],
        FilterOperator.GREATER_THAN,
        OrderDirection.ASC,
      )
      .orderBy('bio', OrderDirection.ASC);
    const page2Criteria = CriteriaFactory.GetCriteria(CriteriaUserSchema)
      .join('profile', profileJoinPage2)
      .setCursor(
        [{ field: 'uuid', value: lastUserOfPage1.uuid }],
        FilterOperator.GREATER_THAN,
        OrderDirection.ASC,
      )
      .orderBy('uuid', OrderDirection.ASC)
      .setTake(pageSize);

    const page2Users = await translateAndFetch<User>(page2Criteria, UserEntity);

    const expectedPage2Users = sortedUsers.slice(pageSize, pageSize * 2);
    expect(page2Users.length).toBe(expectedPage2Users.length);
    if (page2Users.length > 0) {
      expect(page2Users[0]!.uuid).toBe(expectedPage2Users[0]!.uuid);
    }
  });

  it('should paginate with a composite cursor across root and joined entities (DESC)', async () => {
    const pageSize = 3;
    const sortedUsers = sortUsersByProfileBioAndUuid(
      actualUsersFromDB,
      OrderDirection.DESC,
    );

    if (sortedUsers.length < pageSize) {
      throw new Error('Not enough test data for this scenario.');
    }

    const profileJoinPage1 = CriteriaFactory.GetLeftJoinCriteria(
      CriteriaUserProfileSchema,
    ).orderBy('bio', OrderDirection.DESC);
    const page1Criteria = CriteriaFactory.GetCriteria(CriteriaUserSchema)
      .join('profile', profileJoinPage1)
      .orderBy('uuid', OrderDirection.DESC)
      .setTake(pageSize);

    const page1Users = await translateAndFetch<User>(page1Criteria, UserEntity);

    expect(page1Users.length).toBe(pageSize);
    page1Users.forEach((user, index) => {
      expect(user.uuid).toBe(sortedUsers[index]!.uuid);
    });
    const lastUserOfPage1 = page1Users[page1Users.length - 1]!;

    const profileJoinPage2 = CriteriaFactory.GetLeftJoinCriteria(
      CriteriaUserProfileSchema,
    )
      .setCursor(
        [{ field: 'bio', value: lastUserOfPage1.profile?.bio ?? null }],
        FilterOperator.LESS_THAN,
        OrderDirection.DESC,
      )
      .orderBy('bio', OrderDirection.DESC);
    const page2Criteria = CriteriaFactory.GetCriteria(CriteriaUserSchema)
      .join('profile', profileJoinPage2)
      .setCursor(
        [{ field: 'uuid', value: lastUserOfPage1.uuid }],
        FilterOperator.LESS_THAN,
        OrderDirection.DESC,
      )
      .orderBy('uuid', OrderDirection.DESC)
      .setTake(pageSize);

    const page2Users = await translateAndFetch<User>(page2Criteria, UserEntity);

    const expectedPage2Users = sortedUsers.slice(pageSize, pageSize * 2);
    expect(page2Users.length).toBe(expectedPage2Users.length);
    if (page2Users.length > 0) {
      expect(page2Users[0]!.uuid).toBe(expectedPage2Users[0]!.uuid);
    }
  });

  it('should paginate with selected fields on both entities', async () => {
    const pageSize = 2;
    const sortedUsers = sortUsersByUsernameAndUuid(
      actualUsersFromDB,
      OrderDirection.ASC,
    );

    if (sortedUsers.length < pageSize) {
      throw new Error('Not enough test data for this scenario.');
    }

    const profileJoinPage1 = CriteriaFactory.GetLeftJoinCriteria(
      CriteriaUserProfileSchema,
    ).setSelect(['bio']);
    const page1Criteria = CriteriaFactory.GetCriteria(CriteriaUserSchema)
      .setSelect(['email'])
      .join('profile', profileJoinPage1)
      .orderBy('username', OrderDirection.ASC)
      .orderBy('uuid', OrderDirection.ASC)
      .setTake(pageSize);

    const page1Users = await translateAndFetch<User>(page1Criteria, UserEntity);

    expect(page1Users.length).toBe(pageSize);
    const lastUserOfPage1 = page1Users[page1Users.length - 1]!;

    page1Users.forEach((user, index) => {
      const expectedUser = sortedUsers[index]!;
      expect(user.uuid).toBe(expectedUser.uuid);
      expect(user.username).toBe(expectedUser.username);
      expect(user.email).toBe(expectedUser.email);
      expect(user.created_at).toBeUndefined();
      if (expectedUser.profile) {
        expect(user.profile).toBeDefined();
        expect(user.profile!.bio).toBe(expectedUser.profile.bio);
        expect(user.profile!.preferences).toBeUndefined();
      }
    });

    const profileJoinPage2 = CriteriaFactory.GetLeftJoinCriteria(
      CriteriaUserProfileSchema,
    ).setSelect(['bio']);
    const page2Criteria = CriteriaFactory.GetCriteria(CriteriaUserSchema)
      .setSelect(['email'])
      .join('profile', profileJoinPage2)
      .setCursor(
        [
          { field: 'username', value: lastUserOfPage1.username },
          { field: 'uuid', value: lastUserOfPage1.uuid },
        ],
        FilterOperator.GREATER_THAN,
        OrderDirection.ASC,
      )
      .orderBy('username', OrderDirection.ASC)
      .orderBy('uuid', OrderDirection.ASC)
      .setTake(pageSize);

    const page2Users = await translateAndFetch<User>(page2Criteria, UserEntity);

    const expectedPage2Users = sortedUsers.slice(pageSize, pageSize * 2);
    expect(page2Users.length).toBe(expectedPage2Users.length);
    if (page2Users.length > 0) {
      const expectedUser = expectedPage2Users[0]!;
      const actualUser = page2Users[0]!;
      expect(actualUser.uuid).toBe(expectedUser.uuid);
      expect(actualUser.email).toBe(expectedUser.email);
      expect(actualUser.profile?.bio).toBe(expectedUser.profile?.bio);
    }
  });
});
