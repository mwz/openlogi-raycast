import { describe, expect, it } from "vitest";
import { batteryLabel, compactConnectionLabel, deviceTitle, deviceTooltip } from "../src/device-presentation";
import { OpenLogiDevice } from "../src/model";

function device(overrides: Partial<OpenLogiDevice> = {}): OpenLogiDevice {
  return {
    slot: 1,
    online: true,
    name: "MX Master 3S",
    kind: "mouse",
    batteryAvailable: true,
    percentage: 80,
    charging: false,
    order: 0,
    connectionKind: "bolt",
    connectionLabel: "Logi Bolt receiver",
    ...overrides,
  };
}

describe("device presentation", () => {
  it("puts a readable battery percentage in the primary title", () => {
    const connectedDevice = device();

    expect(batteryLabel(connectedDevice)).toBe("80%");
    expect(deviceTitle(connectedDevice)).toBe("MX Master 3S (Logi Bolt) — 80%");
    expect(deviceTooltip(connectedDevice)).toBe("MX Master 3S (Logi Bolt) — 80% · Logi Bolt receiver");
  });

  it("makes an unavailable battery explicit in the primary title", () => {
    const connectedDevice = device({
      name: "MX Keys",
      kind: "keyboard",
      batteryAvailable: false,
      percentage: null,
      connectionKind: "bluetooth",
      connectionLabel: "Bluetooth (direct)",
    });

    expect(batteryLabel(connectedDevice)).toBe("Battery unavailable");
    expect(deviceTitle(connectedDevice)).toBe("MX Keys (Bluetooth) — Battery unavailable");
    expect(deviceTooltip(connectedDevice)).toBe("MX Keys (Bluetooth) — Battery unavailable · Bluetooth (direct)");
  });

  it("adds charging status after the battery percentage", () => {
    const connectedDevice = device({ charging: true });

    expect(batteryLabel(connectedDevice)).toBe("80% (charging)");
    expect(deviceTitle(connectedDevice)).toBe("MX Master 3S (Logi Bolt) — 80% (charging)");
  });

  it.each([
    ["bolt", "Logi Bolt"],
    ["unifying", "Unifying"],
    ["lightspeed", "Lightspeed"],
    ["bluetooth", "Bluetooth"],
    ["usb", "USB"],
    ["receiver", "Logitech receiver"],
    ["direct", "Unknown connection"],
  ] as const)("formats %s as %s", (kind, label) => {
    expect(compactConnectionLabel(kind)).toBe(label);
  });
});
