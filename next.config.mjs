/** @type {import('next').NextConfig} */
const nextConfig = {
  // pdf-to-img / pdfjs-dist (plan reader) pull in canvas's native binding
  // and do file-path work at module scope that breaks when bundled —
  // same reason PlanScope's own next.config.mjs externalizes them.
  serverExternalPackages: ['pdfjs-dist', 'pdf-to-img'],
  // pdfjs-dist loads its worker script at runtime in a way Vercel's file
  // tracer can't see statically — without this, pdf.worker.mjs gets pruned
  // from the deployed function and ingest fails ("Setting up fake worker
  // failed: Cannot find module .../pdf.worker.mjs"). The glob (not a single
  // path) matters: pdf-to-img can carry its own nested pdfjs-dist copy
  // depending on how npm resolves versions, and shipping only the
  // top-level worker while the API loaded is the nested copy's produces a
  // silent "API version X does not match Worker version Y" instead.
  outputFileTracingIncludes: {
    '/*': ['node_modules/**/pdfjs-dist/legacy/build/pdf.worker.mjs'],
  },
};

export default nextConfig;
