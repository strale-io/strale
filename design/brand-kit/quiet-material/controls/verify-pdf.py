"""Read-only PDF inspection; writes a new verification report and review PNGs."""
from pathlib import Path
import json, re, hashlib, math
import fitz
from PIL import Image
ROOT=Path(__file__).resolve().parent
e=json.loads((ROOT/'.preview/browser-evidence.json').read_text(encoding='utf-8'))
def lum(rgb):
    c=[x/255 for x in rgb]
    c=[x/12.92 if x<=.04045 else ((x+.055)/1.055)**2.4 for x in c]
    return c[0]*.2126+c[1]*.7152+c[2]*.0722
dark=[]
for card in e.pop('dark_samples'):
    image_path=ROOT/card['file']
    assert hashlib.sha256(image_path.read_bytes()).hexdigest()==card['sha256']
    image=Image.open(image_path).convert('RGB')
    for sample in card['samples']:
        fg=lum([int(x) for x in re.findall(r'\d+',sample['color'])[:3]])
        x0,y0,x1,y1=sample['box'];box=(math.floor(x0),math.floor(y0),math.ceil(x1),math.ceil(y1))
        assert box[0]>=0 and box[1]>=0 and box[2]<=image.width and box[3]<=image.height
        ratio=min((max(fg,lum(p))+.05)/(min(fg,lum(p))+.05) for p in set(image.crop(box).getdata()))
        assert ratio>=4.5, sample
        dark.append({'text':sample['text'],'ratio':ratio,'background_sha256':card['sha256']})
assert len(dark)==6, len(dark)
e['dark_contrast']=dark
path=ROOT/'output/pdf/navigation-controls.pdf'
assert hashlib.sha256(path.read_bytes()).hexdigest()==e['outputs']['output/pdf/navigation-controls.pdf']
doc=fitz.open(path)
assert len(doc)==6
errors=[]
for i,page in enumerate(doc):
    assert abs(page.rect.width-840)<1 and abs(page.rect.height-675)<1
    for block in page.get_text('dict')['blocks']:
        for line in block.get('lines',[]):
            for span in line['spans']:
                b=fitz.Rect(span['bbox'])
                if b.x0<0 or b.y0<0 or b.x1>page.rect.width+1 or b.y1>page.rect.height+1: errors.append([i+1,span['text']])
    for font in page.get_fonts(full=True):
        embedded=bool(doc.extract_font(font[0])[3])
        if not embedded and font[2]=='Type3':
            refs=re.findall(r'(\d+) 0 R',doc.xref_get_key(font[0],'CharProcs')[1])
            embedded=bool(refs) and all(doc.xref_stream(int(x)) for x in refs) and doc.xref_get_key(font[0],'ToUnicode')[0]=='xref'
        assert embedded, font
    page.get_pixmap(matrix=fitz.Matrix(1.3,1.3)).save(ROOT/f'.preview/pdf-{i+1}.png')
assert not errors,errors
assert doc.metadata['title']=='Strale navigation, controls and cards'
e['pdf']={'pages':len(doc),'all_fonts_embedded':True,'bounds_errors':errors,'title':doc.metadata['title']}
(ROOT/'verification.json').write_text(json.dumps(e,indent=2)+'\n',encoding='utf-8',newline='\n')
print(json.dumps({'ok':True,'pages':len(doc),'embedded':True}))
