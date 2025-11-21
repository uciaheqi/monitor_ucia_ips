# Panel UCI con Google Sheets y GitHub Pages (sin Apps Script)

Este ejemplo muestra cómo construir un panel de análisis para la Unidad de Cuidados Intensivos utilizando Google Sheets como base de datos y alojando la interfaz en GitHub Pages, sin usar Google Apps Script.

Toda la lógica de acceso a datos se implementa en JavaScript del lado del navegador, mediante la API de Google Sheets y el uso de Google Identity Services para la autenticación OAuth.

## Estructura del proyecto

- `index.html` interfaz principal, preparada para GitHub Pages.
- `assets/css/styles.css` estilos visuales.
- `assets/js/app.js` lógica de conexión con Google Sheets, filtros, indicadores y gráficos.
- `README.md` archivo de documentación.

## Pasos de configuración

1. Crear un proyecto en Google Cloud Console.
2. Habilitar la API de Google Sheets para ese proyecto.
3. Crear una clave de API y un cliente OAuth de tipo aplicación web.
4. Configurar el origen autorizado con la URL de su GitHub Pages, por ejemplo:
   - `https://usuario.github.io`
   - `https://usuario.github.io/nombre_repositorio`
5. Crear o reutilizar una hoja de cálculo con la base UCI. Tomar nota del identificador de la hoja y del nombre de la pestaña.
6. Editar `assets/js/app.js` y completar las constantes:
   - `CLIENT_ID`
   - `API_KEY`
   - `SHEET_ID`
   - `SHEET_NAME`
7. Ajustar los nombres de columnas en el código, para que coincidan con su estructura real. En el ejemplo se utilizan alias como `edad`, `sexo`, `fecha_ingreso`, `estado_egreso`.
8. Activar GitHub Pages en el repositorio que contenga estos archivos.

Una vez completados estos pasos, al cargar la página aparecerá el botón "Conectar con Google". Al autenticarse con una cuenta que tenga acceso a la hoja de cálculo, el panel podrá leer y escribir registros directamente en Google Sheets.

## Consideraciones de seguridad

- La hoja de cálculo no necesita ser pública. El acceso queda restringido a las cuentas autorizadas mediante OAuth.
- Es importante proteger el `CLIENT_ID` y el `API_KEY`, aunque por diseño quedan expuestos del lado del cliente. Por ello se recomienda limitar el uso de la clave de API a los dominios de GitHub Pages configurados.
- Para bases con información sensible se recomienda además aplicar medidas complementarias de anonimización y control de acceso físico y lógico al equipo usado para la consulta del panel.

## Adaptación al contexto de Diego

El código está preparado para servir como base técnica para el panel de la UCI de Ingavi. Los indicadores, filtros y gráficos se pueden extender fácilmente incorporando nuevas columnas y reglas de negocio, manteniendo a Google Sheets como repositorio operativo y prescindiendo de Apps Script como capa intermedia.
