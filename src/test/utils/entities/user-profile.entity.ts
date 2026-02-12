import { EntitySchema } from 'typeorm';
import type { UserProfile } from '../fake-entities.js';
import { BaseColumnSchemaPart, BaseIndexUuidCreatedAt } from './entity-base.js';

export const UserProfileEntity = new EntitySchema<UserProfile>({
  name: 'UserProfile',
  tableName: 'user_profile',
  indices: BaseIndexUuidCreatedAt('user_profile'),
  columns: {
    ...BaseColumnSchemaPart,
    bio: {
      type: 'text',
      nullable: true,
    },
    preferences: {
      type: 'json',
      nullable: true,
    },
    user_uuid: {
      type: 'uuid',
    },
  },
  relations: {
    user: {
      type: 'one-to-one',
      target: 'User',
      inverseSide: 'profile',
      joinColumn: {
        name: 'user_uuid',
        referencedColumnName: 'uuid',
      },
      onDelete: 'CASCADE',
      eager: false,
      nullable: false,
    },
  },
});
