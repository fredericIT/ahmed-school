import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';

/**
 * PDFs use the same premium typefaces as the web app (Satoshi for text, Cabinet Grotesk for headings),
 * embedded under the ITF Free Font License (assets/fonts/LICENSE-ITF-FFL.txt).
 * They are registered under the standard Helvetica names, so drawing code keeps writing
 * `font('Helvetica-Bold')`; `font('Heading')` is the display face. Missing files fall back to the built-in fonts.
 */
const FONT_DIR = path.resolve(__dirname, '../../assets/fonts');
const FACES: Record<string, { file: string; fallback: string }> = {
  Helvetica: { file: 'Satoshi-Regular.ttf', fallback: 'Helvetica' },
  'Helvetica-Bold': { file: 'Satoshi-Bold.ttf', fallback: 'Helvetica-Bold' },
  'Helvetica-Oblique': { file: 'Satoshi-Italic.ttf', fallback: 'Helvetica-Oblique' },
  Medium: { file: 'Satoshi-Medium.ttf', fallback: 'Helvetica' },
  Heading: { file: 'CabinetGrotesk-Extrabold.ttf', fallback: 'Helvetica-Bold' },
};

const resolved = Object.fromEntries(
  Object.entries(FACES).map(([name, f]) => {
    const file = path.join(FONT_DIR, f.file);
    return [name, fs.existsSync(file) ? file : f.fallback];
  }),
);

export function createPdf(options: PDFKit.PDFDocumentOptions = {}): PDFKit.PDFDocument {
  // The default font is loaded at construction; passing ours avoids caching the built-in Helvetica.
  const doc = new PDFDocument({ ...options, font: resolved.Helvetica });
  for (const [name, src] of Object.entries(resolved)) doc.registerFont(name, src);
  return doc;
}
