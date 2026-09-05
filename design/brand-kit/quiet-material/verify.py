"""Check the rendered specimen PDF and sampled background contrast.

Requires PyMuPDF and Pillow. Does not change source artwork. PDF optimisation
deduplicates objects losslessly; it does not resample images or flatten text.
"""
import hashlib
import json
import math
import re
from pathlib import Path

import fitz
from PIL import Image

ROOT = Path(__file__).resolve().parent
PREVIEW = ROOT / '.preview'
PDF = ROOT / 'output/pdf/quiet-material-catalogue.pdf'
BUILDER_FILES = ['build.mjs', 'catalogue.css', 'registry.schema.json', 'verification.schema.json', 'verify.py']


def luminance(rgb):
    channels = [c / 255 for c in rgb]
    linear = [c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4 for c in channels]
    return sum(c * w for c, w in zip(linear, (.2126, .7152, .0722)))


def contrast(rgb, pixels):
    foreground = luminance(rgb)
    return min((max(foreground, luminance(p[:3])) + .05) /
               (min(foreground, luminance(p[:3])) + .05) for p in pixels)


def main():
    render_inputs = json.loads((PREVIEW/'render-inputs.json').read_text())
    reg = json.loads((ROOT/'registry.json').read_text())
    repo = ROOT.parents[2]
    assert render_inputs['registry_sha256'] == hashlib.sha256((ROOT/'registry.json').read_bytes()).hexdigest(), 'Re-render after changing the registry'
    assert render_inputs['tokens_sha256'] == hashlib.sha256((repo/reg['token_source']).read_bytes()).hexdigest(), 'Re-render after changing tokens'
    assert sorted(render_inputs['builder_inputs']) == sorted(BUILDER_FILES), 'Incomplete builder inputs'
    for name, digest in render_inputs['builder_inputs'].items():
        assert digest == hashlib.sha256((ROOT/name).read_bytes()).hexdigest(), f'Re-render after changing {name}'
    for name, digest in render_inputs['sample_inputs'].items():
        assert digest == hashlib.sha256((PREVIEW/name).read_bytes()).hexdigest(), f'Changed background evidence: {name}'
    current_pdf_hash = hashlib.sha256(PDF.read_bytes()).hexdigest()
    assert current_pdf_hash == render_inputs['pdf_sha256'], 'PDF differs from the raw captured render; rebuild before verification'
    raw_pdf = fitz.open(stream=PDF.read_bytes(), filetype='pdf')
    before = PDF.stat().st_size
    optimised = PDF.with_suffix('.optimised.pdf')
    raw_pdf.save(optimised, garbage=4, deflate=True)
    optimised.replace(PDF)
    pdf = fitz.open(PDF)
    assert len(pdf) == len(raw_pdf), 'Optimisation changed page count'
    assert pdf.get_toc() == raw_pdf.get_toc(), 'Optimisation changed PDF navigation'
    assert len([item for item in pdf.get_toc() if item[0] == 1]) == len(pdf), 'Missing page bookmarks'
    samples = json.loads((PREVIEW / 'contrast-samples.json').read_text())
    results = []
    for sample in samples:
        im = Image.open(PREVIEW / sample['file']).convert('RGB')
        for box in sample['boxes']:
            rgb = [int(n) for n in re.findall(r'\d+', box['color'])[:3]]
            # Text hidden by the renderer: these pixels contain the actual
            # composited CSS surface plus artwork, without glyph antialiasing.
            bounds = (math.floor(box['x']), math.floor(box['y']),
                      math.ceil(box['x'] + box['width']), math.ceil(box['y'] + box['height']))
            region = im.crop(bounds)
            ratio = contrast(rgb, set(region.getdata()))
            results.append({'page': sample['page'], 'text': box['text'],
                            'ratio': round(ratio, 3), 'passes_normal_text_4_5': ratio >= 4.5})
    overflow = []
    for index, page in enumerate(pdf):
        original = raw_pdf[index]
        assert page.get_text() == original.get_text(), 'Optimisation changed text'
        assert page.rect == original.rect, 'Optimisation changed page geometry'
        for word in page.get_text('words'):
            if word[0] < 0 or word[1] < 0 or word[2] > page.rect.width or word[3] > page.rect.height:
                overflow.append({'page': index + 1, 'word': word[4]})
        pix = page.get_pixmap(matrix=fitz.Matrix(1, 1))
        assert pix.samples == original.get_pixmap(matrix=fitz.Matrix(1, 1)).samples, 'Optimisation changed the rendered page'
        pix.save(PREVIEW / f'pdf-{index+1:02d}.png')
    # Contact sheets are PDF review intermediates, not new brand assets.
    for start in range(0, len(pdf), 4):
        sheet = Image.new('RGB', (1440, 1000), 'white')
        for offset in range(min(4, len(pdf)-start)):
            im = Image.open(PREVIEW / f'pdf-{start+offset+1:02d}.png')
            im.thumbnail((720, 500))
            sheet.paste(im, ((offset % 2)*720, (offset//2)*500))
        sheet.save(PREVIEW / f'review-{start+1:02d}.png')
    failures = [r for r in results if not r['passes_normal_text_4_5']]
    report = {'ok': not failures and not overflow, 'pages': len(pdf),
              'pdf_sha256': hashlib.sha256(PDF.read_bytes()).hexdigest(),
              'registry_sha256': hashlib.sha256((ROOT/'registry.json').read_bytes()).hexdigest(),
              'tokens_sha256': hashlib.sha256((repo/reg['token_source']).read_bytes()).hexdigest(),
              'builder_inputs': {name: hashlib.sha256((ROOT/name).read_bytes()).hexdigest() for name in BUILDER_FILES},
              'render_inputs': render_inputs,
              'pdf_bytes_before_deduplication': before, 'pdf_bytes': PDF.stat().st_size,
              'contrast_method': 'WCAG relative luminance; minimum across all background pixels under each hidden text element bounding box, Chromium at device scale 1. All sampled text evaluated at 4.5:1, including headings.',
              'scope': 'Exact catalogue material, card geometry and centre/cover crops only. Does not certify whole website, direct text on images, motion or arbitrary responsive layouts.',
              'sampled_text_elements': len(results), 'minimum_ratio': min(r['ratio'] for r in results),
              'failures': failures, 'out_of_page_text': overflow, 'results': results,
              'optimisation_verified': True}
    (ROOT/'verification.json').write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8', newline='\n')
    print(json.dumps({k:v for k,v in report.items() if k!='results'}))
    if not report['ok']:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
