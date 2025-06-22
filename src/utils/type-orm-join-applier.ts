import { type ObjectLiteral, type SelectQueryBuilder } from 'typeorm';
import type { TypeOrmQueryStructureHelper } from './type-orm-query-structure-helper.js';
import {
  type CriteriaSchema,
  type InnerJoinCriteria,
  type JoinRelationType,
  type LeftJoinCriteria,
  type PivotJoin,
  type SimpleJoin,
} from '@nulledexp/translatable-criteria';

export class TypeOrmJoinApplier<T extends ObjectLiteral> {
  constructor(private _queryStructureHelper: TypeOrmQueryStructureHelper<T>) {}

  public applyJoinLogic(
    qb: SelectQueryBuilder<T>,
    joinType: 'inner' | 'left',
    criteria: InnerJoinCriteria<any> | LeftJoinCriteria<any>,
    parameters:
      | PivotJoin<CriteriaSchema, CriteriaSchema, JoinRelationType>
      | SimpleJoin<CriteriaSchema, CriteriaSchema, JoinRelationType>,
  ): SelectQueryBuilder<T> {
    const joinAlias = parameters.join_alias;
    const targetTableNameOrRelationProperty = `${parameters.parent_alias}.${joinAlias}`;

    let onConditionClause: string | undefined = undefined;
    let onConditionParams: ObjectLiteral = {};

    if (criteria.rootFilterGroup.items.length > 0) {
      const onConditionResult =
        this._queryStructureHelper.buildConditionStringFromGroup(
          criteria.rootFilterGroup,
          joinAlias,
        );
      if (onConditionResult) {
        onConditionClause = onConditionResult.conditionString;
        onConditionParams = onConditionResult.parameters;
      }
    }

    this._queryStructureHelper.collectCursor(
      parameters.join_alias,
      criteria.cursor,
    );

    const baseJoinMethod =
      joinType === 'inner' ? qb.innerJoinAndSelect : qb.leftJoinAndSelect;

    baseJoinMethod.call(
      qb,
      targetTableNameOrRelationProperty,
      joinAlias,
      onConditionClause,
      onConditionParams,
    );

    this._queryStructureHelper.resolveSelects(joinAlias, criteria);
    switch (parameters.relation_type) {
      case 'many_to_one':
        this._queryStructureHelper.clearAmbiguousSelect(
          `${parameters.parent_alias}.${String(parameters.parent_field)}`,
        );
        this._queryStructureHelper.addFieldToSelection(
          `${parameters.parent_alias}.${String(parameters.join_field)}`,
        );
        break;
      case 'one_to_many':
        this._queryStructureHelper.clearAmbiguousSelect(
          `${joinAlias}.${String(parameters.join_field)}`,
        );
        this._queryStructureHelper.addFieldToSelection(
          `${parameters.parent_alias}.${String(parameters.parent_field)}`,
        );
        this._queryStructureHelper.addFieldToSelection(
          `${joinAlias}.${String(parameters.parent_field)}`,
        );

        break;
      case 'one_to_one':
        throw new Error(
          "For 'one-to-one' relations, please model them in the CriteriaSchema using 'many-to-one' from the entity owning the foreign key, and 'one-to-many' from the other entity. This approach ensures consistent query translation with TypeORM, as direct 'one-to-one' translation is currently restricted.",
        );
    }
    this._queryStructureHelper.addFieldToSelection(
      `${joinAlias}.${criteria.identifierField}`,
    );
    this._queryStructureHelper.addFieldToSelection(
      `${parameters.parent_alias}.${parameters.parent_identifier}`,
    );
    this._queryStructureHelper.recordOrderBy(criteria.orders, joinAlias);
    return qb;
  }
}