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

  it('should translate JSON_PATH_VALUE_EQUALS for a top-level key-value pair', async () => {
    const targetEvent = actualDomainEventsFromDB.find(
      (e) => e.event_body.status === 'published',
    );
    if (!targetEvent)
      throw new Error(
        'Test data issue: Event with event_body.status "published" not found.',
      );

    const criteria = CriteriaFactory.GetCriteria(DomainEventsSchema).where({
      field: 'event_body',
      operator: FilterOperator.JSON_PATH_VALUE_EQUALS,
      value: { status: 'published' },
    });

    const qb = await translateAndGetQueryBuilder(criteria, EventEntitySchema);
    const sql = qb.getSql();
    const params = qb.getParameters();
    const results = await qb.getMany();

    expect(sql).toContain(
      `WHERE (JSON_EXTRACT(\`${criteria.alias}\`.\`event_body\`, '$.status') = ?)`,
    );
    expect(params['param_0']).toBe('published');
    expect(results.some((r) => r.id === targetEvent.id)).toBe(true);
  });

  it('should translate JSON_PATH_VALUE_EQUALS for a nested path', async () => {
    const targetEvent = actualDomainEventsFromDB.find(
      (e) => e.event_body.details?.ip_address === '192.168.1.100',
    );
    if (!targetEvent)
      throw new Error(
        'Test data issue: Event with event_body.details.ip_address "192.168.1.100" not found.',
      );

    const criteria = CriteriaFactory.GetCriteria(DomainEventsSchema).where({
      field: 'event_body',
      operator: FilterOperator.JSON_PATH_VALUE_EQUALS,
      value: { 'details.ip_address': '192.168.1.100' },
    });

    const qb = await translateAndGetQueryBuilder(criteria, EventEntitySchema);
    const sql = qb.getSql();
    const results = await qb.getMany();

    expect(sql).toContain(
      `WHERE (JSON_EXTRACT(\`${criteria.alias}\`.\`event_body\`, '$.details.ip_address') = ?)`,
    );
    expect(qb.getParameters()).toEqual({ param_0: '192.168.1.100' });
    expect(results.some((r) => r.id === targetEvent.id)).toBe(true);
  });

  it('should translate JSON_PATH_VALUE_NOT_EQUALS for a top-level key', async () => {
    const valueToExclude = 'some_value_to_exclude';
    const criteria = CriteriaFactory.GetCriteria(DomainEventsSchema).where({
      field: 'event_body',
      operator: FilterOperator.JSON_PATH_VALUE_NOT_EQUALS,
      value: { status: valueToExclude },
    });

    const qb = await translateAndGetQueryBuilder(criteria, EventEntitySchema);
    const sql = qb.getSql();
    const results = await qb.getMany();

    expect(sql).toContain(
      `WHERE (JSON_EXTRACT(\`${criteria.alias}\`.\`event_body\`, '$.status') != ?)`,
    );
    expect(qb.getParameters()).toEqual({ param_0: valueToExclude });
    const expectedResults = actualDomainEventsFromDB.filter(
      (e) =>
        e.event_body.status !== undefined &&
        e.event_body.status !== null &&
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
      `WHERE (JSON_CONTAINS(\`${criteria.alias}\`.\`event_body\`, ?, '$.tags'))`,
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
      `WHERE (JSON_CONTAINS(\`${criteria.alias}\`.\`metadata\`, ?, '$.tags'))`,
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
      `(\`${criteria.alias}\`.\`event_body\` IS NOT NULL AND (JSON_CONTAINS(\`${criteria.alias}\`.\`event_body\`, ?, '$.added_permissions') AND JSON_CONTAINS(\`${criteria.alias}\`.\`event_body\`, ?, '$.added_permissions')))`,
    );
    expect(params['param_0']).toBe(JSON.stringify('read'));
    expect(params['param_1']).toBe(JSON.stringify('write'));
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
      `(\`${criteria.alias}\`.\`metadata\` IS NOT NULL AND (JSON_CONTAINS(\`${criteria.alias}\`.\`metadata\`, ?, '$.tags') OR JSON_CONTAINS(\`${criteria.alias}\`.\`metadata\`, ?, '$.tags')))`,
    );
    expect(params['param_0']).toBe(JSON.stringify('tag0'));
    expect(params['param_1']).toBe(JSON.stringify('common_tag'));
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
        `Test data issue: Specific Event with exact added_permissions ${JSON.stringify(
          exactArray,
        )} not found.`,
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
      `(\`${criteria.alias}\`.\`event_body\` IS NOT NULL AND JSON_EXTRACT(\`${criteria.alias}\`.\`event_body\`, '$.added_permissions') IS NOT NULL AND (JSON_LENGTH(JSON_EXTRACT(\`${criteria.alias}\`.\`event_body\`, '$.added_permissions')) = ? AND JSON_CONTAINS(JSON_EXTRACT(\`${criteria.alias}\`.\`event_body\`, '$.added_permissions'), ?, '$') AND JSON_CONTAINS(JSON_EXTRACT(\`${criteria.alias}\`.\`event_body\`, '$.added_permissions'), ?, '$')))`,
    );
    expect(params['param_0']).toBe(exactArray.length);
    expect(params['param_1']).toBe(JSON.stringify(exactArray[0]));
    expect(params['param_2']).toBe(JSON.stringify(exactArray[1]));
    expect(results.some((r) => r.id === targetEvent.id)).toBe(true);
  });

  it('should translate JSON_PATH_VALUE_NOT_EQUALS correctly when the key does not exist', async () => {
    const nonExistentKey = 'this_key_really_does_not_exist';
    const someValue = 'any_value';
    const expectedEventsCount = 0;

    const criteria = CriteriaFactory.GetCriteria(DomainEventsSchema).where({
      field: 'event_body',
      operator: FilterOperator.JSON_PATH_VALUE_NOT_EQUALS,
      value: { [nonExistentKey]: someValue },
    });

    const qb = await translateAndGetQueryBuilder(criteria, EventEntitySchema);
    const sql = qb.getSql();
    const params = qb.getParameters();
    const fetchedEvents = await qb.getMany();

    expect(sql).toContain(
      `WHERE (JSON_EXTRACT(\`${criteria.alias}\`.\`event_body\`, '$.${nonExistentKey}') != ?)`,
    );
    expect(params['param_0']).toBe(someValue);
    expect(fetchedEvents.length).toBe(expectedEventsCount);
  });

  it('should translate JSON_PATH_VALUE_NOT_EQUALS correctly when key exists but value is different', async () => {
    const targetEvent = actualDomainEventsFromDB.find(
      (e) => e.event_body.status === 'published',
    );
    if (!targetEvent) {
      throw new Error(
        'Test data issue: Event with status "published" not found for JSON_PATH_VALUE_NOT_EQUALS test.',
      );
    }
    const valueToExclude = 'a_completely_different_status';
    const expectedEvents = actualDomainEventsFromDB.filter(
      (e) =>
        e.event_body.status !== undefined &&
        e.event_body.status !== null &&
        e.event_body.status !== valueToExclude,
    );

    const criteria = CriteriaFactory.GetCriteria(DomainEventsSchema).where({
      field: 'event_body',
      operator: FilterOperator.JSON_PATH_VALUE_NOT_EQUALS,
      value: { status: valueToExclude },
    });

    const qb = await translateAndGetQueryBuilder(criteria, EventEntitySchema);
    const sql = qb.getSql();
    const params = qb.getParameters();
    const fetchedEvents = await qb.getMany();

    expect(sql).toContain(
      `WHERE (JSON_EXTRACT(\`${criteria.alias}\`.\`event_body\`, '$.status') != ?)`,
    );
    expect(params['param_0']).toBe(valueToExclude);
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
      `WHERE (JSON_CONTAINS(\`${criteria.alias}\`.\`direct_tags\`, ?))`,
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
      (e) => Array.isArray(e.event_body.tags) && e.event_body.tags.length === 0,
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
      `WHERE (JSON_LENGTH(JSON_EXTRACT(\`${criteria.alias}\`.\`event_body\`, '$.tags')) = ?)`,
    );
    expect(params['param_0']).toBe(0);
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
      `WHERE (JSON_LENGTH(\`${criteria.alias}\`.\`direct_tags\`) = ?)`,
    );
    expect(params['param_0']).toBe(0);
    expect(Object.keys(params).some((key) => key.includes('_eq_el_'))).toBe(
      false,
    );
    expect(fetchedEvents.length).toBe(expectedEvents.length);
    fetchedEvents.forEach((fe) => {
      expect(Array.isArray(fe.direct_tags) && fe.direct_tags.length === 0).toBe(
        true,
      );
    });
  });

  it('should translate ARRAY_EQUALS_STRICT for a top-level JSON array column', async () => {
    const exactArray = ['user_event', 'login_success'];
    const expectedEvent = actualDomainEventsFromDB.find(
      (e) => JSON.stringify(e.direct_tags) === JSON.stringify(exactArray),
    );

    if (!expectedEvent) {
      throw new Error(
        `Test data issue: No event with direct_tags exactly ${JSON.stringify(
          exactArray,
        )} found.`,
      );
    }

    const criteria = CriteriaFactory.GetCriteria(DomainEventsSchema).where({
      field: 'direct_tags',
      operator: FilterOperator.ARRAY_EQUALS_STRICT,
      value: exactArray,
    });

    const qb = await translateAndGetQueryBuilder(criteria, EventEntitySchema);
    const sql = qb.getSql();
    const params = qb.getParameters();
    const results = await qb.getMany();

    expect(sql).toContain(
      `(\`${criteria.alias}\`.\`direct_tags\` <=> CAST(? AS JSON) AND \`${criteria.alias}\`.\`direct_tags\` IS NOT NULL)`,
    );
    expect(params['param_0']).toBe(JSON.stringify(exactArray));
    expect(results.length).toBe(1);
    expect(results[0]?.id).toBe(expectedEvent.id);
  });

  it('should translate ARRAY_EQUALS_STRICT for a JSON array path', async () => {
    const exactArray = ['info', 'user_profile'];
    const expectedEvent = actualDomainEventsFromDB.find(
      (e) => JSON.stringify(e.event_body.tags) === JSON.stringify(exactArray),
    );

    if (!expectedEvent) {
      throw new Error(
        `Test data issue: No event with event_body.tags exactly ${JSON.stringify(
          exactArray,
        )} found.`,
      );
    }

    const criteria = CriteriaFactory.GetCriteria(DomainEventsSchema).where({
      field: 'event_body',
      operator: FilterOperator.ARRAY_EQUALS_STRICT,
      value: { tags: exactArray },
    });

    const qb = await translateAndGetQueryBuilder(criteria, EventEntitySchema);
    const sql = qb.getSql();
    const params = qb.getParameters();
    const results = await qb.getMany();

    expect(sql).toContain(
      `(JSON_EXTRACT(\`${criteria.alias}\`.\`event_body\`, '$.tags') <=> CAST(? AS JSON) AND \`${criteria.alias}\`.\`event_body\` IS NOT NULL)`,
    );
    expect(params['param_0']).toBe(JSON.stringify(exactArray));
    expect(results.length).toBe(1);
    expect(results[0]?.id).toBe(expectedEvent.id);
  });

  it('should translate JSON_CONTAINS_ANY for a JSON array path', async () => {
    const targetValues = ['update', 'non_existent_tag'];
    const expectedEvent = actualDomainEventsFromDB.find(
      (e) =>
        e.event_type === EventType.Post.WasModified &&
        e.event_body.tags?.some((t: string) => targetValues.includes(t)),
    );

    if (!expectedEvent) {
      throw new Error(
        `Test data issue: No event found with any of the tags: ${targetValues.join(
          ', ',
        )}.`,
      );
    }

    const criteria = CriteriaFactory.GetCriteria(DomainEventsSchema).where({
      field: 'event_body',
      operator: FilterOperator.JSON_CONTAINS_ANY,
      value: { tags: targetValues },
    });

    const qb = await translateAndGetQueryBuilder(criteria, EventEntitySchema);
    const sql = qb.getSql();
    const params = qb.getParameters();
    const results = await qb.getMany();

    expect(sql).toContain(
      `(\`${criteria.alias}\`.\`event_body\` IS NOT NULL AND (JSON_CONTAINS(\`${criteria.alias}\`.\`event_body\`, ?, '$.tags') OR JSON_CONTAINS(\`${criteria.alias}\`.\`event_body\`, ?, '$.tags')))`,
    );
    expect(params['param_0']).toBe(JSON.stringify(targetValues[0]));
    expect(params['param_1']).toBe(JSON.stringify(targetValues[1]));
    expect(results.length).toBe(1);
    expect(results[0]?.id).toBe(expectedEvent.id);
  });

  it('should translate JSON_CONTAINS_ALL for a JSON array path', async () => {
    const targetValues = ['info', 'user_profile'];
    const expectedEvent = actualDomainEventsFromDB.find(
      (e) =>
        e.event_type === EventType.User.Email.Changed &&
        targetValues.every((v) => e.event_body.tags?.includes(v)),
    );

    if (!expectedEvent) {
      throw new Error(
        `Test data issue: No event found with all of the tags: ${targetValues.join(
          ', ',
        )}.`,
      );
    }

    const criteria = CriteriaFactory.GetCriteria(DomainEventsSchema).where({
      field: 'event_body',
      operator: FilterOperator.JSON_CONTAINS_ALL,
      value: { tags: targetValues },
    });

    const qb = await translateAndGetQueryBuilder(criteria, EventEntitySchema);
    const sql = qb.getSql();
    const params = qb.getParameters();
    const results = await qb.getMany();

    expect(sql).toContain(
      `(\`${criteria.alias}\`.\`event_body\` IS NOT NULL AND (JSON_CONTAINS(\`${criteria.alias}\`.\`event_body\`, ?, '$.tags') AND JSON_CONTAINS(\`${criteria.alias}\`.\`event_body\`, ?, '$.tags')))`,
    );
    expect(params['param_0']).toBe(JSON.stringify(targetValues[0]));
    expect(params['param_1']).toBe(JSON.stringify(targetValues[1]));
    expect(results.length).toBe(1);
    expect(results[0]?.id).toBe(expectedEvent.id);
  });

  it('should translate JSON_NOT_CONTAINS for a JSON array path', async () => {
    const valueToExclude = 'security';
    const expectedEvents = actualDomainEventsFromDB.filter((e) => {
      if (e.event_body.tags === undefined || e.event_body.tags === null) {
        return false;
      }
      return !e.event_body.tags.includes(valueToExclude);
    });

    if (expectedEvents.length === actualDomainEventsFromDB.length) {
      throw new Error(
        `Test data issue: No event found with the tag "${valueToExclude}" to make the test meaningful.`,
      );
    }

    const criteria = CriteriaFactory.GetCriteria(DomainEventsSchema).where({
      field: 'event_body',
      operator: FilterOperator.JSON_NOT_CONTAINS,
      value: { tags: valueToExclude },
    });

    const qb = await translateAndGetQueryBuilder(criteria, EventEntitySchema);
    const sql = qb.getSql();
    const params = qb.getParameters();
    const results = await qb.getMany();

    expect(sql).toContain(
      `(NOT JSON_CONTAINS(\`${criteria.alias}\`.\`event_body\`, ?, '$.tags'))`,
    );
    expect(params['param_0']).toBe(JSON.stringify(valueToExclude));
    expect(results.length).toBe(expectedEvents.length);
  });

  it('should translate JSON_CONTAINS for multiple key-value pairs', async () => {
    const targetEvent = actualDomainEventsFromDB.find(
      (e) =>
        e.event_type === EventType.User.Email.Changed &&
        e.event_body.tags?.includes('info') &&
        e.event_body.details?.ip_address === '192.168.1.100',
    );

    if (!targetEvent) {
      throw new Error(
        'Test data issue: Event with specific tags and ip_address not found.',
      );
    }

    const criteria = CriteriaFactory.GetCriteria(DomainEventsSchema).where({
      field: 'event_body',
      operator: FilterOperator.JSON_CONTAINS,
      value: {
        'tags[0]': 'info',
        'details.ip_address': '192.168.1.100',
      },
    });

    const qb = await translateAndGetQueryBuilder(criteria, EventEntitySchema);
    const sql = qb.getSql();
    const params = qb.getParameters();
    const results = await qb.getMany();

    expect(sql).toContain(
      `(JSON_CONTAINS(\`${criteria.alias}\`.\`event_body\`, ?, '$.tags[0]') AND JSON_CONTAINS(\`${criteria.alias}\`.\`event_body\`, ?, '$.details.ip_address'))`,
    );
    expect(params['param_0']).toBe(JSON.stringify('info'));
    expect(params['param_1']).toBe(JSON.stringify('192.168.1.100'));
    expect(results.length).toBe(1);
    expect(results[0]?.id).toBe(targetEvent.id);
  });

  it('should translate JSON_NOT_CONTAINS for multiple key-value pairs', async () => {
    const valuesToExclude = {
      'tags[0]': 'non_existent_tag',
      'details.ip_address': '10.0.0.1',
    };

    const expectedEvents = actualDomainEventsFromDB.filter((e) => {
      const simulateNotJsonContainsEffective = (
        jsonDoc: any,
        value: any,
        path: string,
      ): boolean => {
        let extracted: any;
        if (path === '$.tags[0]') {
          extracted = jsonDoc.tags?.[0];
        } else if (path === '$.details.ip_address') {
          extracted = jsonDoc.details?.ip_address;
        } else {
          return false;
        }

        if (extracted === undefined || extracted === null) {
          return false;
        }

        let containsResult: boolean;
        if (path.startsWith('$.tags')) {
          containsResult =
            Array.isArray(extracted) && extracted.includes(value);
        } else {
          containsResult = extracted === value;
        }

        return !containsResult;
      };

      const notTagsContainsEffective = simulateNotJsonContainsEffective(
        e.event_body,
        valuesToExclude['tags[0]'],
        '$.tags[0]',
      );
      const notIpContainsEffective = simulateNotJsonContainsEffective(
        e.event_body,
        valuesToExclude['details.ip_address'],
        '$.details.ip_address',
      );

      return notTagsContainsEffective || notIpContainsEffective;
    });

    if (expectedEvents.length === 0) {
      throw new Error(
        'Test data issue: All events match the exclusion criteria, making the test less meaningful.',
      );
    }

    const criteria = CriteriaFactory.GetCriteria(DomainEventsSchema).where({
      field: 'event_body',
      operator: FilterOperator.JSON_NOT_CONTAINS,
      value: valuesToExclude,
    });

    const qb = await translateAndGetQueryBuilder(criteria, EventEntitySchema);
    const sql = qb.getSql();
    const params = qb.getParameters();
    const results = await qb.getMany();

    expect(sql).toContain(
      `(NOT JSON_CONTAINS(\`${criteria.alias}\`.\`event_body\`, ?, '$.tags[0]') OR NOT JSON_CONTAINS(\`${criteria.alias}\`.\`event_body\`, ?, '$.details.ip_address'))`,
    );
    expect(params['param_0']).toBe(JSON.stringify(valuesToExclude['tags[0]']));
    expect(params['param_1']).toBe(
      JSON.stringify(valuesToExclude['details.ip_address']),
    );
    expect(results.length).toBe(expectedEvents.length);
  });

  it('should translate ARRAY_NOT_CONTAINS_ELEMENT for a direct value in JSON array path', async () => {
    const valueToExclude = 'security';
    const expectedEvents = actualDomainEventsFromDB.filter(
      (e) =>
        e.event_body.tags === null ||
        (Array.isArray(e.event_body.tags) &&
          !e.event_body.tags.includes(valueToExclude)),
    );

    if (expectedEvents.length === actualDomainEventsFromDB.length) {
      throw new Error(
        `Test data issue: All events lack the tag "${valueToExclude}" to make the test meaningful.`,
      );
    }

    const criteria = CriteriaFactory.GetCriteria(DomainEventsSchema).where({
      field: 'event_body',
      operator: FilterOperator.ARRAY_NOT_CONTAINS_ELEMENT,
      value: { tags: valueToExclude },
    });

    const qb = await translateAndGetQueryBuilder(criteria, EventEntitySchema);
    const sql = qb.getSql();
    const params = qb.getParameters();
    const results = await qb.getMany();

    expect(sql).toContain(
      `WHERE (JSON_CONTAINS(\`${criteria.alias}\`.\`event_body\`, ?, '$.tags') = 0)`,
    );
    expect(params['param_0']).toBe(JSON.stringify(valueToExclude));
    expect(results.length).toBe(expectedEvents.length);
    results.forEach((r) => {
      if (Array.isArray(r.event_body.tags)) {
        expect(r.event_body.tags).not.toContain(valueToExclude);
      }
    });
  });

  it('should translate ARRAY_NOT_CONTAINS_ELEMENT for a direct value in a top-level JSON array field', async () => {
    const valueToExclude = 'common_tag';
    const expectedPosts = postsWithMetadataFromDB.filter(
      (p) =>
        p.metadata?.tags === null ||
        (Array.isArray(p.metadata!.tags) &&
          !p.metadata!.tags.includes(valueToExclude)),
    );

    if (expectedPosts.length === postsWithMetadataFromDB.length) {
      throw new Error(
        `Test data issue: All posts lack the tag "${valueToExclude}" to make the test meaningful.`,
      );
    }

    const criteria = CriteriaFactory.GetCriteria(CriteriaPostSchema).where({
      field: 'metadata',
      operator: FilterOperator.ARRAY_NOT_CONTAINS_ELEMENT,
      value: { tags: valueToExclude },
    });

    const qb = await translateAndGetQueryBuilder<Post>(criteria, PostEntity);
    const sql = qb.getSql();
    const params = qb.getParameters();
    const results = await qb.getMany();

    expect(sql).toContain(
      `WHERE (JSON_CONTAINS(\`${criteria.alias}\`.\`metadata\`, ?, '$.tags') = 0)`,
    );
    expect(params['param_0']).toBe(JSON.stringify(valueToExclude));
    expect(results.length).toBe(expectedPosts.length);
    results.forEach((r) => {
      if (Array.isArray(r.metadata?.tags)) {
        expect(r.metadata.tags).not.toContain(valueToExclude);
      }
    });
  });

  it('should translate ARRAY_NOT_CONTAINS_ALL_ELEMENTS for a JSON array path', async () => {
    const elementsToExclude = ['read', 'write'];
    const expectedEvents = actualDomainEventsFromDB.filter(
      (e) =>
        e.event_body.added_permissions === null ||
        (Array.isArray(e.event_body.added_permissions) &&
          !elementsToExclude.every((el) =>
            e.event_body.added_permissions.includes(el),
          )),
    );

    const eventsThatContainAll = actualDomainEventsFromDB.filter(
      (e) =>
        e.event_body.added_permissions !== null &&
        Array.isArray(e.event_body.added_permissions) &&
        elementsToExclude.every((el) =>
          e.event_body.added_permissions.includes(el),
        ),
    );

    if (eventsThatContainAll.length === 0) {
      throw new Error(
        `Test data issue: No events found with all permissions: ${elementsToExclude.join(', ')} to make exclusion meaningful.`,
      );
    }

    const criteria = CriteriaFactory.GetCriteria(DomainEventsSchema).where({
      field: 'event_body',
      operator: FilterOperator.ARRAY_NOT_CONTAINS_ALL_ELEMENTS,
      value: { added_permissions: elementsToExclude },
    });

    const qb = await translateAndGetQueryBuilder(criteria, EventEntitySchema);
    const sql = qb.getSql();
    const params = qb.getParameters();
    const results = await qb.getMany();

    expect(sql).toContain(
      `(\`${criteria.alias}\`.\`event_body\` IS NULL OR (NOT JSON_CONTAINS(\`${criteria.alias}\`.\`event_body\`, ?, '$.added_permissions') OR NOT JSON_CONTAINS(\`${criteria.alias}\`.\`event_body\`, ?, '$.added_permissions')))`,
    );
    expect(params['param_0']).toBe(JSON.stringify(elementsToExclude[0]));
    expect(params['param_1']).toBe(JSON.stringify(elementsToExclude[1]));
    expect(results.length).toBe(expectedEvents.length);
    results.forEach((r) => {
      if (Array.isArray(r.event_body.added_permissions)) {
        expect(
          elementsToExclude.every((el) =>
            r.event_body.added_permissions.includes(el),
          ),
        ).toBe(false);
      }
    });
  });

  it('should translate ARRAY_NOT_CONTAINS_ANY_ELEMENT for a JSON array path', async () => {
    const elementsToExclude = ['tag0', 'common_tag'];
    const expectedPosts = postsWithMetadataFromDB.filter(
      (p) =>
        p.metadata?.tags === null ||
        (Array.isArray(p.metadata!.tags) &&
          !elementsToExclude.some((el) => p.metadata!.tags!.includes(el))),
    );

    const postsThatContainAny = postsWithMetadataFromDB.filter(
      (p) =>
        p.metadata?.tags !== null &&
        Array.isArray(p.metadata!.tags) &&
        elementsToExclude.some((el) => p.metadata!.tags!.includes(el)),
    );

    if (postsThatContainAny.length === 0) {
      throw new Error(
        `Test data issue: No posts found with any of the tags: ${elementsToExclude.join(', ')} to make exclusion meaningful.`,
      );
    }

    const criteria = CriteriaFactory.GetCriteria(CriteriaPostSchema).where({
      field: 'metadata',
      operator: FilterOperator.ARRAY_NOT_CONTAINS_ANY_ELEMENT,
      value: { tags: elementsToExclude },
    });

    const qb = await translateAndGetQueryBuilder<Post>(criteria, PostEntity);
    const sql = qb.getSql();
    const params = qb.getParameters();
    const results = await qb.getMany();

    expect(sql).toContain(
      `(\`${criteria.alias}\`.\`metadata\` IS NULL OR (NOT JSON_CONTAINS(\`${criteria.alias}\`.\`metadata\`, ?, '$.tags') AND NOT JSON_CONTAINS(\`${criteria.alias}\`.\`metadata\`, ?, '$.tags')))`,
    );
    expect(params['param_0']).toBe(JSON.stringify(elementsToExclude[0]));
    expect(params['param_1']).toBe(JSON.stringify(elementsToExclude[1]));
    expect(results.length).toBe(expectedPosts.length);
    results.forEach((r) => {
      if (Array.isArray(r.metadata?.tags)) {
        expect(
          elementsToExclude.some((el) => r.metadata!.tags!.includes(el)),
        ).toBe(false);
      }
    });
  });

  it('should translate ARRAY_NOT_EQUALS for a JSON array path', async () => {
    const arrayToExclude = ['read', 'write'];
    const expectedEvents = actualDomainEventsFromDB.filter((e) => {
      const dbArray = e.event_body.added_permissions;
      if (dbArray === null) return true;
      if (!Array.isArray(dbArray)) return true;

      const areEqual =
        dbArray.length === arrayToExclude.length &&
        arrayToExclude.every((val) => dbArray.includes(val));

      return !areEqual;
    });

    const criteria = CriteriaFactory.GetCriteria(DomainEventsSchema).where({
      field: 'event_body',
      operator: FilterOperator.ARRAY_NOT_EQUALS,
      value: { added_permissions: arrayToExclude },
    });

    const qb = await translateAndGetQueryBuilder(criteria, EventEntitySchema);
    const sql = qb.getSql();
    const params = qb.getParameters();
    const results = await qb.getMany();

    expect(sql).toContain(
      `(\`${criteria.alias}\`.\`event_body\` IS NULL OR JSON_EXTRACT(\`${criteria.alias}\`.\`event_body\`, '$.added_permissions') IS NULL OR (JSON_LENGTH(JSON_EXTRACT(\`${criteria.alias}\`.\`event_body\`, '$.added_permissions')) != ? OR NOT JSON_CONTAINS(JSON_EXTRACT(\`${criteria.alias}\`.\`event_body\`, '$.added_permissions'), ?, '$') OR NOT JSON_CONTAINS(JSON_EXTRACT(\`${criteria.alias}\`.\`event_body\`, '$.added_permissions'), ?, '$')))`,
    );
    expect(params['param_0']).toBe(arrayToExclude.length);
    expect(params['param_1']).toBe(JSON.stringify(arrayToExclude[0]));
    expect(params['param_2']).toBe(JSON.stringify(arrayToExclude[1]));
    expect(results.length).toBe(expectedEvents.length);
  });

  it('should translate ARRAY_NOT_EQUALS_STRICT for a top-level JSON array column', async () => {
    const arrayToExclude = ['user_event', 'login_success'];
    const expectedEvents = actualDomainEventsFromDB.filter(
      (e) =>
        e.direct_tags === null ||
        JSON.stringify(e.direct_tags) !== JSON.stringify(arrayToExclude),
    );

    const criteria = CriteriaFactory.GetCriteria(DomainEventsSchema).where({
      field: 'direct_tags',
      operator: FilterOperator.ARRAY_NOT_EQUALS_STRICT,
      value: arrayToExclude,
    });

    const qb = await translateAndGetQueryBuilder(criteria, EventEntitySchema);
    const sql = qb.getSql();
    const params = qb.getParameters();
    const results = await qb.getMany();

    expect(sql).toContain(
      `WHERE ((NOT \`${criteria.alias}\`.\`direct_tags\` <=> CAST(? AS JSON)))`,
    );
    expect(params['param_0']).toBe(JSON.stringify(arrayToExclude));
    expect(results.length).toBe(expectedEvents.length);
  });

  it('should translate ARRAY_NOT_EQUALS_STRICT for a JSON array path', async () => {
    const arrayToExclude = ['info', 'user_profile'];
    const expectedEvents = actualDomainEventsFromDB.filter(
      (e) =>
        e.event_body.tags === null ||
        JSON.stringify(e.event_body.tags) !== JSON.stringify(arrayToExclude),
    );

    const criteria = CriteriaFactory.GetCriteria(DomainEventsSchema).where({
      field: 'event_body',
      operator: FilterOperator.ARRAY_NOT_EQUALS_STRICT,
      value: { tags: arrayToExclude },
    });

    const qb = await translateAndGetQueryBuilder(criteria, EventEntitySchema);
    const sql = qb.getSql();
    const params = qb.getParameters();
    const results = await qb.getMany();

    expect(sql).toContain(
      `WHERE ((NOT JSON_EXTRACT(\`${criteria.alias}\`.\`event_body\`, '$.tags') <=> CAST(? AS JSON)))`,
    );
    expect(params['param_0']).toBe(JSON.stringify(arrayToExclude));
    expect(results.length).toBe(expectedEvents.length);
  });

  it('should translate JSON_NOT_CONTAINS_ANY for a JSON array path', async () => {
    const valuesToExclude = ['info', 'non_existent_tag'];
    const expectedEvents = actualDomainEventsFromDB.filter(
      (e) =>
        e.event_body.tags === null ||
        (Array.isArray(e.event_body.tags) &&
          !e.event_body.tags.some((t: string) => valuesToExclude.includes(t))),
    );

    const eventsThatContainAny = actualDomainEventsFromDB.filter(
      (e) =>
        Array.isArray(e.event_body.tags) &&
        e.event_body.tags.some((t: string) => valuesToExclude.includes(t)),
    );

    if (eventsThatContainAny.length === 0) {
      throw new Error(
        `Test data issue: No event found with any of the tags: ${valuesToExclude.join(', ')} to make exclusion meaningful.`,
      );
    }

    const criteria = CriteriaFactory.GetCriteria(DomainEventsSchema).where({
      field: 'event_body',
      operator: FilterOperator.JSON_NOT_CONTAINS_ANY,
      value: { tags: valuesToExclude },
    });

    const qb = await translateAndGetQueryBuilder(criteria, EventEntitySchema);
    const sql = qb.getSql();
    const params = qb.getParameters();
    const results = await qb.getMany();

    expect(sql).toContain(
      `(\`${criteria.alias}\`.\`event_body\` IS NULL OR (NOT JSON_CONTAINS(\`${criteria.alias}\`.\`event_body\`, ?, '$.tags') AND NOT JSON_CONTAINS(\`${criteria.alias}\`.\`event_body\`, ?, '$.tags')))`,
    );
    expect(params['param_0']).toBe(JSON.stringify(valuesToExclude[0]));
    expect(params['param_1']).toBe(JSON.stringify(valuesToExclude[1]));
    expect(results.length).toBe(expectedEvents.length);
  });

  it('should translate JSON_NOT_CONTAINS_ALL for a JSON array path', async () => {
    const valuesToExclude = ['info', 'user_profile'];
    const expectedEvents = actualDomainEventsFromDB.filter(
      (e) =>
        e.event_body.tags === null ||
        (Array.isArray(e.event_body.tags) &&
          !valuesToExclude.every((v) => e.event_body.tags!.includes(v))),
    );

    const eventsThatContainAll = actualDomainEventsFromDB.filter(
      (e) =>
        Array.isArray(e.event_body.tags) &&
        valuesToExclude.every((v) => e.event_body.tags!.includes(v)),
    );

    if (eventsThatContainAll.length === 0) {
      throw new Error(
        `Test data issue: No event found where all of the tags: ${valuesToExclude.join(', ')} are present.`,
      );
    }

    const criteria = CriteriaFactory.GetCriteria(DomainEventsSchema).where({
      field: 'event_body',
      operator: FilterOperator.JSON_NOT_CONTAINS_ALL,
      value: { tags: valuesToExclude },
    });

    const qb = await translateAndGetQueryBuilder(criteria, EventEntitySchema);
    const sql = qb.getSql();
    const params = qb.getParameters();
    const results = await qb.getMany();

    expect(sql).toContain(
      `(\`${criteria.alias}\`.\`event_body\` IS NULL OR (NOT JSON_CONTAINS(\`${criteria.alias}\`.\`event_body\`, ?, '$.tags') OR NOT JSON_CONTAINS(\`${criteria.alias}\`.\`event_body\`, ?, '$.tags')))`,
    );
    expect(params['param_0']).toBe(JSON.stringify(valuesToExclude[0]));
    expect(params['param_1']).toBe(JSON.stringify(valuesToExclude[1]));
    expect(results.length).toBe(expectedEvents.length);
  });
});
