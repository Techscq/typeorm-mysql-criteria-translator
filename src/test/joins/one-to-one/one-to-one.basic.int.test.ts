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
  SelectType,
} from '@nulledexp/translatable-criteria';
import {
  initializeDataSourceService,
  TypeORMUtils,
} from '../../utils/type-orm.utils.js';
import { UserEntity } from '../../utils/entities/user.entity.js';
import { UserProfileEntity } from '../../utils/entities/user-profile.entity.js';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

describe('TypeOrmMysqlTranslator - Basic One-to-One Joins', () => {
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

  it('should fetch a User with their UserProfile using a JOIN', async () => {
    const targetUserWithProfile = actualUsersFromDB.find(
      (u) => u.profile !== null && u.profile !== undefined,
    );

    if (!targetUserWithProfile || !targetUserWithProfile.profile) {
      throw new Error(
        'Test data issue: No user with an associated profile found in actualUsersFromDB. Ensure fake data includes this.',
      );
    }

    const profileJoinCriteria = CriteriaFactory.GetInnerJoinCriteria(
      CriteriaUserProfileSchema,
    );

    const rootCriteria = CriteriaFactory.GetCriteria(CriteriaUserSchema)
      .where({
        field: 'uuid',
        operator: FilterOperator.EQUALS,
        value: targetUserWithProfile.uuid,
      })
      .join('profile', profileJoinCriteria);

    const fetchedUser = await translateAndFetch<User>(
      rootCriteria,
      UserEntity,
      'getOne',
    );

    expect(fetchedUser).not.toBeNull();
    expect(fetchedUser!.uuid).toBe(targetUserWithProfile.uuid);
    expect(fetchedUser!.profile).toBeDefined();
    expect(fetchedUser!.profile).not.toBeNull();

    if (fetchedUser!.profile) {
      expect(fetchedUser!.profile.uuid).toBe(
        targetUserWithProfile.profile.uuid,
      );
      expect(fetchedUser!.profile.bio).toBe(targetUserWithProfile.profile.bio);
    }
  });

  it('should fetch a UserProfile with its User using a JOIN (inverse)', async () => {
    const targetUserProfileWithUser = actualUserProfilesFromDB.find(
      (up) => up.user !== null && up.user !== undefined,
    );

    if (!targetUserProfileWithUser || !targetUserProfileWithUser.user) {
      throw new Error(
        'Test data issue: No UserProfile with an associated User found. Ensure fake data includes this.',
      );
    }

    const userJoinCriteria =
      CriteriaFactory.GetInnerJoinCriteria(CriteriaUserSchema);

    const rootCriteria = CriteriaFactory.GetCriteria(CriteriaUserProfileSchema)
      .where({
        field: 'uuid',
        operator: FilterOperator.EQUALS,
        value: targetUserProfileWithUser.uuid,
      })
      .join('user', userJoinCriteria, { select: SelectType.FULL_ENTITY });

    const fetchedProfile = await translateAndFetch<UserProfile>(
      rootCriteria,
      UserProfileEntity,
      'getOne',
    );

    expect(fetchedProfile).not.toBeNull();
    expect(fetchedProfile!.uuid).toBe(targetUserProfileWithUser.uuid);
    expect(fetchedProfile!.user).toBeDefined();
    expect(fetchedProfile!.user).not.toBeNull();
    if (fetchedProfile!.user) {
      expect(fetchedProfile!.user.uuid).toBe(
        targetUserProfileWithUser.user.uuid,
      );
      expect(fetchedProfile!.user.username).toBe(
        targetUserProfileWithUser.user.username,
      );
    }
  });

  it('should fetch all Users with their UserProfile using LEFT JOIN, handling users without profiles', async () => {
    const profileLeftJoinCriteria = CriteriaFactory.GetLeftJoinCriteria(
      CriteriaUserProfileSchema,
    );

    const rootCriteria = CriteriaFactory.GetCriteria(CriteriaUserSchema).join(
      'profile',
      profileLeftJoinCriteria,
    );

    const fetchedUsers = await translateAndFetch<User>(
      rootCriteria,
      UserEntity,
      'getMany',
    );
    expect(fetchedUsers.length).toBe(actualUsersFromDB.length);

    fetchedUsers.forEach((fetchedUser) => {
      const correspondingActualUser = actualUsersFromDB.find(
        (u) => u.uuid === fetchedUser.uuid,
      );
      expect(correspondingActualUser).toBeDefined();

      if (correspondingActualUser!.profile) {
        expect(fetchedUser.profile).toBeDefined();
        expect(fetchedUser.profile).not.toBeNull();
        expect(fetchedUser.profile!.uuid).toBe(
          correspondingActualUser!.profile.uuid,
        );
        expect(fetchedUser.profile!.bio).toBe(
          correspondingActualUser!.profile.bio,
        );
      } else {
        expect(fetchedUser.profile).toBeNull();
      }
    });
  });
});
