import type { EntitySchema, ObjectLiteral, SelectQueryBuilder } from 'typeorm';
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

describe('TypeOrmMysqlTranslator - Field Selection (setSelect) with One-to-One Joins', () => {
  let translator: TypeOrmMysqlTranslator<ObjectLiteral>;
  let actualUsersFromDB: User[];
  let actualUserProfilesFromDB: UserProfile[];

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
    actualUserProfilesFromDB = await dataSource
      .getRepository(UserProfileEntity)
      .find({ relations: ['user'] });
  });

  beforeEach(() => {
    translator = new TypeOrmMysqlTranslator();
  });

  it('should fetch a User with only the ID of the joined UserProfile using SelectType.ID_ONLY selection', async () => {
    const targetUserWithProfile = actualUsersFromDB.find(
      (u) => u.profile !== null && u.profile !== undefined,
    );

    if (!targetUserWithProfile || !targetUserWithProfile.profile) {
      throw new Error(
        'Test data issue: No user with an associated profile found for SelectType.ID_ONLY test.',
      );
    }

    const rootCriteria = CriteriaFactory.GetCriteria(CriteriaUserSchema)
      .where({
        field: 'uuid',
        operator: FilterOperator.EQUALS,
        value: targetUserWithProfile.uuid,
      })
      .join(
        'profile',
        CriteriaFactory.GetInnerJoinCriteria(CriteriaUserProfileSchema),
        { select: SelectType.ID_ONLY },
      );

    const fetchedUsers = await translateAndFetch<User>(
      rootCriteria,
      UserEntity,
    );

    expect(fetchedUsers.length).toBe(1);
    const fetchedUser = fetchedUsers[0]!;
    expect(fetchedUser.uuid).toBe(targetUserWithProfile.uuid);

    expect(fetchedUser.profile).toBeDefined();
    expect(typeof fetchedUser.profile).toBe('string');
    expect(fetchedUser.profile).toBe(targetUserWithProfile.profile.uuid);
  });

  it('should fetch a User without selecting any fields from UserProfile using SelectType.NO_SELECTION', async () => {
    const targetUserWithProfile = actualUsersFromDB.find(
      (u) => u.profile !== null && u.profile !== undefined,
    );

    if (!targetUserWithProfile) {
      throw new Error(
        'Test data issue: No user with an associated profile found for SelectType.NO_SELECTION test.',
      );
    }

    const rootCriteria = CriteriaFactory.GetCriteria(CriteriaUserSchema)
      .where({
        field: 'uuid',
        operator: FilterOperator.EQUALS,
        value: targetUserWithProfile.uuid,
      })
      .join(
        'profile',
        CriteriaFactory.GetInnerJoinCriteria(CriteriaUserProfileSchema),
        { select: SelectType.NO_SELECTION },
      );

    const fetchedUsers = await translateAndFetch<User>(
      rootCriteria,
      UserEntity,
    );

    expect(fetchedUsers.length).toBe(1);
    const fetchedUser = fetchedUsers[0]!;

    expect(fetchedUser.uuid).toBe(targetUserWithProfile.uuid);
    expect(fetchedUser.profile).toBeUndefined();
  });

  it('should fetch a User with all fields from UserProfile using SelectType.FULL_ENTITY selection (default)', async () => {
    const targetUserWithProfile = actualUsersFromDB.find(
      (u) => u.profile !== null && u.profile !== undefined,
    );

    if (!targetUserWithProfile || !targetUserWithProfile.profile) {
      throw new Error(
        'Test data issue: No user with an associated profile found for SelectType.FULL_ENTITY test.',
      );
    }

    const rootCriteria = CriteriaFactory.GetCriteria(CriteriaUserSchema)
      .where({
        field: 'uuid',
        operator: FilterOperator.EQUALS,
        value: targetUserWithProfile.uuid,
      })
      .join(
        'profile',
        CriteriaFactory.GetInnerJoinCriteria(CriteriaUserProfileSchema),
        { select: SelectType.FULL_ENTITY },
      );

    const fetchedUsers = await translateAndFetch<User>(
      rootCriteria,
      UserEntity,
    );

    expect(fetchedUsers.length).toBe(1);
    const fetchedUser = fetchedUsers[0]!;

    expect(fetchedUser.uuid).toBe(targetUserWithProfile.uuid);
    expect(fetchedUser.profile).toBeDefined();
    if (fetchedUser.profile) {
      expect(fetchedUser.profile.uuid).toBe(targetUserWithProfile.profile.uuid);
      expect(fetchedUser.profile.bio).toBe(targetUserWithProfile.profile.bio);
    }
  });

  it('should fetch all Users and their full profiles using LEFT JOIN with SelectType.FULL_ENTITY selection', async () => {
    const rootCriteria = CriteriaFactory.GetCriteria(CriteriaUserSchema).join(
      'profile',
      CriteriaFactory.GetLeftJoinCriteria(CriteriaUserProfileSchema),
      { select: SelectType.FULL_ENTITY },
    );

    const fetchedUsers = await translateAndFetch<User>(
      rootCriteria,
      UserEntity,
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
        if (fetchedUser.profile) {
          expect(fetchedUser.profile.uuid).toBe(
            correspondingActualUser!.profile.uuid,
          );
          expect(fetchedUser.profile.bio).toBe(
            correspondingActualUser!.profile.bio,
          );
        }
      } else {
        expect(fetchedUser.profile).toBeNull();
      }
    });
  });

  it('should fetch a UserProfile with only the ID of the joined User using SelectType.ID_ONLY selection', async () => {
    const targetProfileWithUser = actualUserProfilesFromDB.find(
      (p) => p.user !== null && p.user !== undefined,
    );

    if (!targetProfileWithUser || !targetProfileWithUser.user) {
      throw new Error(
        'Test data issue: No profile with an associated user found for SelectType.ID_ONLY test.',
      );
    }

    const rootCriteria = CriteriaFactory.GetCriteria(CriteriaUserProfileSchema)
      .where({
        field: 'uuid',
        operator: FilterOperator.EQUALS,
        value: targetProfileWithUser.uuid,
      })
      .join('user', CriteriaFactory.GetInnerJoinCriteria(CriteriaUserSchema), {
        select: SelectType.ID_ONLY,
      });

    const fetchedProfiles = await translateAndFetch<UserProfile>(
      rootCriteria,
      UserProfileEntity,
    );

    expect(fetchedProfiles.length).toBe(1);
    const fetchedProfile = fetchedProfiles[0]!;
    expect(fetchedProfile.uuid).toBe(targetProfileWithUser.uuid);

    expect(fetchedProfile.user).toBeDefined();
    expect(typeof fetchedProfile.user).toBe('string');
    expect(fetchedProfile.user).toBe(targetProfileWithUser.user.uuid);
  });
});
