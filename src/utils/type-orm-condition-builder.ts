import { Brackets, type ObjectLiteral, type SelectQueryBuilder } from 'typeorm';
import type { TypeOrmParameterManager } from './type-orm-parameter-manager.js';
import type {
  TypeOrmConditionFragment,
  TypeOrmFilterFragmentBuilder,
} from './type-orm-filter-fragment-builder.js';
import {
  Filter,
  FilterOperator,
  type IFilterExpression,
  LogicalOperator,
  FilterGroup,
  type FilterPrimitive,
} from '@nulledexp/translatable-criteria';

/**
 * TypeOrmConditionBuilder is responsible for building SQL condition fragments
 * for TypeORM queries based on various filter types and logical groupings.
 * This class is stateless and focuses solely on translating filter logic into SQL.
 */
export class TypeOrmConditionBuilder {
  /**
   * Constructs a new TypeOrmConditionBuilder instance.
   * @param _parameterManager The TypeOrmParameterManager for generating unique parameter names.
   * @param _filterFragmentBuilder The TypeOrmFilterFragmentBuilder for building individual filter fragments.
   */
  constructor(
    private _parameterManager: TypeOrmParameterManager,
    private _filterFragmentBuilder: TypeOrmFilterFragmentBuilder,
  ) {}

  /**
   * Builds the complete WHERE condition for keyset pagination based on the provided filters.
   * It dispatches to the appropriate helper based on the number of fields in the cursor.
   * @param filters An array of processed and combined filter primitives for the cursor.
   * @returns A TypeOrmConditionFragment representing the cursor's WHERE clause.
   * @throws Error if the number of cursor fields is not 1 or 2.
   */
  public buildCursorCondition(
    filters: FilterPrimitive<
      string,
      FilterOperator.GREATER_THAN | FilterOperator.LESS_THAN
    >[],
  ): TypeOrmConditionFragment {
    if (filters.length === 1) {
      return this._buildSingleFieldCursorCondition(filters[0]!);
    }
    if (filters.length === 2) {
      return this._buildCompositeCursorCondition(filters[0]!, filters[1]!);
    }

    throw new Error(
      `Cursor pagination is only supported for 1 or 2 fields, but received ${filters.length}. This should have been caught by validation.`,
    );
  }

  /**
   * Builds the WHERE condition for a cursor with a single field.
   * @param filter The single filter primitive for the cursor.
   * @returns A TypeOrmConditionFragment.
   */
  private _buildSingleFieldCursorCondition(
    filter: FilterPrimitive<
      string,
      FilterOperator.GREATER_THAN | FilterOperator.LESS_THAN
    >,
  ): TypeOrmConditionFragment {
    const op = filter.operator === FilterOperator.GREATER_THAN ? '>' : '<';
    const fieldName = filter.field;
    const { value } = filter;

    if (value === null) {
      const query = op === '>' ? `${fieldName} IS NOT NULL` : '1=0';
      return { queryFragment: `(${query})`, parameters: {} };
    }

    const paramName = this._parameterManager.generateParamName();
    const query = `${fieldName} ${op} :${paramName}`;
    return { queryFragment: `(${query})`, parameters: { [paramName]: value } };
  }

  /**
   * Builds the WHERE condition for a composite cursor with two fields.
   * It delegates to ascending or descending specific helpers based on the operator.
   * @param filter1 The first filter primitive (primary sort key).
   * @param filter2 The second filter primitive (tie-breaker).
   * @returns A TypeOrmConditionFragment.
   */
  private _buildCompositeCursorCondition(
    filter1: FilterPrimitive<
      string,
      FilterOperator.GREATER_THAN | FilterOperator.LESS_THAN
    >,
    filter2: FilterPrimitive<
      string,
      FilterOperator.GREATER_THAN | FilterOperator.LESS_THAN
    >,
  ): TypeOrmConditionFragment {
    const op = filter1.operator === FilterOperator.GREATER_THAN ? '>' : '<';

    if (op === '>') {
      return this._buildCompositeAscending(filter1, filter2);
    }
    return this._buildCompositeDescending(filter1, filter2);
  }

  /**
   * Builds the specific WHERE clause for a two-field ascending ('>') cursor.
   * Handles null values according to MySQL's `NULLS FIRST` behavior for ASC.
   * @param filter1 The primary sort key filter.
   * @param filter2 The tie-breaker filter.
   * @returns A TypeOrmConditionFragment.
   */
  private _buildCompositeAscending(
    filter1: FilterPrimitive<string, any>,
    filter2: FilterPrimitive<string, any>,
  ): TypeOrmConditionFragment {
    const field1Name = filter1.field;
    const { value: value1 } = filter1;
    const field2Name = filter2.field;
    const { value: value2 } = filter2;
    const parameters: ObjectLiteral = {};

    if (value1 === null) {
      const paramName2 = this._parameterManager.generateParamName();
      parameters[paramName2] = value2;
      const query = `((${field1Name} IS NOT NULL) OR (${field1Name} IS NULL AND ${field2Name} > :${paramName2}))`;
      return { queryFragment: query, parameters };
    }

    const paramName1 = this._parameterManager.generateParamName();
    const paramName2 = this._parameterManager.generateParamName();
    parameters[paramName1] = value1;
    parameters[paramName2] = value2;
    const query = `((${field1Name} > :${paramName1}) OR (${field1Name} = :${paramName1} AND ${field2Name} > :${paramName2}))`;
    return { queryFragment: query, parameters };
  }

  /**
   * Builds the specific WHERE clause for a two-field descending ('<') cursor.
   * Handles null values according to MySQL's `NULLS LAST` behavior for DESC.
   * @param filter1 The primary sort key filter.
   * @param filter2 The tie-breaker filter.
   * @returns A TypeOrmConditionFragment.
   */
  private _buildCompositeDescending(
    filter1: FilterPrimitive<string, any>,
    filter2: FilterPrimitive<string, any>,
  ): TypeOrmConditionFragment {
    const field1Name = filter1.field;
    const { value: value1 } = filter1;
    const field2Name = filter2.field;
    const { value: value2 } = filter2;
    const parameters: ObjectLiteral = {};

    if (value1 === null) {
      const paramName2 = this._parameterManager.generateParamName();
      parameters[paramName2] = value2;
      const query = `(${field1Name} IS NULL AND ${field2Name} < :${paramName2})`;
      return { queryFragment: query, parameters };
    }

    const paramName1 = this._parameterManager.generateParamName();
    const paramName2 = this._parameterManager.generateParamName();
    parameters[paramName1] = value1;
    parameters[paramName2] = value2;
    const query = `((${field1Name} < :${paramName1}) OR (${field1Name} = :${paramName1} AND ${field2Name} < :${paramName2}) OR (${field1Name} IS NULL))`;
    return { queryFragment: query, parameters };
  }

  /**
   * Applies a condition (string or Brackets) to a TypeORM QueryBuilder.
   * Determines whether to use `where`, `andWhere`, or `orWhere` based on context.
   * @param qb The TypeORM SelectQueryBuilder.
   * @param conditionOrBracket The condition string or Brackets object.
   * @param isFirstInThisBracket True if this is the first condition in its current bracket/group.
   * @param logicalConnector The logical operator (AND/OR) to use if not the first condition.
   * @param parameters Optional parameters for the condition.
   */
  public applyConditionToQueryBuilder(
    qb: SelectQueryBuilder<any>,
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

  /**
   * Processes a list of filter expressions (Filters or FilterGroups) and applies them to a QueryBuilder.
   * This method is typically used for root filter groups or join ON conditions.
   * @param items The filter expressions to process.
   * @param currentAlias The alias of the current entity.
   * @param qb The TypeORM SelectQueryBuilder.
   * @param groupLogicalOperator The logical operator for the current group.
   * @param visitor An object with `visitAndGroup` and `visitOrGroup` methods for recursive processing.
   * @returns True if any WHERE clauses were applied, false otherwise.
   */
  public processGroupItems(
    items: ReadonlyArray<IFilterExpression>,
    currentAlias: string,
    qb: SelectQueryBuilder<any>,
    groupLogicalOperator: LogicalOperator,
    visitor: { visitAndGroup: Function; visitOrGroup: Function },
  ): boolean {
    if (items.length === 0) {
      return false;
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
    return true;
  }

  /**
   * Builds a condition string and parameters from a FilterGroup.
   * This is typically used for ON conditions in joins.
   * @param group The FilterGroup to convert.
   * @param aliasForGroupItems The alias for fields within this group.
   * @returns An object containing the condition string and parameters, or undefined if the group is empty.
   */
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
}