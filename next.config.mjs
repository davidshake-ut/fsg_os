/** @type {import('next').NextConfig} */
const nextConfig = {
  // pdf-to-img / pdfjs-dist (plan reader) pull in canvas's native binding
  // and do file-path work at module scope that breaks when bundled —
  // same reason PlanScope's own next.config.mjs externalizes them.
  serverExternalPackages: ['pdfjs-dist', 'pdf-to-img'],
};

export default nextConfig;
