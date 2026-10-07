// ZEEKR 7X 딜러 주문 사이트
const S = { user: null, dealer: null, products: [], variants: [], settings: {}, orders: null, notices: [], inquiries: null, info: {}, pub: [], filter: '전체' };

// ---------------------------------------------------------------- 데이터
const api = DEMO ? demoApi() : {
  async user() { const { data } = await sb.auth.getSession(); return data.session?.user || null; },
  async dealer(uid) {
    const { data, error } = await sb.from('dealers').select('*').eq('id', uid).maybeSingle();
    if (error) throw error; return data;
  },
  async catalog() {
    const [p, v, s] = await Promise.all([
      sb.from('products').select('*').eq('active', true).order('sort'),
      sb.from('variants').select('*').eq('active', true).order('product_id').order('sort'),
      sb.from('shop_settings').select('*').eq('id', 1).maybeSingle(),
    ]);
    for (const r of [p, v, s]) if (r.error) throw r.error;
    return { products: p.data, variants: v.data, settings: s.data || {} };
  },
  async stock() {
    const { data, error } = await sb.from('variants').select('id,stock,active,price');
    if (error) throw error; return data;
  },
  async placeOrder(a) {
    const { data, error } = await sb.rpc('place_order', a);
    if (error) throw error; return data;
  },
  async orders() {
    const { data, error } = await sb.from('orders').select('*, order_items(*)').eq('dealer_id', S.user.id).order('created_at', { ascending: false });
    if (error) throw error; return data;
  },
  async cancel(id) {
    const { error } = await sb.rpc('cancel_order', { p_order_id: id });
    if (error) throw error;
  },
  async myCoupons() {
    const { data, error } = await sb.rpc('my_coupons');
    if (error) throw error; return data || [];
  },
  async checkCoupon(code) {
    const { data, error } = await sb.rpc('check_coupon', { p_code: code });
    if (error) throw error; return data;
  },
  async notifyPaid(id) {
    const { error } = await sb.rpc('notify_paid', { p_order_id: id });
    if (error) throw error;
  },
  async confirmReceived(id) {
    const { error } = await sb.rpc('confirm_received', { p_order_id: id });
    if (error) throw error;
  },
  async inquiries() {
    const { data, error } = await sb.from('inquiries').select('*, orders(order_no)').eq('dealer_id', S.user.id).order('created_at', { ascending: false });
    if (error) throw error; return data;
  },
  async addInquiry(row) {
    const { error } = await sb.from('inquiries').insert(row);
    if (error) throw error;
  },
  // 비회원 둘러보기: 상품 + 옵션 이름·사진 (가격·재고 없음)
  async publicCatalog() {
    const [p, v] = await Promise.all([
      sb.from('products').select('*').eq('active', true).order('sort'),
      sb.rpc('public_options'),
    ]);
    for (const r of [p, v]) if (r.error) throw r.error;
    return { products: p.data || [], variants: v.data || [] };
  },
  async publicProducts() {
    const { data } = await sb.from('products').select('id,name,image,category').eq('active', true).order('sort');
    return data || [];
  },
  async publicInfo() {
    const { data } = await sb.rpc('public_info');
    return data || {};
  },
  async notices() {
    const { data, error } = await sb.from('notices').select('*').eq('active', true)
      .order('pinned', { ascending: false }).order('created_at', { ascending: false });
    if (error) throw error; return data;
  },
  async signIn(email, password) {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
  },
  async signUp(email, password, meta) {
    const { data, error } = await sb.auth.signUp({ email, password, options: { data: meta, emailRedirectTo: location.origin + location.pathname } });
    if (error) throw error; return data;
  },
  async signOut() { await sb.auth.signOut(); },
  async updateMe(patch) {
    const { error } = await sb.from('dealers').update(patch).eq('id', S.user.id);
    if (error) throw error;
  },
  async updatePassword(password) {
    const { error } = await sb.auth.updateUser({ password });
    if (error) throw error;
  },
  async resetPassword(email) {
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    if (error) throw error;
  },
  async resend(email) {
    const { error } = await sb.auth.resend({ type: 'signup', email, options: { emailRedirectTo: location.origin + location.pathname } });
    if (error) throw error;
  },
};

function demoApi() {
  const mode = new URLSearchParams(location.search).get('demo');
  let orders = store('zk_demo_orders') || [];
  let variants = null;
  const settings = { bank_name: '○○은행', bank_account: '000-000000-00-000', bank_holder: '브링고', pay_deadline_days: 3, same_day_cutoff: '15:00', shipping_fee: 3000, free_shipping_over: 100000, notice: '주문 후 3일 이내 입금해 주세요. 기한이 지나면 주문이 자동 취소되고 재고가 복원됩니다.', qty_discounts: [{ min: 30, rate: 5 }, { min: 50, rate: 10 }], ship_info: '출고: 입금 확인 후 1~2영업일 이내\n택배: CJ대한통운\n교환·반품: 수령 후 7일 이내, 미개봉 상품' , biz_name: '브링고', biz_email: 'bringgoglobal@gmail.com' };
  const dealer = { id: 'demo', email: 'demo@dealer.kr', company: '지커 파트너스', branch: '강남점', manager_name: '김딜러', phone: '010-1234-5678', address: '서울 강남구 테헤란로 000', status: mode === 'pending' ? 'pending' : 'approved' };
  return {
    async user() { return mode === 'login' && !store('zk_demo_in') ? null : { id: 'demo', email: dealer.email }; },
    async dealer() { return dealer; },
    async catalog() {
      const data = await (await fetch('demo_products.json', { cache: 'no-store' })).json();
      variants = variants || await (await fetch('demo_variants.json', { cache: 'no-store' })).json();
      return { products: data || [], variants, settings };
    },
    async stock() { return variants; },
    async placeOrder(a) {
      let sub = 0; const items = [];
      for (const it of a.p_items) {
        const v = variants.find(x => x.id === it.variant_id);
        if (!v || v.stock < it.qty) throw new Error(`재고가 부족합니다 (남은 수량 ${v ? v.stock : 0}개)`);
      }
      const pq = {};
      for (const it of a.p_items) { const v = variants.find(x => x.id === it.variant_id); pq[v.product_id] = (pq[v.product_id] || 0) + it.qty; }
      for (const it of a.p_items) {
        const v = variants.find(x => x.id === it.variant_id), p = S.products.find(x => x.id === v.product_id);
        const rate = rateFor(pq[v.product_id], settings), u = unitPrice(v.price, rate);
        v.stock -= it.qty; sub += u * it.qty;
        items.push({ sku: v.sku, product_name: p.name, option_name: v.option_name, unit_price: u, list_price: v.price, discount_rate: rate, qty: it.qty, line_total: u * it.qty, variant_id: v.id });
      }
      const ship = sub >= settings.free_shipping_over ? 0 : settings.shipping_fee;
      const cp = a._coupon, cd = cp ? couponDiscount(cp, sub, ship) : 0;
      const d = new Date(), p2 = n => String(n).padStart(2, '0');
      const no = `Z${String(d.getFullYear()).slice(2)}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${String(orders.length + 1).padStart(4, '0')}`;
      const o = { id: Date.now(), order_no: no, status: 'pending_payment', subtotal: sub, shipping_fee: ship, total: sub + ship - cd, coupon_name: cp?.name, coupon_discount: cd, depositor_name: a.p_depositor, orderer_name: a.p_orderer_name, orderer_phone: a.p_orderer_phone, tax_invoice: a.p_tax_invoice, tax_biz_no: a.p_tax_biz_no, tax_email: a.p_tax_email, ship_name: a.p_ship_name, ship_phone: a.p_ship_phone, ship_address: a.p_ship_address, memo: a.p_memo, created_at: d.toISOString(), pay_deadline: new Date(+d + 3 * 864e5).toISOString(), order_items: items };
      orders.unshift(o); store('zk_demo_orders', orders);
      return { order_id: o.id, order_no: no, total: o.total };
    },
    async orders() { return orders; },
    async cancel(id) {
      const o = orders.find(x => x.id === id);
      if (!o || o.status !== 'pending_payment') throw new Error('입금 전 주문만 취소할 수 있습니다');
      o.status = 'cancelled'; o.cancelled_at = new Date().toISOString(); o.cancel_reason = '딜러 취소';
      for (const it of o.order_items) { const v = variants.find(x => x.id === it.variant_id); if (v) v.stock += it.qty; }
      store('zk_demo_orders', orders);
    },
    async notices() {
      const t = Date.now();
      return [
        { id: 1, title: '10월 9일 한글날 휴무 안내', body: '10/8(수) 오후 2시 입금 확인분까지 당일 출고되며,\n10/9 주문은 10/10(금)에 순차 출고됩니다.', pinned: true, created_at: new Date(t - 864e5).toISOString() },
        { id: 2, title: '무선충전 실리콘 패드 신규 입고', body: '그레이·화이트 먼저 입고되었습니다. 오렌지·퍼플은 사진 준비 중입니다.', pinned: false, created_at: new Date(t - 3 * 864e5).toISOString() },
        { id: 3, title: '딜러 주문 사이트 오픈 안내', body: '주문 후 안내된 계좌로 입금해 주시면 확인 후 순차 출고됩니다.', pinned: false, created_at: new Date(t - 6 * 864e5).toISOString() },
      ];
    },
    async myCoupons() { return orders.length ? [] : [{ id: 1, name: '첫 구매 10% 할인', kind: 'percent', value: 10, max_discount: 30000, min_order: 50000, first_order_only: true }, { id: 2, name: '무료배송 쿠폰', kind: 'free_ship', value: 0, min_order: 0 }]; },
    async checkCoupon(code) { if (code.toUpperCase() !== 'BRINGGO5000') throw new Error('쿠폰 코드를 확인해 주세요'); return { id: 3, name: '5,000원 할인', kind: 'amount', value: 5000, min_order: 30000 }; },
    async notifyPaid(id) { const o = orders.find(x => x.id === id); o.paid_notified_at = new Date().toISOString(); store('zk_demo_orders', orders); },
    async confirmReceived(id) { const o = orders.find(x => x.id === id); o.status = 'delivered'; o.delivered_by = 'dealer'; o.delivered_at = new Date().toISOString(); store('zk_demo_orders', orders); },
    async inquiries() { return store('zk_demo_inq') || []; },
    async addInquiry(row) {
      const list = store('zk_demo_inq') || [];
      const o = orders.find(x => x.id === row.order_id);
      list.unshift({ id: Date.now(), status: 'open', created_at: new Date().toISOString(), orders: o ? { order_no: o.order_no } : null, ...row });
      store('zk_demo_inq', list);
    },
    async publicProducts() { return (await (await fetch('demo_products.json', { cache: 'no-store' })).json()); },
    async publicCatalog() {
      const products = await (await fetch('demo_products.json', { cache: 'no-store' })).json();
      const vs = await (await fetch('demo_variants.json', { cache: 'no-store' })).json();
      return { products, variants: vs.map(({ id, product_id, option_name, image, sort }) => ({ id, product_id, option_name, image, sort })) };
    },
    async publicInfo() { return { biz_name: '브링고', biz_email: 'bringgoglobal@gmail.com' }; },
    async signIn() { store('zk_demo_in', 1); },
    async signUp() { return { session: null }; },
    async resend() {},
    async updateMe(patch) { Object.assign(dealer, patch); },
    async updatePassword() {},
    async resetPassword() {},
    async signOut() { try { localStorage.removeItem('zk_demo_in'); } catch (e) {} },
  };
}

// ---------------------------------------------------------------- 장바구니
const cartKey = () => 'zk_cart_' + (S.user?.id || 'anon');
const getCart = () => store(cartKey()) || [];
function setCart(c) { store(cartKey(), c); renderNav(); }
function addToCart(variant_id, qty) {
  const c = getCart(), line = c.find(x => x.variant_id === variant_id);
  if (line) line.qty += qty; else c.push({ variant_id, qty });
  setCart(c);
}
const variant = id => S.variants.find(v => v.id === id);
const product = id => S.products.find(p => p.id === id);
const shippingFor = sub => {
  const s = S.settings;
  if (!sub) return 0;
  return s.free_shipping_over != null && sub >= s.free_shipping_over ? 0 : (s.shipping_fee || 0);
};

// ---------------------------------------------------------------- 공통 UI
// 화면에 보이는 이름: 담당자 성함 + 직급 (예: 전지수 매니저)
const personName = d => esc([d.manager_name || d.company, d.position].filter(Boolean).join(' '));

function renderNav() {
  const nav = $('#nav');
  if (!S.user && S.guest) {
    nav.innerHTML = `<a href="#/products" class="on">상품 둘러보기</a><a href="#/login">로그인</a><a href="#/signup" class="nav-cta">가입 신청</a>`;
    return;
  }
  if (!S.user || S.dealer?.status !== 'approved') {
    nav.innerHTML = S.user ? `<button data-act="logout">로그아웃</button>` : '';
    return;
  }
  const n = getCart().reduce((a, x) => a + x.qty, 0);
  const r = location.hash || '#/';
  const on = h => {
    if (h === '#/') return r === '#/' || r === '#' || r === '';
    if (h === '#/products') return r.startsWith('#/products') || r.startsWith('#/p/');
    return r.startsWith(h);
  };
  const c = h => on(h) ? 'on' : '';
  // 딜러가 할 일이 있는 주문: 입금 알림 전 입금대기 + 받았어요 전 배송중
  const todo = (S.orders || []).filter(o => (o.status === 'pending_payment' && !o.paid_notified_at) || o.status === 'shipped').length;
  const openInq = (S.inquiries || []).filter(q => q.status === 'answered' && !store('zk_seen_' + q.id)).length;
  nav.innerHTML = `
    <a href="#/" class="${c('#/')}">홈</a>
    <a href="#/products" class="${c('#/products')}">상품</a>
    <a href="#/orders" class="${c('#/orders')}">주문내역${todo ? `<span class="cnt">${todo}</span>` : ''}</a>
    <a href="#/inquiries" class="${c('#/inquiries')}">문의${openInq ? `<span class="cnt">${openInq}</span>` : ''}</a>
    <a href="#/cart" class="${c('#/cart')}">장바구니${n ? `<span class="cnt">${n}</span>` : ''}</a>
    ${S.dealer.is_admin ? `<a href="admin.html${DEMO ? location.search : ''}" class="admin-link"><span class="pc">관리자</span><span class="mo">관리</span></a>` : ''}
    <a href="#/me" class="who ${c('#/me')}" title="${esc(S.dealer.company)}${S.dealer.branch ? ' ' + esc(S.dealer.branch) : ''} · 내 정보"><span class="pc">${personName(S.dealer)}님</span><span class="mo">내 정보</span></a>
    <button data-act="logout" class="pc">로그아웃</button>`;
}

// 말풍선 아이콘 (카카오톡 노란색 톤)
const KAKAO_ICON = '<svg class="kk-svg" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="#191600" d="M12 3.5c-5 0-9 3.1-9 7 0 2.5 1.7 4.7 4.2 5.9l-.9 3.3c-.1.3.3.6.6.4l3.9-2.6c.4 0 .8.1 1.2.1 5 0 9-3.1 9-7s-4-7.1-9-7.1z"/></svg>';


document.addEventListener('click', async e => {
  if (e.target.closest('[data-act="logout"]')) {
    await api.signOut();
    S.user = S.dealer = null; S.orders = null;
    location.hash = '#/';
    boot();
  }
  const cp = e.target.closest('[data-copy]');
  if (cp) {
    try { await navigator.clipboard.writeText(cp.dataset.copy); toast('복사했습니다'); } catch (err) { toast(cp.dataset.copy); }
  }
});

const app = () => $('#app');

// ---------------------------------------------------------------- 로그인 / 가입
// 가입 신청: 딜러사·지점 선택 (기타 → 직접 입력)
const DEALER_COS = ['ZK모빌리티', 'KCC모빌리티', '에이치모빌리티ZK', '아이언EV', '기타'];
const BRANCHES = ['강남', '강동', '동대문', '광주', '서초', '강서', '일산', '대전', '원주', '판교', '인천', '수원', '부산', '기타'];
const pickField = (name, list, ph, etcPh) => `
  <select name="${name}_sel" data-pick="${name}"><option value="">${ph}</option>${list.map(x => `<option>${x}</option>`).join('')}</select>
  <input name="${name}" placeholder="${etcPh}" hidden style="margin-top:8px">`;

function viewAuth(tab = 'login') {
  const signup = tab === 'signup';
  app().innerHTML = `
  <div class="auth-wrap su">
  <div class="auth">
    <div class="eyebrow">Zeekr 7X · Accessories</div>
    <h1>${signup ? '딜러 가입 신청' : '딜러 전용 주문'}</h1>
    ${signup
      ? '<p class="lead">가입 신청 후 승인되면 공급가 확인과 주문이 가능합니다.</p>'
      : '<p class="lead lead2"><span>처음이신가요? <a href="#" data-tab-link="signup">가입 신청</a> 후 승인되면 이용할 수 있어요.</span><span>승인된 계정으로 로그인하면 공급가 확인과 주문이 가능합니다.</span></p>'}
    ${signup ? '' : `<a class="guest-card" href="#/products">
      <div class="gc-thumbs" id="gcthumbs"></div>
      <div class="gc-txt"><span class="gc-k">비회원 둘러보기</span><b>회원이 아니신가요? 상품부터 구경해 보세요</b><span class="gc-s">어떤 상품을 파는지 바로 볼 수 있어요 · 공급가는 가입 승인 후 공개</span></div>
      <span class="gc-go">→</span>
    </a>`}
    <div class="tabs">
      <button data-tab="login" class="${signup ? '' : 'on'}">로그인</button>
      <button data-tab="signup" class="${signup ? 'on' : ''}">가입 신청</button>
    </div>
    <form id="authf" class="${signup ? 'panel' : ''}" novalidate>
      ${signup ? `
      <div class="grid2">
        <div class="field"><label>딜러사명<em>*</em></label>${pickField('company', DEALER_COS, '딜러사를 선택해 주세요', '딜러사명 직접 입력')}</div>
        <div class="field"><label>지점(전시장)<em>*</em></label>${pickField('branch', BRANCHES, '지점을 선택해 주세요', '지점명 직접 입력')}</div>
        <div class="field"><label>담당자 성함<em>*</em></label><input name="manager_name" required></div>
        <div class="field"><label>직급/직책</label><input name="position" placeholder="예) 매니저, 대리, 지점장"></div>
        <div class="field"><label>휴대폰<em>*</em></label><input name="phone" required inputmode="tel" placeholder="010-0000-0000"></div>
      </div>
      <div class="field"><label>사업자등록번호</label><input name="biz_no" inputmode="numeric" placeholder="000-00-00000"><span class="hint">세금계산서 발행용 (나중에 입력해도 됩니다)</span></div>
      ${addrField('기본 배송지')}
      <hr style="border:0;border-top:1px solid var(--hair);margin:8px 0 18px">` : ''}
      <div class="field"><label>이메일 (아이디)${signup ? '<em>*</em>' : ''}</label><input name="email" type="email" required autocomplete="email"></div>
      <div class="${signup ? 'grid2' : ''}">
        <div class="field"><label>비밀번호${signup ? '<em>*</em>' : ''}</label><input name="password" type="password" required autocomplete="${signup ? 'new-password' : 'current-password'}" ${signup ? 'placeholder="6자 이상"' : ''}></div>
        ${signup ? `<div class="field"><label>비밀번호 확인<em>*</em></label><input name="password2" type="password" required autocomplete="new-password"></div>` : ''}
      </div>
      ${signup ? `<label class="check"><input type="checkbox" name="agree"> <span><a href="#/terms" target="_blank">이용약관</a>과 <a href="#/privacy" target="_blank">개인정보 처리방침</a>을 확인했으며, 주문 처리 및 배송을 위한 개인정보(성함, 연락처, 이메일, 주소) 수집·이용에 동의합니다.</span></label>` : ''}
      <button class="btn pri block" type="submit">${signup ? '가입 신청하기' : '로그인'}</button>
      <div class="err" id="autherr"></div>
      ${signup ? '' : '<p class="forgot"><a href="#" id="forgot">비밀번호를 잊으셨나요?</a></p>'}
    </form>
  </div>
  </div>`;

  if (!signup) fillGuestThumbs();
  $$('.tabs button').forEach(b => b.onclick = () => viewAuth(b.dataset.tab));
  $$('[data-tab-link]').forEach(a => a.onclick = e => { e.preventDefault(); viewAuth(a.dataset.tabLink); });
  $('#forgot') && ($('#forgot').onclick = e => { e.preventDefault(); viewForgot(); });
  const f = $('#authf');
  if (signup) {
    // 선택값을 실제 입력칸에 반영, '기타'면 직접 입력칸 열기
    $$('[data-pick]', f).forEach(sel => sel.onchange = () => {
      const inp = f[sel.dataset.pick], etc = sel.value === '기타';
      inp.hidden = !etc;
      inp.value = etc ? '' : sel.value;
      if (etc) inp.focus();
    });
    f.phone.oninput = () => f.phone.value = fmtPhone(f.phone.value);
    f.biz_no.oninput = () => f.biz_no.value = fmtBiz(f.biz_no.value);
    bindAddr(f);
  }
  f.onsubmit = async ev => {
    ev.preventDefault();
    const err = $('#autherr'), btn = f.querySelector('button[type=submit]');
    err.textContent = '';
    const v = k => (f[k]?.value || '').trim();
    $$('.bad', f).forEach(x => x.classList.remove('bad'));
    const fail = (k, msg) => {
      const el = f[k]; err.textContent = msg;
      if (el) { (el.closest('.field') || el.closest('label') || el).classList.add('bad'); el.focus({ preventScroll: true }); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
      return false;
    };
    const checks = signup ? [
      [f.company.hidden ? 'company_sel' : 'company', !v('company'), f.company.hidden ? '딜러사를 선택해 주세요.' : '딜러사명을 입력해 주세요.'],
      [f.branch.hidden ? 'branch_sel' : 'branch', !v('branch'), f.branch.hidden ? '지점을 선택해 주세요.' : '지점명을 입력해 주세요.'],
      ['manager_name', !v('manager_name'), '담당자 성함을 입력해 주세요.'],
      ['phone', v('phone').replace(/\D/g, '').length < 9, '휴대폰 번호를 정확히 입력해 주세요.'],
      ['email', !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v('email')), '이메일을 정확히 입력해 주세요.'],
      ['password', v('password').length < 6, '비밀번호는 6자 이상이어야 합니다.'],
      ['password2', v('password') !== v('password2'), '비밀번호 확인이 일치하지 않습니다.'],
      ['agree', !f.agree?.checked, '약관과 개인정보 수집·이용에 동의해 주세요.'],
    ] : [
      ['email', !v('email'), '이메일을 입력해 주세요.'],
      ['password', !v('password'), '비밀번호를 입력해 주세요.'],
    ];
    for (const [k, bad, msg] of checks) if (bad) return fail(k, msg);
    btn.disabled = true;
    try {
      if (signup) {
        const meta = { company: v('company'), branch: v('branch') || null, manager_name: v('manager_name'), position: v('position') || null, phone: v('phone'), biz_no: v('biz_no') || null, address: addrValue(f) || null };
        const r = await api.signUp(v('email'), v('password'), meta);
        // 이미 가입된 이메일이면 Supabase가 성공처럼 응답하지만 메일은 보내지 않음 (identities 가 비어 있음)
        if (r.user && Array.isArray(r.user.identities) && r.user.identities.length === 0) {
          return fail('email', '이미 가입된 이메일입니다. 로그인하거나 비밀번호 찾기를 이용해 주세요.');
        }
        if (!r.session) return viewVerify(v('email'));
      } else {
        try { await api.signIn(v('email'), v('password')); }
        catch (e1) { if (/Email not confirmed/i.test(e1.message || '')) return viewVerify(v('email')); throw e1; }
      }
      await boot();
    } catch (e2) {
      err.textContent = errMsg(e2);
    } finally { btn.disabled = false; }
  };
}

// 로그인 화면의 비회원 둘러보기 카드에 상품 사진 4장
async function fillGuestThumbs() {
  if (!S.pub.length) S.pub = await api.publicProducts().catch(() => []);
  const g = $('#gcthumbs');
  if (g) g.innerHTML = S.pub.filter(p => p.image).slice(0, 4).map(p => `<img src="${thumb(p.image)}" alt="" loading="lazy">`).join('');
}

function contactLine() {
  const i = S.info;
  return `<div class="contact-line">
    ${window.KAKAO_CHANNEL_URL ? `<a class="btn sm kakao-btn" href="${esc(window.KAKAO_CHANNEL_URL)}" target="_blank" rel="noopener">카카오톡 문의</a>` : ''}
    ${i.biz_email ? `<a class="btn sm ghost" href="mailto:${esc(i.biz_email)}">${esc(i.biz_email)}</a>` : ''}
    ${i.biz_phone ? `<a class="btn sm ghost" href="tel:${esc(i.biz_phone)}">${esc(i.biz_phone)}</a>` : ''}
  </div>`;
}

// 사이트 하단 사업자 정보
function renderFooter() {
  const i = S.info, f = $('#foot');
  if (!f) return;
  const v = x => x || '<span class="mut">(설정 필요)</span>';
  f.innerHTML = `<div class="wrap">
    <img class="ft-logo" src="img/brand/bringgo_pc_line_black.png" alt="bringgo" width="116" height="50">
    <div class="ft-links"><a href="#/terms">이용약관</a><a href="#/privacy"><b>개인정보 처리방침</b></a>${S.user ? '<a href="#/inquiries">1:1 문의</a>' : ''}${window.KAKAO_CHANNEL_URL ? `<a href="${esc(window.KAKAO_CHANNEL_URL)}" target="_blank" rel="noopener">카카오톡 문의</a>` : ''}</div>
    <div class="ft-info">
      <span>상호 ${v(esc(i.biz_name))}</span><span>대표 ${v(esc(i.biz_owner))}</span><span>사업자등록번호 ${v(esc(i.biz_no))}</span>
      <span>통신판매업 신고 ${v(esc(i.mail_order_no))}</span><span>주소 ${v(esc(i.biz_addr))}</span>
      <span>연락처 ${v(esc([i.biz_phone, i.biz_email].filter(Boolean).join(' · ')))}</span><span>개인정보 관리책임자 ${v(esc(i.privacy_officer))}</span>
    </div>
    <div class="ft-copy">© ${new Date().getFullYear()} ${esc(i.biz_name || 'BRINGGO')}. 딜러 전용 B2B 주문 사이트</div>
  </div>`;
}

function viewPolicy(kind) {
  const i = S.info, co = esc(i.biz_name || '브링고'), mail = esc(i.biz_email || ''), officer = esc(i.privacy_officer || '(설정 필요)');
  const privacy = `
    <p>${co}(이하 "회사")는 딜러 전용 주문 서비스 제공을 위해 아래와 같이 개인정보를 처리합니다.</p>
    <h3>1. 수집 항목</h3><p>필수: 딜러사명, 담당자 성함, 휴대폰 번호, 이메일, 비밀번호<br>선택: 지점명, 사업자등록번호, 기본 배송지<br>주문 시: 주문 담당자, 받는 분 성함·연락처·주소, 입금자명, 세금계산서 발행 정보</p>
    <h3>2. 수집·이용 목적</h3><p>회원 가입 및 승인, 주문 접수·입금 확인·배송, 세금계산서 발행, 문의 응대, 주문 관련 안내 메일 발송</p>
    <h3>3. 보유 기간</h3><p>회원 탈퇴 시까지. 단, 관계 법령(전자상거래법 등)에 따라 계약·대금결제·재화 공급 기록은 5년, 소비자 불만·분쟁 처리 기록은 3년간 보관합니다.</p>
    <h3>4. 제3자 제공 및 처리 위탁</h3><p>배송을 위해 택배사에 받는 분 성함·연락처·주소를 제공합니다. 서비스 운영을 위해 Supabase(데이터 보관), Google(메일 발송·주문 기록)을 이용합니다.</p>
    <h3>5. 이용자의 권리</h3><p>언제든지 내 정보에서 개인정보를 열람·수정할 수 있으며, 삭제(탈퇴)를 원하시면 아래 연락처로 요청해 주세요.</p>
    <h3>6. 개인정보 관리책임자</h3><p>${officer}${mail ? ` · ${mail}` : ''}</p>`;
  const terms = `
    <h3>제1조 (목적)</h3><p>이 약관은 ${co}이(가) 운영하는 딜러 전용 주문 사이트의 이용 조건과 절차를 정합니다.</p>
    <h3>제2조 (이용 대상)</h3><p>자동차 판매 딜러사 및 그 임직원으로서 회사의 승인을 받은 회원만 이용할 수 있습니다. 회사는 가입 신청 내용을 확인한 뒤 승인 여부를 결정합니다.</p>
    <h3>제3조 (주문과 결제)</h3><p>주문은 무통장 입금으로 결제하며, 안내된 입금 기한이 지나면 주문은 자동 취소됩니다. 표시된 공급가는 부가세 포함 금액입니다.</p>
    <h3>제4조 (배송)</h3><p>입금 확인 후 영업일 기준 1~2일 이내 출고하며, 주문서에 입력된 배송지로 발송합니다.</p>
    <h3>제5조 (교환·반품)</h3><p>상품 수령 후 7일 이내 미개봉·미사용 상품에 한해 교환·반품이 가능합니다. 불량 상품은 사진과 함께 1:1 문의로 접수해 주시면 회사가 배송비를 부담합니다.</p>
    <h3>제6조 (회원 정보 관리)</h3><p>회원은 계정 정보를 타인에게 양도·공유할 수 없으며, 정보 변경 시 내 정보에서 직접 수정해야 합니다.</p>
    <h3>제7조 (분쟁 해결)</h3><p>이 약관에 정하지 않은 사항은 관계 법령과 상관례에 따릅니다.</p>`;
  app().innerHTML = `
  <a class="back" href="#/">← 돌아가기</a>
  <div class="page-head" style="padding-top:16px"><div><div class="eyebrow">Policy</div><h1>${kind === 'privacy' ? '개인정보 처리방침' : '이용약관'}</h1></div></div>
  <article class="policy">${kind === 'privacy' ? privacy : terms}<p class="small mut" style="margin-top:30px">시행일: 2026년 10월</p></article>`;
}

function viewVerify(email) {
  app().innerHTML = `
  <div class="auth"><div class="notice">
    <div class="ic">STEP 1 / 2 · 이메일 인증</div><h2>인증 메일을 보냈습니다</h2>
    <p class="mut"><b style="color:var(--ink)">${esc(email)}</b> 메일함에서<br><b style="color:var(--ink)">[이메일 인증하기]</b> 버튼을 누르면 가입 신청이 접수됩니다.<br>
    <span class="small">메일이 없다면 스팸함도 확인해 주세요.</span></p>
    <p class="small mut" style="margin-top:14px">인증 후 관리자 승인이 완료되면 안내 메일을 한 번 더 보내드립니다.</p>
    <div style="display:flex;gap:8px;justify-content:center;margin-top:20px">
      <button class="btn" id="resend">인증 메일 다시 보내기</button><button class="btn ghost" id="go">로그인 화면으로</button>
    </div>
    <div class="err" id="rerr"></div>
  </div></div>`;
  $('#go').onclick = () => viewAuth('login');
  $('#resend').onclick = async () => {
    const b = $('#resend'); b.disabled = true;
    try { await api.resend(email); toast('인증 메일을 다시 보냈습니다'); }
    catch (e) { $('#rerr').textContent = errMsg(e); }
    setTimeout(() => b.disabled = false, 30000);
  };
}

function viewForgot() {
  app().innerHTML = `
  <div class="auth">
    <div class="eyebrow">Password</div><h1>비밀번호 찾기</h1>
    <p class="lead">가입한 이메일을 입력하시면 비밀번호 재설정 링크를 보내드립니다.</p>
    <form id="ff" novalidate>
      <div class="field"><label>이메일 (아이디)</label><input name="email" type="email" autocomplete="email"></div>
      <button class="btn pri block" type="submit">재설정 메일 받기</button>
      <div class="err" id="ferr"></div>
      <p class="forgot"><a href="#" id="back">← 로그인으로 돌아가기</a></p>
    </form>
  </div>`;
  $('#back').onclick = e => { e.preventDefault(); viewAuth('login'); };
  $('#ff').onsubmit = async e => {
    e.preventDefault();
    const email = e.target.email.value.trim(), btn = e.target.querySelector('button');
    if (!email) return $('#ferr').textContent = '이메일을 입력해 주세요.';
    btn.disabled = true;
    try {
      await api.resetPassword(email);
      viewNotice('메일을 보냈습니다', `<b>${esc(email)}</b> 메일함에서 <b>[비밀번호 재설정]</b> 버튼을 눌러 주세요.<br><span class="small">메일이 없다면 스팸함도 확인해 주세요.</span>`, true);
    } catch (err) { $('#ferr').textContent = errMsg(err); btn.disabled = false; }
  };
}

function viewNewPassword() {
  renderNav();
  app().innerHTML = `
  <div class="auth">
    <div class="eyebrow">Password</div><h1>새 비밀번호 설정</h1>
    <p class="lead">앞으로 로그인할 때 쓸 새 비밀번호를 입력해 주세요.</p>
    <form id="nf" novalidate>
      <div class="field"><label>새 비밀번호</label><input name="pw" type="password" autocomplete="new-password" placeholder="6자 이상"></div>
      <div class="field"><label>새 비밀번호 확인</label><input name="pw2" type="password" autocomplete="new-password"></div>
      <button class="btn pri block" type="submit">비밀번호 변경</button>
      <div class="err" id="nerr"></div>
    </form>
  </div>`;
  $('#nf').onsubmit = async e => {
    e.preventDefault();
    const f = e.target;
    if (f.pw.value.length < 6) return $('#nerr').textContent = '비밀번호는 6자 이상이어야 합니다.';
    if (f.pw.value !== f.pw2.value) return $('#nerr').textContent = '비밀번호 확인이 일치하지 않습니다.';
    try {
      await api.updatePassword(f.pw.value);
      RECOVERY = false;
      toast('비밀번호를 변경했습니다');
      history.replaceState(null, '', location.pathname + location.search);
      boot();
    } catch (err) { $('#nerr').textContent = errMsg(err); }
  };
}

function viewNotice(title, html, toLogin) {
  app().innerHTML = `
  <div class="auth"><div class="notice">
    <div class="ic">NOTICE</div><h2>${title}</h2>
    <p class="mut">${html}</p>
    ${toLogin ? `<div style="display:flex;gap:8px;justify-content:center;margin-top:20px"><button class="btn" id="go">로그인 화면으로</button></div>` : ''}
  </div></div>`;
  $('#go') && ($('#go').onclick = () => viewAuth('login'));
  $('#re') && ($('#re').onclick = () => boot());
}

// ---------------------------------------------------------------- 상품 목록
// 비회원 가격 자리: 실제 숫자는 넣지 않고 가짜 숫자를 흐리게
const GUEST_BAR = '<div class="guest-bar"><span><b>비회원 둘러보기</b> · 공급가와 주문은 딜러 가입 승인 후 이용할 수 있어요.</span><a class="btn pri sm" href="#/signup">가입 신청</a></div>';
const LOCKED_PRICE = '<div class="price locked"><span class="blur" aria-hidden="true">88,000원</span><small>회원 전용가</small></div>';

function productSummary(p) {
  const vs = S.variants.filter(v => v.product_id === p.id);
  if (S.guest) return { vs, min: 0, max: 0, stock: 1, low: false };   // 비회원은 가격·재고를 모름
  const prices = vs.map(v => v.price);
  const min = Math.min(...prices), max = Math.max(...prices);
  const stock = vs.reduce((a, v) => a + v.stock, 0);
  const low = vs.some(v => v.stock > 0 && v.stock <= 5);
  return { vs, min, max, stock, low };
}

const tagsHtml = p => `${p.is_best ? '<span class="tagb best">BEST</span>' : ''}${p.is_new ? '<span class="tagb new">NEW</span>' : ''}`;

function productCard(p) {
  const s = productSummary(p);
  if (!s.vs.length) return '';
  return `
  <a class="card ${s.stock ? '' : 'out'}" href="#/p/${p.id}">
    <div class="ph"><img src="${thumb(p.image)}" alt="" loading="lazy">
      ${tagsHtml(p) ? `<span class="tags">${tagsHtml(p)}</span>` : ''}
      ${!s.stock ? '<span class="soldout">품절</span>' : ''}</div>
    <div class="cat">${esc(p.category || '')} · 옵션 ${s.vs.length}</div>
    <h3>${esc(p.name)}</h3>
    ${S.guest ? LOCKED_PRICE : `<div class="price">${won(s.min)}<small>원${s.max > s.min ? ' ~' : ''}</small></div>`}
    ${s.stock && s.low ? '<div class="low">재고 적음</div>' : ''}
    ${s.vs.length > 1 ? `<div class="dots">${s.vs.slice(0, 6).filter(v => v.image).map(v => `<img src="${thumb(v.image)}" alt="" loading="lazy">`).join('')}</div>` : ''}
  </a>`;
}

function viewShop() {
  const sellable = S.products.filter(p => S.variants.some(v => v.product_id === p.id));
  const SPECIAL = { NEW: ['NEW 신상품', p => p.is_new], BEST: ['BEST 베스트', p => p.is_best] };
  const match = (p, c) => c === '전체' || (SPECIAL[c] ? SPECIAL[c][1](p) : p.category === c);
  const count = c => sellable.filter(p => match(p, c)).length;
  const label = c => SPECIAL[c] ? SPECIAL[c][0] : c;
  const cats = ['전체', ...Object.keys(SPECIAL).filter(c => count(c)), ...new Set(sellable.map(p => p.category).filter(Boolean))];
  if (!cats.includes(S.filter)) S.filter = '전체';
  const list = sellable.filter(p => match(p, S.filter));
  const st = S.settings;
  app().innerHTML = `
  <div class="page-head">
    <div><div class="eyebrow">Products · ${sellable.length}</div><h1>${S.filter === '전체' ? '전체 상품' : esc(label(S.filter))}</h1></div>
    <div class="small mut">${list.length}개 상품</div>
  </div>
  <div class="shop-layout">
    <aside class="side">
      <h4>카테고리</h4>
      <ul class="cats">${cats.map(c => `<li><button class="${c === S.filter ? 'on' : ''} ${SPECIAL[c] ? 'sp-' + c.toLowerCase() : ''}" data-cat="${esc(c)}"><span>${esc(label(c))}</span><span class="n">${count(c)}</span></button></li>`).join('')}</ul>
      ${S.guest ? `<h4>딜러 회원 안내</h4><div class="brief"><div>공급가 확인과 주문은 <b>가입 승인 후</b> 이용할 수 있어요.</div><a class="btn pri sm block" href="#/signup" style="margin-top:10px">가입 신청</a></div>` : `
      <h4>주문 안내</h4>
      <div class="brief">
        <div class="bh">배송비</div>
        ${st.free_shipping_over ? `<div><b class="acc">${won(st.free_shipping_over)}원 이상</b> 무료배송</div>` : ''}
        <div>${st.free_shipping_over ? '그 외 ' : ''}${st.shipping_fee ? `${won(st.shipping_fee)}원` : '무료'}</div>
      </div>
      <div class="brief">
        <div class="bh">출고</div>
        ${cutoffText(st.same_day_cutoff) ? `<div><b class="acc">${cutoffText(st.same_day_cutoff)} 이전</b> 입금 확인분<br>당일 출고</div>` : '<div>무통장 입금 확인 후 출고</div>'}
        <div>입금 기한 주문 후 ${st.pay_deadline_days || 3}일</div>
      </div>
      <p class="brief-note">공급가는 VAT 포함입니다</p>`}
    </aside>
    <div>
      ${S.guest ? GUEST_BAR : ''}
      <div class="m-brief">${[st.free_shipping_over ? `<b>${won(st.free_shipping_over)}원 이상</b> 무료배송` : '', cutoffText(st.same_day_cutoff) ? `<b>${cutoffText(st.same_day_cutoff)} 이전</b> 입금 확인분 당일 출고` : ''].filter(Boolean).map(x => `<div>${x}</div>`).join('')}</div>
      <div class="filters">${cats.map(c => `<button class="chip ${c === S.filter ? 'on' : ''}" data-cat="${esc(c)}">${esc(label(c))}</button>`).join('')}</div>
      <div class="grid">${list.map(productCard).join('')}</div>
    </div>
  </div>`;
  $$('[data-cat]').forEach(b => b.onclick = () => { S.filter = b.dataset.cat; viewShop(); });
}

// ---------------------------------------------------------------- 홈
function viewHome() {
  const sellable = S.products.filter(p => S.variants.some(v => v.product_id === p.id));
  const news = sellable.filter(p => p.is_new).slice(0, 4), bests = sellable.filter(p => p.is_best).slice(0, 4);
  const tiers = tierText(S.settings);
  app().innerHTML = `
  <div class="home-hi"><div class="eyebrow">Dealer Home</div><h1>${personName(S.dealer)}님, 안녕하세요</h1><p class="mut" style="margin:6px 0 0">${esc(S.dealer.company)}${S.dealer.branch ? ' ' + esc(S.dealer.branch) : ''}</p></div>
  <div id="topboxes">${topBoxes()}</div>
  <div id="mhome">${mobileHome()}</div>
  <div class="help-bar">
    <span class="kk-badge" aria-hidden="true">${KAKAO_ICON}</span>
    <div class="hb-t"><b>궁금한 점이 있으신가요?</b><span>${window.KAKAO_CHANNEL_URL ? '재고·출고일·호환 여부는 카카오톡으로 빠르게, 교환·반품·대량 견적은 1:1 문의로 남겨 주세요.' : '재고·출고일·호환 여부, 교환·반품·대량 견적 모두 1:1 문의로 남겨 주세요.'}</span></div>
    <div class="hb-btns">
      ${window.KAKAO_CHANNEL_URL ? `<a class="btn sm kakao-btn" href="${esc(window.KAKAO_CHANNEL_URL)}" target="_blank" rel="noopener">${KAKAO_ICON}카카오톡 문의</a>` : ''}
      <a class="btn sm ghost" href="#/inquiries/new">1:1 문의</a>
    </div>
  </div>
  ${tiers ? `<div class="tier-banner">수량 할인 · 같은 상품 옵션 합산 <b>${tiers}</b></div>` : ''}
  ${news.length ? `<div class="sec-h"><h2>신규 입고</h2><a href="#/products" data-goto="NEW">신상품 전체 →</a></div><div class="row4">${news.map(productCard).join('')}</div>` : ''}
  ${bests.length ? `<div class="sec-h"><h2>베스트 상품</h2><a href="#/products" data-goto="BEST">베스트 전체 →</a></div><div class="row4">${bests.map(productCard).join('')}</div>` : ''}
  <div class="home-more"><a class="btn pri" href="#/products" data-goto="전체">전체 상품 보기 (${sellable.length})</a>
    <p class="help-mini">궁금한 점이 있으신가요? <a href="#/inquiries/new">1:1 문의 →</a>${window.KAKAO_CHANNEL_URL ? ` <a href="${esc(window.KAKAO_CHANNEL_URL)}" target="_blank" rel="noopener">카카오톡 문의 →</a>` : ''}</p></div>`;
  $$('[data-goto]').forEach(a => a.onclick = () => { S.filter = a.dataset.goto; });
  $$('[data-reorder]').forEach(b => b.onclick = () => reorder(+b.dataset.reorder));
  startRoll();
  if (S.orders === null) loadOrders().then(() => { if ((location.hash || '#/') === '#/') viewHome(); }).catch(() => {});
}

// 지난 주문 그대로 다시 담기 (판매 중·재고 있는 옵션만)
function reorder(orderId) {
  const o = (S.orders || []).find(x => x.id === orderId);
  if (!o) return;
  let added = 0, skipped = [];
  for (const it of o.order_items || []) {
    const v = it.variant_id && variant(it.variant_id);
    const inCart = v ? (getCart().find(x => x.variant_id === v.id)?.qty || 0) : 0;
    const q = v ? Math.min(it.qty, v.stock - inCart) : 0;
    if (v && v.active !== false && q > 0) { addToCart(v.id, q); added += q; if (q < it.qty) skipped.push(`${it.option_name}(${it.qty - q}개 부족)`); }
    else skipped.push(`${it.product_name} ${it.option_name}`);
  }
  toast(added ? `${added}개를 장바구니에 담았습니다${skipped.length ? ` · 제외: ${skipped.join(', ')}` : ''}` : '담을 수 있는 상품이 없습니다 (품절·판매 종료)', 4000);
  if (added) location.hash = '#/cart';
}

// 상단 두 칸: 공지사항 · 내 주문 현황
// 휴대폰 홈: 공지·수량할인·출고 안내를 한 줄 롤링(스와이프) + 진행 중 주문만 한 줄
function mobileHome() {
  const st = S.settings, tiers = tierText(st), cut = cutoffText(st.same_day_cutoff);
  const items = [
    ...S.notices.slice(0, 3).map(n => `<a class="ri" href="#/notices"><span class="rk">${n.pinned ? '필독' : '공지'}</span><span class="rt">${esc(n.title)}</span></a>`),
    tiers ? `<a class="ri" href="#/products"><span class="rk">할인</span><span class="rt">수량 할인 <b>${tiers}</b> · 같은 상품 옵션 합산</span></a>` : '',
    cut ? `<a class="ri" href="#/products"><span class="rk">출고</span><span class="rt"><b>${cut} 이전</b> 입금 확인분 당일 출고</span></a>` : '',
  ].filter(Boolean);
  const os = S.orders || [];
  const cnt = st2 => os.filter(o => st2.includes(o.status)).length;
  const parts = [['입금대기', cnt(['pending_payment'])], ['출고준비', cnt(['paid', 'preparing'])], ['배송중', cnt(['shipped'])]].filter(x => x[1]);
  return `
  ${items.length ? `<div class="roll"><div class="roll-track" id="roll">${items.join('')}</div>${items.length > 1 ? `<div class="roll-dots">${items.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div>` : ''}</div>` : ''}
  ${parts.length ? `<a class="m-ord" href="#/orders"><span>진행 중 주문</span>${parts.map(([k, n]) => `<b>${k} ${n}</b>`).join('<i>·</i>')}<span class="go">→</span></a>` : ''}`;
}

// 롤링: 4초마다 다음 칸, 손으로 넘기면 그 위치에서 이어감
function startRoll() {
  const el = $('#roll');
  if (!el || el.children.length < 2) return;
  const dots = $$('.roll-dots i');
  let hold = 0;
  const idx = () => Math.round(el.scrollLeft / el.clientWidth);
  el.addEventListener('scroll', () => dots.forEach((d, i) => d.classList.toggle('on', i === idx())), { passive: true });
  el.addEventListener('touchstart', () => { hold = Date.now(); }, { passive: true });
  const t = setInterval(() => {
    if (!document.body.contains(el)) return clearInterval(t);
    if (!el.clientWidth || Date.now() - hold < 6000) return;
    const n = (idx() + 1) % el.children.length;
    el.scrollTo({ left: n * el.clientWidth, behavior: n ? 'smooth' : 'auto' });
  }, 4000);
}

function topBoxes() {
  const n = S.notices[0];
  const os = S.orders || [];
  const pend = os.filter(o => o.status === 'pending_payment');
  const prep = os.filter(o => o.status === 'paid' || o.status === 'preparing');
  const ship = os.filter(o => o.status === 'shipped');
  const lines = [];
  if (pend.length) {
    const due = pend.map(o => o.pay_deadline).sort()[0];
    lines.push(`<span class="hl">입금대기 ${won(pend.reduce((a, o) => a + o.total, 0))}원</span> · 입금기한 ${fmtDT(due).slice(5)}`);
  }
  if (ship.length && ship[0].tracking_no) lines.push(`배송중 ${esc(ship[0].carrier || '')} ${esc(ship[0].tracking_no)}${ship.length > 1 ? ` 외 ${ship.length - 1}건` : ''}`);
  const k = (label, arr, cls = '') => `<div class="kv ${arr.length ? cls : 'zero'}"><small>${label}</small><b>${arr.length}</b></div>`;
  return `
  <div class="topboxes">
    <a class="tb" href="#/notices">
      <div class="h"><span class="ttl">공지사항</span><span class="more">${S.notices.length > 1 ? `전체 ${S.notices.length}개 →` : '자세히 →'}</span></div>
      ${n ? `
        <div class="ntitle">${n.pinned ? '<span class="must">필독</span>' : ''}${esc(n.title)}</div>
        <div class="nbody">${esc(n.body || '')}</div>
        <div class="ndate">${fmtDT(n.created_at).slice(0, 10)}</div>`
      : '<div class="empty-s">등록된 공지가 없습니다.</div>'}
    </a>
    <a class="tb" href="#/orders">
      <div class="h"><span class="ttl">내 주문 현황</span><span class="more">주문내역 →</span></div>
      <div class="kvs">${k('입금대기', pend, 'acc')}${k('출고준비', prep)}${k('배송중', ship)}</div>
      <div class="oline">${lines.length ? lines.join('<br>') : '<span class="mut">진행 중인 주문이 없습니다.</span>'}</div>
    </a>
  </div>`;
}

// 공지 전체
function viewNotices() {
  app().innerHTML = `
  <a class="back" href="#/">← 홈</a>
  <div class="page-head" style="padding-top:16px"><div><div class="eyebrow">Notice · ${S.notices.length}</div><h1>공지사항</h1></div></div>
  ${!S.notices.length ? '<div class="empty">등록된 공지가 없습니다.</div>' : `
  <div class="notices">${S.notices.map((n, i) => `
    <details class="ntc" ${i === 0 ? 'open' : ''}>
      <summary>${n.pinned ? '<span class="must">필독</span>' : ''}<span class="tt">${esc(n.title)}</span><span class="dt">${fmtDT(n.created_at).slice(0, 10)}</span></summary>
      <div class="bd">${esc(n.body || '')}</div>
    </details>`).join('')}</div>`}`;
}

// ---------------------------------------------------------------- 상품 상세
function viewProduct(id) {
  const p = product(+id);
  if (!p) return viewShop();
  const { vs, min, max } = productSummary(p);
  const picks = [];          // 고른 옵션들 [{ v, qty }]
  const pics = [...new Set([p.image, ...(p.images || []), ...vs.map(v => v.image)].filter(Boolean))];
  const details = p.detail_images || [];

  app().innerHTML = `
  <a class="back" href="#/products">← 상품 목록</a>
  ${S.guest ? GUEST_BAR : ''}
  <div class="pd">
    <div class="gal">
      <div class="main">
        <div class="slides" id="slides">${pics.map((s, i) => `<img src="${img(s)}" alt="" ${i ? 'loading="lazy"' : ''}>`).join('')}</div>
        ${pics.length > 1 ? `<span class="gcount" id="gcount">1 / ${pics.length}</span>
        <button class="gnav prev" data-g="-1" aria-label="이전 사진">‹</button><button class="gnav next" data-g="1" aria-label="다음 사진">›</button>` : ''}
      </div>
      ${pics.length > 1 ? `<div class="thumbs">${pics.map((s, i) => `<img src="${thumb(s)}" data-i="${i}" class="${i ? '' : 'on'}" alt="" loading="lazy">`).join('')}</div>` : ''}
    </div>
    <div>
      <div class="cat">${esc(p.category || '')}${tagsHtml(p) ? ` <span class="tags">${tagsHtml(p)}</span>` : ''}</div>
      <h1>${esc(p.name)}</h1>
      <p class="sub">${esc(p.subtitle || '')}</p>
      ${S.guest ? `<div class="price locked-pd"><span class="blur" aria-hidden="true">88,000원</span><small>회원 전용가 · 가입 승인 후 공개</small></div>`
        : `<div class="price"><span>${won(min)}원${max > min ? '~' : ''}</span>${p.unit_note ? `<em class="unit">${esc(p.unit_note)}</em>` : ''}</div>`}
      <div class="opt-label"><span>${S.guest ? '옵션' : '옵션 선택 <span class="mut" style="font-weight:400">· 여러 개 고를 수 있어요</span>'}</span></div>
      <div class="opts">${vs.map(v => `
        <button class="opt ${v.stock || S.guest ? '' : 'out'}" data-v="${v.id}">
          ${v.image ? `<img src="${thumb(v.image)}" alt="">` : '<span class="noimg">사진<br>준비중</span>'}
          <span>${esc(v.option_name)}${v.stock || S.guest ? '' : '<span class="so">품절</span>'}${!S.guest && v.price !== min ? `<span class="op">${won(v.price)}원</span>` : ''}</span>
        </button>`).join('')}</div>
      ${S.guest ? `<div class="guest-cta"><b>공급가 확인과 주문은 딜러 회원 전용이에요</b><p>지커 딜러·장기렌트 파트너라면 가입 신청해 주세요. 승인되면 바로 공급가를 보고 주문할 수 있어요.</p><div class="gc-btns"><a class="btn pri" href="#/signup">가입 신청</a><a class="btn" href="#/login">로그인</a></div></div>` : `
      <div class="picks" id="picks"></div>
      <div class="pick-total" id="ptotal"></div>
      <div class="buy">
        <button class="btn" id="add" style="flex:1">장바구니 담기</button>
        <button class="btn pri" id="buynow" style="flex:1">바로 주문하기</button>
      </div>
      <p class="bulk"><a href="#/inquiries/new?cat=${encodeURIComponent('대량 견적')}&product=${p.id}">재고보다 많이 필요하신가요? <b>대량 견적 문의 →</b></a></p>`}
      <ul class="feats">${(p.features || []).map(f => `<li>${esc(f)}</li>`).join('')}</ul>
      ${p.info ? `<table class="pinfo">${p.info.split('\n').filter(Boolean).map(l => { const [k, ...r] = l.split(':'); return r.length ? `<tr><th>${esc(k.trim())}</th><td>${esc(r.join(':').trim())}</td></tr>` : `<tr><td colspan="2">${esc(l)}</td></tr>`; }).join('')}</table>` : ''}
      ${S.settings.ship_info ? `<div class="shipinfo"><b>배송 · 교환 안내</b><div>${esc(S.settings.ship_info)}</div></div>` : ''}
    </div>
  </div>
  ${details.length ? `
  <section class="detail-sec">
    <div class="detail-h">상품 상세정보</div>
    <div class="detail-imgs">${details.map(d => `<img src="${img(d)}" alt="" loading="lazy">`).join('')}</div>
  </section>` : ''}
  <div class="mbar" id="mbar"><div class="mt" id="mtotal"></div><button class="btn" id="madd">담기</button><button class="btn pri" id="mbuy">바로 주문</button></div>`;

  const inCart = v => getCart().find(x => x.variant_id === v.id)?.qty || 0;
  const avail = v => Math.max(0, v.stock - inCart(v));
  const cartQtyOfProduct = () => getCart().reduce((a, c) => { const v = variant(c.variant_id); return a + (v && v.product_id === p.id ? c.qty : 0); }, 0);
  const render = () => {
    const pq = picks.reduce((a, x) => a + x.qty, 0) + cartQtyOfProduct();
    const rate = rateFor(pq, S.settings);
    $$('.opt').forEach(b => b.classList.toggle('on', picks.some(x => x.v.id === +b.dataset.v)));
    $('#picks').innerHTML = picks.map((x, i) => `
      <div class="pick">
        <div class="pn">${esc(x.v.option_name)}<small>${inCart(x.v) ? `장바구니에 ${inCart(x.v)}개 있음 · ` : ''}재고 ${x.v.stock}${x.v.min_qty > 1 ? ` · 최소 ${x.v.min_qty}개` : ''}</small></div>
        <div class="qty"><button data-pq="${i}" data-d="-1" aria-label="수량 감소">−</button><input data-pi="${i}" value="${x.qty}" inputmode="numeric"><button data-pq="${i}" data-d="1" aria-label="수량 증가">+</button></div>
        <div class="pp num">${rate ? `<s>${won(x.v.price * x.qty)}</s>` : ''}${won(unitPrice(x.v.price, rate) * x.qty)}원</div>
        <button class="px" data-px="${i}" aria-label="삭제">×</button>
      </div>`).join('');
    const n = picks.reduce((a, x) => a + x.qty, 0), sum = picks.reduce((a, x) => a + x.qty * unitPrice(x.v.price, rate), 0);
    const next = tiersOf(S.settings).find(t => t.min > pq);
    $('#ptotal').innerHTML = picks.length
      ? `<span>총 수량 <b class="num">${n}</b>개${rate ? ` <em class="disc">${rate}% 할인 적용</em>` : next ? ` <span class="mut small">· ${next.min - pq}개 더 담으면 ${next.rate}% 할인</span>` : ''}</span><span class="tp">${won(sum)}<small>원</small></span>`
      : '<span class="mut">위에서 옵션을 골라 주세요.</span>';
    $('#mbar').classList.toggle('show', picks.length > 0);   // 휴대폰 하단 주문 바: 옵션을 고른 뒤에만
    $('#mtotal').innerHTML = picks.length ? `<b class="num">${won(sum)}원</b><small>${n}개${rate ? ` · ${rate}% 할인` : ''}</small>` : '<small>옵션을 골라 주세요</small>';
    $('#add').disabled = $('#buynow').disabled = !picks.length;
    $('#madd').disabled = !picks.length;
    $$('[data-pq]').forEach(b => b.onclick = () => setQ(+b.dataset.pq, picks[+b.dataset.pq].qty + +b.dataset.d));
    $$('[data-pi]').forEach(inp => inp.onchange = () => setQ(+inp.dataset.pi, parseInt(inp.value) || 1));
    $$('[data-px]').forEach(b => b.onclick = () => { picks.splice(+b.dataset.px, 1); render(); });
  };
  const setQ = (i, q) => {
    const x = picks[i], lo = x.v.min_qty || 1, hi = avail(x.v);
    if (q > hi) toast(`${x.v.option_name}: 더 담을 수 있는 재고가 ${hi}개입니다`);
    x.qty = Math.max(lo, Math.min(q, hi));
    render();
  };
  const pick = v => {
    if (S.guest) { if (v.image) goSlide(pics.indexOf(v.image)); return; }   // 비회원: 사진만 보여줌
    if (!v.stock) return toast('품절된 옵션입니다');
    if (!avail(v)) return toast('이미 재고만큼 장바구니에 담겨 있습니다');
    if (!picks.some(x => x.v.id === v.id)) picks.push({ v, qty: Math.min(v.min_qty || 1, avail(v)) });
    if (v.image) goSlide(pics.indexOf(v.image));
    render();
  };
  const commit = () => {
    picks.forEach(x => addToCart(x.v.id, x.qty));
    const n = picks.reduce((a, x) => a + x.qty, 0);
    picks.length = 0;
    return n;
  };
  $$('.opt').forEach(b => b.onclick = () => pick(variant(+b.dataset.v)));
  // 대표 사진: 스와이프(모바일) · 화살표/썸네일(PC)
  const sl = $('#slides');
  let cur = 0;
  function goSlide(i, smooth = true) {
    if (i < 0 || i >= pics.length) return;
    sl.scrollTo({ left: i * sl.clientWidth, behavior: smooth ? 'smooth' : 'auto' });
  }
  sl.addEventListener('scroll', () => {
    const i = Math.round(sl.scrollLeft / sl.clientWidth);
    if (i === cur) return;
    cur = i;
    if ($('#gcount')) $('#gcount').textContent = `${i + 1} / ${pics.length}`;
    $$('.thumbs img').forEach(x => x.classList.toggle('on', +x.dataset.i === i));
  }, { passive: true });
  $$('.thumbs img').forEach(t => t.onclick = () => goSlide(+t.dataset.i));
  $$('.gnav').forEach(b => b.onclick = () => goSlide((cur + +b.dataset.g + pics.length) % pics.length));
  if (S.guest) return;
  $('#add').onclick = $('#madd').onclick = () => { const n = commit(); toast(`${n}개를 장바구니에 담았습니다`); render(); };
  $('#buynow').onclick = () => { commit(); location.hash = '#/cart'; };
  $('#mbuy').onclick = () => { if (!picks.length) return $('.opts').scrollIntoView({ behavior: 'smooth', block: 'center' }); commit(); location.hash = '#/cart'; };
  if (vs.length === 1 && vs[0].stock) pick(vs[0]);   // 옵션이 하나뿐이면 바로 선택
  render();
}

// ---------------------------------------------------------------- 쿠폰
// DB place_order 와 같은 계산: 정액 / 정률(10원 내림, 최대 할인) / 무료배송(=배송비)
function couponDiscount(c, sub, ship) {
  if (!c) return 0;
  if (c.kind === 'amount') return Math.min(c.value, sub);
  if (c.kind === 'percent') return Math.min(c.max_discount || Infinity, Math.floor(sub * c.value / 100 / 10) * 10);
  if (c.kind === 'free_ship') return ship;
  return 0;
}
const couponLabel = c => c.kind === 'amount' ? `${won(c.value)}원 할인` : c.kind === 'percent' ? `${c.value}% 할인${c.max_discount ? `(최대 ${won(c.max_discount)}원)` : ''}` : '배송비 무료';

function couponBox(sub, ship) {
  const list = S.myCoupons || [], cur = S.coupon;
  // 이미 무료배송이면 무료배송 쿠폰은 쓸 수 없게 (0원 할인으로 쿠폰만 소진되지 않도록)
  const noShip = c => c.kind === 'free_ship' && !ship;
  const ok = c => (c.min_order || 0) <= sub && !noShip(c);
  return `
  <div class="cp-box">
    <div class="cp-h">쿠폰 ${list.length ? `<span class="mut small">사용 가능 ${list.length}장</span>` : ''}</div>
    ${cur ? `
      <div class="cp-on ${ok(cur) ? '' : 'bad'}">
        <div><b>${esc(cur.name)}</b><div class="small">${couponLabel(cur)}${cur.min_order ? ` · ${won(cur.min_order)}원 이상` : ''}</div>
          ${ok(cur) ? '' : `<div class="small" style="color:var(--bad)">${noShip(cur) ? '이미 무료배송이라 쓸 필요가 없어요' : `${won(cur.min_order - sub)}원 더 담아야 쓸 수 있어요`}</div>`}</div>
        <button class="rm" id="cpx">빼기</button>
      </div>
      ${ok(cur) ? `<div class="row disc-row"><span>쿠폰 할인</span><b>−${won(couponDiscount(cur, sub, ship))}원</b></div>` : ''}` : `
      ${list.length ? `<select id="cpsel"><option value="">쿠폰 선택</option>${list.map(c => `<option value="${c.id}" ${ok(c) ? '' : 'disabled'}>${esc(c.name)} · ${couponLabel(c)}${ok(c) ? '' : noShip(c) ? ' (이미 무료배송)' : ` (${won(c.min_order)}원 이상)`}</option>`).join('')}</select>` : ''}
      <div class="cp-code-row"><input id="cpcode" placeholder="쿠폰 코드 입력" autocomplete="off"><button class="btn sm" id="cpapply" type="button">적용</button></div>
      <div class="err" id="cperr"></div>`}
  </div>`;
}

function bindCoupon() {
  const sel = $('#cpsel'), x = $('#cpx'), ap = $('#cpapply');
  if (sel) sel.onchange = () => { const c = (S.myCoupons || []).find(c => c.id === +sel.value); if (c) { S.coupon = c; viewCart(); } };
  if (x) x.onclick = () => { S.coupon = null; viewCart(); };
  if (ap) ap.onclick = async () => {
    const code = $('#cpcode').value.trim();
    if (!code) return $('#cperr').textContent = '쿠폰 코드를 입력해 주세요.';
    ap.disabled = true;
    try { const c = await api.checkCoupon(code); S.coupon = { ...c, code: code.toUpperCase() }; toast('쿠폰을 적용했습니다'); viewCart(); }
    catch (e) { $('#cperr').textContent = errMsg(e); ap.disabled = false; }
  };
}

// ---------------------------------------------------------------- 장바구니 / 주문서
// 지금 가격·설정 기준 장바구니 총액 (주문 직전 변경 확인용 · viewCart 계산과 동일)
function cartTotal() {
  const cart = getCart(), pq = {};
  cart.forEach(c => { const v = variant(c.variant_id); if (v) pq[v.product_id] = (pq[v.product_id] || 0) + c.qty; });
  let sub = 0;
  cart.forEach(c => { const v = variant(c.variant_id); if (v) sub += unitPrice(v.price, rateFor(pq[v.product_id], S.settings)) * c.qty; });
  const ship = shippingFor(sub), c = S.coupon;
  const cp = c && (c.min_order || 0) <= sub && !(c.kind === 'free_ship' && !ship) ? c : null;
  return sub + ship - (cp ? couponDiscount(cp, sub, ship) : 0);
}

function viewCart() {
  const cart = getCart();
  if (!cart.length) {
    app().innerHTML = `<div class="page-head"><div><div class="eyebrow">Cart</div><h1>장바구니</h1></div></div>
      <div class="empty">장바구니가 비어 있습니다.<br><a class="btn" href="#/products">상품 보러 가기</a></div>`;
    return;
  }
  let blocked = false, sub = 0, listSub = 0;
  const pq = {};
  cart.forEach(c => { const v = variant(c.variant_id); if (v) pq[v.product_id] = (pq[v.product_id] || 0) + c.qty; });
  const quote = [];
  const lines = cart.map((c, i) => {
    const v = variant(c.variant_id), p = v && product(v.product_id);
    if (!v || !p) { blocked = true; return `<div class="line"><div></div><div><h4>판매 종료된 상품</h4><div class="warn">삭제 후 주문해 주세요.</div></div><div class="r"><button class="rm" data-rm="${i}">삭제</button></div></div>`; }
    let warn = '';
    if (!v.stock) { warn = '품절되었습니다. 삭제 후 주문해 주세요.'; blocked = true; }
    else if (c.qty > v.stock) { warn = `재고가 ${v.stock}개 남았습니다. 수량을 줄여 주세요.`; blocked = true; }
    else if (c.qty < (v.min_qty || 1)) { warn = `최소 주문수량은 ${v.min_qty}개입니다.`; blocked = true; }
    const rate = rateFor(pq[p.id], S.settings), u = unitPrice(v.price, rate);
    sub += u * c.qty; listSub += v.price * c.qty;
    quote.push({ product_name: p.name, option_name: v.option_name, unit_price: u, discount_rate: rate, qty: c.qty, line_total: u * c.qty });
    return `
    <div class="line">
      <a href="#/p/${p.id}"><img src="${thumb(v.image || p.image)}" alt=""></a>
      <div><h4>${esc(p.name)}</h4><div class="o">${esc(v.option_name)} · ${rate ? `<s>${won(v.price)}</s> ` : ''}${won(u)}원${rate ? ` <em class="disc">${rate}%</em>` : ''}</div>
        <div class="p">${won(u * c.qty)}원</div>${warn ? `<div class="warn">${warn}</div>` : ''}</div>
      <div class="r">
        <div class="qty"><button data-q="${i}" data-d="-1">−</button><input value="${c.qty}" data-qi="${i}" inputmode="numeric"><button data-q="${i}" data-d="1">+</button></div>
        <button class="rm" data-rm="${i}">삭제</button>
      </div>
    </div>`;
  }).join('');
  const ship = shippingFor(sub), d = S.dealer, st = S.settings;
  if (S.myCoupons === undefined) { S.myCoupons = null; api.myCoupons().then(l => { S.myCoupons = l; if (location.hash === '#/cart') viewCart(); }).catch(() => { S.myCoupons = []; }); }
  const need = st.free_shipping_over && ship ? st.free_shipping_over - sub : 0;
  const cp = S.coupon && (S.coupon.min_order || 0) <= sub && !(S.coupon.kind === 'free_ship' && !ship) ? S.coupon : null;
  const cdisc = cp ? couponDiscount(cp, sub, ship) : 0;
  // 입력하던 주문서 내용 유지 (수량을 바꿔 화면을 다시 그려도 지워지지 않게)
  const D = S.draft = S.draft || {
    orderer_name: d.manager_name, orderer_phone: d.phone,
    dest: 'store', ship_name: d.manager_name, ship_phone: d.phone, addr1: d.address || '', addr2: '',
    c_name: '', c_phone: '', c_addr1: '', c_addr2: '',
    depositor: d.manager_name || d.company, memo: '', tax: false, tax_biz_no: d.biz_no || '', tax_email: d.email, save_addr: false,
  };
  const store = D.dest === 'store';

  app().innerHTML = `
  <div class="page-head"><div><div class="eyebrow">Cart · Checkout</div><h1>장바구니 · 주문서</h1></div></div>
  <div class="cart">
    <div>
      <div class="lines">${lines}</div>
      <form id="of" class="panel co" style="margin-top:28px" novalidate>
        <h2>주문자 정보</h2>
        <div class="orderer-co">${esc(d.company)}${d.branch ? ' ' + esc(d.branch) : ''} <span class="mut">· ${esc(d.email)}</span></div>
        <div class="grid2">
          <div class="field"><label>주문 담당자<em>*</em></label><input name="orderer_name" value="${esc(D.orderer_name)}"></div>
          <div class="field"><label>연락처<em>*</em></label><input name="orderer_phone" value="${esc(D.orderer_phone)}" inputmode="tel"></div>
        </div>

        <h2 class="sec2">배송지 정보</h2>
        <div class="seg">
          <label class="${store ? 'on' : ''}"><input type="radio" name="dest" value="store" ${store ? 'checked' : ''}> 기본 배송지로 받기</label>
          <label class="${store ? '' : 'on'}"><input type="radio" name="dest" value="customer" ${store ? '' : 'checked'}> 다른 주소로 받기</label>
        </div>
        ${store ? `
        <div class="grid2">
          <div class="field"><label>받는 분<em>*</em></label><input name="ship_name" value="${esc(D.ship_name)}"></div>
          <div class="field"><label>연락처<em>*</em></label><input name="ship_phone" value="${esc(D.ship_phone)}" inputmode="tel"></div>
        </div>
        ${addrField('배송지', D.addr1, true)}
        <label class="check"><input type="checkbox" name="save_addr" ${D.save_addr ? 'checked' : ''}> <span>이 주소를 내 정보의 기본 배송지로 저장</span></label>` : `
        <p class="small mut" style="margin:0 0 12px">고객 댁이나 다른 지점 등 기본 배송지가 아닌 곳으로 보냅니다.</p>
        <div class="grid2">
          <div class="field"><label>받는 분<em>*</em></label><input name="ship_name" value="${esc(D.c_name)}"></div>
          <div class="field"><label>연락처<em>*</em></label><input name="ship_phone" value="${esc(D.c_phone)}" inputmode="tel"></div>
        </div>
        ${addrField('배송지', D.c_addr1, true)}`}

        <h2 class="sec2">입금 정보</h2>
        <div class="field"><label>입금자명<em>*</em></label><input name="depositor" value="${esc(D.depositor)}"><span class="hint">입금 확인에 사용됩니다. 실제 입금하실 이름과 같게 적어 주세요.${cutoffText(S.settings.same_day_cutoff) ? `<br>${cutoffText(S.settings.same_day_cutoff)}까지 입금 확인되면 당일 출고돼요.` : ''}</span></div>
        <label class="check"><input type="checkbox" name="tax" ${D.tax ? 'checked' : ''}> <span><b>세금계산서 발행 요청</b></span></label>
        ${D.tax ? `
        <div class="grid2 taxbox">
          <div class="field"><label>사업자등록번호<em>*</em></label><input name="tax_biz_no" value="${esc(D.tax_biz_no)}" inputmode="numeric" placeholder="000-00-00000"></div>
          <div class="field"><label>계산서 받을 이메일<em>*</em></label><input name="tax_email" value="${esc(D.tax_email)}" type="email"></div>
        </div>` : ''}
        <div class="field" style="margin-top:6px"><label>요청사항</label><textarea name="memo" rows="2" placeholder="예) 출고 전 연락 부탁드립니다">${esc(D.memo)}</textarea></div>
      </form>
    </div>
    <div class="sum panel">
      <h2>결제 금액</h2>
      <div class="row"><span>상품 금액</span><b>${won(listSub)}원</b></div>
      ${listSub > sub ? `<div class="row disc-row"><span>수량 할인</span><b>−${won(listSub - sub)}원</b></div>` : ''}
      <div class="row"><span>배송비</span><b>${ship ? won(ship) + '원' : '무료'}</b></div>
      ${need > 0 ? `<div class="free">${won(need)}원 더 담으면 무료배송</div>` : ''}
      ${couponBox(sub, ship)}
      <div class="row tot"><span>총 입금액</span><b>${won(sub + ship - cdisc)}원</b></div>
      <p class="small mut" style="margin:14px 0">결제 방법 · <b style="color:var(--ink)">무통장 입금</b><br>주문 후 ${st.pay_deadline_days || 3}일 이내 입금해 주세요. 기한이 지나면 자동 취소됩니다.</p>
      <button class="btn pri block" id="order" ${blocked ? 'disabled' : ''}>${won(sub + ship - cdisc)}원 주문하기</button>
      <div class="err" id="ordererr">${blocked ? '재고·수량을 확인해 주세요.' : ''}</div>
      <button class="btn ghost block" id="quote" style="margin-top:10px">견적서 받기 (인쇄 · PDF)</button>
      ${tierText(st) ? `<p class="small mut" style="margin-top:12px">수량 할인: ${tierText(st)} (같은 상품 옵션 합산)</p>` : ''}
    </div>
  </div>`;
  $('#quote').onclick = () => printDoc({
    kind: '견 적 서', no: '', date: `견적일 ${fmtDT(new Date()).slice(0, 10)} · 유효기간 7일`,
    to: { company: `${d.company}${d.branch ? ' ' + d.branch : ''}`, manager: d.manager_name, phone: d.phone, biz_no: d.biz_no },
    items: quote, shipping: ship, total: sub + ship - cdisc, biz: S.info, coupon: cp ? { name: cp.name, discount: cdisc } : null,
    note: `· 표시 금액은 부가세 포함 금액입니다.\n· 결제: 무통장 입금 (주문 후 ${st.pay_deadline_days || 3}일 이내)\n· 재고 상황에 따라 수량이 변동될 수 있습니다.`,
  });

  bindCoupon();
  const f = $('#of');
  if (!store && D.c_addr2) f.addr2.value = D.c_addr2;
  if (store && D.addr2) f.addr2.value = D.addr2;
  f.orderer_name.addEventListener('input', () => {
    if (f.depositor.value === D.orderer_name) f.depositor.value = f.orderer_name.value;
  });
  const keep = () => {
    D.orderer_name = f.orderer_name.value; D.orderer_phone = f.orderer_phone.value;
    if (store) { D.ship_name = f.ship_name.value; D.ship_phone = f.ship_phone.value; D.addr1 = f.addr1.value; D.addr2 = f.addr2.value; D.save_addr = f.save_addr.checked; }
    else { D.c_name = f.ship_name.value; D.c_phone = f.ship_phone.value; D.c_addr1 = f.addr1.value; D.c_addr2 = f.addr2.value; }
    D.depositor = f.depositor.value; D.memo = f.memo.value; D.tax = f.tax.checked;
    if (f.tax_biz_no) { D.tax_biz_no = f.tax_biz_no.value; D.tax_email = f.tax_email.value; }
  };
  f.addEventListener('input', keep);
  f.addEventListener('change', keep);
  ['orderer_phone', 'ship_phone'].forEach(k => f[k].addEventListener('input', () => { f[k].value = fmtPhone(f[k].value); keep(); }));
  if (f.tax_biz_no) f.tax_biz_no.addEventListener('input', () => { f.tax_biz_no.value = fmtBiz(f.tax_biz_no.value); keep(); });
  bindAddr(f);
  $$('input[name=dest]', f).forEach(r => r.onchange = () => { keep(); D.dest = r.value; viewCart(); });
  f.tax.onchange = () => { keep(); viewCart(); };

  const setQty = (i, q) => { keep(); const c = getCart(); c[i].qty = Math.max(1, q); setCart(c); viewCart(); };
  $$('[data-q]').forEach(b => b.onclick = () => setQty(+b.dataset.q, getCart()[+b.dataset.q].qty + +b.dataset.d));
  $$('[data-qi]').forEach(inp => inp.onchange = () => setQty(+inp.dataset.qi, parseInt(inp.value) || 1));
  $$('[data-rm]').forEach(b => b.onclick = () => { keep(); const c = getCart(); c.splice(+b.dataset.rm, 1); setCart(c); viewCart(); });

  $('#order').onclick = async () => {
    keep();
    const err = $('#ordererr'), btn = $('#order');
    const addr = addrValue(f), t = x => (x || '').trim();
    const need = [t(D.orderer_name), t(D.orderer_phone), t(f.ship_name.value), t(f.ship_phone.value), addr, t(D.depositor)];
    if (need.some(x => !x)) { err.textContent = '필수 항목(*)을 모두 입력해 주세요.'; return; }
    if (D.tax && (!t(D.tax_biz_no) || !t(D.tax_email))) { err.textContent = '세금계산서용 사업자등록번호와 이메일을 입력해 주세요.'; return; }
    const dest = store ? '기본 배송지' : '다른 주소';
    if (S.coupon && !cp && S.coupon.kind === 'free_ship' && !ship) { err.textContent = `이미 무료배송이라 쿠폰 '${S.coupon.name}'은 쓸 수 없어요. 쿠폰을 빼 주세요.`; return; }
    if (S.coupon && !cp) { err.textContent = `쿠폰 '${S.coupon.name}'은 ${won(S.coupon.min_order)}원 이상 주문 시 쓸 수 있어요. 쿠폰을 빼거나 상품을 더 담아 주세요.`; return; }
    // 화면을 연 뒤 관리자가 가격·할인·배송비를 바꿨을 수 있어 최신 값으로 다시 계산
    btn.disabled = true;
    await refreshStock();
    try { S.settings = (await api.catalog()).settings || S.settings; } catch (e) { /* 그대로 진행 */ }
    btn.disabled = false;
    if (cartTotal() !== sub + ship - cdisc) { viewCart(); toast('가격·배송비가 변경되어 다시 계산했어요. 금액을 확인하고 다시 주문해 주세요.', 4000); return; }
    if (!await ask(`총 ${won(sub + ship - cdisc)}원을 주문하시겠습니까?\n배송: ${dest} (${t(f.ship_name.value)})`, { ok: '주문하기' })) return;
    btn.disabled = true; btn.textContent = '주문 처리 중…'; err.textContent = '';
    try {
      const r = await api.placeOrder({
        p_items: getCart().map(c => ({ variant_id: c.variant_id, qty: c.qty })),
        p_depositor: t(D.depositor), p_ship_name: t(f.ship_name.value), p_ship_phone: t(f.ship_phone.value),
        p_ship_address: addr, p_memo: [store ? '' : '[다른 주소 배송]', t(D.memo)].filter(Boolean).join(' ') || null,
        p_orderer_name: t(D.orderer_name), p_orderer_phone: t(D.orderer_phone),
        p_tax_invoice: !!D.tax, p_tax_biz_no: D.tax ? t(D.tax_biz_no) : null, p_tax_email: D.tax ? t(D.tax_email) : null,
        ...(cp ? (cp.code ? { p_coupon_code: cp.code } : { p_coupon_id: cp.id }) : {}),
        ...(DEMO && cp ? { _coupon: cp } : {}),
      });
      // 기본 배송지 저장 / 비어 있던 사업자번호 채우기
      const patch = {};
      if (store && D.save_addr && addr !== S.dealer.address) patch.address = addr;
      if (D.tax && !S.dealer.biz_no) patch.biz_no = t(D.tax_biz_no);
      if (Object.keys(patch).length) { try { await api.updateMe(patch); Object.assign(S.dealer, patch); } catch (e) {} }
      setCart([]);
      S.orders = null; S.draft = null; S.coupon = null; S.myCoupons = undefined;
      await refreshStock();
      location.hash = '#/done/' + r.order_no;
    } catch (e) {
      err.textContent = errMsg(e);
      btn.disabled = false; btn.textContent = '다시 주문하기';
      await refreshStock();
    }
  };
}

// ---------------------------------------------------------------- 내 정보
function viewMe() {
  const d = S.dealer;
  app().innerHTML = `
  <div class="page-head"><div><div class="eyebrow">My Account</div><h1>내 정보</h1></div></div>
  <div class="me-grid">
    <form id="mf" class="panel" novalidate>
      <h2>딜러 정보</h2>
      <div class="locked-box">
        <div class="lk-h">승인된 사업자 정보 <span>변경이 필요하면 <a href="#/inquiries/new">1:1 문의</a>로 요청해 주세요</span></div>
        <dl>
          <dt>딜러사명</dt><dd>${esc(d.company)}</dd>
          <dt>지점명</dt><dd>${esc(d.branch || '-')}</dd>
          ${d.biz_no ? `<dt>사업자등록번호</dt><dd>${esc(d.biz_no)}</dd>` : ''}
          <dt>이메일 (아이디)</dt><dd>${esc(d.email)}</dd>
        </dl>
      </div>
      <h3 class="ed-h">변경 가능한 정보</h3>
      <div class="grid2">
        <div class="field"><label>담당자 성함<em>*</em></label><input name="manager_name" value="${esc(d.manager_name)}"></div>
        <div class="field"><label>직급/직책</label><input name="position" value="${esc(d.position)}" placeholder="예) 매니저, 대리, 지점장"></div>
        <div class="field"><label>휴대폰<em>*</em></label><input name="phone" value="${esc(d.phone)}" inputmode="tel"></div>
      </div>
      ${d.biz_no ? '' : `<div class="field"><label>사업자등록번호</label><input name="biz_no" value="" inputmode="numeric" placeholder="000-00-00000"><span class="hint">한 번 입력하면 이후에는 1:1 문의로만 바꿀 수 있어요. 세금계산서 요청 시 자동으로 채워집니다.</span></div>`}
      ${addrField('기본 배송지', d.address || '')}
      <button class="btn pri" type="submit">저장</button><div class="err" id="merr"></div>
    </form>
    <div class="me-side">
    <div class="panel my-cp" id="mycp"><h2>내 쿠폰</h2><div class="mut small">불러오는 중…</div></div>
    <form id="pf" class="panel" novalidate>
      <h2>비밀번호 변경</h2>
      <div class="field"><label>새 비밀번호</label><input name="pw" type="password" autocomplete="new-password" placeholder="6자 이상"></div>
      <div class="field"><label>새 비밀번호 확인</label><input name="pw2" type="password" autocomplete="new-password"></div>
      <button class="btn" type="submit">비밀번호 변경</button><div class="err" id="perr"></div>
      <hr style="border:0;border-top:1px solid var(--hair);margin:22px 0 16px">
      ${d.is_admin ? `<a class="btn pri block" href="admin.html" style="margin-bottom:8px">관리자 페이지로 이동</a>` : ''}
      <button class="btn ghost block" type="button" data-act="logout">로그아웃</button>
    </form>
    </div>
  </div>`;
  api.myCoupons().then(list => {
    S.myCoupons = list;
    const el = $('#mycp'); if (!el) return;
    el.innerHTML = `<h2>내 쿠폰 <span class="mut small" style="font-weight:400">${list.length}장</span></h2>` + (list.length
      ? list.map(c => `<div class="cp-item"><b>${esc(c.name)}</b><div class="small">${couponLabel(c)}${c.min_order ? ` · ${won(c.min_order)}원 이상` : ''}${c.first_order_only ? ' · 첫 주문' : ''}</div>${c.ends_at ? `<div class="small mut">${fmtDT(c.ends_at).slice(0, 10)}까지</div>` : ''}</div>`).join('') + '<p class="small mut" style="margin:10px 0 0">주문서의 쿠폰 칸에서 골라 쓰세요.</p>'
      : '<div class="mut small">사용 가능한 쿠폰이 없습니다. 쿠폰 코드가 있다면 주문서에서 입력하세요.</div>');
  }).catch(() => { const el = $('#mycp'); if (el) el.remove(); });
  const f = $('#mf');
  f.phone.oninput = () => f.phone.value = fmtPhone(f.phone.value);
  if (f.biz_no) f.biz_no.oninput = () => f.biz_no.value = fmtBiz(f.biz_no.value);
  bindAddr(f);
  f.onsubmit = async e => {
    e.preventDefault();
    const v = k => f[k].value.trim();
    if (!v('manager_name') || !v('phone')) return $('#merr').textContent = '필수 항목(*)을 입력해 주세요.';
    const patch = { manager_name: v('manager_name'), position: v('position') || null, phone: v('phone'), address: addrValue(f) || null };
    if (f.biz_no && v('biz_no')) patch.biz_no = v('biz_no');
    try { await api.updateMe(patch); Object.assign(S.dealer, patch); S.draft = null; renderNav(); toast('내 정보를 저장했습니다'); viewMe(); }
    catch (err) { $('#merr').textContent = errMsg(err); }
  };
  $('#pf').onsubmit = async e => {
    e.preventDefault();
    const p = e.target;
    if (p.pw.value.length < 6) return $('#perr').textContent = '비밀번호는 6자 이상이어야 합니다.';
    if (p.pw.value !== p.pw2.value) return $('#perr').textContent = '비밀번호 확인이 일치하지 않습니다.';
    try { await api.updatePassword(p.pw.value); p.reset(); $('#perr').textContent = ''; toast('비밀번호를 변경했습니다'); }
    catch (err) { $('#perr').textContent = errMsg(err); }
  };
}

async function refreshStock() {
  try {
    const fresh = await api.stock();
    for (const f of fresh) { const v = variant(f.id); if (v) Object.assign(v, f); }
  } catch (e) { /* 다음 로딩 때 갱신 */ }
}

// ---------------------------------------------------------------- 주문 완료
function bankBox(o) {
  const st = S.settings;
  return `
  <div class="bank"><dl>
    <dt>입금 금액</dt><dd class="amt">${won(o.total)}원</dd>
    <dt>입금 계좌</dt><dd>${esc(st.bank_name)} ${esc(st.bank_account)}<button class="copy" data-copy="${esc(st.bank_account)}">복사</button></dd>
    <dt>예금주</dt><dd>${esc(st.bank_holder)}</dd>
    <dt>입금자명</dt><dd>${esc(o.depositor_name)}</dd>
    <dt>입금 기한</dt><dd>${fmtDT(o.pay_deadline)}까지</dd>
  </dl>${cutoffText(st.same_day_cutoff) ? `<p class="cutoff"><b>${cutoffText(st.same_day_cutoff)}</b>까지 입금 확인되면 <b>당일 출고</b>돼요 <span class="mut">(주말·공휴일 제외)</span></p>` : ''}</div>`;
}

const itemsTable = o => `<table class="itbl">${(o.order_items || []).map(it => `<tr><td>${esc(it.product_name)} <span class="mut">· ${esc(it.option_name)}</span></td><td class="n">${it.discount_rate ? `<em class="disc">${it.discount_rate}%</em> ` : ''}${won(it.unit_price)} × ${it.qty}</td><td class="n">${won(it.line_total)}원</td></tr>`).join('')}
  <tr><td class="mut">배송비</td><td></td><td class="n">${o.shipping_fee ? won(o.shipping_fee) + '원' : '무료'}</td></tr>
  ${o.coupon_discount ? `<tr><td class="mut">쿠폰 · ${esc(o.coupon_name || '')}</td><td></td><td class="n" style="color:var(--acc)">−${won(o.coupon_discount)}원</td></tr>` : ''}
  <tr class="tt"><td>합계</td><td></td><td class="n">${won(o.total)}원</td></tr></table>`;

function printStatement(o, kind = '거 래 명 세 서') {
  const d = S.dealer;
  printDoc({
    kind, no: o.order_no, date: `주문일 ${fmtDT(o.created_at).slice(0, 10)}`,
    to: { company: `${d.company}${d.branch ? ' ' + d.branch : ''}`, manager: o.orderer_name || d.manager_name, phone: o.orderer_phone || d.phone, biz_no: o.tax_biz_no || d.biz_no },
    items: o.order_items || [], shipping: o.shipping_fee, total: o.total, biz: S.info,
    coupon: o.coupon_discount ? { name: o.coupon_name, discount: o.coupon_discount } : null,
    note: `· 표시 금액은 부가세 포함 금액입니다.\n· 받는 분: ${o.ship_name} (${o.ship_phone}) ${o.ship_address}`,
  });
}

async function viewDone(no) {
  const orders = await loadOrders();
  const o = orders.find(x => x.order_no === no);
  if (!o) return viewOrders();
  app().innerHTML = `
  <div class="done">
    <div class="eyebrow">Order Complete</div>
    <h1>주문이 접수되었습니다</h1>
    <p class="mut">주문번호 <b class="num" style="color:var(--ink)">${esc(o.order_no)}</b> · 아래 계좌로 입금해 주시면 확인 후 출고합니다.</p>
    ${bankBox(o)}
    <h2 style="margin-top:26px">주문 상품</h2>
    ${itemsTable(o)}
    <p class="small mut" style="margin-top:14px">받는 분 ${esc(o.ship_name)} · ${esc(o.ship_phone)} · ${esc(o.ship_address)}</p>
    <p class="small mut">${esc(S.settings.notice || '')}</p>
    <div class="done-acts"><a class="btn pri" href="#/orders">주문내역 보기</a><button class="btn" id="stmt">주문서 출력</button><a class="btn ghost" href="#/products">계속 둘러보기</a></div>
  </div>`;
  $('#stmt').onclick = () => printStatement(o, '주 문 서');
}

// ---------------------------------------------------------------- 주문 내역
async function loadOrders(force) {
  if (!S.orders || force) { S.orders = await api.orders(); renderNav(); }
  return S.orders;
}

async function viewOrders() {
  app().innerHTML = `<div class="loading">주문내역을 불러오는 중…</div>`;
  const orders = await loadOrders(true);
  app().innerHTML = `
  <div class="page-head"><div><div class="eyebrow">Orders · ${orders.length}</div><h1>주문내역</h1></div></div>
  ${!orders.length ? `<div class="empty">아직 주문 내역이 없습니다.<br><a class="btn" href="#/products">상품 보러 가기</a></div>` : `
  <div class="orders">
    ${orders.map((o, i) => {
      const step = FLOW.indexOf(o.status);
      const items = o.order_items || [];
      const title = items[0] ? esc(items[0].product_name) + (items.length > 1 ? ` 외 ${items.length - 1}건` : '') : '';
      return `
      <details class="ord" ${i === 0 && o.status === 'pending_payment' ? 'open' : ''}>
        <summary>
          <div><div class="no">${esc(o.order_no)}</div><div class="dt">${fmtDT(o.created_at)}</div></div>
          <div class="small">${title}</div>
          <div class="amt">${won(o.total)}원</div>
          <div>${statusBadge(o.status)}</div>
        </summary>
        <div class="body">
          ${o.status !== 'cancelled' ? `<div class="steps">${FLOW.map((s, k) => `<i class="${k <= step ? 'on' : ''}">${STATUS[s]}</i>`).join('')}</div>` : `<p class="small mut">취소됨 · ${fmtDT(o.cancelled_at)}${o.cancel_reason ? ' · ' + esc(o.cancel_reason) : ''}</p>`}
          ${itemsTable(o)}
          <div class="meta">
            ${o.orderer_name ? `<div><span>주문자</span>${esc(o.orderer_name)} · ${esc(o.orderer_phone || '')}</div>` : ''}
            <div><span>받는 분</span>${esc(o.ship_name)} · ${esc(o.ship_phone)}</div>
            ${o.tax_invoice ? `<div><span>세금계산서</span>${o.tax_issued ? '발행 완료' : '발행 요청'} · ${esc(o.tax_biz_no || '')}</div>` : ''}
            <div><span>배송지</span>${esc(o.ship_address)}</div>
            ${o.memo ? `<div><span>요청사항</span>${esc(o.memo)}</div>` : ''}
            ${o.tracking_no ? `<div><span>송장</span>${esc(o.carrier || '')} ${esc(o.tracking_no)}<button class="copy" data-copy="${esc(o.tracking_no)}">복사</button>${trackUrl(o.carrier, o.tracking_no) ? ` <a class="track-btn" href="${esc(trackUrl(o.carrier, o.tracking_no))}" target="_blank" rel="noopener">배송 조회 ↗</a>` : ''}</div>` : ''}
            ${o.status === 'shipped' ? `<div><span>수령 확인</span>배송 시작 ${S.settings.auto_deliver_days || 3}일 후 자동 완료</div>` : ''}
            ${o.status === 'delivered' && o.delivered_at ? `<div><span>배송완료</span>${fmtDT(o.delivered_at)}${o.delivered_by === 'dealer' ? ' · 수령 확인' : o.delivered_by === 'auto' ? ' · 자동 처리' : ''}</div>` : ''}
          </div>
          ${o.status === 'pending_payment' ? bankBox(o) : ''}
          <div class="acts">
            ${o.status === 'pending_payment' ? (o.paid_notified_at
              ? `<span class="badge st-paid">입금 알림 보냄 · ${fmtDT(o.paid_notified_at).slice(5)}</span>`
              : `<button class="btn pri sm" data-paid="${o.id}">입금했어요</button>`) : ''}
            ${o.status === 'shipped' ? `<button class="btn pri sm" data-recv="${o.id}">받았어요</button>` : ''}
            ${o.status !== 'cancelled' ? `<button class="btn ghost sm" data-stmt="${o.id}">거래명세서</button>` : ''}
            <button class="btn ghost sm" data-reorder="${o.id}">다시 담기</button>
            ${['shipped', 'delivered'].includes(o.status) ? `<a class="btn ghost sm" href="#/inquiries/new?order=${o.id}&cat=${encodeURIComponent('교환·반품')}">교환·반품 문의</a>` : `<a class="btn ghost sm" href="#/inquiries/new?order=${o.id}">1:1 문의</a>`}
            ${o.status === 'pending_payment' ? `<button class="btn ghost sm" data-cancel="${o.id}">주문 취소</button>` : ''}
            ${window.KAKAO_CHANNEL_URL ? `<a class="btn ghost sm kakao-btn" href="${esc(window.KAKAO_CHANNEL_URL)}" target="_blank" rel="noopener" data-copy="주문번호 ${esc(o.order_no)}">이 주문 카카오톡 문의</a>` : ''}
          </div>
        </div>
      </details>`;
    }).join('')}
  </div>`}`;
  $$('[data-cancel]').forEach(b => b.onclick = async () => {
    if (!await ask('이 주문을 취소하시겠습니까?\n담긴 상품의 재고가 복원됩니다.', { ok: '주문 취소', cancel: '닫기', danger: true })) return;
    b.disabled = true;
    try { await api.cancel(+b.dataset.cancel); toast('주문을 취소했습니다'); await refreshStock(); viewOrders(); }
    catch (e) { toast(errMsg(e)); b.disabled = false; }
  });
  $$('[data-paid]').forEach(b => b.onclick = async () => {
    if (!await ask('입금하셨나요?\n관리자에게 입금 확인 요청 알림을 보냅니다.', { ok: '알림 보내기' })) return;
    b.disabled = true;
    try { await api.notifyPaid(+b.dataset.paid); toast('입금 확인 요청을 보냈습니다'); viewOrders(); }
    catch (e) { toast(errMsg(e)); b.disabled = false; }
  });
  $$('[data-recv]').forEach(b => b.onclick = async () => {
    if (!await ask('상품을 받으셨나요?\n배송완료로 변경됩니다.', { ok: '받았어요' })) return;
    b.disabled = true;
    try { await api.confirmReceived(+b.dataset.recv); toast('배송완료로 변경했습니다'); viewOrders(); }
    catch (e) { toast(errMsg(e)); b.disabled = false; }
  });
  $$('[data-stmt]').forEach(b => b.onclick = () => printStatement(orders.find(o => o.id === +b.dataset.stmt)));
  $$('[data-reorder]').forEach(b => b.onclick = () => reorder(+b.dataset.reorder));
}

// ---------------------------------------------------------------- 1:1 문의
const INQ_CATS = ['교환·반품', '불량', '배송', '대량 견적', '세금계산서', '기타'];
const INQ_ST = { open: ['답변 대기', 'st-pending_payment'], answered: ['답변 완료', 'st-paid'], closed: ['종료', 'st-cancelled'] };

async function loadInquiries(force) {
  if (!S.inquiries || force) S.inquiries = await api.inquiries();
  return S.inquiries;
}

async function viewInquiries() {
  app().innerHTML = `<div class="loading">문의 내역을 불러오는 중…</div>`;
  const list = await loadInquiries(true);
  list.filter(q => q.status === 'answered').forEach(q => store('zk_seen_' + q.id, 1));
  renderNav();
  app().innerHTML = `
  <div class="page-head"><div><div class="eyebrow">Inquiry · ${list.length}</div><h1>1:1 문의</h1></div>
    <div class="inq-acts">${window.KAKAO_CHANNEL_URL ? `<a class="btn kakao-btn" href="${esc(window.KAKAO_CHANNEL_URL)}" target="_blank" rel="noopener">${KAKAO_ICON}카카오톡 문의</a>` : ''}<a class="btn pri" href="#/inquiries/new">새 문의 작성</a></div></div>
  <ul class="inq-guide">
    ${window.KAKAO_CHANNEL_URL ? '<li><b>빠른 질문</b>(재고, 출고일, 호환 여부)은 <b>카카오톡 채팅</b>이 가장 빨라요.</li>' : ''}
    <li><b>교환·반품·불량, 대량 견적, 세금계산서</b>처럼 기록이 필요한 문의는 [새 문의 작성]으로 남겨 주세요. 답변이 달리면 메일로 알려 드립니다.</li>
  </ul>
  ${!list.length ? '<div class="empty">아직 문의 내역이 없습니다.</div>' : `
  <div class="notices">${list.map((q, i) => `
    <details class="ntc" ${i === 0 ? 'open' : ''}>
      <summary><span class="badge ${INQ_ST[q.status][1]}">${INQ_ST[q.status][0]}</span><span class="cat-tag">${esc(q.category)}</span><span class="tt">${esc(q.title)}</span><span class="dt">${fmtDT(q.created_at).slice(0, 10)}</span></summary>
      <div class="bd">${q.orders?.order_no ? `<div class="small mut">관련 주문 ${esc(q.orders.order_no)}</div>` : ''}${esc(q.body)}</div>
      ${q.answer ? `<div class="ans"><b>답변</b> <span class="small mut">${fmtDT(q.answered_at)}</span><div>${esc(q.answer)}</div></div>` : ''}
    </details>`).join('')}</div>`}`;
}

async function viewInquiryNew(params) {
  const orders = await loadOrders().catch(() => []);
  const oid = +params.get('order') || '', cat = params.get('cat') || (oid ? '배송' : '기타');
  const pid = +params.get('product'), p = pid && product(pid);
  app().innerHTML = `
  <a class="back" href="#/inquiries">← 문의 내역</a>
  <div class="page-head" style="padding-top:16px"><div><div class="eyebrow">New Inquiry</div><h1>새 문의 작성</h1></div></div>
  <form id="qf" class="panel inq-form" novalidate>
    <div class="grid2">
      <div class="field"><label>문의 유형<em>*</em></label><select name="category">${INQ_CATS.map(c => `<option ${c === cat ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
      <div class="field"><label>관련 주문</label><select name="order_id"><option value="">선택 안 함</option>${orders.filter(o => o.status !== 'cancelled').map(o => `<option value="${o.id}" ${o.id === oid ? 'selected' : ''}>${esc(o.order_no)} · ${fmtDT(o.created_at).slice(0, 10)} · ${won(o.total)}원</option>`).join('')}</select></div>
    </div>
    <div class="field"><label>제목<em>*</em></label><input name="title" value="${p ? esc(p.name) + ' 대량 구매 견적 요청' : ''}"></div>
    <div class="field"><label>내용<em>*</em></label><textarea name="body" rows="8" placeholder="${cat === '대량 견적' ? '필요한 옵션별 수량과 희망 납기를 적어 주세요.' : '상품명·옵션, 문제 내용을 자세히 적어 주세요.'}">${p ? `상품: ${p.name}
옵션별 수량: 
희망 납기: ` : ''}</textarea>
      <span class="hint">불량·파손 사진은 카카오톡 채널로 주문번호와 함께 보내 주세요.</span></div>
    <button class="btn pri" type="submit">문의 등록</button><div class="err" id="qerr"></div>
  </form>`;
  $('#qf').onsubmit = async e => {
    e.preventDefault();
    const f = e.target, title = f.title.value.trim(), body = f.body.value.trim();
    if (!title || !body) return $('#qerr').textContent = '제목과 내용을 입력해 주세요.';
    const btn = f.querySelector('button'); btn.disabled = true;
    try {
      await api.addInquiry({ category: f.category.value, order_id: +f.order_id.value || null, title, body });
      toast('문의를 등록했습니다. 답변이 달리면 메일로 알려 드립니다.', 3500);
      S.inquiries = null; location.hash = '#/inquiries';
    } catch (err) { $('#qerr').textContent = errMsg(err); btn.disabled = false; }
  };
}

// ---------------------------------------------------------------- 라우터
const isPolicy = () => /^#\/(privacy|terms)$/.test(location.hash);

async function route() {
  if (RECOVERY) return;
  if (/access_token=|error_description=/.test(location.hash)) return;
  if (isPolicy()) { window.scrollTo(0, 0); return viewPolicy(location.hash.slice(2)); }
  if (!S.user) return guestRoute();
  if (S.dealer?.status !== 'approved') return;
  renderNav();
  window.scrollTo(0, 0);
  const full = location.hash.replace(/^#/, '') || '/';
  const [h, qs] = full.split('?');
  try {
    if (h.startsWith('/p/')) viewProduct(h.slice(3));
    else if (h === '/products') viewShop();
    else if (h === '/cart') viewCart();
    else if (h === '/orders') await viewOrders();
    else if (h === '/notices') viewNotices();
    else if (h === '/me') viewMe();
    else if (h === '/inquiries') await viewInquiries();
    else if (h === '/inquiries/new') await viewInquiryNew(new URLSearchParams(qs || ''));
    else if (h.startsWith('/done/')) await viewDone(decodeURIComponent(h.slice(6)));
    else viewHome();
  } catch (e) {
    app().innerHTML = `<div class="empty">문제가 발생했습니다.<br><span class="small">${esc(errMsg(e))}</span><br><button class="btn" onclick="location.reload()">새로고침</button></div>`;
  }
}

// 로그인 전: 상품 목록·상세만 비회원으로 열람, 나머지는 로그인/가입 화면
const GUEST_OK = h => h === '/products' || h.startsWith('/p/');
async function guestRoute() {
  const h = (location.hash.replace(/^#/, '') || '/').split('?')[0];
  if (!GUEST_OK(h)) { S.guest = false; renderNav(); return viewAuth(h === '/signup' ? 'signup' : 'login'); }
  if (!S.guest) {
    app().innerHTML = `<div class="loading">불러오는 중…</div>`;
    try { Object.assign(S, await api.publicCatalog(), { settings: {}, guest: true }); }
    catch (e) { return viewAuth('login'); }
  }
  renderNav();
  window.scrollTo(0, 0);
  h === '/products' ? viewShop() : viewProduct(h.slice(3));
}

async function boot() {
  app().innerHTML = `<div class="loading">불러오는 중…</div>`;
  api.publicInfo().then(i => { S.info = { ...S.info, ...i }; renderFooter(); }).catch(() => renderFooter());
  try {
    S.user = await api.user();
    if (RECOVERY && S.user) return viewNewPassword();
    if (isPolicy()) { renderNav(); route(); if (!S.user) return; }
    if (!S.user) return guestRoute();
    S.guest = false;
    S.dealer = await api.dealer(S.user.id);
    renderNav();
    if (!S.dealer) return viewNotice('계정 정보를 찾을 수 없습니다', '관리자에게 문의해 주세요.');
    if (S.dealer.status === 'pending') return viewNotice('가입 신청이 완료되었습니다', `<b>${esc(S.dealer.company)}${S.dealer.branch ? ' ' + esc(S.dealer.branch) : ''}</b> 가입 승인 대기 중입니다.<br>승인이 완료되면 <b>${esc(S.dealer.email)}</b>로 안내 메일을 보내드리며,<br>이후 공급가 확인과 주문이 가능합니다.`);
    if (S.dealer.status === 'rejected') return viewNotice('가입이 승인되지 않았습니다', '자세한 내용은 관리자에게 문의해 주세요.');
    Object.assign(S, await api.catalog());
    const [ns] = await Promise.allSettled([api.notices(), loadOrders(), loadInquiries()]);
    S.notices = ns.status === 'fulfilled' ? ns.value : [];
    route();
  } catch (e) {
    app().innerHTML = `<div class="empty">연결에 실패했습니다.<br><span class="small">${esc(errMsg(e))}</span><br><button class="btn" onclick="location.reload()">새로고침</button></div>`;
  }
}

window.addEventListener('hashchange', route);
if (!DEMO) sb.auth.onAuthStateChange(ev => {
  if (ev === 'PASSWORD_RECOVERY') { RECOVERY = true; setTimeout(boot, 0); }
  if (ev === 'SIGNED_OUT' && S.user) { S.user = null; boot(); }
});
boot();
