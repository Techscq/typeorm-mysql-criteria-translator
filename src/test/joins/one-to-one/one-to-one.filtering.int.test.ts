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
} from '../../utils/fake-entities.js';
import {
  CriteriaFactory,
  FilterOperator,
  type RootCriteria,
} from '@nulledexp/translatable-criteria';
import {
  initializeDataSourceService,
  TypeORMUtils,
} from '../../utils/type-orm.utils.js';
import { UserEntity } from '../../utils/entities/user.entity.js';
import { UserProfileEntity } from '../../utils/entities/user-profile.entity.js';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

describe('TypeOrmMysqlTranslator - Filtering with One-to-One Joins', () => {
  let translator: TypeOrmMysqlTranslator<ObjectLiteral>;
  let actualUsersFromDB: User[];
  let actualUserProfilesFromDB: UserProfile[];

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
    actualUsersFromDB = await dataSource
      .getRepository(UserEntity)
      .find({ relations: ['profile'] });
    actualUserProfilesFromDB = await dataSource
      .getRepository(UserProfileEntity)
      .find({ relations: ['user'] });
  });

  beforeEach(() => {
    translator = new TypeOrmMysqlTranslator();
  });

  it('should fetch Users filtered by a field in their UserProfile', async () => {
    const bioSearchTerm = 'Bio for user_2';

    const expectedUsers = actualUsersFromDB.filter((u) =>
      u.profile?.bio?.includes(bioSearchTerm),
    );

    if (expectedUsers.length === 0) {
      throw new Error(
        `Test data issue: No users found whose profile bio contains "${bioSearchTerm}". Ensure fake data includes this.`,
      );
    }

    const profileJoinCriteria = CriteriaFactory.GetInnerJoinCriteria(
      CriteriaUserProfileSchema,
    ).where({
      field: 'bio',
      operator: FilterOperator.CONTAINS,
      value: bioSearchTerm,
    });

    const rootCriteria = CriteriaFactory.GetCriteria(CriteriaUserSchema).join(
      'profile',
      profileJoinCriteria,
    );

    const fetchedUsers = await translateAndFetch<User>(
      rootCriteria,
      UserEntity,
      'getMany',
    );

    expect(fetchedUsers.length).toBe(expectedUsers.length);
    fetchedUsers.forEach((fetchedUser) => {
      const correspondingExpectedUser = expectedUsers.find(
        (u) => u.uuid === fetchedUser.uuid,
      );
      expect(correspondingExpectedUser).toBeDefined();
    });
  });

  it('should fetch UserProfiles filtered by a field in their User (inverse)', async () => {
    const usernameSearchTerm = 'user_1';
    const expectedProfiles = actualUserProfilesFromDB.filter(
      (up) => up.user?.username === usernameSearchTerm,
    );

    if (expectedProfiles.length === 0) {
      throw new Error(
        `Test data issue: No profiles found for user "${usernameSearchTerm}". Ensure fake data includes this.`,
      );
    }

    const userJoinCriteria = CriteriaFactory.GetInnerJoinCriteria(
      CriteriaUserSchema,
    ).where({
      field: 'username',
      operator: FilterOperator.EQUALS,
      value: usernameSearchTerm,
    });

    const rootCriteria = CriteriaFactory.GetCriteria(
      CriteriaUserProfileSchema,
    ).join('user', userJoinCriteria);

    const fetchedProfiles = await translateAndFetch<UserProfile>(
      rootCriteria,
      UserProfileEntity,
      'getMany',
    );

    expect(fetchedProfiles.length).toBe(expectedProfiles.length);
    fetchedProfiles.forEach((fetchedProfile) => {
      const correspondingExpectedProfile = expectedProfiles.find(
        (up) => up.uuid === fetchedProfile.uuid,
      );
      expect(correspondingExpectedProfile).toBeDefined();
    });
  });

  it('should fetch Users filtered by fields in both the root and joined entities', async () => {
    const usernameSearchTerm = 'user_3';
    const bioSearchTerm = 'Bio for user_3';

    const expectedUsers = actualUsersFromDB.filter(
      (u) =>
        u.username.includes(usernameSearchTerm) &&
        u.profile?.bio?.includes(bioSearchTerm),
    );

    if (expectedUsers.length === 0) {
      throw new Error(
        'Test data issue: No user found matching both root and joined filter criteria. Ensure fake data includes this.',
      );
    }

    const profileJoinCriteria = CriteriaFactory.GetInnerJoinCriteria(
      CriteriaUserProfileSchema,
    ).where({
      field: 'bio',
      operator: FilterOperator.CONTAINS,
      value: bioSearchTerm,
    });

    const rootCriteria = CriteriaFactory.GetCriteria(CriteriaUserSchema)
      .where({
        field: 'username',
        operator: FilterOperator.CONTAINS,
        value: usernameSearchTerm,
      })
      .join('profile', profileJoinCriteria);

    const fetchedUsers = await translateAndFetch<User>(
      rootCriteria,
      UserEntity,
      'getMany',
    );

    expect(fetchedUsers.length).toBe(expectedUsers.length);
    expect(fetchedUsers[0]!.uuid).toBe(expectedUsers[0]!.uuid);
    expect(fetchedUsers[0]!.profile).toBeDefined();
    expect(fetchedUsers[0]!.profile!.bio).toContain(bioSearchTerm);
  });
});
