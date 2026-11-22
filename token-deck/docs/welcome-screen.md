# Device ROM background

The Stream Dock N3 / Ajazz AKP03E stores one 320 × 240 background image in its internal flash memory, displayed on boot and around the key edges while connected.

Token Deck replaces the factory background with a clean solid dark `#131512` canvas:

| File | Purpose |
| --- | --- |
| `resources/welcome-320x240.png` | Solid dark `#131512` 320 × 240 image |
| `resources/welcome-sent.jpg` | Exact wire-rotated JPEG written to flash (1,210 bytes, sha256 `8bdbb5d6766eeeb0698640aa2a8c1a3402e121d8e8b669c427505a4774df276a`) |
| `resources/welcome-tiles/key1-6.jpg` | Solid dark key tiles painted before flashing and on shutdown |

## Write sequence

Implemented in `src/main/burn/sequence.ts`:

1. Open connection and send handshake (`DIS`, `LIG`, `QUCMD`, `LIG`).
2. Paint all six tiles and refresh (`STP`).
3. Send the `LOG` header followed by the JPEG chunks uninterrupted.
4. Wait up to 10 s for the deck's write-completion report (`code = 0x00`).
5. Refresh, repaint active tiles, and record the device serial in `~/.tokendeck/settings.json` so flash is written only once per device.

You can trigger a manual rewrite anytime from **Device & Hooks → Clear Background Now** in the Configurator window.
