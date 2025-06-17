import type { DomainEvent } from '../../test/fake/fake-entities.js';
import { EntitySchema } from 'typeorm';

export const EventEntitySchema = new EntitySchema<DomainEvent<any>>({
  name: 'Event',
  tableName: 'event',
  columns: {
    id: {
      type: 'int',
      generated: true,
      primary: true,
    },
    event_type: {
      type: 'char',
      length: 200,
    },
    event_body: {
      type: 'json',
    },
    occurred_on: {
      type: 'timestamp',
      createDate: true,
    },
    event_version: {
      type: 'int',
      default: 1,
    },
    direct_tags: {
      type: 'json',
      nullable: true,
    },
  },
});
