import { describe, expect, test } from "bun:test";
import {
  parsePortListingOutput,
  getTrackedPorts,
  findNextAvailablePort,
} from "./ports.ts";
import type { TossState } from "./state.ts";

describe("parsePortListingOutput", () => {
  test("parses ss output format", () => {
    const ssOutput = `State    Recv-Q   Send-Q     Local Address:Port      Peer Address:Port   Process
LISTEN   0        128              0.0.0.0:22             0.0.0.0:*       users:(("sshd",pid=1234,fd=3))
LISTEN   0        511              0.0.0.0:80             0.0.0.0:*       users:(("nginx",pid=5678,fd=6))
LISTEN   0        128              0.0.0.0:3000           0.0.0.0:*       users:(("node",pid=9012,fd=20))
LISTEN   0        128                 [::]:22                [::]:*       users:(("sshd",pid=1234,fd=4))
LISTEN   0        511                 [::]:80                [::]:*       users:(("nginx",pid=5678,fd=7))
LISTEN   0        128            127.0.0.1:3001           0.0.0.0:*       users:(("node",pid=3456,fd=21))`;

    const ports = parsePortListingOutput(ssOutput);

    expect(ports.has(22)).toBe(true);
    expect(ports.has(80)).toBe(true);
    expect(ports.has(3000)).toBe(true);
    expect(ports.has(3001)).toBe(true);
    expect(ports.size).toBe(4); // 22, 80, 3000, 3001
  });

  test("parses netstat output format", () => {
    const netstatOutput = `Active Internet connections (only servers)
Proto Recv-Q Send-Q Local Address           Foreign Address         State       PID/Program name
tcp        0      0 0.0.0.0:22              0.0.0.0:*               LISTEN      1234/sshd
tcp        0      0 0.0.0.0:80              0.0.0.0:*               LISTEN      5678/nginx
tcp        0      0 127.0.0.1:3000          0.0.0.0:*               LISTEN      9012/node
tcp6       0      0 :::22                   :::*                    LISTEN      1234/sshd
tcp6       0      0 :::443                  :::*                    LISTEN      5678/nginx`;

    const ports = parsePortListingOutput(netstatOutput);

    expect(ports.has(22)).toBe(true);
    expect(ports.has(80)).toBe(true);
    expect(ports.has(3000)).toBe(true);
    expect(ports.has(443)).toBe(true);
    expect(ports.size).toBe(4);
  });

  test("handles empty output", () => {
    const ports = parsePortListingOutput("");
    expect(ports.size).toBe(0);
  });

  test("handles output with no listening ports", () => {
    const output = `State    Recv-Q   Send-Q     Local Address:Port      Peer Address:Port   Process`;
    const ports = parsePortListingOutput(output);
    expect(ports.size).toBe(0);
  });

  test("handles ipv6 addresses correctly", () => {
    const output = `LISTEN   0        128           [::1]:8080              [::]:*`;
    const ports = parsePortListingOutput(output);
    expect(ports.has(8080)).toBe(true);
  });

  test("ignores invalid port numbers", () => {
    const output = `LISTEN   0        128              0.0.0.0:abc           0.0.0.0:*`;
    const ports = parsePortListingOutput(output);
    expect(ports.size).toBe(0);
  });

  test("handles wildcard addresses", () => {
    const output = `tcp        0      0 *:3000                  *:*                     LISTEN`;
    const ports = parsePortListingOutput(output);
    expect(ports.has(3000)).toBe(true);
  });
});

describe("getTrackedPorts", () => {
  test("returns empty set for empty state", () => {
    const state: TossState = {
      origin: null,
      deployments: {},
      appliedDependencies: [],
      lock: null,
    };

    const ports = getTrackedPorts(state);
    expect(ports.size).toBe(0);
  });

  test("extracts ports from deployments", () => {
    const state: TossState = {
      origin: null,
      deployments: {
        prod: { port: 3000 },
        "pr-42": { port: 3001 },
        "pr-123": { port: 3002 },
      },
      appliedDependencies: [],
      lock: null,
    };

    const ports = getTrackedPorts(state);

    expect(ports.has(3000)).toBe(true);
    expect(ports.has(3001)).toBe(true);
    expect(ports.has(3002)).toBe(true);
    expect(ports.size).toBe(3);
  });

  test("handles single deployment", () => {
    const state: TossState = {
      origin: null,
      deployments: {
        prod: { port: 3000 },
      },
      appliedDependencies: [],
      lock: null,
    };

    const ports = getTrackedPorts(state);
    expect(ports.size).toBe(1);
    expect(ports.has(3000)).toBe(true);
  });
});

describe("findNextAvailablePort", () => {
  test("returns 3000 when no ports are used", () => {
    const usedPorts = new Set<number>();
    const trackedPorts = new Set<number>();

    const port = findNextAvailablePort(usedPorts, trackedPorts);
    expect(port).toBe(3000);
  });

  test("skips used ports", () => {
    const usedPorts = new Set([3000, 3001, 3002]);
    const trackedPorts = new Set<number>();

    const port = findNextAvailablePort(usedPorts, trackedPorts);
    expect(port).toBe(3003);
  });

  test("skips tracked ports", () => {
    const usedPorts = new Set<number>();
    const trackedPorts = new Set([3000, 3001]);

    const port = findNextAvailablePort(usedPorts, trackedPorts);
    expect(port).toBe(3002);
  });

  test("skips both used and tracked ports", () => {
    const usedPorts = new Set([3000, 3002, 3004]);
    const trackedPorts = new Set([3001, 3003]);

    const port = findNextAvailablePort(usedPorts, trackedPorts);
    expect(port).toBe(3005);
  });

  test("handles gaps in port sequence", () => {
    const usedPorts = new Set([3000, 3002]);
    const trackedPorts = new Set<number>();

    const port = findNextAvailablePort(usedPorts, trackedPorts);
    expect(port).toBe(3001);
  });

  test("ignores ports below base port", () => {
    // Even if ports below 3000 are used, we start from 3000
    const usedPorts = new Set([22, 80, 443]);
    const trackedPorts = new Set<number>();

    const port = findNextAvailablePort(usedPorts, trackedPorts);
    expect(port).toBe(3000);
  });

  test("finds port after many occupied ports", () => {
    const usedPorts = new Set<number>();
    for (let port = 3000; port < 3100; port++) {
      usedPorts.add(port);
    }
    const trackedPorts = new Set<number>();

    const port = findNextAvailablePort(usedPorts, trackedPorts);
    expect(port).toBe(3100);
  });
});
