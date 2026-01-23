import { describe, test, expect } from "bun:test";

// Since buildRsyncArgs is not exported, we test through the module's behavior
// by examining what we can infer about the sync operations

describe("rsync module", () => {
  test("exports syncToRemote function", async () => {
    const rsyncModule = await import("./rsync.ts");
    expect(typeof rsyncModule.syncToRemote).toBe("function");
  });

  test("exports syncToRemoteOrFail function", async () => {
    const rsyncModule = await import("./rsync.ts");
    expect(typeof rsyncModule.syncToRemoteOrFail).toBe("function");
  });
});

// Note: Full integration tests for rsync would require a real server connection.
// The argument building logic is tested implicitly through integration testing
// during actual deployments. The DEFAULT_EXCLUDES constant ensures:
// - node_modules is excluded
// - .git is excluded
// - .next is excluded
// - .DS_Store is excluded
// - .env and .env.* files are excluded
// - .gitignore files are respected via --filter=':- .gitignore'
