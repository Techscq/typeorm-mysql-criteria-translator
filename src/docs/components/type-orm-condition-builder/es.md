# TypeOrmConditionBuilder

## 1. Propósito Principal

El `TypeOrmConditionBuilder` es un ayudante especializado que actúa como el "maestro de la lógica" para las condiciones de la consulta. Su rol principal es traducir las estructuras de filtros de tu objeto `Criteria` en condiciones SQL válidas para MySQL.

Tiene dos responsabilidades principales:
1.  Construir la cláusula `WHERE` principal para tu consulta raíz.
2.  Construir las condiciones `ON` para tus cláusulas `JOIN`.

Asegura que todas las agrupaciones lógicas (`AND`/`OR`) se manejen correctamente con paréntesis para mantener la integridad de la lógica de tu consulta.

## 2. Cómo Funciona

### 2.1. Construcción de cláusulas `WHERE` y `ON`

El núcleo de este componente es su capacidad para procesar un `FilterGroup`. Recorre recursivamente los filtros y cualquier grupo anidado.

-   **Para filtros individuales (`Filter`)**: Delega la tarea al `TypeOrmFilterFragmentBuilder`, que conoce la sintaxis específica de MySQL para cada operador (`EQUALS`, `CONTAINS`, etc.).
-   **Para grupos anidados (`FilterGroup`)**: Utiliza la funcionalidad `Brackets` de TypeORM. Esto es crucial porque envuelve las condiciones anidadas en paréntesis `()`, asegurando que la lógica `AND`/`OR` funcione como se espera. Por ejemplo, traduce correctamente `(A AND B) OR C` en lugar del incorrecto `A AND B OR C`.

### 2.2. Construcción de Condiciones de Paginación por Cursor

Este componente también contiene la lógica compleja para la paginación por keyset (basada en cursor). Genera la cláusula `WHERE` necesaria para obtener la siguiente página de resultados basándose en los valores del último ítem de la página anterior.

Por ejemplo, para un cursor ordenado por `created_at` y `uuid`, genera una condición como:

```mysql
(
  (posts.created_at > :cursor_created_at) OR
  (posts.created_at = :cursor_created_at AND posts.uuid > :cursor_uuid)
)
```

Esto es significativamente más complejo que la paginación simple por `OFFSET` y está completamente encapsulado dentro de este ayudante.

## 3. Notas de Uso

-   Normalmente no interactúas directamente con este componente. El `TypeOrmMysqlTranslator` principal lo utiliza internamente para aplicar la cláusula `WHERE`.
-   El `TypeOrmJoinApplier` también lo utiliza para generar las condiciones `ON` para cada `JOIN`.
-   La lógica es consistente tanto para las cláusulas `WHERE` como para las `ON`, lo que significa que puedes usar las mismas capacidades de filtrado enriquecidas en tus joins como lo haces en tu consulta principal.