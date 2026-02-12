import { EntitySchema } from 'typeorm';
import { BaseColumnSchemaPart, BaseIndexUuidCreatedAt } from './entity-base.js';
import type { Address } from '../fake-entities.js';

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
    user_uuid: {
      type: 'uuid',
    },
  },
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
