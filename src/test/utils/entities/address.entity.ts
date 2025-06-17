import { EntitySchema } from 'typeorm';
import { BaseColumnSchemaPart, BaseIndexUuidCreatedAt } from './entity-base.js';
import type { Address } from '../../test/fake/fake-entities.js';

export const AddressEntity = new EntitySchema<Address>({
  indices: BaseIndexUuidCreatedAt('address'),
  name: 'Address',
  tableName: 'address',
  columns: {
    ...BaseColumnSchemaPart,
    direction: {
      type: 'varchar',
      length: 400,
    },
  },
  // relationIds: { user: { relationName: 'user', alias: 'user' } },
  relations: {
    user: {
      joinColumn: {
        name: 'user_uuid',
        referencedColumnName: 'uuid',
      },
      type: 'many-to-one',
      target: 'User',
      eager: false,
      cascade: false,
    },
  },
});
