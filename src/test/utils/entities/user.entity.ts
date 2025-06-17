import { EntitySchema } from 'typeorm';
import type { User } from '../../test/fake/fake-entities.js';
import { BaseColumnSchemaPart, BaseIndexUuidCreatedAt } from './entity-base.js';

export const UserEntity = new EntitySchema<User>({
  indices: BaseIndexUuidCreatedAt('user'),
  name: 'User',
  tableName: 'user',
  columns: {
    ...BaseColumnSchemaPart,
    email: {
      type: 'char',
      length: 100,
    },
    username: {
      type: 'varchar',
      length: 60,
    },
  },
  relations: {
    addresses: {
      inverseSide: 'user',
      type: 'one-to-many',
      target: 'Address',
      eager: false,
      cascade: false,
    },
    permissions: {
      type: 'many-to-many',
      target: 'Permission',
      eager: false,
      cascade: false,
      joinTable: {
        name: 'permission_user',
        joinColumn: {
          name: 'user_uuid',
          referencedColumnName: 'uuid',
        },
        inverseJoinColumn: {
          name: 'permission_uuid',
          referencedColumnName: 'uuid',
        },
      },
    },
    posts: {
      inverseSide: 'publisher',
      type: 'one-to-many',
      target: 'Post',
      eager: false,
      cascade: false,
    },
  },
});
