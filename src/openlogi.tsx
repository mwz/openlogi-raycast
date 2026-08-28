import { useCallback, useEffect, useRef, useState } from "react";
import {
  Cache,
  environment,
  getPreferenceValues,
  Icon,
  LaunchType,
  MenuBarExtra,
  openCommandPreferences,
} from "@raycast/api";
import { deviceTitle, deviceTooltip } from "./device-presentation";
import { OpenLogiRunResult, runOpenLogiList } from "./openlogi-runner";

const commandCache = new Cache({ namespace: environment.commandName });
const QUIT_CACHE_KEY = "menu-bar-quit";
const RESULT_CACHE_KEY = "last-result";
const RESULT_CACHE_VERSION = 2;

interface CachedResult {
  version: number;
  configuredPath: string;
  result: OpenLogiRunResult;
}

function configuredPathKey(configuredPath?: string): string {
  return configuredPath?.trim() ?? "";
}

function readCachedResult(configuredPath?: string): OpenLogiRunResult | undefined {
  const cached = commandCache.get(RESULT_CACHE_KEY);
  if (!cached) return undefined;

  try {
    const parsed = JSON.parse(cached) as CachedResult;
    if (
      parsed.version !== RESULT_CACHE_VERSION ||
      parsed.configuredPath !== configuredPathKey(configuredPath) ||
      typeof parsed.result?.ok !== "boolean"
    ) {
      return undefined;
    }
    return parsed.result;
  } catch {
    commandCache.remove(RESULT_CACHE_KEY);
    return undefined;
  }
}

function cacheResult(configuredPath: string | undefined, result: OpenLogiRunResult): void {
  if (result.ok && !result.lowestDevice) {
    commandCache.remove(RESULT_CACHE_KEY);
    return;
  }

  const cached: CachedResult = {
    version: RESULT_CACHE_VERSION,
    configuredPath: configuredPathKey(configuredPath),
    result,
  };
  commandCache.set(RESULT_CACHE_KEY, JSON.stringify(cached));
}

function deviceIcon(kind: string): Icon {
  switch (kind.trim().toLowerCase()) {
    case "mouse":
    case "trackball":
      return Icon.Mouse;
    case "keyboard":
    case "numpad":
      return Icon.Keyboard;
    case "headset":
      return Icon.Headphones;
    case "gamepad":
    case "joystick":
      return Icon.GameController;
    case "touchpad":
      return Icon.Devices;
    default:
      return Icon.Battery;
  }
}

function useMenuBarActivation() {
  const [isActive, setIsActive] = useState(() => {
    const wasQuit = commandCache.get(QUIT_CACHE_KEY) === "true";
    const wasManuallyLaunched = environment.launchType === LaunchType.UserInitiated;

    if (wasQuit && wasManuallyLaunched) commandCache.remove(QUIT_CACHE_KEY);
    return wasManuallyLaunched || !wasQuit;
  });

  const quit = useCallback(async () => {
    commandCache.set(QUIT_CACHE_KEY, "true");
    setIsActive(false);
  }, []);

  return { isActive, quit };
}

function useOpenLogi(configuredPath: string | undefined, enabled: boolean) {
  const [result, setResult] = useState<OpenLogiRunResult | undefined>(() => readCachedResult(configuredPath));
  const [isLoading, setIsLoading] = useState(true);
  const isMounted = useRef(false);
  const inFlight = useRef(false);
  const refreshPending = useRef(false);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    if (inFlight.current) {
      refreshPending.current = true;
      return;
    }

    inFlight.current = true;
    if (isMounted.current) setIsLoading(true);

    do {
      refreshPending.current = false;
      const nextResult = await runOpenLogiList(configuredPath);
      cacheResult(configuredPath, nextResult);
      if (isMounted.current) setResult(nextResult);
    } while (refreshPending.current && isMounted.current);

    inFlight.current = false;
    if (isMounted.current) setIsLoading(false);
  }, [configuredPath, enabled]);

  useEffect(() => {
    isMounted.current = true;
    if (enabled) void refresh();
    else setIsLoading(false);

    return () => {
      isMounted.current = false;
    };
  }, [refresh]);

  return { result, isLoading };
}

function UtilityItems({ quit }: { quit: () => Promise<void> }) {
  return (
    <>
      <MenuBarExtra.Separator />
      <MenuBarExtra.Item icon={Icon.Cog} title="Open Command Preferences" onAction={openCommandPreferences} />
      <MenuBarExtra.Separator />
      <MenuBarExtra.Item icon={Icon.Power} title="Quit OpenLogi Batteries" onAction={quit} />
    </>
  );
}

export default function Command() {
  const preferences = getPreferenceValues<Preferences.Openlogi>();
  const { isActive, quit } = useMenuBarActivation();
  const { result, isLoading } = useOpenLogi(preferences.openlogiPath, isActive === true);

  if (!isActive) return null;

  if (!result) {
    return (
      <MenuBarExtra icon={Icon.Battery} isLoading={isLoading} tooltip="Reading OpenLogi devices">
        <MenuBarExtra.Item icon={Icon.Hourglass} title="Reading OpenLogi Devices…" />
      </MenuBarExtra>
    );
  }

  if (!result.ok) {
    return (
      <MenuBarExtra icon={Icon.BatteryDisabled} title="?" tooltip={result.error} isLoading={isLoading}>
        <MenuBarExtra.Section title="OpenLogi Unavailable">
          <MenuBarExtra.Item icon={Icon.ExclamationMark} title="Could Not Read Devices" subtitle={result.error} />
        </MenuBarExtra.Section>
        <UtilityItems quit={quit} />
      </MenuBarExtra>
    );
  }

  if (!result.lowestDevice) return null;

  const lowestDevice = result.lowestDevice;
  const deviceCount = result.devices.length;
  const sectionTitle = `${deviceCount} Connected ${deviceCount === 1 ? "Device" : "Devices"}`;

  return (
    <MenuBarExtra
      icon={lowestDevice.charging ? Icon.BatteryCharging : deviceIcon(lowestDevice.kind)}
      title={`${lowestDevice.percentage}%`}
      tooltip={`${lowestDevice.name}: ${lowestDevice.percentage}%${lowestDevice.charging ? " (charging)" : ""}`}
      isLoading={isLoading}
    >
      <MenuBarExtra.Section title={sectionTitle}>
        {result.devices.map((device) => (
          <MenuBarExtra.Item
            key={`${device.order}-${device.slot}-${device.name}`}
            icon={deviceIcon(device.kind)}
            title={deviceTitle(device)}
            tooltip={deviceTooltip(device)}
          />
        ))}
      </MenuBarExtra.Section>
      <UtilityItems quit={quit} />
    </MenuBarExtra>
  );
}
