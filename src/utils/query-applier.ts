import { Brackets, type ObjectLiteral, type SelectQueryBuilder } from 'typeorm';
import { TypeOrmConditionBuilder } from './type-orm-condition-builder.js';
import { QueryState } from './query-state.js';
import {
  FilterOperator,
  OrderDirection,
} from '@nulledexp/translatable-criteria';

/**
 * QueryApplier is responsible for applying the collected query state
 * (selects, orders, cursors) to a TypeORM SelectQueryBuilder.
 * This class modifies the QueryBuilder based on the processed criteria.
 */
export class QueryApplier<T extends ObjectLiteral> {
  /**
   * Constructs a new QueryApplier instance.
   * @param _conditionBuilder The TypeOrmConditionBuilder instance for building conditions.
   * @param _queryState The QueryState instance for accessing collected query state.
   */
  constructor(
    private _conditionBuilder: TypeOrmConditionBuilder,
    private _queryState: QueryState,
  ) {}

  /**
   * Applies collected select fields to the query builder.
   * @param qb The TypeORM SelectQueryBuilder.
   */
  public applySelects(qb: SelectQueryBuilder<T>): void {
    if (this._queryState.getSelects().size > 0) {
      qb.select(Array.from(this._queryState.getSelects().values()));
    }
  }

  /**
   * Applies collected order-by clauses to the query builder.
   * This includes both explicit order-by clauses and those derived from cursor pagination.
   * @param qb The TypeORM SelectQueryBuilder.
   */
  public applyOrderBy(qb: SelectQueryBuilder<T>): void {
    this._queryState.sortOrderByWithSequentialId();
    let isFirstOverallOrderByApplied = false;

    if (this._queryState.getCursorOrderBy().length > 0) {
      this._queryState
        .getCursorOrderBy()
        .forEach(([parsedField, orderDirection], index) => {
          if (index === 0) {
            qb.orderBy(parsedField, orderDirection);
            isFirstOverallOrderByApplied = true;
          } else {
            qb.addOrderBy(parsedField, orderDirection);
          }
        });
    }

    for (const [alias, orderInstance] of this._queryState.getOrderBy()) {
      const fieldPath = `${alias}.${String(orderInstance.field)}`;
      if (!isFirstOverallOrderByApplied) {
        qb.orderBy(fieldPath, orderInstance.direction);
        isFirstOverallOrderByApplied = true;
      } else {
        qb.addOrderBy(fieldPath, orderInstance.direction);
      }
    }
  }

  /**
   * Applies collected cursor conditions to the query builder.
   * This method constructs the WHERE clause for keyset pagination.
   * @param qb The TypeORM SelectQueryBuilder.
   */
  public applyCursors(qb: SelectQueryBuilder<T>): void {
    if (this._queryState.cursorWasApplied()) {
      return;
    }

    const combinedFilters = this._queryState.processAndValidateCursors();

    if (combinedFilters.length > 0) {
      const cursorCondition =
        this._conditionBuilder.buildCursorCondition(combinedFilters);
      const cursorBracket = new Brackets((bracketQb) => {
        bracketQb.where(
          cursorCondition.queryFragment,
          cursorCondition.parameters,
        );
      });

      if (this._queryState.hasWhereClauses()) {
        qb.andWhere(cursorBracket);
      } else {
        qb.where(cursorBracket);
        this._queryState.setQueryHasWhereClauses(true);
      }

      for (const filter of combinedFilters) {
        const orderDirection =
          filter.operator === FilterOperator.GREATER_THAN
            ? OrderDirection.ASC
            : OrderDirection.DESC;
        this._queryState.addCursorOrderBy(String(filter.field), orderDirection);
      }
    }

    this._queryState.setCursorWasApplied(true);
  }
}