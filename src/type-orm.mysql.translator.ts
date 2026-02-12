import { Brackets, type ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import {
  CriteriaTranslator,
  type CriteriaSchema,
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
  SelectType,
} from '@nulledexp/translatable-criteria';
import {
  TypeOrmFilterFragmentBuilder,
  type TypeOrmConditionFragment,
} from './utils/type-orm-filter-fragment-builder.js';
import { TypeOrmConditionBuilder } from './utils/type-orm-condition-builder.js';
import { TypeOrmJoinApplier } from './utils/type-orm-join-applier.js';
import { QueryState } from './utils/query-state.js';
import { QueryApplier } from './utils/query-applier.js';
import { TypeOrmParameterManager } from './utils/type-orm-parameter-manager.js';

/**
 * Translates a Criteria object into a TypeORM SelectQueryBuilder for MySQL.
 * Orchestrates query building by delegating to specialized helpers.
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
   * Main entry point. Translates RootCriteria into a TypeORM SelectQueryBuilder.
   * @param criteria The RootCriteria to translate.
   * @param source The initial SelectQueryBuilder.
   * @returns The modified SelectQueryBuilder.
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
    this.applyRelationIdLoading(criteria, source);
    this._queryApplier.applyOrderBy(source);
    this._queryApplier.applySelects(source);

    return source;
  }

  /**
   * Loads relation IDs for joins configured with SelectType.ID_ONLY.
   */
  private applyRelationIdLoading(
    criteria: RootCriteria<any>,
    qb: SelectQueryBuilder<T>,
  ) {
    const relationsToLoad: string[] = [];
    this.collectRelationIds(criteria, '', relationsToLoad);

    if (relationsToLoad.length > 0) {
      qb.loadAllRelationIds({
        relations: relationsToLoad,
      });
    }
  }

  private collectRelationIds(
    criteria:
      | RootCriteria<any>
      | InnerJoinCriteria<any>
      | LeftJoinCriteria<any>,
    pathPrefix: string,
    collector: string[],
  ) {
    for (const joinDetail of criteria.joins) {
      const currentPath = pathPrefix
        ? `${pathPrefix}.${joinDetail.parameters.relation_alias}`
        : joinDetail.parameters.relation_alias;

      if (joinDetail.parameters.join_options?.select === SelectType.ID_ONLY) {
        collector.push(currentPath);
      }

      this.collectRelationIds(joinDetail.criteria, currentPath, collector);
    }
  }

  /**
   * Builds a TypeORM condition fragment from a Filter expression.
   */
  public visitFilter<FieldType extends string, Operator extends FilterOperator>(
    filter: Filter<FieldType, Operator>,
    currentAlias: string,
  ): TypeOrmConditionFragment {
    return this._filterFragmentBuilder.build(filter, currentAlias);
  }

  /**
   * Applies the root filter group to the query builder.
   */
  public visitRoot<RootCriteriaSchema extends CriteriaSchema>(
    criteria: RootCriteria<RootCriteriaSchema>,
    qb: SelectQueryBuilder<T>,
  ): void {
    if (criteria.rootFilterGroup.items.length > 0) {
      const rootBracket = new Brackets((bracketQb) => {
        this._conditionBuilder.processGroupItems(
          criteria.rootFilterGroup.items,
          criteria.alias,
          bracketQb,
          criteria.rootFilterGroup.logicalOperator,
          this,
        );
      });
      qb.where(rootBracket);
      this._queryState.setQueryHasWhereClauses(true);
    }
  }

  /**
   * Processes an AND logical group.
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
   * Processes an OR logical group.
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
   * Applies inner join logic.
   */
  public visitInnerJoin<
    ParentCSchema extends CriteriaSchema,
    JoinCriteriaSchema extends CriteriaSchema,
  >(
    criteria: InnerJoinCriteria<JoinCriteriaSchema>,
    parameters:
      | PivotJoin<ParentCSchema, JoinCriteriaSchema>
      | SimpleJoin<ParentCSchema, JoinCriteriaSchema>,
    qb: SelectQueryBuilder<T>,
  ) {
    this.applyJoinAndVisitChildren('inner', criteria, parameters, qb);
  }

  /**
   * Applies left join logic.
   */
  public visitLeftJoin<
    ParentCSchema extends CriteriaSchema,
    JoinCriteriaSchema extends CriteriaSchema,
  >(
    criteria: LeftJoinCriteria<JoinCriteriaSchema>,
    parameters:
      | PivotJoin<ParentCSchema, JoinCriteriaSchema>
      | SimpleJoin<ParentCSchema, JoinCriteriaSchema>,
    qb: SelectQueryBuilder<T>,
  ) {
    this.applyJoinAndVisitChildren('left', criteria, parameters, qb);
  }

  /**
   * Applies join logic and recursively visits child joins.
   */
  private applyJoinAndVisitChildren<
    ParentCSchema extends CriteriaSchema,
    JoinCriteriaSchema extends CriteriaSchema,
  >(
    joinType: 'inner' | 'left',
    criteria:
      | InnerJoinCriteria<JoinCriteriaSchema>
      | LeftJoinCriteria<JoinCriteriaSchema>,
    parameters:
      | PivotJoin<ParentCSchema, JoinCriteriaSchema>
      | SimpleJoin<ParentCSchema, JoinCriteriaSchema>,
    qb: SelectQueryBuilder<T>,
  ) {
    const { usedAlias } = this._joinApplier.applyJoinLogic(
      qb,
      joinType,
      criteria,
      parameters,
    );
    for (const joinDetail of criteria.joins) {
      joinDetail.criteria.accept(
        this,
        { ...joinDetail.parameters, parent_alias: usedAlias },
        qb,
      );
    }
  }

  /**
   * Throws error for OuterJoin (not implemented).
   */
  public visitOuterJoin<
    ParentCSchema extends CriteriaSchema,
    JoinCriteriaSchema extends CriteriaSchema,
  >(
    _criteria: OuterJoinCriteria<JoinCriteriaSchema>,
    _parameters:
      | PivotJoin<ParentCSchema, JoinCriteriaSchema>
      | SimpleJoin<ParentCSchema, JoinCriteriaSchema>,
    _context: SelectQueryBuilder<T>,
  ): SelectQueryBuilder<T> {
    throw new Error(
      'OuterJoin (FULL OUTER JOIN) is not generically implemented for TypeOrmMysqlTranslator.',
    );
  }
}
