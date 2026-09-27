#!/usr/bin/env python3
"""The docx viewer's fixtures (lane docx-viewer, 2026-09-27) — DETERMINISTIC.

Run from anywhere:  python3 scripts/fixtures/docx/gen.py
Writes the three .docx files next to this script. The runner has no python,
so the outputs are committed; re-running must produce byte-identical files
(every zip entry carries a fixed timestamp, the core properties are fixed, no
random ids). python-docx 1.2.0; the PNG is written by hand (zlib) so nothing
else is needed. What each file exercises: README.md beside this script.
"""
import io
import os
import struct
import zipfile
import zlib

from docx import Document
from docx.enum.section import WD_ORIENT, WD_SECTION
from docx.enum.style import WD_STYLE_TYPE
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.opc.constants import RELATIONSHIP_TYPE as RT
from docx.opc.packuri import PackURI
from docx.opc.part import Part
from docx.oxml import parse_xml
from docx.shared import Inches, Pt, RGBColor
import datetime

HERE = os.path.dirname(os.path.abspath(__file__))
W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
WR = W + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
FIXED = datetime.datetime(2026, 9, 27, 0, 0, 0)


def png(width, height):
    """A tiny deterministic RGB PNG: four colour quadrants + a dark diagonal."""
    rows = []
    for y in range(height):
        row = bytearray([0])  # filter: none
        for x in range(width):
            if abs(x * height - y * width) < width * 2:
                rgb = (20, 20, 20)
            elif x < width // 2 and y < height // 2:
                rgb = (200, 60, 60)
            elif x >= width // 2 and y < height // 2:
                rgb = (60, 160, 70)
            elif x < width // 2:
                rgb = (50, 90, 200)
            else:
                rgb = (230, 190, 40)
            row += bytes(rgb)
        rows.append(bytes(row))

    def chunk(kind, data):
        c = struct.pack('>I', len(data)) + kind + data
        return c + struct.pack('>I', zlib.crc32(kind + data) & 0xFFFFFFFF)

    ihdr = struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr)
            + chunk(b'IDAT', zlib.compress(b''.join(rows), 9)) + chunk(b'IEND', b''))


def fix_core(doc, title):
    cp = doc.core_properties
    cp.title = title
    cp.author = 'Fixture Author'
    cp.last_modified_by = 'Fixture Author'
    cp.created = FIXED
    cp.modified = FIXED
    cp.revision = 1
    cp.comments = 'VibeSpace docx viewer fixture (scripts/fixtures/docx/gen.py)'


def save_deterministic(doc, name):
    """python-docx stamps every zip entry with the wall clock; rewrite the zip
    with a fixed timestamp so a re-run is byte-identical."""
    buf = io.BytesIO()
    doc.save(buf)
    src = zipfile.ZipFile(io.BytesIO(buf.getvalue()))
    out = io.BytesIO()
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        for info in src.infolist():
            zi = zipfile.ZipInfo(info.filename, date_time=(2026, 9, 27, 0, 0, 0))
            zi.compress_type = zipfile.ZIP_DEFLATED
            zi.external_attr = 0o644 << 16
            z.writestr(zi, src.read(info.filename), compresslevel=9)
    path = os.path.join(HERE, name)
    with open(path, 'wb') as f:
        f.write(out.getvalue())
    print('wrote', path, len(out.getvalue()), 'bytes')


def letter(section, landscape=False):
    section.orientation = WD_ORIENT.LANDSCAPE if landscape else WD_ORIENT.PORTRAIT
    section.page_width, section.page_height = (Inches(11), Inches(8.5)) if landscape else (Inches(8.5), Inches(11))
    for side in ('left_margin', 'right_margin', 'top_margin', 'bottom_margin'):
        setattr(section, side, Inches(1))
    section.header_distance = Inches(0.5)
    section.footer_distance = Inches(0.5)


def page_field(paragraph, cached):
    """A complex PAGE field exactly as Word writes it (the cached result is the
    only text a renderer without pagination can show)."""
    for x in (
        '<w:r %s><w:fldChar w:fldCharType="begin"/></w:r>' % W,
        '<w:r %s><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>' % W,
        '<w:r %s><w:fldChar w:fldCharType="separate"/></w:r>' % W,
        '<w:r %s><w:t>%s</w:t></w:r>' % (W, cached),
        '<w:r %s><w:fldChar w:fldCharType="end"/></w:r>' % W,
    ):
        paragraph._p.append(parse_xml(x))


def add_footnotes(doc, notes):
    body = ''.join(
        '<w:footnote w:id="%d"><w:p><w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:footnoteRef/></w:r>'
        '<w:r><w:t xml:space="preserve"> %s</w:t></w:r></w:p></w:footnote>' % (i + 1, text)
        for i, text in enumerate(notes))
    xml = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:footnotes %s>'
           '<w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote>'
           '<w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>'
           '%s</w:footnotes>') % (W, body)
    part = Part(PackURI('/word/footnotes.xml'),
                'application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml',
                xml.encode('utf-8'), doc.part.package)
    doc.part.relate_to(part, RT.FOOTNOTES)


def footnote_ref(paragraph, n):
    paragraph._p.append(parse_xml(
        '<w:r %s><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:footnoteReference w:id="%d"/></w:r>' % (W, n)))


def hyperlink(doc, paragraph, target, text, external=True, anchor=None):
    if external:
        rid = doc.part.relate_to(target, RT.HYPERLINK, is_external=True)
        attr = 'r:id="%s"' % rid
    else:
        attr = 'w:anchor="%s"' % anchor
    paragraph._p.append(parse_xml(
        '<w:hyperlink %s %s><w:r><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr>'
        '<w:t xml:space="preserve">%s</w:t></w:r></w:hyperlink>' % (WR, attr, text)))


def body_para(doc, text):
    p = doc.add_paragraph(text)
    p.paragraph_format.first_line_indent = Inches(0.5)
    p.paragraph_format.line_spacing = 2.0
    return p


LOREM = ('Supervisor support was operationalised as the degree to which employees perceive that their '
         'immediate supervisor values their contributions and cares about their well-being. Burnout was '
         'treated as a three-part syndrome of exhaustion, cynicism and reduced professional efficacy.')


def apa_title_page():
    doc = Document()
    fix_core(doc, 'Examining Relationships: Supervisor Support and Employee Burnout')
    st = doc.styles['Normal']
    st.font.name = 'Times New Roman'
    st.font.size = Pt(12)

    # ── section 1: the title page (different first page) ──
    s1 = doc.sections[0]
    letter(s1)
    s1.different_first_page_header_footer = True
    fp = s1.first_page_header.paragraphs[0]
    fp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    page_field(fp, '1')
    dh = s1.header.paragraphs[0]
    dh.add_run('RUNNING-HEAD SUPERVISOR SUPPORT AND BURNOUT')
    dh.add_run('\t')  # a long running head passes the Header style's centre stop: ONE tab reaches the right-aligned stop at the margin
    page_field(dh, '2')
    fpar = s1.footer.paragraphs[0]
    fpar.alignment = WD_ALIGN_PARAGRAPH.CENTER
    fpar.add_run('FOOTER-TEXT Example University')

    for _ in range(3):
        doc.add_paragraph()
    t = doc.add_paragraph()
    t.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = t.add_run('Examining Relationships: Supervisor Support and Employee Burnout')
    r.bold = True
    doc.add_paragraph()
    for line in ('Jordan A. Example', 'Department of Psychology, Example University',
                 'PSY 3010: Research Methods in Psychology', 'Dr. Morgan Professor', 'September 27, 2026'):
        p = doc.add_paragraph(line)
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.line_spacing = 2.0

    # ── section 2: the paper (new page; header/footer linked to previous) ──
    s2 = doc.add_section(WD_SECTION.NEW_PAGE)
    letter(s2)
    s2.different_first_page_header_footer = False
    h = doc.add_heading('Examining Relationships: Supervisor Support and Employee Burnout', level=1)
    h.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p = body_para(doc, LOREM + ' Prior work links low support to higher exhaustion')
    footnote_ref(p, 1)
    p.add_run(' across service occupations.')
    p = body_para(doc, 'COLOURED-RUN-MARKER ')
    run = p.add_run('This sentence is set in the document\'s own dark blue.')
    run.font.color.rgb = RGBColor(0x1F, 0x38, 0x64)
    p.add_run(' And this one is automatic (black) again.')
    doc.add_heading('Hypotheses', level=2)
    for item in ('Perceived supervisor support is negatively related to exhaustion.',
                 'Perceived supervisor support is negatively related to cynicism.',
                 'Professional efficacy mediates both relationships.'):
        doc.add_paragraph(item, style='List Number')
    doc.add_heading('Measures', level=2)
    for item in ('Survey of Perceived Supervisor Support (8 items)',
                 'Maslach Burnout Inventory - General Survey (16 items)',
                 'Demographics and tenure'):
        doc.add_paragraph(item, style='List Bullet')
    body_para(doc, 'Table 1 lists the descriptive statistics for the study variables.')
    table = doc.add_table(rows=4, cols=3)
    table.style = 'Table Grid'
    cells = [('Variable', 'M', 'SD'), ('Supervisor support', '4.12', '0.81'),
             ('Exhaustion', '2.95', '1.10'), ('Cynicism', '2.41', '1.02')]
    for i, row in enumerate(cells):
        for j, text in enumerate(row):
            table.cell(i, j).text = text
    body_para(doc, 'Figure 1 shows the four-quadrant study design.')
    doc.add_picture(io.BytesIO(png(160, 100)), width=Inches(2.5))
    body_para(doc, 'FIGURE-CAPTION Figure 1. Study design.')

    # a manual page break inside the section: page 3 = References
    doc.add_paragraph().add_run().add_break(WD_BREAK.PAGE)
    doc.add_heading('References', level=1)
    ref = doc.add_paragraph('Example, J. A. (2025). Support and strain at work. Journal of Examples, 12(3), 45-67.')
    ref.paragraph_format.left_indent = Inches(0.5)
    ref.paragraph_format.first_line_indent = Inches(-0.5)

    # ── section 3: a landscape appendix ──
    s3 = doc.add_section(WD_SECTION.NEW_PAGE)
    letter(s3, landscape=True)
    doc.add_heading('Appendix: Landscape Table', level=1)
    wide = doc.add_table(rows=2, cols=6)
    wide.style = 'Table Grid'
    for j in range(6):
        wide.cell(0, j).text = 'Wave %d' % (j + 1)
        wide.cell(1, j).text = '%d' % (100 + j * 7)
    body_para(doc, 'LANDSCAPE-MARKER The appendix page is wider than it is tall.')

    add_footnotes(doc, ['FOOTNOTE-ONE Burnout was measured with the MBI-GS.'])
    save_deterministic(doc, 'apa-title-page.docx')


def long_80_pages():
    doc = Document()
    fix_core(doc, 'Eighty pages')
    letter(doc.sections[0])
    hdr = doc.sections[0].header.paragraphs[0]
    hdr.add_run('LONG-DOC HEADER')
    for i in range(80):
        doc.add_heading('Chapter %d' % (i + 1), level=1)
        for k in range(6):
            body_para(doc, 'PAGE-%02d-PARA-%d ' % (i + 1, k + 1) + LOREM)
        if i < 79:
            doc.add_paragraph().add_run().add_break(WD_BREAK.PAGE)
    save_deterministic(doc, 'long-80-pages.docx')


def hostile():
    doc = Document()
    fix_core(doc, 'Hostile')
    letter(doc.sections[0])
    doc.add_paragraph('HOSTILE-START')
    doc.add_paragraph('<img src=x onerror=alert(1)>')
    doc.add_paragraph('<img src=x onerror="window.__docxPwned=(window.__docxPwned||0)+1">')
    p = doc.add_paragraph('Script link: ')
    hyperlink(doc, p, 'javascript:alert(1)', 'JS-LINK click me')
    p = doc.add_paragraph('Data link: ')
    hyperlink(doc, p, 'data:text/html,<script>alert(1)</script>', 'DATA-LINK click me')
    p = doc.add_paragraph('Web link: ')
    hyperlink(doc, p, 'https://example.com/paper', 'WEB-LINK example.com')
    p = doc.add_paragraph('Internal link: ')
    hyperlink(doc, p, None, 'ANCHOR-LINK to the end', external=False, anchor='endmark')
    # an altChunk: an embedded HTML part the library renders in an iframe
    html = ('<html><body><p>ALTCHUNK-TEXT embedded html part</p>'
            '<script>parent.__docxPwned=(parent.__docxPwned||0)+1</script>'
            '<img src=x onerror="parent.__docxPwned=(parent.__docxPwned||0)+1"></body></html>')
    part = Part(PackURI('/word/afchunk1.htm'), 'text/html', html.encode('utf-8'), doc.part.package)
    rid = doc.part.relate_to(part, 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/aFChunk')
    body = doc.element.body
    body.insert(len(body) - 1, parse_xml('<w:altChunk %s r:id="%s"/>' % (WR, rid)))
    # a STYLE whose font name closes the CSS string and the rule: the library
    # writes a style's font-family unescaped into a <style> element (a run's own
    # font goes through the CSSOM and cannot escape)
    st = doc.styles.add_style('Hostile Font', WD_STYLE_TYPE.PARAGRAPH)
    st.element.get_or_add_rPr().append(parse_xml(
        '<w:rFonts %s w:ascii="x\' } body, .docx-wrapper { outline: 7px solid rgb(255, 0, 255) !important } p { font-family: \'y"/>' % W))
    doc.add_paragraph('CSS-INJECTION style with a hostile font name', style=st)
    for _ in range(3):
        doc.add_paragraph()
    end = doc.add_paragraph()
    end._p.append(parse_xml('<w:bookmarkStart %s w:id="0" w:name="endmark"/>' % W))
    end.add_run('HOSTILE-END bookmark target')
    end._p.append(parse_xml('<w:bookmarkEnd %s w:id="0"/>' % W))
    save_deterministic(doc, 'hostile.docx')


EMBED_TEXT = 'EMBEDDED-FONT MONO 0123456789 iiiiiiiiii WWWWWWWWWW'
EMBED_NAME = 'VS Embedded Fixture'
EMBED_KEY = '{4D2F7A10-5C3B-4E8A-9F61-2B7C0D9E1A34}'
EMBED_SRC = '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'


def subset_font(text):
    """DejaVu Sans Mono (Bitstream Vera licence: redistribution allowed, the
    copyright + licence name records are kept) cut to the glyphs of `text`, with
    a fixed head.modified so the bytes are deterministic."""
    from fontTools import subset
    from fontTools.ttLib import TTFont
    font = TTFont(EMBED_SRC, recalcTimestamp=False)
    opts = subset.Options()
    opts.name_IDs = ['*']
    opts.name_languages = ['*']
    opts.notdef_outline = True
    opts.recalc_timestamp = False
    opts.drop_tables += ['FFTM']
    sub = subset.Subsetter(opts)
    sub.populate(text=text)
    sub.subset(font)
    font['head'].modified = font['head'].created
    buf = io.BytesIO()
    font.save(buf)
    return buf.getvalue()


def obfuscate(data, guid):
    """ECMA-376 font obfuscation (the same XOR docx-preview's deobfuscate undoes)."""
    hexs = guid.strip('{}').replace('-', '')
    key = [int(hexs[i * 2:i * 2 + 2], 16) for i in range(16)][::-1]
    out = bytearray(data)
    for i in range(32):
        out[i] ^= key[i % 16]
    return bytes(out)


def embedded_font():
    doc = Document()
    fix_core(doc, 'Embedded font')
    letter(doc.sections[0])
    doc.add_paragraph('EMBEDDED-FONT fixture: the next line is set in a font carried inside this file.')
    p = doc.add_paragraph()
    r = p.add_run(EMBED_TEXT)
    r.font.name = EMBED_NAME
    r.font.size = Pt(12)
    font_part = Part(PackURI('/word/fonts/font1.odttf'),
                     'application/vnd.openxmlformats-officedocument.obfuscatedFont',
                     obfuscate(subset_font(EMBED_TEXT), EMBED_KEY), doc.part.package)
    ft = next(rel.target_part for rel in doc.part.rels.values() if rel.reltype == RT.FONT_TABLE)
    rid = ft.relate_to(font_part, 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/font')
    xml = ft.blob.decode('utf-8')
    entry = ('<w:font w:name="%s"><w:panose1 w:val="020B0609030804020204"/><w:charset w:val="00"/>'
             '<w:family w:val="modern"/><w:pitch w:val="fixed"/>'
             '<w:embedRegular xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
             'r:id="%s" w:fontKey="%s"/></w:font>') % (EMBED_NAME, rid, EMBED_KEY)
    xml = xml.replace('</w:fonts>', entry + '</w:fonts>')
    ft._blob = xml.encode('utf-8')
    save_deterministic(doc, 'embedded-font.docx')


if __name__ == '__main__':
    apa_title_page()
    long_80_pages()
    hostile()
    embedded_font()
