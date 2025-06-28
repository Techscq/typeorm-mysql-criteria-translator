import { type ObjectLiteral, type SelectQueryBuilder } from 'typeorm';
import type { TypeOrmConditionBuilder } from './type-orm-condition-builder.js';
import {
  type CriteriaSchema,
  type InnerJoinCriteria,
  type JoinRelationType,
  type LeftJoinCriteria,
  type PivotJoin,
  type SimpleJoin,
} from '@nulledexp/translatable-criteria';
import { QueryState } from './query-state.js';

/**
 * TypeOrmJoinApplier is responsible for applying join logic to a TypeORM SelectQueryBuilder.
 * It handles the construction of ON conditions and the selection of fields from joined entities.
 */
export class TypeOrmJoinApplier<T extends ObjectLiteral> {
  /**
   * Constructs a new TypeOrmJoinApplier instance.
   * @param _conditionBuilder The TypeOrmConditionBuilder instance for building join conditions.
   * @param _queryState The QueryState instance for managing query state.
   */
  constructor(
    private _conditionBuilder: TypeOrmConditionBuilder,
    private _queryState: QueryState,
  ) {}

  /**
   * Applies join logic (INNER or LEFT) to the query builder.
   * It constructs the ON clause based on the join criteria's root filter group
   * and handles the selection of fields from the joined entities.
   * @param qb The TypeORM SelectQueryBuilder.
   * @param joinType The type of join ('inner' or 'left').
   * @param criteria The join criteria.
   * @param parameters Join parameters including aliases and field mappings.
   * @returns The modified SelectQueryBuilder.
   */
  public applyJoinLogic(
    qb: SelectQueryBuilder<T>,
    joinType: 'inner' | 'left',
    criteria: InnerJoinCriteria<any> | LeftJoinCriteria<any>,
    parameters:
      | PivotJoin<CriteriaSchema, CriteriaSchema, JoinRelationType>
      | SimpleJoin<CriteriaSchema, CriteriaSchema, JoinRelationType>,
  ): SelectQueryBuilder<T> {
    const joinAlias = parameters.relation_alias;
    const targetTableNameOrRelationProperty = `${parameters.parent_alias}.${joinAlias}`;

    let onConditionClause: string | undefined = undefined;
    let onConditionParams: ObjectLiteral = {};

    if (criteria.rootFilterGroup.items.length > 0) {
      const onConditionResult =
        this._conditionBuilder.buildConditionStringFromGroup(
          criteria.rootFilterGroup,
          joinAlias,
        );
      if (onConditionResult) {
        onConditionClause = onConditionResult.conditionString;
        onConditionParams = onConditionResult.parameters;
      }
    }
    if (parameters.with_select) {
      this._queryState.collectCursor(
        parameters.relation_alias,
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

      this._queryState.resolveSelects(joinAlias, criteria);
      this._queryState.clearAmbiguousSelect(
        `${parameters.parent_alias}.${String(parameters.local_field)}`,
      );
      this._queryState.clearAmbiguousSelect(
        `${joinAlias}.${String(parameters.relation_field)}`,
      );
      this._queryState.addFieldToSelection(
        `${joinAlias}.${criteria.identifierField}`,
      );
      this._queryState.addFieldToSelection(
        `${parameters.parent_alias}.${parameters.parent_identifier}`,
      );
      this._queryState.recordOrderBy(criteria.orders, joinAlias);
    } else {
      const baseJoinMethod = joinType === 'inner' ? qb.innerJoin : qb.leftJoin;
      baseJoinMethod.call(
        qb,
        targetTableNameOrRelationProperty,
        joinAlias,
        onConditionClause,
        onConditionParams,
      );
    }

    return qb;
  }
}
