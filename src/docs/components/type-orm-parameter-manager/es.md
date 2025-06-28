# TypeOrmParameterManager

## 1. Propósito Principal

El `TypeOrmParameterManager` es un ayudante interno simple pero esencial. Su único trabajo es generar nombres de parámetros únicos (ej., `:param_0`, `:param_1`, ...) para la consulta SQL. Esta es una medida de seguridad fundamental para prevenir la inyección de SQL, asegurando que todos los valores proporcionados por el usuario se parametricen correctamente.

## 2. Cómo Funciona

El gestor mantiene un simple contador interno. Cada vez que una parte de la consulta necesita un nuevo parámetro, el gestor proporciona el siguiente nombre en la secuencia (ej., `param_N`) e incrementa su contador.

Al comienzo de cada nuevo proceso de traducción (cuando llamas a `translator.translate()`), el traductor principal reinicia este contador. Esto asegura que cada consulta se construya con un conjunto nuevo de nombres de parámetros, evitando cualquier conflicto.

## 3. Notas de Uso

No interactúas con este componente directamente. Es creado y utilizado internamente por el `TypeOrmMysqlTranslator` y sus ayudantes para asegurar que todas las consultas sean seguras.
