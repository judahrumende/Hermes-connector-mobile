# OrbityLabs mobile companion

This repository contains the transport layer for the mobile-only companion. The phone is an authenticated remote conversation client for a laptop running OrbityLabs; it does not run agents, keep provider keys, or receive access to the laptop filesystem.

## Pairing protocol

1. The laptop creates a five-minute pairing invitation with a QR URL and an eight-character fallback code.
2. The phone scans the URL or enters the code together with the laptop's LAN address.
3. The laptop returns a device secret once. The mobile application must store it in platform secure storage.
4. Subsequent profile sync and CEO messages send that secret in `X-Orbity-Device-Secret`.

`src/laptop-bridge.ts` implements this protocol. A platform UI can supply a QR scanner and a secure store, then render a simple CEO-chat screen with a profile switcher.

The laptop remains the authority for profiles, agent configuration, model routes, Hermes connectivity, output folders, and background loops.
