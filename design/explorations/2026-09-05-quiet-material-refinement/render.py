"""Render candidate application masters. No network, product calls or active-token writes.

python render.py --archive-root <extracted-release-root> --font-dir <local-fonts>
  --output <pdf-path>
Requires reportlab, fonttools and svglib. Font inputs: InstrumentSans.ttf
(variable), IBMPlexMono-Regular.ttf. See foundation.json for original sources.
"""
import argparse
import hashlib
import io
import json
from pathlib import Path
import tempfile

from fontTools.ttLib import TTFont as FontSource
from fontTools.varLib.instancer import instantiateVariableFont
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.graphics import renderPDF
from svglib.svglib import svg2rlg


def render(archive_root, font_dir, output):
    root = Path(__file__).resolve().parent
    repo = root.parents[2]
    foundation = json.loads((root / "foundation.json").read_text(encoding="utf-8"))
    tokens_path = repo / foundation["token_source"]
    tokens = json.loads(tokens_path.read_text(encoding="utf-8"))
    applications = json.loads((root / "applications.json").read_text(encoding="utf-8"))
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    palette = tokens["palette"]
    assets = {}
    for key, asset in foundation["assets"].items():
        path = Path(archive_root) / asset["archive_path"]
        if hashlib.sha256(path.read_bytes()).hexdigest() != asset["sha256"]:
            raise ValueError(f"Asset digest mismatch: {key}")
        assets[key] = path
    for filename, digest in foundation["font_inputs"].items():
        if hashlib.sha256((Path(font_dir) / filename).read_bytes()).hexdigest() != digest:
            raise ValueError(f"Font digest mismatch: {filename}")

    with tempfile.TemporaryDirectory(prefix="strale-fonts-") as tmp:
        instances = {role["pdf_font"]: role for role in tokens["type"]["scale"].values()
                     if role["pdf_font"] != "Plex"}
        for font_name, role in instances.items():
            source = FontSource(Path(font_dir) / "InstrumentSans.ttf")
            instance = instantiateVariableFont(source, role["axes"])
            path = Path(tmp) / f"{font_name}.ttf"
            instance.save(path)
            pdfmetrics.registerFont(TTFont(font_name, str(path)))
        pdfmetrics.registerFont(TTFont("Plex", str(Path(font_dir) / "IBMPlexMono-Regular.ttf")))
        c = canvas.Canvas(str(output), pageCompression=1)
        c.setTitle("Strale - Quiet Material application studies")
        c.setAuthor("Strale")
        for page in tokens["layout"]["pages"]:
            width, height = page["size"]
            c.setPageSize((width, height))
            c.setFillColor(HexColor(palette[page["background"]]))
            c.rect(0, 0, width, height, fill=1, stroke=0)
            for layer in page["layers"]:
                kind = layer["kind"]
                x, y = layer["at"]
                if kind == "text":
                    role = tokens["type"]["scale"][layer["role"]]
                    c.setFont(role["pdf_font"], role["size"])
                    c.setFillColor(HexColor(palette[layer.get("colour", "--ink")]))
                    lines = applications["copy"][layer["copy"]].split("\n")
                    for index, line in enumerate(lines):
                        measured = pdfmetrics.stringWidth(line, role["pdf_font"], role["size"])
                        if measured > layer["max_width"]:
                            raise ValueError(f"Text exceeds box: {page['id']} {layer['copy']}")
                        baseline = y + role["size"] + index * role["leading"]
                        if x < 0 or x + measured > width or baseline > height:
                            raise ValueError(f"Text outside canvas: {layer['copy']}")
                        c.drawString(x, height - baseline, line)
                elif kind == "rect":
                    w, h = layer["size"]
                    fill = layer.get("fill")
                    stroke = layer.get("stroke")
                    if fill:
                        c.setFillColor(HexColor(palette[fill]))
                    if stroke:
                        c.setStrokeColor(HexColor(palette[stroke]))
                        c.setLineWidth(tokens["layout"]["stroke"])
                    radius = tokens["radii"][layer.get("radius_index", 0)]
                    c.roundRect(x, height-y-h, w, h, radius, fill=bool(fill), stroke=bool(stroke))
                elif kind == "line":
                    c.setStrokeColor(HexColor(palette[layer.get("colour", "--hairline")]))
                    c.setLineWidth(tokens["layout"]["stroke"])
                    c.line(x, height-y, x+layer["length"], height-y)
                elif kind == "image":
                    w, h = layer["size"]
                    c.drawImage(str(assets[layer["asset"]]), x, height-y-h, w, h, mask="auto")
                elif kind == "lockup":
                    svg = assets["lockup"].read_text(encoding="utf-8")
                    svg = svg.replace("currentColor", palette[layer.get("colour", "--ink")])
                    drawing = svg2rlg(io.BytesIO(svg.encode()))
                    scale = layer["width"] / drawing.width
                    drawing.scale(scale, scale)
                    renderPDF.draw(drawing, c, x, height-y-drawing.height*scale)
                else:
                    raise ValueError(f"Unknown layer kind: {kind}")
            c.showPage()
        c.save()
    print(json.dumps({"output": str(output), "pages": len(tokens["layout"]["pages"]),
                      "sha256": hashlib.sha256(output.read_bytes()).hexdigest()}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--archive-root", required=True)
    parser.add_argument("--font-dir", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    render(args.archive_root, args.font_dir, args.output)
