import { TypeOrmMysqlTranslator } from '../type-orm.mysql.translator.js';
import { type ObjectLiteral } from 'typeorm';
import { beforeEach, describe, expect, it, beforeAll } from 'vitest';
import {
  UserSchema as CriteriaUserSchema,
  PermissionSchema as CriteriaPermissionSchema,
  type Permission,
  type User,
} from './utils/fake-entities.js';
import { UserEntity } from './utils/entities/user.entity.js';
import { PermissionEntity } from './utils/entities/permission.entity.js';
import {
  initializeDataSourceService,
  TypeORMUtils,
} from './utils/type-orm.utils.js';
import {
  CriteriaFactory,
  FilterOperator,
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
    const userAlias = CriteriaUserSchema.alias[0]; // 'users'
    const permissionAlias = CriteriaPermissionSchema.alias[0]; // 'permissions'

    const targetUserFromDB = actualUsersFromDB.find(
      (u) =>
        u.username === 'user_1' && u.permissions && u.permissions.length > 0,
    );
    if (!targetUserFromDB) {
      throw new Error(
        'Test data issue: User "user_1" with permissions not found in DB.',
      );
    }

    const criteria = CriteriaFactory.GetCriteria(CriteriaUserSchema, userAlias)
      .where({
        field: 'uuid',
        operator: FilterOperator.EQUALS,
        value: targetUserFromDB.uuid,
      })
      .join(
        CriteriaFactory.GetInnerJoinCriteria(
          CriteriaPermissionSchema,
          permissionAlias,
        ),
        {
          pivot_source_name: 'permission_user', // Nombre de la tabla pivote
          parent_field: { pivot_field: 'user_uuid', reference: 'uuid' },
          join_field: { pivot_field: 'permission_uuid', reference: 'uuid' },
        },
      );

    const qb = await TypeORMUtils.getQueryBuilderFor<User>(
      UserEntity,
      userAlias,
    );
    translator.translate(criteria, qb);
    const fetchedUsers = await qb.getMany();
    const sql = qb.getSql();

    // TypeORM genera un alias para la tabla pivote como `rootAlias_joinAlias`
    const pivotTableAlias = `${userAlias}_${permissionAlias}`;
    expect(sql).toContain(
      `INNER JOIN \`permission_user\` \`${pivotTableAlias}\``,
    );
    expect(sql).toContain(
      `ON \`${pivotTableAlias}\`.\`user_uuid\`=\`${userAlias}\`.\`uuid\``,
    );
    expect(sql).toContain(
      `INNER JOIN \`permission\` \`${permissionAlias}\` ON \`${permissionAlias}\`.\`uuid\`=\`${pivotTableAlias}\`.\`permission_uuid\``,
    );

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
    const permissionAlias = CriteriaPermissionSchema.alias[0]; // 'permissions'
    const userAlias = CriteriaUserSchema.alias[0]; // 'users'

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

    const criteria = CriteriaFactory.GetCriteria(
      CriteriaPermissionSchema,
      permissionAlias,
    )
      .where({
        field: 'uuid',
        operator: FilterOperator.EQUALS,
        value: targetPermissionFromDB.uuid,
      })
      .join(
        CriteriaFactory.GetInnerJoinCriteria(
          CriteriaUserSchema,
          userAlias,
        ).where({
          field: 'username',
          operator: FilterOperator.EQUALS,
          value: expectedUserFromJoin.username,
        }),
        {
          pivot_source_name: 'permission_user',
          parent_field: { pivot_field: 'permission_uuid', reference: 'uuid' },
          join_field: { pivot_field: 'user_uuid', reference: 'uuid' },
        },
      );

    const qb = await TypeORMUtils.getQueryBuilderFor<Permission>(
      PermissionEntity,
      permissionAlias,
    );
    translator.translate(criteria, qb);
    const fetchedPermissions = await qb.getMany();
    const sql = qb.getSql();

    const pivotTableAlias = `${permissionAlias}_${userAlias}`;
    expect(sql).toContain(
      `INNER JOIN \`permission_user\` \`${pivotTableAlias}\``,
    );
    expect(sql).toContain(
      `ON \`${pivotTableAlias}\`.\`permission_uuid\`=\`${permissionAlias}\`.\`uuid\``,
    );
    expect(sql).toContain(
      `INNER JOIN \`user\` \`${userAlias}\` ON \`${userAlias}\`.\`uuid\`=\`${pivotTableAlias}\`.\`user_uuid\``,
    );
    expect(sql).toContain(`AND (\`${userAlias}\`.\`username\` = ?)`); // Filtro en la entidad unida

    expect(fetchedPermissions).toHaveLength(1);
    const fetchedPermission = fetchedPermissions[0]!;
    expect(fetchedPermission.uuid).toBe(targetPermissionFromDB.uuid);
    expect(fetchedPermission.users).toBeDefined();
    expect(fetchedPermission.users).toHaveLength(1); // Solo el usuario filtrado

    if (fetchedPermission.users && fetchedPermission.users.length > 0) {
      expect(fetchedPermission.users[0]!.uuid).toBe(expectedUserFromJoin.uuid);
      expect(fetchedPermission.users[0]!.username).toBe(
        expectedUserFromJoin.username,
      );
    }
  });
});
