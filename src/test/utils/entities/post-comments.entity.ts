import { EntitySchema } from 'typeorm';
import type { Comment } from '../fake-entities.js';
import { BaseColumnSchemaPart, BaseIndexUuidCreatedAt } from './entity-base.js';

export const PostCommentEntity = new EntitySchema<Comment>({
  indices: BaseIndexUuidCreatedAt('post_comment'),
  name: 'PostComment',
  tableName: 'post_comment',
  columns: {
    ...BaseColumnSchemaPart,
    comment_text: { type: 'varchar', length: '400' },
  },
  relations: {
    user: {
      type: 'many-to-one',
      target: 'User',
      joinColumn: { name: 'user_uuid', referencedColumnName: 'uuid' },
      cascade: false,
      eager: false,
    },
    post: {
      type: 'many-to-one',
      target: 'Post',
      joinColumn: { name: 'post_uuid', referencedColumnName: 'uuid' },
      cascade: false,
      eager: false,
    },
  },
});
