import { TypeOrmMysqlTranslator } from '../../../type-orm.mysql.translator.js';
import { type ObjectLiteral } from 'typeorm';
import { beforeEach, describe, expect, it, beforeAll } from 'vitest';
import {
  UserSchema as CriteriaUserSchema,
  PermissionSchema as CriteriaPermissionSchema,
  type Permission,
  type User,
} from '../../utils/fake-entities.js';
import { UserEntity } from '../../utils/entities/user.entity.js';
import { PermissionEntity } from '../../utils/entities/permission.entity.js';
import {
  initializeDataSourceService,
  TypeORMUtils,
} from '../../utils/type-orm.utils.js';
import {
  CriteriaFactory,
  FilterOperator,
  SelectType,
} from '@nulledexp/translatable-criteria';

describe('TypeOrmMysqlTranslator - Many-to-Many Relationships', () => {
  let translator: TypeOrmMysqlTranslator<ObjectLiteral>;
  let actualUsersFromDB: User[];
  let actualPermissionsFromDB: Permission[];

  beforeAll(async () => {
    const dataSource = await initializeDataSourceService(false);
    actualUsersFromDB = await dataSource
      .getRepository(UserEntity)
      .find({ relations: ['permissions'] });
    actualPermissionsFromDB = await dataSource
      .getRepository(PermissionEntity)
      .find({ relations: ['users'] });
  });

  beforeEach(() => {
    translator = new TypeOrmMysqlTranslator();
  });

  it('should fetch users with their permissions (many-to-many)', async () => {
    const targetUserFromDB = actualUsersFromDB.find(
      (u) =>
        u.username === 'user_1' && u.permissions && u.permissions.length > 0,
    );
    if (!targetUserFromDB) {
      throw new Error(
        'Test data issue: User "user_1" with permissions not found in DB.',
      );
    }
    const innerJoinPermissionCriteria = CriteriaFactory.GetInnerJoinCriteria(
      CriteriaPermissionSchema,
    );
    const criteria = CriteriaFactory.GetCriteria(CriteriaUserSchema)
      .where({
        field: 'uuid',
        operator: FilterOperator.EQUALS,
        value: targetUserFromDB.uuid,
      })
      .join('permissions', innerJoinPermissionCriteria);

    const qb = await TypeORMUtils.getQueryBuilderFor<User>(
      UserEntity,
      criteria.alias,
    );
    translator.translate(criteria, qb);
    const fetchedUsers = await qb.getMany();

    expect(fetchedUsers).toHaveLength(1);
    const fetchedUser = fetchedUsers[0]!;
    expect(fetchedUser.uuid).toBe(targetUserFromDB.uuid);
    expect(fetchedUser.permissions).toBeDefined();
    expect(fetchedUser.permissions).toHaveLength(
      targetUserFromDB.permissions.length,
    );

    targetUserFromDB.permissions.forEach((expectedPerm) => {
      const actualPerm = fetchedUser.permissions.find(
        (p: Permission) => p.uuid === expectedPerm.uuid,
      );
      expect(
        actualPerm,
        `Permission ${expectedPerm.uuid} not found on fetched user`,
      ).toBeDefined();
      if (actualPerm) {
        expect(actualPerm.name).toBe(expectedPerm.name);
      }
    });
  });

  it('should fetch permissions with their users (many-to-many) and filter on joined entity', async () => {
    const targetPermissionName = 'permission_name_1';
    const targetPermissionFromDB = actualPermissionsFromDB.find(
      (p) => p.name === targetPermissionName && p.users && p.users.length > 0,
    );

    if (
      !targetPermissionFromDB ||
      !targetPermissionFromDB.users ||
      targetPermissionFromDB.users.length === 0
    ) {
      throw new Error(
        `Test data issue: Permission '${targetPermissionName}' with associated users not found in DB.`,
      );
    }
    const expectedUserFromJoin = targetPermissionFromDB.users[0]!;

    const criteria = CriteriaFactory.GetCriteria(CriteriaPermissionSchema)
      .where({
        field: 'uuid',
        operator: FilterOperator.EQUALS,
        value: targetPermissionFromDB.uuid,
      })
      .join(
        'users',
        CriteriaFactory.GetInnerJoinCriteria(CriteriaUserSchema).where({
          field: 'username',
          operator: FilterOperator.EQUALS,
          value: expectedUserFromJoin.username,
        }),
        { select: SelectType.FULL_ENTITY },
      );

    const qb = await TypeORMUtils.getQueryBuilderFor<Permission>(
      PermissionEntity,
      criteria.alias,
    );
    translator.translate(criteria, qb);
    const fetchedPermissions = await qb.getMany();

    expect(fetchedPermissions).toHaveLength(1);
    const fetchedPermission = fetchedPermissions[0]!;
    expect(fetchedPermission.uuid).toBe(targetPermissionFromDB.uuid);
    expect(fetchedPermission.users).toBeDefined();
    expect(fetchedPermission.users).toHaveLength(1);
    if (fetchedPermission.users && fetchedPermission.users.length > 0) {
      expect(fetchedPermission.users[0]!.uuid).toBe(expectedUserFromJoin.uuid);
      expect(fetchedPermission.users[0]!.username).toBe(
        expectedUserFromJoin.username,
      );
    }
  });
});
