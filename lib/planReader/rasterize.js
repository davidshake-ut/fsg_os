// Ported from PlanScope's src/lib/rasterize.ts. Streams one page at a time
// so a large plan set never holds more than a single page's renders in
// memory — a 150MB+ permit set at detail scale 2 would otherwise
// accumulate tens of GB of page buffers.
import { pdf } from 'pdf-to-img';

export async function* rasterizePages(source, options = {}) {
  const thumbnailScale = options.thumbnailScale ?? 1;
  const detailScale = options.detailScale ?? 2;

  const thumbnailDoc = await pdf(source, { scale: thumbnailScale });
  const detailDoc = await pdf(source, { scale: detailScale });

  let pageNumber = 0;
  const detailIterator = detailDoc[Symbol.asyncIterator]();
  for await (const thumbnail of thumbnailDoc) {
    pageNumber++;
    const detailNext = await detailIterator.next();
    if (detailNext.done) break;
    if (options.pageLimit && pageNumber > options.pageLimit) break;

    yield { pageNumber, thumbnail, detail: detailNext.value };
  }
}
