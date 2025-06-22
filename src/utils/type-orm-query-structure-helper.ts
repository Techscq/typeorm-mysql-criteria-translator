import { Brackets, type ObjectLiteral, type SelectQueryBuilder } from 'typeorm';
import type { TypeOrmParameterManager } from './type-orm-parameter-manager.js';
import type {
  TypeOrmConditionFragment,
  TypeOrmFilterFragmentBuilder,
} from './type-orm-filter-fragment-builder.js';
import {
  type CriteriaSchema,
  type FieldOfSchema,
  Filter,
  FilterOperator,
  type ICriteriaBase,
  type IFilterExpression,
  LogicalOperator,
  type Cursor,
  FilterGroup,
  type Order,
  OrderDirection,
  type FilterPrimitive,
} from '@nulledexp/translatable-criteria';

export class TypeOrmQueryStructureHelper<T extends ObjectLiteral> {
  private _selects: Set<string> = new Set<string>([]);
  private _orderBy: Array<[string, Order<any>]> = [];
  private _cursorOrderBy: Array<[string, OrderDirection]> = [];
  private _queryHasWhereClauses: boolean = false;
  private _collectedCursors: Array<
    [
      string,
      Cursor<string, FilterOperator.GREATER_THAN | FilterOperator.LESS_THAN>,
    ]
  > = [];
  private _cursorWasApplied: boolean = false;

  constructor(
    private _parameterManager: TypeOrmParameterManager,
    private _filterFragmentBuilder: TypeOrmFilterFragmentBuilder,
  ) {}

  public reset(): void {
    this._selects.clear();
    this._orderBy = [];
    this._cursorOrderBy = [];
    this._queryHasWhereClauses = false;
    this._collectedCursors = [];
    this._cursorWasApplied = false;
  }

  public collectCursor(
    alias: string,
    cursor:
      | Cursor<string, FilterOperator.GREATER_THAN | FilterOperator.LESS_THAN>
      | undefined,
  ): void {
    if (cursor) {
      this._collectedCursors.push([alias, cursor]);
    }
  }

  private _processAndValidateCursors(): FilterPrimitive<
    string,
    FilterOperator.GREATER_THAN | FilterOperator.LESS_THAN
  >[] {
    if (
      this._collectedCursors.length === 0 ||
      this._collectedCursors[0] === undefined
    ) {
      return [];
    }

    this._collectedCursors.sort((a, b) => a[1].sequenceId - b[1].sequenceId);

    const commonDirection = this._collectedCursors[0][1].order;
    const commonOperator = this._collectedCursors[0][1].operator;

    const combinedFilters: FilterPrimitive<
      string,
      FilterOperator.GREATER_THAN | FilterOperator.LESS_THAN
    >[] = [];

    for (const [alias, cursor] of this._collectedCursors) {
      if (cursor.order !== commonDirection) {
        throw new Error(
          'All parts of a composite cursor must have the same order direction.',
        );
      }
      if (cursor.operator !== commonOperator) {
        throw new Error(
          'All parts of a composite cursor must have the same operator.',
        );
      }

      for (const filter of cursor.filters) {
        combinedFilters.push({
          operator: filter.operator,
          field: `${alias}.${filter.field}`,
          value: filter.value,
        });
      }
    }

    if (combinedFilters.length > 2) {
      throw new Error(
        'A combined cursor cannot have more than two fields in total.',
      );
    }

    return combinedFilters;
  }

  public applyCollectedCursors(qb: SelectQueryBuilder<T>): void {
    if (this._cursorWasApplied) {
      return;
    }

    const combinedFilters = this._processAndValidateCursors();

    if (combinedFilters.length > 0) {
      const cursorCondition = this.buildCursorCondition(combinedFilters);
      const cursorBracket = new Brackets((bracketQb) => {
        bracketQb.where(
          cursorCondition.queryFragment,
          cursorCondition.parameters,
        );
      });

      if (this._queryHasWhereClauses) {
        qb.andWhere(cursorBracket);
      } else {
        qb.where(cursorBracket);
        this._queryHasWhereClauses = true;
      }

      for (const filter of combinedFilters) {
        const orderDirection =
          filter.operator === FilterOperator.GREATER_THAN
            ? OrderDirection.ASC
            : OrderDirection.DESC;
        this._cursorOrderBy.push([String(filter.field), orderDirection]);
      }
    }

    this._cursorWasApplied = true;
  }

  public buildCursorCondition(
    filters: FilterPrimitive<
      string,
      FilterOperator.GREATER_THAN | FilterOperator.LESS_THAN
    >[],
  ): TypeOrmConditionFragment {
    const op = filters[0]!.operator === FilterOperator.GREATER_THAN ? '>' : '<';
    const parameters: ObjectLiteral = {};

    const p1 = filters[0]!;
    const field1Name = p1.field;
    const value1 = p1.value;
    const paramName1 = this._parameterManager.generateParamName();

    if (filters.length === 1) {
      if (value1 === null) {
        const query = op === '>' ? `${field1Name} IS NOT NULL` : '1=0';
        return { queryFragment: `(${query})`, parameters: {} };
      }
      parameters[paramName1] = value1;
      const query = `${field1Name} ${op} :${paramName1}`;
      return { queryFragment: `(${query})`, parameters };
    }

    const p2 = filters[1]!;
    const field2Name = p2.field;
    const value2 = p2.value;
    const paramName2 = this._parameterManager.generateParamName();

    let queryFragment = '';

    if (op === '>') {
      if (value1 === null) {
        parameters[paramName2] = value2;
        queryFragment = `((${field1Name} IS NOT NULL) OR (${field1Name} IS NULL AND ${field2Name} > :${paramName2}))`;
      } else {
        parameters[paramName1] = value1;
        parameters[paramName2] = value2;
        queryFragment = `((${field1Name} > :${paramName1}) OR (${field1Name} = :${paramName1} AND ${field2Name} > :${paramName2}))`;
      }
    } else {
      if (value1 === null) {
        parameters[paramName2] = value2;
        queryFragment = `(${field1Name} IS NULL AND ${field2Name} < :${paramName2})`;
      } else {
        parameters[paramName1] = value1;
        parameters[paramName2] = value2;
        queryFragment = `((${field1Name} < :${paramName1}) OR (${field1Name} = :${paramName1} AND ${field2Name} < :${paramName2}) OR (${field1Name} IS NULL))`;
      }
    }

    return { queryFragment, parameters };
  }

  public resolveSelects<TCriteriaSchema extends CriteriaSchema>(
    alias: string,
    criteria: ICriteriaBase<TCriteriaSchema>,
  ): void {
    criteria.orders.forEach((order) =>
      this._selects.add(`${alias}.${String(order.field)}`),
    );
    if (criteria.cursor) {
      criteria.cursor.filters.forEach((filter) => {
        this._selects.add(`${alias}.${String(filter.field)}`);
      });
    }
    criteria.select.forEach((field) =>
      this._selects.add(`${alias}.${String(field)}`),
    );
  }

  public recordOrderBy<TCriteriaSchema extends CriteriaSchema>(
    orders: ReadonlyArray<Order<FieldOfSchema<TCriteriaSchema>>>,
    alias: string,
  ): void {
    orders.forEach((order) => {
      this._orderBy.push([alias, order]);
    });
  }

  public applyOrderByToBuilder(qb: SelectQueryBuilder<T>): void {
    this._sortOrderByWithSequentialId();
    let isFirstOverallOrderByApplied = false;

    if (this._cursorOrderBy.length > 0) {
      this._cursorOrderBy.forEach(([parsedField, orderDirection], index) => {
        if (index === 0) {
          qb.orderBy(parsedField, orderDirection);
          isFirstOverallOrderByApplied = true;
        } else {
          qb.addOrderBy(parsedField, orderDirection);
        }
      });
    }

    for (const [alias, orderInstance] of this._orderBy) {
      const fieldPath = `${alias}.${String(orderInstance.field)}`;
      if (!isFirstOverallOrderByApplied) {
        qb.orderBy(fieldPath, orderInstance.direction);
        isFirstOverallOrderByApplied = true;
      } else {
        qb.addOrderBy(fieldPath, orderInstance.direction);
      }
    }
  }

  private _sortOrderByWithSequentialId(): void {
    this._orderBy.sort((a, b) => a[1].sequenceId - b[1].sequenceId);
  }

  public applyConditionToQueryBuilder(
    qb: SelectQueryBuilder<T>,
    conditionOrBracket: string | Brackets,
    isFirstInThisBracket: boolean,
    logicalConnector: LogicalOperator,
    parameters?: ObjectLiteral,
  ): void {
    if (isFirstInThisBracket) {
      qb.where(conditionOrBracket, parameters);
    } else if (logicalConnector === LogicalOperator.AND) {
      qb.andWhere(conditionOrBracket, parameters);
    } else {
      qb.orWhere(conditionOrBracket, parameters);
    }
  }

  public processGroupItems(
    items: ReadonlyArray<IFilterExpression>,
    currentAlias: string,
    qb: SelectQueryBuilder<T>,
    groupLogicalOperator: LogicalOperator,
    visitor: { visitAndGroup: Function; visitOrGroup: Function },
  ): void {
    if (items.length === 0) {
      return;
    }

    items.forEach((item, index) => {
      const isFirstItemInThisBracket = index === 0;
      if (item instanceof Filter) {
        const { queryFragment, parameters } = this._filterFragmentBuilder.build(
          item,
          currentAlias,
        );
        this.applyConditionToQueryBuilder(
          qb,
          queryFragment,
          isFirstItemInThisBracket,
          groupLogicalOperator,
          parameters,
        );
      } else if (item instanceof FilterGroup) {
        const nestedBracket = new Brackets((subQb) => {
          if (item.logicalOperator === LogicalOperator.AND) {
            visitor.visitAndGroup(item, currentAlias, subQb);
          } else {
            visitor.visitOrGroup(item, currentAlias, subQb);
          }
        });
        this.applyConditionToQueryBuilder(
          qb,
          nestedBracket,
          isFirstItemInThisBracket,
          groupLogicalOperator,
        );
      }
    });
    this._queryHasWhereClauses = true;
  }

  public buildConditionStringFromGroup(
    group: FilterGroup<any>,
    aliasForGroupItems: string,
  ): { conditionString: string; parameters: ObjectLiteral } | undefined {
    if (group.items.length === 0) {
      return undefined;
    }

    const conditions: string[] = [];
    const allParams: ObjectLiteral = {};

    const processItemRecursive = (
      item: IFilterExpression,
    ): string | undefined => {
      if (item instanceof Filter) {
        const { queryFragment, parameters } = this._filterFragmentBuilder.build(
          item,
          aliasForGroupItems,
        );
        Object.assign(allParams, parameters);
        return queryFragment;
      } else if (item instanceof FilterGroup) {
        const subGroup = item;
        const subConditions = subGroup.items
          .map(processItemRecursive)
          .filter(Boolean) as string[];

        if (subConditions.length === 0) return undefined;
        return `(${subConditions.join(
          subGroup.logicalOperator === LogicalOperator.AND ? ' AND ' : ' OR ',
        )})`;
      }
      return undefined;
    };

    group.items.forEach((item) => {
      const conditionPart = processItemRecursive(item);
      if (conditionPart) {
        conditions.push(conditionPart);
      }
    });

    if (conditions.length === 0) {
      return undefined;
    }
    return {
      conditionString: conditions.join(
        group.logicalOperator === LogicalOperator.AND ? ' AND ' : ' OR ',
      ),
      parameters: allParams,
    };
  }

  public applySelectsToBuilder(qb: SelectQueryBuilder<T>): void {
    if (this._selects.size > 0) {
      qb.select(Array.from(this._selects.values()));
    }
  }

  public clearAmbiguousSelect(select: string): void {
    this._selects.delete(select);
  }

  public addFieldToSelection(select: string) {
    this._selects.add(select);
  }
}
