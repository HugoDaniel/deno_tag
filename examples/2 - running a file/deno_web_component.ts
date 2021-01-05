// As expected, it is possible to use dependencies to do whatever
// In this case, a simple dom parser will be used as an example
import { DOMParser } from "https://deno.land/x/deno_dom/deno-dom-wasm.ts";

// Arguments get passed as in the <deno> tag, which in this case is:
// src="components/magic_title.ts"
const file = Deno.args[0].slice(
  Deno.args[0].indexOf('"') + 1,
  Deno.args[0].lastIndexOf('"'),
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
