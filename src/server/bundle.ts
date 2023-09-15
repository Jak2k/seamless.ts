// bundle client code using bun

export async function bundleClient() {
  const output = await Bun.build({
    entrypoints: ["src/client/lib.ts"],
    minify: false
  });

  return output;
}
