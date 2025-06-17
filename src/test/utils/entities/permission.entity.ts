import { EntitySchema } from 'typeorm';
import type { Permission } from '../../test/fake/fake-entities.js';
import { BaseColumnSchemaPart, BaseIndexUuidCreatedAt } from './entity-base.js';

export const PermissionEntity = new EntitySchema<Permission>({
  indices: BaseIndexUuidCreatedAt('permission'),
  name: 'Permission',
  tableName: 'permission',
  columns: {
    ...BaseColumnSchemaPart,
    name: {
      type: 'char',
      length: 100,
    },
  },
  relations: {
    users: {
      type: 'many-to-many',
      target: 'User',
      eager: false,
      cascade: false,
      joinTable: {
        name: 'permission_user',
        joinColumn: {
          name: 'permission_uuid',
          referencedColumnName: 'uuid',
        },
        inverseJoinColumn: {
          name: 'user_uuid',
          referencedColumnName: 'uuid',
        },
      },
    },
  },
});
