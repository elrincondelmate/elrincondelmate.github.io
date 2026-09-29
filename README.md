# El Rincón del Mate — Club de Puntos

Sitio estático publicado con GitHub Pages. Usa HTML, CSS, JavaScript y Firebase (Authentication y Firestore) en el plan Spark.

## Pantalla del cliente

- Consulta puntos con el celular de 10 dígitos.
- Muestra el saldo y las recompensas activas.
- Los canjes se hacen en el local y los confirma el administrador.
- El cliente no ve el historial de movimientos. La consulta por celular no comprueba que la persona sea dueña del número.

## Panel de administración

El panel tiene navegación horizontal por Inicio, Clientes, Productos, Compras, Recompensas, Cupones, Historial y Configuración.

- **Inicio:** clientes, productos activos, ventas del mes, puntos en circulación y actividad reciente.
- **Clientes:** importación no destructiva desde la base anterior, alta, edición de nombre, pausa/reactivación, búsqueda, ajustes manuales de puntos con motivo y puntos automáticos al ingresar un referido.
- **Productos:** alta, edición de nombre y precio, pausa/reactivación y retiro del catálogo. Retirar es un archivo lógico: conserva las compras anteriores.
- **Compras:** varios productos por compra; el historial muestra cada producto y cantidad. Cada $100 agrega 1 punto por defecto. Compra, saldo y movimiento se guardan juntos. Una compra de prueba se puede anular desde el historial; se reintegran sus puntos y se conserva el registro. Si ya se gastaron esos puntos, la anulación se bloquea para evitar un saldo negativo.
- **Recompensas:** alta, edición de nombre y puntos, pausa/reactivación y retiro; el catálogo público muestra las activas.
- **Cupones:** emisión con código y QR, descuento de puntos al emitir, confirmación de uso y anulación con reintegro.
- **Historial:** compras, cupones, ajustes, importaciones y cambios de clientes, productos, recompensas y configuración.
- **Configuración:** relación pesos/puntos, puntos por referido, dos WhatsApp, Instagram y vencimiento opcional de cupones. Los datos de contacto se publican únicamente en `configuracionPublica/negocio`.
- **Catálogos:** enlaces separados al catálogo de yerbas, catálogo general y Linktree. Al iniciar sesión por primera vez con este paquete, se agregan al inventario los productos que aún no existan por nombre; se conserva todo lo que ya esté cargado. La yerba Rei Verde Orgánica aparece pausada porque el PDF no publica el precio.
- **Recompensas iniciales:** 500 puntos para 10% en yerba; 750 para 10% en otros; 1.000 para 20% en yerba; 1.500 para 20% en otros; 2.000 para 2×1 en yerba; 2.250 para 2×1 en otros. Se agregan las recompensas faltantes sin sobrescribir las existentes.

Los productos, clientes y recompensas retirados se conservan; no se borran físicamente. El historial de actividad es solo para administración.

## Firebase y publicación

- Proyecto: `elrincondelmate-f1fa9`.
- Administrador permitido: `elrincondelmatesm@gmail.com`; se exige correo verificado.
- Firestore Rules: se mantienen las reglas ya publicadas; los datos de contacto nuevos se muestran desde el mismo documento público de negocio.
- GitHub Pages: publicar `index.html`, `styles.css`, `src/main.js` y `src/catalog-products.js`. Mantener `src/firebase.js` en su ruta actual; su configuración Firebase no cambió.

## Costos y límites

Esta versión no usa SMS ni Cloud Functions y no requiere vincular facturación. La creación del QR se hace en el navegador con la librería de código abierto qrcode, cargada desde jsDelivr. Firestore está sujeto a las cuotas gratuitas de Spark; si se supera una cuota, Firebase puede pausar el servicio hasta el siguiente ciclo.

No se guardan contraseñas en el código. La configuración web de Firebase es pública; la seguridad de los datos privados depende de Authentication y las reglas de Firestore.
