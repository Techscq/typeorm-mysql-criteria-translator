import { TypeOrmMysqlTranslator } from '../../../type-orm.mysql.translator.js';
import { type ObjectLiteral } from 'typeorm';
import {
  initializeDataSourceService,
  TypeORMUtils,
} from '../../utils/type-orm.utils.js';
import {
  PostSchema as CriteriaPostSchema,
  UserSchema as CriteriaUserSchema,
  type Post,
} from '../../utils/fake-entities.js';
import { PostEntity } from '../../utils/entities/post.entity.js';
import { beforeEach, describe, expect, it, beforeAll } from 'vitest';
import {
  CriteriaFactory,
  FilterOperator,
} from '@nulledexp/translatable-criteria';

describe('TypeOrmMysqlTranslator - Many-to-One Join Translation', () => {
  let translator: TypeOrmMysqlTranslator<ObjectLiteral>;
  let actualPostsFromDB: Post[];
  beforeAll(async () => {
    const dataSource = await initializeDataSourceService(false);
    actualPostsFromDB = await dataSource
      .getRepository(PostEntity)
      .find({ relations: ['publisher'] });
  });

  beforeEach(() => {
    translator = new TypeOrmMysqlTranslator();
  });

  it('should translate an INNER JOIN (Post to User/Publisher) with a simple ON condition', async () => {
    const targetPostWithPublisher = actualPostsFromDB.find(
      (p) => p.publisher?.username === 'user_1',
    );

    if (!targetPostWithPublisher || !targetPostWithPublisher.publisher) {
      throw new Error(
        'Test data issue: Post published by user_1 not found for many-to-one JOIN test.',
      );
    }
    const usernamePart = targetPostWithPublisher.publisher.username.substring(
      0,
      3,
    );

    const rootCriteria = CriteriaFactory.GetCriteria(CriteriaPostSchema).where({
      field: 'uuid',
      operator: FilterOperator.EQUALS,
      value: targetPostWithPublisher.uuid,
    });

    const publisherJoinCriteria = CriteriaFactory.GetInnerJoinCriteria(
      CriteriaUserSchema,
    ).where({
      field: 'username',
      operator: FilterOperator.LIKE,
      value: `%${usernamePart}%`,
    });

    rootCriteria.join('publisher', publisherJoinCriteria, {
      parent_field: 'user_uuid',
      join_field: 'uuid',
    });

    const qb = await TypeORMUtils.getQueryBuilderFor<Post>(
      PostEntity,
      rootCriteria.alias,
    );
    translator.translate(rootCriteria, qb);
    const fetchedPosts = await qb.getMany();

    expect(fetchedPosts.length).toBe(1);
    const fetchedPost = fetchedPosts[0]!;
    expect(fetchedPost.uuid).toBe(targetPostWithPublisher.uuid);
    expect(fetchedPost.publisher).toBeDefined();
    expect(fetchedPost.publisher.uuid).toBe(
      targetPostWithPublisher.publisher.uuid,
    );
    expect(fetchedPost.publisher.username).toContain(usernamePart);
  });

  it('should translate an INNER JOIN (Post to User/Publisher) with a complex ON condition', async () => {
    const targetPostWithMatchingPublisher = actualPostsFromDB.find(
      (p) =>
        p.publisher &&
        ((p.publisher.username.includes('user') &&
            p.publisher.email.includes('example.com')) ||
          p.publisher.username === 'user_2'),
    );

    if (!targetPostWithMatchingPublisher) {
      throw new Error(
        'Test data issue: No post found with a publisher matching complex ON criteria.',
      );
    }

    const rootCriteria = CriteriaFactory.GetCriteria(CriteriaPostSchema).where({
      field: 'uuid',
      operator: FilterOperator.EQUALS,
      value: targetPostWithMatchingPublisher.uuid,
    });

    const publisherJoinCriteria = CriteriaFactory.GetInnerJoinCriteria(
      CriteriaUserSchema,
    )
      .where({
        field: 'username',
        operator: FilterOperator.LIKE,
        value: '%user%',
      })
      .andWhere({
        field: 'email',
        operator: FilterOperator.CONTAINS,
        value: 'example.com',
      })
      .orWhere({
        field: 'username',
        operator: FilterOperator.EQUALS,
        value: 'user_2',
      });

    rootCriteria.join('publisher', publisherJoinCriteria, {
      parent_field: 'user_uuid',
      join_field: 'uuid',
    });

    const qb = await TypeORMUtils.getQueryBuilderFor<Post>(
      PostEntity,
      rootCriteria.alias,
    );
    translator.translate(rootCriteria, qb);
    const fetchedPosts = await qb.getMany();

    expect(fetchedPosts.length).toBe(1);
    const fetchedPost = fetchedPosts[0]!;
    expect(fetchedPost.uuid).toBe(targetPostWithMatchingPublisher.uuid);
    expect(fetchedPost.publisher).toBeDefined();

    const publisher = fetchedPost.publisher;
    const conditionMet =
      (publisher.username.includes('user') &&
        publisher.email.includes('example.com')) ||
      publisher.username === 'user_2';
    expect(conditionMet).toBeTruthy();
  });
});