import { EntitySchemaOptions } from 'typeorm';
import type { EntityBase } from '../fake-entities.js';

export const BaseIndexUuidCreatedAt = (
  tableName: string,
): Required<EntitySchemaOptions<unknown>['indices']> => {
  return [
    {
      name: `idx_${tableName}_uuid_created_at`,
      columns: ['created_at', 'uuid'],
    },
  ];
};
export const BaseColumnSchemaPart: Required<
  EntitySchemaOptions<EntityBase>['columns']
> = {
  uuid: {
    primary: true,
    type: 'uuid',
  },
  created_at: {
    name: 'created_at',
    type: 'timestamp',
    createDate: true,
  },
};
