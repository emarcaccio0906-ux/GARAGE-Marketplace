# Servidor y notificaciones de GARAGE · Marketplace

El servidor son **Cloud Functions** de Firebase (carpeta `functions/`). Hace dos cosas:

1. **Notificaciones push** al teléfono, aunque la app esté cerrada:
   mensajes, me gusta, comentarios, nuevos seguidores, ofertas y contraofertas del Mercado,
   ofertas aceptadas o rechazadas, cartas aprobadas o rechazadas y retos ganados.
2. **Monedas automáticas:** cuando GARAGE aprueba una carta, se acreditan sus puntos como
   monedas (1 punto = 1 moneda), sin que nadie tenga la app abierta.

## Antes de subirlo

- El proyecto de Firebase tiene que estar en el **plan Blaze** (pago por uso). Las Cloud Functions
  no funcionan en el plan gratis (Spark). Pon una alerta de presupuesto de $1–5.
- Las reglas de Firestore ya deben tener la colección `push_tokens` (están en la consola de Firebase).

## Cómo subirlo (desde el navegador, sin instalar nada)

1. Abre **Google Cloud Shell**: https://shell.cloud.google.com (con la misma cuenta de Google de Firebase).
2. Pega estos comandos, uno por uno:

```bash
git clone https://github.com/emarcaccio0906-ux/GARAGE-Marketplace.git
cd GARAGE-Marketplace/functions && npm install && cd ..
npx firebase-tools login --no-localhost
npx firebase-tools deploy --only functions --project garage-car-spotting
```

- El paso de `login` te da un link: ábrelo, entra con tu cuenta y pega el código que te muestra.
- `--only functions` sube solo el servidor. **No toca las reglas de Firestore** ni nada más.
- La primera vez tarda unos 5 minutos.

## Para actualizarlo después

```bash
cd GARAGE-Marketplace && git pull
cd functions && npm install && cd ..
npx firebase-tools deploy --only functions --project garage-car-spotting
```

## Notificaciones en el teléfono

- Cada persona entra a **Social → Perfil → Activar notificaciones** (una vez por teléfono).
- **iPhone:** primero hay que abrir GARAGE en Safari → Compartir → **Añadir a pantalla de inicio**,
  abrir GARAGE desde ese ícono y ahí tocar *Activar notificaciones*. (Requiere iOS 16.4 o más nuevo.)
- **Android:** funciona directo desde Chrome.
