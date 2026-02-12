import {
  CriteriaFactory,
  SelectType,
  FilterOperator,
} from '@nulledexp/translatable-criteria';
import {
  initializeDataSourceService,
  TypeORMUtils,
} from '../utils/type-orm.utils.js';
import { TypeOrmMysqlTranslator } from '../../type-orm.mysql.translator.js';
import { PostSchema, UserSchema } from '../utils/fake-entities.js';
import { UserEntity } from '../utils/entities/user.entity.js';

describe('Join Options Integration Tests', () => {
  beforeAll(async () => {
    await initializeDataSourceService(false);
  });

  it('should select full entity when SelectType.FULL_ENTITY is used (default)', async () => {
    const translator = new TypeOrmMysqlTranslator();
    const qb = await TypeORMUtils.getQueryBuilderFor(
      UserEntity,
      UserSchema.alias,
    );

    const criteria = CriteriaFactory.GetCriteria(UserSchema).join(
      'posts',
      CriteriaFactory.GetInnerJoinCriteria(PostSchema),
      { select: SelectType.FULL_ENTITY },
    );

    translator.translate(criteria, qb);
    const result = await qb.getOne();

    expect(result).toBeDefined();
    expect(result!.posts).toBeDefined();
    expect(result!.posts.length).toBeGreaterThan(0);
    // Check if fields other than ID are present
    expect(result!.posts[0]!.title).toBeDefined();
  });

  it('should select only ID when SelectType.ID_ONLY is used', async () => {
    const translator = new TypeOrmMysqlTranslator();
    const qb = await TypeORMUtils.getQueryBuilderFor(
      UserEntity,
      UserSchema.alias,
    );

    const criteria = CriteriaFactory.GetCriteria(UserSchema).join(
      'posts',
      CriteriaFactory.GetInnerJoinCriteria(PostSchema),
      { select: SelectType.ID_ONLY },
    );

    translator.translate(criteria, qb);
    const result = await qb.getOne();

    expect(result).toBeDefined();
    expect(result!.posts).toBeDefined();
    expect(result!.posts.length).toBeGreaterThan(0);
    // ID should be present
    result!.posts.forEach((post) => {
      expect(typeof post).toBe('string');
    });
  });

  it('should not select entity fields when SelectType.NO_SELECTION is used (filter-only join)', async () => {
    const translator = new TypeOrmMysqlTranslator();
    const qb = await TypeORMUtils.getQueryBuilderFor(
      UserEntity,
      UserSchema.alias,
    );

    // Join posts just to filter users who have posts with a specific title, but don't select the posts
    const criteria = CriteriaFactory.GetCriteria(UserSchema).join(
      'posts',
      CriteriaFactory.GetInnerJoinCriteria(PostSchema).where({
        field: 'title',
        operator: FilterOperator.IS_NOT_NULL,
        value: undefined,
      }),
      { select: SelectType.NO_SELECTION },
    );

    translator.translate(criteria, qb);
    const result = await qb.getOne();

    expect(result).toBeDefined();
    // Posts should NOT be loaded/hydrated on the user object because we didn't select them
    // Note: TypeORM might return an empty array or undefined depending on relation config,
    // but the key is that the data wasn't fetched in the main query.
    // However, since we are not using loadRelationIds for this test case explicitly,
    // and we didn't select the alias, TypeORM shouldn't map it.
    // BUT, if lazy loading is enabled or other things, it might differ.
    // Assuming standard eager/lazy config from entities.
    // In our case, we expect 'posts' to be missing or empty/undefined if not selected.

    // Actually, if we don't select the relation, TypeORM won't map it to the property
    // unless we used loadAllRelationIds (which we might have triggered if logic was different).
    // In the new logic, SelectType.NO_SELECTION means we don't addSelect(alias).

    // Let's verify the SQL or the result.
    // If we check the result, `posts` should be undefined or empty if not loaded.
    // Since we are using `getOne`, and we didn't select `posts`, it shouldn't be there.
    expect(result!.posts).toBeUndefined();
  });
});
