"""Verify exact offline exports, font coverage, PDF geometry and dark-card contrast.

Requires PyMuPDF, Pillow and fontTools. No network or product data access.
"""
import hashlib
import json
import math
import re
import sys
import PIL
import fontTools
from pathlib import Path

import fitz
from PIL import Image
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[3]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def lum(rgb):
    values = [n / 255 for n in rgb[:3]]
    return sum((n / 12.92 if n <= .04045 else ((n + .055) / 1.055) ** 2.4) * w
               for n, w in zip(values, (.2126, .7152, .0722)))


def main():
    render = json.loads((ROOT / '.preview/render.json').read_text(encoding='utf-8'))
    reg = json.loads((ROOT / 'registry.json').read_text(encoding='utf-8'))
    tokens = json.loads((REPO / reg['token_source']).read_text(encoding='utf-8'))
    for file, expected in render['inputs'].items():
        assert digest((REPO if file == reg['token_source'] else ROOT) / file) == expected, f'Stale render: {file}'
    for file, expected in render['raw_pdf_hashes'].items():
        assert digest(ROOT / file) == expected, 'PDF differs from the captured render'
    bounds_errors, font_embeddings, pdf_text = [], [], []
    for name, count in [('identity-typography', 13), ('document-specimen', 2)]:
        doc = fitz.open(ROOT / f'output/pdf/{name}.pdf')
        assert len(doc) == count
        text = ' '.join(' '.join(p.get_text().split()) for p in doc)
        probe = 'Å' in text if name == 'identity-typography' else 'A clear record' in text
        assert probe, 'PDF Unicode text extraction failed'
        pdf_text.append({'document': name, 'pages': count, 'characters': len(text), 'unicode_probe': probe, 'title': doc.metadata['title']})
        if name == 'identity-typography':
            assert len([x for x in doc.get_toc() if x[0] == 1]) == count
        for i, page in enumerate(doc):
            if name == 'document-specimen':
                assert abs(page.rect.width - 595.276) < 1 and abs(page.rect.height - 841.89) < 1, 'Not A4'
            for word in page.get_text('words'):
                if word[0] < 0 or word[1] < 0 or word[2] > page.rect.width or word[3] > page.rect.height:
                    bounds_errors.append({'document': name, 'page': i + 1, 'word': word[4]})
            for font in page.get_fonts():
                embedded = bool(doc.extract_font(font[0])[3])
                if font[2] == 'Type3':
                    procedures = doc.xref_get_key(font[0], 'CharProcs')
                    procs = doc.xref_object(int(procedures[1].split()[0])) if procedures[0] == 'xref' else procedures[1]
                    refs = re.findall(r'(\d+) 0 R', procs)
                    unicode_ref = doc.xref_get_key(font[0], 'ToUnicode')
                    embedded = bool(refs) and all(doc.xref_stream(int(x)) for x in refs) and unicode_ref[0] == 'xref' and bool(doc.xref_stream(int(unicode_ref[1].split()[0])))
                font_embeddings.append({'document': name, 'page': i + 1, 'name': font[3], 'format': font[2], 'embedded': bool(embedded)})
                assert embedded, 'Unembedded font'
            page.get_pixmap(matrix=fitz.Matrix(1, 1)).save(ROOT / f'.preview/{name}-{i+1:02d}.png')
    assert not bounds_errors, bounds_errors
    background = Image.open(ROOT / '.preview/dark-background.png').convert('RGB')
    contrast = []
    for s in render['samples']:
        fg = lum([int(x) for x in re.findall(r'\d+', s['color'])[:3]])
        box = (math.floor(s['x']), math.floor(s['y']), math.ceil(s['x'] + s['width']), math.ceil(s['y'] + s['height']))
        assert box[0] >= 0 and box[1] >= 0 and box[2] <= background.width and box[3] <= background.height
        pixels = set(background.crop(box).getdata())
        ratio = min((max(fg, lum(p)) + .05) / (min(fg, lum(p)) + .05) for p in pixels)
        contrast.append({'text': s['text'], 'ratio': round(ratio, 3)})
    assert len(contrast) == 6 and all(x['ratio'] >= 4.5 for x in contrast), contrast
    fixture = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789ÅÄÖåäöÆæØøÜüÉéÑñß€£$¥“”‘’.,:;!?()[]{}+-=/|'
    fonts = []
    for entry in [f for f in reg['fonts'] if f['role'] == 'font']:
        f = TTFont(ROOT / entry['file'])
        missing = [c for c in fixture if ord(c) not in f.getBestCmap()]
        assert not missing, missing
        features = sorted({r.FeatureTag for r in f['GSUB'].table.FeatureList.FeatureRecord})
        axes = {a.axisTag: [a.minValue, a.defaultValue, a.maxValue] for a in f['fvar'].axes} if 'fvar' in f else {}
        fonts.append({'family': entry['family'], 'sha256': entry['sha256'], 'fixture': fixture,
                      'missing': missing, 'axes': axes, 'features': features,
                      'checkmark_present': 0x2713 in f.getBestCmap()})
    assert 'tnum' in fonts[0]['features']
    assert fonts[0]['axes']['wght'] == [400, 400, 700]
    assert fonts[1]['axes'] == {}
    sizes = {'social-square': (1080, 1080), 'social-landscape': (1200, 630), 'avatar-light': (512, 512),
             'avatar-dark': (512, 512), 'favicon-16': (16, 16), 'favicon-32': (32, 32), 'email-logo': (244, 74)}
    for name, size in sizes.items():
        im = Image.open(ROOT / f'exports/{name}.png')
        assert im.size == size
        assert im.getbbox(), 'Empty raster export'
        if name == 'email-logo':
            alpha = im.convert('RGBA').getchannel('A')
            x0, y0, x1, y1 = alpha.getbbox()
            assert x0 > 0 and y0 > 0 and x1 < im.width and y1 < im.height, 'Email logo touches export edge'
    # ICO packages the browser-rasterised 16px and 32px masters, without redrawing.
    Image.open(ROOT / 'exports/favicon-32.png').save(ROOT / 'exports/favicon.ico', format='ICO',
        sizes=[(16, 16), (32, 32)], append_images=[Image.open(ROOT / 'exports/favicon-16.png')])
    icon = Image.open(ROOT / 'exports/favicon.ico')
    assert icon.ico.sizes() == {(16, 16), (32, 32)}
    for size in icon.ico.sizes():
        assert icon.ico.getimage(size).convert('RGBA').tobytes() == Image.open(ROOT / f'exports/favicon-{size[0]}.png').convert('RGBA').tobytes(), 'ICO changed the inspected pixels'
    for start in range(0, 13, 4):
        contact = Image.new('RGB', (1440, 1000), 'white')
        for offset in range(min(4, 13 - start)):
            im = Image.open(ROOT / f'.preview/identity-typography-{start+offset+1:02d}.png')
            im.thumbnail((720, 500)); contact.paste(im, ((offset % 2) * 720, (offset // 2) * 500))
        contact.save(ROOT / f'.preview/contact-{start+1:02d}.png')
    files = sorted([p for p in (ROOT / 'exports').iterdir() if p.name != 'manifest.json'] + list((ROOT / 'output/pdf').glob('*.pdf')))
    output_hashes = {p.relative_to(ROOT).as_posix(): digest(p) for p in files}
    report = {'ok': True, 'pages': 13, 'document_pages': 2, 'inputs': render['inputs'], 'outputs': output_hashes,
              'dark_contrast': contrast, 'contrast_scope': 'Actual Cobalt and Dusk specimen text boxes at fixed layout; 4.5:1 minimum. No direct text on raster atmospheres is qualified.',
              'contrast_background_sha256': digest(ROOT / '.preview/dark-background.png'),
              'layout_errors': render['layout_errors'], 'pdf_bounds_errors': bounds_errors,
              'email_browser_reflow': render['narrow_checks'], 'pdf_text': pdf_text,
              'runtime': {**render['runtime'], 'python': sys.version.split()[0], 'pymupdf': fitz.VersionBind, 'pillow': PIL.__version__, 'fonttools': fontTools.__version__}, 'font_audit': fonts, 'embedded_fonts': font_embeddings,
              'limits': ['No physical print proof', 'No real email-client or dark-mode inbox qualification', 'No production adoption', 'Glyph fixtures are not full language coverage']}
    (ROOT / 'verification.json').write_text(json.dumps(report, indent=2, ensure_ascii=True) + '\n', encoding='utf-8', newline='\n')
    manifest = {'status': 'candidate', 'production_adopted': False, 'source': reg['source'], 'inputs': render['inputs'], 'outputs': output_hashes,
                'scope': reg['channels'], 'identity_derivation': 'Exact source path data retained; wrapper transforms centre the S and establish avatar safe space. Solid palette colours replace currentColor.'}
    (ROOT / 'exports/manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8', newline='\n')
    print(json.dumps({'ok': True, 'pages': 13, 'document_pages': 2, 'exports': len(output_hashes), 'minimum_dark_contrast': min(x['ratio'] for x in contrast)}))


if __name__ == '__main__':
    main()
