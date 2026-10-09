/* Phần mềm tra cứu văn bản điện tử QTDND — ứng dụng tĩnh, không cần máy chủ. */
(function () {
  "use strict";
  var DATA = window.APP_DATA;
  var $app = document.getElementById("app");
  var root = document.documentElement;

  /* ---------- Tiện ích ---------- */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  // Bỏ dấu tiếng Việt nhưng GIỮ NGUYÊN độ dài chuỗi để ánh xạ vị trí khi tô sáng.
  function fold(s) {
    s = String(s).normalize("NFC");
    var out = "";
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (c === "đ" || c === "Đ") { out += "d"; continue; }
      out += c.normalize("NFD")[0].toLowerCase();
    }
    return out;
  }
  function plain(html) {
    var d = document.createElement("div");
    d.innerHTML = html;
    return d.textContent.replace(/\s+/g, " ").trim();
  }
  // Khớp theo ĐẦU TỪ (đã bỏ dấu): "hoi" khớp "hội" nhưng không khớp "thời".
  function findWord(f, t, from) {
    var i = f.indexOf(t, from || 0);
    while (i > 0 && /[a-z0-9]/.test(f[i - 1])) i = f.indexOf(t, i + 1);
    return i;
  }
  function termRe(terms) {
    return new RegExp("(^|[^a-z0-9])(" + terms.map(reEsc).sort(function (a, b) { return b.length - a.length; }).join("|") + ")", "g");
  }
  function reEsc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  function toast(msg) {
    var t = document.getElementById("toast");
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("show"); }, 1800);
  }
  function docById(id) { return DATA.docs.filter(function (d) { return d.id === id; })[0]; }
  function groupById(id) { return DATA.groups.filter(function (g) { return g.id === id; })[0]; }
  function fmtTitle(t) { return t.charAt(0).toUpperCase() + t.slice(1); }
  function docName(d) { return d.loai + " " + d.so_hieu; }

  /* ---------- Chủ đề sáng/tối & cỡ chữ ---------- */
  var theme = store("theme");
  if (theme === "light" || theme === "dark") root.setAttribute("data-theme", theme);
  document.getElementById("themeBtn").addEventListener("click", function () {
    var dark = root.getAttribute("data-theme") === "dark" ||
      (!root.getAttribute("data-theme") && matchMedia("(prefers-color-scheme: dark)").matches);
    var next = dark ? "light" : "dark";
    root.setAttribute("data-theme", next); store("theme", next);
  });
  var readScale = parseFloat(store("read")) || 1;
  function setScale(v) {
    readScale = Math.min(1.5, Math.max(.85, v));
    root.style.setProperty("--read", readScale); store("read", String(readScale));
  }
  setScale(readScale);

  /* ---------- Chỉ mục tìm kiếm ---------- */
  var INDEX = [];
  DATA.docs.forEach(function (d) {
    d.chuong.forEach(function (c) {
      c.articles.forEach(function (a) {
        if (!a.nd.length && !a.ten) return;
        var text = a.nd.map(function (b) { return plain(b[1]); }).join(" ");
        var label = a.so ? "Điều " + a.so : (a.muc || c.title.split(" — ")[0]);
        var title = a.so ? a.ten : (a.ten || c.title.split(" — ").slice(1).join(" — "));
        INDEX.push({ doc: d, anchor: a.id, label: label, title: title, text: text,
          chapter: c.title.split(" — ")[0], ft: fold(title), fx: fold(text) });
      });
    });
  });
  var TOTAL_ARTICLES = INDEX.length;

  function search(q, docId) {
    var terms = fold(q).split(/\s+/).filter(Boolean);
    if (!terms.length) return { terms: terms, hits: [] };
    var phrase = terms.join(" ");
    var hits = [];
    INDEX.forEach(function (it) {
      if (docId && it.doc.id !== docId) return;
      var hay = it.ft + " " + it.fx + " " + fold(it.doc.so_hieu);
      for (var i = 0; i < terms.length; i++) if (findWord(hay, terms[i]) < 0) return;
      var score = 0;
      terms.forEach(function (t) {
        if (findWord(it.ft, t) >= 0) score += 6;
        var n = 0, p = -1; while ((p = findWord(it.fx, t, p + 1)) >= 0 && n < 8) n++;
        score += n;
      });
      if (it.ft.indexOf(phrase) >= 0) score += 12;
      if (it.fx.indexOf(phrase) >= 0) score += 6;
      hits.push({ it: it, score: score });
    });
    hits.sort(function (a, b) { return b.score - a.score; });
    return { terms: terms, hits: hits };
  }
  function highlightHtml(text, terms) {
    var f = fold(text), re = termRe(terms);
    var out = "", last = 0, m;
    while ((m = re.exec(f))) {
      var st = m.index + m[1].length, en = st + m[2].length;
      out += esc(text.slice(last, st)) + "<mark>" + esc(text.slice(st, en)) + "</mark>";
      last = en;
    }
    return out + esc(text.slice(last));
  }
  function snippet(it, terms) {
    var f = it.fx, pos = -1;
    for (var i = 0; i < terms.length; i++) { var p = findWord(f, terms[i]); if (p >= 0 && (pos < 0 || p < pos)) pos = p; }
    if (pos < 0) pos = 0;
    var s = Math.max(0, pos - 70), e = Math.min(it.text.length, pos + 190);
    return (s > 0 ? "… " : "") + highlightHtml(it.text.slice(s, e), terms) + (e < it.text.length ? " …" : "");
  }
  function markTerms(rootEl, terms) {
    if (!terms.length) return 0;
    var re = termRe(terms);
    var walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, null);
    var nodes = [], n;
    while ((n = walker.nextNode())) { if (!n.parentNode.closest("mark, button")) nodes.push(n); }
    var count = 0;
    nodes.forEach(function (node) {
      var text = node.nodeValue, f = fold(text), m, last = 0, frag = null;
      re.lastIndex = 0;
      while ((m = re.exec(f))) {
        var st = m.index + m[1].length, en = st + m[2].length;
        frag = frag || document.createDocumentFragment();
        frag.appendChild(document.createTextNode(text.slice(last, st)));
        var mk = document.createElement("mark"); mk.textContent = text.slice(st, en);
        frag.appendChild(mk); last = en; count++;
      }
      if (frag) { frag.appendChild(document.createTextNode(text.slice(last))); node.parentNode.replaceChild(frag, node); }
    });
    return count;
  }

  /* ---------- Định tuyến ---------- */
  var state = { docId: null, tab: null };
  function parseHash() {
    var h = location.hash.replace(/^#/, "") || "/";
    var qi = h.indexOf("?"), q = new URLSearchParams(qi >= 0 ? h.slice(qi + 1) : "");
    var path = (qi >= 0 ? h.slice(0, qi) : h).split("/").filter(Boolean).map(decodeURIComponent);
    return { path: path, q: q };
  }
  function go(h) { location.hash = h; }
  function route() {
    closeToc(); hideFn();
    var r = parseHash(), p = r.path;
    if (p[0] === "vb" && p[1] && docById(p[1])) return viewDoc(docById(p[1]), p[2] || "", r.q.get("q") || "");
    state.docId = null; window.removeEventListener("scroll", onScroll);
    document.getElementById("progress").style.width = "0";
    if (p[0] === "nhom" && p[1] && groupById(p[1])) viewGroup(groupById(p[1]));
    else if (p[0] === "tim") viewSearch(r.q.get("q") || "", r.q.get("vb") || "");
    else viewHome();
    document.title = "Phần mềm tra cứu văn bản điện tử QTDND";
    window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", route);

  /* ---------- Trang chủ ---------- */
  var SUGGEST = ["quỹ bảo đảm an toàn hệ thống", "chấp thuận thay đổi", "hồ sơ nhân sự", "đại hội thành viên", "giấy phép"];
  function searchBox(cls, id, val, ph) {
    return '<form class="search ' + cls + '" data-search autocomplete="off" role="search">' +
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>' +
      '<input id="' + id + '" type="search" value="' + esc(val || "") + '" placeholder="' + esc(ph) + '" aria-label="Tìm kiếm"></form>';
  }
  function docCard(d) {
    var g = groupById(d.nhom);
    return '<a class="dcard" href="#/vb/' + d.id + '">' +
      '<div class="dmeta"><span class="tag">' + esc(d.loai) + '</span><b>' + esc(d.so_hieu) + '</b>' +
      (d.ngay ? '<span>· ' + esc(d.ngay) + '</span>' : '') + '</div>' +
      '<h3>' + esc(fmtTitle(d.tieu_de)) + '</h3>' +
      '<div class="dmeta"><span class="tag line">' + esc(g.ten) + '</span>' +
      (d.dong_thoi_gian.length ? '<span class="tag alt">Lịch sử sửa đổi</span>' : '') + '</div>' +
      '<span class="go">Đọc văn bản →</span></a>';
  }
  function viewHome() {
    var inEbook = DATA.groups.reduce(function (s, g) { return s + g.tong; }, 0);
    var html = '<section class="hero"><h1>Tra cứu văn bản QTDND nhanh, rõ, dễ đọc</h1>' +
      '<p>Gõ từ khóa — không cần gõ dấu — để tìm trong từng Điều của toàn bộ văn bản.</p>' +
      searchBox("search-hero", "heroQ", "", "Ví dụ: đại hội thành viên") +
      '<div class="chips"><small>Thử tìm:</small>' +
      SUGGEST.map(function (s) { return '<a class="chip" href="#/tim?q=' + encodeURIComponent(s) + '">' + esc(s) + '</a>'; }).join("") + '</div>' +
      '<div class="stats"><div><b>' + DATA.groups.length + '</b>nhóm chủ đề</div><div><b>' + DATA.docs.length + '</b>văn bản trong bản mẫu</div>' +
      '<div><b>' + TOTAL_ARTICLES + '</b>Điều/mục có thể tra cứu</div><div><b>' + inEbook + '</b>mục trong Ebook gốc</div></div></section>';
    html += '<div class="section-h"><h2>Văn bản trong bản mẫu</h2><span>Bản đầy đủ sẽ bổ sung sau khi duyệt giao diện</span></div>' +
      '<div class="docs">' + DATA.docs.map(docCard).join("") + '</div>';
    html += '<div class="section-h"><h2>Nhóm chủ đề</h2><span>Theo mục lục Ebook</span></div><div class="grid">' +
      DATA.groups.map(function (g, i) {
        var n = DATA.docs.filter(function (d) { return d.nhom === g.id; }).length;
        return '<a class="gcard ' + (n ? "" : "empty") + '" href="#/nhom/' + g.id + '"><span class="gicon">' + (i + 1) + '</span><span><b>' + esc(g.ten) + '</b>' +
          '<small>' + g.tong + ' mục trong Ebook · ' + (n ? '<span class="ok">' + n + ' đã có trong bản mẫu</span>' : 'sẽ bổ sung') + '</small></span></a>';
      }).join("") + '</div>';
    $app.innerHTML = html;
  }

  function viewGroup(g) {
    var ds = DATA.docs.filter(function (d) { return d.nhom === g.id; });
    $app.innerHTML = '<div class="crumbs"><a href="#/">Trang chủ</a> › Nhóm chủ đề</div><h1 class="pagetitle">' + esc(g.ten) + '</h1>' +
      '<p class="note" style="margin:10px 0 18px">Mục lục Ebook gốc có ' + g.tong + ' mục trong nhóm này.</p>' +
      (ds.length ? '<div class="docs">' + ds.map(docCard).join("") + '</div>'
        : '<div class="note">Nhóm này chưa có văn bản trong bản mẫu; sẽ được bổ sung ở bước làm đầy đủ.</div>');
    document.title = g.ten + " — Tra cứu văn bản QTDND";
  }

  /* ---------- Tìm kiếm ---------- */
  function viewSearch(q, docId) {
    $app.innerHTML = '<div class="crumbs"><a href="#/">Trang chủ</a> › Tìm kiếm</div>' +
      searchBox("bigsearch", "bigQ", q, "Nhập từ khóa (không cần gõ dấu)…") +
      '<div class="filters" id="filters"></div><p class="note" id="rcount" style="margin-top:14px"></p><div class="results" id="results"></div>';
    var input = document.getElementById("bigQ"), cur = docId;
    function draw() {
      var qv = input.value.trim(), res = search(qv, cur), box = document.getElementById("results");
      var all = search(qv, "");
      var f = '<button type="button" aria-pressed="' + (!cur) + '" data-d="">Tất cả (' + all.hits.length + ')</button>';
      DATA.docs.forEach(function (d) {
        var n = all.hits.filter(function (h) { return h.it.doc.id === d.id; }).length;
        if (n) f += '<button type="button" aria-pressed="' + (cur === d.id) + '" data-d="' + d.id + '">' + esc(d.so_hieu) + ' (' + n + ')</button>';
      });
      document.getElementById("filters").innerHTML = qv ? f : "";
      document.getElementById("rcount").textContent = !qv ? "Nhập từ khóa để tìm trong " + TOTAL_ARTICLES + " Điều/mục của " + DATA.docs.length + " văn bản."
        : (res.hits.length ? "Tìm thấy " + res.hits.length + " kết quả" + (res.hits.length > 60 ? " (hiển thị 60 kết quả đầu)" : "") + "."
          : "Không tìm thấy kết quả. Thử dùng từ khóa ngắn hơn hoặc ít từ hơn.");
      box.innerHTML = res.hits.slice(0, 60).map(function (h) {
        var it = h.it, href = "#/vb/" + it.doc.id + "/" + it.anchor + "?q=" + encodeURIComponent(qv);
        return '<a class="res" href="' + href + '"><div class="dmeta"><span class="tag">' + esc(it.doc.loai) + '</span><b>' + esc(it.doc.so_hieu) + '</b>' +
          '<span>· ' + esc(it.chapter) + '</span></div><div class="rt">' + esc(it.label) + (it.title ? '. ' + highlightHtml(it.title, res.terms) : '') +
          '</div><div class="rs">' + snippet(it, res.terms) + '</div></a>';
      }).join("");
      history.replaceState(null, "", "#/tim?q=" + encodeURIComponent(qv) + (cur ? "&vb=" + cur : ""));
    }
    var t;
    input.addEventListener("input", function () { clearTimeout(t); t = setTimeout(draw, 120); });
    document.getElementById("filters").addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return; cur = b.getAttribute("data-d"); draw();
    });
    draw(); input.focus();
    document.title = (q ? q + " — " : "") + "Tìm kiếm văn bản QTDND";
  }

  /* ---------- Trang văn bản ---------- */
  var tocObserver = null;
  function withFn(htmlStr, notes) {
    return htmlStr.replace(/\[(\d+)\]/g, function (m, n) {
      return notes[n] ? '<sup class="fn"><button type="button" data-n="' + n + '" aria-label="Chú thích ' + n + '">' + n + '</button></sup>' : m;
    });
  }
  function block(b, notes) {
    if (b[0] === "t") return '<div class="table-wrap">' + b[1] + '</div>';
    if (b[0] === "h") return '<h3>' + esc(plain(b[1])) + '</h3>';
    var cls = b[2] === "k" ? "khoan" : b[2] === "d" ? "diem" : b[2] === "g" ? "g" : "";
    return '<p' + (cls ? ' class="' + cls + '"' : '') + '>' + withFn(b[1], notes) + '</p>';
  }
  function renderFull(d) {
    var notes = d.chu_thich || {};
    var h = "";
    if (d.can_cu.length) h += '<details class="cancu"><summary>Căn cứ ban hành</summary><div>' + d.can_cu.map(function (b) { return block(b, notes); }).join("") + '</div></details>';
    d.chuong.forEach(function (c) {
      var parts = c.title.split(" — "), lab = parts[0], rest = parts.slice(1).join(" — ");
      h += '<section class="chuong' + (c.phu_luc ? ' pl' : '') + '" id="' + c.id + '">';
      if (c.title) h += '<h2 class="chuong-t"><small>' + esc(rest ? lab : (c.phu_luc ? "Phụ lục" : "Phần")) + '</small>' + esc(rest || lab) + '</h2>';
      c.articles.forEach(function (a) {
        if (a.muc) { h += '<h3 class="muc-t" id="' + a.id + '"><span>' + esc(a.muc) + '</span>' + esc(a.ten) + '</h3>'; return; }
        h += '<article class="dieu" id="' + a.id + '">';
        if (a.so) h += '<h3><span class="dieu-no">Điều ' + esc(a.so) + '</span><span class="dieu-ten">' + esc(a.ten) +
          (a.fn ? a.fn.map(function (n) { return notes[n] ? withFn("[" + n + "]", notes) : ""; }).join("") : "") +
          '</span><button class="copy" type="button" data-copy="' + a.id + '" title="Sao chép liên kết tới Điều này">Sao chép liên kết</button></h3>';
        h += a.nd.map(function (b) { return block(b, notes); }).join("") + '</article>';
      });
      h += '</section>';
    });
    return h;
  }
  function renderTimeline(d) {
    var items = d.dong_thoi_gian.map(function (t) {
      var so = t.so.replace(/^Thông tư số /, ""), target = DATA.docs.filter(function (x) { return x.so_hieu === so; })[0];
      return '<li class="tl"><div class="tl-card"><h4>' + (target ? '<a href="#/vb/' + target.id + '">' + esc(t.so) + '</a>' : esc(t.so)) + '</h4>' +
        '<div class="tl-dates"><span>Ban hành: <b>' + esc(t.ngay) + '</b></span><span>Có hiệu lực: <b>' + esc(t.hieu_luc) + '</b></span></div><p>' + esc(t.mo_ta) + '</p></div></li>';
    }).join("");
    return '<div class="disclaimer">Các mốc dưới đây được lấy từ phần mở đầu của văn bản hợp nhất.</div><ol class="timeline">' + items +
      '<li class="tl cur"><div class="tl-card"><h4>' + esc(docName(d)) + '</h4><p>Văn bản hợp nhất hiện đang xem.</p></div></li></ol>';
  }
  function renderToc(d, tab) {
    if (tab !== "toan-van") return "";
    var h = '<h2>Mục lục</h2><input type="search" id="tocQ" placeholder="Lọc Điều…" aria-label="Lọc mục lục">';
    d.chuong.forEach(function (c, i) {
      var parts = c.title.split(" — "), lab = parts[0], rest = parts.slice(1).join(" — ");
      if (!c.title && c.articles.length < 1) return;
      h += '<details open data-c="' + c.id + '"><summary>' + esc(c.title ? (rest ? lab + " · " + rest : lab) : "Nội dung") + '</summary>';
      c.articles.forEach(function (a) {
        if (a.muc) h += '<a class="mucl" href="#/vb/' + d.id + '/' + a.id + '" data-t="' + esc(fold(a.muc + " " + a.ten)) + '">' + esc(a.muc) + '</a>';
        else if (a.so) h += '<a href="#/vb/' + d.id + '/' + a.id + '" data-id="' + a.id + '" data-t="' + esc(fold("dieu " + a.so + " " + a.ten)) + '">Điều ' + esc(a.so) + '. ' + esc(a.ten) + '</a>';
      });
      h += '</details>';
    });
    h += '<div class="none" id="tocNone" hidden>Không có Điều phù hợp.</div>';
    return h;
  }
  function viewDoc(d, sub, q) {
    var tab = sub === "lich-su" && d.dong_thoi_gian.length ? "lich-su" : "toan-van";
    var anchor = tab === "toan-van" ? sub : "";
    if (state.docId === d.id && state.tab === tab && tab === "toan-van" && !q) { scrollToAnchor(anchor, true); return; }
    state.docId = d.id; state.tab = tab;
    var base = "#/vb/" + d.id, g = groupById(d.nhom);
    var tabs = '<nav class="tabs" aria-label="Chế độ xem"><a href="' + base + '"' + (tab === "toan-van" ? ' aria-current="page"' : '') + '>Toàn văn</a>' +
      (d.dong_thoi_gian.length ? '<a href="' + base + '/lich-su"' + (tab === "lich-su" ? ' aria-current="page"' : '') + '>Lịch sử sửa đổi</a>' : '') + '</nav>';
    var related = DATA.docs.filter(function (x) { return x.nhom === d.nhom && x.id !== d.id; });
    var tocHtml = renderToc(d, tab);
    if (related.length) tocHtml += '<div class="related"><h2>Cùng nhóm</h2>' + related.map(function (x) { return '<a href="#/vb/' + x.id + '">' + esc(docName(x)) + '</a>'; }).join("") + '</div>';
    var body = tab === "toan-van" ? renderFull(d) : renderTimeline(d);
    $app.innerHTML =
      '<div class="crumbs"><a href="#/">Trang chủ</a> › <a href="#/nhom/' + g.id + '">' + esc(g.ten) + '</a></div>' +
      '<section class="dochead"><span class="tag">' + esc(d.loai) + '</span><h1>' + esc(fmtTitle(d.tieu_de)) + '</h1><div class="facts">' +
      '<span>Số hiệu: <b>' + esc(d.so_hieu || "—") + '</b></span>' + (d.ngay ? '<span>Ngày ban hành: <b>' + esc(d.ngay) + '</b></span>' : '') +
      '<span>Nhóm: <b>' + esc(g.ten) + '</b></span></div></section>' + tabs +
      '<div class="layout"><aside class="toc" id="toc" aria-label="Mục lục">' + tocHtml + '</aside><div class="reader">' +
      '<div class="toolbar">' + (tab === "toan-van" ? '<button class="btn toc-btn" id="tocOpen" type="button">☰ Mục lục</button>' : '') +
      '<span class="grow"></span><button class="btn" type="button" id="fMinus" aria-label="Giảm cỡ chữ">A−</button><button class="btn" type="button" id="fPlus" aria-label="Tăng cỡ chữ">A+</button>' +
      '<button class="btn" type="button" onclick="window.print()">In</button></div>' +
      '<div id="hlbar"></div><div class="paper" id="paper">' + body + '</div></div></div>';
    document.title = docName(d) + " — Tra cứu văn bản QTDND";
    if (!document.getElementById("toc").children.length) { document.getElementById("toc").hidden = true; document.querySelector(".layout").classList.add("no-toc"); }
    var terms = q ? fold(q).split(/\s+/).filter(Boolean) : [];
    if (terms.length) {
      var n = markTerms(document.getElementById("paper"), terms);
      document.getElementById("hlbar").innerHTML = '<div class="hl-bar"><span>Đang tô sáng “' + esc(q) + '” (' + n + ' vị trí)</span><span class="grow"></span><a class="btn" href="#/tim?q=' + encodeURIComponent(q) + '">← Về kết quả tìm</a><button class="btn" type="button" id="hlOff">Bỏ tô sáng</button></div>';
      document.getElementById("hlOff").addEventListener("click", function () {
        document.querySelectorAll("#paper mark").forEach(function (m) { m.replaceWith(document.createTextNode(m.textContent)); });
        document.getElementById("paper").normalize(); document.getElementById("hlbar").innerHTML = "";
      });
    }
    wireDoc(d, tab);
    if (anchor || terms.length) scrollToAnchor(anchor || firstMarkId(), false);
    else window.scrollTo(0, 0);
    window.addEventListener("scroll", onScroll, { passive: true }); onScroll();
  }
  function firstMarkId() { var m = document.querySelector("#paper mark"); return m ? "__mark" : ""; }
  function scrollToAnchor(id, smooth) {
    var el = id === "__mark" ? document.querySelector("#paper mark") : (id && document.getElementById(id));
    if (!el) { if (!id) window.scrollTo(0, 0); return; }
    el.scrollIntoView({ behavior: smooth ? "smooth" : "instant", block: id === "__mark" ? "center" : "start" });
    var art = el.closest(".dieu") || el;
    art.classList.remove("flash"); void art.offsetWidth; art.classList.add("flash");
  }
  function openToc() {
    var toc = document.getElementById("toc"); if (!toc) return;
    toc.classList.add("open");
    if (!document.querySelector(".scrim")) { var s = document.createElement("div"); s.className = "scrim"; s.addEventListener("click", closeToc); document.body.appendChild(s); }
  }
  function closeToc() {
    var toc = document.getElementById("toc"); if (toc) toc.classList.remove("open");
    var s = document.querySelector(".scrim"); if (s) s.remove();
  }
  function wireDoc(d, tab) {
    var open = document.getElementById("tocOpen"); if (open) open.addEventListener("click", openToc);
    document.getElementById("fMinus").addEventListener("click", function () { setScale(readScale - .07); });
    document.getElementById("fPlus").addEventListener("click", function () { setScale(readScale + .07); });
    var tq = document.getElementById("tocQ");
    if (tq) tq.addEventListener("input", function () {
      var terms = fold(tq.value).split(/\s+/).filter(Boolean), shown = 0;
      document.querySelectorAll("#toc a[data-t]").forEach(function (a) {
        var ok = terms.every(function (t) { return a.getAttribute("data-t").indexOf(t) >= 0; });
        a.hidden = !ok; if (ok) shown++;
      });
      document.querySelectorAll("#toc details").forEach(function (dt) { dt.hidden = terms.length && !dt.querySelector("a:not([hidden])"); if (terms.length) dt.open = true; });
      document.getElementById("tocNone").hidden = !!shown || !terms.length;
    });
    if (tab === "toan-van") {
      var links = {};
      document.querySelectorAll("#toc a[data-id]").forEach(function (a) { links[a.getAttribute("data-id")] = a; a.addEventListener("click", closeToc); });
      document.querySelectorAll("#toc a.mucl").forEach(function (a) { a.addEventListener("click", closeToc); });
      if (tocObserver) tocObserver.disconnect();
      tocObserver = new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          if (!e.isIntersecting) return;
          var a = links[e.target.id]; if (!a) return;
          document.querySelectorAll("#toc a.active").forEach(function (x) { x.classList.remove("active"); });
          a.classList.add("active");
          if (!document.getElementById("tocQ").value && a.getBoundingClientRect().bottom > innerHeight || a.getBoundingClientRect().top < 60) a.scrollIntoView({ block: "nearest" });
        });
      }, { rootMargin: "-80px 0px -70% 0px" });
      document.querySelectorAll(".dieu").forEach(function (el) { tocObserver.observe(el); });
    }
  }
  function onScroll() {
    var h = document.documentElement, max = h.scrollHeight - h.clientHeight;
    document.getElementById("progress").style.width = (max > 0 ? Math.min(100, h.scrollTop / max * 100) : 0) + "%";
  }

  /* ---------- Sao chép liên kết & chú thích ---------- */
  document.addEventListener("click", function (e) {
    var c = e.target.closest("[data-copy]");
    if (c) {
      var url = location.href.split("#")[0] + "#/vb/" + state.docId + "/" + c.getAttribute("data-copy");
      var done = function () { toast("Đã sao chép liên kết"); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { fallbackCopy(url); done(); });
      else { fallbackCopy(url); done(); }
      return;
    }
    var f = e.target.closest("sup.fn button");
    if (f) { showFn(f); return; }
    if (!e.target.closest("#fnpop")) hideFn();
  });
  function fallbackCopy(t) {
    var ta = document.createElement("textarea"); ta.value = t; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch (e) {} ta.remove();
  }
  function showFn(btn) {
    var d = docById(state.docId), n = btn.getAttribute("data-n"), pop = document.getElementById("fnpop");
    if (!pop.hidden && pop.getAttribute("data-n") === n && pop._btn === btn) { hideFn(); return; }
    pop.innerHTML = "<b>Chú thích [" + esc(n) + "]</b><br>" + esc(d.chu_thich[n] || "");
    pop.setAttribute("data-n", n); pop._btn = btn; pop.hidden = false;
    var r = btn.getBoundingClientRect(), x = Math.max(12, Math.min(r.left + scrollX, scrollX + innerWidth - pop.offsetWidth - 12));
    pop.style.left = x + "px"; pop.style.top = (r.bottom + scrollY + 8) + "px";
  }
  function hideFn() { var p = document.getElementById("fnpop"); if (p) p.hidden = true; }
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { hideFn(); closeToc(); }
    if (e.key === "/" && !/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) { e.preventDefault(); (document.getElementById("bigQ") || document.getElementById("heroQ") || document.getElementById("topQ")).focus(); }
  });

  /* ---------- Ô tìm kiếm ---------- */
  document.addEventListener("submit", function (e) {
    var f = e.target.closest("[data-search], #topSearch"); if (!f) return;
    e.preventDefault();
    var v = f.querySelector("input").value.trim();
    if (f.id === "topSearch") f.querySelector("input").blur();
    go("#/tim?q=" + encodeURIComponent(v));
  });

  route();
})();
