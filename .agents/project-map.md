# Project Map - CaboBus

Estado real revisado y actualizado el 2026-04-17 sobre el repositorio y el worktree actual.

Esta revision incluye tanto la base web ya funcional como los cambios locales visibles de integracion movil, tracking nativo y soporte HTTP para ubicacion del conductor.

## 1. Proposito del producto

CaboBus es un MVP de movilidad urbana en tiempo real para San Jose del Cabo, BCS, Mexico.

Objetivo central:

- dar visibilidad digital sobre rutas reales ya existentes;
- permitir a pasajeros consultar rutas y unidades activas sin login;
- permitir a conductores operar una unidad y compartir ubicacion en tiempo real;
- permitir a administracion gestionar operacion, conductores, unidades y rutas activas sin sobreingenieria.

## 2. Resumen ejecutivo del estado actual

El proyecto ya no esta en fase de bootstrap.

Hoy existe:

- frontend web funcional con React, Router, Tailwind y MapLibre GL JS;
- backend operativo en Convex con auth propia minima, servicios, ubicaciones y dashboard admin;
- mapa publico de pasajero conectado a Convex;
- login real para conductor y admin con sesiones persistidas en `localStorage`;
- panel de conductor con activacion, pausa, reanudacion, finalizacion, cambio de ruta y fallback manual;
- tracking real en navegador con permiso separado del arranque;
- integracion nativa con Capacitor para Android/iOS;
- tracking nativo en segundo plano para conductor;
- endpoint HTTP `POST /driver/location` para subida nativa de ubicaciones;
- cola offline local para lecturas nativas;
- pipeline reproducible de importacion de rutas KML a seeds/GeoJSON;
- bitacora operativa simple con `systemEvents`.

Pendiente o incompleto:

- pruebas automaticas;
- particion de componentes grandes en admin y conductor;
- politica de retencion para `locationUpdates`;
- endurecimiento de auth mas alla del esquema minimo del MVP;
- limpieza de deuda legacy en rutas y documentacion desactualizada.

## 3. Invariantes actuales del proyecto

Estas decisiones ya estan reflejadas en codigo y deben tratarse como reglas activas mientras no se redefinan explicitamente:

- stack principal: React + Vite + TypeScript + Tailwind CSS 4 + React Router 7 + MapLibre GL JS + Stadia Maps + Convex;
- backend del MVP: Convex;
- rutas reales importadas desde KML son fuente operativa;
- pasajero entra sin login;
- conductor y admin usan auth propia minima con sesiones en Convex;
- admin entra por URL directa, no desde la navegacion publica;
- el estado operativo del servicio se deriva en backend y se comparte a frontend;
- existe una sola ruta operativa de escritura de ubicaciones al backend: `api.driver.addLocationUpdate`;
- el tracking del conductor ya soporta navegador y app nativa;
- la app nativa del conductor usa HTTP hacia Convex solo como transporte, no como logica paralela distinta.

## 4. Stack, herramientas y scripts

Dependencias principales observadas:

- React 19
- Vite 8
- TypeScript 5
- Tailwind CSS 4
- React Router 7
- Convex
- MapLibre GL JS + Stadia Maps
- Capacitor 8
- `@capacitor-community/background-geolocation`
- `@capacitor/preferences`
- `@capacitor/local-notifications`

Scripts relevantes:

- `npm run dev`
- `npm run build`
- `npm run lint`
- `npm run preview`
- `npm run convex:dev`
- `npm run convex:codegen`
- `npm run convex:seed`
- `npm run routes:prepare`
- `npm run cap:sync`
- `npm run cap:android`
- `npm run cap:ios`

Variables de entorno usadas por frontend:

- `VITE_CONVEX_URL`
- `VITE_CONVEX_SITE_URL`
- `VITE_STADIA_MAPS_API_KEY`
- `VITE_STADIA_STYLE_ID`
- `VITE_MAP_STYLE_URL`

## 5. Mapa real del repositorio

```text
.
|-- .agents/
|   |-- README.md
|   `-- project-map.md
|-- .convex/
|-- android/
|-- convex/
|   |-- _generated/
|   |-- data/
|   |   |-- importedRoutes.generated.ts
|   |   `-- importedRoutes.ts
|   |-- lib/
|   |   |-- activeServiceSnapshot.ts
|   |   |-- auth.ts
|   |   |-- driverLocationUpdates.ts
|   |   |-- location.ts
|   |   |-- routes.ts
|   |   |-- serviceOperationalState.ts
|   |   |-- services.ts
|   |   `-- systemEvents.ts
|   |-- admin.ts
|   |-- auth.ts
|   |-- driver.ts
|   |-- http.ts
|   |-- passengerMap.ts
|   |-- routes.ts
|   |-- schema.ts
|   |-- seed.ts
|   `-- vehicles.ts
|-- data/
|   |-- processed/
|   |   `-- routes.geojson
|   `-- raw/
|       |-- sjc_colectivo_routes.kml
|       `-- sjc_urbano_routes.kml
|-- dist/
|-- ios/
|-- public/
|   |-- favicon.svg
|   `-- logo.png
|-- scripts/
|   `-- routes/
|       |-- kml.ts
|       |-- normalize.ts
|       `-- prepare.ts
|-- shared/
|   `-- tracking.ts
`-- src/
    |-- app/
    |-- components/
    |-- features/
    |   |-- admin/
    |   |-- auth/
    |   |-- driver/
    |   |-- map/
    |   |-- routes/
    |   `-- vehicles/
    |-- hooks/
    |-- lib/
    |-- pages/
    |-- styles/
    `-- types/
```

Notas de estructura:

- `src/features/routes` y `src/features/vehicles` existen como carpetas, pero no contienen implementacion frontend activa.
- `android/` e `ios/` ya existen y contienen assets web sincronizados.
- `dist/` esta presente, por lo que el repo actualmente incluye artefactos de build local.

## 6. Frontend

### App shell y router

Archivos clave:

- `src/main.tsx`
- `src/app/App.tsx`
- `src/app/router.tsx`
- `src/components/layout/AppLayout.tsx`
- `src/lib/convex.tsx`

Estado actual:

- `RouterProvider` monta 6 flujos reales: `/`, `/passenger-map`, `/driver/login`, `/driver`, `/admin/login`, `/admin`;
- existe redireccion legacy `/login -> /driver/login`;
- las paginas cargan con `lazy`;
- `AppProviders` crea cliente Convex solo si `VITE_CONVEX_URL` esta disponible;
- el shell publico se oculta en home, mapa de pasajero y flujo del conductor;
- admin sigue fuera de la navegacion publica.

### Home y entrada por plataforma

Archivo clave:

- `src/pages/HomePage.tsx`

Estado actual:

- en web muestra acceso para pasajero y conductor;
- en entorno nativo redirige directo a `/driver/login`;
- ya existe diferencia explicita entre flujo web y flujo app movil del conductor.

### Auth frontend

Archivos clave:

- `src/features/auth/components/RoleLoginCard.tsx`
- `src/features/auth/hooks/useStoredAuthSession.ts`
- `src/features/auth/lib/sessionKeys.ts`
- `src/pages/DriverLoginPage.tsx`
- `src/pages/AdminLoginPage.tsx`
- `src/pages/DriverPanelPage.tsx`
- `src/pages/AdminDashboardPage.tsx`

Estado actual:

- conductor y admin usan el mismo formulario base;
- la sesion minima se persiste en `localStorage`;
- cada pagina protegida valida la sesion contra `api.auth.getSession`;
- si la sesion expira o deja de ser valida, el frontend limpia storage y redirige.

### Passenger map

Archivos clave:

- `src/features/map/components/PassengerMapView.tsx`
- `src/features/map/components/PassengerMapHeader.tsx`
- `src/features/map/components/PassengerMapSidebar.tsx`
- `src/features/map/components/PassengerMapOverlays.tsx`
- `src/features/map/components/passengerMapViewUtils.ts`
- `src/features/map/hooks/usePassengerMapSnapshot.ts`
- `src/features/map/hooks/usePassengerRouteSelection.ts`
- `src/features/map/hooks/usePassengerGeolocation.ts`
- `src/lib/mapGeometry.ts`
- `src/lib/env.ts`

Estado actual:

- consume snapshot real desde Convex;
- renderiza rutas activas y unidades visibles en MapLibre GL JS;
- usa estilo vectorial de Stadia Maps configurable desde variables de entorno;
- agrupa rutas por `transportType`;
- permite enfoque por ruta;
- mantiene seleccion de ruta en `localStorage`;
- tiene busqueda por ruta/trayecto;
- puede filtrar solo rutas con unidades visibles;
- calcula ruta sugerida por proximidad si el pasajero comparte ubicacion;
- usa geolocalizacion opcional propia para estimar cercania;
- muestra estado operativo compartido en badges y capas de marcadores;
- en vista general oculta unidades `probably_stopped`, pero al enfocar una ruta puede seguir mostrando estado degradado.

Notas:

- el mapa del pasajero ya es una vista UX real, no un prototipo minimo;
- usa `useDeferredValue`, `startTransition` y `useEffectEvent` en la composicion del mapa.
- el control de zoom nativo de MapLibre se ubica en esquina superior izquierda para no competir con overlays propios del mapa.
- `src/lib/mapGeometry.ts` concentra helpers compartidos para `LineString`, `Point`, `Polygon` y bounds del mapa.

### Driver frontend

Archivos clave:

- `src/features/driver/components/DriverStatusCard.tsx`
- `src/features/driver/components/DriverStatusSummary.tsx`
- `src/features/driver/components/DriverStatusModals.tsx`
- `src/features/driver/components/DriverRouteMap.tsx`
- `src/features/driver/components/driverStatusCardUtils.ts`
- `src/features/driver/hooks/useDriverLocationTracking.ts`
- `src/features/driver/hooks/useBrowserLocationTracking.ts`
- `src/features/driver/hooks/useNativeBackgroundLocationTracking.ts`
- `src/features/driver/hooks/locationTrackingTypes.ts`
- `src/features/driver/lib/nativeLocationUpload.ts`
- `src/features/driver/lib/nativeTrackingQueue.ts`

Estado actual:

- el conductor opera sobre su unidad base asignada;
- puede activar, pausar, reanudar y finalizar servicio;
- puede cambiar su ruta asignada desde el panel;
- ve un mapa propio de la ruta activa o seleccionada;
- ese mapa propio ya usa MapLibre GL JS con el mismo estilo base configurado para pasajero;
- mantiene fallback manual para envio de ubicacion;
- separa correctamente permiso de ubicacion del arranque del tracking;
- soporta tracking web y tracking nativo;
- expone en UI si corre en `Navegador` o `App nativa`;
- informa si el segundo plano esta listo o no garantizado;
- puede abrir ajustes del sistema cuando el permiso fue denegado en nativo.

Notas:

- `DriverStatusCard.tsx` concentra buena parte de la orquestacion de UI, tracking y acciones operativas;
- la preferencia de auto-reanudar compartir ubicacion se guarda por conductor en `localStorage`.
- `DriverRouteMap.tsx` reutiliza configuracion comun de Stadia Maps via `src/lib/env.ts`.

### Admin frontend

Archivos clave:

- `src/features/admin/components/AdminOverview.tsx`
- `src/features/admin/hooks/useAdminOperationalOverview.ts`

Estado actual:

- el dashboard admin es real y esta conectado a Convex;
- muestra monitoreo de servicios abiertos;
- muestra alertas operativas;
- muestra bitacora reciente;
- permite crear, editar e inactivar conductores;
- permite crear, editar y cambiar estado de unidades;
- permite activar/desactivar rutas;
- permite pausar, reanudar y finalizar servicios.

Notas:

- `AdminOverview.tsx` ya es un componente grande que conviene dividir.

## 7. Backend Convex

### Tablas reales

Archivo clave:

- `convex/schema.ts`

Tablas observadas:

- `users`
- `routes`
- `vehicles`
- `activeServices`
- `locationUpdates`
- `sessions`
- `systemEvents`

Modelo actual:

- `users` guarda `defaultRouteId` y `defaultVehicleId`;
- `routes` mantiene `segments` como geometria operativa y `path` como compatibilidad legacy;
- `activeServices` es la verdad compartida del estado operativo actual;
- `locationUpdates` conserva historial de ubicaciones por servicio;
- `sessions` maneja sesion minima de conductor/admin con expiracion de 14 dias;
- `systemEvents` ya existe y se usa en operacion.

### Auth

Archivos clave:

- `convex/auth.ts`
- `convex/lib/auth.ts`

Estado actual:

- login propio minimo para `driver` y `admin`;
- email normalizado;
- password con hash SHA-256;
- una sola sesion activa por usuario;
- expiracion de sesion a 14 dias;
- `logout` invalida token;
- `getSession` rehidrata sesion y usuario resumido.

Limitacion vigente:

- el hashing actual es suficiente para MVP interno, pero debil para un endurecimiento serio de auth.

### Driver backend

Archivo clave:

- `convex/driver.ts`

Estado actual:

- `getPanelState` devuelve conductor, unidad asignada, rutas activas, ruta preferida y servicio actual;
- `activateService` abre servicio solo si la ruta esta activa y la unidad esta disponible;
- `pauseCurrentService`, `resumeCurrentService`, `finishCurrentService` actualizan servicio y unidad;
- `changeAssignedRoute` cambia ruta base del conductor y, si hay servicio abierto, reasigna tambien el servicio y limpia la ultima posicion;
- `addLocationUpdate` delega a `convex/lib/driverLocationUpdates.ts`.

### Admin backend

Archivo clave:

- `convex/admin.ts`

Estado actual:

- `getDashboardState` devuelve dashboard consolidado;
- calcula overview, resumenes por ruta, alertas, eventos, conductores, unidades y catalogo de rutas;
- incluye mutaciones reales de gestion para conductores, unidades, servicios y rutas;
- ya contiene validaciones de negocio para conflictos operativos.

### Passenger map backend

Archivo clave:

- `convex/passengerMap.ts`

Estado actual:

- expone `getSnapshot`;
- devuelve solo rutas activas;
- devuelve solo servicios con `status = active`;
- solo muestra vehiculos con ultima senal `device` y posicion disponible;
- calcula `operationalStatus` en backend;
- hace fallback a `users` y `vehicles` si faltan snapshots desnormalizados.

### Endpoint HTTP para app nativa

Archivo clave:

- `convex/http.ts`

Estado actual:

- existe `OPTIONS /driver/location`;
- existe `POST /driver/location`;
- acepta `sessionToken`, `lat`, `lng`, `accuracyMeters?`, `capturedAt?`;
- reenvia internamente a `api.driver.addLocationUpdate`;
- devuelve `401` si la sesion ya no es valida y `400` para errores operativos o payload invalido;
- usa CORS abierto.

### Librerias backend

Archivos clave:

- `convex/lib/driverLocationUpdates.ts`
- `convex/lib/location.ts`
- `convex/lib/routes.ts`
- `convex/lib/services.ts`
- `convex/lib/serviceOperationalState.ts`
- `convex/lib/systemEvents.ts`
- `convex/lib/activeServiceSnapshot.ts`

Estado actual:

- `driverLocationUpdates.ts` es la ruta unica de escritura de ubicaciones;
- valida sesion, servicio activo, plausibilidad y frescura del timestamp;
- `location.ts` aplica validacion de precision y distancia a ruta;
- `services.ts` consolida servicios abiertos y detecta conflictos;
- `serviceOperationalState.ts` deriva el estado operativo compartido desde `shared/tracking.ts`;
- `systemEvents.ts` inserta eventos operativos simples;
- `routes.ts` normaliza lectura de `segments`, `transportType`, `sourceFile` e `importKey`.

## 8. Integracion movil y tracking nativo

Archivos clave:

- `package.json`
- `capacitor.config.ts`
- `src/lib/platform.ts`
- `src/lib/env.ts`
- `android/app/src/main/AndroidManifest.xml`
- `ios/App/App/Info.plist`

Estado actual:

- el proyecto ya incorpora Capacitor como shell movil;
- `capacitor.config.ts` define `appId = mx.cabobus.app`, `appName = CaboBus Conductor`, `webDir = dist` y `useLegacyBridge = true`;
- Android declara al menos `INTERNET` y `ACCESS_BACKGROUND_LOCATION`;
- iOS ya declara permisos de ubicacion y `UIBackgroundModes` con `location`;
- existen proyectos nativos reales en `android/` e `ios/`;
- ambos contienen assets web sincronizados.

Tracking nativo:

- `useDriverLocationTracking()` conmuta entre navegador y nativo segun `Capacitor.isNativePlatform()`;
- `useNativeBackgroundLocationTracking.ts` usa `@capacitor-community/background-geolocation`;
- en Android exige permiso de notificaciones antes de arrancar tracking en segundo plano;
- el transporte nativo usa `CapacitorHttp` hacia `VITE_CONVEX_SITE_URL + /driver/location`;
- si falla con error reintentable, las lecturas se encolan en `Preferences`;
- la cola se intenta vaciar antes de nuevos envios y al volver al foreground.

Limitaciones visibles:

- la cola nativa no tiene limite ni expiracion;
- si falta `VITE_CONVEX_SITE_URL`, el tracking nativo falla aunque el web siga disponible;
- no se observo rehidratacion robusta tras cierre total del proceso nativo.

## 9. Pipeline de rutas reales

Archivos clave:

- `scripts/routes/kml.ts`
- `scripts/routes/normalize.ts`
- `scripts/routes/prepare.ts`
- `convex/data/importedRoutes.ts`
- `convex/data/importedRoutes.generated.ts`
- `data/raw/*.kml`
- `data/processed/routes.geojson`

Estado actual:

- las fuentes operativas reales estan en:
  - `data/raw/sjc_urbano_routes.kml`
  - `data/raw/sjc_colectivo_routes.kml`
- `scripts/routes/prepare.ts` lee los KML, los normaliza y genera:
  - `convex/data/importedRoutes.generated.ts`
  - `data/processed/routes.geojson`
- el flujo actual genera 15 rutas importadas;
- `normalize.ts` repara parte del mojibake, construye `slug`, `importKey`, `sourceFile`, `transportType`, `color` y `segments`.

Notas:

- aun hay textos con mojibake visibles en seeds importados y descripciones de rutas;
- los artefactos derivados deben regenerarse por script, no editarse a mano.

## 10. Seeds y datos base

Archivo clave:

- `convex/seed.ts`

Estado actual:

- seed idempotente alineado al pipeline real;
- inserta o actualiza rutas importadas por `importKey`;
- normaliza rutas legacy fuera del set importado;
- crea o actualiza:
  - 2 conductores semilla
  - 1 admin semilla
  - 2 unidades semilla
- asigna `defaultRouteId` y `defaultVehicleId` a conductores;
- cierra servicios abiertos ligados a entidades semilla para evitar conflictos al reseed.

Notas:

- las credenciales de seed siguen definidas dentro de `convex/seed.ts`;
- este documento no las replica para no duplicar informacion sensible del entorno local.

## 11. Flujos operativos actuales

### Flujo pasajero

1. El usuario entra a `/`.
2. En web puede elegir `Mapa para pasajeros`.
3. `PassengerMapPage` carga `PassengerMapView`.
4. `usePassengerMapSnapshot` consulta `api.passengerMap.getSnapshot`.
5. El frontend renderiza rutas activas y unidades visibles.
6. Si el pasajero comparte su ubicacion, el mapa calcula cercania y sugiere rutas.

### Flujo conductor web

1. El usuario entra a `/driver/login`.
2. `api.auth.login` valida credenciales y crea sesion.
3. `DriverPanelPage` valida la sesion con `api.auth.getSession`.
4. `api.driver.getPanelState` carga unidad, rutas y servicio actual.
5. El conductor puede iniciar, pausar, reanudar o finalizar servicio.
6. Pide permiso de ubicacion y luego arranca tracking real.
7. Los envios terminan en `api.driver.addLocationUpdate`.
8. Si el tracking real falla o no aplica, queda disponible el fallback manual.

### Flujo conductor nativo

1. La app nativa redirige desde home a `/driver/login`.
2. Tras login, el panel usa tracking nativo de fondo.
3. `useNativeBackgroundLocationTracking` solicita permiso y confirma una primera lectura.
4. Las lecturas se suben por `POST /driver/location`.
5. Si no hay conectividad o falla el transporte, se encolan en `Preferences`.
6. La cola se reintenta vaciar cuando vuelve la conectividad util o la app regresa al foreground.

### Flujo admin

1. El admin entra por `/admin/login`.
2. `api.auth.login` crea la sesion admin.
3. `AdminDashboardPage` valida sesion y consulta `api.admin.getDashboardState`.
4. Desde la UI gestiona conductores, unidades, rutas y servicios.
5. Tambien consulta alertas y bitacora reciente.

### Flujo de rutas reales

1. Actualizar KML en `data/raw/`.
2. Ejecutar `npm run routes:prepare`.
3. Revisar `convex/data/importedRoutes.generated.ts` y `data/processed/routes.geojson`.
4. Ejecutar `npm run convex:seed`.
5. Convex inserta o actualiza rutas y normaliza legacy.

## 12. Estado operativo compartido

Archivo clave:

- `shared/tracking.ts`

Estado actual:

- `ServiceOperationalStatus` compartido:
  - `active_recent`
  - `active_stale`
  - `probably_stopped`
- thresholds compartidos:
  - reciente: 90 s
  - desactualizada: 300 s
  - intervalo minimo de envio: 8 s
  - movimiento minimo: 15 m

Uso actual:

- backend deriva el estado operativo;
- pasajero y admin lo consumen para visualizacion;
- frontend ya no depende principalmente de timestamps crudos para esa clasificacion.

## 13. Artefactos generados o sincronizados

Tratar como derivados o sincronizados:

- `convex/_generated/*`
- `convex/data/importedRoutes.generated.ts`
- `data/processed/routes.geojson`
- `dist/*`
- `android/app/src/main/assets/public/*`
- `ios/App/App/public/*`

Regla:

- no editarlos manualmente si el flujo correcto es regenerar o sincronizar.

## 14. Deuda tecnica y riesgos visibles

Arquitectura/UI:

- `src/features/driver/components/DriverStatusCard.tsx` concentra demasiada orquestacion;
- `src/features/admin/components/AdminOverview.tsx` ya es un monolito;
- hay utilidades duplicadas entre mapa y conductor, por ejemplo parseo de direccion y labels de transporte;
- `useDriverLocationTracking()` instancia ambos hooks y decide al final cual devolver.

Datos/backend:

- `locationUpdates` no tiene politica de retencion;
- sesiones expiradas quedan invalidas pero no se purgan automaticamente;
- `routes.path` sigue como compatibilidad legacy;
- `passengerMap.ts` aun depende de fallback a snapshots incompletos;
- `http.ts` usa CORS abierto;
- hash de password con SHA-256 simple.

Movil/tracking:

- cola offline nativa sin limite ni expiracion;
- dependencia fuerte de `VITE_CONVEX_SITE_URL` para nativo;
- no se observaron pruebas automaticas de cola offline ni tracking nativo;
- Android/iOS ya incluyen assets sincronizados, lo que aumenta riesgo de drift si no se usa `cap sync` con disciplina.

Documentacion:

- `README.md` ya esta desactualizado frente al estado real;
- el `project-map` anterior no reflejaba capa nativa, endpoint HTTP, `systemEvents` ni la migracion de Leaflet a MapLibre GL JS + Stadia Maps.

## 15. Validacion recomendada

Cambios frontend:

- `npm run lint`
- `npm run build`

Cambios Convex:

- `npm run convex:codegen`
- `npm run lint`
- `npm run build`
- `npm run convex:seed` si cambia schema, auth o seed

Cambios en rutas importadas:

- `npm run routes:prepare`
- `npm run convex:seed`
- `npm run build`

Cambios nativos:

- `npm run build`
- `npm run cap:sync`
- abrir `android/` o `ios/` para validacion de permisos y background tracking

## 16. Estado de validacion de esta revision

En esta actualizacion documental no se re-ejecutaron:

- `npm run build`
- `npm run lint`
- `npm run convex:codegen`
- `npm run convex:seed`

La revision se baso en inspeccion directa del codigo y del worktree actual del 2026-04-17.

## 17. Criterio para siguientes chats

Antes de editar:

1. Leer `agents.md`.
2. Leer este `project-map`.
3. Confirmar si la tarea toca:
   - pasajero/mapa
   - conductor web
   - conductor nativo/tracking
   - admin
   - auth
   - rutas reales / seed
   - Convex HTTP
4. Revisar los archivos reales del modulo afectado.
5. No asumir que el proyecto sigue siendo solo web: hoy ya existe capa movil nativa.

## 18. Siguiente frontera recomendada

La siguiente etapa coherente no es abrir mas placeholders, sino estabilizar lo ya construido:

- dividir `DriverStatusCard` y `AdminOverview` en subcomponentes sin cambiar comportamiento;
- definir retencion o limpieza de `locationUpdates`;
- agregar pruebas basicas para auth, servicios, dashboard y tracking;
- endurecer la estrategia de auth si el MVP deja de ser estrictamente interno;
- limpiar deuda legacy de `routes.path`;
- corregir mojibake residual del pipeline/documentacion;
- alinear `README.md` con el estado real actual.
