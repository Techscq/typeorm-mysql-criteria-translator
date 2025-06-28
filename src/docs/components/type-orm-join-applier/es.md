# TypeOrmJoinApplier

## 1. Propósito Principal

El `TypeOrmJoinApplier` es el ayudante especializado responsable de aplicar las cláusulas `JOIN` a la consulta. Actúa como el "experto en uniones", tomando la información de la relación definida en tu `CriteriaSchema` y traduciéndola al `INNER JOIN` o `LEFT JOIN` correcto en el SQL final.

Su objetivo principal es hacer que los joins sean simples y declarativos para el usuario, al mismo tiempo que proporciona opciones potentes para la optimización de consultas.

## 2. Cómo Funciona

Este componente es responsable de dos características clave del sistema de joins del traductor.

### 2.1. Joins Declarativos Basados en Esquema

El principio fundamental es que **defines tus relaciones una sola vez** en el `CriteriaSchema` y luego simplemente te refieres a ellas por su alias. El `JoinApplier` se encarga del resto.

Cuando haces una llamada como `.join('publisher', ...)`:

1.  El traductor proporciona al `JoinApplier` los detalles de la relación `publisher` que encontró en tu esquema.
2.  El `JoinApplier` utiliza esta información (tabla de destino, clave local, clave de relación, etc.) para construir la cláusula `JOIN` correcta.
3.  También utiliza el `TypeOrmConditionBuilder` para traducir cualquier filtro que hayas definido dentro del `Criteria` del join en la condición `ON` del `JOIN`.

Esto significa que tu lógica de negocio se mantiene limpia y libre de detalles específicos de la base de datos.

```typescript
// 1. Defines la relación en el esquema:
export const PostSchema = GetTypedCriteriaSchema({
  // ...
  relations: [
    {
      relation_alias: 'publisher',
      relation_type: 'many_to_one',
      target_source_name: 'user',
      local_field: 'user_uuid',
      relation_field: 'uuid',
    },
  ],
});

// 2. La usas con un alias simple en tu código:
const criteria = CriteriaFactory.GetCriteria(PostSchema).join(
  'publisher',
  publisherJoinCriteria,
);
```

### 2.2. Filtrado Eficiente con `withSelect: false`

El `JoinApplier` también implementa una potente función de optimización. Puedes decidir si un `JOIN` debe usarse para obtener datos o solo para filtrar los resultados.

- **`join('relation', joinCriteria, true)` (Por defecto):**

  - **Qué hace:** Genera un `... JOIN ... SELECT ...`.
  - **Resultado:** La entidad relacionada (`relation`) se carga y se incluye en tus resultados. Usa esto cuando necesites los datos de la tabla unida.

- **`join('relation', joinCriteria, false)` (Optimizado):**
  - **Qué hace:** Genera un simple `... JOIN ...`.
  - **Resultado:** El `JOIN` se utiliza para filtrar la entidad principal, pero sus campos **no** se seleccionan. La propiedad `relation` en tus resultados será `undefined`. Esto es muy eficiente cuando solo necesitas verificar una condición en una entidad relacionada.

```typescript
// Ejemplo: Encontrar todos los posts publicados por usuarios llamados 'admin', pero SIN cargar el objeto del publicador.

const publisherFilter = CriteriaFactory.GetInnerJoinCriteria(UserSchema).where({
  field: 'username',
  operator: FilterOperator.EQUALS,
  value: 'admin',
});

const criteria = CriteriaFactory.GetCriteria(PostSchema).join(
  'publisher',
  publisherFilter,
  false,
); // withSelect: false

// Los 'posts' resultantes estarán filtrados correctamente,
// pero `post.publisher` será undefined para cada post.
const posts = await qb.getMany();
```
