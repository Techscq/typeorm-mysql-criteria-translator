import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import type { TypeOrmQueryStructureHelper } from './type-orm-query-structure-helper.js';
import {
  type CriteriaSchema,
  type InnerJoinCriteria,
  type JoinRelationType,
  type LeftJoinCriteria,
  type Order,
  type PivotJoin,
  type SelectedAliasOf,
  type SimpleJoin,
} from '@nulledexp/translatable-criteria';

export class TypeOrmJoinApplier<T extends ObjectLiteral> {
  constructor(private queryStructureHelper: TypeOrmQueryStructureHelper<T>) {}

  public applyJoinLogic(
    qb: SelectQueryBuilder<T>,
    joinType: 'inner' | 'left',
    criteria: InnerJoinCriteria<any, any> | LeftJoinCriteria<any, any>,
    parameters:
      | PivotJoin<CriteriaSchema, CriteriaSchema, JoinRelationType>
      | SimpleJoin<CriteriaSchema, CriteriaSchema, JoinRelationType>,
    selects: Set<string>,
    orderBy: Array<[SelectedAliasOf<CriteriaSchema>, Order<any>]>,
  ): SelectQueryBuilder<T> {
    const joinAlias = criteria.alias;
    const targetTableNameOrRelationProperty = `${parameters.parent_alias}.${criteria.alias}`;

    let onConditionClause: string | undefined = undefined;
    let onConditionParams: ObjectLiteral = {};

    if (criteria.rootFilterGroup.items.length > 0) {
      const onConditionResult =
        this.queryStructureHelper.buildConditionStringFromGroup(
          criteria.rootFilterGroup,
          joinAlias,
        );
      if (onConditionResult) {
        onConditionClause = onConditionResult.conditionString;
        onConditionParams = onConditionResult.parameters;
      }
    }

    const baseJoinMethod =
      joinType === 'inner' ? qb.innerJoinAndSelect : qb.leftJoinAndSelect;

    baseJoinMethod.call(
      qb,
      targetTableNameOrRelationProperty,
      joinAlias,
      onConditionClause,
      onConditionParams,
    );

    this.queryStructureHelper.resolveSelects(criteria, selects);
    //remove FK from select to avoid duplicate columns
    switch (parameters.parent_to_join_relation_type) {
      case 'many_to_one':
        selects.delete(
          `${parameters.parent_alias}.${String(parameters.parent_field)}`,
        );
        break;
      case 'one_to_many':
        selects.delete(`${joinAlias}.${String(parameters.join_field)}`);
        break;
      case 'one_to_one':
        selects.delete(`${joinAlias}.${String(parameters.join_field)}`);
        selects.delete(
          `${parameters.parent_alias}.${String(parameters.parent_field)}`,
        );
        break;
    }
    criteria.orders.forEach((order) => {
      orderBy.push([joinAlias, order]);
    });

    return qb;
  }
}
