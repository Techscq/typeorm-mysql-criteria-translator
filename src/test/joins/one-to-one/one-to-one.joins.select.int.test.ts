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

  it('should fetch a User with specific fields from User and UserProfile using INNER JOIN and setSelect', async () => {
    const targetUserWithProfile = actualUsersFromDB.find(
      (u) => u.profile !== null && u.profile !== undefined,
    );

    if (!targetUserWithProfile || !targetUserWithProfile.profile) {
      throw new Error(
        'Test data issue: No user with an associated profile found for setSelect test.',
      );
    }

    const rootCriteria = CriteriaFactory.GetCriteria(CriteriaUserSchema)
      .where({
        field: 'uuid',
        operator: FilterOperator.EQUALS,
        value: targetUserWithProfile.uuid,
      })
      .setSelect(['username', 'uuid'])
      .join(
        'profile',
        CriteriaFactory.GetInnerJoinCriteria(
          CriteriaUserProfileSchema,
        ).setSelect(['bio', 'uuid']),
        {
          parent_field: 'uuid',
          join_field: 'user_uuid',
        },
      );

    const fetchedUsers = await translateAndFetch<User>(
      rootCriteria,
      UserEntity,
    );

    expect(fetchedUsers.length).toBe(1);
    const fetchedUser = fetchedUsers[0]!;

    expect(fetchedUser.uuid).toBe(targetUserWithProfile.uuid);
    expect(fetchedUser.username).toBe(targetUserWithProfile.username);
    expect(fetchedUser.email).toBeUndefined();
    expect(fetchedUser.created_at).toBeUndefined();
    expect(fetchedUser.profile).toBeDefined();
    if (fetchedUser.profile) {
      expect(fetchedUser.profile.uuid).toBe(
        targetUserWithProfile.profile.uuid,
      );
      expect(fetchedUser.profile.bio).toBe(targetUserWithProfile.profile.bio);
      expect(fetchedUser.profile.preferences).toBeUndefined();
    }
  });

  it('should fetch a UserProfile with specific fields from UserProfile and User using INNER JOIN and setSelect (inverse)', async () => {
    const targetUserProfileWithUser = actualUserProfilesFromDB.find(
      (up) => up.user !== null && up.user !== undefined,
    );

    if (!targetUserProfileWithUser || !targetUserProfileWithUser.user) {
      throw new Error(
        'Test data issue: No UserProfile with an associated User found for inverse setSelect test.',
      );
    }

    const rootCriteria = CriteriaFactory.GetCriteria(CriteriaUserProfileSchema)
      .where({
        field: 'uuid',
        operator: FilterOperator.EQUALS,
        value: targetUserProfileWithUser.uuid,
      })
      .setSelect(['bio', 'uuid'])
      .join(
        'user',
        CriteriaFactory.GetInnerJoinCriteria(CriteriaUserSchema).setSelect([
          'email',
          'uuid',
        ]),
        {
          parent_field: 'user_uuid',
          join_field: 'uuid',
        },
      );

    const fetchedProfiles = await translateAndFetch<UserProfile>(
      rootCriteria,
      UserProfileEntity,
    );
    expect(fetchedProfiles.length).toBe(1);
    const fetchedProfile = fetchedProfiles[0]!;

    expect(fetchedProfile.uuid).toBe(targetUserProfileWithUser.uuid);
    expect(fetchedProfile.bio).toBe(targetUserProfileWithUser.bio);
    expect(fetchedProfile.preferences).toBeUndefined();

    expect(fetchedProfile.user).toBeDefined();
    if (fetchedProfile.user) {
      expect(fetchedProfile.user.uuid).toBe(
        targetUserProfileWithUser.user.uuid,
      );
      expect(fetchedProfile.user.email).toBe(
        targetUserProfileWithUser.user.email,
      );
      expect(fetchedProfile.user.username).toBeUndefined();
    }
  });

  it('should fetch all Users with specific fields from User and UserProfile using LEFT JOIN and setSelect', async () => {
    const rootCriteria = CriteriaFactory.GetCriteria(CriteriaUserSchema)
      .setSelect(['username', 'uuid'])
      .join(
        'profile',
        CriteriaFactory.GetLeftJoinCriteria(
          CriteriaUserProfileSchema,
        ).setSelect(['bio', 'uuid']),
        {
          parent_field: 'uuid',
          join_field: 'user_uuid',
        },
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

      expect(fetchedUser.uuid).toBe(correspondingActualUser!.uuid);
      expect(fetchedUser.username).toBe(correspondingActualUser!.username);
      expect(fetchedUser.email).toBeUndefined();
      expect(fetchedUser.created_at).toBeUndefined();

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
          expect(fetchedUser.profile.preferences).toBeUndefined();
          expect(fetchedUser.profile.created_at).toBeUndefined();
        }
      } else {
        expect(fetchedUser.profile).toBeNull();
      }
    });
  });
});