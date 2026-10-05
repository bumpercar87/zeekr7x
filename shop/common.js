// 딜러 사이트 · 관리자 페이지 공용
// 비밀번호 재설정 메일의 링크로 들어온 경우 (클라이언트가 주소를 정리하기 전에 확인)
let RECOVERY = /type=recovery/.test(location.hash + location.search);
const sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY);

// ?demo 는 로컬 미리보기 전용 (가짜 로그인 + 가상 재고, DB에 쓰지 않음)
const DEMO = new URLSearchParams(location.search).has('demo') &&
  /^(localhost|127\.0\.0\.1)$/.test(location.hostname);

const STATUS = {
  pending_payment: '입금대기',
  paid: '입금확인',
  preparing: '출고준비',
  shipped: '배송중',
  delivered: '배송완료',
  cancelled: '취소',
};
const FLOW = ['pending_payment', 'paid', 'preparing', 'shipped', 'delivered'];

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const won = n => (n ?? 0).toLocaleString('ko-KR');
// 사진 버전: 사진 파일을 바꾸면 config.js 의 ASSET_V 숫자를 올려 브라우저가 새로 받게 함
const img = p => !p ? '' : /^https?:/.test(p) ? p : '../' + p + (window.ASSET_V ? '?v=' + window.ASSET_V : '');
// 목록·썸네일용 작은 사진 (shop/img 아래 사진은 400px _s 버전이 함께 있음)
const thumb = p => !p ? '' : /^shop\/img\/.*\.jpg$/.test(p) ? img(p.replace(/\.jpg$/, '_s.jpg')) : img(p);
const fmtDT = t => {
  if (!t) return '';
  const d = new Date(t);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
const statusBadge = s => `<span class="badge st-${s}">${STATUS[s] || s}</span>`;

function toast(msg, ms = 2400) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), ms);
}

function store(key, val) {
  try {
    if (val === undefined) return JSON.parse(localStorage.getItem(key) || 'null');
    localStorage.setItem(key, JSON.stringify(val));
  } catch (e) { return null; }
}

// Supabase 에러 → 사용자용 한국어
function errMsg(e) {
  const m = (e && (e.message || e.error_description)) || String(e);
  const map = [
    [/Invalid login credentials/i, '이메일 또는 비밀번호가 올바르지 않습니다.'],
    [/already registered|already been registered/i, '이미 가입된 이메일입니다. 로그인해 주세요.'],
    [/at least 6 characters|Password should be/i, '비밀번호는 6자 이상이어야 합니다.'],
    [/Email not confirmed/i, '이메일 인증이 완료되지 않았습니다. 메일함을 확인해 주세요.'],
    [/rate limit|too many/i, '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.'],
    [/invalid.*email|Unable to validate email/i, '이메일 형식이 올바르지 않습니다.'],
    [/Failed to fetch|NetworkError/i, '네트워크 연결을 확인해 주세요.'],
    [/should be different from the old/i, '이전과 다른 비밀번호를 입력해 주세요.'],
    [/Auth session missing|expired|invalid.*token/i, '링크가 만료되었습니다. 비밀번호 찾기를 다시 진행해 주세요.'],
  ];
  for (const [re, ko] of map) if (re.test(m)) return ko;
  return m;
}

const fmtPhone = v => {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.startsWith('02')) return d.replace(/^(02)(\d{0,4})(\d{0,4}).*/, (_, a, b, c) => [a, b, c].filter(Boolean).join('-'));
  return d.replace(/^(\d{0,3})(\d{0,4})(\d{0,4}).*/, (_, a, b, c) => [a, b, c].filter(Boolean).join('-'));
};
const fmtBiz = v => v.replace(/\D/g, '').slice(0, 10).replace(/^(\d{0,3})(\d{0,2})(\d{0,5}).*/, (_, a, b, c) => [a, b, c].filter(Boolean).join('-'));

// 주소 입력 (카카오 우편번호 검색)
function addrField(label, value = '', required = false) {
  return `
  <div class="field addr-field"><label>${label}${required ? '<em>*</em>' : ''}</label>
    <div class="addr-row"><input name="addr1" readonly placeholder="주소 검색을 눌러 주세요" value="${esc(value)}"><button type="button" class="btn sm" data-addr>주소 검색</button></div>
    <input name="addr2" placeholder="상세주소 (동·호수, 건물명 등)">
  </div>`;
}

function bindAddr(form) {
  const a1 = form.addr1, a2 = form.addr2;
  const open = () => openPostcode(v => { a1.value = v; a2.value = ''; a2.focus(); });
  form.querySelector('[data-addr]').onclick = open;
  a1.onclick = open;
}

const addrValue = form => [form.addr1.value.trim(), form.addr2.value.trim()].filter(Boolean).join(' ');

function openPostcode(cb) {
  if (!window.daum?.Postcode) {  // 스크립트를 못 불러온 경우 직접 입력
    const f = document.querySelector('[name=addr1]');
    f.readOnly = false; f.placeholder = '주소를 직접 입력해 주세요'; f.focus();
    return;
  }
  const ov = document.createElement('div');
  ov.className = 'pc-ov';
  ov.innerHTML = '<div class="pc-box"><div class="pc-h"><b>주소 검색</b><button type="button">닫기</button></div><div class="pc-body"></div></div>';
  document.body.appendChild(ov);
  const close = () => ov.remove();
  ov.querySelector('.pc-h button').onclick = close;
  ov.onclick = e => { if (e.target === ov) close(); };
  new daum.Postcode({
    width: '100%', height: '100%',
    oncomplete: d => {
      let a = d.roadAddress || d.jibunAddress;
      if (d.buildingName && d.apartment === 'Y') a += ` (${d.buildingName})`;
      cb(`(${d.zonecode}) ${a}`);
      close();
    },
  }).embed(ov.querySelector('.pc-body'));
}

// 사이트 디자인에 맞춘 확인창 (브라우저 기본 confirm 대신)
function ask(msg, { ok = '확인', cancel = '취소', danger = false } = {}) {
  return new Promise(resolve => {
    const ov = document.createElement('div');
    ov.className = 'ask-ov';
    ov.innerHTML = `<div class="ask" role="dialog" aria-modal="true">
      <div class="ask-msg">${esc(msg).replace(/\n/g, '<br>')}</div>
      <div class="ask-btns"><button class="btn ghost" data-r="0">${esc(cancel)}</button><button class="btn pri ${danger ? 'danger' : ''}" data-r="1">${esc(ok)}</button></div>
    </div>`;
    document.body.appendChild(ov);
    const done = r => { ov.remove(); document.removeEventListener('keydown', key); resolve(r); };
    const key = e => { if (e.key === 'Escape') done(false); if (e.key === 'Enter') done(true); };
    ov.addEventListener('click', e => { const b = e.target.closest('[data-r]'); if (b) done(b.dataset.r === '1'); else if (e.target === ov) done(false); });
    document.addEventListener('keydown', key);
    ov.querySelector('[data-r="1"]').focus();
  });
}

// 수량 구간 할인: 같은 상품(옵션 합산) 수량 기준, 10원 단위 내림 — DB place_order 와 같은 계산
const tiersOf = st => (st?.qty_discounts || []).filter(t => t.min > 0 && t.rate > 0).sort((a, b) => a.min - b.min);
const rateFor = (qty, st) => tiersOf(st).reduce((r, t) => qty >= t.min ? Math.max(r, t.rate) : r, 0);
const unitPrice = (price, rate) => Math.floor(price * (100 - rate) / 100 / 10) * 10;
const tierText = st => tiersOf(st).map(t => `${t.min}개 이상 ${t.rate}%`).join(' · ');

// 견적서 · 거래명세서 (새 창 → 인쇄 / PDF 저장)
function printDoc({ kind, no, date, to, items, shipping, total, biz, note, coupon }) {
  const w = window.open('', '_blank');
  if (!w) { toast('팝업이 차단되었습니다. 브라우저에서 팝업을 허용해 주세요.', 4000); return; }
  const sub = items.reduce((a, i) => a + i.line_total, 0);
  const row = (k, v) => v ? `<tr><th>${k}</th><td>${esc(v)}</td></tr>` : '';
  w.document.write(`<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>${kind} ${esc(no || '')}</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
  <style>
    *{box-sizing:border-box} body{font-family:"Pretendard Variable",sans-serif;color:#141414;margin:0;padding:40px;font-size:13px}
    .doc{max-width:760px;margin:0 auto}
    h1{text-align:center;font-size:30px;letter-spacing:.5em;margin:0 0 6px;padding-left:.5em}
    .sub{text-align:center;color:#777;margin-bottom:26px}
    .top{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:18px}
    .box{border:1.5px solid #141414;padding:12px 14px}
    .box h3{margin:0 0 8px;font-size:13px;color:#e4501f}
    .box table{width:100%;border-collapse:collapse} .box th{text-align:left;color:#777;font-weight:500;width:88px;padding:3px 0;vertical-align:top} .box td{padding:3px 0}
    .sum{border:1.5px solid #141414;background:#faf6ee;padding:12px 16px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:baseline}
    .sum b{font-size:22px}
    table.it{width:100%;border-collapse:collapse} .it th{background:#141414;color:#fff;padding:8px;font-weight:600;font-size:12px}
    .it td{border-bottom:1px solid #ccc;padding:8px} .n{text-align:right;white-space:nowrap}
    .it tfoot td{font-weight:700;border-top:1.5px solid #141414}
    .note{margin-top:16px;color:#555;line-height:1.7;white-space:pre-line}
    .doc-logo{text-align:right;margin-bottom:-36px}.doc-logo img{height:50px;width:auto}
    .bar{text-align:center;margin-bottom:24px} .bar button{font:inherit;font-weight:700;padding:10px 22px;background:#141414;color:#fff;border:0;cursor:pointer}
    @media print{.bar{display:none} body{padding:0}}
    @media (max-width:640px){body{padding:16px} .doc-logo{margin-bottom:10px} .doc-logo img{height:50px} h1{font-size:24px;letter-spacing:.3em}
      .top{grid-template-columns:1fr;gap:10px} .box th{width:76px} .it th,.it td{padding:6px 4px;font-size:12px} .sum b{font-size:19px}}
  </style></head><body><div class="doc">
  <div class="bar"><button onclick="print()">인쇄 / PDF로 저장</button></div>
  <div class="doc-logo"><img src="${new URL('img/brand/bringgo_pc_line_black.png', location.href).href}" alt="bringgo"></div>
  <h1>${kind}</h1><div class="sub">${esc(no ? `No. ${no} · ` : '')}${esc(date)}</div>
  <div class="top">
    <div class="box"><h3>받는 곳</h3><table>${row('상호', to.company)}${row('담당자', to.manager)}${row('연락처', to.phone)}${row('사업자번호', to.biz_no)}</table></div>
    <div class="box"><h3>공급자</h3><table>${row('상호', biz.biz_name)}${row('대표자', biz.biz_owner)}${row('사업자번호', biz.biz_no)}${row('주소', biz.biz_addr)}${row('연락처', [biz.biz_phone, biz.biz_email].filter(Boolean).join(' · '))}</table></div>
  </div>
  <div class="sum"><span>합계 금액 (부가세 포함)</span><b>${won(total)}원</b></div>
  <table class="it"><thead><tr><th>품목</th><th>옵션</th><th class="n">단가</th><th class="n">수량</th><th class="n">금액</th></tr></thead><tbody>
    ${items.map(i => `<tr><td>${esc(i.product_name)}</td><td>${esc(i.option_name)}</td><td class="n">${won(i.unit_price)}${i.discount_rate ? `<br><small style="color:#e4501f">${i.discount_rate}% 할인</small>` : ''}</td><td class="n">${i.qty}</td><td class="n">${won(i.line_total)}</td></tr>`).join('')}
    <tr><td colspan="4">배송비</td><td class="n">${shipping ? won(shipping) : '무료'}</td></tr>
    ${coupon && coupon.discount ? `<tr><td colspan="4">쿠폰 할인 · ${esc(coupon.name || '')}</td><td class="n" style="color:#e4501f">−${won(coupon.discount)}</td></tr>` : ''}
  </tbody><tfoot><tr><td colspan="3">합계</td><td class="n">${items.reduce((a, i) => a + i.qty, 0)}</td><td class="n">${won(sub + shipping - (coupon?.discount || 0))}</td></tr></tfoot></table>
  ${note ? `<div class="note">${esc(note)}</div>` : ''}
  </div></body></html>`);
  w.document.close();
}

// 배송 조회: 택배사별 조회 페이지 (모르는 택배사는 네이버 검색으로)
const TRACK_URL = {
  'CJ대한통운': n => `https://trace.cjlogistics.com/next/tracking.html?wblNo=${n}`,
  '롯데택배': n => `https://www.lotteglogis.com/home/reservation/tracking/linkView?InvNo=${n}`,
  '한진택배': n => `https://www.hanjin.com/kor/CMS/DeliveryMgr/WaybillResult.do?mCode=MN038&schLang=KR&wblnumText2=${n}`,
  '우체국택배': n => `https://service.epost.go.kr/trace.RetrieveDomRigiTraceList.comm?sid1=${n}`,
  '로젠택배': n => `https://www.ilogen.com/web/personal/trace/${n}`,
  '경동택배': n => `https://kdexp.com/service/delivery/etc/delivery.do?barcode=${n}`,
};
function trackUrl(carrier, no) {
  const n = String(no || '').replace(/[^0-9A-Za-z]/g, '');
  if (!n || carrier === '직접배송') return '';
  const f = TRACK_URL[carrier];
  return f ? f(n) : `https://search.naver.com/search.naver?query=${encodeURIComponent(`${carrier || ''} 택배조회 ${n}`)}`;
}
