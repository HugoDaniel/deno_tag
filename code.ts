/** 
 * The main function of deno-tag, it does three things:
 * 1. Looks for `<deno>` tags on the supplied text and reads their attributes
 * 2. Runs `deno` for each found `<deno>` tag
 * 3. Creates a new text where each `<deno>` tag is replaced by the output of
 * its respective run (from the previous point)
 * 
 * Finally it returns this new changed text.
 * 
 * There are two supported attributes for the `<deno>` tag:
 * - `<deno bundle="someCode.ts" />`
 *     * Replaces the tag with the output from running the `options.bundler`
 *       `someCode.ts` (by default the `options.bundler` is `Deno.bundler`)
 * - `<deno run="someCode.ts" />`
 *     * Replaces the tag with the console output from running `options.runner`
 *       on `someCode.ts` (by default the `options.runner` is `Deno.run`)
 * 
 * It assumes that the file path can be found from `Deno.cwd`. (see `cli.ts`)
 * The file paths passed on the `<deno>` are relative to the location of the 
 * file that holds the `<deno>` tag. 
 * 
 * **Note:** Padding is preserved, the output is set on the text at the same
 * indentation level that the respective `<deno>` tag is written at.
 */
export async function denoTag(text: string, options?: DenoTagOptions) {
  // Parsing the deno tags is about reading the text string, looking for
  // `<deno>` tags, and process their attributes and values.
  // This `parseDenoTag` function returns the attributes of each deno tag as
  // well as their location on the original text string.
  const parseResults = parseDenoTag(text);
  // Executing the deno tags is about running either the bundler or the deno
  // `run` on each of the found tag. The `executeDenoTags` processes each of
  // the parsed arguments on the `parseResults.tags` Map.
  // It returns a list of Result objects, these objects specify the output
  // string for each deno bundle/run action performed as well as the lines
  // that should be replaced on the original file with this output.
  const executionResults = await executeDenoTags(parseResults, options);
  // Finally perform the replace action on the text. It removes the lines
  // that correspond to each deno tag and replaces them with the contents from
  // the output of its respective bundle/run. This is a pure action, a new text
  // is returned. Original text is preserved.
  const changedText = replaceTagsWithResults(text, executionResults);

  return changedText;
}

/**
 * Optionally the `denoTag()` function can be IO free, all IO is optional
 * and can be set through its second argument, which expects an object of
 * this type.
 * 
 * The defaults are:
 * 
 * - `bundler`:  `Deno.bundle`
 * - `runner`: `Deno.run`
 * 
 * Bundler is called when a `<deno bundle="code.ts">` is found.
 * Runner is called when a `<deno run="code.ts">` is found.
 */
export interface DenoTagOptions {
  bundler?: typeof Deno.bundle;
  bundleSources?: Record<string, string>;
  bundleOptions?: Deno.CompilerOptions;
  runner?: typeof Deno.run;
  runOptions?: Deno.RunOptions;
}

/**
 * This function will perform the `bundler` or the `runner` action on a
 * single processed `<deno>` tag argument Map.
 * 
 * By default the `bundler` is done by calling `Deno.bundle` and the `runner`
 * is done by calling `Deno.run` (which runs the cli command `deno run [file]`).
 * 
 * These can be overridden on the `options` argument and can even be plain
 * functions that do not perform IO (e.g. for testing purposes). 
 * 
 * It returns the string output of the respective action performed
 * (either a file deno bundle or a deno run).
 **/
async function runDeno(args: Map<string, string>, options?: DenoTagOptions) {
  // These are the default "action" and "file" (which is no file, this is ok
  // because this function is only intended to be run after some validation on
  // the input arguments have been performed)
  let action = "run";
  let file = "";
  const flags: string[] = [];
  // Read the deno command arguments, this prepares the variables declared
  // above, so they can be used to get the desired output after
  for (const [attr, value] of args.entries()) {
    switch (attr) {
      case "run":
        file = value.slice(1, -1); // Remove the wrapping "" chars
        break;
      case "bundle":
        action = "bundle";
        file = value.slice(1, -1); // Remove the wrapping "" chars
        break;
      default:
        flags.push(`${attr}=${value}`);
    }
  }
  // Now that the action, file, and flags variables are set, it is time to
  // check the options object and fill it with sane defaults.
  const runner = options?.runner || Deno.run;
  const runOptions = options?.runOptions || {
    cmd: ["deno", "run", "--allow-read", "--allow-run"],
    stdout: "piped",
  }; // ^ by default call "deno run" with the stdout piped to a Uint8Array, this
  // allows output to be caught by this process (parent) and handled later on.
  const bundler = options?.bundler || Deno.bundle;
  // Prepare to run the supplied action attribute on the file from its value
  // The output of the runner (`Deno.run` by default) is a Uint8Array which is
  // processed by the TextDecoder into a JS string after the run finishes.
  let runOutput: Uint8Array;
  // deno-lint-ignore prefer-const
  let bundleOutput: [Deno.Diagnostic[] | undefined, string];
  let result = "";
  switch (action) {
    case "run":
      // Append the [file] to the command line array to be run, and also all the
      // extra attributes found on the deno tag
      runOptions.cmd = [...runOptions.cmd, file, ...flags];
      try {
        // Runs the file provided and transforms its output to be a JS string
        runOutput = await runner(runOptions).output();
        result = new TextDecoder("utf-8").decode(runOutput);
      } catch (e) {
        console.error(e);
      }
      break;
    case "bundle":
      // The bundle action will by default dump the file and all its
      // dependencies into a string.
      bundleOutput = await bundler(
        file,
        options?.bundleSources,
        options?.bundleOptions,
      );
      // The bundler output is a pair of [Diagnostic, Output]
      // The result is the output string - indexed by 1
      result = bundleOutput[1];
      break;
  }
  // The string with the output of the action that was performed
  return result;
}

/** Attributes in a `<deno>` tag. A Map of "attribute"="value" strings */
type DenoTagAttributes = Map<string, string>;
/**
 * The result of reading a text and looking for `<deno>` tags and their
 * attributes
 **/
interface ParsedText {
  // The parsed text without any modifications done on it
  original: string;
  // The `<deno>` tags found in the original text, this is a map of the
  // line number where the tag is opened and closed.
  // There can be multiple `<deno>` tags per each lineOpened/lineClosed pair,
  // and this is why the Value for the map is an array of DenoTagAttributes
  tags: Map<
    { lineOpened: number; lineClosed: number; indent: number },
    DenoTagAttributes[]
  >;
}

/**
 * This function reads a single line with one or more `<deno>` tags and
 * transforms those tags into `DenoTagAttributes` objects.
 * These objects are collected in an array to be returned.
 * 
 * Attributes without values have their value set to the string "true"
 * Every string value on the resulting Map's includes the enclosing \" \"
 * string characters.
 */
function parseDenoTagArgs(line: string): DenoTagAttributes[] {
  const result = [] as DenoTagAttributes[];
  const denoTags = line.split("<deno");
  // A line can have more than one <deno> tag
  for (let i = 1; i < denoTags.length; i++) {
    const attributes = denoTags[i]
      .slice(0, denoTags[i].indexOf(">"))
      .split(" ");
    // ^ split the inside of the "<deno" tag by space-separated
    // tokens
    const tagAttributes: [string, string][] = [];
    let key: string | null = null;
    let partialValue = "";
    for (let j = 0; j < attributes.length; j++) {
      // during this iteration "value" is either found or not
      // if it is not found, the token will compound into the "partialValue"
      // until the \" char is found
      let value: string | null = null;
      // the token is the split string item from the inside of the <deno> tag
      let token = attributes[j];
      // parse only if this token does not belong to the list of tokens to
      // ignore
      if (["", "/"].includes(token)) continue;
      // if the token includes an "=" char, then it has a key (left value of =)
      // and it has a value that can be made of multiple tokens (i.e. everything
      // between " ")
      if (token.includes("=")) {
        const splitToken = token.split("=");
        // the left part is the key
        key = splitToken[0];
        // it is possible to process the rest of the token (right part)
        // on this loop - check if it ends with the " char or build the partial
        // value if it doesn't
        token = splitToken[1];
      }
      if (token.endsWith('"')) {
        value = partialValue + token;
        partialValue = ""; // Reset the partialValue
      } else {
        if (!key) {
          // this is a single attribute with no "=" value
          key = token;
          value = '"true"';
        } else {
          // A key is present, and this token does not end with a \" char.
          // This means that this is an attribute with a multiple space string
          // as a value that did not finish at this token
          // i.e. key="this is a value",
          partialValue += token;
        }
      }
      // Decide if this is the right time to add
      if (key && value) {
        tagAttributes.push([key, value]);
        key = null;
        value = null;
      }
    }
    // Create a new Map of the deno attributes, and place it in the array of
    // deno executions; deno will be called once for each element on `denoRuns`
    result.push(new Map(tagAttributes));
  }
  return result;
}

/**
 * Reads the full text and processes the attributes of each `<deno>` into
 * a `ParsedText` object to be returned.
 * 
 * **Note:** Takes in consideration multi-line `<deno>` tags and multiple tags
 * per line
 **/
function parseDenoTag(text: string): ParsedText {
  // A Map of attributes is created for each `<deno>` tag found on the text
  // Deno will be called once for each element on `denoRuns`, each element of
  // this array is a Map of the attributes on a `<deno>` tag
  const result: ParsedText = { original: text, tags: new Map() };

  const lines = text.split("\n");
  let isMultiLine = false;
  // Holds all lines that belong to a `<deno>` tag
  let tagLines = [] as string[];
  // Line number where the opening `<deno>` tag was found
  let lineStart = 0;
  // The number of padding spaces on the `lineStart` line
  let lineStartPad = 0;
  // Loop through each line and look for `<deno` strings
  for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
    const line = lines[lineNumber];
    // Number of opened deno tags on this line
    // (`length - 1` is needed because `.split` always returns the original
    // string up to the provided arg)
    const openedDenoTags = line.split("<deno").length - 1;
    // Number of closed deno tags on this line - closed tags can be done with
    // "/>" or with "</deno>"
    const closedTags = (line.split("/>").length - 1) +
      (line.split("</deno>").length - 1);
    // Mark this line as belonging to a (deno) tag if there is an opened
    // deno tag in it or if a multi-line tag has not ended yet
    if (openedDenoTags > 0 || isMultiLine) {
      tagLines.push(line);
      // The following contents has already run if this line belongs to a
      // multi-line deno tag
      if (!isMultiLine) {
        // A new line with a <deno> tag, set it as the start of processing
        lineStart = lineNumber;
        // Store the padding for this line (useful to adjust the contents of
        // the deno tag result)
        lineStartPad = line.length - line.trimLeft().length;
      }
    }
    // Flag if this line belongs to a <deno> tag
    const hasAnOpenTag: boolean = isMultiLine || openedDenoTags > 0;
    // Flag if this line closes all opened `<deno>` tags
    // A multi-line tag counts as 1 opened `<deno>` tag.
    const closesWhatOpens: boolean =
      (Number(isMultiLine) + openedDenoTags) === closedTags;
    if (hasAnOpenTag && closesWhatOpens) {
      // Process line and clear tagLines
      result.tags.set(
        { lineOpened: lineStart, lineClosed: lineNumber, indent: lineStartPad },
        // This is where the deno tag gets transformed into a
        // `DenoTagAttributes` array
        parseDenoTagArgs(tagLines.join(" ")),
      );
      // Clear line carry state
      tagLines = [];
      isMultiLine = false;
    } else {
      // Start a multi-line carry state if there is an opened <deno> tag
      // without a matching close on this line
      isMultiLine = hasAnOpenTag && !closesWhatOpens;
    }
  }

  return result;
}

/**
 * Represents the output of running a `<deno>` tag. Includes the output of the
 * deno bundle/run as well as the location where it should be placed on the
 * original text string (the line numbers "from"/"to" that will be removed for
 * these contents).
 **/
interface Result {
  contents: string;
  from: number;
  to: number;
}
/**
 * This function calls `runDeno()` for each `<deno>` tag found.
 * The output string for each run is then properly padded to match the
 * indentation supplied for each tag on the `ParsedText` argument.
 */
async function executeDenoTags(
  parseResults: ParsedText,
  options?: DenoTagOptions,
): Promise<Result[]> {
  const results = []; // Each deno output is pushed into this results array

  // Loop through each tag found, its attributes and line meta-information:
  // location and indentation
  for (const [lineLimits, denoAttributes] of parseResults.tags.entries()) {
    const result = [];
    for (let i = 0; i < denoAttributes.length; i++) {
      result.push(await runDeno(denoAttributes[i], options));
    }
    // Set padding on the final string from this <deno> tag run
    const contents = result
      // join results, each result can have multiple lines, this places them
      // all in a single string
      .join("\n")
      .split("\n") // now split the final result into lines
      .map((line) =>
        // for each line apply the padding on the <deno> tag
        line.padStart(
          lineLimits.indent + line.length, // the new line length
          " ", // padding is done with spaces (sorry tabs people)
        )
      )
      .join("\n"); // merge all padded lines into a single string
    // wrap the contents in a Result object, which also propagates the line
    // limits, and push it into the results array to be returned
    results.push({
      from: lineLimits.lineOpened,
      to: lineLimits.lineClosed,
      contents,
    });
  }
  return results;
}

/**
 * This function removes the lines where the `<deno>` tags were present
 * and places the deno output string in their place
 */
function replaceTagsWithResults(original: string, results: Result[]) {
  // All lines are copied to this array, removing a line means skipping
  // pushing it into this `newLines` array.
  const newLines = [];
  // Loop through each line on the original text
  const lines = original.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let ignore = false; // don't ignore lines by default
    // For each line, loop through all the deno results
    // For the big majority of the use cases of deno-tag, the number of deno
    // results is expected to be much smaller than the number of lines on a
    // text file.
    for (let r = 0; r < results.length; r++) {
      const result = results[r];
      // Ignore the line if it is inside the limits of a <deno> tag
      ignore = ignore || (i >= result.from && i <= result.to);
      // If this is the first line of the limits of a <deno> tag...
      if (i === result.from) {
        // ...replace it with the deno result contents
        newLines.push(result.contents);
      }
    }
    if (ignore) continue; // don't push the line into the newLines array
    newLines.push(line);
  }
  // Return a single string by merging all new lines.
  return newLines.join("\n");
}
