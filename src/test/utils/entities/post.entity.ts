import { EntitySchema } from 'typeorm';

import { BaseColumnSchemaPart, BaseIndexUuidCreatedAt } from './entity-base.js';
import type { Post } from '../fake-entities.js';

export const PostEntity = new EntitySchema<Post>({
  indices: BaseIndexUuidCreatedAt('post'),
  name: 'Post',
  tableName: 'post',
  columns: {
    ...BaseColumnSchemaPart,
    body: { type: 'text' },
    title: { type: 'varchar', length: '400' },
    metadata: { type: 'json', nullable: true },
    categories: { type: 'simple-array', nullable: true },
  },
  relations: {
    publisher: {
      type: 'many-to-one',
      target: 'User',
      joinColumn: {
        name: 'user_uuid',
        referencedColumnName: 'uuid',
      },
      eager: false,
      cascade: false,
    },
    comments: {
      type: 'one-to-many',
      target: 'PostComment',
      inverseSide: 'post',
      cascade: false,
      eager: false,
    },
  },
});
