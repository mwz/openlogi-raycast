# OpenLogi Batteries for Raycast

OpenLogi Batteries is a read-only Raycast menu-bar extension for battery levels reported by
[OpenLogi](https://github.com/AprilNEA/OpenLogi).

The menu bar shows the lowest readable battery percentage among connected devices. Open the menu to see every online
device, its battery level, and whether it is connected through Logi Bolt, a Logitech Unifying or Lightspeed receiver,
Bluetooth, wired USB, or an unidentified direct connection.

## Requirements

- macOS with Raycast installed
- The standalone `openlogi` CLI with support for `openlogi list`
- Logi Options+ must not own the same HID++ receiver while OpenLogi is reading it

The OpenLogi desktop app and some macOS packages may not expose the CLI on `PATH`. If automatic discovery does not find
it, open this command's preferences and select the executable under **OpenLogi CLI**. The extension checks `PATH`, Apple
Silicon and Intel Homebrew locations, and `~/.cargo/bin/openlogi`.

For source installation instructions, see the
[OpenLogi development guide](https://github.com/AprilNEA/OpenLogi/blob/master/docs/DEVELOPMENT.md).

## Behaviour

- Reads devices when enabled, whenever its menu is opened, and through Raycast background refresh every five minutes.
- Lists only online devices; an online device with no readable battery is shown as “Battery unavailable”.
- Marks charging devices in the list and uses a charging battery icon when that device drives the menu-bar percentage.
- Hides the menu-bar item when no online device has a readable battery.
- Shows a `?` error item when the CLI is missing, times out, exits unsuccessfully, or returns an unsupported device row.
- “Quit OpenLogi Batteries” hides the item and suspends background polling until the command is manually run again.
- Never changes device settings, writes OpenLogi configuration, sends analytics, or makes network requests.

Supported device icons include mouse, trackball, keyboard, numpad, touchpad, headset, gamepad, and joystick. Unknown
device types use a battery icon.

## Development

```sh
pnpm install
pnpm test
pnpm lint
pnpm build
```

## Licence

MIT
