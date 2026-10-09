#!/usr/bin/env python3
"""Chuyển toàn bộ văn bản trong file CHM (đã giải nén) thành dữ liệu cho ứng dụng tra cứu.

Dùng:  python3 -I tools/build_data.py <thư_mục_giải_nén_CHM> <thư_mục_data_đầu_ra>

Đầu ra:
  data/catalog.js        danh mục nhóm + văn bản (tải ngay khi mở app)
  data/search.js         chỉ mục tìm kiếm theo từng Điều (tải khi tìm lần đầu)
  data/docs/<id>.js      nội dung từng văn bản (tải khi mở văn bản đó)
Nguồn danh mục là help.hhc của CHM. Trang "TÓM TẮT" bị bỏ theo yêu cầu.
"""
import json, re, sys, html, os, unicodedata
from bs4 import BeautifulSoup, NavigableString, Tag

SRC, OUT = sys.argv[1], sys.argv[2]

# (id, tên hiển thị có dấu, tên gốc trong help.hhc)
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
SUBGROUPS = {
    "Quy dinh ve Lai suat tien gui bang VND": "Quy định về lãi suất tiền gửi bằng VND",
    "Lai suat rut truoc han tien gui tai TCTD": "Lãi suất rút trước hạn tiền gửi tại TCTD",
}

# ---------------------------------------------------------------- HTML -> khối nội dung
def norm(s):
    return re.sub(r"\s+", " ", s.replace("\xa0", " ")).strip()

def inline(node):
    return _inline(node).strip()

def _inline(node):
    """Giữ đậm/nghiêng, bỏ phần định dạng Word còn lại."""
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
            parts = td.find_all("p") or [td]
            txt = "<br>".join(x for x in (inline(p) for p in parts) if x)
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
    """Duyệt theo thứ tự tài liệu: ('h'|'p'|'t', html, thẻ)."""
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
                    if not nested:
                        for td in ch.find_all("td"):
                            for p in td.find_all("p"):
                                h = inline(p)
                                if re.sub(r"<[^>]+>", "", h).strip():
                                    res.append(("p", h))
                    else:
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
    t = re.sub(r"\bv ề\b", "về", t)
    return norm(t)

UPPER_WORDS = ("qtdnd", "tctd", "nhnn", "vnd", "ubnd", "vbhn", "hđqt")
def sentence_case(t):
    """Tiêu đề viết HOA toàn bộ -> chữ thường, giữ nguyên số hiệu và từ viết tắt."""
    letters = [c for c in t if c.isalpha()]
    if not letters or sum(c.isupper() for c in letters) / len(letters) < .7:
        return t
    s = t.lower()
    s = re.sub(r"\b\d+(?:/\d+)?/[\wđ\-]+", lambda m: m.group(0).upper(), s)
    s = re.sub(r"\b(" + "|".join(UPPER_WORDS) + r")\b", lambda m: m.group(1).upper(), s)
    s = re.sub(r"\bqh\d+\b", lambda m: m.group(0).upper(), s)
    s = re.sub(r"\bluật\b", "Luật", s)
    s = re.sub(r"\b(thông tư|nghị định|quyết định)\b(?= số)", lambda m: m.group(1).capitalize(), s)
    return s[:1].upper() + s[1:]

# ---------------------------------------------------------------- phân tích một văn bản
REF = re.compile(r"\[(\d+)\]")
HEAD_CHUONG = re.compile(r"^(Chương|CHƯƠNG)\s+[IVXLC\d]+\s*(?:[.:–-]\s*\S.*)?$")
HEAD_MUC = re.compile(r"^(Mục|MỤC)\s+\d+\s*(?:[.:–-]\s*\S.*)?$")
HEAD_DIEU = re.compile(r"^Điều\s*((?:\d\s*)+?)\s*\.\s*(.*)$")
HEAD_PL = re.compile(r"^(Phụ lục|PHỤ LỤC)", re.I)
PL_NUM = re.compile(r"^(Phụ lục|PHỤ LỤC)\s+(số\s+)?[IVXLC\d]+\b", re.I)
START = re.compile(r"^(THÔNG\s*TƯ|VĂN\s*BẢN\s*HỢP\s*NHẤT|NGHỊ\s*ĐỊNH|QUYẾT\s*ĐỊNH(?:\s+CỦA\s+THỐNG\s+ĐỐC\s+NGÂN\s+HÀNG\s+NHÀ\s+NƯỚC)?|LUẬT)\s*$", re.I)
STOP_TITLE = re.compile(r"^(THỐNG ĐỐC|CHÍNH PHỦ|QUỐC HỘI|Căn cứ|Theo đề nghị)", re.I)

def load(path):
    return BeautifulSoup(unicodedata.normalize("NFC", open(path, encoding="utf-8", errors="ignore").read()), "lxml")

def parse_full(path, flat_title=None):
    c = load(path).find(id="winchm_template_content")
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
    meta = {}
    start = next((i for i, b in enumerate(bl[:40]) if b[0] == "p" and START.match(strip(b[1]))), None)
    if start is not None:
        head_blocks, i = bl[:start], start + 1
        meta["loai_goc"] = re.sub(r" của thống đốc.*$", "", tidy(strip(bl[start][1])).lower()).capitalize()
    else:
        ci = next((i for i, b in enumerate(bl) if b[0] == "p" and strip(b[1]).startswith("Căn cứ")), None)
        head_blocks = bl[:ci] if ci is not None else bl[:4]
        i = ci if ci is not None else 0
    head = " ".join(strip(re.sub(r"</?(td|tr|table)[^>]*>", " ", b[1])) for b in head_blocks)
    m = re.search(r"[Ss]ố\s*:?\s*(\d+\s*/\s*(?:\d{4}\s*/\s*)?[^\s,;]+)", head)
    if m: meta["so_hieu"] = re.sub(r"\s+", "", m.group(1)).rstrip(".")
    m = re.search(r"ngày\s*(\d{1,2})\s*tháng\s*(\d{1,2})\s*năm\s*(\d{4})", head)
    if m: meta["ngay"] = f"{int(m.group(1)):02d}/{int(m.group(2)):02d}/{m.group(3)}"
    title_parts = []
    if start is not None:
        while i < len(bl) and bl[i][0] == "p" and bold_ratio(bl[i][1]) > .8 and not STOP_TITLE.match(strip(bl[i][1])) and len(title_parts) < 5:
            if not re.match(r"^[_\s]+$", strip(bl[i][1])): title_parts.append(tidy(strip(bl[i][1])))
            i += 1
        if not title_parts and i < len(bl) and bl[i][0] == "p":
            title_parts.append(tidy(strip(bl[i][1]))); i += 1
    else:
        # không có dòng "THÔNG TƯ": lấy tên từ câu "ban hành Thông tư <tên>" ở phần căn cứ
        for b in bl[i:i + 12]:
            m = re.search(r"ban hành\s+(Thông tư|Nghị định|Quyết định|Luật)\s+(.*?)\s*[.;]?$", strip(b[1]))
            if m:
                meta["loai_goc"] = m.group(1); title_parts.append(tidy(m.group(2))); break
    meta["tieu_de"] = sentence_case(tidy(" ".join(title_parts))) if title_parts else ""
    meta["tieu_de"] = meta["tieu_de"][:1].upper() + meta["tieu_de"][1:]
    # đoạn giữa tiêu đề và "Căn cứ": lịch sử sửa đổi (văn bản hợp nhất)
    lich_su = []
    if start is not None:
        while i < len(bl) and bl[i][0] == "p" and not STOP_TITLE.match(strip(bl[i][1])):
            if strip(bl[i][1]): lich_su.append(tidy(re.sub(r"<[^>]+>", "", bl[i][1])))
            i += 1
    body = bl[i:]

    chapters, can_cu, cur = [], [], dict(ch=None, art=None, mode=None)
    used = set()
    def uid(base):
        u, n = base, 1
        while u in used:
            n += 1; u = f"{base}-{n}"
        used.add(u); return u
    def new_chapter(title):
        cur["ch"] = dict(id=f"c{len(chapters)+1}", title=title, articles=[]); chapters.append(cur["ch"]); cur["art"] = None; cur["mode"] = "chuong"
    def last_no():
        a = cur["ch"]["articles"] if cur["ch"] else []
        a = [x for x in a if x.get("so")]
        return int(a[-1]["so"]) if a else 0
    def new_article(num, ten, refs):
        if cur["ch"] is None: new_chapter("")
        if int(num) <= 5 and last_no() >= 10 and int(num) < last_no():
            # đánh số lại từ đầu sau phần chính: đây là mẫu biểu/phụ lục không có tiêu đề -> không tách Điều
            new_chapter("Mẫu biểu kèm theo"); cur["ch"]["phu_luc"] = True
            cur["art"] = dict(id=uid(f"pl-{len(chapters)}"), so="", ten="", nd=[]); cur["ch"]["articles"].append(cur["art"]); cur["mode"] = None
            cur["art"]["nd"].append(["p", f"<b>Điều {num}. {html.escape(ten, quote=False)}</b>", ""]); return
        cur["art"] = dict(id=uid(f"dieu-{num}"), so=num, ten=ten, nd=[])
        if refs: cur["art"]["fn"] = refs
        cur["ch"]["articles"].append(cur["art"]); cur["mode"] = None
    def new_muc(t):
        if cur["ch"] is None: new_chapter("")
        cur["art"] = dict(id=uid(f"muc-{len(cur['ch']['articles'])}"), muc=t, ten="", nd=[]); cur["ch"]["articles"].append(cur["art"]); cur["mode"] = "muc"
    def push(item):
        (cur["art"]["nd"] if cur["art"] else can_cu).append(item)
    for b in body:
        kind, h = b[0], b[1]
        if kind == "t":
            cur["mode"] = None; push(["t", h, ""]); continue
        plain_raw = strip(h)
        refs = REF.findall(plain_raw)
        plain = tidy(REF.sub("", plain_raw))
        bold = bold_ratio(h)
        is_h = (kind == "h") or (bold > .85 and len(plain) < 300)
        in_pl = bool(cur["ch"] and cur["ch"].get("phu_luc"))
        short_ = len(plain) < 200
        if in_pl and not ((is_h and HEAD_PL.match(plain)) or (short_ and PL_NUM.match(plain))):
            # trong phụ lục (mẫu biểu) không tách chương/điều nữa
            if is_h and cur["mode"] == "pl" and cur["ch"].get("_n", 0) < 2 and plain:
                cur["ch"]["title"] = tidy(cur["ch"]["title"] + " — " + plain); cur["ch"]["_n"] = cur["ch"].get("_n", 0) + 1; continue
            if not plain and kind != "t": continue
            cur["mode"] = None
            push(["p", tidy(h), para_class(plain)]); continue
        short = len(plain) < 200
        if (is_h or short) and HEAD_CHUONG.match(plain): new_chapter(plain.replace(" – ", " — ", 1)); continue
        if (is_h and HEAD_PL.match(plain)) or (short and PL_NUM.match(plain)):
            new_chapter(plain); cur["ch"]["phu_luc"] = True
            cur["art"] = dict(id=uid(f"pl-{len(chapters)}"), so="", ten="", nd=[]); cur["ch"]["articles"].append(cur["art"]); cur["mode"] = "pl"; continue
        if (is_h or short) and HEAD_MUC.match(plain): new_muc(plain); continue
        # "<b>Điều 3.</b> Nội dung..." : chỉ số Điều in đậm, nội dung nằm cùng đoạn
        mb = re.match(r"^\s*<b>\s*Điều\s*((?:\d\s*)+?)\s*\.\s*</b>\s*(\S.*)$", h) if kind == "p" else None
        if mb:
            new_article(re.sub(r"\s+", "", mb.group(1)), "", refs)
            rest = mb.group(2)
            cur["art"]["nd"].append(["p", tidy(rest), para_class(strip(rest))]); continue
        m = HEAD_DIEU.match(plain) if (is_h or (len(plain) < 300 and not plain[0] in "“\"")) else None
        if m and (m.group(2).strip() or is_h):
            new_article(re.sub(r"\s+", "", m.group(1)), m.group(2).strip(), refs); continue
        upper_title = plain.isupper() and short and bool(plain)
        if (is_h or upper_title) and cur["mode"] in ("chuong", "muc", "pl") and plain:
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

    # Văn bản không có cấu trúc Điều (hỏi đáp, danh mục...): chia theo tiêu đề h1-h4
    if not any(a.get("so") for ch in chapters for a in ch["articles"]):
        secs, curs = [], dict(id="m-0", ten="", nd=[])
        flat_body = body
        for b in flat_body:
            if b[0] == "h":
                if curs["nd"] or curs["ten"]: secs.append(curs)
                curs = dict(id=f"m-{len(secs)+1}", ten=sentence_case(tidy(b[1])), nd=[])
            elif b[0] == "t": curs["nd"].append(["t", b[1], ""])
            else:
                if strip(b[1]): curs["nd"].append(["p", tidy(b[1]), para_class(strip(b[1]))])
        if curs["nd"] or curs["ten"]: secs.append(curs)
        if not meta["tieu_de"] and flat_title: meta["tieu_de"] = flat_title
        chapters, can_cu = ([dict(id="c1", title="", articles=secs)] if secs else []), []
    meta["chu_thich"] = notes
    if "so_hieu" not in meta:
        m = re.search(r"[Ss]ố\s*:?\s*(\d+/VBHN-NHNN)", " ".join(strip(b[1]) for b in bl))
        if m: meta["so_hieu"] = m.group(1)
    return meta, lich_su, [x for x in can_cu if x], chapters

DOC_RE = r"(?:Thông tư(?: liên tịch)?|Nghị định|Quyết định|Luật|Pháp lệnh)"
def timeline(paras):
    out = []
    for p in paras:
        m = re.search(r"(" + DOC_RE + r" số [\w/\-–Đđ]+)\s+ngày (\d+) tháng (\d+) năm (\d+)", p)
        if not m: continue
        f = lambda d, mo, y: f"{int(d):02d}/{int(mo):02d}/{y}"
        e = dict(so=m.group(1), ngay=f(*m.group(2, 3, 4)), mo_ta=p)
        h = re.search(r"có hiệu lực (?:thi hành )?kể từ ngày (\d+) tháng (\d+) năm (\d+)", p)
        if h: e["hieu_luc"] = f(*h.group(1, 2, 3))
        out.append(e)
    return out

# ---------------------------------------------------------------- mục lục help.hhc
def read_hhc():
    """Danh sách mục (có tệp) kèm nhóm cấp 1 / nhóm con. Trang nhóm ($$unsavedpage*) là trang trống nên bỏ qua."""
    t = open(os.path.join(SRC, "help.hhc"), encoding="utf-8", errors="ignore").read()
    ents, d, name, top, sub = [], 0, None, None, None
    for m in re.finditer(r"<UL>|</UL>|name=\"Name\" value=\"([^\"]*)\"|name=\"Local\" value=\"([^\"]*)\"", t, re.I):
        s = m.group(0).upper()
        if s == "<UL>": d += 1
        elif s == "</UL>": d -= 1
        elif m.group(1) is not None: name = html.unescape(m.group(1))
        else:
            local = html.unescape(m.group(2))
            if d == 1 and name not in ("Intro", "RELAX"):
                top, sub = name, None          # tiêu đề nhóm (có thể kèm trang trống)
            elif d == 2 and not local:
                sub = name                     # nhóm con
            elif local:
                ents.append(dict(d=d, name=name, local=local, top=top if d >= 2 else None, sub=sub if d >= 3 else None))
    return ents

def slug(s):
    s = unicodedata.normalize("NFD", s.replace("đ", "d").replace("Đ", "D"))
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")[:60]

def make_id(name, used):
    tok = name.split()[0]
    base = slug(tok) if re.match(r"^\d+[_-]", tok) else slug(name)
    u, n = base, 1
    while u in used:
        n += 1; u = f"{base}-{n}"
    used.add(u); return u

def js(obj):
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))

def plain_text(h):
    return strip(h)

if __name__ == "__main__":
    os.makedirs(os.path.join(OUT, "docs"), exist_ok=True)
    for f in os.listdir(os.path.join(OUT, "docs")):
        os.remove(os.path.join(OUT, "docs", f))
    group_by_raw = {raw: gid for gid, _, raw in GROUPS}
    ents = read_hhc()
    used, docs, search, problems, intro = set(), [], [], [], []
    for e in ents:
        if e["d"] == 1:
            if e["name"] == "Intro":
                intro = [strip(b[1]) for b in blocks(load(os.path.join(SRC, e["local"])).find(id="winchm_template_content")) if b[0] == "p"]
            continue
        if re.search(r"tom\s*tat", e["name"], re.I):
            continue   # bỏ phần tóm tắt theo yêu cầu
        path = os.path.join(SRC, e["local"])
        if not os.path.exists(path):
            problems.append(f"Không có tệp trong CHM: {e['name']}"); continue
        gid = group_by_raw.get(e["top"])
        did = make_id(e["name"], used)
        flat_title = None
        if gid == "hoi-dap":
            ps = [strip(b[1]) for b in blocks(load(path).find(id="winchm_template_content")) if b[0] == "p"]
            first = next((x for x in ps if len(x) >= 15 and not x.startswith("(")), e["name"])
            flat_title = sentence_case(tidy(first))
        meta, ls, cc, chapters = parse_full(path, flat_title)
        loai = meta.get("loai_goc", "")
        if gid == "hoi-dap":
            n = e["name"]
            loai = "Nội dung mới" if ("ATHT4" in n or "Mot so diem moi" in n) else ("Hỏi đáp" if "Hoi dap" in n else "Hướng dẫn")
        if "VBHN" in e["name"].upper().split()[0] and gid != "hoi-dap": loai = "Văn bản hợp nhất"
        if gid == "hoi-dap":
            meta["so_hieu"] = None; meta["tieu_de"] = flat_title
        if not meta.get("tieu_de"):
            meta["tieu_de"] = flat_title or tidy(e["name"].replace("_", " "))
            problems.append(f"Không đọc được tiêu đề, dùng tên mục lục: {e['name']}")
        if not meta.get("so_hieu") and gid != "hoi-dap":
            m = re.match(r"^(\d+)_VBHN-NHNN", e["name"])
            if m:
                meta["so_hieu"] = f"{m.group(1)}/VBHN-NHNN"      # văn bản hợp nhất không ghi số trong nội dung: lấy theo tên mục lục
                problems.append(f"Số hiệu lấy theo tên mục lục (nội dung không ghi): {meta['so_hieu']}")
            else:
                m = re.match(r"^(\d+)_(\d{4})_(QD|TT|ND)-([A-Za-z]+)", e["name"])
                if m:
                    meta["so_hieu"] = f"{m.group(1)}/{m.group(2)}/{ {'QD': 'QĐ', 'TT': 'TT', 'ND': 'NĐ'}[m.group(3)] }-{m.group(4)}"
                    problems.append(f"Số hiệu lấy theo tên mục lục (nội dung không ghi): {meta['so_hieu']}")
                else:
                    problems.append(f"Không đọc được số hiệu: {e['name']}")
        n_art = sum(1 for ch in chapters for a in ch["articles"] if a.get("so") or a.get("ten"))
        doc = dict(id=did, nhom=gid, nhom_con=SUBGROUPS.get(e["sub"]) if e["sub"] else None, loai=loai,
                   so_hieu=meta.get("so_hieu"), ngay=meta.get("ngay"), tieu_de=meta["tieu_de"],
                   can_cu=cc, lich_su=ls, dong_thoi_gian=timeline(ls), chuong=chapters, chu_thich=meta["chu_thich"])
        docs.append(doc)
        idx = len(docs) - 1
        for ch in chapters:
            for a in ch["articles"]:
                text = " ".join(plain_text(b[1]) for b in a["nd"])
                if not text and not a.get("ten"): continue
                label = ("Điều " + a["so"]) if a.get("so") else (a.get("muc") or "Nội dung")
                title = a.get("ten", "")
                chap = ch["title"].split(" — ")[0] or "Nội dung"
                search.append([idx, a["id"], label, title, text, chap])
        with open(os.path.join(OUT, "docs", did + ".js"), "w", encoding="utf-8") as f:
            f.write("(window.__docs=window.__docs||{})[" + js(did) + "]=" + js(doc) + ";\n")
        print(f"{did:48} {loai:18} {meta.get('so_hieu') or '-':20} {meta.get('ngay') or '-':11} Điều/mục {n_art:3}  {meta['tieu_de'][:60]}")

    counts = {}
    for d in docs: counts[d["nhom"]] = counts.get(d["nhom"], 0) + 1
    catalog = dict(
        groups=[dict(id=i, ten=ten, n=counts.get(i, 0)) for i, ten, _ in GROUPS],
        docs=[dict(id=d["id"], nhom=d["nhom"], nhom_con=d["nhom_con"], loai=d["loai"], so_hieu=d["so_hieu"], ngay=d["ngay"], tieu_de=d["tieu_de"],
                   n=sum(1 for c in d["chuong"] for a in c["articles"] if a.get("so")), ls=bool(d["dong_thoi_gian"])) for d in docs],
        gioi_thieu=intro)
    open(os.path.join(OUT, "catalog.js"), "w", encoding="utf-8").write("window.CATALOG=" + js(catalog) + ";\n")
    open(os.path.join(OUT, "search.js"), "w", encoding="utf-8").write("window.SEARCH_INDEX=" + js(search) + ";\n")
    print(f"\nTổng: {len(docs)} văn bản, {len(search)} mục tìm kiếm")
    for p in problems: print("LƯU Ý:", p)
