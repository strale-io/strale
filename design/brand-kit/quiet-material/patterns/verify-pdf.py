from pathlib import Path
import json,re,hashlib
import fitz
root=Path(__file__).resolve().parent
e=json.loads((root/'.preview/browser-evidence.json').read_text())
path=root/'output/pdf/forms-symbols-composition.pdf'
assert hashlib.sha256(path.read_bytes()).hexdigest()==e['outputs']['output/pdf/forms-symbols-composition.pdf']
doc=fitz.open(path);assert len(doc)==8
errors=[]
for i,page in enumerate(doc):
    assert abs(page.rect.width-840)<1 and abs(page.rect.height-795)<1
    for block in page.get_text('dict')['blocks']:
        for line in block.get('lines',[]):
            for span in line['spans']:
                b=fitz.Rect(span['bbox'])
                if b.x0<0 or b.y0<0 or b.x1>page.rect.width+1 or b.y1>page.rect.height+1: errors.append([i+1,span['text']])
    for font in page.get_fonts(full=True):
        embedded=bool(doc.extract_font(font[0])[3])
        if not embedded and font[2]=='Type3':
            refs=re.findall(r'(\d+) 0 R',doc.xref_get_key(font[0],'CharProcs')[1])
            embedded=bool(refs) and all(doc.xref_stream(int(x)) for x in refs)
        assert embedded,font
    page.get_pixmap(matrix=fitz.Matrix(1.15,1.15)).save(root/f'.preview/pdf-{i+1}.png')
assert not errors,errors
e['pdf']={'pages':len(doc),'all_fonts_embedded':True,'bounds_errors':errors}
(root/'verification.json').write_text(json.dumps(e,indent=2)+'\n',encoding='utf8')
print('Eight PDF pages: geometry, fonts and text bounds pass')
