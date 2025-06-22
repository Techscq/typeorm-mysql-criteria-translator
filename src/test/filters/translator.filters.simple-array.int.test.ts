import {
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
} from '../utils/fake-entities.js';
import { PostEntity } from '../utils/entities/post.entity.js';
import { beforeEach, describe, expect, it, beforeAll } from 'vitest';
import {
  CriteriaFactory,
  FilterOperator,
  type RootCriteria,
} from '@nulledexp/translatable-criteria';

describe('TypeOrmMysqlTranslator - Simple Array (categories) Filters', () => {
  let translator: TypeOrmMysqlTranslator<ObjectLiteral>;
  let allPostsFromDB: Post[];

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
    allPostsFromDB = await dataSource.getRepository(PostEntity).find();
  });

  beforeEach(() => {
    translator = new TypeOrmMysqlTranslator();
  });

  it('should translate IS_NULL for categories field', async () => {
    const postsWithNullCategories = allPostsFromDB.filter(
      (p) => p.categories === null,
    );
    if (postsWithNullCategories.length === 0) {
      throw new Error(
        'Test data issue: No posts with NULL categories found.',
      );
    }

    const criteria = CriteriaFactory.GetCriteria(CriteriaPostSchema).where({
      field: 'categories',
      operator: FilterOperator.IS_NULL,
      value: null,
    });

    const qb = await translateAndGetQueryBuilder<Post>(criteria, PostEntity);
    const sql = qb.getSql();
    const fetchedPosts = await qb.getMany();

    expect(sql).toContain(`\`${criteria.alias}\`.\`categories\` IS NULL`);
    expect(fetchedPosts.length).toBe(postsWithNullCategories.length);
    fetchedPosts.forEach((fp) => expect(fp.categories).toBeNull());
  });

  it('should translate IS_NOT_NULL for categories field', async () => {
    const postsWithNonNullCategories = allPostsFromDB.filter(
      (p) => p.categories !== null,
    );
    if (postsWithNonNullCategories.length === 0) {
      throw new Error(
        'Test data issue: No posts with NON-NULL categories found.',
      );
    }

    const criteria = CriteriaFactory.GetCriteria(CriteriaPostSchema).where({
      field: 'categories',
      operator: FilterOperator.IS_NOT_NULL,
      value: null,
    });

    const qb = await translateAndGetQueryBuilder<Post>(criteria, PostEntity);
    const sql = qb.getSql();
    const fetchedPosts = await qb.getMany();

    expect(sql).toContain(`\`${criteria.alias}\`.\`categories\` IS NOT NULL`);
    expect(fetchedPosts.length).toBe(postsWithNonNullCategories.length);
    fetchedPosts.forEach((fp) => expect(fp.categories).not.toBeNull());
  });

  it('should translate SET_CONTAINS for categories field', async () => {
    const targetCategory = 'tech';
    const postsWithTechCategory = allPostsFromDB.filter((p) =>
      p.categories?.includes(targetCategory),
    );

    if (postsWithTechCategory.length === 0) {
      throw new Error(
        `Test data issue: No posts with category "${targetCategory}" found.`,
      );
    }

    const criteria = CriteriaFactory.GetCriteria(CriteriaPostSchema).where({
      field: 'categories',
      operator: FilterOperator.SET_CONTAINS,
      value: targetCategory,
    });

    const qb = await translateAndGetQueryBuilder<Post>(criteria, PostEntity);
    const sql = qb.getSql();
    const params = qb.getParameters();
    const fetchedPosts = await qb.getMany();

    expect(sql).toContain(
      `(\`${criteria.alias}\`.\`categories\` IS NOT NULL AND FIND_IN_SET(?, \`${criteria.alias}\`.\`categories\`) > 0)`,
    );
    expect(params['param_0']).toBe(targetCategory);
    expect(fetchedPosts.length).toBe(postsWithTechCategory.length);
    fetchedPosts.forEach((fp) =>
      expect(fp.categories).toContain(targetCategory),
    );
  });

  it('should translate SET_NOT_CONTAINS for categories field', async () => {
    const targetCategoryToExclude = 'news';
    const postsWithoutNewsCategory = allPostsFromDB.filter(
      (p) => !p.categories?.includes(targetCategoryToExclude),
    );

    if (postsWithoutNewsCategory.length === 0 && allPostsFromDB.length > 0) {
      throw new Error(
        `Test data issue: All posts seem to contain "${targetCategoryToExclude}".`,
      );
    }

    const criteria = CriteriaFactory.GetCriteria(CriteriaPostSchema).where({
      field: 'categories',
      operator: FilterOperator.SET_NOT_CONTAINS,
      value: targetCategoryToExclude,
    });

    const qb = await translateAndGetQueryBuilder<Post>(criteria, PostEntity);
    const sql = qb.getSql();
    const params = qb.getParameters();
    const fetchedPosts = await qb.getMany();

    expect(sql).toContain(
      `(\`${criteria.alias}\`.\`categories\` IS NULL OR FIND_IN_SET(?, \`${criteria.alias}\`.\`categories\`) = 0)`,
    );
    expect(params['param_0']).toBe(targetCategoryToExclude);
    expect(fetchedPosts.length).toBe(postsWithoutNewsCategory.length);
    fetchedPosts.forEach((fp) => {
      if (fp.categories !== null) {
        expect(fp.categories).not.toContain(targetCategoryToExclude);
      }
    });
  });

  it('should translate SET_CONTAINS for a category that does not exist in any post', async () => {
    const nonExistentCategory = 'non_existent_category_xyz123';

    const criteria = CriteriaFactory.GetCriteria(CriteriaPostSchema).where({
      field: 'categories',
      operator: FilterOperator.SET_CONTAINS,
      value: nonExistentCategory,
    });

    const qb = await translateAndGetQueryBuilder<Post>(criteria, PostEntity);
    const sql = qb.getSql();
    const params = qb.getParameters();
    const fetchedPosts = await qb.getMany();

    expect(sql).toContain(
      `(\`${criteria.alias}\`.\`categories\` IS NOT NULL AND FIND_IN_SET(?, \`${criteria.alias}\`.\`categories\`) > 0)`,
    );
    expect(params['param_0']).toBe(nonExistentCategory);
    expect(fetchedPosts.length).toBe(0);
  });
});