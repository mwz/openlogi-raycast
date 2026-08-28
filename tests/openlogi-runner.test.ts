import path from "node:path";
import { describe, expect, it } from "vitest";
import { conciseError, interpretOpenLogiResult, resolveOpenLogiExecutable } from "../src/openlogi-runner";

const validDeviceOutput = [
  "Logi Bolt Receiver (DEADBEEFDEADBEEF, vid=046d pid=c548)",
  "  └─ slot 1 ● MX Master 3S (mouse, wpid=b034, battery=80% full (discharging))",
].join("\n");

describe("OpenLogi executable resolution", () => {
  it("uses a configured executable before discovered paths", () => {
    const resolution = resolveOpenLogiExecutable("~/bin/openlogi", {
      envPath: "/path/bin",
      homeDirectory: "/Users/tester",
      isExecutable: (candidate) => candidate === "/Users/tester/bin/openlogi",
    });
    expect(resolution).toEqual({ path: "/Users/tester/bin/openlogi" });
  });

  it("reports an invalid configured executable instead of silently falling back", () => {
    const resolution = resolveOpenLogiExecutable("/wrong/openlogi", {
      envPath: "/valid/bin",
      homeDirectory: "/Users/tester",
      isExecutable: (candidate) => candidate === "/valid/bin/openlogi",
    });
    expect(resolution.path).toBeUndefined();
    expect(resolution.error).toContain("/wrong/openlogi");
  });

  it("searches PATH in order", () => {
    const envPath = ["/first/bin", "/second/bin"].join(path.delimiter);
    const resolution = resolveOpenLogiExecutable(undefined, {
      envPath,
      homeDirectory: "/Users/tester",
      isExecutable: (candidate) => candidate === "/second/bin/openlogi",
    });
    expect(resolution.path).toBe("/second/bin/openlogi");
  });

  it.each(["/opt/homebrew/bin/openlogi", "/usr/local/bin/openlogi", "/Users/tester/.cargo/bin/openlogi"])(
    "checks the common location %s",
    (expectedPath) => {
      const resolution = resolveOpenLogiExecutable(undefined, {
        envPath: "",
        homeDirectory: "/Users/tester",
        isExecutable: (candidate) => candidate === expectedPath,
      });
      expect(resolution.path).toBe(expectedPath);
    },
  );

  it("returns setup guidance when the executable is unavailable", () => {
    const resolution = resolveOpenLogiExecutable(undefined, {
      envPath: "",
      homeDirectory: "/Users/tester",
      isExecutable: () => false,
    });
    expect(resolution.error).toContain("OpenLogi CLI not found");
  });
});

describe("OpenLogi command result handling", () => {
  it("parses a successful command", () => {
    const result = interpretOpenLogiResult({ stdout: validDeviceOutput, stderr: "", exitCode: 0 });
    expect(result).toMatchObject({
      ok: true,
      noHardware: false,
      lowestDevice: { name: "MX Master 3S", percentage: 80, connectionKind: "bolt" },
    });
  });

  it("accepts exit code 2 only for recognised no-hardware output", () => {
    expect(
      interpretOpenLogiResult({
        stdout: "No Logitech HID++ devices or webcams found.",
        stderr: "",
        exitCode: 2,
      }),
    ).toMatchObject({ ok: true, noHardware: true, devices: [], lowestDevice: null });

    expect(interpretOpenLogiResult({ stdout: "", stderr: "No devices", exitCode: 2 })).toMatchObject({
      ok: false,
      error: "No devices",
    });
  });

  it("reports timeouts before considering other output", () => {
    expect(interpretOpenLogiResult({ stdout: validDeviceOutput, stderr: "", exitCode: null, timedOut: true })).toEqual({
      ok: false,
      error: "openlogi list timed out",
    });
  });

  it("reports process spawn errors", () => {
    expect(
      interpretOpenLogiResult({ stdout: "", stderr: "", exitCode: null, spawnError: "spawn openlogi ENOENT" }),
    ).toEqual({ ok: false, error: "spawn openlogi ENOENT" });
  });

  it("prefers stderr for an unsuccessful exit", () => {
    expect(interpretOpenLogiResult({ stdout: "diagnostics", stderr: "permission denied", exitCode: 1 })).toEqual({
      ok: false,
      error: "permission denied",
    });
  });

  it("rejects malformed output even when the command exits successfully", () => {
    expect(interpretOpenLogiResult({ stdout: "  └─ slot 1 ● Changed output format", stderr: "", exitCode: 0 })).toEqual(
      { ok: false, error: "Unsupported openlogi list device row" },
    );
  });

  it("normalises and truncates command errors", () => {
    const error = conciseError(`  ${"problem   ".repeat(40)}  `, "fallback");
    expect(error).not.toMatch(/\s{2,}/);
    expect(error.length).toBe(178);
    expect(error.endsWith("…")).toBe(true);
    expect(conciseError("  ", "fallback")).toBe("fallback");
  });
});
