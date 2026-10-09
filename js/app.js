/* Phần mềm tra cứu văn bản điện tử QTDND — ứng dụng tĩnh, không cần máy chủ.
 * Dữ liệu: data/catalog.js (nạp ngay), data/docs/<id>.js (nạp khi mở văn bản), data/search.js (nạp khi tìm). */
(function () {
  "use strict";
  var CAT = window.CATALOG;
  var $app = document.getElementById("app");
  var root = document.documentElement;
  var PAGE = 40;      // số kết quả / dòng mỗi lần "Hiện thêm"

  /* ---------- Tiện ích ---------- */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  // Bỏ dấu tiếng Việt nhưng GIỮ NGUYÊN độ dài chuỗi để ánh xạ vị trí khi tô sáng.
  var FC = {};
  function fold(s) {
    s = String(s).normalize("NFC");
    var out = "";
    for (var i = 0; i < s.length; i++) {
      var c = s[i], r = FC[c];
      if (r === undefined) {
        r = (c === "đ" || c === "Đ") ? "d" : c.normalize("NFD")[0].toLowerCase();
        FC[c] = r;
      }
      out += r;
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
  function reEsc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  function termRe(terms) {
    return new RegExp("(^|[^a-z0-9])(" + terms.map(reEsc).sort(function (a, b) { return b.length - a.length; }).join("|") + ")", "g");
  }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  function toast(msg) {
    var t = document.getElementById("toast");
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("show"); }, 1800);
  }
  function catDoc(id) { return CAT.docs.filter(function (d) { return d.id === id; })[0]; }
  function groupById(id) { return CAT.groups.filter(function (g) { return g.id === id; })[0]; }
  function docName(d) { return d.so_hieu ? d.loai + " " + d.so_hieu : d.tieu_de; }
  function dateKey(s) { var m = /^(\d+)\/(\d+)\/(\d+)$/.exec(s || ""); return m ? m[3] + m[2] + m[1] : ""; }
  CAT.docs.forEach(function (d) { d.f = fold([d.tieu_de, d.so_hieu || "", d.loai].join(" ")); d.i = CAT.docs.indexOf(d); });

  /* ---------- Nạp tệp dữ liệu theo nhu cầu ---------- */
  var loading = {};
  function loadScript(src) {
    if (loading[src]) return loading[src];
    loading[src] = new Promise(function (ok, fail) {
      var s = document.createElement("script");
      s.src = src; s.onload = ok;
      s.onerror = function () { delete loading[src]; fail(new Error("Không tải được " + src)); };
      document.head.appendChild(s);
    });
    return loading[src];
  }
  function loadDoc(id) {
    var w = window.__docs = window.__docs || {};
    if (w[id]) return Promise.resolve(w[id]);
    return loadScript("data/docs/" + id + ".js").then(function () { return w[id]; });
  }
  var INDEX = null;
  function loadIndex() {
    if (INDEX) return Promise.resolve(INDEX);
    return loadScript("data/search.js").then(function () {
      INDEX = window.SEARCH_INDEX.map(function (r) {
        return { d: CAT.docs[r[0]], anchor: r[1], label: r[2], title: r[3], text: r[4], chapter: r[5], ft: fold(r[3]), fx: fold(r[4]) };
      });
      window.SEARCH_INDEX = null;
      return INDEX;
    });
  }
  function errorView(msg) {
    $app.innerHTML = '<div class="note" style="margin-top:20px"><b>Có lỗi khi tải dữ liệu.</b><br>' + esc(msg) +
      '<br>Hãy giữ nguyên cấu trúc thư mục (index.html, css, js, data) và mở lại trang.</div>';
  }

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

  /* ---------- Tìm kiếm ---------- */
  function search(q, opt) {
    var terms = fold(q).split(/\s+/).filter(Boolean);
    if (!terms.length) return { terms: terms, hits: [], docs: [] };
    var phrase = terms.join(" "), hits = [];
    INDEX.forEach(function (it) {
      if (opt.vb && it.d.id !== opt.vb) return;
      var hay = it.ft + " " + it.fx + " " + (it.d.so_hieu ? fold(it.d.so_hieu) : "");
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
    var docs = opt.vb ? [] : CAT.docs.filter(function (d) {
      return terms.every(function (t) { return findWord(d.f, t) >= 0; });
    }).slice(0, 8);
    return { terms: terms, hits: hits, docs: docs };
  }
  function highlightHtml(text, terms) {
    var f = fold(text), re = termRe(terms), out = "", last = 0, m;
    while ((m = re.exec(f))) {
      var st = m.index + m[1].length, en = st + m[2].length;
      out += esc(text.slice(last, st)) + "<mark>" + esc(text.slice(st, en)) + "</mark>";
      last = en;
    }
    return out + esc(text.slice(last));
  }
  function snippet(it, terms) {
    var pos = -1;
    for (var i = 0; i < terms.length; i++) { var p = findWord(it.fx, terms[i]); if (p >= 0 && (pos < 0 || p < pos)) pos = p; }
    if (pos < 0) pos = 0;
    var s = Math.max(0, pos - 70), e = Math.min(it.text.length, pos + 190);
    return (s > 0 ? "… " : "") + highlightHtml(it.text.slice(s, e), terms) + (e < it.text.length ? " …" : "");
  }
  function markTerms(rootEl, terms) {
    if (!terms.length) return 0;
    var re = termRe(terms), walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, null), nodes = [], n, count = 0;
    while ((n = walker.nextNode())) { if (!n.parentNode.closest("mark, button")) nodes.push(n); }
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
  var state = { doc: null, tab: null };
  var routeToken = 0;
  function parseHash() {
    var h = location.hash.replace(/^#/, "") || "/";
    var qi = h.indexOf("?"), q = new URLSearchParams(qi >= 0 ? h.slice(qi + 1) : "");
    var path = (qi >= 0 ? h.slice(0, qi) : h).split("/").filter(Boolean).map(decodeURIComponent);
    return { path: path, q: q };
  }
  function go(h) { location.hash = h; }
  function route() {
    closeToc(); hideFn();
    var token = ++routeToken, r = parseHash(), p = r.path;
    if (p[0] === "vb" && p[1] && catDoc(p[1])) return viewDoc(catDoc(p[1]), p[2] || "", r.q.get("q") || "", token);
    state.doc = null; window.removeEventListener("scroll", onScroll);
    document.getElementById("progress").style.width = "0";
    if (p[0] === "nhom" && p[1] && groupById(p[1])) viewList(groupById(p[1]), r.q);
    else if (p[0] === "van-ban") viewList(null, r.q);
    else if (p[0] === "tim") viewSearch(r.q.get("q") || "", r.q.get("nhom") || "", r.q.get("vb") || "", token);
    else viewHome();
    document.title = "Phần mềm tra cứu văn bản điện tử QTDND";
    window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", route);

  /* ---------- Thành phần giao diện dùng chung ---------- */
  function searchBox(cls, id, val, ph) {
    return '<form class="search ' + cls + '" data-search autocomplete="off" role="search">' +
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>' +
      '<input id="' + id + '" type="search" value="' + esc(val || "") + '" placeholder="' + esc(ph) + '" aria-label="Tìm kiếm"></form>';
  }
  function docRow(d, showGroup) {
    return '<a class="row" href="#/vb/' + d.id + '"><div class="row-main"><div class="dmeta"><span class="tag">' + esc(d.loai) + '</span>' +
      (d.so_hieu ? '<b>' + esc(d.so_hieu) + '</b>' : '') + (d.ngay ? '<span>· ' + esc(d.ngay) + '</span>' : '') +
      (d.ls ? '<span class="tag alt">Lịch sử sửa đổi</span>' : '') + '</div>' +
      '<div class="row-t">' + esc(d.tieu_de) + '</div>' +
      (showGroup ? '<div class="dmeta"><span class="tag line">' + esc(groupById(d.nhom).ten) + '</span></div>' : '') +
      '</div><span class="row-go" aria-hidden="true">›</span></a>';
  }
  function docCard(d) {
    var g = groupById(d.nhom);
    return '<a class="dcard" href="#/vb/' + d.id + '"><div class="dmeta"><span class="tag">' + esc(d.loai) + '</span>' +
      (d.so_hieu ? '<b>' + esc(d.so_hieu) + '</b>' : '') + (d.ngay ? '<span>· ' + esc(d.ngay) + '</span>' : '') + '</div>' +
      '<h3>' + esc(d.tieu_de) + '</h3><div class="dmeta"><span class="tag line">' + esc(g.ten) + '</span>' +
      (d.ls ? '<span class="tag alt">Lịch sử sửa đổi</span>' : '') + '</div><span class="go">Đọc văn bản →</span></a>';
  }

  /* ---------- Trang chủ ---------- */
  var SUGGEST = ["quỹ bảo đảm an toàn hệ thống", "chấp thuận thay đổi", "hồ sơ nhân sự", "đại hội thành viên", "giấy phép"];
  function viewHome() {
    var totalArt = CAT.docs.reduce(function (s, d) { return s + d.n; }, 0);
    var latest = CAT.docs.filter(function (d) { return d.ngay && d.loai !== "Hỏi đáp"; })
      .sort(function (a, b) { return dateKey(b.ngay) < dateKey(a.ngay) ? -1 : 1; }).slice(0, 6);
    var html = '<section class="hero"><h1>Tra cứu văn bản QTDND nhanh, rõ, dễ đọc</h1>' +
      '<p>Gõ từ khóa — không cần gõ dấu — để tìm trong từng Điều của toàn bộ văn bản.</p>' +
      searchBox("search-hero", "heroQ", "", "Ví dụ: đại hội thành viên") +
      '<div class="chips"><small>Thử tìm:</small>' +
      SUGGEST.map(function (s) { return '<a class="chip" href="#/tim?q=' + encodeURIComponent(s) + '">' + esc(s) + '</a>'; }).join("") + '</div>' +
      '<div class="stats"><div><b>' + CAT.docs.length + '</b>văn bản</div><div><b>' + CAT.groups.length + '</b>nhóm chủ đề</div>' +
      '<div><b>' + totalArt.toLocaleString("vi-VN") + '</b>Điều có thể tra cứu</div></div></section>';
    if (CAT.gioi_thieu && CAT.gioi_thieu.length > 1)
      html += '<p class="note intro">' + esc(CAT.gioi_thieu.slice(1).join(" ")) + '</p>';
    html += '<div class="section-h"><h2>Nhóm chủ đề</h2><a href="#/van-ban">Xem tất cả ' + CAT.docs.length + ' văn bản →</a></div><div class="grid">' +
      CAT.groups.map(function (g, i) {
        return '<a class="gcard" href="#/nhom/' + g.id + '"><span class="gicon">' + (i + 1) + '</span><span><b>' + esc(g.ten) + '</b><small>' + g.n + ' văn bản</small></span></a>';
      }).join("") + '</div>';
    html += '<div class="section-h"><h2>Văn bản ban hành gần đây</h2><span>Theo ngày ban hành ghi trong văn bản</span></div><div class="docs">' + latest.map(docCard).join("") + '</div>';
    $app.innerHTML = html;
    setTimeout(function () { loadIndex().catch(function () {}); }, 1200);   // nạp sẵn chỉ mục tìm kiếm khi rảnh
  }

  /* ---------- Danh sách văn bản (toàn bộ hoặc theo nhóm) ---------- */
  function viewList(g, q) {
    var types = ["Luật", "Nghị định", "Thông tư", "Văn bản hợp nhất", "Quyết định", "Nội dung mới", "Hỏi đáp", "Hướng dẫn"];
    var base = g ? CAT.docs.filter(function (d) { return d.nhom === g.id; }) : CAT.docs;
    var st = { t: q.get("loai") || "", s: q.get("xep") || "ebook", f: "" }, shown = PAGE * 100;
    $app.innerHTML = '<div class="crumbs"><a href="#/">Trang chủ</a> › ' + (g ? esc(g.ten) : "Tất cả văn bản") + '</div>' +
      '<h1 class="pagetitle">' + (g ? esc(g.ten) : "Tất cả văn bản") + '</h1><p class="sub" id="lcount"></p>' +
      '<div class="listtools"><input type="search" id="lf" placeholder="Lọc theo tên hoặc số hiệu…" aria-label="Lọc danh sách">' +
      '<select id="ls" aria-label="Sắp xếp"><option value="ebook">Theo mục lục Ebook</option><option value="moi">Mới ban hành trước</option><option value="so">Theo số hiệu</option></select></div>' +
      '<div class="filters" id="lt"></div><div class="rows" id="rows"></div>';
    var lf = document.getElementById("lf"), ls = document.getElementById("ls");
    ls.value = st.s;
    function draw() {
      var terms = fold(st.f).split(/\s+/).filter(Boolean);
      var list = base.filter(function (d) {
        return (!st.t || d.loai === st.t) && terms.every(function (t) { return findWord(d.f, t) >= 0; });
      });
      if (st.s === "moi") list = list.slice().sort(function (a, b) { return (dateKey(b.ngay) || "0") < (dateKey(a.ngay) || "0") ? -1 : 1; });
      if (st.s === "so") list = list.slice().sort(function (a, b) { return (a.so_hieu || "~").localeCompare(b.so_hieu || "~", "vi", { numeric: true }); });
      var present = types.filter(function (t) { return base.some(function (d) { return d.loai === t; }); });
      document.getElementById("lt").innerHTML = present.length > 1 ?
        '<button type="button" aria-pressed="' + !st.t + '" data-t="">Tất cả (' + base.length + ')</button>' + present.map(function (t) {
          return '<button type="button" aria-pressed="' + (st.t === t) + '" data-t="' + esc(t) + '">' + esc(t) + ' (' + base.filter(function (d) { return d.loai === t; }).length + ')</button>';
        }).join("") : "";
      document.getElementById("lcount").textContent = list.length + " văn bản";
      var h = "", lastSub = null;
      list.slice(0, shown).forEach(function (d) {
        if (g && st.s === "ebook" && d.nhom_con !== lastSub) { lastSub = d.nhom_con; if (lastSub) h += '<h2 class="subh">' + esc(lastSub) + '</h2>'; }
        h += docRow(d, !g);
      });
      document.getElementById("rows").innerHTML = h || '<div class="note">Không có văn bản phù hợp.</div>';
    }
    lf.addEventListener("input", function () { st.f = lf.value; draw(); });
    ls.addEventListener("change", function () { st.s = ls.value; draw(); });
    document.getElementById("lt").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) { st.t = b.getAttribute("data-t"); draw(); } });
    draw();
    document.title = (g ? g.ten : "Tất cả văn bản") + " — Tra cứu văn bản QTDND";
  }

  /* ---------- Trang kết quả tìm kiếm ---------- */
  function viewSearch(q, nhom, vb, token) {
    $app.innerHTML = '<div class="crumbs"><a href="#/">Trang chủ</a> › Tìm kiếm</div>' +
      searchBox("bigsearch", "bigQ", q, "Nhập từ khóa (không cần gõ dấu)…") +
      '<div id="scope"></div><div class="filters" id="filters"></div><p class="note" id="rcount" style="margin-top:14px">Đang tải dữ liệu tìm kiếm…</p><div class="results" id="results"></div>';
    document.title = (q ? q + " — " : "") + "Tìm kiếm văn bản QTDND";
    var input = document.getElementById("bigQ");
    loadIndex().then(function () {
      if (token !== routeToken) return;
      var shown = PAGE;
      function draw(resetPage) {
        if (resetPage) shown = PAGE;
        var qv = input.value.trim(), res = search(qv, { vb: vb }), box = document.getElementById("results");
        var byGroup = {};
        res.hits.forEach(function (h) { byGroup[h.it.d.nhom] = (byGroup[h.it.d.nhom] || 0) + 1; });
        var hits = nhom ? res.hits.filter(function (h) { return h.it.d.nhom === nhom; }) : res.hits;
        var f = '<button type="button" aria-pressed="' + (!nhom) + '" data-g="">Tất cả (' + res.hits.length + ')</button>';
        CAT.groups.forEach(function (g) { if (byGroup[g.id]) f += '<button type="button" aria-pressed="' + (nhom === g.id) + '" data-g="' + g.id + '">' + esc(g.ten) + ' (' + byGroup[g.id] + ')</button>'; });
        document.getElementById("filters").innerHTML = qv && !vb ? f : "";
        document.getElementById("scope").innerHTML = vb ? '<div class="hl-bar" style="margin-top:12px"><span>Chỉ tìm trong: <b>' + esc(docName(catDoc(vb))) + '</b></span><span class="grow"></span><a class="btn" href="#/tim?q=' + encodeURIComponent(qv) + '">Tìm tất cả văn bản</a></div>' : "";
        document.getElementById("rcount").textContent = !qv ? "Nhập từ khóa để tìm trong " + INDEX.length.toLocaleString("vi-VN") + " Điều/mục của " + CAT.docs.length + " văn bản."
          : (hits.length || res.docs.length ? "Tìm thấy " + hits.length.toLocaleString("vi-VN") + " Điều/mục" + (res.docs.length ? " và " + res.docs.length + " văn bản trùng tên/số hiệu" : "") + "." : "Không tìm thấy kết quả. Thử dùng từ khóa ngắn hơn hoặc ít từ hơn.");
        var h = "";
        if (res.docs.length && !nhom) h += '<div class="section-h" style="margin:8px 0 0"><h2 style="font-size:16px">Văn bản</h2></div><div class="rows">' + res.docs.map(function (d) { return docRow(d, true); }).join("") + '</div><div class="section-h" style="margin:18px 0 0"><h2 style="font-size:16px">Nội dung</h2></div>';
        h += hits.slice(0, shown).map(function (x) {
          var it = x.it, href = "#/vb/" + it.d.id + "/" + it.anchor + "?q=" + encodeURIComponent(qv);
          return '<a class="res" href="' + esc(href) + '"><div class="dmeta"><span class="tag">' + esc(it.d.loai) + '</span><b>' + esc(it.d.so_hieu || it.d.tieu_de) + '</b><span>· ' + esc(it.chapter) + '</span></div>' +
            '<div class="rt">' + esc(it.label) + (it.title ? '. ' + highlightHtml(it.title, res.terms) : '') + '</div><div class="rs">' + snippet(it, res.terms) + '</div></a>';
        }).join("");
        if (hits.length > shown) h += '<button class="btn more" type="button" id="more">Hiện thêm (' + (hits.length - shown).toLocaleString("vi-VN") + ' còn lại)</button>';
        box.innerHTML = h;
        var more = document.getElementById("more");
        if (more) more.addEventListener("click", function () { shown += PAGE; draw(false); });
        history.replaceState(null, "", "#/tim?q=" + encodeURIComponent(qv) + (nhom ? "&nhom=" + nhom : "") + (vb ? "&vb=" + vb : ""));
      }
      var t;
      input.addEventListener("input", function () { clearTimeout(t); t = setTimeout(function () { draw(true); }, 150); });
      document.getElementById("filters").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) { nhom = b.getAttribute("data-g"); draw(true); } });
      draw(true); input.focus();
    }, function (e) { errorView(e.message); });
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
  var COPY_BTN = function (id) { return '<button class="copy" type="button" data-copy="' + id + '" title="Sao chép liên kết tới mục này">Sao chép liên kết</button>'; };
  function renderFull(d) {
    var notes = d.chu_thich || {}, h = "";
    if (d.can_cu.length) h += '<details class="cancu"><summary>Căn cứ ban hành</summary><div>' + d.can_cu.map(function (b) { return block(b, notes); }).join("") + '</div></details>';
    d.chuong.forEach(function (c) {
      var parts = c.title.split(" — "), lab = parts[0], rest = parts.slice(1).join(" — ");
      h += '<section class="chuong' + (c.phu_luc ? ' pl' : '') + '" id="' + c.id + '">';
      if (c.title) h += '<h2 class="chuong-t"><small>' + esc(rest ? lab : (c.phu_luc ? "Phụ lục" : "Phần")) + '</small>' + esc(rest || lab) + '</h2>';
      c.articles.forEach(function (a) {
        if (a.muc) { h += '<h3 class="muc-t" id="' + a.id + '"><span>' + esc(a.muc) + '</span>' + esc(a.ten) + '</h3>'; return; }
        h += '<article class="dieu" id="' + a.id + '">';
        if (a.so) h += '<h3><span class="dieu-no">Điều ' + esc(a.so) + '</span><span class="dieu-ten">' + esc(a.ten) +
          (a.fn ? a.fn.map(function (n) { return notes[n] ? withFn("[" + n + "]", notes) : ""; }).join("") : "") + '</span>' + COPY_BTN(a.id) + '</h3>';
        else if (a.ten) h += '<h3><span class="dieu-ten">' + esc(a.ten) + '</span>' + COPY_BTN(a.id) + '</h3>';
        h += a.nd.map(function (b) { return block(b, notes); }).join("") + '</article>';
      });
      h += '</section>';
    });
    return h || '<p>Văn bản này chưa có nội dung.</p>';
  }
  function renderTimeline(d) {
    var items = d.dong_thoi_gian.map(function (t) {
      var so = t.so.replace(/^(Thông tư|Nghị định|Quyết định|Luật)( liên tịch)? số /, ""),
        target = CAT.docs.filter(function (x) { return x.so_hieu === so; })[0];
      return '<li class="tl"><div class="tl-card"><h4>' + (target ? '<a href="#/vb/' + target.id + '">' + esc(t.so) + '</a>' : esc(t.so)) + '</h4>' +
        '<div class="tl-dates"><span>Ban hành: <b>' + esc(t.ngay) + '</b></span>' + (t.hieu_luc ? '<span>Có hiệu lực: <b>' + esc(t.hieu_luc) + '</b></span>' : '') + '</div><p>' + esc(t.mo_ta) + '</p></div></li>';
    }).join("");
    return '<div class="disclaimer">Các mốc dưới đây được lấy từ phần mở đầu của văn bản hợp nhất.</div><ol class="timeline">' + items +
      '<li class="tl cur"><div class="tl-card"><h4>' + esc(docName(d)) + '</h4><p>Văn bản hợp nhất hiện đang xem.</p></div></li></ol>';
  }
  function renderToc(d, tab) {
    if (tab !== "toan-van") return "";
    var h = '<h2>Mục lục</h2><input type="search" id="tocQ" placeholder="Lọc mục lục…" aria-label="Lọc mục lục">';
    d.chuong.forEach(function (c) {
      var parts = c.title.split(" — "), lab = parts[0], rest = parts.slice(1).join(" — "), inner = "";
      c.articles.forEach(function (a) {
        if (a.muc) inner += '<a class="mucl" href="#/vb/' + d.id + '/' + a.id + '" data-t="' + esc(fold(a.muc + " " + a.ten)) + '">' + esc(a.muc) + '</a>';
        else if (a.so) inner += '<a href="#/vb/' + d.id + '/' + a.id + '" data-id="' + a.id + '" data-t="' + esc(fold("dieu " + a.so + " " + a.ten)) + '">Điều ' + esc(a.so) + '. ' + esc(a.ten) + '</a>';
        else if (a.ten) inner += '<a href="#/vb/' + d.id + '/' + a.id + '" data-id="' + a.id + '" data-t="' + esc(fold(a.ten)) + '">' + esc(a.ten) + '</a>';
      });
      if (!inner) return;
      h += '<details open data-c="' + c.id + '"><summary>' + esc(c.title ? (rest ? lab + " · " + rest : lab) : "Nội dung") + '</summary>' + inner + '</details>';
    });
    return h.indexOf("<details") < 0 ? "" : h + '<div class="none" id="tocNone" hidden>Không có mục phù hợp.</div>';
  }
  function viewDoc(meta, sub, q, token) {
    var tab = sub === "lich-su" && meta.ls ? "lich-su" : "toan-van", anchor = tab === "toan-van" ? sub : "";
    if (state.doc && state.doc.id === meta.id && state.tab === tab && tab === "toan-van" && !q) { scrollToAnchor(anchor, true); return; }
    $app.innerHTML = '<div class="crumbs"><a href="#/">Trang chủ</a> › ' + esc(groupById(meta.nhom).ten) + '</div><div class="loading"><div class="spinner"></div>Đang mở văn bản…</div>';
    window.scrollTo(0, 0);
    loadDoc(meta.id).then(function (d) {
      if (token !== routeToken) return;
      renderDoc(meta, d, tab, anchor, q);
    }, function (e) { errorView(e.message); });
  }
  function renderDoc(meta, d, tab, anchor, q) {
    state.doc = d; state.tab = tab;
    var base = "#/vb/" + meta.id, g = groupById(meta.nhom);
    var tabs = '<nav class="tabs" aria-label="Chế độ xem"><a href="' + base + '"' + (tab === "toan-van" ? ' aria-current="page"' : '') + '>Toàn văn</a>' +
      (meta.ls ? '<a href="' + base + '/lich-su"' + (tab === "lich-su" ? ' aria-current="page"' : '') + '>Lịch sử sửa đổi</a>' : '') + '</nav>';
    var related = CAT.docs.filter(function (x) { return x.nhom === meta.nhom && x.id !== meta.id; });
    var tocHtml = renderToc(d, tab);
    if (related.length) tocHtml += '<div class="related"><h2>Cùng nhóm</h2>' + related.slice(0, 8).map(function (x) { return '<a href="#/vb/' + x.id + '" title="' + esc(x.tieu_de) + '">' + esc(docName(x)) + '</a>'; }).join("") +
      (related.length > 8 ? '<a href="#/nhom/' + g.id + '"><b>Xem cả nhóm (' + (related.length + 1) + ') →</b></a>' : '') + '</div>';
    var body = tab === "toan-van" ? renderFull(d) : renderTimeline(d);
    $app.innerHTML =
      '<div class="crumbs"><a href="#/">Trang chủ</a> › <a href="#/nhom/' + g.id + '">' + esc(g.ten) + '</a>' + (meta.nhom_con ? ' › ' + esc(meta.nhom_con) : '') + '</div>' +
      '<section class="dochead"><span class="tag">' + esc(meta.loai) + '</span><h1>' + esc(meta.tieu_de) + '</h1><div class="facts">' +
      (meta.so_hieu ? '<span>Số hiệu: <b>' + esc(meta.so_hieu) + '</b></span>' : '') + (meta.ngay ? '<span>Ngày ban hành: <b>' + esc(meta.ngay) + '</b></span>' : '') +
      '<span>Nhóm: <b>' + esc(g.ten) + '</b></span></div></section>' + tabs +
      '<div class="layout"><aside class="toc" id="toc" aria-label="Mục lục">' + tocHtml + '</aside><div class="reader">' +
      '<div class="toolbar">' + (tab === "toan-van" ? '<button class="btn toc-btn" id="tocOpen" type="button">☰ Mục lục</button>' : '') +
      '<form class="search docsearch" id="docSearch" autocomplete="off"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg><input type="search" id="docQ" placeholder="Tìm trong văn bản này…" aria-label="Tìm trong văn bản này"></form>' +
      '<span class="grow"></span><button class="btn" type="button" id="fMinus" aria-label="Giảm cỡ chữ">A−</button><button class="btn" type="button" id="fPlus" aria-label="Tăng cỡ chữ">A+</button>' +
      '<button class="btn" type="button" onclick="window.print()">In</button></div>' +
      '<div id="hlbar"></div><div class="paper" id="paper">' + body + '</div></div></div>';
    document.title = docName(meta) + " — Tra cứu văn bản QTDND";
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
    wireDoc(meta, tab);
    if (anchor || terms.length) scrollToAnchor(anchor || "__mark", false); else window.scrollTo(0, 0);
    window.addEventListener("scroll", onScroll, { passive: true }); onScroll();
  }
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
  function wireDoc(meta, tab) {
    var open = document.getElementById("tocOpen"); if (open) open.addEventListener("click", openToc);
    document.getElementById("fMinus").addEventListener("click", function () { setScale(readScale - .07); });
    document.getElementById("fPlus").addEventListener("click", function () { setScale(readScale + .07); });
    document.getElementById("docSearch").addEventListener("submit", function (e) {
      e.preventDefault(); var v = document.getElementById("docQ").value.trim();
      if (v) go("#/tim?q=" + encodeURIComponent(v) + "&vb=" + meta.id);
    });
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
          var r = a.getBoundingClientRect();
          if (!document.getElementById("tocQ").value && (r.bottom > innerHeight || r.top < 60)) a.scrollIntoView({ block: "nearest" });
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
      var url = location.href.split("#")[0] + "#/vb/" + state.doc.id + "/" + c.getAttribute("data-copy");
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
    var n = btn.getAttribute("data-n"), pop = document.getElementById("fnpop");
    if (!pop.hidden && pop.getAttribute("data-n") === n && pop._btn === btn) { hideFn(); return; }
    pop.innerHTML = "<b>Chú thích [" + esc(n) + "]</b><br>" + esc((state.doc.chu_thich || {})[n] || "");
    pop.setAttribute("data-n", n); pop._btn = btn; pop.hidden = false;
    var r = btn.getBoundingClientRect(), x = Math.max(12, Math.min(r.left + scrollX, scrollX + innerWidth - pop.offsetWidth - 12));
    pop.style.left = x + "px"; pop.style.top = (r.bottom + scrollY + 8) + "px";
  }
  function hideFn() { var p = document.getElementById("fnpop"); if (p) p.hidden = true; }
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { hideFn(); closeToc(); }
    if (e.key === "/" && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {
      e.preventDefault(); (document.getElementById("bigQ") || document.getElementById("heroQ") || document.getElementById("topQ")).focus();
    }
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
