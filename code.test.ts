/**
 * Simple tests for the deno_tag, for now most usage is being covered.
 * 
 * Only the `denoTag` input function is being tested because this is also the
 * only export from the `code.ts` module.
 * 
 * These tests must be run with the `unstable` flag:
 * > `deno test --unstable code.test.ts`
 * 
 * This is because the code makes usage of the unstable `Deno.bundle` and
 * `Diagnostic` code parts.
 */

import { denoTag } from "./code.ts";
import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.83.0/testing/asserts.ts";

Deno.test(
  "Calls the runner function with the value from the <deno> tag",
  async () => {
    const file = "test.ts";
    const runner = createRunnerMock((value) => {
      assert(value.cmd);
      assertEquals(
        value.cmd,
        ["deno", "run", "--allow-read", "--allow-run", file],
      );
    });
    const htmlText = `<deno run="${file}" />`;
    await denoTag(htmlText, { runner });
  },
);

Deno.test(
  "Calls the runner function with output piped",
  async () => {
    const runner = createRunnerMock((value) => {
      assert(value.stdout);
      assertEquals(value.stdout, "piped");
    });
    const htmlText = `<deno run="file.ts" />`;
    await denoTag(htmlText, { runner });
  },
);

Deno.test(
  "Sets the runner function arguments to be the <deno> tag attributes",
  async () => {
    const runner = createRunnerMock((value) => {
      assert(value.cmd);
      assertEquals(
        value.cmd,
        [
          "deno",
          "run",
          "--allow-read",
          "--allow-run",
          "file.ts",
          'arg1="test"',
          'arg2="something"',
        ],
      );
    });
    const htmlText = `<deno run="file.ts" arg1="test" arg2="something" />`;
    await denoTag(htmlText, { runner });
  },
);

Deno.test(
  'Places a value of "true" on the boolean attributes of the <deno> tag',
  async () => {
    const runner = createRunnerMock((value) => {
      assert(value.cmd);
      assertEquals(
        value.cmd,
        [
          "deno",
          "run",
          "--allow-read",
          "--allow-run",
          "file.ts",
          'boolean="true"',
          'isOk="true"',
        ],
      );
    });
    const htmlText = `<deno run="file.ts" boolean isOk />`;
    await denoTag(htmlText, { runner });
  },
);

Deno.test(
  "Can handle multi-line <deno> tags",
  async () => {
    const runner = createRunnerMock((value) => {
      assert(value.cmd);
      assertEquals(
        value.cmd,
        [
          "deno",
          "run",
          "--allow-read",
          "--allow-run",
          "file.ts",
          'boolean="true"',
          'isOk="true"',
        ],
      );
    });
    const htmlText = `
    <p>This is a simple test</p>
    <deno
      run="file.ts"
      boolean
      isOk
    />`;
    await denoTag(htmlText, { runner });
  },
);

Deno.test(
  "Can handle <deno> tags inside other tags",
  async () => {
    const runner = createRunnerMock((value) => {
      assert(value.cmd);
      assertEquals(
        value.cmd,
        [
          "deno",
          "run",
          "--allow-read",
          "--allow-run",
          "file.ts",
          'boolean="true"',
          'isOk="true"',
        ],
      );
    });
    const htmlText = `
    <p>This is a simple test
    <code><deno run="file.ts" boolean isOk></deno></code>
    </p>`;
    await denoTag(htmlText, { runner });
  },
);

Deno.test(
  "Calls the bundler function with the value from the <deno> tag",
  async () => {
    const file = "test.ts";
    const bundler: typeof Deno.bundle = (value) => {
      assertEquals(value, file);
      return Promise.resolve(
        [undefined, ""] as [Deno.Diagnostic[] | undefined, string],
      );
    };
    const htmlText = `<deno bundle="${file}" />`;
    await denoTag(htmlText, { bundler });
  },
);

/** 
 * Helper function that creates a mock of the `Deno.run` function that runs
 * the function provided as argument and always returns a dummy `Deno.Process`
 * object.
 **/
const createRunnerMock = (run: (value: Deno.RunOptions) => void) =>
  (value: Deno.RunOptions) => {
    run(value);
    return ({
      rid: 0,
      pid: 0,
      stdin: null,
      stdout: null,
      stderr: null,
      status() {
        return Promise.resolve({ success: true, code: 0, signal: undefined });
      },
      output() {
        return Promise.resolve(new Uint8Array());
      },
      stderrOutput() {
        return Promise.resolve(new Uint8Array());
      },
      close() {},
      kill(signo: number) {},
    }) as ReturnType<typeof Deno.run>;
  };
