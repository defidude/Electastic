# This project has moved and is deprecated.

### The client is now being maintained by [Joey (NV0N)](https://github.com/rinchen) in the [Colorado Mesh](https://github.com/Colorado-Mesh/meshtastic-client) repo.

## Electastic

A cross-platform Meshtastic desktop client for **Mac**, **Linux**, and **Windows**.

Connect to your Meshtastic devices over Bluetooth, USB Serial, or WiFi — no python, no phone required.

> Originally ported from [Joey's (NV0N) Meshtastic Mac Client](https://github.com/rinchen/meshtastic_mac_client) and the Denver Mesh community. This is a full rewrite in Electron + React + TypeScript to support all platforms.

> [!WARNING]
> This is an early release. A lot of things might be buggy. This may or may not be updated over the coming days/weeks. So far it has only been tested on a **Mac** with a **T-Deck** in Bluetooth Pairing Mode.

---

## Setup

### Prerequisites

- **Node.js 20+** (LTS recommended — [download here](https://nodejs.org/))
- **npm 9+** (included with Node.js)
- **Build tools** for compiling the native SQLite module:
  - **Mac**: Xcode Command Line Tools — run `xcode-select --install`
  - **Linux**: `sudo apt install build-essential python3` (Debian/Ubuntu)
  - **Windows**: [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with the "Desktop development with C++" workload
- A Meshtastic device (any hardware running Meshtastic firmware)

### Mac

```bash
git clone https://github.com/Denver-Mesh/meshtastic-client
cd meshtastic-client
npm install
npm start
```

> **Note:** `npm install` automatically compiles the native SQLite module for Electron via `electron-rebuild`. If it fails, make sure Xcode Command Line Tools are installed.

On first Bluetooth connection, macOS will show a system popup requesting Bluetooth permission — you must accept. If you accidentally denied it, go to **System Settings > Privacy & Security > Bluetooth** and toggle Electastic on.

### Linux

```bash
git clone https://github.com/Denver-Mesh/meshtastic-client
cd meshtastic-client
npm install
npm start
```

BLE requires BlueZ installed. If Bluetooth doesn't work, try launching with `--enable-features=WebBluetooth`. For serial access, add yourself to the `dialout` group:

```bash
sudo usermod -a -G dialout $USER
# Then log out and back in
```

### Windows

```bash
git clone https://github.com/Denver-Mesh/meshtastic-client
cd meshtastic-client
npm install
npm start
```

Should work out of the box. If serial isn't detected, make sure you have the correct USB drivers for your device (e.g., CP210x or CH340 drivers).

---

## Building the Distributable

```bash
# Build for your platform
npm run dist:mac      # macOS → .dmg + .zip in release/
npm run dist:linux    # Linux → .AppImage + .deb in release/
npm run dist:win      # Windows → .exe installer in release/
```

The distributable is output to the `release/` directory.

---

## Features

- **Chat** — send/receive messages across channels with delivery indicators (ACK/NAK) and emoji reactions (tapback)
- **Channel Management** — create and configure channels with custom names and PSK encryption
- **Node List** — all discovered nodes with SNR, battery, GPS, last heard
- **Node Detail Modal** — click any node or sender name for full info
- **Map** — interactive OpenStreetMap with node positions
- **Telemetry** — battery voltage and signal quality charts
- **Radio Config** — region, modem preset, device role, GPS, power, Bluetooth, display settings
- **Admin** — reboot, shutdown, factory reset, trace route, node removal, DB export/import/clear
- **Persistent Storage** — messages and nodes saved locally via SQLite

---

## License

MIT — see [LICENSE](LICENSE)

## Credits

See [CREDITS.md](CREDITS.md). Special thanks to **Joey (NV0N)** for the original Meshtastic Mac Client that this project aws based on, and the Denver Mesh community.
