import { Brackets, type ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import {
  CriteriaTranslator,
  type CriteriaSchema,
  type JoinRelationType,
  type SelectedAliasOf,
  type RootCriteria,
  FilterOperator,
  LogicalOperator,
  type Filter,
  type FilterGroup,
  type LeftJoinCriteria,
  type OuterJoinCriteria,
  type PivotJoin,
  type SimpleJoin,
  type Order,
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
  private parameterManager: TypeOrmParameterManager;
  private filterFragmentBuilder: TypeOrmFilterFragmentBuilder;
  private queryStructureHelper: TypeOrmQueryStructureHelper<T>;
  private joinApplier: TypeOrmJoinApplier<T>;

  constructor() {
    super();
    this.parameterManager = new TypeOrmParameterManager();
    this.filterFragmentBuilder = new TypeOrmFilterFragmentBuilder(
      this.parameterManager,
    );
    this.queryStructureHelper = new TypeOrmQueryStructureHelper<T>(
      this.parameterManager,
      this.filterFragmentBuilder,
    );
    this.joinApplier = new TypeOrmJoinApplier<T>(this.queryStructureHelper);
  }

  visitFilter<FieldType extends string, Operator extends FilterOperator>(
    filter: Filter<FieldType, Operator>,
    currentAlias: string,
  ): TypeOrmConditionFragment {
    return this.filterFragmentBuilder.build(filter, currentAlias);
  }

  private selects: Set<string> = new Set<string>([]);
  private orderBy: Array<[SelectedAliasOf<CriteriaSchema>, Order<any>]> = [];

  visitRoot<
    RootCriteriaSchema extends CriteriaSchema,
    RootAlias extends SelectedAliasOf<RootCriteriaSchema>,
  >(
    criteria: RootCriteria<RootCriteriaSchema, RootAlias>,
    qb: SelectQueryBuilder<T>,
  ): SelectQueryBuilder<T> {
    this.parameterManager.reset();
    this.selects = new Set<string>([]);
    this.orderBy = [];
    this.queryStructureHelper.resolveSelects(criteria, this.selects);
    let mainWhereClauseApplied = false;

    if (criteria.rootFilterGroup.items.length > 0) {
      qb.where(
        new Brackets((bracketQb) => {
          criteria.rootFilterGroup.accept(this, criteria.alias, bracketQb);
        }),
      );
      mainWhereClauseApplied = true;
    }

    if (criteria.cursor) {
      const cursorCondition = this.queryStructureHelper.buildCursorCondition(
        criteria.cursor,
        criteria.alias,
      );
      if (mainWhereClauseApplied) {
        qb.andWhere(
          new Brackets((bracketQb) => {
            bracketQb.where(
              cursorCondition.queryFragment,
              cursorCondition.parameters,
            );
          }),
        );
      } else {
        qb.where(
          new Brackets((bracketQb) => {
            bracketQb.where(
              cursorCondition.queryFragment,
              cursorCondition.parameters,
            );
          }),
        );
      }
      for (const [index, filter] of criteria.cursor.filters.entries()) {
        const orderByField = `${criteria.alias}.${String(filter.field)}`;
        if (index === 0) qb.orderBy(orderByField, criteria.cursor.order);
        else qb.addOrderBy(orderByField, criteria.cursor.order);
      }
    }

    criteria.orders.forEach((order) => {
      this.orderBy.push([criteria.alias, order]);
    });

    if (criteria.take > 0) qb.take(criteria.take);
    if (criteria.skip > 0 && !criteria.cursor) qb.skip(criteria.skip);

    for (const joinDetail of criteria.joins) {
      joinDetail.criteria.accept(this, joinDetail.parameters, qb);
    }

    this.orderBy.sort((a, b) => a[1].sequenceId - b[1].sequenceId);
    for (const [index, [alias, order]] of this.orderBy.entries()) {
      if (index === 0 && !criteria.cursor) {
        qb.orderBy(`${alias}.${order.field}`, order.direction);
      } else {
        qb.addOrderBy(`${alias}.${order.field}`, order.direction);
      }
    }
    return qb.select(Array.from(this.selects.values()));
  }

  visitAndGroup<FieldType extends string>(
    group: FilterGroup<FieldType>,
    currentAlias: string,
    qb: SelectQueryBuilder<T>,
  ): SelectQueryBuilder<T> {
    this.queryStructureHelper.processGroupItems(
      group.items,
      currentAlias,
      qb,
      LogicalOperator.AND,
      this,
    );
    return qb;
  }

  visitOrGroup<FieldType extends string>(
    group: FilterGroup<FieldType>,
    currentAlias: string,
    qb: SelectQueryBuilder<T>,
  ): SelectQueryBuilder<T> {
    this.queryStructureHelper.processGroupItems(
      group.items,
      currentAlias,
      qb,
      LogicalOperator.OR,
      this,
    );
    return qb;
  }

  visitInnerJoin<
    ParentCSchema extends CriteriaSchema,
    JoinCriteriaSchema extends CriteriaSchema,
    JoinAlias extends SelectedAliasOf<JoinCriteriaSchema>,
  >(
    criteria: InnerJoinCriteria<JoinCriteriaSchema, JoinAlias>,
    parameters:
      | PivotJoin<ParentCSchema, JoinCriteriaSchema, JoinRelationType>
      | SimpleJoin<ParentCSchema, JoinCriteriaSchema, JoinRelationType>,
    qb: SelectQueryBuilder<T>,
  ): SelectQueryBuilder<T> {
    this.joinApplier.applyJoinLogic(
      qb,
      'inner',
      criteria,
      parameters,
      this.selects,
      this.orderBy,
    );
    for (const joinDetail of criteria.joins) {
      joinDetail.criteria.accept(this, joinDetail.parameters, qb);
    }
    return qb;
  }

  visitLeftJoin<
    ParentCSchema extends CriteriaSchema,
    JoinCriteriaSchema extends CriteriaSchema,
    JoinAlias extends SelectedAliasOf<JoinCriteriaSchema>,
  >(
    criteria: LeftJoinCriteria<JoinCriteriaSchema, JoinAlias>,
    parameters:
      | PivotJoin<ParentCSchema, JoinCriteriaSchema, JoinRelationType>
      | SimpleJoin<ParentCSchema, JoinCriteriaSchema, JoinRelationType>,
    qb: SelectQueryBuilder<T>,
  ): SelectQueryBuilder<T> {
    this.joinApplier.applyJoinLogic(
      qb,
      'left',
      criteria,
      parameters,
      this.selects,
      this.orderBy,
    );
    for (const joinDetail of criteria.joins) {
      joinDetail.criteria.accept(this, joinDetail.parameters, qb);
    }
    return qb;
  }

  visitOuterJoin<
    ParentCSchema extends CriteriaSchema,
    JoinCriteriaSchema extends CriteriaSchema,
    JoinAlias extends SelectedAliasOf<JoinCriteriaSchema>,
  >(
    _criteria: OuterJoinCriteria<JoinCriteriaSchema, JoinAlias>,
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
