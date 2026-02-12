# TypeOrmMysqlTranslator

## 1. Propósito Principal

El `TypeOrmMysqlTranslator` es el orquestador central de la librería. Su trabajo principal es tomar un objeto `Criteria` abstracto que has construido y convertirlo en un `SelectQueryBuilder` concreto de TypeORM, listo para ser ejecutado contra una base de datos MySQL.

Actúa como un "director" que entiende la estructura de tu `Criteria` y delega la construcción de cada parte de la consulta (filtros, joins, ordenamiento, etc.) a componentes auxiliares especializados.

## 2. Cómo Funciona

El traductor sigue un proceso claro y paso a paso para construir tu consulta, asegurando que todas las partes de tu `Criteria` se apliquen correctamente.

### 2.1. Delegación a Ayudantes Especializados

Para mantener la lógica limpia y mantenible, el traductor no hace todo el trabajo por sí mismo. Se apoya en un equipo de ayudantes, cada uno con una única responsabilidad:

- **`TypeOrmJoinApplier`**: El experto en `JOIN`s. Lee las definiciones de las relaciones de tu esquema, aplica el `INNER` o `LEFT` join correcto y resuelve colisiones de alias.
- **`TypeOrmConditionBuilder`**: El maestro de la lógica. Construye la cláusula `WHERE` para la consulta principal y las condiciones `ON` para los joins, manejando correctamente los grupos anidados `AND`/`OR`.
- **`TypeOrmFilterFragmentBuilder`**: El especialista en operadores. Sabe cómo traducir cada `FilterOperator` específico (como `EQUALS`, `CONTAINS`, `JSON_CONTAINS`) a su sintaxis MySQL correspondiente.
- **`TypeOrmParameterManager`**: El guardia de seguridad. Asegura que todos los valores de los filtros se parametricen para prevenir inyecciones SQL.
- **`QueryState` y `QueryApplier`**: Gestionan el estado de la consulta mientras se construye (ej. recolectando todas las cláusulas `SELECT` y `ORDER BY`) y las aplican al `QueryBuilder` al final.

### 2.2. El Proceso de Traducción

Cuando llamas a `translator.translate(criteria, qb)`, ocurre lo siguiente:

1.  **Reinicio de Estado**: El traductor se prepara para una nueva consulta reiniciando su estado interno.
2.  **Recolección Inicial**: Recolecta las definiciones de `select`, `orderBy`, `take` y `skip` del nivel raíz. `take` y `skip` se aplican directamente al `QueryBuilder` en esta etapa.
3.  **Visita del Criteria**: Comienza a "visitar" el objeto `Criteria`, empezando desde la raíz.
4.  **Aplicación de Filtros Raíz**: Procesa las condiciones `WHERE` principales, usando el `TypeOrmConditionBuilder`.
5.  **Aplicación de Joins Recursiva**: Itera a través de cada `.join()` en tu `Criteria`. Para cada uno:
    - Pasa los detalles de la relación al `TypeOrmJoinApplier`.
    - El `JoinApplier` añade el `JOIN` y resuelve cualquier posible colisión de alias, devolviendo el alias único que utilizó (ej. `publisher_1`).
    - El traductor luego llama recursivamente al proceso de traducción para cualquier join anidado, pasando el alias único para asegurar el enlace correcto padre-hijo.
6.  **Finalización de la Consulta**: Una vez que todo el `Criteria` ha sido visitado, se llama al `QueryApplier` para:
    - Aplicar condiciones de paginación por cursor (`applyCursors`).
    - Aplicar todas las cláusulas `ORDER BY` recolectadas (`applyOrderBy`).
    - Aplicar todos los campos `SELECT` recolectados (`applySelects`).
7.  **Retorno**: Se devuelve el `SelectQueryBuilder` completamente configurado, listo para que lo ejecutes.

## 3. Características Clave y Notas de Uso

### 3.1. Joins Declarativos y Gestión de Alias

El traductor se basa en las `relations` que defines en tu `CriteriaSchema`. Esto hace que tu código sea más limpio y menos propenso a errores. También maneja automáticamente las colisiones de alias en joins complejos y multinivel, por lo que no tienes que preocuparte de que TypeORM lance errores de "alias already in use".

```typescript
// En tu Esquema:
const PostSchema = GetTypedCriteriaSchema({
  // ...
  relations: [
    {
      relation_alias: 'publisher',
      relation_type: 'many_to_one',
      target_source_name: 'user',
      local_field: 'user_uuid',
      relation_field: 'uuid',
      // Opcional: Definir comportamiento de selección por defecto
      default_options: {
        select: SelectType.FULL_ENTITY,
      },
    },
  ],
});

// En tu lógica de negocio:
const criteria = CriteriaFactory.GetCriteria(PostSchema)
  // El traductor encuentra la relación 'publisher' en el esquema automáticamente.
  .join('publisher', publisherJoinCriteria);
```

### 3.2. Estrategias de Selección Flexibles (`SelectType`)

Una característica clave es la capacidad de controlar exactamente qué datos se recuperan al unir tablas. Esto se puede configurar globalmente en el esquema (vía `default_options`) o anular por consulta.

- **`SelectType.FULL_ENTITY` (Por defecto):** Genera un `INNER JOIN ... SELECT ...` e hidrata la entidad completa en tus resultados.
- **`SelectType.ID_ONLY`:** Optimiza la consulta cargando solo el ID de la relación (Clave Foránea). Si es posible (Lado Propietario, sin filtros, sin ordenamiento, sin joins anidados), evita el join por completo. De lo contrario, usa `loadAllRelationIds` de TypeORM.
- **`SelectType.NO_SELECTION`:** Genera un `INNER JOIN` simple para propósitos de filtrado pero **no** selecciona los campos de la entidad unida. La propiedad en tus resultados será `undefined`.

Esto es extremadamente útil para optimizar el rendimiento, especialmente cuando solo necesitas verificar una condición en una entidad relacionada o solo necesitas su ID.

### 3.3. `OuterJoin` (Limitación)

`FULL OUTER JOIN` no es soportado nativamente por MySQL. Emularlo es complejo y a menudo ineficiente. Por lo tanto, este traductor no soporta `OuterJoinCriteria` y lanzará un error si se proporciona uno. Usa `LeftJoinCriteria` en su lugar para la mayoría de los casos de uso comunes.
