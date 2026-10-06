# Política de seguridad

## Alcance

ADOS Docs es una aplicación cliente (SPA/PWA) que se ejecuta en el navegador y
se conecta al **proyecto Firebase de cada usuario**. El mantenedor no opera un
servicio central ni almacena datos de usuarios finales.

Se considera dentro de alcance:

- Ejecución remota de código, robo de datos o CSRF/XSS en la aplicación.
- Bypass de las reglas de seguridad de Cloud Firestore (`firestore.rules`) que
  permita leer o modificar datos de otro usuario.
- Fugas de credenciales o claves versionadas en el repositorio o en los
  artefactos de build.
- Vulnerabilidades relevantes en dependencias ejecutadas en el navegador.

Fuera de alcance:

- La configuración y seguridad del proyecto Firebase del usuario (consola,
  reglas propias, claves expuestas por el usuario).
- Dependencias de desarrollo que no se distribuyen en el bundle de la
  aplicación, salvo que afecten a los flujos de pruebas o despliegue de forma
  explícita.
- Denegación de servicio por volumen en la aplicación estática.

## Versiones soportadas

| Versión | Soporte |
| --- | --- |
| Rama principal del repositorio | ✅ soportada |
| Cualquier otra rama o fork | ❌ sin soporte |

No hay releases versionadas todavía: el soporte se ofrece sobre la última
versión de la rama principal.

## Cómo reportar una vulnerabilidad

1. Usa el reporte privado de GitHub: en este repositorio, entra en
   **Security → Report a vulnerability** (funcionalidad *Security Advisories*).
   Describe pasos de reproducción, impacto, versión o commit afectado y, si
   tienes, un proof of concept.
2. **No abras un issue público**, ni comentes la vulnerabilidad en ningún canal
   público, hasta que exista una corrección publicada.
3. Si no puedes usar el reporte privado, contacta al mantenedor por los canales
   públicos del proyecto y pide un medio privado; no envíes detalles sensibles
   por canales públicos.

## Compromiso de respuesta

- Acuse de recibo en un máximo de **7 días hábiles**.
- Evaluación de impacto y plan de corrección comunicado en un máximo de
  **30 días** para vulnerabilidades confirmadas.
- Corrección en la rama principal y aviso público (advisory) cuando el fix
  esté disponible, coordinando la fecha de publicación con quien reportó.
- Los reportes se tratan de forma confidencial: no se compartirá quién reportó
  sin su consentimiento.

## Verificaciones automatizadas

El repositorio mantiene gates permanentes que cualquier PR debe pasar:

- `npm run test:safety` — rechazo fail-closed del proyecto de producción,
  ausencia de `.firebaserc`/`.env*` trackeados, CI sin secretos.
- `npm run scan` — patrones de secretos y correos no ficticios en archivos
  trackeados.
- `npm run test:rules` — aislamiento por usuario en Cloud Firestore.

Si detectas una credencial real versionada por error, repórtala por el canal
privado indicado arriba y rota la credencial de inmediato: la rotación siempre
corre por parte del propietario del recurso.
