import { execFile } from "node:child_process";
import { accessSync, constants, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { lowestBatteryDevice, NO_HARDWARE_MESSAGE, onlineDevices, OpenLogiDevice, parseList } from "./model";

const COMMAND_TIMEOUT_MS = 15_000;
const MAX_OUTPUT_BYTES = 1024 * 1024;
const MAX_ERROR_LENGTH = 180;

export interface ExecutableResolution {
  path?: string;
  error?: string;
}

export interface ResolveOptions {
  envPath?: string;
  homeDirectory?: string;
  isExecutable?: (candidate: string) => boolean;
}

export interface RawCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut?: boolean;
  spawnError?: string;
}

export type OpenLogiRunResult =
  | {
      ok: true;
      devices: OpenLogiDevice[];
      lowestDevice: OpenLogiDevice | null;
      noHardware: boolean;
    }
  | {
      ok: false;
      error: string;
    };

function defaultIsExecutable(candidate: string): boolean {
  try {
    accessSync(candidate, constants.X_OK);
    return statSync(candidate).isFile();
  } catch {
    return false;
  }
}

function expandHome(candidate: string, homeDirectory: string): string {
  if (candidate === "~") return homeDirectory;
  if (candidate.startsWith("~/")) return path.join(homeDirectory, candidate.slice(2));
  return candidate;
}

export function resolveOpenLogiExecutable(configuredPath?: string, options: ResolveOptions = {}): ExecutableResolution {
  const homeDirectory = options.homeDirectory ?? homedir();
  const isExecutable = options.isExecutable ?? defaultIsExecutable;
  const override = configuredPath?.trim();

  if (override) {
    const expanded = expandHome(override, homeDirectory);
    if (isExecutable(expanded)) return { path: expanded };
    return { error: `Configured OpenLogi CLI is not executable: ${expanded}` };
  }

  const pathCandidates = (options.envPath ?? process.env.PATH ?? "")
    .split(path.delimiter)
    .filter(Boolean)
    .map((directory) => path.join(directory, "openlogi"));
  const candidates = [
    ...pathCandidates,
    "/opt/homebrew/bin/openlogi",
    "/usr/local/bin/openlogi",
    path.join(homeDirectory, ".cargo", "bin", "openlogi"),
  ];

  for (const candidate of new Set(candidates)) {
    if (isExecutable(candidate)) return { path: candidate };
  }

  return {
    error: "OpenLogi CLI not found. Install it or select the executable in this command’s preferences.",
  };
}

export function conciseError(value: string | undefined, fallback: string): string {
  const normalised = (value ?? "").replace(/\s+/g, " ").trim() || fallback;
  return normalised.length > MAX_ERROR_LENGTH ? `${normalised.slice(0, MAX_ERROR_LENGTH - 3)}…` : normalised;
}

export function interpretOpenLogiResult(result: RawCommandResult): OpenLogiRunResult {
  if (result.timedOut) return { ok: false, error: "openlogi list timed out" };
  if (result.spawnError) {
    return { ok: false, error: conciseError(result.spawnError, "Could not start the OpenLogi CLI") };
  }

  const parsed = parseList(result.stdout);
  const acceptedExitCode =
    result.exitCode === 0 || (result.exitCode === 2 && result.stdout.includes(NO_HARDWARE_MESSAGE));

  if (!acceptedExitCode) {
    return {
      ok: false,
      error: conciseError(
        result.stderr || result.stdout,
        `openlogi list failed with exit code ${result.exitCode ?? "unknown"}`,
      ),
    };
  }

  if (!parsed.ok) {
    return { ok: false, error: parsed.error ?? "Could not parse OpenLogi devices" };
  }

  const devices = onlineDevices(parsed.devices);
  return {
    ok: true,
    devices,
    lowestDevice: lowestBatteryDevice(devices),
    noHardware: parsed.noHardware,
  };
}

function executeOpenLogi(executable: string): Promise<RawCommandResult> {
  return new Promise((resolve) => {
    execFile(
      executable,
      ["list"],
      {
        encoding: "utf8",
        timeout: COMMAND_TIMEOUT_MS,
        killSignal: "SIGTERM",
        maxBuffer: MAX_OUTPUT_BYTES,
      },
      (error, stdout, stderr) => {
        if (!error) {
          resolve({ stdout, stderr, exitCode: 0 });
          return;
        }

        const exitCode = typeof error.code === "number" ? error.code : null;
        const timedOut = error.killed === true && error.signal === "SIGTERM";
        const spawnError = typeof error.code === "string" && !timedOut ? error.message : undefined;
        resolve({ stdout, stderr, exitCode, timedOut, spawnError });
      },
    );
  });
}

export async function runOpenLogiList(configuredPath?: string): Promise<OpenLogiRunResult> {
  const resolution = resolveOpenLogiExecutable(configuredPath);
  if (!resolution.path) {
    return { ok: false, error: conciseError(resolution.error, "OpenLogi CLI not found") };
  }

  return interpretOpenLogiResult(await executeOpenLogi(resolution.path));
}
