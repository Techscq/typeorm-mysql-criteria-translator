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
  type SelectedAliasOf,
  type Cursor,
  FilterGroup,
} from '@nulledexp/translatable-criteria';

export class TypeOrmQueryStructureHelper<T extends ObjectLiteral> {
  constructor(
    private parameterManager: TypeOrmParameterManager,
    private filterFragmentBuilder: TypeOrmFilterFragmentBuilder,
  ) {}

  public buildCursorCondition<
    RootCriteriaSchema extends CriteriaSchema,
    RootAlias extends SelectedAliasOf<RootCriteriaSchema>,
  >(
    cursor: Cursor<
      FieldOfSchema<RootCriteriaSchema>,
      FilterOperator.GREATER_THAN | FilterOperator.LESS_THAN
    >,
    alias: RootAlias,
  ): TypeOrmConditionFragment {
    const filterPrimitives = cursor.filters.map((filter) =>
      filter.toPrimitive(),
    );
    const fieldPrimitive1 = filterPrimitives[0]!;
    const op =
      fieldPrimitive1.operator === FilterOperator.GREATER_THAN ? '>' : '<';
    const paramName1 = this.parameterManager.generateParamName();
    const parameters: ObjectLiteral = { [paramName1]: fieldPrimitive1.value };
    const field1Name = `${alias}.${String(fieldPrimitive1.field)}`;
    let queryFragment = `(${field1Name} ${op} :${paramName1})`;

    if (filterPrimitives.length === 2 && filterPrimitives[1]) {
      const fieldPrimitive2 = filterPrimitives[1];
      const paramName2 = this.parameterManager.generateParamName();
      parameters[paramName2] = fieldPrimitive2.value;
      const field2Name = `${alias}.${String(fieldPrimitive2.field)}`;
      queryFragment = `((${field1Name} ${op} :${paramName1}) OR (${field1Name} = :${paramName1} AND ${field2Name} ${op} :${paramName2}))`;
    }
    return { queryFragment, parameters };
  }

  public resolveSelects<
    TCriteriaSchema extends CriteriaSchema,
    TAlias extends SelectedAliasOf<TCriteriaSchema>,
  >(
    criteria: ICriteriaBase<TCriteriaSchema, TAlias>,
    selectsSet: Set<string>,
  ): void {
    if (criteria.select.length > 0) {
      criteria.orders.forEach((order) =>
        selectsSet.add(`${criteria.alias}.${String(order.field)}`),
      );
      if (criteria.cursor) {
        criteria.cursor.filters.forEach((filter) => {
          selectsSet.add(`${criteria.alias}.${String(filter.field)}`);
        });
      }
      criteria.select.forEach((field) =>
        selectsSet.add(`${criteria.alias}.${String(field)}`),
      );
    }
  }

  public applyConditionToQueryBuilder(
    qb: SelectQueryBuilder<T>,
    conditionOrBracket: string | Brackets,
    isFirstInThisBracket: boolean,
    logicalConnector: LogicalOperator,
    parameters?: ObjectLiteral,
  ): void {
    if (isFirstInThisBracket) qb.where(conditionOrBracket, parameters);
    else if (logicalConnector === LogicalOperator.AND)
      qb.andWhere(conditionOrBracket, parameters);
    else qb.orWhere(conditionOrBracket, parameters);
  }

  public processGroupItems(
    items: ReadonlyArray<IFilterExpression>,
    currentAlias: string,
    qb: SelectQueryBuilder<T>,
    groupLogicalOperator: LogicalOperator,
    visitor: { visitAndGroup: Function; visitOrGroup: Function },
  ): void {
    items.forEach((item, index) => {
      const isFirstItemInThisBracketCallback = index === 0;
      if (item instanceof Filter) {
        const { queryFragment, parameters } = this.filterFragmentBuilder.build(
          item,
          currentAlias,
        );
        this.applyConditionToQueryBuilder(
          qb,
          queryFragment,
          isFirstItemInThisBracketCallback,
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
          isFirstItemInThisBracketCallback,
          groupLogicalOperator,
        );
      }
    });
  }

  public buildConditionStringFromGroup(
    group: FilterGroup<any>,
    aliasForGroupItems: string,
  ): { conditionString: string; parameters: ObjectLiteral } | undefined {
    if (group.items.length === 0) return undefined;

    const conditions: string[] = [];
    const allParams: ObjectLiteral = {};

    const processItemRecursive = (
      item: IFilterExpression,
    ): string | undefined => {
      if (item instanceof Filter) {
        const { queryFragment, parameters } = this.filterFragmentBuilder.build(
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
    };

    group.items.forEach((item) => {
      const conditionPart = processItemRecursive(item);
      if (conditionPart) {
        conditions.push(conditionPart);
      }
    });

    if (conditions.length === 0) return undefined;

    return {
      conditionString: conditions.join(
        group.logicalOperator === LogicalOperator.AND ? ' AND ' : ' OR ',
      ),
      parameters: allParams,
    };
  }
}
