import {
  type EntitySchema,
  type ObjectLiteral,
  type SelectQueryBuilder,
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
  OrderDirection,
  type RootCriteria,
} from '@nulledexp/translatable-criteria';
import {
  initializeDataSourceService,
  TypeORMUtils,
} from '../../utils/type-orm.utils.js';
import { UserEntity } from '../../utils/entities/user.entity.js';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

const sortUsersByUsername = (users: User[]): User[] => {
  return [...users].sort((a, b) => a.username.localeCompare(b.username));
};

const sortUsersByProfileBio = (users: User[]): User[] => {
  return [...users].sort((a, b) =>
    (a.profile?.bio ?? '').localeCompare(b.profile?.bio ?? ''),
  );
};

const sortUsersByProfileBioAndUuid = (users: User[]): User[] => {
  return [...users].sort((a, b) => {
    const bioA = a.profile?.bio ?? '';
    const bioB = b.profile?.bio ?? '';
    if (bioA !== bioB) {
      return bioA.localeCompare(bioB);
    }
    return a.uuid.localeCompare(b.uuid);
  });
};

describe('TypeOrmMysqlTranslator - Skip/Take Pagination with One-to-One Joins', () => {
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

  it('should fetch Users with their UserProfile using INNER JOIN, with take, skip, and orderBy on User field', async () => {
    const take = 2;
    const skip = 1;

    const usersWithProfiles = actualUsersFromDB.filter((u) => u.profile);
    const sortedUsers = sortUsersByUsername(usersWithProfiles);

    if (sortedUsers.length < skip + take) {
      throw new Error('Not enough test data for this scenario.');
    }

    const criteria = CriteriaFactory.GetCriteria(CriteriaUserSchema)
      .join(
        'profile',
        CriteriaFactory.GetInnerJoinCriteria(CriteriaUserProfileSchema),
        {
          parent_field: 'uuid',
          join_field: 'user_uuid',
        },
      )
      .orderBy('username', OrderDirection.ASC)
      .setTake(take)
      .setSkip(skip);

    const fetchedUsers = await translateAndFetch<User>(criteria, UserEntity);

    expect(fetchedUsers.length).toBe(take);

    const expectedUsersSlice = sortedUsers.slice(skip, skip + take);
    fetchedUsers.forEach((fetchedUser, index) => {
      const expectedUser = expectedUsersSlice[index]!;
      expect(fetchedUser.uuid).toBe(expectedUser.uuid);
      expect(fetchedUser.username).toBe(expectedUser.username);
      expect(fetchedUser.profile).toBeDefined();
      expect(fetchedUser.profile?.uuid).toBe(expectedUser.profile!.uuid);
    });
  });

  it('should fetch Users with their UserProfile using INNER JOIN, with take, skip, and orderBy on UserProfile field', async () => {
    const take = 2;
    const skip = 1;

    const usersWithProfiles = actualUsersFromDB.filter((u) => u.profile);
    const sortedUsers = sortUsersByProfileBio(usersWithProfiles);

    if (sortedUsers.length < skip + take) {
      throw new Error('Not enough test data for this scenario.');
    }

    const criteria = CriteriaFactory.GetCriteria(CriteriaUserSchema)
      .join(
        'profile',
        CriteriaFactory.GetInnerJoinCriteria(CriteriaUserProfileSchema).orderBy(
          'bio',
          OrderDirection.ASC,
        ),
        {
          parent_field: 'uuid',
          join_field: 'user_uuid',
        },
      )
      .setTake(take)
      .setSkip(skip);

    const fetchedUsers = await translateAndFetch<User>(criteria, UserEntity);

    expect(fetchedUsers.length).toBe(take);

    const expectedUsersSlice = sortedUsers.slice(skip, skip + take);
    fetchedUsers.forEach((fetchedUser, index) => {
      const expectedUser = expectedUsersSlice[index]!;
      expect(fetchedUser.uuid).toBe(expectedUser.uuid);
      expect(fetchedUser.profile).toBeDefined();
      expect(fetchedUser.profile?.bio).toBe(expectedUser.profile!.bio);
    });
  });

  it('should fetch Users with their UserProfile using LEFT JOIN, with take, skip, and orderBy on User field', async () => {
    const take = 3;
    const skip = 2;

    const sortedUsers = sortUsersByUsername(actualUsersFromDB);

    if (sortedUsers.length <= skip) {
      throw new Error('Not enough test data for this scenario.');
    }

    const criteria = CriteriaFactory.GetCriteria(CriteriaUserSchema)
      .join(
        'profile',
        CriteriaFactory.GetLeftJoinCriteria(CriteriaUserProfileSchema),
        {
          parent_field: 'uuid',
          join_field: 'user_uuid',
        },
      )
      .orderBy('username', OrderDirection.ASC)
      .setTake(take)
      .setSkip(skip);

    const fetchedUsers = await translateAndFetch<User>(criteria, UserEntity);

    const expectedUsersSlice = sortedUsers.slice(skip, skip + take);
    expect(fetchedUsers.length).toBe(expectedUsersSlice.length);

    fetchedUsers.forEach((fetchedUser, index) => {
      const expectedUser = expectedUsersSlice[index]!;
      expect(fetchedUser.uuid).toBe(expectedUser.uuid);
      expect(fetchedUser.username).toBe(expectedUser.username);

      if (expectedUser.profile) {
        expect(fetchedUser.profile).toBeDefined();
        expect(fetchedUser.profile).not.toBeNull();
        expect(fetchedUser.profile?.uuid).toBe(expectedUser.profile.uuid);
      } else {
        expect(fetchedUser.profile).toBeNull();
      }
    });
  });

  it('should fetch Users with their UserProfile using LEFT JOIN, with take, skip, and orderBy on UserProfile field', async () => {
    const take = 3;
    const skip = 1;

    const sortedUsers = sortUsersByProfileBioAndUuid(actualUsersFromDB);

    if (sortedUsers.length <= skip) {
      throw new Error('Not enough test data for this scenario.');
    }

    const criteria = CriteriaFactory.GetCriteria(CriteriaUserSchema)
      .join(
        'profile',
        CriteriaFactory.GetLeftJoinCriteria(CriteriaUserProfileSchema).orderBy(
          'bio',
          OrderDirection.ASC,
        ),
        {
          parent_field: 'uuid',
          join_field: 'user_uuid',
        },
      )
      .orderBy('uuid', OrderDirection.ASC)
      .setTake(take)
      .setSkip(skip);

    const fetchedUsers = await translateAndFetch<User>(criteria, UserEntity);

    const expectedUsersSlice = sortedUsers.slice(skip, skip + take);
    expect(fetchedUsers.length).toBe(expectedUsersSlice.length);

    fetchedUsers.forEach((fetchedUser, index) => {
      const expectedUser = expectedUsersSlice[index]!;
      expect(fetchedUser.uuid).toBe(expectedUser.uuid);

      if (expectedUser.profile) {
        expect(fetchedUser.profile).toBeDefined();
        expect(fetchedUser.profile).not.toBeNull();
        expect(fetchedUser.profile?.bio).toBe(expectedUser.profile.bio);
      } else {
        expect(fetchedUser.profile).toBeNull();
      }
    });
  });
});