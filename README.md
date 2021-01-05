# Deno Tag

A cli command that allows you to write `<deno>` tags in your html files.

It looks for `<deno>` tags in a supplied input file and replaces the `<deno>`
tags found with the output from running `deno` with their attributes.

The result is written to `stdout` and can be piped to the desired output.

## Attributes

The `<deno>` tag needs to have one of these two attributes present:

- `<deno bundle="file.ts" />`

  Calls `deno bundle file.ts` and replaces the `<deno>` tag with the produced
  output.

- `<deno run="file.ts" />`

  Calls `deno run file.ts` and replaces the `<deno>` tag with the produced
  `stdout` content.
  Any other attribute on the tag gets passed as argument to the `Deno.run`
  command. Boolean attributes get the string "true" added as value.

## How to run

Call `deno_tag` from the command line and specify a `html` file:

`> deno run --allow-read --allow-run --unstable https://deno.land/x/deno_tag@v1.0.2 index.html`

It is necessary to have read and run permissions in order to read the file
passed as an attribute on the `<deno>` tag and run it.


## Examples

### Example 1 - Simple output bundle

In its most basic usage the `<deno>` tag can either give you a bundle from a
file and its dependencies, or just the simple output that a running file
produced.

Bundle can be useful to produce the full code for your project and place it
inside the HTML `<script></script>` tag:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Awesome Web App</title>
  </head>
  <body>
    <h1>What a great app</h1>
    <!-- Main Script -->
    <script>
      <deno bundle="index.ts" />;
    </script>
  </body>
</html>
```

and your `index.ts` could then include a lot of imports.

```typescript
// index.ts
import { complexFunction } from "./complex.ts";

document.addEventListener("DOMContentLoaded", complexFunction);
```

and then have a really complex function that might need a ton of imports or not:

```typescript
// complex.ts
function complexFunction() {
  return 42;
}
export { complexFunction };
```

Running `deno_tag` on it:

`> deno run --allow-read --allow-run --unstable deno_tag.ts ./examples/1\ -\ simple\ output\ bundle/index.html`

Produces the following output:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Awesome Web App</title>
  </head>
  <body>
    <h1>What a great app</h1>
    <!-- Main Script -->
    <script>
      function complexFunction() {
        return 42;
      }
      document.addEventListener("DOMContentLoaded", complexFunction);
    </script>
  </body>
</html>
```

Notice the unrolled bundle inside the `<script></script>` tag.

This example is available in the `examples` folder.

### Example 2 - Running a file

You can run Deno on any file and place the output of the execution where the
`<deno>` tag is located at.

There are many use cases for this, a simple one I can think of use is to produce
single file web components. This is something that is lacking from Web
Components because they require us to write code in multiple files or just
place the html and styles inside the Web Component constructor which can be
hard to maintain.

I don't intend to solve this in any way (there are whole frameworks from much
smarter people out there). This is however a good idea for a very simple
example.

With the `<deno>` tag a basic single file web component approach could be done
with something like this:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Magic Web App</title>
  </head>

  <body>
    <magic-title>What a great app</magic-title>
    <!-- Components -->
    <deno run="deno_web_component.ts" src="components/magic-title.html" />
    <!-- Add as many as needed -->
  </body>
</html>
```

Where the `<magic-title>` component could be defined in a single
`magic-title.html` file. Here for example purposes:

```html
<style>
  p {
    color: indigo;
  }
</style>
<section>
  <p>
    <slot></slot>
  </p>
</section>
<script>
  console.log(`Yay Web Components!`);
</script>
```

Finally all the work of defining the element would be done by the
`deno_web_component.ts` script that the `<deno>` is running:

```typescript
// As expected, it is possible to use dependencies to do whatever
// In this case, a simple dom parser will be used as an example
import { DOMParser } from "https://deno.land/x/deno_dom/deno-dom-wasm.ts";

// Arguments get passed as in the <deno> tag, which in this case is:
// src="components/magic_title.ts"
const file = Deno.args[0].slice(
  Deno.args[0].indexOf('"') + 1,
  Deno.args[0].lastIndexOf('"')
);
const text = await Deno.readTextFile(file);
// Parse the component file and take the script code in the "code" variable
const doc = new DOMParser().parseFromString(text, "text/html")!;
const scriptTags = doc.getElementsByTagName("script")!;
let code = "";
if (scriptTags.length > 0) {
  code = scriptTags[0].textContent;
}
// Remove the `<script>...</script>` content from the file text
const template = text.slice(0, text.indexOf("<script>"));
// Get a tag name from the file name - this will allow the code bellow to
// automatically define a custom element.
const tag = file.slice(file.indexOf("/") + 1, file.indexOf("."));
// Finally output the web component creation code
console.log(`
<script>
customElements.define('${tag}',
  class extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({mode: 'open'})
      this.shadowRoot.innerHTML = \`
${template}\`;
    }
    connectedCallback() {
    ${code}
    }
  }
);
</script>`);
```

This is just for example purposes, don't use this in anything serious.

The code from the `<deno>` tag is run with the `--allow-read` and `--allow-run`
permissions set.

After running:

`deno run --allow-read --allow-run --unstable deno_tag.ts index.html`

The output is:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Magic Web App</title>
  </head>

  <body>
    <magic-title>What a great app</magic-title>
    <!-- Components -->

    <script>
      customElements.define(
        "magic-title",
        class extends HTMLElement {
          constructor() {
            super();
            this.attachShadow({ mode: "open" });
            this.shadowRoot.innerHTML = `
    <style>
        p {
            color: indigo;
        }
    </style>
    <section>
        <p>
            <slot></slot>
        </p>
    </section>
    `;
          }
          connectedCallback() {
            console.log(`Yay Web Components!`);
          }
        }
      );
    </script>

    <!-- Add as many as needed -->
  </body>
</html>
```

Notice that the `<deno>` tag was replaced by the output of the execution of
`deno_web_component.ts`. Where the `"magic-title"` web component is now being
defined.
