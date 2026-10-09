/** @type {import('next').NextConfig} */
const nextConfig = {
  // pdf-to-img / pdfjs-dist (plan reader) pull in canvas's native binding
  // and do file-path work at module scope that breaks when bundled —
  // same reason PlanScope's own next.config.mjs externalizes them.
  serverExternalPackages: ['pdfjs-dist', 'pdf-to-img'],
  // pdfjs-dist loads its worker script via a dynamic import pdfText.js
  // resolves at runtime (see its explicit workerSrc there), which Vercel's
  // file tracer can't see statically — without this, pdf.worker.mjs gets
  // pruned from the deployed function and every ingest fails with
  // "Setting up fake worker failed: Cannot find module .../pdf.worker.mjs".
  outputFileTracingIncludes: {
    '/*': ['node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'],
  },
};

export default nextConfig;
