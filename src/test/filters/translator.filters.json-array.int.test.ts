import {
  IsNull,
  Not,
  type ObjectLiteral,
  type SelectQueryBuilder,
  type EntitySchema,
} from 'typeorm';
import { TypeOrmMysqlTranslator } from '../../type-orm.mysql.translator.js';
import {
  initializeDataSourceService,
  TypeORMUtils,
} from '../utils/type-orm.utils.js';
import {
  PostSchema as CriteriaPostSchema,
  type Post,
  type DomainEvent,
  DomainEventsSchema,
  EventType,
} from '../utils/fake-entities.js';
import { PostEntity } from '../utils/entities/post.entity.js';
import { beforeEach, describe, expect, it, beforeAll } from 'vitest';
import { EventEntitySchema } from '../utils/entities/event.entity.js';
import {
  CriteriaFactory,
  FilterOperator,
  type RootCriteria,
} from '@nulledexp/translatable-criteria';

describe('TypeOrmMysqlTranslator - JSON/Array Operators', () => {
  let translator: TypeOrmMysqlTranslator<ObjectLiteral>;
  let actualDomainEventsFromDB: DomainEvent<any>[];
  let postsWithMetadataFromDB: Post[];

  async function translateAndGetQueryBuilder<E extends ObjectLiteral>(
    criteria: RootCriteria<any>,
    entitySchema: EntitySchema<E>,
  ): Promise<SelectQueryBuilder<E>> {
    const qb = await TypeORMUtils.getQueryBuilderFor<E>(
      entitySchema,
      criteria.alias,
    );
    translator.translate(criteria, qb as SelectQueryBuilder<ObjectLiteral>);
    return qb;
  }

  beforeAll(async () => {
    const dataSource = await initializeDataSourceService(false);
    actualDomainEventsFromDB = await dataSource
      .getRepository(EventEntitySchema)
      .find();
    postsWithMetadataFromDB = await dataSource
      .getRepository(PostEntity)
      .find({ where: { metadata: Not(IsNull()) } });
  });

  beforeEach(() => {
    translator = new TypeOrmMysqlTranslator();
  });

  it('should translate JSON_CONTAINS for a top-level key-value pair', async () => {
    const targetEvent = actualDomainEventsFromDB.find(
      (e) => e.event_body.status === 'published',
    );
    if (!targetEvent)
      throw new Error(
        'Test data issue: Event with event_body.status "published" not found.',
      );

    const criteria = CriteriaFactory.GetCriteria(DomainEventsSchema).where({
      field: 'event_body',
      operator: FilterOperator.JSON_CONTAINS,
      value: { status: 'published' },
    });

    const qb = await translateAndGetQueryBuilder(criteria, EventEntitySchema);
    const sql = qb.getSql();
    const params = qb.getParameters();
    const results = await qb.getMany();

    expect(sql).toContain(
      `JSON_EXTRACT(\`${criteria.alias}\`.\`event_body\`, '$.status') = ?`,
    );
    expect(params['param_0_json_0']).toBe('published');
    expect(results.some((r) => r.id === targetEvent.id)).toBe(true);
  });

  it('should translate JSON_CONTAINS for a nested path', async () => {
    const targetEvent = actualDomainEventsFromDB.find(
      (e) => e.event_body.details?.ip_address === '192.168.1.100',
    );
    if (!targetEvent)
      throw new Error(
        'Test data issue: Event with event_body.details.ip_address "192.168.1.100" not found.',
      );

    const criteria = CriteriaFactory.GetCriteria(DomainEventsSchema).where({
      field: 'event_body',
      operator: FilterOperator.JSON_CONTAINS,
      value: { 'details.ip_address': '192.168.1.100' },
    });

    const qb = await translateAndGetQueryBuilder(criteria, EventEntitySchema);
    const sql = qb.getSql();
    const results = await qb.getMany();

    expect(sql).toContain(
      `JSON_EXTRACT(\`${criteria.alias}\`.\`event_body\`, '$.details.ip_address') = ?`,
    );
    expect(qb.getParameters()).toEqual({ param_0_json_0: '192.168.1.100' });
    expect(results.some((r) => r.id === targetEvent.id)).toBe(true);
  });

  it('should translate JSON_NOT_CONTAINS for a top-level key', async () => {
    const valueToExclude = 'some_value_to_exclude';
    const criteria = CriteriaFactory.GetCriteria(DomainEventsSchema).where({
      field: 'event_body',
      operator: FilterOperator.JSON_NOT_CONTAINS,
      value: { status: valueToExclude },
    });

    const qb = await translateAndGetQueryBuilder(criteria, EventEntitySchema);
    const sql = qb.getSql();
    const results = await qb.getMany();

    expect(sql).toContain(
      `(JSON_EXTRACT(\`${criteria.alias}\`.\`event_body\`, '$.status') IS NULL OR JSON_EXTRACT(\`${criteria.alias}\`.\`event_body\`, '$.status') <> ?)`,
    );
    expect(qb.getParameters()).toEqual({ param_0_json_0: valueToExclude });
    const expectedResults = actualDomainEventsFromDB.filter(
      (e) =>
        e.event_body.status === undefined ||
        e.event_body.status !== valueToExclude,
    );
    expect(results.length).toBe(expectedResults.length);
  });

  it('should translate ARRAY_CONTAINS_ELEMENT for a direct value in JSON array path', async () => {
    const targetEvent = actualDomainEventsFromDB.find((e) =>
      e.event_body.tags?.includes('security'),
    );
    if (!targetEvent)
      throw new Error('Test data issue: Event with tag "security" not found.');

    const criteria = CriteriaFactory.GetCriteria(DomainEventsSchema).where({
      field: 'event_body',
      operator: FilterOperator.ARRAY_CONTAINS_ELEMENT,
      value: { tags: 'security' },
    });

    const qb = await translateAndGetQueryBuilder(criteria, EventEntitySchema);
    const sql = qb.getSql();
    const params = qb.getParameters();
    const results = await qb.getMany();

    expect(sql).toContain(
      `JSON_CONTAINS(\`${criteria.alias}\`.\`event_body\`, ?, '$.tags')`,
    );
    expect(params['param_0']).toBe(JSON.stringify('security'));
    expect(results.some((r) => r.id === targetEvent.id)).toBe(true);
  });

  it('should translate ARRAY_CONTAINS_ELEMENT for a direct value in a top-level JSON array field', async () => {
    const targetPost = postsWithMetadataFromDB.find((p) =>
      p.metadata?.tags?.includes('common_tag'),
    );
    if (!targetPost)
      throw new Error(
        'Test data issue: Post with metadata.tags containing "common_tag" not found.',
      );

    const criteria = CriteriaFactory.GetCriteria(CriteriaPostSchema).where({
      field: 'metadata',
      operator: FilterOperator.ARRAY_CONTAINS_ELEMENT,
      value: { tags: 'common_tag' },
    });

    const qb = await translateAndGetQueryBuilder<Post>(criteria, PostEntity);
    const sql = qb.getSql();
    const params = qb.getParameters();
    const results = await qb.getMany();

    expect(sql).toContain(
      `JSON_CONTAINS(\`${criteria.alias}\`.\`metadata\`, ?, '$.tags')`,
    );
    expect(params['param_0']).toBe(JSON.stringify('common_tag'));
    expect(results.some((r) => r.uuid === targetPost.uuid)).toBe(true);
  });

  it('should translate ARRAY_CONTAINS_ALL_ELEMENTS for a JSON array path', async () => {
    const targetEvent = actualDomainEventsFromDB.find(
      (e) =>
        e.event_type === EventType.User.Permission.Changed &&
        e.event_body.added_permissions?.includes('read') &&
        e.event_body.added_permissions?.includes('write') &&
        e.event_body.added_permissions?.length === 2,
    );

    if (!targetEvent)
      throw new Error(
        'Test data issue: Specific Event with added_permissions ["read", "write"] not found.',
      );

    const criteria = CriteriaFactory.GetCriteria(DomainEventsSchema).where({
      field: 'event_body',
      operator: FilterOperator.ARRAY_CONTAINS_ALL_ELEMENTS,
      value: { added_permissions: ['read', 'write'] },
    });

    const qb = await translateAndGetQueryBuilder(criteria, EventEntitySchema);
    const sql = qb.getSql();
    const params = qb.getParameters();
    const results = await qb.getMany();

    expect(sql).toContain(
      `JSON_CONTAINS(\`${criteria.alias}\`.\`event_body\`, ?, '$.added_permissions') AND JSON_CONTAINS(\`${criteria.alias}\`.\`event_body\`, ?, '$.added_permissions')`,
    );
    expect(params['param_0_all_0']).toBe(JSON.stringify('read'));
    expect(params['param_0_all_1']).toBe(JSON.stringify('write'));
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe(targetEvent.id);
  });

  it('should translate ARRAY_CONTAINS_ANY_ELEMENT for a JSON array path', async () => {
    const targetPost = postsWithMetadataFromDB.find(
      (p) =>
        p.metadata?.tags?.includes('tag0') ||
        p.metadata?.tags?.includes('common_tag'),
    );
    if (!targetPost)
      throw new Error(
        'Test data issue: Post with metadata.tags containing "tag0" or "common_tag" not found.',
      );

    const criteria = CriteriaFactory.GetCriteria(CriteriaPostSchema).where({
      field: 'metadata',
      operator: FilterOperator.ARRAY_CONTAINS_ANY_ELEMENT,
      value: { tags: ['tag0', 'common_tag'] },
    });

    const qb = await translateAndGetQueryBuilder<Post>(criteria, PostEntity);
    const sql = qb.getSql();
    const params = qb.getParameters();
    const results = await qb.getMany();

    expect(sql).toContain(
      `JSON_CONTAINS(\`${criteria.alias}\`.\`metadata\`, ?, '$.tags') OR JSON_CONTAINS(\`${criteria.alias}\`.\`metadata\`, ?, '$.tags')`,
    );
    expect(params['param_0_any_0']).toBe(JSON.stringify('tag0'));
    expect(params['param_0_any_1']).toBe(JSON.stringify('common_tag'));
    expect(results.some((r) => r.uuid === targetPost.uuid)).toBe(true);
  });

  it('should translate ARRAY_EQUALS for a JSON array path', async () => {
    const exactArray = ['read', 'write'];
    const targetEvent = actualDomainEventsFromDB.find(
      (e) =>
        e.event_type === EventType.User.Permission.Changed &&
        JSON.stringify(e.event_body.added_permissions) ===
        JSON.stringify(exactArray),
    );
    if (!targetEvent)
      throw new Error(
        `Test data issue: Specific Event with exact added_permissions ${JSON.stringify(exactArray)} not found.`,
      );

    const criteria = CriteriaFactory.GetCriteria(DomainEventsSchema).where({
      field: 'event_body',
      operator: FilterOperator.ARRAY_EQUALS,
      value: { added_permissions: exactArray },
    });

    const qb = await translateAndGetQueryBuilder(criteria, EventEntitySchema);
    const sql = qb.getSql();
    const params = qb.getParameters();
    const results = await qb.getMany();

    expect(sql).toContain(
      `JSON_LENGTH(JSON_EXTRACT(\`${criteria.alias}\`.\`event_body\`, '$.added_permissions')) = ?`,
    );
    expect(sql).toContain(
      `JSON_CONTAINS(JSON_EXTRACT(\`${criteria.alias}\`.\`event_body\`, '$.added_permissions'), ?, '$')`,
    );
    expect(params['param_0_len']).toBe(exactArray.length);
    expect(params['param_0_eq_el_0']).toBe(JSON.stringify(exactArray[0]));
    expect(params['param_0_eq_el_1']).toBe(JSON.stringify(exactArray[1]));
    expect(results.some((r) => r.id === targetEvent.id)).toBe(true);
  });

  it('should translate JSON_NOT_CONTAINS correctly when the key does not exist', async () => {
    const nonExistentKey = 'this_key_really_does_not_exist';
    const someValue = 'any_value';
    const expectedEventsCount = actualDomainEventsFromDB.length;

    const criteria = CriteriaFactory.GetCriteria(DomainEventsSchema).where({
      field: 'event_body',
      operator: FilterOperator.JSON_NOT_CONTAINS,
      value: { [nonExistentKey]: someValue },
    });

    const qb = await translateAndGetQueryBuilder(criteria, EventEntitySchema);
    const sql = qb.getSql();
    const params = qb.getParameters();
    const fetchedEvents = await qb.getMany();

    expect(sql).toContain(
      `(JSON_EXTRACT(\`${criteria.alias}\`.\`event_body\`, '$.${nonExistentKey}') IS NULL OR JSON_EXTRACT(\`${criteria.alias}\`.\`event_body\`, '$.${nonExistentKey}') <> ?)`,
    );
    expect(params['param_0_json_0']).toBe(someValue);
    expect(fetchedEvents.length).toBe(expectedEventsCount);
  });

  it('should translate JSON_NOT_CONTAINS correctly when key exists but value is different', async () => {
    const targetEvent = actualDomainEventsFromDB.find(
      (e) => e.event_body.status === 'published',
    );
    if (!targetEvent) {
      throw new Error(
        'Test data issue: Event with status "published" not found for JSON_NOT_CONTAINS test.',
      );
    }
    const valueToExclude = 'a_completely_different_status';
    const expectedEvents = actualDomainEventsFromDB.filter(
      (e) =>
        e.event_body.status === undefined ||
        e.event_body.status !== valueToExclude,
    );

    const criteria = CriteriaFactory.GetCriteria(DomainEventsSchema).where({
      field: 'event_body',
      operator: FilterOperator.JSON_NOT_CONTAINS,
      value: { status: valueToExclude },
    });

    const qb = await translateAndGetQueryBuilder(criteria, EventEntitySchema);
    const sql = qb.getSql();
    const params = qb.getParameters();
    const fetchedEvents = await qb.getMany();

    expect(sql).toContain(
      `(JSON_EXTRACT(\`${criteria.alias}\`.\`event_body\`, '$.status') IS NULL OR JSON_EXTRACT(\`${criteria.alias}\`.\`event_body\`, '$.status') <> ?)`,
    );
    expect(params['param_0_json_0']).toBe(valueToExclude);
    expect(fetchedEvents.length).toBe(expectedEvents.length);
    expect(fetchedEvents.some((fe) => fe.id === targetEvent.id)).toBe(true);
  });

  it('should translate ARRAY_CONTAINS_ELEMENT for a top-level JSON array column (DomainEvent direct_tags)', async () => {
    const targetTag = 'user_event';
    const expectedEvents = actualDomainEventsFromDB.filter((e) =>
      e.direct_tags?.includes(targetTag),
    );

    if (expectedEvents.length === 0) {
      throw new Error(
        `Test data issue: No domain events with direct_tags containing "${targetTag}" found.`,
      );
    }

    const criteria = CriteriaFactory.GetCriteria(DomainEventsSchema).where({
      field: 'direct_tags',
      operator: FilterOperator.ARRAY_CONTAINS_ELEMENT,
      value: targetTag,
    });

    const qb = await translateAndGetQueryBuilder(criteria, EventEntitySchema);
    const sql = qb.getSql();
    const params = qb.getParameters();
    const fetchedEvents = await qb.getMany();

    expect(sql).toContain(
      `JSON_CONTAINS(\`${criteria.alias}\`.\`direct_tags\`, ?)`,
    );
    expect(params['param_0']).toBe(JSON.stringify(targetTag));
    expect(fetchedEvents.length).toBe(expectedEvents.length);
    fetchedEvents.forEach((fe) => {
      expect(fe.direct_tags).toBeDefined();
      expect(fe.direct_tags).toContain(targetTag);
    });
  });

  it('should translate ARRAY_EQUALS with an empty array for a JSON path (event_body.tags)', async () => {
    const emptyArray: string[] = [];
    const expectedEvents = actualDomainEventsFromDB.filter(
      (e) =>
        Array.isArray(e.event_body.tags) && e.event_body.tags.length === 0,
    );

    if (expectedEvents.length === 0) {
      throw new Error(
        'Test data issue: No domain events with empty event_body.tags found.',
      );
    }

    const criteria = CriteriaFactory.GetCriteria(DomainEventsSchema).where({
      field: 'event_body',
      operator: FilterOperator.ARRAY_EQUALS,
      value: { tags: emptyArray },
    });

    const qb = await translateAndGetQueryBuilder(criteria, EventEntitySchema);
    const sql = qb.getSql();
    const params = qb.getParameters();
    const fetchedEvents = await qb.getMany();

    expect(sql).toContain(
      `JSON_LENGTH(JSON_EXTRACT(\`${criteria.alias}\`.\`event_body\`, '$.tags')) = ?`,
    );
    const lengthParamKey = Object.keys(params).find((key) =>
      key.endsWith('_len'),
    );
    expect(lengthParamKey).toBeDefined();
    if (lengthParamKey) {
      expect(params[lengthParamKey]).toBe(0);
    }
    expect(Object.keys(params).some((key) => key.includes('_eq_el_'))).toBe(
      false,
    );
    expect(fetchedEvents.length).toBe(expectedEvents.length);
    fetchedEvents.forEach((fe) => {
      expect(
        Array.isArray(fe.event_body.tags) && fe.event_body.tags.length === 0,
      ).toBe(true);
    });
  });

  it('should translate ARRAY_EQUALS with an empty array for a top-level JSON array column (direct_tags)', async () => {
    const emptyArray: string[] = [];
    const expectedEvents = actualDomainEventsFromDB.filter(
      (e) => Array.isArray(e.direct_tags) && e.direct_tags.length === 0,
    );

    if (expectedEvents.length === 0) {
      throw new Error(
        'Test data issue: No domain events with empty direct_tags found.',
      );
    }

    const criteria = CriteriaFactory.GetCriteria(DomainEventsSchema).where({
      field: 'direct_tags',
      operator: FilterOperator.ARRAY_EQUALS,
      value: emptyArray,
    });

    const qb = await translateAndGetQueryBuilder(criteria, EventEntitySchema);
    const sql = qb.getSql();
    const params = qb.getParameters();
    const fetchedEvents = await qb.getMany();

    expect(sql).toContain(
      `JSON_LENGTH(\`${criteria.alias}\`.\`direct_tags\`) = ?`,
    );
    const lengthParamKey = Object.keys(params).find((key) =>
      key.endsWith('_len'),
    );
    expect(lengthParamKey).toBeDefined();
    if (lengthParamKey) {
      expect(params[lengthParamKey]).toBe(0);
    }
    expect(Object.keys(params).some((key) => key.includes('_eq_el_'))).toBe(
      false,
    );
    expect(fetchedEvents.length).toBe(expectedEvents.length);
    fetchedEvents.forEach((fe) => {
      expect(
        Array.isArray(fe.direct_tags) && fe.direct_tags.length === 0,
      ).toBe(true);
    });
  });
});