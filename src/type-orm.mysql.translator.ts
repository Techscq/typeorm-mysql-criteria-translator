import { type ObjectLiteral, SelectQueryBuilder } from 'typeorm';
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
import { TypeOrmConditionBuilder } from './utils/type-orm-condition-builder.js';
import { TypeOrmJoinApplier } from './utils/type-orm-join-applier.js';
import { QueryState } from './utils/query-state.js';
import { QueryApplier } from './utils/query-applier.js';

/**
 * TypeOrmMysqlTranslator translates a Criteria object into a TypeORM SelectQueryBuilder
 * for MySQL databases. It orchestrates the process of building the SQL query
 * by delegating responsibilities to specialized helper classes.
 */
export class TypeOrmMysqlTranslator<
  T extends ObjectLiteral,
> extends CriteriaTranslator<
  SelectQueryBuilder<T>,
  SelectQueryBuilder<T>,
  TypeOrmConditionFragment
> {
  private _parameterManager: TypeOrmParameterManager;
  private _filterFragmentBuilder: TypeOrmFilterFragmentBuilder;
  private _conditionBuilder: TypeOrmConditionBuilder;
  private _joinApplier: TypeOrmJoinApplier<T>;
  private _queryState: QueryState;
  private _queryApplier: QueryApplier<T>;

  /**
   * Constructs a new TypeOrmMysqlTranslator instance.
   * Initializes all necessary helper classes for query translation.
   */
  constructor() {
    super();
    this._parameterManager = new TypeOrmParameterManager();
    this._filterFragmentBuilder = new TypeOrmFilterFragmentBuilder(
      this._parameterManager,
    );
    this._conditionBuilder = new TypeOrmConditionBuilder(
      this._parameterManager,
      this._filterFragmentBuilder,
    );
    this._queryState = new QueryState();
    this._queryApplier = new QueryApplier<T>(
      this._conditionBuilder,
      this._queryState,
    );
    this._joinApplier = new TypeOrmJoinApplier<T>(
      this._conditionBuilder,
      this._queryState,
    );
  }

  /**
   * Translates a RootCriteria object into a TypeORM SelectQueryBuilder.
   * This is the main entry point for the translation process.
   * @param criteria The RootCriteria object to translate.
   * @param source The initial TypeORM SelectQueryBuilder.
   * @returns The modified SelectQueryBuilder with the translated criteria applied.
   */
  public override translate<RootCriteriaSchema extends CriteriaSchema>(
    criteria: RootCriteria<RootCriteriaSchema>,
    source: SelectQueryBuilder<T>,
  ): SelectQueryBuilder<T> {
    this._queryState.reset();
    this._queryState.resolveSelects(criteria.alias, criteria);
    criteria.accept(this, source);
    this._queryState.collectCursor(criteria.alias, criteria.cursor);

    this._queryState.recordOrderBy(criteria.orders, criteria.alias);

    if (criteria.take > 0) {
      source.take(criteria.take);
    }
    if (criteria.skip > 0 && !criteria.cursor) {
      source.skip(criteria.skip);
    }

    for (const joinDetail of criteria.joins) {
      joinDetail.criteria.accept(this, joinDetail.parameters, source);
    }

    this._queryApplier.applyCursors(source);
    this._queryApplier.applyOrderBy(source);
    this._queryApplier.applySelects(source);

    return source;
  }

  /**
   * Visits a Filter expression and builds its corresponding TypeORM condition fragment.
   * @param filter The Filter object to visit.
   * @param currentAlias The alias of the entity the filter applies to.
   * @returns A TypeOrmConditionFragment representing the filter's SQL.
   */
  public visitFilter<FieldType extends string, Operator extends FilterOperator>(
    filter: Filter<FieldType, Operator>,
    currentAlias: string,
  ): TypeOrmConditionFragment {
    return this._filterFragmentBuilder.build(filter, currentAlias);
  }

  /**
   * Visits the root criteria and applies its filter group to the query builder.
   * @param criteria The RootCriteria object to visit.
   * @param qb The TypeORM SelectQueryBuilder.
   */
  public visitRoot<RootCriteriaSchema extends CriteriaSchema>(
    criteria: RootCriteria<RootCriteriaSchema>,
    qb: SelectQueryBuilder<T>,
  ): void {
    if (criteria.rootFilterGroup.items.length > 0) {
      const appliedWhere = this._conditionBuilder.processGroupItems(
        criteria.rootFilterGroup.items,
        criteria.alias,
        qb,
        criteria.rootFilterGroup.logicalOperator,
        this,
      );
      this._queryState.setQueryHasWhereClauses(appliedWhere);
    }
  }

  /**
   * Visits an AND logical group and processes its items.
   * @param group The FilterGroup representing an AND group.
   * @param currentAlias The alias of the entity the group applies to.
   * @param qb The TypeORM SelectQueryBuilder.
   */
  public visitAndGroup<FieldType extends string>(
    group: FilterGroup<FieldType>,
    currentAlias: string,
    qb: SelectQueryBuilder<T>,
  ) {
    this._conditionBuilder.processGroupItems(
      group.items,
      currentAlias,
      qb,
      LogicalOperator.AND,
      this,
    );
  }

  /**
   * Visits an OR logical group and processes its items.
   * @param group The FilterGroup representing an OR group.
   * @param currentAlias The alias of the entity the group applies to.
   * @param qb The TypeORM SelectQueryBuilder.
   */
  public visitOrGroup<FieldType extends string>(
    group: FilterGroup<FieldType>,
    currentAlias: string,
    qb: SelectQueryBuilder<T>,
  ) {
    this._conditionBuilder.processGroupItems(
      group.items,
      currentAlias,
      qb,
      LogicalOperator.OR,
      this,
    );
  }

  /**
   * Visits an InnerJoinCriteria and applies the inner join logic to the query builder.
   * @param criteria The InnerJoinCriteria object to visit.
   * @param parameters Join parameters.
   * @param qb The TypeORM SelectQueryBuilder.
   */
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

  /**
   * Visits a LeftJoinCriteria and applies the left join logic to the query builder.
   * @param criteria The LeftJoinCriteria object to visit.
   * @param parameters Join parameters.
   * @param qb The TypeORM SelectQueryBuilder.
   */
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

  /**
   * Visits an OuterJoinCriteria.
   * @param _criteria The OuterJoinCriteria object to visit.
   * @param _parameters Join parameters.
   * @param _context The TypeORM SelectQueryBuilder.
   * @throws Error as FULL OUTER JOIN is not generically implemented for MySQL.
   */
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
