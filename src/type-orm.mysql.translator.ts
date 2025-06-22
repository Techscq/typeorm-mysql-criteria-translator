import { Brackets, type ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import {
  CriteriaTranslator,
  type CriteriaSchema,
  type JoinRelationType,
  type RootCriteria,
  FilterOperator,
  LogicalOperator,
  type Filter,
  type FilterGroup,
  type LeftJoinCriteria,
  type OuterJoinCriteria,
  type PivotJoin,
  type SimpleJoin,
  InnerJoinCriteria,
} from '@nulledexp/translatable-criteria';

import { TypeOrmParameterManager } from './utils/type-orm-parameter-manager.js';
import {
  TypeOrmFilterFragmentBuilder,
  type TypeOrmConditionFragment,
} from './utils/type-orm-filter-fragment-builder.js';
import { TypeOrmQueryStructureHelper } from './utils/type-orm-query-structure-helper.js';
import { TypeOrmJoinApplier } from './utils/type-orm-join-applier.js';

export class TypeOrmMysqlTranslator<
  T extends ObjectLiteral,
> extends CriteriaTranslator<
  SelectQueryBuilder<T>,
  SelectQueryBuilder<T>,
  TypeOrmConditionFragment
> {
  private _parameterManager: TypeOrmParameterManager;
  private _filterFragmentBuilder: TypeOrmFilterFragmentBuilder;
  private _queryStructureHelper: TypeOrmQueryStructureHelper<T>;
  private _joinApplier: TypeOrmJoinApplier<T>;

  constructor() {
    super();
    this._parameterManager = new TypeOrmParameterManager();
    this._filterFragmentBuilder = new TypeOrmFilterFragmentBuilder(
      this._parameterManager,
    );
    this._queryStructureHelper = new TypeOrmQueryStructureHelper<T>(
      this._parameterManager,
      this._filterFragmentBuilder,
    );
    this._joinApplier = new TypeOrmJoinApplier<T>(this._queryStructureHelper);
  }

  public override translate<RootCriteriaSchema extends CriteriaSchema>(
    criteria: RootCriteria<RootCriteriaSchema>,
    source: SelectQueryBuilder<T>,
  ): SelectQueryBuilder<T> {
    this._queryStructureHelper.reset();
    this._queryStructureHelper.resolveSelects(criteria.alias, criteria);
    criteria.accept(this, source);
    this._queryStructureHelper.collectCursor(criteria.alias, criteria.cursor);

    this._queryStructureHelper.recordOrderBy(criteria.orders, criteria.alias);

    if (criteria.take > 0) {
      source.take(criteria.take);
    }
    if (criteria.skip > 0 && !criteria.cursor) {
      source.skip(criteria.skip);
    }

    for (const joinDetail of criteria.joins) {
      joinDetail.criteria.accept(this, joinDetail.parameters, source);
    }

    this._queryStructureHelper.applyCollectedCursors(source);
    this._queryStructureHelper.applyOrderByToBuilder(source);
    this._queryStructureHelper.applySelectsToBuilder(source);

    return source;
  }

  public visitFilter<FieldType extends string, Operator extends FilterOperator>(
    filter: Filter<FieldType, Operator>,
    currentAlias: string,
  ): TypeOrmConditionFragment {
    return this._filterFragmentBuilder.build(filter, currentAlias);
  }

  public visitRoot<RootCriteriaSchema extends CriteriaSchema>(
    criteria: RootCriteria<RootCriteriaSchema>,
    qb: SelectQueryBuilder<T>,
  ): void {
    if (criteria.rootFilterGroup.items.length > 0) {
      qb.where(
        new Brackets((bracketQb) => {
          criteria.rootFilterGroup.accept(this, criteria.alias, bracketQb);
        }),
      );
    }
  }

  public visitAndGroup<FieldType extends string>(
    group: FilterGroup<FieldType>,
    currentAlias: string,
    qb: SelectQueryBuilder<T>,
  ) {
    this._queryStructureHelper.processGroupItems(
      group.items,
      currentAlias,
      qb,
      LogicalOperator.AND,
      this,
    );
  }

  public visitOrGroup<FieldType extends string>(
    group: FilterGroup<FieldType>,
    currentAlias: string,
    qb: SelectQueryBuilder<T>,
  ) {
    this._queryStructureHelper.processGroupItems(
      group.items,
      currentAlias,
      qb,
      LogicalOperator.OR,
      this,
    );
  }

  public visitInnerJoin<
    ParentCSchema extends CriteriaSchema,
    JoinCriteriaSchema extends CriteriaSchema,
  >(
    criteria: InnerJoinCriteria<JoinCriteriaSchema>,
    parameters:
      | PivotJoin<ParentCSchema, JoinCriteriaSchema, JoinRelationType>
      | SimpleJoin<ParentCSchema, JoinCriteriaSchema, JoinRelationType>,
    qb: SelectQueryBuilder<T>,
  ) {
    this._joinApplier.applyJoinLogic(qb, 'inner', criteria, parameters);
    for (const joinDetail of criteria.joins) {
      joinDetail.criteria.accept(this, joinDetail.parameters, qb);
    }
  }

  public visitLeftJoin<
    ParentCSchema extends CriteriaSchema,
    JoinCriteriaSchema extends CriteriaSchema,
  >(
    criteria: LeftJoinCriteria<JoinCriteriaSchema>,
    parameters:
      | PivotJoin<ParentCSchema, JoinCriteriaSchema, JoinRelationType>
      | SimpleJoin<ParentCSchema, JoinCriteriaSchema, JoinRelationType>,
    qb: SelectQueryBuilder<T>,
  ) {
    this._joinApplier.applyJoinLogic(qb, 'left', criteria, parameters);
    for (const joinDetail of criteria.joins) {
      joinDetail.criteria.accept(this, joinDetail.parameters, qb);
    }
  }

  public visitOuterJoin<
    ParentCSchema extends CriteriaSchema,
    JoinCriteriaSchema extends CriteriaSchema,
  >(
    _criteria: OuterJoinCriteria<JoinCriteriaSchema>,
    _parameters:
      | PivotJoin<ParentCSchema, JoinCriteriaSchema, JoinRelationType>
      | SimpleJoin<ParentCSchema, JoinCriteriaSchema, JoinRelationType>,
    _context: SelectQueryBuilder<T>,
  ): SelectQueryBuilder<T> {
    throw new Error(
      'OuterJoin (FULL OUTER JOIN) is not generically implemented for TypeOrmMysqlTranslator.',
    );
  }
}