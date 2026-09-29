# El Rincón del Mate — Club de Puntos

Primera etapa de la nueva página para GitHub Pages, HTML/CSS/JavaScript y Firebase en el plan gratuito Spark.

## Qué incluye esta etapa

- Consulta sencilla ingresando el celular argentino de 10 dígitos.
- La consulta pública muestra únicamente el saldo y las recompensas disponibles.
- Acceso de administración con Firebase Authentication (correo y contraseña) y verificación de correo.
- Firestore permite buscar un documento por teléfono, pero bloquea el listado de todos los saldos y cualquier escritura pública.
- El panel incluye una importación manual de clientes desde el proyecto anterior. Copia cada cliente al área privada y publica solo sus puntos; no borra datos de origen y no sobrescribe registros existentes.
- Alta de clientes y productos desde el panel administrador; los productos se pueden pausar sin borrar su historial.
- Registro de compras con varios productos y cantidades; suma 1 punto cada $100 y guarda compra, movimiento y saldo en una transacción.
- Canje presencial confirmado por el administrador; descuenta los puntos y guarda el canje y movimiento en una transacción.
- Recompensas visibles: 500 puntos para 10% en yerba y 750 puntos para 10% en otros productos.

La consulta por teléfono no verifica que la persona sea dueña del número. Quien conozca o adivine un celular puede consultar sus puntos. Por eso no se muestran nombre, teléfono ni historial en la vista pública. El cliente no puede canjear desde la página: el canje será presencial y deberá confirmarlo el administrador en una etapa posterior.

## Lo que todavía no está implementado

Todavía no hay una pantalla de historial. La importación se ejecuta únicamente desde el panel administrador después de iniciar sesión y confirmar. Los documentos de origen permanecen intactos. Las compras y canjes actualizan `clientes/{id}`, `consultasPuntos/{celular}` y su registro de movimientos dentro de la misma transacción.

## Configuración pendiente

1. La app web ya está configurada para el proyecto `elrincondelmate-f1fa9`.
2. El correo administrador está limitado a `elrincondelmatesm@gmail.com` en `src/firebase.js` y `firestore.rules`.
3. En Authentication, habilitar correo/contraseña y crear el usuario administrador. Desde la página, iniciar sesión, enviar el enlace de verificación y confirmarlo. El panel se habilita solo después de verificar el correo.
4. Publicar la versión más reciente de `firestore.rules` en el proyecto nuevo de Firebase; incluye permisos privados para productos, compras, canjes y movimientos.
5. El dominio GitHub Pages ya está agregado a Authentication.
6. Publicar la página en GitHub Pages; iniciar sesión, verificar el correo y ejecutar la importación desde el panel.
7. Cargar el catálogo de productos, revisar los registros importados y probar compras y canjes antes de usar el sistema normalmente.

No copiar contraseñas ni claves privadas a ningún archivo. La configuración web Firebase es pública; la seguridad depende de Authentication y Firestore Rules.

## Costos

Esta versión no usa SMS ni Cloud Functions y no requiere vincular facturación. El proyecto permanece en Spark. Firestore tiene cuotas gratuitas; si se supera una cuota Spark, el servicio afectado puede detenerse hasta el siguiente ciclo. Revisar límites actuales en la consola Firebase.

## Datos anteriores

La página anterior está preservada fuera de la carpeta publicable en `work/repo-archive/legacy-index.html`. Su código público contenía una credencial administrativa; considerala comprometida y no la reutilices. El proyecto Firebase anterior se llama `elrincondelmate`; el proyecto nuevo y separado es `elrincondelmate-f1fa9`. La nueva página solo consulta el anterior durante la importación iniciada por el administrador.
