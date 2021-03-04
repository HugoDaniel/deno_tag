export async function defaultBundler(
  file: string,
  options: Deno.EmitOptions | undefined = {},
) {
  return await Deno.emit(file, { ...options, ...{ bundle: "esm" } });
}
