# TypeOrmJoinApplier

## 1. Propósito Principal

El `TypeOrmJoinApplier` es el ayudante especializado responsable de aplicar las cláusulas `JOIN` a la consulta. Actúa como el "experto en uniones", tomando la información de la relación definida en tu `CriteriaSchema` y traduciéndola al `INNER JOIN` o `LEFT JOIN` correcto en el SQL final.

Su objetivo principal es hacer que los joins sean simples y declarativos para el usuario, al mismo tiempo que proporciona opciones potentes para la optimización de consultas.

## 2. Cómo Funciona

Este componente es responsable de varias características clave del sistema de joins del traductor.

### 2.1. Joins Declarativos Basados en Esquema y Resolución de Alias

El principio fundamental es que **defines tus relaciones una sola vez** en el `CriteriaSchema` y luego simplemente te refieres a ellas por su alias. El `JoinApplier` se encarga del resto.

Cuando haces una llamada como `.join('publisher', ...)`:

1.  El traductor proporciona al `JoinApplier` los detalles de la relación `publisher` que encontró en tu esquema.
2.  **Resolución de Alias:** El `JoinApplier` verifica si el alias solicitado ya está en uso en la consulta. Si lo está (por ejemplo, en un self-join o una estructura anidada compleja), genera automáticamente un alias único (ej. `publisher_1`) para prevenir errores de SQL.
3.  El `JoinApplier` utiliza esta información (tabla de destino, clave local, clave de relación, alias único) para construir la cláusula `JOIN` correcta.
4.  También utiliza el `TypeOrmConditionBuilder` para traducir cualquier filtro que hayas definido dentro del `Criteria` del join en la condición `ON` del `JOIN`.

Esto significa que tu lógica de negocio se mantiene limpia y libre de detalles específicos de la base de datos y dolores de cabeza por la gestión de alias.

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

### 2.2. Estrategias de Selección Flexibles (`SelectType`)

El `JoinApplier` implementa una potente función de optimización a través de la opción `SelectType`. Puedes decidir exactamente cómo debe comportarse un `JOIN` con respecto a la recuperación de datos.

- **`SelectType.FULL_ENTITY` (Por defecto):**
  - **Qué hace:** Genera un `... JOIN ...` y añade el alias unido a la cláusula `SELECT`.
  - **Resultado:** La entidad relacionada (`relation`) se carga e hidrata completamente en tus resultados. Usa esto cuando necesites acceder a las propiedades del objeto unido.

- **`SelectType.ID_ONLY` (Optimizado):**
  - **Qué hace:**
    - **Verificación de Optimización:** Comprueba si el join puede omitirse por completo. Esto sucede SOLO si:
      1.  Estamos en el "Lado Propietario" de la relación (tenemos la Clave Foránea).
      2.  No hay filtros en la entidad unida.
      3.  No hay joins anidados en la entidad unida.
      4.  No hay ordenamiento en la entidad unida.
    - **Si se Optimiza:** Simplemente selecciona la columna de clave foránea local (ej. `post.user_uuid`) y evita el `JOIN` completamente.
    - **Si No se Optimiza:** Delega al mecanismo `loadAllRelationIds` de TypeORM para obtener los IDs por separado.
  - **Resultado:** Solo se carga el ID (o array de IDs) de la relación. Esto es extremadamente eficiente cuando solo necesitas el ID de referencia y no el objeto completo.

- **`SelectType.NO_SELECTION` (Solo Filtrado):**
  - **Qué hace:** Genera el `... JOIN ...` pero **no** añade el alias a la cláusula `SELECT`.
  - **Resultado:** El `JOIN` se utiliza puramente para filtrar la entidad principal basándose en condiciones de la tabla unida. La propiedad `relation` en tus resultados será `undefined` (o vacía). Esto evita la sobrecarga de hidratar objetos que no tienes intención de usar.

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
  { select: SelectType.NO_SELECTION },
);

// Los 'posts' resultantes estarán filtrados correctamente,
// pero `post.publisher` será undefined para cada post.
const posts = await qb.getMany();
```
