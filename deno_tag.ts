// Copyright 2021 Hugo Daniel Henriques Oliveira Gomes. All rights reserved.
// Licensed under the EUPL
import { denoTag } from "./code.ts";

/**
 * Prints the command line help text.
 * 
 * This is a simple line saying to run this file with:
 * 
 * `deno run --allow-read --allow-run --unstable deno_tag.ts someFile.html`
 */
function printUsage(code = 1) {
  console.log(
    "> deno run --allow-read --allow-run --unstable deno_tag.ts [FILE]",
  );
  Deno.exit(code);
}

/** Displays usage and exits when there were not enough arguments passed */
function validateArgs() {
  if (Deno.args.length === 0) {
    printUsage();
  }
}

/** 
 * Running this file will process the text on the supplied file and replace
 * every `<deno>` tag occurrence with the output produced by the deno action
 * attribute on its file. 
 */
try {
  // Assert that the right number of arguments have been provided
  validateArgs();
  const file = Deno.args[0];
  // Get Current Working Directory
  // Get the directory of the argument file to process
  const realPath = await Deno.realPath(file);
  const fileFolder = realPath.slice(0, realPath.lastIndexOf("/"));
  // Read the contents of the file into a string
  const text = await Deno.readTextFile(file);
  // Change to the directory of the file to process
  Deno.chdir(fileFolder);
  // Print the new updated contents to the stdout
  console.log(await denoTag(text));
} catch (e) {
  console.error(`\n> ${Deno.args[0]}: ${e.message}\n`);
  printUsage();
}
