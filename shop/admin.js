// ZEEKR 7X 관리자 페이지
const A = { user: null, me: null, orders: [], dealers: [], products: [], variants: [], settings: {}, notices: [], inquiries: [], coupons: [], editCoupon: null, editNotice: null, inqF: 'open', f: { st: 'all', q: '', from: '', to: '' }, open: new Set(), dirty: {} };
const CARRIERS = ['CJ대한통운', '롯데택배', '한진택배', '우체국택배', '로젠택배', '경동택배', '직접배송'];

// ---------------------------------------------------------------- 데이터
const api = DEMO ? demoAdminApi() : {
  async user() { const { data } = await sb.auth.getSession(); return data.session?.user || null; },
  async signIn(email, password) { const { error } = await sb.auth.signInWithPassword({ email, password }); if (error) throw error; },
  async signOut() { await sb.auth.signOut(); },
  async me(uid) { const { data, error } = await sb.from('dealers').select('*').eq('id', uid).maybeSingle(); if (error) throw error; return data; },
  async load() {
    const [o, d, p, v, s] = await Promise.all([
      sb.from('orders').select('*, order_items(*), dealers(company,branch,manager_name,phone,email)').order('created_at', { ascending: false }),
      sb.from('dealers').select('*').order('created_at', { ascending: false }),
      sb.from('products').select('*').order('sort'),
      sb.from('variants').select('*').order('product_id').order('sort'),
      sb.from('shop_settings').select('*').eq('id', 1).maybeSingle(),
    ]);
    for (const r of [o, d, p, v, s]) if (r.error) throw r.error;
    const [n, q, c] = await Promise.all([
      sb.from('notices').select('*').order('pinned', { ascending: false }).order('created_at', { ascending: false }),
      sb.from('inquiries').select('*, dealers(company,branch,manager_name,phone,email), orders(order_no)').order('created_at', { ascending: false }),
      sb.from('coupons').select('*, coupon_grants(dealer_id)').order('created_at', { ascending: false }),
    ]);
    return { orders: o.data, dealers: d.data, products: p.data, variants: v.data, settings: s.data || {}, notices: n.error ? [] : n.data, inquiries: q.error ? [] : q.data, coupons: c.error ? [] : c.data };
  },
  async saveNotice(id, patch) {
    const q = id ? sb.from('notices').update(patch).eq('id', id) : sb.from('notices').insert(patch);
    const { error } = await q; if (error) throw error;
  },
  async delNotice(id) { const { error } = await sb.from('notices').delete().eq('id', id); if (error) throw error; },
  async updInquiry(id, patch) { const { error } = await sb.from('inquiries').update(patch).eq('id', id); if (error) throw error; },
  async updOrder(id, patch) { const { error } = await sb.from('orders').update(patch).eq('id', id); if (error) throw error; },
  async updVariant(id, patch) { const { error } = await sb.from('variants').update(patch).eq('id', id); if (error) throw error; },
  async updProduct(id, patch) { const { error } = await sb.from('products').update(patch).eq('id', id); if (error) throw error; },
  async updDealer(id, patch) { const { error } = await sb.from('dealers').update(patch).eq('id', id); if (error) throw error; },
  async delDealer(id) { const { error } = await sb.rpc('admin_delete_dealer', { p_dealer_id: id }); if (error) throw error; },
  async saveCoupon(id, patch, grants) {
    let cid = id;
    if (id) { const { error } = await sb.from('coupons').update(patch).eq('id', id); if (error) throw error; }
    else { const { data, error } = await sb.from('coupons').insert(patch).select('id').single(); if (error) throw error; cid = data.id; }
    if (grants) {
      const { error: e1 } = await sb.from('coupon_grants').delete().eq('coupon_id', cid); if (e1) throw e1;
      if (grants.length) { const { error: e2 } = await sb.from('coupon_grants').insert(grants.map(d => ({ coupon_id: cid, dealer_id: d }))); if (e2) throw e2; }
    }
  },
  async delCoupon(id) { const { error } = await sb.from('coupons').delete().eq('id', id); if (error) throw error; },
  async updSettings(patch) { const { error } = await sb.from('shop_settings').update(patch).eq('id', 1); if (error) throw error; },
};

function demoAdminApi() {
  const me = { id: 'demo', email: 'admin@demo', company: '브링고', is_admin: true, status: 'approved' };
  const dealers = [
    { id: 'demo', email: 'demo@dealer.kr', company: '지커 파트너스', branch: '강남점', manager_name: '김딜러', phone: '010-1234-5678', biz_no: '123-45-67890', address: '서울 강남구 테헤란로 000', status: 'approved', created_at: '2026-09-20T10:00:00Z' },
    { id: 'd2', email: 'sales@zkmotors.kr', company: 'ZK모터스', branch: '분당지점', manager_name: '이지점', phone: '010-2222-3333', biz_no: null, address: '경기 성남시 분당구 000', status: 'pending', created_at: '2026-09-29T02:00:00Z' },
  ];
  let data = null;
  return {
    async user() { return { id: 'demo' }; },
    async signIn() {}, async signOut() {},
    async me() { return me; },
    async load() {
      if (!data) {
        const products = await (await fetch('demo_products.json', { cache: 'no-store' })).json();
        const variants = await (await fetch('demo_variants.json', { cache: 'no-store' })).json();
        const orders = (store('zk_demo_orders') || []).map(o => ({ ...o, dealers: dealers[0] }));
        data = { coupons: [{ id: 1, name: '첫 구매 10% 할인', code: 'WELCOME10', kind: 'percent', value: 10, max_discount: 30000, min_order: 50000, target: 'all', once_per_dealer: true, first_order_only: true, starts_at: null, ends_at: null, active: true, created_at: new Date().toISOString(), coupon_grants: [] }], inquiries: (store('zk_demo_inq') || []).map(q => ({ ...q, dealers: dealers[0] })), notices: [{ id: 1, title: '10월 9일 한글날 휴무 안내', body: '10/8(수) 오후 2시 입금 확인분까지 당일 출고됩니다.', pinned: true, active: true, created_at: new Date().toISOString() }], orders, dealers, products, variants, settings: { bank_name: '○○은행', bank_account: '000-000000-00-000', bank_holder: '브링고', pay_deadline_days: 3, shipping_fee: 3000, free_shipping_over: 100000, notice: '주문 후 3일 이내 입금해 주세요.', qty_discounts: [{ min: 30, rate: 5 }, { min: 50, rate: 10 }], biz_name: '브링고', biz_email: 'bringgoglobal@gmail.com', ship_info: '출고: 입금 확인 후 1~2영업일 이내' } };
      }
      return data;
    },
    async updOrder(id, patch) { const o = data.orders.find(x => x.id === id); if (patch.status && patch.status !== o.status) { const t = new Date().toISOString(); ({ paid: () => o.paid_at = t, shipped: () => o.shipped_at = t, delivered: () => o.delivered_at = t, cancelled: () => o.cancelled_at = t })[patch.status]?.(); } Object.assign(o, patch); },
    async updVariant(id, patch) { Object.assign(data.variants.find(x => x.id === id), patch); },
    async updProduct(id, patch) { Object.assign(data.products.find(x => x.id === id), patch); },
    async updDealer(id, patch) { Object.assign(data.dealers.find(x => x.id === id), patch); },
    async saveCoupon(id, patch, grants) {
      let c = id && data.coupons.find(x => x.id === id);
      if (c) Object.assign(c, patch); else { c = { id: Date.now(), created_at: new Date().toISOString(), coupon_grants: [], ...patch }; data.coupons.unshift(c); }
      if (grants) c.coupon_grants = grants.map(d => ({ dealer_id: d }));
    },
    async delCoupon(id) { data.coupons = data.coupons.filter(x => x.id !== id); },
    async delDealer(id) {
      if (data.orders.some(o => o.dealer_id === id || (id === 'demo' && o.dealers))) throw new Error('주문 내역이 있는 딜러는 삭제할 수 없습니다. 거래 기록 보관을 위해 [이용 중지]로 처리해 주세요.');
      data.dealers = data.dealers.filter(x => x.id !== id);
    },
    async updSettings(patch) { Object.assign(data.settings, patch); },
    async saveNotice(id, patch) {
      if (id) Object.assign(data.notices.find(x => x.id === id), patch);
      else data.notices.unshift({ id: Date.now(), active: true, created_at: new Date().toISOString(), ...patch });
    },
    async delNotice(id) { data.notices = data.notices.filter(x => x.id !== id); },
    async updInquiry(id, patch) { const q = data.inquiries.find(x => x.id === id); Object.assign(q, patch); if (patch.answer) { q.status = 'answered'; q.answered_at = new Date().toISOString(); } },
  };
}

async function reload() {
  Object.assign(A, await api.load());
  A.products.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  renderNav();
}

// ---------------------------------------------------------------- 공통
const app = () => $('#app');
const dealerName = d => d ? esc(d.company) + (d.branch ? ` <span class="mut">${esc(d.branch)}</span>` : '') : '<span class="mut">(삭제된 딜러)</span>';

function renderNav() {
  const r = location.hash || '#/orders';
  const on = h => r.startsWith(h) ? 'on' : '';
  const nPay = A.orders.filter(o => o.status === 'pending_payment').length;
  const nDealer = A.dealers.filter(d => d.status === 'pending').length;
  $('#nav').innerHTML = `
    <a href="#/orders" class="${on('#/orders')}">주문${nPay ? `<span class="pill">${nPay}</span>` : ''}</a>
    <a href="#/stock" class="${on('#/stock')}">재고·가격</a>
    <a href="#/dealers" class="${on('#/dealers')}">딜러${nDealer ? `<span class="pill">${nDealer}</span>` : ''}</a>
    <a href="#/inquiries" class="${on('#/inquiries')}">문의${A.inquiries.filter(q => q.status === 'open').length ? `<span class="pill">${A.inquiries.filter(q => q.status === 'open').length}</span>` : ''}</a>
    <a href="#/coupons" class="${on('#/coupons')}">쿠폰</a>
    <a href="#/notices" class="${on('#/notices')}">공지</a>
    <a href="#/settings" class="${on('#/settings')}">설정</a>
    <a href="index.html${DEMO ? location.search : ''}">딜러 화면</a>
    <button data-act="logout">로그아웃</button>`;
}

document.addEventListener('click', async e => {
  if (e.target.closest('[data-act="logout"]')) { await api.signOut(); location.href = 'index.html'; }
});

// ---------------------------------------------------------------- 주문 현황
function filteredOrders() {
  const { st, q, from, to } = A.f;
  const qq = q.trim().toLowerCase();
  return A.orders.filter(o => {
    if (st !== 'all' && o.status !== st) return false;
    const local = new Date(o.created_at).toLocaleDateString('sv-SE'); // YYYY-MM-DD (로컬)
    if (from && local < from) return false;
    if (to && local > to) return false;
    if (qq) {
      const hay = [o.order_no, o.depositor_name, o.ship_name, o.dealers?.company, o.dealers?.branch, o.dealers?.manager_name, o.tracking_no, ...(o.order_items || []).map(i => i.product_name + ' ' + i.option_name)].join(' ').toLowerCase();
      if (!hay.includes(qq)) return false;
    }
    return true;
  });
}

function viewOrders() {
  const all = A.orders;
  const cnt = s => all.filter(o => o.status === s);
  const sum = arr => arr.reduce((a, o) => a + o.total, 0);
  const kpis = [['all', '전체', all.filter(o => o.status !== 'cancelled')], ...Object.keys(STATUS).map(s => [s, STATUS[s], cnt(s)])].filter(k => k[0] !== 'cancelled' || k[2].length);
  const list = filteredOrders();
  const now = Date.now();

  app().innerHTML = `
  <div class="page-head">
    <div><div class="eyebrow">Orders</div><h1>주문 현황</h1></div>
    <div class="bar" style="margin:0"><button class="btn sm ghost" id="refresh">새로고침</button>${window.SHEET_URL ? `<a class="btn sm pri" href="${esc(window.SHEET_URL)}" target="_blank" rel="noopener">구글 시트 열기 ↗</a>` : ''}<button class="btn sm ghost" id="csv">CSV 다운로드</button></div>
  </div>
  <div class="kpis" style="grid-template-columns:repeat(${kpis.length},1fr)">
    ${kpis.map(([k, l, arr]) => `<button class="kpi ${A.f.st === k ? 'on' : ''}" data-st="${k}"><div class="l">${l}</div><div class="v">${arr.length}</div><div class="s">${won(sum(arr))}원</div></button>`).join('')}
  </div>
  <div class="bar">
    <input type="search" id="q" placeholder="주문번호 · 딜러 · 입금자 · 상품 검색" value="${esc(A.f.q)}">
    <input type="date" id="from" value="${A.f.from}"> ~ <input type="date" id="to" value="${A.f.to}">
    <span class="sp"></span><span class="small mut">${list.length}건 · ${won(sum(list))}원</span>
  </div>
  <div class="tbl-wrap"><table class="tbl orders-tbl">
    <thead><tr><th>주문번호 · 일시</th><th>주문자 · 딜러</th><th>품목</th><th class="n">금액</th><th>입금자</th><th>상태</th><th>입금기한 · 송장</th></tr></thead>
    <tbody>
    ${!list.length ? `<tr><td colspan="7" class="mut" style="text-align:center;padding:40px">해당하는 주문이 없습니다.</td></tr>` : list.map(o => {
      const items = o.order_items || [];
      const qty = items.reduce((a, i) => a + i.qty, 0);
      const over = o.status === 'pending_payment' && new Date(o.pay_deadline) < now;
      const open = A.open.has(o.id);
      return `
      <tr class="main ${open ? 'open' : ''}" data-id="${o.id}">
        <td><div class="no">${esc(o.order_no)}</div><div class="d">${fmtDT(o.created_at)}</div></td>
        <td><b>${esc(o.orderer_name || o.dealers?.manager_name || '')}</b><div class="d">${dealerName(o.dealers)}</div></td>
        <td>${items[0] ? esc(items[0].product_name) + (items.length > 1 ? ` <span class="mut">외 ${items.length - 1}건</span>` : '') : ''} <span class="mut">· ${qty}개</span></td>
        <td class="n">${won(o.total)}</td>
        <td>${esc(o.depositor_name)}</td>
        <td>${statusBadge(o.status)}${o.paid_notified_at && o.status === 'pending_payment' ? `<div class="d" style="color:var(--ok);font-weight:700">● 입금 알림</div>` : ''}${o.tax_invoice ? `<div class="d" style="color:${o.tax_issued ? 'var(--ok)' : 'var(--acc)'}">계산서 ${o.tax_issued ? '발행됨' : '요청'}</div>` : ''}</td>
        <td class="d">${o.status === 'pending_payment' ? `<span class="${over ? 'over' : ''}">${fmtDT(o.pay_deadline)}${over ? ' 초과' : ''}</span>` : o.tracking_no ? `${esc(o.carrier || '')} ${esc(o.tracking_no)}` : ''}</td>
      </tr>
      ${open ? orderDetail(o) : ''}`;
    }).join('')}
    </tbody>
  </table></div>`;

  $$('.kpi').forEach(b => b.onclick = () => { A.f.st = b.dataset.st; viewOrders(); });
  $('#q').oninput = e => { A.f.q = e.target.value; clearTimeout(viewOrders._t); viewOrders._t = setTimeout(() => { viewOrders(); const q = $('#q'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }, 250); };
  $('#from').onchange = e => { A.f.from = e.target.value; viewOrders(); };
  $('#to').onchange = e => { A.f.to = e.target.value; viewOrders(); };
  $('#refresh').onclick = async () => { await reload(); viewOrders(); toast('최신 주문을 불러왔습니다'); };
  $('#csv').onclick = () => downloadCSV(list);
  $$('tr.main').forEach(tr => tr.onclick = () => { const id = +tr.dataset.id; A.open.has(id) ? A.open.delete(id) : A.open.add(id); viewOrders(); });
  bindDetail();
}

function orderDetail(o) {
  const items = o.order_items || [], d = o.dealers || {};
  const next = { pending_payment: ['paid', '입금 확인'], paid: ['preparing', '출고 준비'], preparing: ['shipped', '배송 시작 (송장 필요)'], shipped: ['delivered', '배송 완료'] }[o.status];
  return `
  <tr class="detail"><td colspan="7"><div class="in" data-oid="${o.id}">
    <div>
      <table>${items.map(i => `<tr><td>${esc(i.product_name)} <span class="mut">· ${esc(i.option_name)} · ${esc(i.sku || '')}</span></td><td class="n">${i.discount_rate ? `<span style="color:var(--acc)">${i.discount_rate}%↓</span> ` : ''}${won(i.unit_price)} × ${i.qty}</td><td class="n">${won(i.line_total)}원</td></tr>`).join('')}
        <tr><td class="mut">배송비</td><td></td><td class="n">${o.shipping_fee ? won(o.shipping_fee) + '원' : '무료'}</td></tr>
        ${o.coupon_discount ? `<tr><td class="mut">쿠폰 · ${esc(o.coupon_name || '')}</td><td></td><td class="n" style="color:var(--acc)">−${won(o.coupon_discount)}원</td></tr>` : ''}
        <tr><td><b>합계</b></td><td></td><td class="n"><b>${won(o.total)}원</b></td></tr></table>
      ${o.status !== 'cancelled' ? `
      <div class="stat-btns">
        ${next ? `<button class="btn sm pri" data-next="${next[0]}">${next[1]} →</button>` : ''}
        ${o.status !== 'delivered' ? `<button class="btn sm ghost" data-cancel>주문 취소 (재고 복원)</button>` : ''}
        <select data-set title="상태 직접 변경" class="btn sm ghost" style="padding:6px 8px">
          <option value="">상태 직접 변경…</option>${FLOW.filter(s => s !== o.status).map(s => `<option value="${s}">${STATUS[s]}</option>`).join('')}
        </select>
      </div>` : `<p class="small mut" style="margin-top:12px">취소 · ${fmtDT(o.cancelled_at)} · ${esc(o.cancel_reason || '')}</p>`}
    </div>
    <div>
      <dl>
        <dt>딜러</dt><dd>${esc(d.company || '')} ${esc(d.branch || '')} · ${esc(d.manager_name || '')} ${esc(d.phone || '')}</dd>
        ${o.orderer_name ? `<dt>주문자</dt><dd>${esc(o.orderer_name)} · ${esc(o.orderer_phone || '')}</dd>` : ''}
        <dt>받는 분</dt><dd>${esc(o.ship_name)} · ${esc(o.ship_phone)}${/다른 주소 배송|고객 직접 배송/.test(o.memo || '') ? ' <span class="badge st-preparing">다른 주소</span>' : ''}</dd>
        <dt>배송지</dt><dd>${esc(o.ship_address)}</dd>
        ${o.memo ? `<dt>요청사항</dt><dd>${esc(o.memo)}</dd>` : ''}
        ${o.tax_invoice ? `<dt>세금계산서</dt><dd><b>발행 요청</b> · ${esc(o.tax_biz_no || '')} · ${esc(o.tax_email || '')}
          <label class="small" style="margin-left:8px"><input type="checkbox" data-taxdone ${o.tax_issued ? 'checked' : ''}> 발행 완료</label></dd>` : ''}
        <dt>처리 이력</dt><dd class="small">주문 ${fmtDT(o.created_at)}${o.paid_notified_at ? `<br><b style="color:var(--ok)">딜러 입금 알림 ${fmtDT(o.paid_notified_at)}</b>` : ''}${o.paid_at ? `<br>입금확인 ${fmtDT(o.paid_at)}` : ''}${o.shipped_at ? `<br>출고 ${fmtDT(o.shipped_at)}` : ''}${o.delivered_at ? `<br>배송완료 ${fmtDT(o.delivered_at)}${o.delivered_by === 'dealer' ? ' (딜러 수령 확인)' : o.delivered_by === 'auto' ? ' (자동)' : ''}` : ''}</dd>
      </dl>
      <div class="ship">
        <select data-carrier><option value="">택배사</option>${CARRIERS.map(c => `<option ${o.carrier === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
        <input data-tracking placeholder="송장번호" value="${esc(o.tracking_no || '')}">
        <button class="btn sm" data-saveship>저장</button>
      </div>
      ${o.tracking_no && trackUrl(o.carrier, o.tracking_no) ? `<a class="small" href="${esc(trackUrl(o.carrier, o.tracking_no))}" target="_blank" rel="noopener" style="display:inline-block;margin-top:6px;text-decoration:underline">${esc(o.carrier || '')} ${esc(o.tracking_no)} 배송 조회 ↗</a>` : ''}
      <textarea data-memo rows="2" placeholder="관리자 메모 (딜러에게 보이지 않음)">${esc(o.admin_memo || '')}</textarea>
      <button class="btn sm ghost" data-savememo style="margin-top:6px">메모 저장</button>
    </div>
  </div></td></tr>`;
}

function bindDetail() {
  $$('.detail .in').forEach(box => {
    const id = +box.dataset.oid, o = A.orders.find(x => x.id === id);
    const ship = () => ({ carrier: $('[data-carrier]', box).value || null, tracking_no: $('[data-tracking]', box).value.trim() || null });
    const set = async (patch, msg) => {
      try { await api.updOrder(id, patch); await reload(); viewOrders(); toast(msg); }
      catch (e) { toast(errMsg(e), 4000); }
    };
    const nx = $('[data-next]', box);
    if (nx) nx.onclick = () => {
      const st = nx.dataset.next;
      if (st === 'shipped') {
        const s = ship();
        if (!s.tracking_no) return toast('택배사와 송장번호를 먼저 입력해 주세요');
        return set({ status: st, ...s }, `${o.order_no} 배송 시작`);
      }
      set({ status: st }, `${o.order_no} → ${STATUS[st]}`);
    };
    const cc = $('[data-cancel]', box);
    if (cc) cc.onclick = () => {
      const why = prompt('취소 사유 (딜러에게 표시됩니다)', '관리자 취소');
      if (why === null) return;  // 사유 입력이 필요해 prompt 유지
      set({ status: 'cancelled', cancel_reason: why || '관리자 취소' }, `${o.order_no} 취소 · 재고 복원`);
    };
    const sel = $('[data-set]', box);
    if (sel) sel.onchange = async () => { if (sel.value && await ask(`상태를 '${STATUS[sel.value]}'(으)로 바꿀까요?`)) set({ status: sel.value }, '상태를 변경했습니다'); else sel.value = ''; };
    $('[data-saveship]', box).onclick = () => set(ship(), '송장 정보를 저장했습니다');
    const tx = $('[data-taxdone]', box);
    if (tx) tx.onchange = () => set({ tax_issued: tx.checked }, tx.checked ? '세금계산서 발행 완료로 표시했습니다' : '발행 완료 표시를 해제했습니다');
    $('[data-savememo]', box).onclick = () => set({ admin_memo: $('[data-memo]', box).value.trim() || null }, '메모를 저장했습니다');
  });
}

function downloadCSV(list) {
  const head = ['주문일시', '주문번호', '상태', '딜러사', '지점', '담당자', '딜러연락처', '상품', '옵션', 'SKU', '단가', '수량', '금액', '배송비', '주문총액', '입금자', '받는분', '받는분연락처', '배송지', '요청사항', '택배사', '송장번호', '입금확인일시', '출고일시', '배송완료일시', '관리자메모', '주문자', '주문자연락처', '세금계산서', '사업자번호', '계산서이메일', '쿠폰', '쿠폰할인'];
  const rows = [];
  for (const o of list) for (const [k, i] of (o.order_items || []).entries()) {
    const d = o.dealers || {};
    rows.push([fmtDT(o.created_at), o.order_no, STATUS[o.status], d.company, d.branch, d.manager_name, d.phone, i.product_name, i.option_name, i.sku, i.unit_price, i.qty, i.line_total,
      k === 0 ? o.shipping_fee : '', k === 0 ? o.total : '', o.depositor_name, o.ship_name, o.ship_phone, o.ship_address, o.memo, o.carrier, o.tracking_no, fmtDT(o.paid_at), fmtDT(o.shipped_at), fmtDT(o.delivered_at), o.admin_memo,
      o.orderer_name, o.orderer_phone, o.tax_invoice ? (o.tax_issued ? '발행완료' : '요청') : '', o.tax_biz_no, o.tax_email, k === 0 ? o.coupon_name : '', k === 0 ? o.coupon_discount || '' : '']);
  }
  const csv = [head, ...rows].map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `주문내역_${new Date().toLocaleDateString('sv-SE')}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ---------------------------------------------------------------- 재고 · 가격
function viewStock() {
  A.dirty = {};
  const totalStock = A.variants.filter(v => v.active).reduce((a, v) => a + v.stock, 0);
  const sold = A.variants.filter(v => v.active && v.stock <= 0).length;
  app().innerHTML = `
  <div class="page-head">
    <div><div class="eyebrow">Stock · ${A.variants.length} SKU</div><h1>재고 · 가격</h1></div>
    <div class="small mut" style="text-align:right">총 재고 <b class="num" style="color:var(--ink)">${won(totalStock)}</b>개 · 품절 <b class="num" style="color:var(--bad)">${sold}</b>개 옵션<br>재고를 0으로 두면 딜러 화면에서 자동으로 품절 처리됩니다.</div>
  </div>
  <div class="bar"><input type="search" id="sq" placeholder="상품 · 옵션 · SKU 검색"><label class="small"><input type="checkbox" id="onlylow"> 품절·5개 이하만</label></div>
  <div class="tbl-wrap"><table class="tbl" id="stbl">
    <thead><tr><th>SKU</th><th>옵션</th><th class="n">공급가</th><th class="n">소비자가</th><th class="n">재고</th><th class="n">최소수량</th><th>판매</th></tr></thead>
    <tbody>
    ${A.products.map((p, pi) => {
      const vs = A.variants.filter(v => v.product_id === p.id);
      return `
      <tr class="grp ${p.active ? '' : 'off'}" data-pid="${p.id}"><td colspan="6"><span class="sorter"><button type="button" data-mv="-1" data-pid="${p.id}" title="위로" ${pi === 0 ? 'disabled' : ''}>▲</button><button type="button" data-mv="1" data-pid="${p.id}" title="아래로" ${pi === A.products.length - 1 ? 'disabled' : ''}>▼</button></span>${pi + 1}. ${esc(p.name)} <span class="mut" style="font-weight:400">· ${esc(p.category || '')}</span></td>
        <td><div class="flags">
          <label class="small"><input type="checkbox" class="toggle" data-pflag="is_new" data-pid="${p.id}" ${p.is_new ? 'checked' : ''}> <span class="fl-new">NEW</span></label>
          <label class="small"><input type="checkbox" class="toggle" data-pflag="is_best" data-pid="${p.id}" ${p.is_best ? 'checked' : ''}> <span class="fl-best">BEST</span></label>
          <label class="small"><input type="checkbox" class="toggle" data-pact="${p.id}" ${p.active ? 'checked' : ''}> 상품 노출</label>
          <button class="btn sm ghost" data-pedit="${p.id}" type="button">문구 수정</button>
        </div></td></tr>
      ${vs.map(v => `
      <tr class="${v.active ? '' : 'off'}" data-vid="${v.id}" data-s="${esc((p.name + ' ' + v.option_name + ' ' + v.sku).toLowerCase())}" data-low="${v.stock <= 5 ? 1 : 0}">
        <td class="no small">${esc(v.sku)}</td>
        <td>${esc(v.option_name)} ${v.stock <= 0 ? '<span class="badge b-soldout">품절</span>' : v.stock <= 5 ? '<span class="badge b-low">적음</span>' : ''}</td>
        <td class="n"><input class="num" data-k="price" value="${v.price}" inputmode="numeric"></td>
        <td class="n"><input class="num" data-k="retail_price" value="${v.retail_price ?? ''}" inputmode="numeric"></td>
        <td class="n"><input class="num" data-k="stock" value="${v.stock}" inputmode="numeric"></td>
        <td class="n"><input class="num" data-k="min_qty" value="${v.min_qty}" inputmode="numeric" style="width:60px"></td>
        <td><input type="checkbox" class="toggle" data-k="active" ${v.active ? 'checked' : ''}></td>
      </tr>`).join('')}`;
    }).join('')}
    </tbody>
  </table></div>
  <div class="savebar" id="savebar"><span id="dirtyn"></span><span class="sp" style="flex:1"></span><button class="btn sm" id="undo">되돌리기</button><button class="btn sm pri" id="save">저장</button></div>`;

  const filt = () => {
    const q = $('#sq').value.trim().toLowerCase(), low = $('#onlylow').checked;
    $$('#stbl tr[data-vid]').forEach(tr => tr.style.display = (!q || tr.dataset.s.includes(q)) && (!low || tr.dataset.low === '1') ? '' : 'none');
  };
  $('#sq').oninput = filt; $('#onlylow').onchange = filt;

  $$('#stbl tr[data-vid]').forEach(tr => {
    const id = +tr.dataset.vid, v = A.variants.find(x => x.id === id);
    $$('[data-k]', tr).forEach(inp => {
      inp.addEventListener(inp.type === 'checkbox' ? 'change' : 'input', () => {
        const k = inp.dataset.k;
        let val = inp.type === 'checkbox' ? inp.checked : inp.value.replace(/[^\d]/g, '');
        if (inp.type !== 'checkbox') { inp.value = val; val = val === '' ? (k === 'retail_price' ? null : 0) : +val; }
        A.dirty[id] = A.dirty[id] || {};
        if (val === v[k]) delete A.dirty[id][k]; else A.dirty[id][k] = val;
        if (!Object.keys(A.dirty[id]).length) delete A.dirty[id];
        inp.classList.toggle('dirty', val !== v[k]);
        const n = Object.keys(A.dirty).length;
        $('#savebar').classList.toggle('show', n > 0);
        $('#dirtyn').textContent = `${n}개 옵션 변경됨`;
      });
    });
  });
  $('#undo').onclick = viewStock;
  $('#save').onclick = async () => {
    const btn = $('#save'); btn.disabled = true;
    try {
      for (const [id, patch] of Object.entries(A.dirty)) {
        if (patch.min_qty !== undefined && patch.min_qty < 1) patch.min_qty = 1;
        await api.updVariant(+id, patch);
      }
      const n = Object.keys(A.dirty).length;
      await reload(); viewStock(); toast(`${n}개 옵션을 저장했습니다`);
    } catch (e) { toast(errMsg(e), 4000); btn.disabled = false; }
  };
  $$('[data-pedit]').forEach(b => b.onclick = () => editProduct(+b.dataset.pedit));
  // 상품 노출 순서: 위·아래 상품과 자리 바꾸기 (딜러 화면 목록 순서)
  $$('[data-mv]').forEach(b => b.onclick = async () => {
    const list = [...A.products], i = list.findIndex(p => p.id === +b.dataset.pid), j = i + +b.dataset.mv;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    try {
      const changes = list.map((p, k) => ({ p, sort: k + 1 })).filter(x => x.p.sort !== x.sort);
      for (const x of changes) await api.updProduct(x.p.id, { sort: x.sort });
      await reload(); viewStock(); toast('노출 순서를 바꿨습니다');
    } catch (e) { toast(errMsg(e), 4000); }
  });
  $$('[data-pflag]').forEach(cb => cb.onchange = async () => {
    const k = cb.dataset.pflag, nm = k === 'is_new' ? 'NEW' : 'BEST';
    try { await api.updProduct(+cb.dataset.pid, { [k]: cb.checked }); await reload(); viewStock(); toast(cb.checked ? `${nm} 딱지를 붙였습니다` : `${nm} 딱지를 뗐습니다`); }
    catch (e) { toast(errMsg(e), 4000); cb.checked = !cb.checked; }
  });
  $$('[data-pact]').forEach(cb => cb.onchange = async () => {
    try { await api.updProduct(+cb.dataset.pact, { active: cb.checked }); await reload(); viewStock(); toast(cb.checked ? '상품을 노출합니다' : '상품을 숨겼습니다'); }
    catch (e) { toast(errMsg(e), 4000); }
  });
}

// ---------------------------------------------------------------- 딜러
function viewDealers() {
  const LBL = { pending: '승인대기', approved: '승인', rejected: '거절' };
  const cls = { pending: 'st-pending_payment', approved: 'st-paid', rejected: 'st-cancelled' };
  const list = [...A.dealers].filter(d => !d.is_admin).sort((a, b) => (a.status === 'pending' ? -1 : 0) - (b.status === 'pending' ? -1 : 0));
  const stat = id => { const os = A.orders.filter(o => o.dealer_id === id && o.status !== 'cancelled'); return [os.length, os.reduce((a, o) => a + o.total, 0)]; };
  app().innerHTML = `
  <div class="page-head"><div><div class="eyebrow">Dealers · ${list.length}</div><h1>딜러</h1></div>
    <div class="small mut">승인된 딜러만 공급가를 보고 주문할 수 있습니다.</div></div>
  <div class="tbl-wrap"><table class="tbl">
    <thead><tr><th>가입일</th><th>딜러사 · 지점</th><th>담당자 · 연락처</th><th>이메일</th><th>사업자번호</th><th class="n">주문 · 누적금액</th><th>상태</th><th></th></tr></thead>
    <tbody>
    ${!list.length ? `<tr><td colspan="8" class="mut" style="text-align:center;padding:40px">아직 가입한 딜러가 없습니다.</td></tr>` : list.map(d => {
      const [n, s] = stat(d.id);
      return `<tr>
        <td class="d">${fmtDT(d.created_at)}</td>
        <td>${dealerName(d)}<div class="d">${esc(d.address || '')}</div></td>
        <td>${esc(d.manager_name)}${d.position ? ` <span class="mut">${esc(d.position)}</span>` : ''}<div class="d">${esc(d.phone)}</div></td>
        <td class="small">${esc(d.email)}</td>
        <td class="small">${esc(d.biz_no || '-')}</td>
        <td class="n">${n}건<div class="d">${won(s)}원</div></td>
        <td><span class="badge ${cls[d.status]}">${LBL[d.status]}</span>${d.email_confirmed === false ? '<div class="d" style="color:var(--bad)">메일 미인증</div>' : ''}</td>
        <td><div class="acts">
          ${d.status !== 'approved' ? `<button class="btn sm pri" data-ds="approved" data-id="${d.id}">승인</button>` : ''}
          ${d.status !== 'rejected' ? `<button class="btn sm ghost" data-ds="rejected" data-id="${d.id}">${d.status === 'approved' ? '이용 중지' : '거절'}</button>` : ''}
          ${n ? '' : `<button class="btn sm ghost del-btn" data-del="${d.id}" title="주문 내역이 없는 계정만 삭제할 수 있어요">삭제</button>`}
        </div></td></tr>`;
    }).join('')}
    </tbody></table></div>`;
  $$('[data-del]').forEach(b => b.onclick = async () => {
    const d = A.dealers.find(x => x.id === b.dataset.del);
    if (!await ask(`${d.company} ${d.branch || ''} (${d.email})\n계정을 완전히 삭제할까요?\n로그인 계정·딜러 정보·문의 내역이 모두 지워지며 되돌릴 수 없습니다.`, { ok: '삭제', danger: true })) return;
    try { await api.delDealer(d.id); await reload(); viewDealers(); toast('계정을 삭제했습니다'); }
    catch (e) { toast(errMsg(e), 5000); }
  });
  $$('[data-ds]').forEach(b => b.onclick = async () => {
    const d = A.dealers.find(x => x.id === b.dataset.id), st = b.dataset.ds;
    if (!await ask(`${d.company} ${d.branch || ''}\n${st === 'approved' ? '승인' : '거절 / 이용 중지'} 하시겠습니까?`, { danger: st !== 'approved' })) return;
    try { await api.updDealer(d.id, { status: st }); await reload(); viewDealers(); toast(st === 'approved' ? '승인했습니다' : '처리했습니다'); }
    catch (e) { toast(errMsg(e), 4000); }
  });
}

// ---------------------------------------------------------------- 설정
// ---------------------------------------------------------------- 공지
function viewNotices() {
  const ed = A.editNotice ? A.notices.find(n => n.id === A.editNotice) : null;
  app().innerHTML = `
  <div class="page-head"><div><div class="eyebrow">Notice · ${A.notices.length}</div><h1>공지사항</h1></div>
    <div class="small mut">가장 위 공지 한 줄이 딜러 상품 화면 맨 위에 보입니다.</div></div>
  <div class="ntc-admin">
    <form id="nf" class="panel" novalidate>
      <h2>${ed ? '공지 수정' : '새 공지'}</h2>
      <div class="field"><label>제목<em>*</em></label><input name="title" value="${esc(ed?.title)}" placeholder="예) 10월 9일 한글날 휴무 안내"></div>
      <div class="field"><label>내용</label><textarea name="body" rows="6" placeholder="첫 줄은 상품 화면 상단 띠에도 함께 보입니다.">${esc(ed?.body)}</textarea></div>
      <label class="check"><input type="checkbox" name="pinned" ${ed?.pinned ? 'checked' : ''}> <span><b>필독</b> — 다른 공지보다 항상 위에 고정</span></label>
      <div style="display:flex;gap:8px"><button class="btn pri" type="submit">${ed ? '수정 저장' : '공지 올리기'}</button>${ed ? '<button class="btn ghost" type="button" id="cancelEd">취소</button>' : ''}</div>
    </form>
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>제목</th><th>등록일</th><th>상태</th><th></th></tr></thead>
      <tbody>${!A.notices.length ? '<tr><td colspan="4" class="mut" style="text-align:center;padding:40px">등록된 공지가 없습니다.</td></tr>' : A.notices.map(n => `
        <tr class="${n.active ? '' : 'off'}">
          <td>${n.pinned ? '<span class="badge st-pending_payment">필독</span> ' : ''}<b>${esc(n.title)}</b><div class="d">${esc((n.body || '').split('\n')[0])}</div></td>
          <td class="d">${fmtDT(n.created_at)}</td>
          <td>${n.active ? '<span class="badge st-paid">게시중</span>' : '<span class="badge st-cancelled">숨김</span>'}</td>
          <td><div class="acts">
            <button class="btn sm ghost" data-ned="${n.id}">수정</button>
            <button class="btn sm ghost" data-nact="${n.id}">${n.active ? '숨기기' : '다시 게시'}</button>
            <button class="btn sm ghost" data-ndel="${n.id}">삭제</button>
          </div></td></tr>`).join('')}</tbody>
    </table></div>
  </div>`;
  const f = $('#nf');
  f.onsubmit = async e => {
    e.preventDefault();
    const title = f.title.value.trim();
    if (!title) return toast('제목을 입력해 주세요');
    try {
      await api.saveNotice(A.editNotice, { title, body: f.body.value.trim() || null, pinned: f.pinned.checked });
      toast(A.editNotice ? '공지를 수정했습니다' : '공지를 올렸습니다');
      A.editNotice = null; await reload(); viewNotices();
    } catch (err) { toast(errMsg(err), 4000); }
  };
  $('#cancelEd') && ($('#cancelEd').onclick = () => { A.editNotice = null; viewNotices(); });
  $$('[data-ned]').forEach(b => b.onclick = () => { A.editNotice = +b.dataset.ned; viewNotices(); window.scrollTo(0, 0); });
  $$('[data-nact]').forEach(b => b.onclick = async () => {
    const n = A.notices.find(x => x.id === +b.dataset.nact);
    try { await api.saveNotice(n.id, { active: !n.active }); await reload(); viewNotices(); toast(n.active ? '공지를 숨겼습니다' : '공지를 다시 게시했습니다'); }
    catch (e) { toast(errMsg(e), 4000); }
  });
  $$('[data-ndel]').forEach(b => b.onclick = async () => {
    const n = A.notices.find(x => x.id === +b.dataset.ndel);
    if (!await ask(`'${n.title}' 공지를 삭제할까요?\n되돌릴 수 없습니다.`, { ok: '삭제', danger: true })) return;
    try { await api.delNotice(n.id); if (A.editNotice === n.id) A.editNotice = null; await reload(); viewNotices(); toast('공지를 삭제했습니다'); }
    catch (e) { toast(errMsg(e), 4000); }
  });
}

function viewSettings() {
  const s = A.settings;
  const tiers = [...(s.qty_discounts || []), {}, {}, {}].slice(0, 3);
  app().innerHTML = `
  <div class="page-head"><div><div class="eyebrow">Settings</div><h1>설정</h1></div></div>
  <form id="sf" class="set-grid" novalidate>
    <div class="panel">
      <h2>입금 계좌</h2>
      <div class="grid2">
        <div class="field"><label>은행</label><input name="bank_name" value="${esc(s.bank_name)}"></div>
        <div class="field"><label>예금주</label><input name="bank_holder" value="${esc(s.bank_holder)}"></div>
      </div>
      <div class="field"><label>계좌번호</label><input name="bank_account" value="${esc(s.bank_account)}"></div>
      <h2 style="margin-top:18px">주문 · 배송</h2>
      <div class="grid2">
        <div class="field"><label>입금 기한 (일)</label><input name="pay_deadline_days" inputmode="numeric" value="${s.pay_deadline_days ?? 3}"><span class="hint">기한이 지나면 자동 취소 · 재고 복원</span></div>
        <div class="field"><label>자동 배송완료 (일)</label><input name="auto_deliver_days" inputmode="numeric" value="${s.auto_deliver_days ?? 3}"><span class="hint">배송 시작 후 이 기간이 지나면 자동 배송완료 · 딜러가 [받았어요]를 누르면 즉시 완료</span></div>
        <div class="field"><label>배송비 (원)</label><input name="shipping_fee" inputmode="numeric" value="${s.shipping_fee ?? 0}"></div>
      </div>
      <div class="field"><label>무료배송 기준 금액 (원)</label><input name="free_shipping_over" inputmode="numeric" value="${s.free_shipping_over ?? ''}"><span class="hint">비워두면 항상 배송비 부과</span></div>
      <div class="field"><label>주문 완료 안내 문구</label><textarea name="notice" rows="3">${esc(s.notice)}</textarea></div>
      <div class="field"><label>배송 · 교환 안내 (상품 화면에 표시)</label><textarea name="ship_info" rows="5">${esc(s.ship_info)}</textarea></div>
      <h2 style="margin-top:18px">수량 구간 할인</h2>
      <p class="small mut" style="margin:-6px 0 12px">같은 상품(옵션 합산) 주문 수량이 기준 이상이면 공급가에서 할인됩니다. 비워 두면 할인 없음.</p>
      ${tiers.map((t, i) => `<div class="tier-row"><input name="tmin${i}" inputmode="numeric" value="${t.min ?? ''}" placeholder="수량"><span>개 이상</span><input name="trate${i}" inputmode="numeric" value="${t.rate ?? ''}" placeholder="%"><span>% 할인</span></div>`).join('')}
    </div>
    <div class="panel">
      <h2>사업자 정보</h2>
      <p class="small mut" style="margin:-6px 0 12px">사이트 하단, 약관, 견적서·거래명세서에 표시됩니다.</p>
      <div class="field"><label>상호</label><input name="biz_name" value="${esc(s.biz_name)}"></div>
      <div class="grid2">
        <div class="field"><label>대표자</label><input name="biz_owner" value="${esc(s.biz_owner)}"></div>
        <div class="field"><label>사업자등록번호</label><input name="biz_no" value="${esc(s.biz_no)}" placeholder="000-00-00000"></div>
      </div>
      <div class="field"><label>통신판매업 신고번호</label><input name="mail_order_no" value="${esc(s.mail_order_no)}" placeholder="예) 제2026-서울강남-0000호"></div>
      <div class="field"><label>사업장 주소</label><input name="biz_addr" value="${esc(s.biz_addr)}"></div>
      <div class="grid2">
        <div class="field"><label>대표 전화</label><input name="biz_phone" value="${esc(s.biz_phone)}"></div>
        <div class="field"><label>대표 이메일</label><input name="biz_email" value="${esc(s.biz_email)}"></div>
      </div>
      <div class="field"><label>개인정보 관리책임자</label><input name="privacy_officer" value="${esc(s.privacy_officer)}" placeholder="예) 홍길동 (대표)"></div>
      <button class="btn pri block" type="submit" style="margin-top:10px">설정 전체 저장</button>
    </div>
  </form>`;
  $('#sf').onsubmit = async e => {
    e.preventDefault();
    const f = e.target, n = k => { const v = f[k].value.replace(/[^\d]/g, ''); return v === '' ? null : +v; }, t = k => f[k].value.trim() || null;
    const qty_discounts = [0, 1, 2].map(i => ({ min: n('tmin' + i), rate: n('trate' + i) })).filter(x => x.min && x.rate).sort((a, b) => a.min - b.min);
    if (qty_discounts.some(x => x.rate >= 100)) return toast('할인율은 100% 미만이어야 합니다');
    const patch = { bank_name: t('bank_name'), bank_holder: t('bank_holder'), bank_account: t('bank_account'),
      pay_deadline_days: n('pay_deadline_days') || 3, auto_deliver_days: n('auto_deliver_days') || 3, shipping_fee: n('shipping_fee') || 0, free_shipping_over: n('free_shipping_over'),
      notice: t('notice'), ship_info: t('ship_info'), qty_discounts,
      biz_name: t('biz_name'), biz_owner: t('biz_owner'), biz_no: t('biz_no'), mail_order_no: t('mail_order_no'), biz_addr: t('biz_addr'),
      biz_phone: t('biz_phone'), biz_email: t('biz_email'), privacy_officer: t('privacy_officer') };
    try { await api.updSettings(patch); await reload(); viewSettings(); toast('설정을 저장했습니다'); }
    catch (err) { toast(errMsg(err), 4000); }
  };
}

// ---------------------------------------------------------------- 1:1 문의
function viewInquiriesAdmin() {
  const ST = { open: ['답변 대기', 'st-pending_payment'], answered: ['답변 완료', 'st-paid'], closed: ['종료', 'st-cancelled'] };
  const list = A.inquiries.filter(q => A.inqF === 'all' || q.status === A.inqF);
  const cnt = k => A.inquiries.filter(q => k === 'all' || q.status === k).length;
  app().innerHTML = `
  <div class="page-head"><div><div class="eyebrow">Inquiry</div><h1>1:1 문의</h1></div>
    <div class="small mut">답변을 저장하면 딜러에게 메일로 알림이 갑니다.</div></div>
  <div class="filters">${[['open', '답변 대기'], ['answered', '답변 완료'], ['closed', '종료'], ['all', '전체']].map(([k, l]) => `<button class="chip ${A.inqF === k ? 'on' : ''}" data-f="${k}">${l} ${cnt(k)}</button>`).join('')}</div>
  ${!list.length ? '<div class="empty">해당하는 문의가 없습니다.</div>' : list.map(q => `
  <div class="panel inq-a" data-id="${q.id}">
    <div class="inq-h"><span class="badge ${ST[q.status][1]}">${ST[q.status][0]}</span><span class="cat-tag">${esc(q.category)}</span><b>${esc(q.title)}</b>
      <span class="d" style="margin-left:auto">${fmtDT(q.created_at)}</span></div>
    <div class="small mut" style="margin:6px 0 10px">${dealerName(q.dealers)} · ${esc(q.dealers?.manager_name || '')} ${esc(q.dealers?.phone || '')}${q.orders?.order_no ? ` · 주문 <b>${esc(q.orders.order_no)}</b>` : ''}</div>
    <div class="inq-body">${esc(q.body)}</div>
    <textarea rows="4" placeholder="답변을 입력하세요">${esc(q.answer || '')}</textarea>
    <div class="acts" style="justify-content:flex-start;margin-top:8px">
      <button class="btn sm pri" data-ans>${q.answer ? '답변 수정' : '답변 저장 · 메일 발송'}</button>
      ${q.status !== 'closed' ? '<button class="btn sm ghost" data-close>종료 처리</button>' : ''}
      ${q.answered_at ? `<span class="d">답변 ${fmtDT(q.answered_at)}</span>` : ''}
    </div>
  </div>`).join('')}`;
  $$('[data-f]').forEach(b => b.onclick = () => { A.inqF = b.dataset.f; viewInquiriesAdmin(); });
  $$('.inq-a').forEach(box => {
    const id = +box.dataset.id;
    $('[data-ans]', box).onclick = async () => {
      const answer = $('textarea', box).value.trim();
      if (!answer) return toast('답변을 입력해 주세요');
      try { await api.updInquiry(id, { answer }); await reload(); viewInquiriesAdmin(); toast('답변을 저장했습니다'); }
      catch (e) { toast(errMsg(e), 4000); }
    };
    const c = $('[data-close]', box);
    if (c) c.onclick = async () => {
      try { await api.updInquiry(id, { status: 'closed' }); await reload(); viewInquiriesAdmin(); toast('종료 처리했습니다'); }
      catch (e) { toast(errMsg(e), 4000); }
    };
  });
}

// ---------------------------------------------------------------- 쿠폰
const CP_KIND = { amount: '정액 할인', percent: '정률 할인', free_ship: '무료배송' };
const CP_TARGET = { code: '코드 입력', all: '전체 딜러', assigned: '지정 딜러' };
const cpBenefit = c => c.kind === 'amount' ? `${won(c.value)}원 할인` : c.kind === 'percent' ? `${c.value}% 할인${c.max_discount ? ` (최대 ${won(c.max_discount)}원)` : ''}` : '배송비 무료';
const dayStr = t => t ? new Date(t).toLocaleDateString('sv-SE') : '';

function viewCoupons() {
  const ed = A.editCoupon ? A.coupons.find(c => c.id === A.editCoupon) : null;
  const used = id => A.orders.filter(o => o.coupon_id === id && o.status !== 'cancelled').length;
  const dealers = A.dealers.filter(d => !d.is_admin && d.status === 'approved');
  const granted = new Set((ed?.coupon_grants || []).map(g => g.dealer_id));
  const f0 = ed || { kind: 'amount', target: 'code', once_per_dealer: true, first_order_only: false, active: true, min_order: 0 };
  app().innerHTML = `
  <div class="page-head"><div><div class="eyebrow">Coupon · ${A.coupons.length}</div><h1>쿠폰</h1></div>
    <div class="small mut">쿠폰 할인은 수량 할인이 적용된 상품 금액에서 추가로 빠집니다.</div></div>
  <div class="cp-grid">
    <form id="cf" class="panel" novalidate>
      <h2>${ed ? '쿠폰 수정' : '새 쿠폰'}</h2>
      <div class="field"><label>쿠폰 이름<em>*</em></label><input name="name" value="${esc(f0.name)}" placeholder="예) 첫 구매 10% 할인"></div>
      <div class="field"><label>혜택 종류</label>
        <div class="seg3">${Object.entries(CP_KIND).map(([k, l]) => `<label><input type="radio" name="kind" value="${k}" ${f0.kind === k ? 'checked' : ''}> ${l}</label>`).join('')}</div></div>
      <div class="grid2">
        <div class="field" data-for="amount percent"><label id="vlabel">할인 금액 (원)</label><input name="value" inputmode="numeric" value="${f0.value ?? ''}"></div>
        <div class="field" data-for="percent"><label>최대 할인 금액 (원)</label><input name="max_discount" inputmode="numeric" value="${f0.max_discount ?? ''}" placeholder="비우면 제한 없음"></div>
      </div>
      <div class="field"><label>최소 주문 금액 (원)</label><input name="min_order" inputmode="numeric" value="${f0.min_order || ''}" placeholder="비우면 금액 제한 없음"><span class="hint">수량 할인 적용 후 상품 금액 기준</span></div>
      <div class="field"><label>사용 방법</label>
        <div class="seg3">${Object.entries(CP_TARGET).map(([k, l]) => `<label><input type="radio" name="target" value="${k}" ${f0.target === k ? 'checked' : ''}> ${l}</label>`).join('')}</div>
        <span class="hint" id="thint"></span></div>
      <div class="field" data-tfor="code all assigned"><label id="clabel">쿠폰 코드</label><input name="code" value="${esc(f0.code)}" placeholder="예) WELCOME10" style="text-transform:uppercase"></div>
      <div class="field" data-tfor="assigned"><label>지급할 딜러 (승인된 딜러 ${dealers.length}곳)</label>
        <div class="grant-list">${dealers.length ? dealers.map(d => `<label><input type="checkbox" name="grant" value="${d.id}" ${granted.has(d.id) ? 'checked' : ''}> ${esc(d.company)} ${esc(d.branch || '')} <span class="mut">${esc(d.manager_name)}</span></label>`).join('') : '<span class="mut small">아직 승인된 딜러가 없습니다.</span>'}</div></div>
      <div class="grid2">
        <div class="field"><label>시작일</label><input type="date" name="starts_at" value="${dayStr(f0.starts_at)}"></div>
        <div class="field"><label>종료일</label><input type="date" name="ends_at" value="${dayStr(f0.ends_at)}"></div>
      </div>
      <label class="check"><input type="checkbox" name="once_per_dealer" ${f0.once_per_dealer ? 'checked' : ''}> <span>딜러당 1회만 사용</span></label>
      <label class="check"><input type="checkbox" name="first_order_only" ${f0.first_order_only ? 'checked' : ''}> <span><b>첫 구매 전용</b> — 주문한 적 없는 딜러만 사용</span></label>
      <div style="display:flex;gap:8px"><button class="btn pri" type="submit">${ed ? '수정 저장' : '쿠폰 만들기'}</button>${ed ? '<button class="btn ghost" type="button" id="cpcancel">취소</button>' : ''}</div>
    </form>
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>쿠폰</th><th>혜택 · 조건</th><th>사용 방법</th><th>기간</th><th class="n">사용</th><th>상태</th><th></th></tr></thead>
      <tbody>${!A.coupons.length ? '<tr><td colspan="7" class="mut" style="text-align:center;padding:40px">아직 만든 쿠폰이 없습니다.</td></tr>' : A.coupons.map(c => {
        const n = used(c.id), expired = c.ends_at && new Date(c.ends_at) < new Date();
        return `<tr class="${c.active && !expired ? '' : 'off'}">
          <td><b>${esc(c.name)}</b>${c.code ? `<div class="d"><span class="cp-code">${esc(c.code)}</span></div>` : ''}</td>
          <td>${cpBenefit(c)}<div class="d">${c.min_order ? `${won(c.min_order)}원 이상` : '금액 제한 없음'}${c.first_order_only ? ' · 첫 구매' : ''}${c.once_per_dealer ? ' · 1회' : ''}</div></td>
          <td>${CP_TARGET[c.target]}${c.target === 'assigned' ? `<div class="d">${(c.coupon_grants || []).length}곳</div>` : ''}</td>
          <td class="d">${c.starts_at || c.ends_at ? `${dayStr(c.starts_at) || '~'} ~ ${dayStr(c.ends_at) || ''}` : '상시'}</td>
          <td class="n">${n}회</td>
          <td>${expired ? '<span class="badge st-cancelled">기간 종료</span>' : c.active ? '<span class="badge st-paid">사용 중</span>' : '<span class="badge st-cancelled">중지</span>'}</td>
          <td><div class="acts">
            <button class="btn sm ghost" data-ced="${c.id}">수정</button>
            <button class="btn sm ghost" data-cact="${c.id}">${c.active ? '중지' : '재개'}</button>
            ${n ? '' : `<button class="btn sm ghost del-btn" data-cdel="${c.id}">삭제</button>`}
          </div></td></tr>`;
      }).join('')}</tbody></table></div>
  </div>`;

  const f = $('#cf');
  const sync = () => {
    const k = f.kind.value, t = f.target.value;
    $$('[data-for]', f).forEach(el => el.style.display = el.dataset.for.split(' ').includes(k) ? '' : 'none');
    $$('[data-tfor]', f).forEach(el => el.style.display = el.dataset.tfor.split(' ').includes(t) ? '' : 'none');
    $('#vlabel').textContent = k === 'percent' ? '할인율 (%)' : '할인 금액 (원)';
    $('#clabel').innerHTML = t === 'code' ? '쿠폰 코드<em>*</em>' : '쿠폰 코드 <span class="mut" style="font-weight:400">(선택 · 코드로도 입력 가능)</span>';
    $('#thint').textContent = { code: '코드를 아는 딜러가 주문서에 직접 입력해서 사용합니다. 카톡·공지로 코드를 알려 주세요.',
      all: '승인된 모든 딜러의 주문서 쿠폰 목록에 자동으로 표시됩니다.', assigned: '아래에서 고른 딜러의 주문서 쿠폰 목록에만 표시됩니다.' }[t];
  };
  $$('input[name=kind], input[name=target]', f).forEach(r => r.onchange = sync);
  sync();
  f.onsubmit = async e => {
    e.preventDefault();
    const num = k => { const v = (f[k].value || '').replace(/[^\d]/g, ''); return v === '' ? null : +v; };
    const kind = f.kind.value, target = f.target.value, code = f.code.value.trim().toUpperCase() || null;
    if (!f.name.value.trim()) return toast('쿠폰 이름을 입력해 주세요');
    if (kind !== 'free_ship' && !num('value')) return toast(kind === 'percent' ? '할인율을 입력해 주세요' : '할인 금액을 입력해 주세요');
    if (kind === 'percent' && num('value') >= 100) return toast('할인율은 100% 미만이어야 합니다');
    if (target === 'code' && !code) return toast('코드 입력 방식은 쿠폰 코드가 필요합니다');
    if (code && A.coupons.some(c => c.code === code && c.id !== A.editCoupon)) return toast('이미 있는 쿠폰 코드입니다');
    const grants = target === 'assigned' ? $$('input[name=grant]:checked', f).map(x => x.value) : [];
    if (target === 'assigned' && !grants.length) return toast('지급할 딜러를 한 곳 이상 골라 주세요');
    const sd = f.starts_at.value, edd = f.ends_at.value;
    const patch = {
      name: f.name.value.trim(), code, kind, value: kind === 'free_ship' ? 0 : num('value'),
      max_discount: kind === 'percent' ? num('max_discount') : null, min_order: num('min_order') || 0, target,
      once_per_dealer: f.once_per_dealer.checked, first_order_only: f.first_order_only.checked,
      starts_at: sd ? new Date(sd + 'T00:00:00+09:00').toISOString() : null,
      ends_at: edd ? new Date(edd + 'T23:59:59+09:00').toISOString() : null,
    };
    if (!A.editCoupon) patch.active = true;
    try { await api.saveCoupon(A.editCoupon, patch, grants); toast(A.editCoupon ? '쿠폰을 수정했습니다' : '쿠폰을 만들었습니다'); A.editCoupon = null; await reload(); viewCoupons(); }
    catch (err) { toast(/duplicate|unique/i.test(err.message || '') ? '이미 있는 쿠폰 코드입니다' : errMsg(err), 4000); }
  };
  $('#cpcancel') && ($('#cpcancel').onclick = () => { A.editCoupon = null; viewCoupons(); });
  $$('[data-ced]').forEach(b => b.onclick = () => { A.editCoupon = +b.dataset.ced; viewCoupons(); window.scrollTo(0, 0); });
  $$('[data-cact]').forEach(b => b.onclick = async () => {
    const c = A.coupons.find(x => x.id === +b.dataset.cact);
    try { await api.saveCoupon(c.id, { active: !c.active }); await reload(); viewCoupons(); toast(c.active ? '쿠폰을 중지했습니다' : '쿠폰을 다시 사용합니다'); }
    catch (e) { toast(errMsg(e), 4000); }
  });
  $$('[data-cdel]').forEach(b => b.onclick = async () => {
    const c = A.coupons.find(x => x.id === +b.dataset.cdel);
    if (!await ask(`'${c.name}' 쿠폰을 삭제할까요?`, { ok: '삭제', danger: true })) return;
    try { await api.delCoupon(c.id); await reload(); viewCoupons(); toast('쿠폰을 삭제했습니다'); }
    catch (e) { toast(errMsg(e), 4000); }
  });
}

// ---------------------------------------------------------------- 상품 문구 수정
function editProduct(pid) {
  const p = A.products.find(x => x.id === pid);
  const ov = document.createElement('div');
  ov.className = 'ask-ov';
  ov.innerHTML = `<form class="ask pedit" novalidate>
    <h2 style="margin-top:0">${esc(p.name)} · 문구 수정</h2>
    <div class="field"><label>상품명</label><input name="name" value="${esc(p.name)}"></div>
    <div class="grid2">
      <div class="field"><label>카테고리</label><input name="category" value="${esc(p.category)}"></div>
      <div class="field"><label>가격 기준 단위</label><input name="unit_note" value="${esc(p.unit_note)}" placeholder="예) 1세트(2개) 기준"></div>
    </div>
    <div class="field"><label>부제목</label><input name="subtitle" value="${esc(p.subtitle)}"></div>
    <div class="field"><label>특징 (한 줄에 하나)</label><textarea name="features" rows="4">${esc((p.features || []).join('\n'))}</textarea></div>
    <div class="field"><label>상품 정보표 (한 줄에 "항목: 내용")</label><textarea name="info" rows="5" placeholder="호환: 지커 7X 2026년형&#10;구성: 2개 1세트&#10;소재: 실리콘">${esc(p.info)}</textarea></div>
    <div class="ask-btns"><button type="button" class="btn ghost" data-x>취소</button><button class="btn pri">저장</button></div>
  </form>`;
  document.body.appendChild(ov);
  const f = $('form', ov);
  $('[data-x]', ov).onclick = () => ov.remove();
  f.onsubmit = async e => {
    e.preventDefault();
    const t = k => f[k].value.trim();
    if (!t('name')) return toast('상품명을 입력해 주세요');
    const patch = { name: t('name'), category: t('category') || null, unit_note: t('unit_note') || null, subtitle: t('subtitle') || null,
      features: t('features').split('\n').map(x => x.trim()).filter(Boolean), info: t('info') || null };
    try { await api.updProduct(pid, patch); ov.remove(); await reload(); viewStock(); toast('상품 문구를 저장했습니다'); }
    catch (err) { toast(errMsg(err), 4000); }
  };
}

// ---------------------------------------------------------------- 로그인
function viewLogin(msg) {
  $('#nav').innerHTML = '';
  app().innerHTML = `
  <div class="auth"><div class="eyebrow">Admin</div><h1>관리자 로그인</h1><p class="lead">${msg || '관리자 계정으로 로그인해 주세요.'}</p>
    <form id="lf" novalidate>
      <div class="field"><label>이메일</label><input name="email" type="email" autocomplete="email"></div>
      <div class="field"><label>비밀번호</label><input name="password" type="password" autocomplete="current-password"></div>
      <button class="btn pri block">로그인</button><div class="err" id="lerr"></div>
    </form></div>`;
  $('#lf').onsubmit = async e => {
    e.preventDefault();
    try { await api.signIn(e.target.email.value.trim(), e.target.password.value); boot(); }
    catch (err) { $('#lerr').textContent = errMsg(err); }
  };
}

// ---------------------------------------------------------------- 라우터
function route() {
  if (!A.me?.is_admin) return;
  const h = location.hash || '#/orders';
  renderNav();
  if (h.startsWith('#/stock')) viewStock();
  else if (h.startsWith('#/dealers')) viewDealers();
  else if (h.startsWith('#/settings')) viewSettings();
  else if (h.startsWith('#/notices')) viewNotices();
  else if (h.startsWith('#/inquiries')) viewInquiriesAdmin();
  else if (h.startsWith('#/coupons')) viewCoupons();
  else viewOrders();
}

async function boot() {
  try {
    A.user = await api.user();
    if (!A.user) return viewLogin();
    A.me = await api.me(A.user.id);
    if (!A.me?.is_admin) return viewLogin('관리자 권한이 없는 계정입니다. 관리자 계정으로 다시 로그인해 주세요.');
    await reload();
    route();
  } catch (e) {
    app().innerHTML = `<div class="empty">불러오지 못했습니다.<br><span class="small">${esc(errMsg(e))}</span><br><button class="btn" onclick="location.reload()">새로고침</button></div>`;
  }
}

window.addEventListener('hashchange', route);
window.addEventListener('beforeunload', e => { if (Object.keys(A.dirty).length) { e.preventDefault(); e.returnValue = ''; } });
boot();
