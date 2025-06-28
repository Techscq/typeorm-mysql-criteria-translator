# TypeOrmMysqlTranslator

## 1. Propósito Principal

El `TypeOrmMysqlTranslator` es el orquestador central de la librería. Su trabajo principal es tomar un objeto `Criteria` abstracto que has construido y convertirlo en un `SelectQueryBuilder` concreto de TypeORM, listo para ser ejecutado contra una base de datos MySQL.

Actúa como un "director" que entiende la estructura de tu `Criteria` y delega la construcción de cada parte de la consulta (filtros, joins, ordenamiento, etc.) a componentes auxiliares especializados.

## 2. Cómo Funciona

El traductor sigue un proceso claro y paso a paso para construir tu consulta, asegurando que todas las partes de tu `Criteria` se apliquen correctamente.

### 2.1. Delegación a Ayudantes Especializados

Para mantener la lógica limpia y mantenible, el traductor no hace todo el trabajo por sí mismo. Se apoya en un equipo de ayudantes, cada uno con una única responsabilidad:

- **`TypeOrmJoinApplier`**: El experto en `JOIN`s. Lee las definiciones de las relaciones de tu esquema y aplica el `INNER` o `LEFT` join correcto.
- **`TypeOrmConditionBuilder`**: El maestro de la lógica. Construye la cláusula `WHERE` para la consulta principal y las condiciones `ON` para los joins, manejando correctamente los grupos anidados `AND`/`OR`.
- **`TypeOrmFilterFragmentBuilder`**: El especialista en operadores. Sabe cómo traducir cada `FilterOperator` específico (como `EQUALS`, `CONTAINS`, `JSON_CONTAINS`) a su sintaxis MySQL correspondiente.
- **`TypeOrmParameterManager`**: El guardia de seguridad. Asegura que todos los valores de los filtros se parametricen para prevenir inyecciones SQL.
- **`QueryState` y `QueryApplier`**: Gestionan el estado de la consulta mientras se construye (ej. recolectando todas las cláusulas `SELECT` y `ORDER BY`) y las aplican al `QueryBuilder` al final.

### 2.2. El Proceso de Traducción

Cuando llamas a `translator.translate(criteria, qb)`, ocurre lo siguiente:

1.  **Reinicio de Estado**: El traductor se prepara para una nueva consulta reiniciando su estado interno. Esto asegura que cada traducción sea independiente.
2.  **Visita del Criteria**: Comienza a "visitar" el objeto `Criteria`, empezando desde la raíz.
3.  **Aplicación de Filtros**: Procesa las condiciones `WHERE` principales, usando el `TypeOrmConditionBuilder` para manejar correctamente la lógica `AND`/`OR` con paréntesis.
4.  **Aplicación de Joins**: Itera a través de cada `.join()` en tu `Criteria`. Para cada uno:
    - Encuentra la definición de la relación correspondiente en tu `CriteriaSchema`.
    - Pasa toda la información necesaria (claves de unión, alias) al `TypeOrmJoinApplier`.
    - El `JoinApplier` luego añade el `JOIN` y cualquier condición `ON` a la consulta.
5.  **Recolección del Resto**: Mientras recorre el `Criteria`, recolecta todas las definiciones de `orderBy`, `select`, `take`, `skip` y `cursor`.
6.  **Finalización de la Consulta**: Una vez que todo el `Criteria` ha sido visitado, el `QueryApplier` aplica los campos `SELECT` recolectados, las cláusulas `ORDER BY` y la paginación (`take`/`skip` o condiciones de cursor) al `QueryBuilder`.
7.  **Retorno**: Se devuelve el `SelectQueryBuilder` completamente configurado, listo para que lo ejecutes.

## 3. Características Clave y Notas de Uso

### 3.1. Joins Declarativos

El traductor se basa en las `relations` que defines en tu `CriteriaSchema`. Esto significa que ya no necesitas especificar las claves de unión (`local_field`, `relation_field`) en tu lógica de negocio. El traductor maneja esto automáticamente, haciendo tu código más limpio y menos propenso a errores.

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
    },
  ],
});

// En tu lógica de negocio:
const criteria = CriteriaFactory.GetCriteria(PostSchema)
  // El traductor encuentra la relación 'publisher' en el esquema automáticamente.
  .join('publisher', publisherJoinCriteria);
```

### 3.2. Filtrado Eficiente con `withSelect: false`

Una característica clave es la capacidad de unir una tabla solo con el propósito de filtrar, sin el coste de rendimiento de seleccionar sus datos.

- **`join('publisher', joinCriteria, true)` (u omitiendo el último argumento):** Este es el comportamiento por defecto. Genera un `INNER JOIN ... SELECT ...` e hidrata la propiedad `publisher` en tus resultados.
- **`join('publisher', joinCriteria, false)`:** Esta es la versión optimizada. Genera un `INNER JOIN` simple y lo usa para la cláusula `WHERE`/`ON`, pero **no** selecciona los campos del publicador. La propiedad `publisher` en tus resultados será `undefined`.

Esto es extremadamente útil para consultas donde necesitas verificar una condición en una entidad relacionada pero no necesitas devolver sus datos.

### 3.3. `OuterJoin` (Limitación)

`FULL OUTER JOIN` no es soportado nativamente por MySQL. Emularlo es complejo y a menudo ineficiente. Por lo tanto, este traductor no soporta `OuterJoinCriteria` y lanzará un error si se proporciona uno. Usa `LeftJoinCriteria` en su lugar para la mayoría de los casos de uso comunes.
