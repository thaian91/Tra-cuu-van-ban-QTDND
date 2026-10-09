#!/usr/bin/env python3
"""Chuyển các trang .htm trích từ file CHM thành data.js cho ứng dụng tra cứu.

Dùng: python3 -I tools/build_data.py <thư_mục_giải_nén_CHM> <data.js đầu ra>
"""
import json, re, sys, html, os, unicodedata
from bs4 import BeautifulSoup, NavigableString, Tag

SRC, OUT = sys.argv[1], sys.argv[2]

# Bản mẫu: id -> (tệp toàn văn, tệp tóm tắt, nhóm)
SAMPLE = [
    dict(id="27-2024-tt-nhnn", full="27_2024_TT-NHNN_Quy_Bao_dam_an_toan_he_thong_QTDND.htm",
         summary="27_2024_TT-NHNN_TOM_TAT.htm", group="quy-bao-dam", kind="Thông tư"),
    dict(id="28-2025-tt-nhnn", full="28_2025_TT-NHNN_Quy_bao_dam_An_toan_he_thong_QTDND_-_Sua_doi_TT_27_2024.htm",
         summary="28_2025_TT-NHNN_TOM_TAT.htm", group="quy-bao-dam", kind="Thông tư"),
    dict(id="58-2026-vbhn", full="58_2026_VBHN_Hop_nhat_Thong_tu_so_27_2024,_28_2025,_10_2026.htm",
         summary=None, group="quy-bao-dam", kind="Văn bản hợp nhất"),
    dict(id="73-2025-tt-nhnn", full="73_2025_TT-NHNN_Ho_so,_trinh_tu,_thu_tuc_chap_thuan_thay_doi_-_Thay_the_TT_28_2024.htm",
         summary="73_2025_TT-NHNN_TOM_TAT.htm", group="chap-thuan", kind="Thông tư"),
]

# Tên nhóm theo mục lục help.hhc (đã viết có dấu); số mục đếm từ chính help.hhc.
GROUPS = [
    ("luat", "Luật", "Luat"),
    ("qtdnd", "Quy định về QTDND", "Quy dinh ve QTDND"),
    ("giay-phep", "Mạng lưới hoạt động – Giấy phép", "Mang luoi HOAT DONG - GIAY PHEP"),
    ("quy-bao-dam", "Quỹ bảo đảm an toàn hệ thống", "Quy Bao dam an toan he thong"),
    ("thong-tin", "Hệ thống thông tin – Báo cáo thống kê", "He thong thong tin - Bao cao thong ke"),
    ("kiem-soat", "Kiểm toán độc lập – Kiểm soát nội bộ", "Kiem toan doc lap - Kiem soat Noi bo"),
    ("gioi-han", "Các giới hạn, tỷ lệ bảo đảm an toàn hoạt động", "Cac gioi han, ty le bao dam an toan hoat dong QTDND"),
    ("chap-thuan", "Thủ tục chấp thuận những thay đổi", "Thu tuc chap thuan nhung thay doi cua QTDND"),
    ("tai-san-co", "Phân loại tài sản Có", "Phan loai Tai san Co"),
    ("tai-chinh", "Chế độ tài chính", "Che do Tai chinh"),
    ("cho-vay", "Hoạt động cho vay", "Hoat dong Cho vay"),
    ("huy-dong", "Hoạt động huy động vốn", "Hoat dong Huy dong von"),
    ("kho-quy", "Hoạt động an toàn kho quỹ", "Hoat dong An toan kho quy"),
    ("hoi-dap", "Nội dung mới – Hỏi đáp", "Cac noi dung MOI - HOI DAP"),
    ("khac", "Văn bản khác", "Van ban KHAC"),
]

def norm(s):
    return re.sub(r"\s+", " ", s.replace("\xa0", " ")).strip()

def inline(node):
    """Giữ đậm/nghiêng, bỏ phần định dạng Word còn lại."""
    return _inline(node).strip()

def _inline(node):
    out = []
    for ch in node.children:
        if isinstance(ch, NavigableString):
            out.append(html.escape(str(ch).replace("\xa0", " "), quote=False))
        elif isinstance(ch, Tag):
            inner = " " if ch.name == "br" else _inline(ch)
            style = (ch.get("style") or "").lower()
            if ch.name in ("b", "strong") or "font-weight: bold" in style:
                inner = f"<b>{inner}</b>" if inner.strip() else inner
            elif ch.name in ("i", "em") or "font-style: italic" in style:
                inner = f"<i>{inner}</i>" if inner.strip() else inner
            out.append(inner)
    s = "".join(out)
    s = re.sub(r"\?xml:namespace[^>/]*/", "", s)
    s = re.sub(r"\s+", " ", s)
    s = re.sub(r"</b>\s*<b>|</i>\s*<i>", " ", s)
    return s

def clean_table(t):
    rows = []
    for tr in t.find_all("tr"):
        cells = []
        for td in tr.find_all(["td", "th"], recursive=False):
            txt = "<br>".join(x for x in (inline(p) for p in (td.find_all("p") or [td])) if x)
            attrs = ""
            for a in ("colspan", "rowspan"):
                if td.get(a) and td[a] != "1":
                    attrs += f' {a}="{td[a]}"'
            tag = "th" if td.name == "th" else "td"
            cells.append(f"<{tag}{attrs}>{txt}</{tag}>")
        if cells:
            rows.append("<tr>" + "".join(cells) + "</tr>")
    return "<table>" + "".join(rows) + "</table>"

def blocks(root):
    """Duyệt theo thứ tự tài liệu, trả về danh sách (loại, nội dung)."""
    res = []
    def walk(n):
        for ch in n.children:
            if not isinstance(ch, Tag):
                continue
            if ch.name in ("h1", "h2", "h3", "h4"):
                txt = norm(ch.get_text(" "))
                if txt:
                    res.append(("h", txt, ch.name))
            elif ch.name == "p":
                h = inline(ch)
                if re.sub(r"<[^>]+>", "", h).strip():
                    res.append(("p", h))
            elif ch.name == "table":
                trs = ch.find_all("tr")
                nested = ch.find("table")
                if len(trs) <= 1 or nested:   # bảng dàn trang (quốc hiệu, nơi nhận...)
                    for td in (ch.find_all("td") if not nested else []):
                        for p in td.find_all("p"):
                            h = inline(p)
                            if re.sub(r"<[^>]+>", "", h).strip():
                                res.append(("p", h))
                    if nested:
                        walk(ch)
                else:
                    res.append(("t", clean_table(ch)))
            else:
                walk(ch)
    walk(root)
    return res

def strip(h):
    return norm(re.sub(r"<[^>]+>", "", html.unescape(h)))

def para_class(plain):
    if re.match(r"^\d+\.\s", plain): return "k"        # khoản
    if re.match(r"^[a-zđ]\)\s", plain): return "d"     # điểm
    if re.match(r"^[-–•]\s", plain): return "g"
    return ""

def bold_ratio(h):
    plain = re.sub(r"\[\d+\]", "", strip(h))
    bold = "".join(re.findall(r"<b>(.*?)</b>", h))
    bold = re.sub(r"\[\d+\]", "", norm(re.sub(r"<[^>]+>", "", html.unescape(bold))))
    return len(bold) / max(len(plain), 1)

def tidy(t):
    t = re.sub(r"\s+([,;])", r"\1", t)
    t = re.sub(r"\bQ uy\b", "Quy", t)
    return norm(t)

REF = re.compile(r"\[(\d+)\]")
HEAD_CHUONG = re.compile(r"^(Chương|CHƯƠNG)\s+[IVXLC\d]+\s*$")
HEAD_MUC = re.compile(r"^(Mục|MỤC)\s+\d+\s*$")
HEAD_DIEU = re.compile(r"^Điều\s*((?:\d\s*)+?)\s*\.\s*(.*)$")
HEAD_PL = re.compile(r"^(Phụ lục|PHỤ LỤC)", re.I)

def parse_full(path):
    s = BeautifulSoup(unicodedata.normalize("NFC", open(path, encoding="utf-8", errors="ignore").read()), "lxml")
    c = s.find(id="winchm_template_content")
    bl = blocks(c)
    # chú thích cuối văn bản: khối "[1]..." cuối cùng, mỗi mục bắt đầu bằng "[n]"
    notes = {}
    ks = [i for i, b in enumerate(bl) if b[0] == "p" and re.match(r"^\[1\]", strip(b[1]))]
    if ks and ks[-1] > len(bl) * .5:
        k, last = ks[-1], None
        for b in bl[k:]:
            t = tidy(re.sub(r"<[^>]+>", "", b[1]))
            m = re.match(r"^\[(\d+)\]\s*(.*)$", t)
            if m: last = m.group(1); notes[last] = m.group(2)
            elif last and t: notes[last] += " " + t
        bl = bl[:k]
    start = next((i for i, b in enumerate(bl) if b[0] == "p" and re.match(r"^(THÔNG\s*TƯ|VĂN\s*BẢN\s*HỢP\s*NHẤT|NGHỊ\s*ĐỊNH|LUẬT)\s*$", strip(b[1]), re.I)), 0)
    head = " ".join(strip(re.sub(r"</?(td|tr|table)[^>]*>", " ", b[1])) for b in bl[:start])
    meta = {}
    m = re.search(r"Số:\s*([\w/\-–.\s]+?(?:TT-NHNN|VBHN-NHNN|NĐ-CP|QH\d+))", head)
    if m: meta["so_hieu"] = re.sub(r"\s+", "", m.group(1))
    m = re.search(r"ngày\s*(\d{1,2})\s*tháng\s*(\d{1,2})\s*năm\s*(\d{4})", head)
    if m: meta["ngay"] = f"{int(m.group(1)):02d}/{int(m.group(2)):02d}/{m.group(3)}"
    i = start + 1
    title_parts = []
    while i < len(bl) and bl[i][0] == "p" and bold_ratio(bl[i][1]) > .8 and not strip(bl[i][1]).startswith("Căn cứ"):
        title_parts.append(tidy(strip(bl[i][1]))); i += 1
    if not title_parts and i < len(bl) and bl[i][0] == "p":
        title_parts.append(tidy(strip(bl[i][1]))); i += 1
    meta["tieu_de"] = tidy(" ".join(title_parts))
    # đoạn giữa tiêu đề và "Căn cứ": lịch sử sửa đổi (văn bản hợp nhất)
    lich_su = []
    while i < len(bl) and bl[i][0] == "p" and not strip(bl[i][1]).startswith("Căn cứ"):
        if strip(bl[i][1]): lich_su.append(tidy(re.sub(r"<[^>]+>", "", bl[i][1])))
        i += 1
    body = bl[i:]
    chapters, can_cu, cur = [], [], dict(ch=None, art=None, mode=None)
    def new_chapter(title):
        cur["ch"] = dict(id=f"c{len(chapters)+1}", title=title, articles=[]); chapters.append(cur["ch"]); cur["art"] = None; cur["mode"] = "chuong"
    def new_article(num, ten, refs):
        if cur["ch"] is None: new_chapter("")
        cur["art"] = dict(id=f"dieu-{num}", so=num, ten=ten, nd=[])
        if refs: cur["art"]["fn"] = refs
        cur["ch"]["articles"].append(cur["art"]); cur["mode"] = None
    def new_muc(t):
        if cur["ch"] is None: new_chapter("")
        cur["art"] = dict(id=f"muc-{len(cur['ch']['articles'])}", muc=t, ten="", nd=[]); cur["ch"]["articles"].append(cur["art"]); cur["mode"] = "muc"
    def push(item):
        (cur["art"]["nd"] if cur["art"] else can_cu).append(item)
    for b in body:
        kind, h = b[0], b[1]
        if kind == "t":
            cur["mode"] = None; push(["t", h, ""]); continue
        plain_raw = strip(h)
        refs = REF.findall(plain_raw)
        plain = tidy(REF.sub("", plain_raw))
        is_h = (kind == "h") or (bold_ratio(h) > .85 and len(plain) < 300)
        in_pl = bool(cur["ch"] and cur["ch"].get("phu_luc"))
        if in_pl and not (is_h and HEAD_PL.match(plain)):
            # trong phụ lục (mẫu biểu) không tách chương/điều nữa
            if is_h and cur["mode"] == "pl" and cur["ch"].get("_n", 0) < 2 and plain:
                cur["ch"]["title"] = tidy(cur["ch"]["title"] + " — " + plain); cur["ch"]["_n"] = cur["ch"].get("_n", 0) + 1; continue
            if not plain and kind != "t": continue
            cur["mode"] = None
            push(["t", h, ""] if kind == "t" else ["p", tidy(h), para_class(plain)]); continue
        if is_h and HEAD_CHUONG.match(plain): new_chapter(plain); continue
        if is_h and HEAD_PL.match(plain):
            new_chapter(plain); cur["ch"]["phu_luc"] = True
            cur["art"] = dict(id=f"pl-{len(chapters)}", so="", ten="", nd=[]); cur["ch"]["articles"].append(cur["art"]); cur["mode"] = "pl"; continue
        if is_h and HEAD_MUC.match(plain): new_muc(plain); continue
        m = HEAD_DIEU.match(plain) if is_h else None
        if m: new_article(re.sub(r"\s+", "", m.group(1)), m.group(2).strip(), refs); continue
        if is_h and cur["mode"] in ("chuong", "muc", "pl") and plain:
            if cur["mode"] == "chuong" and not cur["ch"]["articles"]: cur["ch"]["title"] = tidy(cur["ch"]["title"] + " — " + plain)
            elif cur["mode"] == "muc": cur["art"]["ten"] = tidy(cur["art"]["ten"] + " " + plain)
            elif cur["mode"] == "pl": cur["ch"]["title"] = tidy(cur["ch"]["title"] + " — " + plain)
            continue
        if not plain: continue
        cur["mode"] = None
        if kind == "h":
            push(["p", f"<b>{html.escape(plain, quote=False)}</b>", ""])
        else:
            push(["p", tidy(h), para_class(plain)])
    for ch in chapters:
        ch.pop("_n", None)
        ch["title"] = re.sub(r"\b0 (\d)\b", r"0\1", ch["title"])
    if "so_hieu" not in meta:
        m = re.search(r"Số:\s*(\d+/VBHN-NHNN)", " ".join(strip(b[1]) for b in bl))
        if m: meta["so_hieu"] = m.group(1)
    meta["chu_thich"] = notes
    return meta, lich_su, [x for x in can_cu if x], chapters

def timeline(paras):
    out = []
    for p in paras:
        m = re.search(r"(Thông tư số [\w/\-–]+) ngày (\d+) tháng (\d+) năm (\d+).*?có hiệu lực kể từ ngày (\d+) tháng (\d+) năm (\d+)", p)
        if m:
            f = lambda d, mo, y: f"{int(d):02d}/{int(mo):02d}/{y}"
            out.append(dict(so=m.group(1), ngay=f(*m.group(2, 3, 4)), hieu_luc=f(*m.group(5, 6, 7)), mo_ta=p))
    return out

def parse_summary(path):
    s = BeautifulSoup(unicodedata.normalize("NFC", open(path, encoding="utf-8", errors="ignore").read()), "lxml")
    c = s.find(id="winchm_template_content")
    out = []
    for b in blocks(c):
        if b[0] == "h": out.append(["h", b[1], ""])
        elif b[0] == "p": out.append(["p", b[1], ""])
        else: out.append(["t", b[1], ""])
    return out

def read_hhc():
    """Đếm số văn bản (mục có Local) trong từng nhóm cấp 1 của help.hhc."""
    t = open(os.path.join(SRC, "help.hhc"), encoding="utf-8", errors="ignore").read()
    d, top, name, counts = 0, None, None, {}
    for m in re.finditer(r"<UL>|</UL>|name=\"Name\" value=\"([^\"]*)\"|name=\"Local\" value=\"([^\"]*)\"", t, re.I):
        s = m.group(0).upper()
        if s == "<UL>": d += 1
        elif s == "</UL>": d -= 1
        elif m.group(1) is not None:
            name = m.group(1)
            if d == 1: top = name; counts.setdefault(top, 0)
        elif m.group(2) and d >= 2 and top:
            counts[top] += 1
    return counts

if __name__ == "__main__":
    counts = read_hhc()
    docs = []
    for sp in SAMPLE:
        meta, ls, cc, chapters = parse_full(os.path.join(SRC, sp["full"]))
        d = dict(id=sp["id"], nhom=sp["group"], loai=sp["kind"], **meta, can_cu=cc, lich_su=ls, chuong=chapters)
        d["dong_thoi_gian"] = timeline(ls)
        d["tom_tat"] = parse_summary(os.path.join(SRC, sp["summary"])) if sp["summary"] else None
        docs.append(d)
    groups = [dict(id=i, ten=ten, tong=counts.get(raw, 0)) for i, ten, raw in GROUPS]
    json.dump(dict(groups=groups, docs=docs), open(OUT + ".json", "w", encoding="utf-8"), ensure_ascii=False)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("window.APP_DATA=" + json.dumps(dict(groups=groups, docs=docs), ensure_ascii=False, separators=(",", ":")) + ";\n")
    for d in docs:
        print("\n==", d["id"], d.get("so_hieu"), d.get("ngay"), "|", d.get("loai"), "|", d.get("tieu_de")[:110])
        print("  can_cu:", len(d["can_cu"]), " tom_tat:", len(d["tom_tat"]) if d["tom_tat"] else None)
        for c in d["chuong"]:
            print("  ", c["id"], c["title"][:70], [a.get("so") or a.get("muc") for a in c["articles"]][:40])
