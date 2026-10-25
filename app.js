(function () {
  'use strict';

  // ---------- 云服务客户端（endpoint 与 publishableKey 来自开通云服务时下发的 publicConfig） ----------
  if (typeof WorkBuddyCloud === 'undefined') {
    // SDK 未加载（脚本被拦截/路径错误）时给出明确提示，而不是永远停在「正在连接」
    document.addEventListener('DOMContentLoaded', function () {
      var b = document.getElementById('boot');
      if (b) b.textContent = '加载失败：云端组件未就绪，请刷新页面重试（检查网络或稍后再试）';
    });
    return;
  }
  const cfg = window.PUBLIC_CONFIG || {};
  const cloud = WorkBuddyCloud.createWorkBuddyCloud({
    endpoint: cfg.endpoint,
    publishableKey: cfg.publishableKey,
  });

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  const ROLE_LABEL = { admin: '裁判 / 组委会', government: '政府', manufacturer: '制造商', trader: '贸易商', media: '新闻媒体' };
  const ROLE_PILL = { admin: 'amber', government: 'danger', manufacturer: 'teal', trader: 'blue', media: 'pink' };

  const CUR_NAME = { G: '金币', A: '星洲币', B: '贺兰币' };
  const CUR_SIGN = { G: 'G', A: '★', B: '◆' };
  const curLabel = c => (CUR_NAME[c] || c) + ' ' + (CUR_SIGN[c] || '');
  const fxRate = c => {
    if (c === 'G') return 1;
    const f = S.fx.find(x => x.currency === c);
    return f ? Number(f.rate) : 0;
  };
  const PHASE_LABEL = { prepare: '筹备中 · 尚未开年', open: '交易期进行中', closed: '本财年已结算' };

  // 行情中心：品种分组与主图选中的品种
  // equity = 上市公司股权（码 EQ:股票代码），bond = 企业债（码 BND:债券编号）
  // 两者与商品共用同一台撮合引擎：同样有涨跌停板、五档盘口、逐笔成交与做市商报价
  const QKIND = { equity: '股权', material: '原材料', product: '成品', bond: '债券', fx: '外汇' };
  const QKIND_ORDER = ['equity', 'material', 'product', 'bond', 'fx'];
  // 可在物品交易所撮合买卖的品种（外汇由央行定价，不参与竞价）
  const TRADABLE = ['equity', 'material', 'product', 'bond'];
  const STATUS_LABEL = { open: '待签署', done: '已交割', cancelled: '已撤销' };
  const STATUS_PILL = { open: 'blue', done: 'ok', cancelled: '' };

  const LEDGER_LABEL = {
    buy_material: '采购原材料', produce: '生产', contract_buy: '合同采购', contract_sell: '合同销售',
    domestic: '内销', export: '出口', ad: '投放广告', ad_cost: '投放广告', ad_income: '广告收入',
    admin_adjust: '组委会调整', gov_sale: '对政府交付', exchange: '外汇兑换',
    loan_in: '借入资金', loan_out: '贷出资金', loan_repay: '偿还本息', loan_return: '收回本息',
    war_cost: '军费消耗', tariff_pay: '缴纳关税', tariff_gain: '收取关税',
    ex_order_buy: '交易所委托买入', ex_order_sell: '交易所委托卖出',
    ex_trade_buy: '交易所买入成交', ex_trade_sell: '交易所卖出成交', ex_trade_fee: '交易所手续费',
    ex_order_back: '交易所委托退回', ipo_raise: '上市募集资金', dividend: '股利分红',
    bond_buy: '认购企业债', bond_issue: '发行企业债', bond_interest: '企业债付息', bond_redeem: '企业债还本',
  };

  // 财务报表与裁判查账共用的流水类型中文名
  const ledgerLabel = k => LEDGER_LABEL[k] || k;

  const RD_LABEL = { pending: '待政府审批', approved: '已通过', rejected: '已驳回' };
  const RD_PILL = { pending: 'amber', approved: 'ok', rejected: 'danger' };
  const PITCH_LABEL = { submitted: '待政府报价', quoted: '政府已报价', rejected: '未被采纳', done: '已完成' };
  const PITCH_PILL = { submitted: 'amber', quoted: 'ok', rejected: 'danger', done: 'blue' };

  // 借款合同状态
  const LOAN_LABEL = {
    open: '待签署', active: '履约中', repaid: '已结清', default: '已逾期',
    seize_req: '待强执裁定', seized: '已强执', cancelled: '已撤销',
  };
  const LOAN_PILL = {
    open: 'blue', active: 'amber', repaid: 'ok', default: 'danger',
    seize_req: 'danger', seized: 'danger', cancelled: '',
  };
  const COLL_LABEL = { none: '无抵押', cash: '现金抵押', material: '原材料抵押', product: '成品抵押' };

  // 战争状态与结果（宣战 → 组委会审批 → 应战交手 → 逐轮推进 → 结算）
  const WAR_LABEL = {
    pending: '待组委会审批', declared: '已批准 · 待应战', fighting: '交战中',
    settled: '已结算', stopped: '已终止', rejected: '未获批准',
  };
  const WAR_PILL = {
    pending: 'amber', declared: 'danger', fighting: 'danger',
    settled: '', stopped: '', rejected: '',
  };
  const WAR_RESULT = { draw: '平手（1:1 对耗）', attacker_win: '宣战方胜' };
  const WAR_LIVE = ['pending', 'declared', 'fighting'];

  // 市场公告类型
  const POST_KIND = {
    coop: '寻求合作', supply: '我有货源', demand: '我需要货源',
    partner: '招募伙伴', bounty: '发布悬赏', other: '其他',
  };
  const POST_PILL = { coop: 'blue', supply: 'teal', demand: 'amber', partner: 'pink', bounty: 'danger', other: '' };

  const SANC_LABEL = { tariff: '关税壁垒', embargo: '全面禁运' };
  const SANC_PILL = { tariff: 'amber', embargo: 'danger' };
  const SANC_STATUS = {
    pending: '待组委会审批', active: '生效中', lifted: '已解除',
    rejected: '已驳回', withdrawn: '已撤回',
  };
  const SANC_STATUS_PILL = {
    pending: 'amber', active: 'danger', lifted: '', rejected: '', withdrawn: '',
  };

  // 左侧导航：按业务板块分组。大标题 = 业务域，小标题 = 具体操作台。
  // 某个分组在当前角色下一项都没有时，整组（含大标题）不显示。
  const NAV_GROUPS = [
    {
      title: '总览',
      items: [
        { id: 'overview', label: '总览', roles: ['*'] },
        { id: 'ranking', label: '排行榜', roles: ['*'] },
        { id: 'companies', label: '公司名录', roles: ['*'] },
        { id: 'posts', label: '市场公告', roles: ['*'] },
        { id: 'feed', label: '情报流', roles: ['*'] },
      ],
    },
    {
      title: '市场行情',
      items: [
        // 行情对全场公开：每个人都要盯原料价格
        { id: 'quotes', label: '行情中心', roles: ['*'] },
        { id: 'hall', label: '交易大厅大屏', roles: ['*'] },
      ],
    },
    {
      title: '交易所',
      items: [
        // 挂单交易台 = 原来的「贸易市场 + 场外市场」合并进来，共用同一台撮合引擎
        { id: 'bourse', label: '物品交易所', roles: ['*'] },
        { id: 'listing', label: '上市与股权', roles: ['*'] },
        { id: 'bonds', label: '企业债市场', roles: ['*'] },
      ],
    },
    {
      title: '生产制造',
      items: [
        { id: 'market', label: '原材料市场', roles: ['manufacturer'] },
        { id: 'rd', label: '研发中心', roles: ['manufacturer'] },
        { id: 'factory', label: '生产中心', roles: ['manufacturer'] },
      ],
    },
    {
      title: '贸易与合作',
      items: [
        // 合同中心负责"定向交易"（指定公司 / 限定角色），这是交易所撮合做不到的
        { id: 'contract', label: '合同中心', roles: ['*'] },
        // 交付大厅：贸易商 / 制造商上架交付单，全场每家公司都能看到并接单
        { id: 'delivery', label: '交付大厅', roles: ['*'] },
        // 产业协作 = 代工订单 + 专利授权，把「有配方没产能」和「有产能没订单」接起来
        { id: 'coop', label: '产业协作', roles: ['manufacturer', 'trader'] },
        { id: 'inventory', label: '我的库存', roles: ['manufacturer', 'trader'] },
        { id: 'pitch', label: '路演中心', roles: ['trader'] },
        { id: 'govmarket', label: '政府市场', roles: ['trader'] },
        { id: 'consumers', label: '内销市场', roles: ['trader'] },
      ],
    },
    {
      title: '资本与博弈',
      items: [
        { id: 'deriv', label: '衍生品中心', roles: ['*'] },
        { id: 'loan', label: '借贷中心', roles: ['manufacturer', 'trader', 'media', 'government', 'admin'] },
        { id: 'war', label: '商战与制裁', roles: ['manufacturer', 'trader', 'media', 'government', 'admin'] },
        { id: 'exchange', label: '外汇兑换', roles: ['manufacturer', 'trader', 'media'] },
        { id: 'finance', label: '财务报表', roles: ['manufacturer', 'trader', 'media'] },
      ],
    },
    {
      title: '政务服务',
      items: [
        { id: 'gov', label: '政府台', roles: ['government'] },
      ],
    },
    {
      title: '媒体运营',
      items: [
        { id: 'media', label: '媒体中心', roles: ['media'] },
      ],
    },
    {
      title: '赛务管理',
      items: [
        { id: 'judge', label: '裁判台', roles: ['admin'] },
      ],
    },
    {
      title: '帮助',
      items: [
        { id: 'guide', label: '注册指引', href: 'guide.html', roles: ['*'] },
        { id: 'rules', label: '规则手册', roles: ['*'] },
      ],
    },
  ];

  // 扁平表，供权限校验与跳转查找使用
  const NAV = NAV_GROUPS.reduce((a, g) => a.concat(g.items), []);

  // 这些视图含输入框，自动刷新时跳过重渲染，避免清空用户正在填的内容
  const INPUT_VIEWS = ['market', 'factory', 'consumers', 'trade', 'contract', 'delivery', 'media', 'judge', 'rd', 'pitch', 'gov', 'govmarket', 'mail', 'exchange', 'posts', 'loan', 'war', 'spot', 'deriv', 'bourse', 'listing', 'bonds', 'coop'];  // 这些视图里正在填表，自动刷新要绕开

  // 需要管理口令才能注册的管理类角色（组委会任命，不对社员开放自助注册）
  const GATED_ROLES = ['government', 'admin'];
  // 身份预览（只读）下仍然允许的动作，其余一律拦截
  const PREVIEW_ALLOWED = ['goto', 'gotoQuote', 'pickQuote', 'previewStop', 'previewAs', 'hallFull', 'hallExit', 'spotTab', 'bourseTab', 'ordPick', 'ordSide', 'ordType', 'eqPick', 'bondTab', 'pubSide', 'pubPick', 'pubQuick', 'themeToggle']; // 大屏、切页签、切换选中品种是纯展示动作，预览下也放行

  // 身份预览：可巡览的角色顺序（与预览面板、顶栏快捷切换保持一致）
  const PV_ROLES = ['manufacturer', 'trader', 'media', 'government', 'admin'];
  const ROLE_SHORT = { admin: '裁判', government: '政府', manufacturer: '厂商', trader: '贸易商', media: '媒体' };
  const PV_CAPS = {
    manufacturer: ['采购原料', '投产', '研发', '专利授权', '承接代工', '签合同', '场外挂单', '锁价 / 做空', '借贷', '商战', '军需供货'],
    trader: ['看货盘', '签合同', '场外挂单', '锁价 / 做空', '路演', '内销 / 出口', '换汇', '委托代工', '商战', '军需供货'],
    media: ['发新闻', '左右行情', '接广告', '签合同', '看财务'],
    government: ['国库与预算', '政府采购招标', '颁布政策法令', '国库平准操作', '军援参战方', '审批研发', '路演定价', '调汇率关税', '审批战争 / 贸易战', '强执裁定'],
    admin: ['全部权限', '开年 / 结算', '身份预览', '重置比赛'],
  };

  const S = { game: null, materials: [], products: [], demand: [], offers: [], news: [], scores: [], ledger: [], players: [], stock: [], fx: [], rd: [], pitch: [], mail: [], posts: [], interests: [], loans: [], collateral: [], wars: [], sanctions: [], board: [], boardAt: '', quotes: [], qTick: 0, quotesAt: '', spot: [], futures: [], shorts: [], orders: [], trades: [], index: [], idxKCI: null, listings: [], bonds: [], rules: null, procure: [], policies: [], gov: null, oem: [], licenses: [], warSupply: [], warOrders: [], production: [], deliveries: [] };
  let session = null;
  let me = null;
  let view = 'overview';
  let pendingOtp = null;
  let pollTimer = null;
  let auditTarget = null;
  let auditRows = [];
  // 身份预览：裁判以任意角色的视角查看界面（纯前端、只读，不产生任何写操作）
  let previewRole = null;
  // 反制面板：记录当前正在准备反制的那条制裁（点击「反制」按钮展开表单）
  let counterFor = null;
  // 行情中心：主图当前选中的品种，以及前端逐 tick 累积的分时序列
  let qPick = null;
  const QHIST = {};
  const QHIST_MAX = 160;
  let marketTimer = null;
  // 交易大厅大屏 / 场外市场 / 衍生品中心
  let hallOn = false;        // 是否处于全屏大屏模式
  let hallPick = null;       // 大屏上高亮的品种
  let spotTab = 'sell';      // 场外市场：在售 / 求购
  let futSide = 'long';      // 锁价合约：锁买 / 锁卖
  let sweepFlag = 0;         // 每 N 档行情做一次强平 / 到期清扫

  // 物品交易所：当前选中的品种、页签、下单方向与委托类型
  let ordCode = null;        // 当前盘口对应的行情代码（EQ:xxx / MAT:xxx / PRD:xxx / BND:xxxx）
  let bourseTab = 'pub';     // pub(挂单交易台) / book(盘口) / listing(市场挂单) / mine(我的委托) / tape(逐笔成交) / league(龙虎榜) / settle(结算单)
  let ordSide = 'buy';
  let ordType = 'limit';
  let kStep = 4;             // 每 N 档合成一根 K 线
  // 交易所「发布台」：上架货物 / 发布求购
  let pubSide = 'sell';      // sell(上架货物) / buy(发布求购)
  let pubCode = null;        // 发布台选中的行情代码
  let seedTried = false;     // 本次会话是否已经确认过"自营做市盘不空"
  // 主题：light / dark（跟随浏览器记忆）
  let themeMode = 'light';
  // 上市与股权 / 企业债市场的页签与选中项
  let eqTab = 'board';       // board(市值榜) / mine(我的持股) / apply(上市申请)
  let eqPick = null;         // 股东名册当前查看的股票代码
  let bondTab = 'board';     // board(在发债券) / mine(我的持债) / apply(发债申请)
  // K 线缓存：按品种缓存该品种最近的逐档快照（升序）
  const KCACHE = {};
  let kTickFlag = 0;         // 每 5 档回补一次 K 线缓存

  // ---------- 小工具 ----------
  function fmt(n, d) {
    const v = Number(n);
    if (!isFinite(v)) return '—';
    const dec = d === undefined ? (Math.abs(v - Math.round(v)) < 1e-9 ? 0 : 2) : d;
    return v.toLocaleString('zh-CN', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmtTime(t) {
    if (!t) return '—';
    const d = new Date(t);
    if (isNaN(d.getTime())) return '—';
    const p = n => String(n).padStart(2, '0');
    return p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function errMsg(err) {
    if (!err) return '操作失败，请重试';
    if (typeof err === 'string') return err;
    return err.message || err.error_description || err.details || '操作失败，请重试';
  }

  let toastTimer = null;
  function toast(msg, bad) {
    const el = $('#toast');
    el.textContent = msg;
    el.className = 'toast show' + (bad ? ' bad' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = 'toast'; }, 3400);
  }

  const matName = c => (S.materials.find(m => m.code === c) || {}).name || c;
  const prodName = c => (S.products.find(p => p.code === c) || {}).name || c;
  const prodByCode = c => S.products.find(p => p.code === c) || null;

  // 原料成本按「行情现货价」计算 —— 行情涨了，理论毛利立刻缩水
  function prodCost(code) {
    const p = prodByCode(code);
    if (!p) return 0;
    return Object.keys(p.recipe || {}).reduce((a, k) => {
      const m = S.materials.find(x => x.code === k);
      const unit = matSpot(k) || Number(m ? m.price : 0);
      return a + Number(p.recipe[k]) * unit;
    }, 0);
  }

  function stockQty(kind, code) {
    const r = S.stock.find(s => s.kind === kind && s.item_code === code);
    return r ? Number(r.qty) : 0;
  }

  function recipeText(recipe) {
    const o = recipe || {};
    const keys = Object.keys(o);
    if (!keys.length) return '—';
    return keys.map(k => esc(matName(k)) + ' ×' + o[k]).join(' ＋ ');
  }

  // ---------- 生产数量上限（「最多可产」） ----------
  // 「最多可产」有两个来源，实际能投多少件取两者里更紧的那个：
  //   ① 产品自己的产量上限 —— 研发报批时厂家申报的「预期可产」会固化成它，
  //      没报批过的老产品 / 没单独设过的产品跟随组委会设定的全场默认值；
  //   ② 手头原料够做多少件。
  // 组委会既能在「赛制参数」里改全场默认值，也能在「产品产量上限」里逐款单独调。
  function ruleMaxQty() {
    const n = Number((S.rules && S.rules.prod_qty_max) || 50);
    return Math.max(1, Math.min(999, isFinite(n) && n > 0 ? Math.floor(n) : 50));
  }

  function productMaxQty(code) {
    const p = prodByCode(code);
    const own = p && Number(p.max_qty) > 0 ? Math.floor(Number(p.max_qty)) : null;
    return own ? Math.max(1, Math.min(999, own)) : ruleMaxQty();
  }

  // 按手头原料算最多能做几件
  function materialCap(code) {
    const p = prodByCode(code);
    if (!p) return 0;
    let cap = Infinity;
    Object.keys(p.recipe || {}).forEach(k => {
      cap = Math.min(cap, Math.floor(stockQty('material', k) / Number(p.recipe[k])));
    });
    return cap === Infinity ? 0 : Math.max(0, cap);
  }

  function maxProducible(code) {
    return Math.max(0, Math.min(productMaxQty(code), materialCap(code)));
  }

  function fy() { return S.game ? Number(S.game.fiscal_year) : 0; }
  function isTrial() { return !!(S.game && S.game.is_trial); }
  function phase() { return S.game ? S.game.phase : 'prepare'; }
  function isOpen() { return phase() === 'open'; }

  async function rpc(fn, args) {
    if (me && me.status && me.status !== 'active' && fn !== 'wbs_whoami')
      throw new Error('你的账号已被组委会' + (me.status === 'bankrupt' ? '宣告破产' : '注销') + '，全部操作已冻结');
    const { data, error } = await cloud.database.rpc(fn, args || {});
    if (error) throw error;
    return data;
  }

  function realRole() { return me ? me.role : null; }
  // 预览态下对外呈现的是被预览的角色，导航与视图按该角色渲染
  function myRole() { return previewRole || realRole(); }
  function isPreview() { return !!previewRole; }
  function canTrade() { return myRole() === 'manufacturer' || myRole() === 'trader'; }
  // 政府与裁判都是「管理者」：可裁定强制执行、可调停战争与解除制裁
  function isJudge() { return myRole() === 'admin' || myRole() === 'government'; }
  // 只有真正的裁判能进入预览、管理口令等赛务功能
  function isRealAdmin() { return realRole() === 'admin'; }
  // 身份预览是只读的：除导航跳转与退出预览外，任何动作都会被拦截
  function previewBlocked(name) { return isPreview() && PREVIEW_ALLOWED.indexOf(name) < 0; }

  function navAllowed(item) {
    if (item.roles.indexOf('*') >= 0) return true;
    return item.roles.indexOf(myRole()) >= 0;
  }

  // ---------- 数据加载 ----------
  async function refreshMe() {
    if (!session) { me = null; return; }
    // whoami 不走统一 rpc 守卫：破产 / 注销后仍要能读到自己的最新状态来渲染红屏
    const { data, error } = await cloud.database.rpc('wbs_whoami', {});
    if (!error) me = data || null;
    applyBanScreen();
  }

  // ---------- 破产 / 注销红屏 ----------
  let banOverlay = null;
  function applyBanScreen() {
    const banned = me && me.status && me.status !== 'active';
    if (banned && !banOverlay) {
      const isBankrupt = me.status === 'bankrupt';
      banOverlay = document.createElement('div');
      banOverlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:linear-gradient(160deg,#7f0d0d,#a31515 55%,#6b0a0a);color:#fff;display:flex;align-items:center;justify-content:center;padding:24px;overflow:auto;';
      banOverlay.innerHTML = `<div style="max-width:580px;text-align:center;">
        <div style="font-size:64px;line-height:1;">⛔</div>
        <h1 style="font-size:34px;margin:14px 0 8px;letter-spacing:8px;font-weight:900;">${isBankrupt ? '破 产 公 告' : '账 号 已 注 销'}</h1>
        <div style="font-size:18px;opacity:.94;margin-bottom:18px;">${esc(me.company_name || '')}（${esc(me.seat || '')}）</div>
        <div style="background:rgba(0,0,0,.28);border:1px solid rgba(255,255,255,.25);border-radius:12px;padding:18px 22px;font-size:15px;line-height:1.8;">
          你方账号已被组委会${isBankrupt ? '宣告<b style="color:#ffd76a;">破产</b>' : '<b style="color:#ffd76a;">注销</b>'}，全部交易与操作权限已冻结。<br>
          <span style="opacity:.88;">事由：${esc(me.ban_reason || '组委会裁定')}</span><br>
          <span style="opacity:.72;">如有异议，请当面向组委会申诉。</span>
        </div>
        <button id="banLogout" style="margin-top:24px;background:#fff;color:#a31515;border:none;border-radius:10px;padding:11px 32px;font-size:15px;font-weight:700;cursor:pointer;">退出登录</button>
      </div>`;
      document.body.appendChild(banOverlay);
      banOverlay.querySelector('#banLogout').addEventListener('click', () => {
        cloud.auth.signOut().catch(() => {});
        if (banOverlay) { banOverlay.remove(); banOverlay = null; }
        me = null;
        renderShell();
      });
    } else if (!banned && banOverlay) {
      banOverlay.remove(); banOverlay = null;
    }
  }

  async function loadAll() {
    const res = await Promise.all([
      cloud.database.from('wbs_game').select('*').limit(1),
      cloud.database.from('wbs_materials').select('*').order('sort_order'),
      cloud.database.from('wbs_products').select('*').order('sort_order'),
      cloud.database.from('wbs_offers').select('*').order('id', { ascending: false }).limit(300),
      cloud.database.from('wbs_news').select('*').order('id', { ascending: false }).limit(80),
      cloud.database.from('wbs_scores').select('*').order('id', { ascending: false }).limit(600),
      cloud.database.from('wbs_players').select('*').order('id'),
      cloud.database.from('wbs_stock').select('*'),
      cloud.database.from('wbs_fx').select('*').order('sort_order'),
      cloud.database.from('wbs_rd').select('*').order('id', { ascending: false }).limit(300),
      cloud.database.from('wbs_pitch').select('*').order('id', { ascending: false }).limit(300),
      cloud.database.from('wbs_mail').select('*').order('id', { ascending: false }).limit(200),
      cloud.database.from('wbs_posts').select('*').order('pinned', { ascending: false }).order('id', { ascending: false }).limit(200),
      cloud.database.from('wbs_post_interest').select('*').order('id', { ascending: false }).limit(400),
      cloud.database.from('wbs_loans').select('*').order('id', { ascending: false }).limit(300),
      cloud.database.from('wbs_collateral').select('*').order('id', { ascending: false }).limit(300),
      cloud.database.from('wbs_wars').select('*').order('id', { ascending: false }).limit(200),
      cloud.database.from('wbs_sanctions').select('*').order('id', { ascending: false }).limit(200),
      cloud.database.from('wbs_quotes_live').select('*'),
      cloud.database.from('wbs_quotes').select('*').order('id', { ascending: false }).limit(400),
      cloud.database.from('wbs_spot').select('*').order('id', { ascending: false }).limit(300),
      cloud.database.from('wbs_futures').select('*').order('id', { ascending: false }).limit(300),
      cloud.database.from('wbs_shorts').select('*').order('id', { ascending: false }).limit(300),
      // 交易所：委托簿、逐笔成交、指数、上市公司名录、企业债
      // 这几张表失败也不该拖垮赛场，因此只取 data、不看 error
      cloud.database.from('wbs_orders').select('*').order('id', { ascending: false }).limit(800),
      cloud.database.from('wbs_trades').select('*').order('id', { ascending: false }).limit(300),
      cloud.database.from('wbs_index').select('*'),
      cloud.database.from('wbs_listings').select('*').order('id', { ascending: false }).limit(200),
      cloud.database.from('wbs_bonds').select('*').order('id', { ascending: false }).limit(200),
      // 政府：采购招标与政策法令（同样容错，失败不拖垮赛场）
      cloud.database.from('wbs_procure').select('*').order('id', { ascending: false }).limit(200),
      cloud.database.from('wbs_policies').select('*').order('id', { ascending: false }).limit(200),
      // 产业协作：代工订单、专利授权；战时：军需投入流水、军需订单
      cloud.database.from('wbs_oem').select('*').order('id', { ascending: false }).limit(300),
      cloud.database.from('wbs_licenses').select('*').order('id', { ascending: false }).limit(300),
      cloud.database.from('wbs_war_supply').select('*').order('id', { ascending: false }).limit(300),
      cloud.database.from('wbs_war_orders').select('*').order('id', { ascending: false }).limit(300),
      // 在生产中的产线：投产后要等一段工时才完工，前端按 finish_at 画进度条
      cloud.database.from('wbs_production').select('*').order('id', { ascending: false }).limit(200),
      // 交付大厅：贸易商 / 制造商上架的交付单，全场可见
      cloud.database.from('wbs_deliveries').select('*').order('id', { ascending: false }).limit(300),
    ]);
    // 行情两张表单独容错：即使行情查询失败，也不该把整个赛场拖下水
    const bad = res.find((r, i) => r.error && i < 18);
    if (bad) throw bad.error;

    S.game = (res[0].data || [])[0] || null;
    S.materials = res[1].data || [];
    S.products = res[2].data || [];
    S.offers = res[3].data || [];
    S.news = res[4].data || [];
    S.scores = res[5].data || [];
    S.players = res[6].data || [];
    S.stock = res[7].data || [];
    S.fx = res[8].data || [];
    S.rd = res[9].data || [];
    S.pitch = res[10].data || [];
    S.mail = res[11].data || [];
    S.posts = res[12].data || [];
    S.interests = res[13].data || [];
    S.loans = res[14].data || [];
    S.collateral = res[15].data || [];
    S.wars = res[16].data || [];
    S.sanctions = res[17].data || [];
    S.quotes = sortQuotes(res[18].data || []);
    S.qTick = S.quotes.reduce((a, q) => Math.max(a, Number(q.tick) || 0), 0);
    S.quotesAt = S.quotes.length ? (S.quotes[0].updated_at || '') : '';
    seedQHist(res[19].data || []);
    S.spot = res[20].data || [];
    S.futures = res[21].data || [];
    S.shorts = res[22].data || [];
    S.orders = res[23] && res[23].data ? res[23].data : [];
    S.trades = res[24] && res[24].data ? res[24].data : [];
    S.index = res[25] && res[25].data ? res[25].data : [];
    S.listings = res[26] && res[26].data ? res[26].data : [];
    S.bonds = res[27] && res[27].data ? res[27].data : [];
    S.procure = res[28] && res[28].data ? res[28].data : [];
    S.policies = res[29] && res[29].data ? res[29].data : [];
    S.oem = res[30] && res[30].data ? res[30].data : [];
    S.licenses = res[31] && res[31].data ? res[31].data : [];
    S.warSupply = res[32] && res[32].data ? res[32].data : [];
    S.warOrders = res[33] && res[33].data ? res[33].data : [];
    S.production = res[34] && res[34].data ? res[34].data : [];
    S.deliveries = res[35] && res[35].data ? res[35].data : [];

    const y = fy();
    const extra = await Promise.all([
      cloud.database.from('wbs_demand').select('*').eq('fiscal_year', y),
      canTrade() || myRole() === 'media'
        ? cloud.database.from('wbs_ledger').select('*').eq('fiscal_year', y).order('id', { ascending: false }).limit(200)
        : Promise.resolve({ data: [] }),
      // 实时盘口：净资产由服务端现算，保证排行榜与任何交易同步
      cloud.database.rpc('wbs_realtime_board', {}).then(r => r).catch(() => ({ data: null })),
      // 交易所规则参数（手续费率、涨跌停板、熔断阈值）由服务端下发，前端不硬编码
      cloud.database.rpc('wbs_market_rules', {}).then(r => r).catch(() => ({ data: null })),
      // 政府宏观账目（国库 / 税收 / CPI / 采购进度），只对政府与裁判返回数据
      cloud.database.rpc('wbs_gov_metrics', {}).then(r => r).catch(() => ({ data: null })),
      // 委托簿只取最新 800 笔（做市商每档都在挂单，全表已经十几万条）。
      // 这样一来「我的委托」会被挤出窗口，所以单独再取一次自己的委托，保证一笔不丢。
      cloud.database.from('wbs_orders').select('*')
        .eq('owner_id', (me && me.owner_id) || '__none__')
        .order('id', { ascending: false }).limit(300),
    ]);
    if (extra[0].error) throw extra[0].error;
    S.demand = extra[0].data || [];
    S.ledger = (extra[1] && extra[1].data) || [];
    const brd = extra[2] && extra[2].data;
    if (brd && Array.isArray(brd.board)) {
      S.board = brd.board;
      S.boardAt = brd.at || '';
    } else if (!S.board.length) {
      S.board = [];
      S.boardAt = '';
    }
    if (extra[3] && extra[3].data && typeof extra[3].data === 'object') S.rules = extra[3].data;
    // 政府账目：非管理角色会被服务端拒绝，失败时留空即可
    S.gov = (extra[4] && extra[4].data && typeof extra[4].data === 'object' && !Array.isArray(extra[4].data))
      ? extra[4].data : null;

    // 把自己名下的委托并回委托簿：主查询的 800 条只是"最新一屏"，
    // 挂了超过一档行情的单会翻出窗口 —— 但自己的单必须一笔不漏地看见。
    const ownOrders = (extra[5] && extra[5].data) || [];
    if (ownOrders.length) {
      const seen = {};
      S.orders.forEach(o => { seen[o.id] = true; });
      ownOrders.forEach(o => { if (!seen[o.id]) S.orders.push(o); });
    }
  }

  async function reload(showToast) {
    try {
      await refreshMe();
      if (!me) { showSetup(); return; }
      await loadAll();
      renderShell();
      renderView();
      if (showToast) toast('已刷新');
    } catch (e) {
      toast(errMsg(e), true);
    }
  }

  // ---------- 认证 ----------
  const authMsg = $('#authMsg');
  function showAuthMsg(text, kind) {
    authMsg.textContent = text;
    authMsg.className = 'auth-msg show ' + (kind || 'err');
  }
  function hideAuthMsg() { authMsg.className = 'auth-msg'; }

  const MODE_TITLE = {
    password: ['登录赛场', '用邮箱和密码进入你所在的比赛。'],
    otp: ['验证码登录', '我们会往你的邮箱发一封验证码邮件。'],
    signup: ['注册新账号', '验证邮箱后设置密码，用于以后登录。'],
    forgot: ['重置密码', '验证邮箱后设置一个新密码。'],
  };

  function setAuthMode(mode) {
    pendingOtp = null;
    ['password', 'otp', 'signup', 'forgot'].forEach(m => {
      $('#form' + m.charAt(0).toUpperCase() + m.slice(1)).classList.toggle('hidden', m !== mode);
    });
    $$('#authTabs button').forEach(b => b.classList.toggle('on', b.getAttribute('data-mode') === mode));
    $('#authTabs').classList.toggle('hidden', mode === 'forgot');
    const t = MODE_TITLE[mode] || MODE_TITLE.password;
    $('#authTitle').textContent = t[0];
    $('#authSub').textContent = t[1];
    $('#otpPwWrap').classList.add('hidden');
    hideAuthMsg();
  }

  $$('#authTabs button').forEach(b => b.addEventListener('click', () => setAuthMode(b.getAttribute('data-mode'))));
  $('#toForgot').addEventListener('click', () => setAuthMode('forgot'));
  $('#backToLogin').addEventListener('click', () => setAuthMode('password'));

  function countdown(btn, seconds) {
    const raw = btn.getAttribute('data-raw') || btn.textContent;
    btn.setAttribute('data-raw', raw);
    let n = seconds;
    btn.disabled = true;
    btn.textContent = n + 's';
    const t = setInterval(() => {
      n -= 1;
      if (n <= 0) {
        clearInterval(t);
        btn.disabled = false;
        btn.textContent = raw;
      } else {
        btn.textContent = n + 's';
      }
    }, 1000);
  }

  // 密码登录
  $('#formPassword').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#pwSubmit');
    btn.disabled = true;
    hideAuthMsg();
    try {
      const { error } = await cloud.auth.signInWithPassword({
        email: $('#pwEmail').value.trim(),
        password: $('#pwPassword').value,
      });
      if (error) { showAuthMsg(error.message || '邮箱或密码不正确'); return; }
      await onSignedIn();
    } catch (err) {
      showAuthMsg(errMsg(err));
    } finally {
      btn.disabled = false;
    }
  });

  // 验证码：发送
  async function sendCode(kind) {
    const emailEl = kind === 'signup' ? $('#suEmail') : $('#otpEmail');
    const codeEl = kind === 'signup' ? $('#suCode') : $('#otpCode');
    const btn = kind === 'signup' ? $('#suSend') : $('#otpSend');
    const email = emailEl.value.trim();
    if (!email) { showAuthMsg('请先填写邮箱'); emailEl.focus(); return; }
    hideAuthMsg();
    const { data, error } = await cloud.auth.sendOtp({ email });
    if (error) { showAuthMsg(error.message || '验证码发送失败，请稍后再试'); return; }
    pendingOtp = { email, verificationId: data.verificationId, isExistingUser: data.isExistingUser };
    codeEl.focus();
    countdown(btn, 60);
    if (kind === 'otp') {
      // 验证码登录：新账号需要补设密码
      $('#otpPwWrap').classList.toggle('hidden', !!data.isExistingUser);
      $('#otpSubmit').textContent = data.isExistingUser ? '登录' : '注册并登录';
    }
    showAuthMsg('验证码已发送，请查收邮箱（含垃圾邮件）。', 'ok');
  }
  $('#otpSend').addEventListener('click', () => sendCode('otp').catch(e => showAuthMsg(errMsg(e))));
  $('#suSend').addEventListener('click', () => sendCode('signup').catch(e => showAuthMsg(errMsg(e))));

  // 验证码：提交（登录 / 注册）
  async function submitCode(kind) {
    const emailEl = kind === 'signup' ? $('#suEmail') : $('#otpEmail');
    const codeEl = kind === 'signup' ? $('#suCode') : $('#otpCode');
    const pwEl = kind === 'signup' ? $('#suPassword') : $('#otpPassword');
    const btn = kind === 'signup' ? $('#suSubmit') : $('#otpSubmit');
    const email = emailEl.value.trim();
    const token = codeEl.value.trim();

    if (!pendingOtp || pendingOtp.email !== email) {
      showAuthMsg('请先点击「获取验证码」，为当前邮箱获取验证码');
      return;
    }
    if (!token) { showAuthMsg('请填写收到的验证码'); codeEl.focus(); return; }

    const needPassword = !pendingOtp.isExistingUser;
    if (kind === 'signup' && !pwEl.value) { showAuthMsg('请设置一个登录密码'); pwEl.focus(); return; }
    if (needPassword && kind === 'otp' && !pwEl.value) { showAuthMsg('这是新账号，请设置一个登录密码'); pwEl.focus(); return; }
    if (pwEl.value && pwEl.value.length < 6) { showAuthMsg('密码至少 6 位'); return; }

    btn.disabled = true;
    hideAuthMsg();
    try {
      const payload = {
        email: pendingOtp.email,
        verificationId: pendingOtp.verificationId,
        isExistingUser: pendingOtp.isExistingUser,
        token,
      };
      if (needPassword) payload.password = pwEl.value;
      if (kind === 'signup' && pendingOtp.isExistingUser) {
        showAuthMsg('该邮箱已经注册过了，请直接用「密码登录」或「验证码登录」。');
        return;
      }
      const { error } = await cloud.auth.verifyOtp(payload);
      if (error) { showAuthMsg(error.message || '验证码不正确或已过期'); return; }
      pendingOtp = null;
      await onSignedIn();
    } catch (err) {
      showAuthMsg(errMsg(err));
    } finally {
      btn.disabled = false;
    }
  }
  $('#formOtp').addEventListener('submit', (e) => { e.preventDefault(); submitCode('otp').catch(err => showAuthMsg(errMsg(err))); });
  $('#formSignup').addEventListener('submit', (e) => { e.preventDefault(); submitCode('signup').catch(err => showAuthMsg(errMsg(err))); });

  // 忘记密码
  $('#formForgot').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#fgSubmit');
    const email = $('#fgEmail').value.trim();
    const code = $('#fgCode').value.trim();
    const pw = $('#fgPassword').value;
    if (!email || !code || !pw) { showAuthMsg('请完整填写邮箱、验证码与新密码'); return; }
    if (pw.length < 6) { showAuthMsg('密码至少 6 位'); return; }
    btn.disabled = true;
    hideAuthMsg();
    try {
      const started = await cloud.auth.resetPasswordForEmail(email);
      if (started.error) { showAuthMsg(started.error.message || '发送失败'); return; }
      const done = await started.data.updateUser({ nonce: code, password: pw });
      if (done.error) { showAuthMsg(done.error.message || '验证码不正确'); return; }
      showAuthMsg('密码已重置，正在进入…', 'ok');
      await onSignedIn();
    } catch (err) {
      showAuthMsg(errMsg(err));
    } finally {
      btn.disabled = false;
    }
  });

  // ---------- 建档 ----------
  const ROLES = [
    { id: 'manufacturer', name: '制造商', desc: '在原材料市场买料，研发属于自己的产品（须经政府审批），投产成功后自动挂到交易所上架，卖给贸易商。' },
    { id: 'trader', name: '贸易商', desc: '在交易所的挂单交易台从制造商手里采购（也可以发布求购让卖家送上门），通过路演争取政府订单，交付后收到外币并可换汇。彼此竞争，也可合作。' },
    { id: 'media', name: '新闻媒体', desc: '发布资讯、承接广告。靠广告费赚钱，同时掌握全场舆论。' },
    { id: 'government', name: '政府', desc: '掌握国库与宏观调控：发布政府采购招标、颁布政策法令（补贴 / 出口奖励 / 原料配额 / 基建）、用国库收储抛储平抑物价，另外审批研发、给路演定价、调控汇率。', code: true },
    { id: 'admin', name: '裁判 / 组委会', desc: '不参与经营。负责开启财年、结算成绩、调控各队资金、核查账目。人数不足时可兼任政府职能。', code: true },
  ];
  let pickedRole = null;

  // 选中的角色是否需要管理口令
  function roleNeedsCode(role) { return GATED_ROLES.indexOf(role) >= 0; }

  function syncCodeField() {
    const wrap = $('#judgeCodeWrap');
    if (!wrap) return;
    const need = roleNeedsCode(pickedRole);
    wrap.classList.toggle('hidden', !need);
    if (!need) {
      const i = $('#setJudgeCode');
      if (i) i.value = '';
    }
  }

  function renderRoles() {
    const wrap = $('#roleCards');
    wrap.innerHTML = ROLES.map(r => `
      <div class="card" data-act="pickRole" data-role="${r.id}" style="cursor:pointer;margin:0;${pickedRole === r.id ? 'border-color:var(--primary);background:var(--primary-soft);' : ''}">
        <h3 style="margin-bottom:6px;">${r.name}${r.code ? ' <span class="pill amber">需口令</span>' : ''}${pickedRole === r.id ? ' ✓' : ''}</h3>
        <p class="hint" style="margin:0;">${r.desc}</p>
      </div>`).join('');
    bind(wrap);
    syncCodeField();
  }

  function showSetup() {
    $('#boot').classList.add('hidden');
    $('#authView').classList.add('hidden');
    $('#appView').classList.add('hidden');
    $('#setupView').classList.remove('hidden');
    pickedRole = null;
    const codeInput = $('#setJudgeCode');
    if (codeInput) codeInput.value = '';
    renderRoles();
  }

  function showApp() {
    $('#boot').classList.add('hidden');
    $('#authView').classList.add('hidden');
    $('#setupView').classList.add('hidden');
    $('#appView').classList.remove('hidden');
  }

  function showAuth() {
    $('#boot').classList.add('hidden');
    $('#setupView').classList.add('hidden');
    $('#appView').classList.add('hidden');
    $('#authView').classList.remove('hidden');
    setAuthMode('password');
  }

  // ---------- 左侧导航：独立滑块（单击收起/展开，左右拖动调宽） ----------
  const NAV_MIN = 150;
  const NAV_MAX = 380;
  const NAV_DEFAULT = 208;
  let navW = NAV_DEFAULT;
  let navCollapsed = false;

  function loadNavState() {
    try {
      const w = Number(localStorage.getItem('bizsim.navw'));
      if (w >= NAV_MIN && w <= NAV_MAX) navW = w;
      navCollapsed = localStorage.getItem('bizsim.navcol') === '1';
    } catch (e) { /* 隐私模式下 localStorage 不可用，退回默认值 */ }
  }

  function saveNavState() {
    try {
      localStorage.setItem('bizsim.navw', String(Math.round(navW)));
      localStorage.setItem('bizsim.navcol', navCollapsed ? '1' : '0');
    } catch (e) { /* 同上，忽略 */ }
  }

  function applyNavState() {
    const layout = $('#layout');
    if (!layout) return;
    layout.style.setProperty('--nav-w', Math.round(navW) + 'px');
    layout.classList.toggle('nav-collapsed', navCollapsed);
    const grip = $('#navGrip');
    if (grip) {
      grip.setAttribute('aria-expanded', navCollapsed ? 'false' : 'true');
      grip.title = navCollapsed ? '单击展开功能菜单' : '单击收起功能菜单 · 左右拖动可调整宽度';
    }
  }

  // ---------- 主题：亮 / 暗 ----------
  // 只作用于 <html data-theme="...">，全部颜色都在 CSS 变量里切换，JS 不碰具体色值。
  function loadTheme() {
    try {
      const saved = localStorage.getItem('bizsim.theme');
      if (saved === 'dark' || saved === 'light') { themeMode = saved; return; }
      // 没有手动选过就跟随系统
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) themeMode = 'dark';
    } catch (e) { /* 隐私模式下 localStorage / matchMedia 不可用，用默认亮色 */ }
  }

  function applyTheme() {
    const root = document.documentElement;
    if (!root) return;
    if (root.setAttribute) root.setAttribute('data-theme', themeMode);
    else if (root.dataset) root.dataset.theme = themeMode;
    const btn = $('#btnTheme');
    if (btn && btn.setAttribute) {
      btn.setAttribute('title', themeMode === 'dark' ? '切换到亮色模式' : '切换到暗色模式');
      btn.setAttribute('aria-label', themeMode === 'dark' ? '切换到亮色模式' : '切换到暗色模式');
    }
    const meta = $('#themeColor');
    if (meta && meta.setAttribute) meta.setAttribute('content', themeMode === 'dark' ? '#0b1220' : '#f4f6fa');
  }

  function saveTheme() {
    try { localStorage.setItem('bizsim.theme', themeMode); } catch (e) { /* 忽略 */ }
  }

  // ---------- 显示设置（右上角小齿轮）：两行顶栏的高度 + 滚动开关 ----------
  let uiPrefs = { idxH: 56, nbH: 36, idxScroll: true, nbScroll: true };

  function loadUiPrefs() {
    try {
      const raw = localStorage.getItem('bizsim.ui');
      if (!raw) return;
      const o = JSON.parse(raw) || {};
      uiPrefs.idxH = Math.min(100, Math.max(44, Number(o.idxH) || 56));
      uiPrefs.nbH = Math.min(80, Math.max(28, Number(o.nbH) || 36));
      if (typeof o.idxScroll === 'boolean') uiPrefs.idxScroll = o.idxScroll;
      if (typeof o.nbScroll === 'boolean') uiPrefs.nbScroll = o.nbScroll;
    } catch (e) { /* 忽略 */ }
  }

  function saveUiPrefs() {
    try { localStorage.setItem('bizsim.ui', JSON.stringify(uiPrefs)); } catch (e) { /* 忽略 */ }
  }

  function applyUiPrefs() {
    const root = document.documentElement;
    if (root.style && root.style.setProperty) {
      root.style.setProperty('--idx-h', uiPrefs.idxH + 'px');
      root.style.setProperty('--nb-h', uiPrefs.nbH + 'px');
    }
    const ib = $('#idxBar');
    if (ib && ib.classList) {
      ib.classList[uiPrefs.idxScroll ? 'remove' : 'add']('no-anim');
      ib.classList[uiPrefs.idxH < 66 ? 'add' : 'remove']('compact');   // 高度不够就藏分时小图
    }
    const nb = $('#newsBar');
    if (nb && nb.classList) {
      nb.classList[uiPrefs.nbScroll ? 'remove' : 'add']('no-anim');
      nb.classList[uiPrefs.nbH < 44 ? 'add' : 'remove']('compact');    // 高度不够就藏来源小字
    }
  }

  function syncUiPanel() {
    const ih = $('#upIdxH'), nh = $('#upNbH');
    if (ih) ih.value = String(uiPrefs.idxH);
    if (nh) nh.value = String(uiPrefs.nbH);
    const isw = $('#upIdxScroll'), nsw = $('#upNbScroll');
    if (isw) { isw.classList[uiPrefs.idxScroll ? 'add' : 'remove']('on'); isw.setAttribute('aria-checked', uiPrefs.idxScroll ? 'true' : 'false'); }
    if (nsw) { nsw.classList[uiPrefs.nbScroll ? 'add' : 'remove']('on'); nsw.setAttribute('aria-checked', uiPrefs.nbScroll ? 'true' : 'false'); }
    const v1 = $('#upIdxHv'), v2 = $('#upNbHv');
    if (v1) v1.textContent = uiPrefs.idxH + 'px';
    if (v2) v2.textContent = uiPrefs.nbH + 'px';
  }

  // 滚动开关切换：停住时「原位定住」而不是弹回开头。
  // 关：读出当前 translateX 的像素值，固化成 inline transform（no-anim 关掉动画后仍然生效），
  //     同时记下停住位置占半段宽度的比例。
  // 开：清掉固化位移，用负 animation-delay 从停住的比例处继续滚 —— 无缝接回。
  let holdFracIdx = 0, holdFracNb = 0;

  function setBarScrolling(barEl, trackEl, on, which) {
    if (!barEl || !trackEl) return;
    if (!on) {
      let tx = 0;
      try {
        if (typeof getComputedStyle === 'function') {
          const m = getComputedStyle(trackEl).transform;
          if (m && m !== 'none') tx = Math.abs(parseFloat(m.split(',')[4]) || 0);
        }
      } catch (e) { /* 忽略 */ }
      const halfW = Math.max(1, (trackEl.scrollWidth || 0) / 2);
      const frac = Math.min(0.98, tx / halfW);
      if (which === 'idx') holdFracIdx = frac; else holdFracNb = frac;
      trackEl.style.transform = 'translateX(-' + tx.toFixed(1) + 'px)';
      if (barEl.classList) barEl.classList.add('no-anim');
    } else {
      if (barEl.classList) barEl.classList.remove('no-anim');
      trackEl.style.transform = '';
      const frac = which === 'idx' ? holdFracIdx : holdFracNb;
      const dur = parseFloat(trackEl.style && trackEl.style.animationDuration) || 60;
      trackEl.style.animationDelay = frac > 0.005 ? '-' + (frac * dur).toFixed(2) + 's' : '';
    }
  }

  function bindNavGrip() {
    const grip = $('#navGrip');
    const layout = $('#layout');
    if (!grip || !layout || grip.__navBound) return;
    grip.__navBound = true;

    let dragging = false;
    let startX = 0;
    let startW = 0;
    let moved = 0;

    const onMove = e => {
      if (!dragging) return;
      const x = e.touches ? e.touches[0].clientX : e.clientX;
      const dx = x - startX;
      moved = Math.max(moved, Math.abs(dx));
      // 从收起状态往右拖，直接就当作展开
      if (navCollapsed && dx > 6) { navCollapsed = false; applyNavState(); startW = NAV_MIN; startX = x; }
      navW = Math.min(NAV_MAX, Math.max(NAV_MIN, startW + (x - startX)));
      layout.style.setProperty('--nav-w', Math.round(navW) + 'px');
      if (e.cancelable) e.preventDefault();
    };

    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      document.body.classList.remove('nav-dragging');
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
      // 位移极小 → 视为一次点击，切换收起/展开
      if (moved < 5) navCollapsed = !navCollapsed;
      applyNavState();
      saveNavState();
    };

    const onDown = e => {
      // 窄屏下导航已变成横向条，滑块不参与
      if (window.matchMedia && window.matchMedia('(max-width: 940px)').matches) return;
      dragging = true;
      moved = 0;
      startX = e.touches ? e.touches[0].clientX : e.clientX;
      startW = navCollapsed ? 0 : navW;
      document.body.classList.add('nav-dragging');
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      window.addEventListener('touchmove', onMove, { passive: false });
      window.addEventListener('touchend', onUp);
      if (e.cancelable) e.preventDefault();
    };

    grip.addEventListener('mousedown', onDown);
    grip.addEventListener('touchstart', onDown, { passive: false });
    grip.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        navCollapsed = !navCollapsed;
      } else if (e.key === 'ArrowLeft') {
        navCollapsed = false;
        navW = Math.max(NAV_MIN, navW - 16);
      } else if (e.key === 'ArrowRight') {
        navCollapsed = false;
        navW = Math.min(NAV_MAX, navW + 16);
      } else {
        return;
      }
      applyNavState();
      saveNavState();
    });
    // 双击滑块 = 恢复默认宽度
    grip.addEventListener('dblclick', () => {
      navCollapsed = false;
      navW = NAV_DEFAULT;
      applyNavState();
      saveNavState();
    });
  }

  // ---------- 外壳 ----------
  function renderShell() {
    const rl = ROLE_LABEL[realRole()] || '—';
    $('#whoTag').textContent = isPreview() ? rl + ' · 预览中' : rl;
    $('#whoName').textContent = me ? me.company_name : '—';

    const g = S.game || {};
    const live = isOpen();
    $('#statusChips').innerHTML = `
      <span class="chip ${live ? 'live' : 'idle'}">财年 <b>${g.fiscal_year || 0}</b></span>
      <span class="chip ${live ? 'live' : 'idle'}">${PHASE_LABEL[phase()] || '—'}</span>
      <span class="chip">汇率 <b>${fmt(g.exchange_rate, 2)}</b></span>
      <span class="chip">关税 <b>${fmt(Number(g.tariff_rate) * 100, 1)}%</b></span>
      <span class="chip">我的现金 <b>${fmt(me ? me.cash : 0)}</b> G</span>
      ${me && Number(me.cash_a) > 0 ? `<span class="chip">★ <b>${fmt(me.cash_a)}</b></span>` : ''}
      ${me && Number(me.cash_b) > 0 ? `<span class="chip">◆ <b>${fmt(me.cash_b)}</b></span>` : ''}`;

    // 右上角邮箱图标未读角标
    const un = unreadMail();
    const badge = $('#mailBadge');
    if (badge) {
      badge.textContent = un > 99 ? '99+' : String(un);
      badge.classList.toggle('hidden', un <= 0);
    }
    const mb = $('#btnMail');
    if (mb) mb.title = un > 0 ? '站内邮箱 · ' + un + ' 封未读' : '站内邮箱';

    // 身份预览横幅
    const bar = $('#previewBar');
    if (bar) {
      if (isPreview()) {
        bar.classList.remove('hidden');
        bar.innerHTML = `<span class="pv-dot"></span>预览模式：你正在以 <b>${esc(ROLE_LABEL[previewRole] || previewRole)}</b> 的视角查看界面 —— 所有写操作已被屏蔽，不会影响比赛数据
          <span class="pv-switch">${PV_ROLES.map(r => `<button class="btn ${previewRole === r ? 'primary' : 'ghost'} sm" data-act="previewAs" data-role="${r}">${esc(ROLE_SHORT[r] || r)}</button>`).join('')}</span>
          <span class="grow"></span>
          <button class="btn ghost sm" data-act="previewStop">退出预览</button>`;
        bind(bar);
      } else {
        bar.classList.add('hidden');
        bar.innerHTML = '';
      }
    }

    // 左侧导航：按分组渲染，当前角色下为空的分组（含大标题）整组隐藏
    $('#nav').innerHTML = NAV_GROUPS
      .map(grp => {
        const items = grp.items.filter(navAllowed);
        if (!items.length) return '';
        return '<div class="grp">' + esc(grp.title) + '</div>' +
          items.map(n => n.href
            ? `<a class="navlink" href="${esc(n.href)}" target="_blank" rel="noopener">${n.label} <i>↗</i></a>`
            : `<button data-act="goto" data-view="${n.id}" class="${view === n.id ? 'on' : ''}">${n.label}</button>`).join('');
      })
      .join('');
    bind($('#nav'));
    renderIdxBar();
    renderNewsBar();
    bind($('#newsBar'));
  }

  function renderView() {
    const map = {
      overview: viewOverview, market: viewMarket, factory: viewFactory, inventory: viewInventory,
      trade: viewTrade, contract: viewContract, delivery: viewDelivery, consumers: viewConsumers, media: viewMedia, feed: viewFeed,
      finance: viewFinance, ranking: viewRanking, judge: viewJudge, rules: viewRules,
      rd: viewRD, pitch: viewPitch, govmarket: viewGovMarket, gov: viewGov, mail: viewMail, exchange: viewExchange,
      posts: viewPosts, loan: viewLoan, war: viewWar, companies: viewCompanies, coop: viewCoop,
      quotes: viewQuotes, hall: viewHall, spot: viewSpot, deriv: viewDeriv,
      bourse: viewBourse, listing: viewListing, bonds: viewBonds,
    };
    if (!navAllowed(NAV.find(n => n.id === view) || { roles: ['*'] })) view = 'overview';
    // 离开商战面板时收起反制表单，避免下次进来还挂着一个半填的申请
    if (view !== 'war') counterFor = null;
    const fn = map[view] || viewOverview;
    const el = $('#view');
    el.innerHTML = fn();
    bind(el);
    renderHall();
    // 进入物品交易所时拉一次该品种的逐档快照，用来合成 K 线
    if (view === 'bourse') {
      ensureBourseSeeded();
      if (ordCode) loadKline(ordCode).then(() => { if (view === 'bourse') renderBourseLive(); });
    }
  }

  // 第一次走进交易所时，只做一件事：保证自营做市盘不空，否则全场买不到也卖不掉。
  //
  // ⚠️ 这里绝不能再自动替玩家上架货物。曾经的版本会在玩家首次进入交易所时
  // 把他"最多 3 个品种的持仓 100% 全部"挂成卖单 —— 玩家刚买完原材料、一点进交易所，
  // 仓库就被整体搬进托管单，看着就像货款两失（真实事故）。上架只能由玩家自己发起。
  async function ensureBourseSeeded() {
    if (seedTried) return;
    seedTried = true;
    if (!isOpen() || isPreview()) return;
    try {
      if (!S.orders.some(o => o.owner_id === '__exchange__' && (o.status === 'open' || o.status === 'partial'))) {
        await rpc('wbs_bourse_seed', {});
        await reload();
        renderShell();
        renderView();
      }
    } catch (e) { /* 布市失败不该打断用户，静默跳过 */ }
  }

  // ---------- 通用片段 ----------
  function phaseNotice() {
    if (isTrial() && isOpen()) {
      return `<div class="notice warn">🎮 <b>试运营财年进行中</b> —— 本财年为练手局，所有买卖、生产、合同都可以随便试，<b>成绩不计入正式比赛</b>。裁判结算并重置后，正式第 1 财年将从干净数据开始。</div>`;
    }
    if (isOpen()) return '';
    if (phase() === 'prepare') {
      return `<div class="notice warn">比赛尚未开始。请等待裁判在「裁判台」开启第一个财年。</div>`;
    }
    if (isTrial()) {
      return `<div class="notice info">🎮 试运营财年 ${fy()} 已结算。裁判确认无误后重置数据，即可正式开赛 —— 试运营成绩不计入正式比赛。</div>`;
    }
    return `<div class="notice info">财年 ${fy()} 已结算，交易已关闭。等待裁判开启下一个财年。</div>`;
  }

  // ---------- 行情中心 ----------
  // 服务端把"全场共享的一台行情时钟"存在 wbs_quotes_live（当前盘口）+ wbs_quotes（逐档快照）。
  // 任何一名玩家打开页面都会按 6 秒的节流推进一步，所以所有人看到的是同一份走势 —— 这才像交易所。
  function sortQuotes(list) {
    return list.slice().sort((a, b) => {
      const ka = QKIND_ORDER.indexOf(a.kind);
      const kb = QKIND_ORDER.indexOf(b.kind);
      if (ka !== kb) return ka - kb;
      return String(a.code).localeCompare(String(b.code), 'zh');
    });
  }

  const quoteOf = code => S.quotes.find(q => q.code === code) || null;
  const quoteName = code => (quoteOf(code) || {}).name || code;

  // 现货价：原材料采购、成品成本、库存估值都以行情现价为准；行情缺失时退回目录基准价
  function spotOf(code) {
    const q = quoteOf(code);
    return q && Number(q.price) > 0 ? Number(q.price) : null;
  }
  function matSpot(matCode) { return spotOf('MAT:' + matCode); }

  function seedQHist(rows) {
    Object.keys(QHIST).forEach(k => { delete QHIST[k]; });
    rows.slice()
      .sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0))
      .forEach(r => {
        const arr = QHIST[r.code] || (QHIST[r.code] = []);
        arr.push(Number(r.price));
      });
    Object.keys(QHIST).forEach(k => {
      if (QHIST[k].length > QHIST_MAX) QHIST[k] = QHIST[k].slice(-QHIST_MAX);
    });
  }

  function pushQHist(rows) {
    (rows || []).forEach(r => {
      const arr = QHIST[r.code] || (QHIST[r.code] = []);
      arr.push(Number(r.price));
      if (arr.length > QHIST_MAX) arr.shift();
    });
  }

  function applySnapshot(d) {
    if (!d || !Array.isArray(d.rows) || !d.rows.length) return;
    S.quotes = sortQuotes(d.rows);
    S.qTick = Number(d.tick) || 0;
    S.quotesAt = d.at || '';
    pushQHist(d.rows);
    // 服务端随每档快照一起下发交易规则与大盘指数，前端不自己猜涨跌停板
    const r = Object.assign({}, S.rules || {});
    if (d.band != null) r.price_band = Number(d.band) || 0.20;
    if (d.fee != null) r.ex_fee = Number(d.fee) || 0;
    if (d.circuitUntil != null) r.circuit_until = Number(d.circuitUntil) || 0;
    if (d.auctionDone != null) r.auction_done = String(d.auctionDone);
    S.rules = r;
    if (d.index && d.index.code) S.idxKCI = d.index;
  }

  // ---------- 交易所规则辅助 ----------
  // 涨跌停板以「本财年开盘价」为基准上下浮动，与 wbs_order_place 的口径完全一致
  const priceBand = () => Number((S.rules && S.rules.price_band) || 0.20);
  const exFee = () => Number((S.rules && S.rules.ex_fee) || 0.0015);
  const circuitUntil = () => Number((S.rules && S.rules.circuit_until) || 0);
  const isHalted = () => S.qTick > 0 && S.qTick <= circuitUntil();
  const isAuction = () => S.rules && String(S.rules.auction_done) === '0';

  function bandOf(q) {
    if (!q) return { lo: 0, hi: 0, base: 0 };
    const base = Number(q.open) > 0 ? Number(q.open) : Number(q.base) || 0;
    const b = priceBand();
    return { base: base, lo: Math.max(0.01, Math.round(base * (1 - b) * 100) / 100), hi: Math.round(base * (1 + b) * 100) / 100 };
  }

  // 上市公司名录：行情代码 EQ:股票代码 ↔ 上市档案
  const listingOf = ticker => S.listings.find(l => l.ticker === ticker) || null;
  const listingsListed = () => S.listings.filter(l => l.status === 'listed');
  const equityCode = ticker => 'EQ:' + ticker;
  // 行情代码 ↔ 库存 (kind, item_code) 的互相翻译
  const KIND_PREFIX = { equity: 'EQ:', material: 'MAT:', product: 'PRD:', bond: 'BND:' };
  const codeOfKind = (kind, item) => (KIND_PREFIX[kind] || '') + item;
  // 企业债：行情代码即 code（BND:0001）
  const bondOfCode = code => S.bonds.find(b => b.code === code) || null;
  const itemOfCode = code => String(code).split(':')[1] || code;
  // 行情代码 → 中文名：先查行情（覆盖股权 / 债券），再回落到原材料 / 成品表
  const itemNameByCode = code => {
    const q = (S.quotes || []).find(x => x.code === code);
    if (q && q.name) return q.name;
    const c = String(code || '');
    if (c.indexOf('MAT:') === 0) return matName(c.slice(4));
    if (c.indexOf('PRD:') === 0) return prodName(c.slice(4));
    return c;
  };

  // 涨跌幅一律以「基准价」（目录价 / 官方汇率）为参照，这样任何时刻看到的都是累计涨跌
  function chgOf(q) {
    const base = Number(q.base) || 0;
    const price = Number(q.price) || 0;
    const prev = Number(q.prev) || 0;
    const pct = base > 0 ? (price - base) / base * 100 : 0;
    const dpct = prev > 0 ? (price - prev) / prev * 100 : 0;
    return {
      chg: price - base, pct: pct, delta: price - prev, dpct: dpct,
      dir: pct > 0.005 ? 'up' : (pct < -0.005 ? 'dn' : 'fl'),
    };
  }

  function qClass(dir) { return dir === 'up' ? 'up-t' : (dir === 'dn' ? 'dn-t' : 'fl-t'); }
  function qArrow(dir) { return dir === 'up' ? '▲' : (dir === 'dn' ? '▼' : '—'); }
  function signed(n, d) { const v = Number(n) || 0; return (v > 0 ? '+' : '') + fmt(v, d); }

  // ---------- 顶部大盘指数条 ----------
  // KCI（综合指数）= 全部商品价格相对基准价的均值；KEI（股权指数）= 全部上市公司股价相对发行价的均值。
  // KCI 随每档行情快照下发（6 秒），KEI 来自 wbs_index（跟随 8 秒轮询），两者都常驻顶栏。
  const IDXHIST = {};
  let idxHistTick = -1;

  function sparkOf(arr, dir, w, h) {
    if (!arr || arr.length < 2) return '';
    const lo = Math.min.apply(null, arr);
    const hi = Math.max.apply(null, arr);
    const rng = (hi - lo) < 1e-9 ? 1 : (hi - lo);
    const pts = arr.map((v, i) =>
      (i * w / (arr.length - 1)).toFixed(1) + ',' + (h - 2 - (v - lo) / rng * (h - 4)).toFixed(1)).join(' ');
    const stroke = dir === 'up' ? '#ff6b6b' : (dir === 'dn' ? '#35d07f' : '#8fa2c4');
    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${stroke}" stroke-width="1.5"/></svg>`;
  }

  function idxList() {
    const out = [];
    if (S.idxKCI && S.idxKCI.code) out.push(S.idxKCI);
    (S.index || []).forEach(i => { if (i && i.code && !out.some(x => x.code === i.code)) out.push(i); });
    return out;
  }

  function idxItemHtml(i) {
    const open = Number(i.open) > 0 ? Number(i.open) : (Number(i.base) || 0);
    const val = Number(i.value) || 0;
    const pct = open > 0 ? (val - open) / open * 100 : 0;
    const dir = pct > 0.005 ? 'up' : (pct < -0.005 ? 'dn' : 'fl');
    return `<div class="idx-item ${dir}">
      <div class="ix-h"><span class="ix-nm">${esc(i.name)}</span><span class="ix-cd">${esc(i.code)}</span></div>
      <div class="ix-b"><span class="ix-v">${fmt(val, 2)}</span><span class="ix-c">${qArrow(dir)}${signed(pct, 2)}%</span></div>
      <div class="ix-sp">${sparkOf(IDXHIST[i.code] || [], dir, 108, 26)}</div>
    </div>`;
  }

  // 指数条跑马灯：与新闻条同款的无缝滚动方案 —— 量一份宽度 → 复制 reps 份 →
  // 两个完全相同的半段拼接 → translateX(-50%) 永远首尾严丝合缝，任何屏宽不露空底。
  let idxOneW = 0;       // 「一份」内容的实测像素宽（0 = 还没量过）
  let idxRepsKey = '';   // 量的指纹：条目数 + 视口宽
  let idxHalfW = 0;      // 当前半段宽度，用于滚动进度接续

  function renderIdxBar() {
    const view = $('#idxView');
    const track = $('#idxTrack');
    if (!track) return;
    // 每推进一档记一个点，攒出指数的分时走势
    if (S.qTick !== idxHistTick) {
      idxHistTick = S.qTick;
      idxList().forEach(i => {
        const a = IDXHIST[i.code] || (IDXHIST[i.code] = []);
        a.push(Number(i.value) || 0);
        if (a.length > 120) a.shift();
      });
    }
    const idx = idxList();
    const tradable = S.quotes.filter(q => TRADABLE.indexOf(q.kind) >= 0);
    const upN = tradable.filter(q => chgOf(q).dir === 'up').length;
    const dnN = tradable.filter(q => chgOf(q).dir === 'dn').length;
    const amount = (S.trades || []).reduce((a, t) => a + Number(t.amount || 0), 0);
    const halted = isHalted();
    const auc = isAuction();

    const items = [];

    idx.forEach(i => items.push(idxItemHtml(i)));
    if (!idx.length) {
      items.push('<div class="idx-item"><div class="ix-h"><span class="ix-nm">指数引擎启动中…</span></div><div class="ix-b"><span class="ix-v">—</span></div></div>');
    }

    // 领涨 / 领跌 / 汇率补充卡：既是有效信息，也把轨道撑长
    const ranked = tradable.slice().sort((a, b) => chgOf(b).pct - chgOf(a).pct);
    const topQ = ranked[0], botQ = ranked.length > 1 ? ranked[ranked.length - 1] : null;
    const miniCard = (label, code, nm, valHtml, dir) => {
      if (!nm) return '';
      return `<div class="idx-item mini ${dir}">
        <div class="ix-h"><span class="ix-nm">${esc(label)}</span><span class="ix-cd">${esc(code)}</span></div>
        <div class="ix-b"><span class="ix-v">${esc(nm)}</span><span class="ix-c">${valHtml}</span></div>
      </div>`;
    };
    if (topQ) {
      const c = chgOf(topQ);
      items.push(miniCard('领涨', topQ.kind === 'material' ? 'MAT' : (topQ.kind === 'product' ? 'PRD' : topQ.kind.toUpperCase()),
        topQ.name, `${qArrow(c.dir)}${signed(c.pct, 2)}%`, c.dir === 'fl' ? '' : c.dir));
    }
    if (botQ && botQ !== topQ) {
      const c = chgOf(botQ);
      items.push(miniCard('领跌', botQ.kind === 'material' ? 'MAT' : (botQ.kind === 'product' ? 'PRD' : botQ.kind.toUpperCase()),
        botQ.name, `${qArrow(c.dir)}${signed(c.pct, 2)}%`, c.dir === 'fl' ? '' : c.dir));
    }
    (S.fx || []).forEach(f => {
      items.push(`<div class="idx-item mini">
        <div class="ix-h"><span class="ix-nm">${esc(f.name)}</span><span class="ix-cd">FX</span></div>
        <div class="ix-b"><span class="ix-v">${fmt(f.rate, 4)}</span><span class="ix-c">兑金币</span></div>
      </div>`);
    });

    // 涨跌 / 成交额统计胶囊（随行情一起滚动）
    items.push(`<div class="idx-side">
      <span class="ix-pill"><em>涨</em><b class="up-t">${upN}</b></span>
      <span class="ix-pill"><em>平</em><b>${Math.max(0, tradable.length - upN - dnN)}</b></span>
      <span class="ix-pill"><em>跌</em><b class="dn-t">${dnN}</b></span>
      <span class="ix-pill"><em>成交额</em><b>${fmt(amount, 0)} G</b></span>
      ${halted ? '<span class="ix-pill warn"><b>全场熔断停牌</b></span>' : ''}
      ${auc ? '<span class="ix-pill warn"><b>集合竞价中</b></span>' : ''}
      <span class="ix-pill"><em>第</em><b>${S.qTick}</b><em>档</em></span>
    </div>`);

    // 品牌分隔牌
    items.push('<div class="idx-item brand"><span class="ix-brand">◆ 商业大陆交易所 · BIZLAND EXCHANGE ◆</span></div>');

    const one = items.join('');

    // 换内容前记下当前滚动进度，重建后用负 animation-delay 接回去 ——
    // 否则每 6 秒一档行情快照，跑马灯就会跳回开头。
    let keepFrac = 0;
    try {
      if (idxHalfW > 0 && typeof getComputedStyle === 'function') {
        const tr = getComputedStyle(track).transform;
        if (tr && tr !== 'none') {
          const e = Math.abs(parseFloat(tr.split(',')[4]) || 0);
          keepFrac = Math.min(0.98, e / idxHalfW);
        }
      }
    } catch (err) { /* 忽略 */ }

    const vw = (view && view.clientWidth) || 0;
    const key = items.length + '@' + vw;
    let probed = false;
    if (vw > 0 && key !== idxRepsKey) {
      track.innerHTML = one;              // 只放一份量宽度，同一轮 JS 里量完就覆盖，不会闪
      const rect = track.getBoundingClientRect ? track.getBoundingClientRect() : null;
      const w = Math.max(track.scrollWidth || 0, rect && rect.width ? rect.width : 0);
      if (w > 0) { idxOneW = w; idxRepsKey = key; probed = true; }
    }
    const reps = idxOneW > 0 ? Math.max(1, Math.ceil(vw / idxOneW) + 1) : 3;
    const sig = S.qTick + '|' + reps + '|' + items.length;
    if (probed || track.getAttribute('data-sig') !== sig) {
      idxHalfW = (idxOneW > 0 ? idxOneW : items.length * 190) * reps;
      const dur = Math.max(35, Math.round(idxHalfW / 45));   // 约 45 px/s
      track.style.animationDuration = dur + 's';
      const half = one.repeat(reps);
      track.innerHTML = half + half;      // 两个完全相同的半段 → 位移 -50% 永远无缝
      track.setAttribute('data-sig', sig);
      track.style.animationDelay = keepFrac > 0 ? '-' + (keepFrac * dur).toFixed(2) + 's' : '';
    }
  }

  // ---------- 顶部滚动新闻条（newsbar · NYSE 风格） ----------
  // 取代原来的滚动行情条：同样的无缝跑马灯，滚的换成「情报 / 市场公告 / 文档入口」，
  // 每一块都能点 —— 点情报 / 公告跳到对应板块，点「宪法 / 政策 / 避坑」直接定位到规则手册章节。

  let nbOneW = 0;        // 「一份」内容的实测像素宽（0 = 还没量过）
  let nbRepsKey = '';    // 量的指纹：条目数 + 视口宽

  function nbPlate(cls, inner) {
    return '<span class="nb-item nb-plate' + (cls ? ' ' + cls : '') + '">' + inner + '</span>';
  }

  function renderNewsBar() {
    const view = $('#nbView');
    const track = $('#nbTrack');
    if (!track) return;
    const clip = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n) + '…' : s; };

    const items = [];

    // 最新情报（媒体资讯 / 组委会公告）：点击进情报流看全文
    [...S.news]
      .sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0)).slice(0, 4)
      .forEach(n => items.push(`<button class="nb-item" data-act="goto" data-view="feed" title="${esc(n.title || '')}">
          <span class="kd">情报</span><span class="tx">${esc(clip(n.title, 28))}</span>
          <span class="src">${esc(clip(n.author || '系统', 10))}</span></button>`));

    // 最新市场公告（置顶优先）：点击进公告板
    [...S.posts]
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (Number(b.id) || 0) - (Number(a.id) || 0)).slice(0, 3)
      .forEach(p => items.push(`<button class="nb-item" data-act="goto" data-view="posts" title="${esc(p.title || '')}">
          <span class="kd kd-amber">${p.pinned ? '📌 公告' : '公告'}</span><span class="tx">${esc(clip(p.title, 28))}</span>
          <span class="src">${esc(clip(p.company_name || '', 10))}</span></button>`));

    // 常用文档入口：点击直接定位到规则手册对应章节
    items.push(`<button class="nb-item nb-doc" data-act="gotoSec" data-anchor="rb-top" title="打开规则手册">
        <span class="kd kd-doc">宪法</span><span class="tx">规则手册全文</span></button>`);
    items.push(`<button class="nb-item nb-doc" data-act="gotoSec" data-anchor="sec-7" title="裁判与政府操作手册">
        <span class="kd kd-doc">政策</span><span class="tx">政府操作手册</span></button>`);
    items.push(`<button class="nb-item nb-doc" data-act="gotoSec" data-anchor="sec-8" title="新手最容易踩的十三个坑">
        <span class="kd kd-doc">避坑</span><span class="tx">新手十三个坑</span></button>`);

    // 一份内容的收尾品牌牌 + 开头状态牌（NYSE 跑马灯的味道）
    items.push(nbPlate('nb-sep', '<span class="sp">◆</span><span class="nm">商业新闻社 · BIZLAND NEWS</span><span class="sp">◆</span>'));

    const one = items.join('');

    // 量一次「一份」的宽度，据此决定复制份数：两半 + translateX(-50%) 才能无缝循环
    const vw = (view && view.clientWidth) || 0;
    const key = items.length + '@' + vw;
    let probed = false;
    if (vw > 0 && key !== nbRepsKey) {
      track.innerHTML = one;              // 只放一份量宽度，同一轮 JS 里量完就覆盖，不会闪
      const rect = track.getBoundingClientRect ? track.getBoundingClientRect() : null;
      const w = Math.max(track.scrollWidth || 0, rect && rect.width ? rect.width : 0);
      if (w > 0) { nbOneW = w; nbRepsKey = key; probed = true; }
    }
    // 还没量到（首次渲染 / 容器隐藏）时给个保守份数，量到之后自动收敛
    const reps = nbOneW > 0 ? Math.max(1, Math.ceil(vw / nbOneW) + 1) : 3;
    const sig = reps + '|' + items.length;
    if (probed || track.getAttribute('data-sig') !== sig) {
      const half = one.repeat(reps);
      track.innerHTML = half + half;      // 两个完全相同的半段 → 位移 -50% 永远无缝
      track.setAttribute('data-sig', sig);
    }

    // 约 55 px/s：按实际像素算速度，条目多少手感一致
    const halfW = (nbOneW > 0 ? nbOneW : items.length * 240) * reps;
    track.style.animationDuration = Math.max(30, Math.round(halfW / 55)) + 's';
  }

  // 品种按钮（交易大厅大屏底部跑马灯仍在用）
  function tkItem(q) {
    const c = chgOf(q);
    const cls = c.dir === 'up' ? 'up' : (c.dir === 'dn' ? 'dn' : 'fl');
    return `<button class="tk-item" data-act="gotoQuote" data-code="${esc(q.code)}" title="点击查看 ${esc(q.name)} 的分时走势">
      <span class="kd">${esc(QKIND[q.kind] || q.kind)}</span>
      <span class="nm">${esc(q.name)}</span>
      <span class="pr">${fmt(q.price, 2)}</span>
      <span class="ch ${cls}">${qArrow(c.dir)}${signed(c.pct, 2)}%</span>
    </button>`;
  }

  // 行情条上的「信息牌」：品种之外的补充内容。
  // 一来把大盘指数 / 汇率 / 市场状态一并推到眼前（不用抬头看指数栏），
  // 二来把轨道撑长，品种再少也不会在滚动到末端时露出空底色。
  function tkPlate(cls, inner) {
    return '<span class="tk-item tk-plate' + (cls ? ' ' + cls : '') + '">' + inner + '</span>';
  }

  function tkFillerItems() {
    const out = [];
    const tradable = S.quotes.filter(q => TRADABLE.indexOf(q.kind) >= 0);
    const upN = tradable.filter(q => chgOf(q).dir === 'up').length;
    const dnN = tradable.filter(q => chgOf(q).dir === 'dn').length;
    const flatN = Math.max(0, tradable.length - upN - dnN);
    const amount = (S.trades || []).reduce((a, t) => a + Number(t.amount || 0), 0);

    idxList().forEach(i => {
      const open = Number(i.open) > 0 ? Number(i.open) : (Number(i.base) || 0);
      const val = Number(i.value) || 0;
      const pct = open > 0 ? (val - open) / open * 100 : 0;
      const dir = pct > 0.005 ? 'up' : (pct < -0.005 ? 'dn' : 'fl');
      out.push(tkPlate('',
        `<span class="kd">指数</span>
         <span class="nm">${esc(i.name)} ${esc(i.code)}</span>
         <span class="pr">${fmt(val, 2)}</span>
         <span class="ch ${dir}">${qArrow(dir)}${signed(pct, 2)}%</span>`));
    });

    (S.fx || []).forEach(f => {
      out.push(tkPlate('',
        `<span class="kd">汇率</span>
         <span class="nm">${esc(f.name)} ${esc(f.symbol || '')}</span>
         <span class="pr">${fmt(f.rate, 4)}</span>
         <span class="ch fl">G</span>`));
    });

    const halted = isHalted();
    const auc = isAuction();
    out.push(tkPlate(halted || auc ? 'tk-warn' : '',
      `<span class="kd">市场</span>
       <span class="nm">财年 ${fy()} · 第 ${S.qTick} 档</span>
       <span class="pr">${halted ? '全场熔断停牌' : (auc ? '集合竞价中' : '连续竞价')}</span>`));

    out.push(tkPlate('',
      `<span class="kd">涨跌</span>
       <span class="nm">涨 <b class="ch up">${upN}</b> · 平 ${flatN} · 跌 <b class="ch dn">${dnN}</b></span>
       <span class="ch fl">成交额 ${fmt(amount, 0)} G</span>`));

    out.push(tkPlate('tk-tip',
      `<span class="kd">提示</span>
       <span class="nm">点击任意品种可查看分时走势</span>`));

    out.push(tkPlate('tk-sep',
      `<span class="sp">◆</span><span class="nm">商业大陆交易所</span><span class="sp">◆</span>`));

    return out;
  }


  // ---------- 行情中心视图 ----------
  function qSpark(code, dir) {
    const h = QHIST[code] || [];
    if (h.length < 2) return '';
    const W = 120;
    const H = 34;
    const lo = Math.min.apply(null, h);
    const hi = Math.max.apply(null, h);
    const rng = (hi - lo) < 1e-9 ? 1 : (hi - lo);
    const pts = h.map((v, i) =>
      (i * W / (h.length - 1)).toFixed(1) + ',' + (H - (v - lo) / rng * H).toFixed(1)).join(' ');
    const stroke = dir === 'up' ? 'var(--up)' : (dir === 'dn' ? 'var(--down)' : '#98a2b3');
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${stroke}" stroke-width="1.5"/></svg>`;
  }

  function qCard(q) {
    const c = chgOf(q);
    return `<div class="qcard ${qPick === q.code ? 'on' : ''}" data-act="pickQuote" data-code="${esc(q.code)}" title="点击切换主图">
      <div class="qc-h"><span class="nm">${esc(q.name)}</span><span class="kd">${esc(QKIND[q.kind] || q.kind)}</span></div>
      <div class="qc-p ${qClass(c.dir)}">${fmt(q.price, 2)}</div>
      <div class="qc-d ${qClass(c.dir)}">${qArrow(c.dir)} ${signed(c.pct, 2)}%</div>
      ${qSpark(q.code, c.dir)}
      <div class="qc-f"><span>高 ${fmt(q.high, 2)}</span><span>低 ${fmt(q.low, 2)}</span></div>
    </div>`;
  }

  function qRankRow(q) {
    const c = chgOf(q);
    return `<div class="toolbar" style="margin:0;padding:9px 0;border-bottom:1px solid var(--line-2);">
      <div style="min-width:0;">
        <div style="font-weight:600;font-size:13px;">${esc(q.name)}</div>
        <div class="hint" style="margin:0;">${esc(QKIND[q.kind] || q.kind)} · ${fmt(q.price, 2)}</div>
      </div>
      <span class="grow"></span>
      <span class="${qClass(c.dir)}" style="font-variant-numeric:tabular-nums;font-weight:600;">${signed(c.pct, 2)}%</span>
    </div>`;
  }

  function qChart(q, sfx) {
    const gid = 'qArea' + (sfx || '');
    const hist = (QHIST[q.code] || []).slice();
    const vals = hist.length ? hist : [Number(q.price) || 1];
    const W = 660;
    const H = 246;
    const PL = 48;
    const PR = 14;
    const PT = 14;
    const PB = 30;
    const iw = W - PL - PR;
    const ih = H - PT - PB;
    const base = Number(q.base) || vals[0];
    let lo = Math.min.apply(null, vals.concat([base]));
    let hi = Math.max.apply(null, vals.concat([base]));
    if (hi - lo < 1e-6) { hi += 1; lo = Math.max(0, lo - 1); }
    const pad = (hi - lo) * 0.14;
    lo = Math.max(0, lo - pad);
    hi += pad;
    const X = i => PL + (vals.length <= 1 ? iw / 2 : i * iw / (vals.length - 1));
    const Y = v => PT + ih - (v - lo) / (hi - lo) * ih;
    const pts = vals.map((v, i) => X(i).toFixed(1) + ',' + Y(v).toFixed(1)).join(' ');
    const c = chgOf(q);
    const stroke = c.dir === 'up' ? 'var(--up)' : (c.dir === 'dn' ? 'var(--down)' : '#2f5bea');
    const area = PL + ',' + (PT + ih).toFixed(1) + ' ' + pts + ' ' + (PL + iw).toFixed(1) + ',' + (PT + ih).toFixed(1);

    let grid = '';
    for (let k = 0; k <= 4; k++) {
      const gy = PT + ih * k / 4;
      const gv = hi - (hi - lo) * k / 4;
      grid += `<line x1="${PL}" y1="${gy.toFixed(1)}" x2="${PL + iw}" y2="${gy.toFixed(1)}" stroke="#e4e8f0"/>`
        + `<text x="${PL - 8}" y="${(gy + 4).toFixed(1)}" text-anchor="end" font-size="10.5" fill="#98a2b3">${fmt(gv, gv >= 20 ? 1 : 2)}</text>`;
    }
    const by = Y(base);
    const bl = (by >= PT && by <= PT + ih)
      ? `<line x1="${PL}" y1="${by.toFixed(1)}" x2="${PL + iw}" y2="${by.toFixed(1)}" stroke="#b9c2d4" stroke-dasharray="5 4"/>`
        + `<text x="${PL + iw - 2}" y="${(by - 6).toFixed(1)}" text-anchor="end" font-size="10.5" fill="#98a2b3">基准 ${fmt(base, 2)}</text>`
      : '';
    const lx = X(vals.length - 1);
    const ly = Y(vals[vals.length - 1]);

    return `<div class="q-chart">
      <div class="q-bar">
        <div style="min-width:0;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span class="q-name">${esc(q.name)}</span>
            <span class="q-kd">${esc(QKIND[q.kind] || q.kind)}</span>
          </div>
          <div class="q-kv">代码 <b>${esc(q.code)}</b> · 开盘 <b>${fmt(q.open, 2)}</b> · 最高 <b>${fmt(q.high, 2)}</b> · 最低 <b>${fmt(q.low, 2)}</b> · 成交量 <b>${fmt(q.volume)}</b></div>
        </div>
        <div class="grow"></div>
        <div style="text-align:right;">
          <div class="q-last ${qClass(c.dir)}">${fmt(q.price, 2)}</div>
          <div class="q-delta ${qClass(c.dir)}">${qArrow(c.dir)} ${signed(c.chg, 2)}（${signed(c.pct, 2)}%）
            <span class="hint" style="margin:0 0 0 6px;">本档 ${signed(c.delta, 2)}</span></div>
        </div>
      </div>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(q.name)}分时走势">
        <defs>
          <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${stroke}" stop-opacity="0.22"/>
            <stop offset="100%" stop-color="${stroke}" stop-opacity="0.01"/>
          </linearGradient>
        </defs>
        ${grid}
        ${bl}
        <polygon points="${area}" fill="url(#${gid})"/>
        <polyline points="${pts}" fill="none" stroke="${stroke}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>
        <circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="3.2" fill="${stroke}"/>
        <text x="${PL}" y="${H - 10}" font-size="10.5" fill="#98a2b3">共 ${vals.length} 档</text>
        <text x="${PL + iw}" y="${H - 10}" text-anchor="end" font-size="10.5" fill="#98a2b3">最新价 ${fmt(q.price, 2)}</text>
      </svg>
      <div class="q-legend">
        <span><i style="background:${stroke}"></i>分时价格</span>
        <span><i style="background:#b9c2d4"></i>基准价（目录价）</span>
        <span>红涨绿跌 · 以基准价计累计涨跌幅</span>
      </div>
    </div>`;
  }

  function viewQuotes() {
    if (!S.quotes.length) {
      return `${phaseNotice()}
      <div class="card">
        <h3>行情中心</h3>
        <p class="hint">行情引擎还没有出第一个价。点一下下面的按钮立即开盘。</p>
        <button class="btn primary" data-act="tickNow">立即刷新行情</button>
      </div>`;
    }

    if (!qPick || !quoteOf(qPick)) qPick = S.quotes[0].code;
    const cur = quoteOf(qPick) || S.quotes[0];
    const c = chgOf(cur);
    const judge = isJudge();

    const upN = S.quotes.filter(q => chgOf(q).dir === 'up').length;
    const dnN = S.quotes.filter(q => chgOf(q).dir === 'dn').length;

    const liveWars = S.wars.filter(w => w.status === 'declared' || w.status === 'fighting').length;
    const liveSanc = S.sanctions.filter(s => s.status === 'active' && Number(s.until_year) >= fy()).length;
    const heat = liveWars * 0.55 + liveSanc * 0.18;
    const mood = liveWars >= 2 ? ['剧烈波动', 'danger', '战事叠加，避险资金在抢购原料']
      : (liveWars === 1 || liveSanc >= 2) ? ['情绪紧张', 'amber', '市场在给不确定性定价']
      : liveSanc === 1 ? ['略有波动', 'amber', '制裁推高了一部分商品的风险溢价']
      : ['交投平稳', 'ok', '没有战事与制裁，价格由供需自然撮合'];

    // 我的原料现货敞口：拿在手里的原料，按现价算比按目录价算多（少）了多少钱
    const myMats = S.materials
      .map(m => ({ m: m, qty: stockQty('material', m.code) }))
      .filter(x => x.qty > 0);
    const costV = myMats.reduce((a, x) => a + x.qty * Number(x.m.price), 0);
    const spotV = myMats.reduce((a, x) => a + x.qty * (matSpot(x.m.code) || Number(x.m.price)), 0);
    const floatPnl = spotV - costV;

    const ranked = S.quotes.slice().sort((a, b) => chgOf(b).pct - chgOf(a).pct);

    return `
    ${phaseNotice()}
    <div class="grid c4" style="margin-bottom:18px;">
      <div class="stat"><div class="k">行情档位</div><div class="v">${S.qTick}<small>档</small></div><div class="n">每 6 秒撮合一档 · ${fmtTime(S.quotesAt)}</div></div>
      <div class="stat"><div class="k">全场涨跌</div><div class="v"><span class="up-t">${upN}</span> <small>/</small> <span class="dn-t">${dnN}</span></div><div class="n">共 ${S.quotes.length} 个品种</div></div>
      <div class="stat"><div class="k">市场情绪</div><div class="v" style="font-size:19px;"><span class="pill ${mood[1]}">${mood[0]}</span></div><div class="n">${mood[2]}</div></div>
      <div class="stat"><div class="k">我的原料浮动盈亏</div><div class="v ${floatPnl > 0 ? 'up-t' : floatPnl < 0 ? 'dn-t' : ''}">${myMats.length ? signed(floatPnl, 0) + ' <small>G</small>' : '—'}</div><div class="n">${myMats.length ? '库存 ' + fmt(costV, 0) + ' G → 现价 ' + fmt(spotV, 0) + ' G' : '你还没有原材料库存'}</div></div>
    </div>

    ${liveWars ? `<div class="notice warn"><b>战事正在影响行情</b>：全场有 ${liveWars} 场战争处于交战状态，商品波动幅度被放大了约 ${fmt(heat * 100, 0)}%。囤货与抛售都变得更危险，也更赚钱。</div>` : ''}

    <div class="q-top" style="margin-bottom:18px;">
      <div>
        ${qChart(cur)}
      </div>
      <div class="card" style="margin:0;">
        <h3>涨跌榜</h3>
        <div class="hint" style="margin:2px 0 6px;">领涨</div>
        ${ranked.slice(0, 3).map(qRankRow).join('')}
        <div class="hint" style="margin:14px 0 6px;">领跌</div>
        ${ranked.slice(-3).reverse().map(qRankRow).join('')}
      </div>
    </div>

    <div class="card">
      <h3>全部品种</h3>
      <p class="hint">点任意一张卡片把它换成上面的主图。原材料按<b>现货价</b>采购，所以盯盘盯的就是自己的成本线。</p>
      <div class="grid c3">${S.quotes.map(qCard).join('')}</div>
    </div>

    ${judge ? `<div class="card audit">
      <h3>组委会 · 市场干预台 <span class="pill amber">仅政府 / 裁判可见</span></h3>
      <p class="hint">行情平时由市场自动撮合，但组委会可以像央行一样出手：投放战略储备把原料价格打下来、或者制造一次突发事件把某类商品推上去。<b>干预立即生效</b>，并会写进所有人的分时图。</p>
      <div class="grid c3">
        <div class="field"><label>干预对象</label>
          <select id="qkCode">
            <option value="ALL">全场（所有品种）</option>
            ${S.quotes.map(q => `<option value="${esc(q.code)}">${esc(q.name)}（${esc(QKIND[q.kind] || q.kind)}）</option>`).join('')}
          </select></div>
        <div class="field"><label>涨跌幅度（% ，负数为下跌）</label>
          <input id="qkPct" type="number" step="1" min="-60" max="60" value="-10"></div>
        <div class="field"><label>事由（显示在行情备注里）</label>
          <input id="qkNote" maxlength="60" placeholder="例如：政府投放战略储备"></div>
      </div>
      <div class="toolbar" style="border-top:1px solid var(--line-2);padding-top:14px;">
        <button class="btn ghost" data-act="shockPreset" data-code="ALL" data-pct="-12" data-note="政府投放战略储备，原料供给转宽松">储备投放 −12%</button>
        <button class="btn ghost" data-act="shockPreset" data-code="ALL" data-pct="15" data-note="突发事件冲击供应链">突发冲击 +15%</button>
        <span class="grow"></span>
        <button class="btn ghost" data-act="resetQuotes">行情重置回基准</button>
        <button class="btn primary" data-act="shockQuote">执行干预</button>
      </div>
    </div>` : ''}

    ${isRealAdmin() ? `<div class="card audit">
      <h3>自动波动控制台 <span class="pill ${String((S.rules && S.rules.fluct_on) ?? '1') === '0' ? 'danger' : 'teal'}">${String((S.rules && S.rules.fluct_on) ?? '1') === '0' ? '已冻结' : '波动中'}</span></h3>
      <p class="hint">行情每 6 秒自动波动一档，<b>波动多剧烈由你定</b>：数值是每档的最大波动百分比（<b>支持小数</b>，例如 0.5、1.2）。战争 / 制裁会让波动自动加倍；「回归强度」控制价格被拉回基准价的速度，填 0 就完全放任漂移。把三类波动率全设为 0 等于冻结行情。改动立即生效并发布公告。</p>
      <div class="grid c3">
        <div class="field"><label>原材料波动率（% / 档）</label><input id="fuMat" type="number" step="0.1" min="0" max="20" value="${fmt(Number((S.rules && S.rules.fluct_mat) || 1.6), 2)}"></div>
        <div class="field"><label>成品波动率（% / 档）</label><input id="fuProd" type="number" step="0.1" min="0" max="20" value="${fmt(Number((S.rules && S.rules.fluct_prod) || 0.9), 2)}"></div>
        <div class="field"><label>其他品种波动率（% / 档）</label><input id="fuOth" type="number" step="0.1" min="0" max="20" value="${fmt(Number((S.rules && S.rules.fluct_oth) || 0.6), 2)}"></div>
        <div class="field"><label>回归强度（% / 档，0 = 不回归）</label><input id="fuDrift" type="number" step="0.5" min="0" max="50" value="${fmt(Number((S.rules && S.rules.fluct_drift) || 6), 2)}"></div>
        <div class="field"><label>几秒一更新（秒，2 – 120）</label><input id="fuSec" type="number" step="1" min="2" max="120" value="${Math.round(Number((S.rules && S.rules.fluct_sec) || 6))}"></div>
        <div class="field"><label>波动持续（分钟，0 = 一直波动）</label><input id="fuMin" type="number" step="1" min="0" max="600" value="0" placeholder="0 = 一直波动"></div>
      </div>
      <div class="toolbar" style="border-top:1px solid var(--line-2);padding-top:14px;">
        <button class="btn ghost" data-act="fluctPreset" data-on="1" data-mat="0.5" data-prod="0.3" data-oth="0.2" data-drift="6"> calm · 微澜（0.5 / 0.3 / 0.2）</button>
        <button class="btn ghost" data-act="fluctPreset" data-on="1" data-mat="1.6" data-prod="0.9" data-oth="0.6" data-drift="6">默认（1.6 / 0.9 / 0.6）</button>
        <button class="btn ghost" data-act="fluctPreset" data-on="1" data-mat="4" data-prod="2.5" data-oth="1.5" data-drift="2">狂暴（4 / 2.5 / 1.5）</button>
        <span class="grow"></span>
        <button class="btn ghost" data-act="saveFluct" data-on="0">⛔ 冻结行情</button>
        <button class="btn primary" data-act="saveFluct" data-on="1">保存并开启波动</button>
      </div>
      ${(() => { const u = S.rules && S.rules.fluct_until; return u ? `<p class="hint" style="margin-top:10px;">⏳ 本轮波动将持续到 <b>${esc(String(u).replace('T', ' '))}</b>，到期后行情自动冻结并全场公告。</p>` : ''; })()}
    </div>` : ''}

    <div class="card">
      <h3>行情明细</h3>
      <table>
        <thead><tr><th>品种</th><th>类别</th><th class="num">现价</th><th class="num">基准价</th><th class="num">涨跌额</th><th class="num">涨跌幅</th><th class="num">最高</th><th class="num">最低</th><th class="num">成交量</th><th>备注</th></tr></thead>
        <tbody>${S.quotes.map(q => {
          const x = chgOf(q);
          return `<tr>
            <td><b>${esc(q.name)}</b> <span class="hint">${esc(q.code)}</span></td>
            <td><span class="pill ${q.kind === 'material' ? 'amber' : q.kind === 'product' ? 'blue' : 'teal'}">${esc(QKIND[q.kind] || q.kind)}</span></td>
            <td class="num ${qClass(x.dir)}"><b>${fmt(q.price, 2)}</b></td>
            <td class="num">${fmt(q.base, 2)}</td>
            <td class="num ${qClass(x.dir)}">${signed(x.chg, 2)}</td>
            <td class="num ${qClass(x.dir)}">${signed(x.pct, 2)}%</td>
            <td class="num">${fmt(q.high, 2)}</td>
            <td class="num">${fmt(q.low, 2)}</td>
            <td class="num">${fmt(q.volume)}</td>
            <td style="font-size:12.5px;">${esc(q.note || '—')}</td>
          </tr>`;
        }).join('')}</tbody>
      </table>
    </div>`;
  }

  // ---------- 交易大厅大屏 ----------
  function hallTiles() {
    if (!hallPick || !quoteOf(hallPick)) hallPick = S.quotes[0].code;
    return S.quotes.map(q => {
      const c = chgOf(q);
      return `<button class="hl-tile ${c.dir}${hallPick === q.code ? ' on' : ''}" data-act="pickQuote" data-code="${esc(q.code)}" title="点击看这只的大图">
        <span class="hl-kd">${esc(QKIND[q.kind] || q.kind)}</span>
        <span class="hl-nm">${esc(q.name)}</span>
        <span class="hl-pr">${fmt(q.price, 2)}</span>
        <span class="hl-ch">${qArrow(c.dir)} ${signed(c.pct, 2)}%</span>
        <span class="hl-sp">${qSpark(q.code, c.dir)}</span>
      </button>`;
    }).join('');
  }

  function hallBoard(full) {
    if (!S.quotes.length) {
      return `<div class="hall-inner"><div class="hall-empty">行情引擎启动中…</div></div>`;
    }
    if (!hallPick || !quoteOf(hallPick)) hallPick = S.quotes[0].code;
    const cur = quoteOf(hallPick) || S.quotes[0];
    const upN = S.quotes.filter(q => chgOf(q).dir === 'up').length;
    const dnN = S.quotes.filter(q => chgOf(q).dir === 'dn').length;
    const one = S.quotes.map(tkItem).join('') + tkFillerItems().join('');
    return `<div class="hall-inner">
      <header class="hall-head">
        <div class="hall-brand">商业大陆交易所<small>BIZLAND EXCHANGE</small></div>
        <div class="hall-meta">财年 ${fy()} · 第 <b>${S.qTick}</b> 档 · ${fmtTime(S.quotesAt)}</div>
        <div class="hall-stat"><span class="up-t">▲ ${upN}</span><span class="dn-t">▼ ${dnN}</span></div>
        <div class="hall-btn">${full
          ? '<button class="btn ghost sm" data-act="hallExit">退出大屏 · Esc</button>'
          : '<button class="btn primary sm" data-act="hallFull">全屏投屏</button>'}</div>
      </header>
      <div class="hall-body">
        <div class="hall-main">${qChart(cur, 'H')}</div>
        <div class="hall-wall">${hallTiles()}</div>
      </div>
      <footer class="hall-foot"><div class="hall-mtrack">${one}${one}${one}${one}</div></footer>
    </div>`;
  }

  function renderHall() {
    const el = $('#hallWrap');
    if (!el) return;
    if (!hallOn) {
      el.classList.add('hidden');
      el.innerHTML = '';
      return;
    }
    el.classList.remove('hidden');
    el.innerHTML = hallBoard(true);
    bind(el);
  }

  function viewHall() {
    if (!S.quotes.length) {
      return `${phaseNotice()}
      <div class="card">
        <h3>交易大厅大屏</h3>
        <p class="hint">行情引擎还没有出第一个价。点一下下面的按钮立即开盘。</p>
        <button class="btn primary" data-act="tickNow">立即刷新行情</button>
      </div>`;
    }
    return `${phaseNotice()}
    <div class="card">
      <h3>交易大厅大屏</h3>
      <p class="hint">点「全屏投屏」把这块大屏铺满整间教室 —— 开赛时全场一起看着价格跳，气氛完全不一样。全屏后按 <b>Esc</b> 或点右上角退出；价格每 6 秒自动推进一档，所有屏幕看到的是同一份行情。</p>
      <div class="toolbar"><span class="hint">建议用教室电脑 / 投影仪打开本页。</span><span class="grow"></span><button class="btn primary" data-act="hallFull">全屏投屏</button></div>
    </div>
    <div class="hall-card">${hallBoard(false)}</div>`;
  }

  // ---------- 场外市场（已并入物品交易所） ----------
  // 原来这里是独立的挂单市场，与交易所委托功能完全重叠。现在只保留一个别名：
  // 老链接（goto spot）仍能打开，但看到的就是交易所的「挂单交易台」。
  // spotRef / spotItemName 仍被遗留的旧动作引用，保留这两个小工具。
  function spotRef(kind, code) {
    return kind === 'material' ? (matSpot(code) || 0) : (spotOf('PRD:' + code) || 0);
  }
  const spotItemName = o => (o.kind === 'material' ? matName(o.item_code) : prodName(o.item_code));
  // 合同（wbs_offers）的标的名：现在合同也能挂原材料了
  const offerItemName = o => (o.kind === 'material' ? matName(o.item_code) : prodName(o.item_code));

  function viewSpot() { return viewBourse(); }

  // ---------- 视图：衍生品中心（锁价合约 + 做空） ----------
  function futFloat(f) {
    const spot = spotOf(f.code) || Number(f.open_price);
    return (f.side === 'long' ? spot - Number(f.strike) : Number(f.strike) - spot) * Number(f.qty);
  }
  function shortFloat(s) {
    const spot = spotOf(s.code) || Number(s.entry);
    return (Number(s.entry) - spot) * Number(s.qty);
  }

  function viewDeriv() {
    const open = isOpen();
    const myFut = S.futures.filter(f => me && f.owner_id === me.owner_id);
    const myFutOpen = myFut.filter(f => f.status === 'open');
    const myShort = S.shorts.filter(s => me && s.owner_id === me.owner_id);
    const myShortOpen = myShort.filter(s => s.status === 'open');

    const futMargin = myFutOpen.reduce((a, f) => a + Number(f.margin), 0);
    const shortMargin = myShortOpen.reduce((a, s) => a + Number(s.margin), 0);
    const futPnl = myFutOpen.reduce((a, f) => a + futFloat(f), 0);
    const shortPnl = myShortOpen.reduce((a, s) => a + shortFloat(s), 0);
    const realized = myFut.filter(f => f.status === 'settled').reduce((a, f) => a + Number(f.pnl), 0)
      + myShort.filter(s => s.status !== 'open').reduce((a, s) => a + Number(s.pnl), 0);

    const codes = S.quotes.filter(q => q.kind !== 'fx');
    const codeOpts = codes.map(q => `<option value="${esc(q.code)}">${esc(q.name)}（现价 ${fmt(q.price, 2)}）</option>`).join('');

    const cls = v => v > 0.005 ? 'up-t' : (v < -0.005 ? 'dn-t' : '');

    const futRow = f => {
      const spot = spotOf(f.code) || Number(f.open_price);
      const pnl = futFloat(f);
      const expired = Number(f.settle_year) <= fy();
      const st = f.status === 'settled'
        ? `<span class="pill ${Number(f.pnl) >= 0 ? 'ok' : 'danger'}">已结算 ${signed(Number(f.pnl), 2)} G</span>`
        : `<button class="btn primary sm" data-act="futSettle" data-id="${f.id}" ${open ? '' : 'disabled'}>${expired ? '到期结算' : '提前结算'}</button>`;
      return `<tr>
        <td><b>${esc(f.name)}</b> <span class="hint">${esc(f.code)}</span></td>
        <td>${f.side === 'long' ? '<span class="pill teal">锁买</span>' : '<span class="pill amber">锁卖</span>'}</td>
        <td class="num">${fmt(f.qty)}</td>
        <td class="num">${fmt(f.strike, 2)}</td>
        <td class="num">${fmt(spot, 2)}</td>
        <td class="num ${cls(pnl)}">${f.status === 'open' ? signed(pnl, 2) : '—'}</td>
        <td class="num">${fmt(f.margin, 2)}</td>
        <td>财年 ${f.settle_year}${f.status === 'open' && expired ? ' <span class="pill danger">已到期</span>' : ''}</td>
        <td>${st}</td>
      </tr>`;
    };

    const shortRow = s => {
      const spot = spotOf(s.code) || Number(s.entry);
      const pnl = shortFloat(s);
      const liq = Number(s.entry) + Number(s.margin) * 0.8 / Number(s.qty);
      const st = s.status === 'closed'
        ? `<span class="pill ${Number(s.pnl) >= 0 ? 'ok' : 'danger'}">已平仓 ${signed(Number(s.pnl), 2)} G</span>`
        : s.status === 'liquidated'
          ? `<span class="pill danger">已强平 ${signed(Number(s.pnl), 2)} G</span>`
          : `<button class="btn primary sm" data-act="shortClose" data-id="${s.id}" ${open ? '' : 'disabled'}>买回平仓</button>`;
      return `<tr>
        <td><b>${esc(s.name)}</b> <span class="hint">${esc(s.code)}</span></td>
        <td class="num">${fmt(s.qty)}</td>
        <td class="num">${fmt(s.entry, 2)}</td>
        <td class="num">${fmt(spot, 2)}</td>
        <td class="num">${fmt(liq, 2)}</td>
        <td class="num ${cls(pnl)}">${s.status === 'open' ? signed(pnl, 2) : '—'}</td>
        <td class="num">${fmt(s.margin, 2)}</td>
        <td>${st}</td>
      </tr>`;
    };

    // 全场未平仓规模（公开数据，纯氛围）
    const liveFut = S.futures.filter(f => f.status === 'open');
    const liveShort = S.shorts.filter(s => s.status === 'open');
    const liveFutNotional = liveFut.reduce((a, f) => a + Number(f.qty) * Number(f.strike), 0);
    const liveShortNotional = liveShort.reduce((a, s) => a + Number(s.qty) * Number(s.entry), 0);

    return `
    ${phaseNotice()}
    <div class="grid c4" style="margin-bottom:18px;">
      <div class="stat"><div class="k">我的锁价合约</div><div class="v">${myFutOpen.length}<small>张</small></div><div class="n">占用保证金 ${fmt(futMargin, 0)} G</div></div>
      <div class="stat"><div class="k">合约浮动盈亏</div><div class="v ${cls(futPnl)}">${myFutOpen.length ? signed(futPnl, 0) + ' <small>G</small>' : '—'}</div><div class="n">到期结算时兑现</div></div>
      <div class="stat"><div class="k">我的空头</div><div class="v">${myShortOpen.length}<small>笔</small></div><div class="n">占用保证金 ${fmt(shortMargin, 0)} G</div></div>
      <div class="stat"><div class="k">做空浮动盈亏</div><div class="v ${cls(shortPnl)}">${myShortOpen.length ? signed(shortPnl, 0) + ' <small>G</small>' : '—'}</div><div class="n">累计已实现 ${signed(realized, 0)} G</div></div>
    </div>

    <div class="card">
      <h3>锁价合约（期货）</h3>
      <p class="hint">
        现在就跟市场签一份<b>未来按约定价交割</b>的合约，赌一个方向：<br>
        <b>锁买（看涨）</b>：约定价 25 G 买芯片。到期真涨到 30 G，你按 25 交割，差价 5 G × 数量就是你的；跌到 20 G，你就亏 5 G × 数量。<br>
        <b>锁卖（看跌）</b>：与你相反 —— 你赌它跌。<br>
        开仓只需付 <b>10% 保证金</b>（= 数量 × 约定价 × 10%），<b>最多亏掉保证金，不会倒欠</b>。到期系统自动结算；也可以随时「提前结算」按当前现价了结。
      </p>
      <div class="grid c4">
        <div class="field"><label>方向</label>
          <select id="fuSide"><option value="long">锁买（看涨）</option><option value="short">锁卖（看跌）</option></select></div>
        <div class="field"><label>标的</label><select id="fuCode">${codeOpts}</select></div>
        <div class="field"><label>数量</label><input id="fuQty" type="number" min="1" step="1" value="10"></div>
        <div class="field"><label>约定价（G）</label><input id="fuStrike" type="number" min="0.01" step="1" value="10"></div>
        <div class="field"><label>期限（财年）</label>
          <select id="fuYears"><option value="1">1 个财年</option><option value="2">2 个财年</option><option value="3">3 个财年</option></select></div>
      </div>
      <div class="toolbar" style="border-top:1px solid var(--line-2);padding-top:14px;">
        <span class="hint">保证金 = 数量 × 约定价 × 10%。约定价越偏离现价，越难赢。</span>
        <span class="grow"></span>
        <button class="btn ghost" data-act="futSettleAll" ${myFutOpen.length && open ? '' : 'disabled'}>全部提前结算</button>
        <button class="btn primary" data-act="futOpen" ${open ? '' : 'disabled'}>签下合约</button>
      </div>
      <table style="margin-top:16px;">
        <thead><tr><th>品种</th><th>方向</th><th class="num">数量</th><th class="num">约定价</th><th class="num">现价</th><th class="num">浮动盈亏</th><th class="num">保证金</th><th>到期</th><th>状态 / 操作</th></tr></thead>
        <tbody>${myFut.length ? myFut.map(futRow).join('') : `<tr><td colspan="9" class="empty">你还没有签过锁价合约</td></tr>`}</tbody>
      </table>
    </div>

    <div class="card">
      <h3>做空</h3>
      <p class="hint">
        <b>借货先卖，跌了再买回</b>：你按现价把借来的货卖掉，钱先进你的账；等价格跌下去再买回来还给市场，差价就是利润。<br>
        保证金 = 现价 × 数量 × <b>30%</b>，且开仓后必须保留至少等同保证金的现金缓冲。<b>价格涨到「强平价」就会被系统强制平仓</b>，保证金亏掉为止。
      </p>
      <div class="grid c3">
        <div class="field"><label>标的</label><select id="shCode">${codeOpts}</select></div>
        <div class="field"><label>数量</label><input id="shQty" type="number" min="1" step="1" value="50"></div>
        <div class="field"><label>&nbsp;</label>
          <button class="btn danger block" data-act="shortOpen" ${open ? '' : 'disabled'}>做空开仓</button></div>
      </div>
      <table style="margin-top:16px;">
        <thead><tr><th>品种</th><th class="num">数量</th><th class="num">开仓价</th><th class="num">现价</th><th class="num">强平价</th><th class="num">浮动盈亏</th><th class="num">保证金</th><th>状态 / 操作</th></tr></thead>
        <tbody>${myShort.length ? myShort.map(shortRow).join('') : `<tr><td colspan="8" class="empty">你还没有做空过</td></tr>`}</tbody>
      </table>
    </div>

    <div class="card">
      <h3>全场衍生品持仓</h3>
      <p class="hint">所有人都能看到场上有多少人在赌方向 —— 但看不到具体是谁。</p>
      <div class="grid c3">
        <div class="stat"><div class="k">未平仓锁价合约</div><div class="v">${liveFut.length}<small>张</small></div><div class="n">名义规模 ${fmt(liveFutNotional, 0)} G</div></div>
        <div class="stat"><div class="k">未平仓空头</div><div class="v">${liveShort.length}<small>笔</small></div><div class="n">名义规模 ${fmt(liveShortNotional, 0)} G</div></div>
        <div class="stat"><div class="k">市场杠杆情绪</div><div class="v" style="font-size:19px;"><span class="pill ${liveFut.length + liveShort.length >= 6 ? 'danger' : liveFut.length + liveShort.length >= 2 ? 'amber' : 'ok'}">${liveFut.length + liveShort.length >= 6 ? '高杠杆' : liveFut.length + liveShort.length >= 2 ? '有人在对赌' : '很安静'}</span></div><div class="n">衍生品越拥挤，现货波动越剧烈</div></div>
      </div>
    </div>`;
  }

  // ---------- 实时盘口 ----------
  // ================= 交易所：证券交易台 =================
  // 原材料、成品、上市公司股权、企业债共用服务端同一台撮合引擎：
  // 价格优先 + 时间优先、可部分成交、未成交委托在财年结算时原路退款。
  const raw = (n, d) => (Number(n) || 0).toFixed(d == null ? 2 : d);

  // 可撮合品种：外汇只做汇率牌价，不进撮合。顺序与行情中心一致（股权 → 原材料 → 成品 → 债券），
  // 这样「品种选择条」和默认选中项在任何入口下都是确定的第一只。
  function tradableQuotes() {
    return sortQuotes(S.quotes.filter(q => TRADABLE.indexOf(q.kind) >= 0));
  }

  function ensureOrdPick() {
    const list = tradableQuotes();
    if (!list.length) { ordCode = null; return null; }
    if (!ordCode || !list.some(q => q.code === ordCode)) ordCode = list[0].code;
    return quoteOf(ordCode);
  }

  const openOrders = code => S.orders.filter(o =>
    (code ? o.code === code : true) && (o.status === 'open' || o.status === 'partial'));

  const myOrdersAll = () => (me ? S.orders.filter(o => o.owner_id === me.owner_id) : []);
  const myOpenOrders = () => myOrdersAll().filter(o => o.status === 'open' || o.status === 'partial');

  // 委托簿：把同价位的未成交委托合并成一档，买卖各取五档
  function depthOf(code) {
    const live = openOrders(code);
    const agg = side => {
      const m = {};
      live.filter(o => o.side === side).forEach(o => {
        const p = Number(o.price) || 0;
        const left = Number(o.qty) - Number(o.filled);
        if (left <= 0) return;
        if (!m[p]) m[p] = { price: p, qty: 0, mine: 0, mm: 0, n: 0 };
        m[p].qty += left;
        if (o.owner_id === '__exchange__') m[p].mm += left;
        if (me && o.owner_id === me.owner_id) m[p].mine += left;
        m[p].n += 1;
      });
      return Object.keys(m).map(k => m[k]);
    };
    return {
      asks: agg('sell').sort((a, b) => a.price - b.price).slice(0, 5),
      bids: agg('buy').sort((a, b) => b.price - a.price).slice(0, 5),
    };
  }

  function bourseTiles() {
    const list = tradableQuotes();
    if (!list.length) return '';
    ensureOrdPick();
    return `<div class="bk-tiles">${list.map(q => {
      const c = chgOf(q);
      return `<button class="bk-tile ${c.dir}${ordCode === q.code ? ' on' : ''}" data-act="ordPick" data-code="${esc(q.code)}">
        <span class="bt-kd">${esc(QKIND[q.kind] || q.kind)}</span>
        <span class="bt-nm">${esc(q.name)}</span>
        <span class="bt-pr">${fmt(q.price, 2)}</span>
        <span class="bt-ch">${qArrow(c.dir)}${signed(c.pct, 2)}%</span>
      </button>`;
    }).join('')}</div>`;
  }

  const bkLevel = (label, lv, side, maxQ) => {
    if (!lv) return `<div class="bk-lv empty ${side}"><span class="lv">${label}</span><span class="pr">—</span><span class="qt">—</span></div>`;
    const w = maxQ > 0 ? Math.min(100, lv.qty / maxQ * 100) : 0;
    return `<div class="bk-lv ${side}${Number(lv.mine) > 0 ? ' mine' : ''}">
      <i class="bk-fill" style="width:${w.toFixed(1)}%"></i>
      <span class="lv">${label}</span>
      <span class="pr">${fmt(lv.price, 2)}</span>
      <span class="qt">${fmt(lv.qty, 0)}</span>
    </div>`;
  };

  function bkBookHtml(code) {
    const q = quoteOf(code);
    if (!q) return '<div class="empty">该品种未在交易所上市</div>';
    const d = depthOf(code);
    const c = chgOf(q);
    const b = bandOf(q);
    const maxQ = Math.max(1, d.asks.concat(d.bids).map(x => x.qty).reduce((a, v) => Math.max(a, v), 1));
    const asks = d.asks.map((x, i) => Object.assign({}, x, { label: '卖' + (i + 1) })).reverse();
    const bids = d.bids.map((x, i) => Object.assign({}, x, { label: '买' + (i + 1) }));
    const pad = (arr, n) => arr.concat(Array.from({ length: Math.max(0, n - arr.length) }, () => null));
    const atLimit = Number(q.price) >= b.hi - 1e-9 ? '涨停' : (Number(q.price) <= b.lo + 1e-9 ? '跌停' : '');
    const bidsum = d.bids.reduce((a, x) => a + x.qty, 0);
    const asksum = d.asks.reduce((a, x) => a + x.qty, 0);
    const tot = bidsum + asksum;
    const ratio = tot > 0 ? (bidsum - asksum) / tot * 100 : 0;
    return `<div class="bk-book">
      <div class="bk-bhead">
        <span class="bk-last ${qClass(c.dir)}">${fmt(q.price, 2)}</span>
        <span class="bk-lastch ${qClass(c.dir)}">${qArrow(c.dir)}${signed(c.pct, 2)}%</span>
        <span class="grow"></span>
        ${atLimit ? `<span class="pill ${atLimit === '涨停' ? 'danger' : 'ok'}">${atLimit}</span>` : ''}
      </div>
      <div class="bk-hi">
        <span>高 <b class="up-t">${fmt(q.high, 2)}</b></span>
        <span>低 <b class="dn-t">${fmt(q.low, 2)}</b></span>
        <span>开 <b>${fmt(q.open, 2)}</b></span>
        <span>量 <b>${fmt(q.volume, 0)}</b></span>
      </div>
      <div class="bk-colhead"><span class="lv">档位</span><span class="pr">价格</span><span class="qt">数量</span></div>
      ${pad(asks, 5).map((lv, i) => bkLevel('卖' + (5 - i), lv, 'ask', maxQ)).join('')}
      <div class="bk-mid"><span>涨跌停 ${fmt(b.lo, 2)} ~ ${fmt(b.hi, 2)}</span><span class="${ratio > 0 ? 'up-t' : (ratio < 0 ? 'dn-t' : '')}">委比 ${ratio > 0 ? '+' : ''}${ratio.toFixed(1)}%</span></div>
      ${pad(bids, 5).map((lv, i) => bkLevel('买' + (i + 1), lv, 'bid', maxQ)).join('')}
    </div>`;
  }

  async function loadKline(code) {
    try {
      const { data, error } = await cloud.database.from('wbs_quotes')
        .select('price,tick').eq('code', code).order('id', { ascending: false }).limit(280);
      if (error) throw error;
      KCACHE[code] = (data || []).slice().reverse();
    } catch (e) { /* 历史拿不到就退回分时图 */ }
  }

  function bkChartHtml(code) {
    const q = quoteOf(code);
    const rows = (KCACHE[code] || []).filter(r => Number(r.price) > 0);
    const enough = rows.length >= kStep * 4;
    const head = `<div class="bk-khead">
      <span class="bk-ktabs">${[2, 4, 8].map(s => `<button class="${kStep === s ? 'on' : ''}" data-act="ordStep" data-step="${s}">${s} 档/根</button>`).join('')}</span>
      <span class="grow"></span>
      <span class="hint" style="margin:0;">MA5 <i style="color:#3b82f6;font-style:normal;">▬</i>　MA10 <i style="color:#c2810a;font-style:normal;">▬</i></span>
    </div>`;
    if (!enough) {
      return head + `<div class="bk-nofund">K 线需要至少 ${kStep * 4} 档历史快照。行情每 6 秒推进一档、每档都会留一份快照，稍等几分钟再看就有了。下面是当前分时。</div>`
        + (q ? `<div class="q-chart">${qChart(q, 'BK')}</div>` : '');
    }
    const cs = [];
    for (let i = 0; i < rows.length; i += kStep) {
      const seg = rows.slice(i, i + kStep).map(r => Number(r.price));
      if (!seg.length) continue;
      cs.push({ o: seg[0], c: seg[seg.length - 1], h: Math.max.apply(null, seg), l: Math.min.apply(null, seg) });
    }
    const arr = cs.slice(-52);
    const n = arr.length;
    const W = 620;
    const H = 252;
    const PL = 6;
    const PR = 56;
    const PT = 12;
    const PB = 18;
    const hi = Math.max.apply(null, arr.map(c => c.h));
    const lo = Math.min.apply(null, arr.map(c => c.l));
    const rng = (hi - lo) < 1e-9 ? 1 : (hi - lo);
    const y = v => PT + (1 - (v - lo) / rng) * (H - PT - PB);
    const step = (W - PL - PR) / n;
    const bw = Math.max(2, step * 0.62);
    const cx = i => PL + i * step + step / 2;
    const bars = arr.map((c, i) => {
      const up = c.c >= c.o;
      const col = up ? 'var(--up)' : 'var(--down)';
      const y1 = y(c.o);
      const y2 = y(c.c);
      return `<line x1="${cx(i).toFixed(1)}" y1="${y(c.h).toFixed(1)}" x2="${cx(i).toFixed(1)}" y2="${y(c.l).toFixed(1)}" stroke="${col}" stroke-width="1"/>`
        + `<rect x="${(cx(i) - bw / 2).toFixed(1)}" y="${Math.min(y1, y2).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1.2, Math.abs(y1 - y2)).toFixed(1)}" fill="${col}"/>`;
    }).join('');
    const maLine = k => {
      const pts = [];
      for (let i = 0; i < n; i++) {
        if (i < k - 1) continue;
        let s = 0;
        for (let j = i - k + 1; j <= i; j++) s += arr[j].c;
        pts.push(cx(i).toFixed(1) + ',' + y(s / k).toFixed(1));
      }
      return pts.join(' ');
    };
    const grids = [0, 0.5, 1].map(f => {
      const v = lo + rng * (1 - f);
      return `<line x1="${PL}" y1="${y(v).toFixed(1)}" x2="${(W - PR).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="var(--line-2)" stroke-width="1"/>`
        + `<text x="${W - PR + 6}" y="${y(v).toFixed(1)}" dominant-baseline="central" font-size="11" fill="var(--muted-2)">${fmt(v, 2)}</text>`;
    }).join('');
    const sum = arr.reduce((a, c) => a + c.c, 0);
    return head + `<svg class="bk-k" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(q ? q.name : code)} K 线图">
      ${grids}${bars}
      <polyline points="${maLine(5)}" fill="none" stroke="#3b82f6" stroke-width="1.2"/>
      <polyline points="${maLine(10)}" fill="none" stroke="#c2810a" stroke-width="1.2"/>
    </svg>`;
  }

  function bkMineHtml() {
    const mine = myOpenOrders();
    if (!mine.length) return `<div class="empty">现在没有挂着的委托。下单后未成交的部分会一直挂在盘口上，可以随时撤单。${myRole() === 'manufacturer'
      ? '制造商在「生产中心」投产，产线一完工系统就会自动替你挂一张卖单，届时会出现在这里。' : ''}</div>`;
    return `<table>
      <thead><tr><th>方向</th><th>品种</th><th class="num">委托价</th><th class="num">已成交 / 总量</th><th class="num">冻结</th><th class="num">档位</th><th style="width:90px;"></th></tr></thead>
      <tbody>${mine.map(o => {
        const left = Number(o.qty) - Number(o.filled);
        return `<tr>
          <td><span class="pill ${o.side === 'buy' ? 'danger' : 'ok'}">${o.side === 'buy' ? '买入' : '卖出'}</span></td>
          <td><b>${esc(o.name)}</b> <span class="hint">${esc(QKIND[o.kind] || o.kind)}</span></td>
          <td class="num">${fmt(o.price, 2)}</td>
          <td class="num">${fmt(o.filled)}<span class="hint"> / ${fmt(o.qty)}</span><span class="hint"> 剩 ${fmt(left, 0)}</span></td>
          <td class="num">${Number(o.escrow) > 0 ? fmt(o.escrow) + ' G' : '托管 ' + fmt(left)}</td>
          <td class="num hint">第 ${fmt(o.tick, 0)} 档</td>
          <td><button class="btn danger sm" data-act="ordCancel" data-id="${o.id}">撤单</button></td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
  }

  function bkTapeHtml(code) {
    const list = S.trades.filter(t => !code || t.code === code).slice(0, 40);
    if (!list.length) return `<div class="empty">还没有产生任何成交。当买一价 ≥ 卖一价时，撮合引擎会立刻按「先挂单者的价格」成交并记在这里。</div>`;
    return `<table>
      <thead><tr><th>品种</th><th>时间</th><th class="num">成交价</th><th class="num">数量</th><th class="num">金额</th><th>买方席位</th><th>卖方席位</th><th>吃单方</th></tr></thead>
      <tbody>${list.map(t => `<tr>
        <td><b>${esc(t.name)}</b></td>
        <td class="hint">第 ${fmt(t.tick, 0)} 档</td>
        <td class="num ${t.taker === 'buy' ? 'up-t' : 'dn-t'}"><b>${fmt(t.price, 2)}</b></td>
        <td class="num">${fmt(t.qty)}</td>
        <td class="num">${fmt(t.amount)}</td>
        <td>${esc(t.buyer_name || '—')} <span class="hint">${esc(t.buyer_seat || '')}</span></td>
        <td>${esc(t.seller_name || '—')} <span class="hint">${esc(t.seller_seat || '')}</span></td>
        <td>${t.taker === 'buy' ? '<span class="pill danger">买方吃单</span>' : '<span class="pill ok">卖方砸盘</span>'}</td>
      </tr>`).join('')}</tbody>
    </table>`;
  }

  // 龙虎榜：按交易席位统计成交额，排出全场最活跃的资金
  function bkLeagueHtml() {
    if (!S.trades.length) return '<div class="empty">还没有成交记录，龙虎榜暂时为空。</div>';
    const m = {};
    S.trades.forEach(t => {
      [[t.buyer_seat, t.buyer_name], [t.seller_seat, t.seller_name]].forEach(p => {
        const seat = p[0];
        if (!seat) return;
        if (!m[seat]) m[seat] = { seat: seat, name: p[1] || '—', amount: 0, n: 0, fee: 0 };
        m[seat].amount += Number(t.amount) || 0;
        m[seat].fee += (Number(t.fee) || 0) / 2;
        m[seat].n += 1;
      });
    });
    const rows = Object.keys(m).map(k => m[k]).sort((a, b) => b.amount - a.amount).slice(0, 12);
    const top = rows.length ? rows[0].amount : 1;
    return `<table>
      <thead><tr><th style="width:52px;">名次</th><th>席位</th><th>公司</th><th class="num">成交笔数</th><th class="num">成交额</th><th class="num">手续费</th><th style="width:150px;">占榜首</th></tr></thead>
      <tbody>${rows.map((r, i) => `<tr>
        <td><b>${i + 1}</b></td>
        <td><span class="pill blue">${esc(r.seat)}</span></td>
        <td>${esc(r.name)}${me && r.seat === me.seat ? ' <span class="pill amber">我</span>' : ''}</td>
        <td class="num">${r.n}</td>
        <td class="num"><b>${fmt(r.amount)}</b> G</td>
        <td class="num">${fmt(r.fee)}</td>
        <td><div class="bar teal"><i style="width:${(r.amount / top * 100).toFixed(1)}%"></i></div></td>
      </tr>`).join('')}</tbody>
    </table>`;
  }

  // 结算单：把本财年我在交易所的所有成交与费用摊开
  function bkSettleHtml() {
    const mine = S.trades.filter(t => me && (t.buyer_id === me.owner_id || t.seller_id === me.owner_id));
    const buys = mine.filter(t => t.buyer_id === me.owner_id);
    const sells = mine.filter(t => t.seller_id === me.owner_id);
    const sum = a => a.reduce((x, t) => x + Number(t.amount || 0), 0);
    const fee = mine.reduce((x, t) => x + Number(t.fee || 0) / 2, 0);
    const buyAmt = sum(buys);
    const sellAmt = sum(sells);
    const openCnt = myOpenOrders().length;
    const frozen = myOpenOrders().filter(o => o.side === 'buy').reduce((a, o) => a + Number(o.escrow || 0), 0);
    const eqVal = (myBoardRow() && Number(myBoardRow().eq_value)) || 0;
    const bdVal = (myBoardRow() && Number(myBoardRow().bd_value)) || 0;
    return `<div class="grid c4" style="margin-bottom:14px;">
        <div class="stat"><div class="k">买入成交</div><div class="v">${buys.length}<small>笔</small></div><div class="n">合计 ${fmt(buyAmt)} G</div></div>
        <div class="stat"><div class="k">卖出成交</div><div class="v">${sells.length}<small>笔</small></div><div class="n">合计 ${fmt(sellAmt)} G</div></div>
        <div class="stat"><div class="k">手续费</div><div class="v">${fmt(fee)}<small>G</small></div><div class="n">单边 ${(exFee() * 100).toFixed(2)}%，买卖各计一次</div></div>
        <div class="stat"><div class="k">未成交委托</div><div class="v">${openCnt}<small>笔</small></div><div class="n">冻结现金 ${fmt(frozen)} G</div></div>
      </div>
      <div class="grid c2" style="margin-bottom:6px;">
        <div class="stat"><div class="k">持股市值</div><div class="v">${fmt(eqVal)}<small>G</small></div><div class="n">按最新市价计</div></div>
        <div class="stat"><div class="k">持债市值</div><div class="v">${fmt(bdVal)}<small>G</small></div><div class="n">按最新报价计</div></div>
      </div>
      <p class="hint">下面是本财年与你相关的每一笔撮合成交，和交易所结算系统给出的账目完全一致。</p>
      ${mine.length ? `<table>
        <thead><tr><th>品种</th><th>我在</th><th class="num">价格</th><th class="num">数量</th><th class="num">金额</th><th class="num">手续费</th><th>对手</th><th class="num">档位</th></tr></thead>
        <tbody>${mine.map(t => {
          const isBuy = t.buyer_id === me.owner_id;
          return `<tr>
            <td><b>${esc(t.name)}</b></td>
            <td><span class="pill ${isBuy ? 'danger' : 'ok'}">${isBuy ? '买入' : '卖出'}</span></td>
            <td class="num">${fmt(t.price, 2)}</td>
            <td class="num">${fmt(t.qty)}</td>
            <td class="num">${fmt(t.amount)}</td>
            <td class="num">${fmt(Number(t.fee) / 2)}</td>
            <td>${esc(isBuy ? (t.seller_name || '交易所自营') : (t.buyer_name || '交易所自营'))}</td>
            <td class="num hint">第 ${fmt(t.tick, 0)} 档</td>
          </tr>`;
        }).join('')}</tbody>
      </table>` : '<div class="empty">本财年你还没有在交易所成交过。</div>'}`;
  }

  function bkFormHtml(code) {
    const q = quoteOf(code);
    if (!q) return '';
    const open = isOpen();
    const b = bandOf(q);
    const px = ordType === 'market' ? (ordSide === 'buy' ? b.hi : b.lo) : (Number(q.price) || b.base);
    const item = itemOfCode(code);
    const have = stockQty(q.kind, item);
    const cash = Number(me ? me.cash : 0);
    const maxBuy = px > 0 ? Math.floor(cash / (px * (1 + exFee()))) : 0;
    return `<div class="bk-form">
      <div class="bk-side">
        <button class="bk-buy${ordSide === 'buy' ? ' on' : ''}" data-act="ordSide" data-side="buy" ${open ? '' : 'disabled'}>买入</button>
        <button class="bk-sell${ordSide === 'sell' ? ' on' : ''}" data-act="ordSide" data-side="sell" ${open ? '' : 'disabled'}>卖出</button>
      </div>
      <div class="bk-type">
        <button class="${ordType === 'limit' ? 'on' : ''}" data-act="ordType" data-type="limit">限价委托</button>
        <button class="${ordType === 'market' ? 'on' : ''}" data-act="ordType" data-type="market">市价委托</button>
      </div>
      <div class="field"><label>委托价（G）</label>
        <input id="bkPrice" type="number" step="0.01" min="${raw(b.lo)}" max="${raw(b.hi)}" value="${raw(px)}" ${ordType === 'market' || !open ? 'disabled' : ''}>
      </div>
      <div class="field"><label>数量</label>
        <input id="bkQty" type="number" step="1" min="1" value="10" ${open ? '' : 'disabled'}>
      </div>
      <div class="bk-quick">
        ${[10, 50, 100].map(n => `<button class="btn ghost sm" data-act="ordQtySet" data-n="${n}">${n}</button>`).join('')}
        <button class="btn ghost sm" data-act="ordQtySet" data-n="max">${ordSide === 'buy' ? '全仓买入' : '全部卖出'}</button>
      </div>
      <div class="bk-kv"><span>涨跌停板</span><b><span class="dn-t">${fmt(b.lo, 2)}</span> ~ <span class="up-t">${fmt(b.hi, 2)}</span></b></div>
      <div class="bk-kv"><span>${ordSide === 'buy' ? '可用现金' : '可卖库存'}</span><b>${fmt(ordSide === 'buy' ? cash : have)} ${ordSide === 'buy' ? 'G' : ''}</b></div>
      <div class="bk-kv"><span>${ordSide === 'buy' ? '最多可买' : '最多可卖'}</span><b>${fmt(ordSide === 'buy' ? maxBuy : have)}</b></div>
      <div class="bk-kv"><span>手续费率</span><b>${(exFee() * 100).toFixed(2)}%</b></div>
      <button class="btn primary block" data-act="ordPlace" ${open ? '' : 'disabled'}>${ordSide === 'buy' ? '提交买单' : '提交卖单'}</button>
      <p class="hint">${ordSide === 'buy'
        ? '买入会先冻结「委托价 × 数量 × (1 + 手续费)」的现金；实际成交价可能优于你的报价，差额会立刻退回。'
        : '卖出会先把库存托管出去，成交后现金到账；撤单时未成交部分原样退回库存。'}</p>
    </div>`;
  }

  // ================= 交易所「发布台」：上架货物 / 发布求购 =================
  // 这是"贸易市场"并入交易所之后的正式入口：用买卖盘的语言说话，不用"挂单/委托"这种行话。
  // 底层完全复用同一台撮合引擎（wbs_order_place），所以上架即进入五档盘口，有人吃单立刻成交。
  const allTradables = () => sortQuotes(S.quotes.filter(q => TRADABLE.indexOf(q.kind) >= 0));

  // 我手上可以"上架"的库存（原材料 / 成品 / 股权 / 债券），带上对应行情
  function myHoldings() {
    const out = [];
    S.stock.forEach(s => {
      if (Number(s.qty) <= 0) return;
      if (TRADABLE.indexOf(s.kind) < 0) return;
      const q = quoteOf(codeOfKind(s.kind, s.item_code));
      if (!q) return;
      out.push({ kind: s.kind, item: s.item_code, qty: Number(s.qty), q: q, code: q.code });
    });
    return out.sort((a, b) => b.qty - a.qty);
  }

  // 发布台可选标的：上架=我有的货；求购=全市场可交易品种
  function pubOptions() {
    return pubSide === 'sell' ? myHoldings() : allTradables().map(q => ({ kind: q.kind, item: itemOfCode(q.code), qty: 0, q: q, code: q.code }));
  }

  function ensurePubPick() {
    const list = pubOptions();
    if (!list.length) { pubCode = null; return null; }
    if (!pubCode || !list.some(x => x.code === pubCode)) pubCode = list[0].code;
    return list.find(x => x.code === pubCode) || null;
  }

  // 建议价：贴着盘口的对手价挂，成交概率最高
  function pubSuggest(code, side) {
    const q = quoteOf(code);
    if (!q) return 0;
    const b = bandOf(q);
    const dep = depthOf(code);
    const n = Number(q.price) || b.base;
    let px = side === 'sell' ? n * 1.01 : n * 0.99;
    if (side === 'sell' && dep.bids.length) px = Math.max(px, dep.bids[0].price);
    if (side === 'buy' && dep.asks.length) px = Math.min(px, dep.asks[0].price);
    return Math.min(b.hi, Math.max(b.lo, Math.round(px * 100) / 100));
  }

  function bkPubHtml() {
    const open = isOpen();
    const list = pubOptions();
    const opt = ensurePubPick();
    // 方向切换永远渲染：空仓只能发布求购（不能上架），但绝不能把整个发布台锁死 ——
    // 之前的 bug 是空仓时整个表单被空状态替换，连「发布求购」都点不到。
    const switchHtml = `
      <div class="pub-switch">
        <button class="pub-s sell${pubSide === 'sell' ? ' on' : ''}" data-act="pubSide" data-side="sell" ${open ? '' : 'disabled'}>
          <b>上架货物</b><span>把货挂出去，等买家来吃</span>
        </button>
        <button class="pub-s buy${pubSide === 'buy' ? ' on' : ''}" data-act="pubSide" data-side="buy" ${open ? '' : 'disabled'}>
          <b>发布求购</b><span>把想买的货挂出去，等卖家来卖</span>
        </button>
      </div>`;
    if (!opt) {
      return switchHtml + `<div class="empty">${pubSide === 'sell'
        ? '你手上还没有可以上架的货物 —— 切到「发布求购」先挂一张买单，买到货之后就能上架了。'
        : '交易所目前没有可交易的品种。'}</div>`;
    }
    const q = opt.q;
    const b = bandOf(q);
    const px = pubSuggest(opt.code, pubSide);
    const cash = Number(me ? me.cash : 0);
    const maxQty = pubSide === 'buy'
      ? (px > 0 ? Math.floor(cash / (px * (1 + exFee()))) : 0)
      : opt.qty;
    return `
    ${switchHtml}
    <div class="pub">
      <div class="pub-picks">
        ${list.map(x => {
          const c = chgOf(x.q);
          return `<button class="pub-chip${pubCode === x.code ? ' on' : ''}" data-act="pubPick" data-code="${esc(x.code)}">
            <span class="pc-kd">${esc(QKIND[x.kind] || x.kind)}</span>
            <span class="pc-nm">${esc(x.q.name)}</span>
            <span class="pc-pr ${qClass(c.dir)}">${fmt(x.q.price, 2)}</span>
            ${pubSide === 'sell' ? `<span class="pc-have">存 ${fmt(x.qty, 0)}</span>` : ''}
          </button>`;
        }).join('')}
      </div>

      <div class="pub-main">
        <div class="field"><label>${pubSide === 'sell' ? '挂牌价（每个 G）' : '出价（每个 G）'}</label>
          <input id="pubPrice" type="number" step="0.01" min="${raw(b.lo)}" max="${raw(b.hi)}" value="${raw(px)}" ${open ? '' : 'disabled'}>
        </div>
        <div class="field"><label>数量</label>
          <input id="pubQty" type="number" step="1" min="1" value="${Math.max(1, Math.min(10, maxQty || 10))}" ${open ? '' : 'disabled'}>
        </div>
      </div>
      <div class="pub-quick">
        ${[10, 50, 100].map(n => `<button class="btn ghost sm" data-act="pubQuick" data-n="${n}">${n}</button>`).join('')}
        <button class="btn ghost sm" data-act="pubQuick" data-n="max">全部</button>
      </div>

      <div class="pub-meta">
        <div class="pk"><span>最新价</span><b class="${qClass(chgOf(q).dir)}">${fmt(q.price, 2)}</b></div>
        <div class="pk"><span>今日涨跌停</span><b><span class="dn-t">${fmt(b.lo, 2)}</span> ~ <span class="up-t">${fmt(b.hi, 2)}</span></b></div>
        <div class="pk"><span>${pubSide === 'sell' ? '可上架' : '可用现金'}</span><b>${fmt(pubSide === 'sell' ? opt.qty : cash)}${pubSide === 'sell' ? '' : ' G'}</b></div>
        <div class="pk"><span>${pubSide === 'sell' ? '最多能挂' : '最多能买'}</span><b>${fmt(maxQty)}</b></div>
        <div class="pk"><span>手续费</span><b>${(exFee() * 100).toFixed(2)}%</b></div>
      </div>

      <button class="btn primary block lg" data-act="pubGo" ${open ? '' : 'disabled'}>${pubSide === 'sell' ? '上架到交易所' : '发布求购到交易所'}</button>
      <p class="hint">${pubSide === 'sell'
        ? '上架后你的货会被托管，同时挂进五档盘口。有人按你的价买入就立刻成交，钱货两清；随时可以撤单取回。'
        : '发布求购会先冻结「出价 × 数量 × (1 + 手续费)」的现金。有人按你的价卖出就成交，成交价更优时多冻的钱当场退回。'}</p>
    </div>`;
  }

  // 市场挂单总览：全场所有人的在售 / 求购（贸易市场并入交易所后的"看货盘"）
  // 按类别（成品 / 原材料 / 其他）分组展示。之前只取全场最便宜的前 30 笔 ——
  // 原材料单价低、单子多，把成品全部挤出列表，「市场挂单没有成品」就是这么来的。
  function bkListingHtml() {
    const live = S.orders.filter(o => o.status === 'open' || o.status === 'partial')
      .map(o => ({ o: o, left: Number(o.qty) - Number(o.filled) }))
      .filter(x => x.left > 0);
    if (!live.length) return '<div class="empty">盘口上现在没有挂单。可以用上面的「发布台」第一个上架，或者点「试样上架」先挂一小部分。</div>';
    const mine = x => me && x.o.owner_id === me.owner_id;
    const sys = x => x.o.owner_id === '__exchange__';

    const table = (arr, side) => {
      if (!arr.length) return '<tr><td colspan="8" class="empty">' + (side === 'sell' ? '这一类现在没有人在卖' : '这一类现在没有人在买 —— 系统商户只卖不买，你挂出的货要等真实买家（贸易商 / 制造商 / 政府）来接') + '</td></tr>';
      return arr.map(x => {
        const o = x.o;
        const q = quoteOf(o.code);
        const spot = q ? Number(q.price) : Number(o.price);
        const gap = spot > 0 ? (Number(o.price) - spot) / spot * 100 : 0;
        return `<tr>
          <td><b>${esc(o.name)}</b> <span class="hint">${esc(QKIND[o.kind] || o.kind)}</span></td>
          <td>${esc(o.company_name || '—')} <span class="hint">${esc(o.seat || '')}</span>${sys(x) ? ' <span class="pill teal">系统</span>' : ''}${mine(x) ? ' <span class="pill amber">我的</span>' : ''}</td>
          <td class="num">${fmt(x.left, 0)}</td>
          <td class="num"><b>${fmt(o.price, 2)}</b></td>
          <td class="num">${fmt(x.left * Number(o.price))}</td>
          <td class="num ${qClass(gap > 0.005 ? 'up' : (gap < -0.005 ? 'down' : 'fl'))}">${signed(gap, 2)}%</td>
          <td class="hint">第 ${fmt(o.tick, 0)} 档</td>
          <td>${mine(x) ? '<span class="hint">自己的单</span>'
            : `<button class="btn ${side === 'sell' ? 'primary' : 'outline'} sm" data-act="takeOrder" data-id="${o.id}" ${isOpen() && !isHalted() ? '' : 'disabled'}>${side === 'sell' ? '买下' : '卖给他'}</button>`}</td>
        </tr>`;
      }).join('');
    };

    const THEAD = '<tr><th>品种</th><th>挂单方</th><th class="num">剩余</th><th class="num">单价</th><th class="num">总额</th><th class="num">对比现价</th><th>挂单档</th><th style="width:96px;"></th></tr>';
    const bucketOf = k => (k === 'product' ? 'product' : (k === 'material' ? 'material' : 'other'));
    const sells = live.filter(x => x.o.side === 'sell');
    const buys = live.filter(x => x.o.side === 'buy');
    // 每个类别各自取最划算的前 40 笔，互不挤占
    const group = (arr, side) => [['product', '成品'], ['material', '原材料'], ['other', '其他']].map(g => {
      const rows = arr.filter(x => bucketOf(x.o.kind) === g[0]);
      const top = rows.slice().sort((a, b) => side === 'sell'
        ? Number(a.o.price) - Number(b.o.price)
        : Number(b.o.price) - Number(a.o.price)).slice(0, 40);
      return `<h4 class="bk-sub">${side === 'sell' ? '在售货盘' : '求购需求'} · ${g[1]}（${rows.length}）</h4>
        <table class="bk-table"><thead>${THEAD}</thead><tbody>${table(top, side)}</tbody></table>`;
    }).join('');

    return `
    <div class="bk-listing-hd">全场挂牌 <b>${live.length}</b> 笔 · 在售 <b>${sells.length}</b> · 求购 <b>${buys.length}</b></div>
    ${group(sells, 'sell')}
    ${group(buys, 'buy')}`;
  }

  function viewBourse() {
    const q = ensureOrdPick();
    const bd = myBoardRow();
    const frozen = myOpenOrders().filter(o => o.side === 'buy').reduce((a, o) => a + Number(o.escrow || 0), 0);
    const liveN = S.orders.filter(o => o.status === 'open' || o.status === 'partial').length;
    const isJudge = myRole() === 'admin' || myRole() === 'government';
    const tabs = [
      ['pub', '挂单交易台'],
      ['book', '盘口交易'],
      ['listing', '市场挂单（' + liveN + '）'],
      ['mine', '我的委托（' + myOpenOrders().length + '）'],
      ['tape', '逐笔成交'],
      ['league', '龙虎榜'],
      ['settle', '我的结算单'],
    ];
    return `
    ${phaseNotice()}
    <div class="grid c4" style="margin-bottom:16px;">
      <div class="stat"><div class="k">我的交易席位</div><div class="v">${esc(me && me.seat ? me.seat : '—')}</div><div class="n">交易所分配的场内编号</div></div>
      <div class="stat"><div class="k">可用现金</div><div class="v">${fmt(me ? me.cash : 0)}<small>G</small></div><div class="n">冻结中 ${fmt(frozen)} G</div></div>
      <div class="stat"><div class="k">持股市值</div><div class="v">${fmt(bd ? bd.eq_value : 0)}<small>G</small></div><div class="n">${listingsListed().length} 家公司已挂牌</div></div>
      <div class="stat"><div class="k">持债市值</div><div class="v">${fmt(bd ? bd.bd_value : 0)}<small>G</small></div><div class="n">${S.bonds.filter(b => b.status === 'active').length} 只债券存续中</div></div>
    </div>

    ${isHalted() ? '<div class="notice warn"><b>全场熔断停牌</b> —— 综合指数较开盘跌幅超过阈值，第 ' + (circuitUntil() + 1) + ' 档之前不产生任何撮合，但委托仍然可以挂出，复牌后按价格优先顺序成交。</div>' : ''}
    ${isAuction() ? '<div class="notice info"><b>集合竞价进行中</b> —— 现在只接受委托申报、不产生价格也不撮合；竞价结束后按"可成交数量最大"的价位一次性定出开盘价。</div>' : ''}

    ${tradableQuotes().length ? bourseTiles() : '<div class="notice warn">交易所还没有任何可交易品种。请裁判在「裁判台」开启财年。</div>'}

    <div class="bk-tabs">
      ${tabs.map(t => `<button class="${bourseTab === t[0] ? 'on' : ''}" data-act="bourseTab" data-tab="${t[0]}">${t[1]}</button>`).join('')}
    </div>

    ${bourseTab === 'pub' ? `
      <div class="bk-grid pub-grid">
        <div class="card bk-card pub-card"><h3>发布台</h3>
          <p class="hint" style="margin:0 0 12px;">卖货就选「上架货物」，买货就选「发布求购」—— 挂上去就进了全场的五档盘口，谁想吃单谁就成交。</p>
          ${bkPubHtml()}
        </div>
        <div class="card bk-card"><h3>五档盘口</h3><div id="bkBook">${q ? bkBookHtml(q.code) : ''}</div></div>
        <div class="card bk-card"><h3>K 线走势</h3><div id="bkChart">${q ? bkChartHtml(q.code) : ''}</div></div>
      </div>
      <div class="card"><h3>市场挂单总览</h3>
        <p class="hint">全场所有人的在售与求购都在这里。看中哪一笔，直接点「买下 / 卖给他」就能按对方的价成交 —— 不用谈判、不用等。</p>
        <div class="notice info">系统商户（席位 <b>S-01 ~ S-05</b>）<b>只挂卖盘、不收货</b>：你随时买得到货，但你挂出去的货系统<b>不会</b>顺手买走 —— 得等真实的贸易商 / 制造商 / 政府来接。上架只是把你的货摆上货架，成交前一直算你的（见「我的库存 → 在委托中」）。</div>
        <div class="toolbar" style="margin-bottom:12px;">
          <button class="btn" data-act="autoList" ${isOpen() ? '' : 'disabled'}>试样上架（每个品种最多挂 20%）</button>
          <span class="hint" style="margin:0;">按你的库存挑两个大品种，各挂出 20%，货不会一次性全被托管走</span>
          ${isJudge ? '<span class="grow"></span><button class="btn" data-act="bourseSeed">重新布市（系统商户挂卖盘）</button>' : ''}
        </div>
        <div id="bkListing">${bkListingHtml()}</div>
      </div>` : ''}

    ${bourseTab === 'book' && q ? `
      <div class="bk-grid">
        <div class="card bk-card"><h3>五档盘口</h3><div id="bkBook">${bkBookHtml(q.code)}</div></div>
        <div class="card bk-card"><h3>K 线走势</h3><div id="bkChart">${bkChartHtml(q.code)}</div></div>
        <div class="card bk-card"><h3>下单</h3>${bkFormHtml(q.code)}</div>
      </div>
      <div class="card"><h3>撮合引擎怎么工作</h3>
        <p class="hint">委托进入交易所后不是立刻成交，而是先挂进<b>委托簿</b>。撮合引擎每一档都做两件事：<b>先按价格排序</b>（买价最高的排在前面，卖价最低的排在前面），<b>价格相同时按挂单先后</b>。只要最优买价 ≥ 最优卖价，就立刻成交，成交价取<b>先挂单那一方的报价</b> —— 所以主动吃单的人有可能拿到比预期更划算的价格。</p>
        <div class="notice info">交易所的系统商户（席位 <b>S-01 ~ S-05</b>）在每个价位<b>只挂卖盘</b> —— 任何时刻你都买得到货，不用担心找不到对手；但它<b>不收你的货</b>，你挂出来的卖单要等真实的贸易商 / 制造商 / 政府来接。<b>成交那一刻，货会立刻出现在你的可用库存里。</b></div>
      </div>` : ''}
    ${bourseTab === 'book' && !q ? '<div class="card"><div class="empty">没有可交易的品种。</div></div>' : ''}
    ${bourseTab === 'listing' ? `<div class="card"><h3>市场挂单总览</h3>
      <p class="hint">全场所有人的在售与求购。点「买下 / 卖给他」即按对方报价成交。</p>
      <div class="notice info">系统商户（席位 <b>S-01 ~ S-05</b>，挂单方带「系统」标记）<b>只挂卖盘、不收货</b>：你随时买得到货，但你挂出去的货系统<b>不会</b>顺手买走 —— 得等真实的贸易商 / 制造商 / 政府来接。<b>买下成交的那一刻，货会立刻进你的可用库存。</b></div>
      <div id="bkListing">${bkListingHtml()}</div></div>` : ''}
    ${bourseTab === 'mine' ? `<div class="card"><h3>我的未成交委托</h3><p class="hint">上架中的货与挂着的求购单 —— <b>制造商投产完工的成品会自动挂在这里</b>（价格 = 单位成本 × 1.8，受涨跌停板约束），你可以直接改价或撤单。撤单后未成交部分的托管库存 / 冻结资金会原样退回。</p><div id="bkMine">${bkMineHtml()}</div></div>` : ''}
    ${bourseTab === 'tape' ? `<div class="card"><h3>逐笔成交${q ? ' · ' + esc(q.name) : ''}</h3><div id="bkTape">${bkTapeHtml(q ? q.code : null)}</div></div>` : ''}
    ${bourseTab === 'league' ? `<div class="card"><h3>龙虎榜 · 按交易席位统计</h3><p class="hint">每笔成交都会记在买卖双方的<b>交易席位</b>上。榜单越高说明这家公司的资金进出越频繁 —— 是判断对手在囤货还是在清仓的好线索。</p>${bkLeagueHtml()}</div>` : ''}
    ${bourseTab === 'settle' ? `<div class="card"><h3>我的交易所结算单</h3>${bkSettleHtml()}</div>` : ''}`;
  }

  // 行情每推进一档，只刷新盘口 / K 线 / 成交这些"活"的区块，不动下单表单，避免把正在填的数字冲掉
  function renderBourseLive() {
    const q = ensureOrdPick();
    if (!q) return;
    // innerHTML 整块替换后必须重新 bind：否则换出来的「撤单 / 买下 / 卖给他」按钮
    // 没有点击监听，点了完全没反应（这就是"市场挂单点买入没反应"的根因）。
    const paint = (sel, html) => {
      const el = $(sel);
      if (!el) return;
      el.innerHTML = html;
      bind(el);
    };
    paint('#bkBook', bkBookHtml(q.code));
    paint('#bkChart', bkChartHtml(q.code));
    paint('#bkTape', bkTapeHtml(q.code));
    paint('#bkMine', bkMineHtml());
    paint('#bkListing', bkListingHtml());
  }

  // ================= 交易所：上市与股权 =================
  const eqQuoteOf = ticker => quoteOf(equityCode(ticker));
  const eqPriceOf = l => {
    const q = eqQuoteOf(l.ticker);
    return q ? Number(q.price) : Number(l.ipo_price) || 0;
  };
  const eqCapOf = l => eqPriceOf(l) * (Number(l.shares_total) || 0);

  const HOLDERS = {};
  async function loadHolders(ticker) {
    try {
      const { data, error } = await cloud.database.rpc('wbs_holders', { p_ticker: ticker });
      if (error) throw error;
      HOLDERS[ticker] = data || { holders: [] };
    } catch (e) {
      HOLDERS[ticker] = { holders: [], err: errMsg(e) };
    }
    if (view === 'listing') renderView();
  }

  function eqBoardHtml() {
    const ls = listingsListed().slice().sort((a, b) => eqCapOf(b) - eqCapOf(a));
    if (!ls.length) return '<div class="empty">目前还没有公司挂牌。任何一家公司都可以在下面提交上市申请，组委会核准后即可公开交易。</div>';
    return `<table>
      <thead><tr><th>股票</th><th>公司</th><th class="num">最新价</th><th class="num">涨跌</th><th class="num">总股本</th><th class="num">总市值</th><th class="num">发行价</th><th class="num">募资</th><th>上市</th><th style="width:150px;"></th></tr></thead>
      <tbody>${ls.map(l => {
        const q = eqQuoteOf(l.ticker);
        const c = q ? chgOf(q) : { dir: 'fl', pct: 0 };
        const px = eqPriceOf(l);
        return `<tr>
          <td><b>${esc(l.ticker)}</b><div class="hint">${esc(l.name)}</div></td>
          <td>${esc(l.company_name)}${me && l.owner_id === me.owner_id ? ' <span class="pill amber">我的公司</span>' : ''}</td>
          <td class="num ${qClass(c.dir)}"><b>${fmt(px, 2)}</b></td>
          <td class="num ${qClass(c.dir)}">${qArrow(c.dir)}${signed(c.pct, 2)}%</td>
          <td class="num">${fmt(l.shares_total, 0)}</td>
          <td class="num"><b>${fmt(px * Number(l.shares_total))}</b></td>
          <td class="num">${fmt(l.ipo_price, 2)}</td>
          <td class="num">${fmt(l.raise_goal, 0)}</td>
          <td class="hint">第 ${l.listed_fy} 财年</td>
          <td>
            <button class="btn ghost sm" data-act="eqPick" data-code="${esc(l.ticker)}">股东名册</button>
            <button class="btn primary sm" data-act="ordGo" data-code="${esc(equityCode(l.ticker))}">去交易</button>
          </td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
  }

  function eqMineHtml() {
    const held = S.stock.filter(s => s.kind === 'equity' && Number(s.qty) > 0);
    if (!held.length) return '<div class="empty">你目前没有持有任何公司的股票。可以到「物品交易所」买入，或者等自己公司上市。</div>';
    const total = held.reduce((a, s) => a + Number(s.qty) * (eqQuoteOf(s.item_code) ? Number(eqQuoteOf(s.item_code).price) : 0), 0);
    return `<div class="grid c3" style="margin-bottom:14px;">
        <div class="stat"><div class="k">持股家数</div><div class="v">${held.length}<small>家</small></div></div>
        <div class="stat"><div class="k">持股市值</div><div class="v">${fmt(total)}<small>G</small></div><div class="n">按最新市价计</div></div>
        <div class="stat"><div class="k">我的席位</div><div class="v">${esc(me && me.seat ? me.seat : '—')}</div></div>
      </div>
      <table>
      <thead><tr><th>股票</th><th>公司</th><th class="num">持股数</th><th class="num">最新价</th><th class="num">市值</th><th class="num">发行价</th><th class="num">较发行价</th><th style="width:100px;"></th></tr></thead>
      <tbody>${held.map(s => {
        const l = listingOf(s.item_code);
        const q = eqQuoteOf(s.item_code);
        const px = q ? Number(q.price) : (l ? Number(l.ipo_price) : 0);
        const cost = l ? Number(l.ipo_price) : 0;
        const pct = cost > 0 ? (px - cost) / cost * 100 : 0;
        const cls = pct > 0.005 ? 'up-t' : (pct < -0.005 ? 'dn-t' : '');
        return `<tr>
          <td><b>${esc(s.item_code)}</b></td>
          <td>${esc(l ? l.company_name : '—')}</td>
          <td class="num">${fmt(s.qty, 0)}</td>
          <td class="num">${fmt(px, 2)}</td>
          <td class="num"><b>${fmt(px * Number(s.qty))}</b></td>
          <td class="num">${fmt(cost, 2)}</td>
          <td class="num ${cls}">${signed(pct, 2)}%</td>
          <td><button class="btn primary sm" data-act="ordGo" data-code="${esc(equityCode(s.item_code))}">去交易</button></td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
  }

  function eqApplyHtml() {
    const mine = S.listings.filter(l => me && l.owner_id === me.owner_id);
    const live = mine.find(l => l.status === 'pending' || l.status === 'listed');
    if (live && live.status === 'listed') {
      const q = eqQuoteOf(live.ticker);
      const px = Number(live.ipo_price) || 0;
      const cur = q ? Number(q.price) : px;
      const c = q ? chgOf(q) : { dir: 'fl', pct: 0 };
      const cash = Number(me.cash) || 0;
      const divCap = Math.max(1, Math.floor(cash * 0.5));
      return `<div class="notice info">你的公司已经挂牌 —— <b>${esc(live.name)}（${esc(live.ticker)}）</b>，发行价 ${fmt(px, 2)} G，最新价 <b class="${qClass(c.dir)}">${fmt(cur, 2)} G</b>，总市值 ${fmt(cur * Number(live.shares_total))} G。</div>
      <div class="grid c3" style="margin:14px 0;">
        <div class="stat"><div class="k">本次募资</div><div class="v">${fmt(live.raise_goal, 0)}<small>G</small></div><div class="n">${fmt(live.shares_float, 0)} 股公开发行</div></div>
        <div class="stat"><div class="k">自持股份</div><div class="v">${fmt(stockQty('equity', live.ticker), 0)}<small>股</small></div><div class="n">其余在市场上流通</div></div>
        <div class="stat"><div class="k">定价依据</div><div class="v" style="font-size:14px;">${esc(live.basis || '—')}</div></div>
      </div>
      <div class="card" style="margin:0;">
        <h3>派发红利</h3>
        <p class="hint">把公司现金按<b>持股比例</b>分给全体股东（你自己也按同样比例拿回一份，所以真正付出的只有外部股东那一部分）。分红会向全场公告，是拉抬股价与公司声望最直接的方式。当前公司现金 <b>${fmt(cash)} G</b>。</p>
        <div class="toolbar">
          <input id="dvAmt" type="number" min="1" step="100" value="1000" style="max-width:200px;">
          <button class="btn primary" data-act="divPay" data-ticker="${esc(live.ticker)}" ${isOpen() ? '' : 'disabled'}>派发红利</button>
          <span class="hint" style="margin:0;">建议不超过 ${fmt(divCap)} G（现金的一半）</span>
        </div>
        ${(S.ledger || []).filter(x => x.kind === 'dividend').length
          ? `<div class="hint" style="margin-top:10px;">本财年分红流水：${(S.ledger || []).filter(x => x.kind === 'dividend').slice(0, 3).map(x => esc(x.detail)).join('；')}</div>`
          : ''}
      </div>`;
    }
    if (live && live.status === 'pending') {
      return `<div class="notice warn">你的上市申请正在等待组委会核准 —— <b>${esc(live.ticker)}</b>，拟定发行价 ${fmt(live.ipo_price, 2)} G，拟募资 ${fmt(live.raise_goal, 0)} G。核准后自动挂牌并开始交易。</div>`;
    }
    if (mine.some(l => l.status === 'rejected')) {
      const r = mine.filter(l => l.status === 'rejected')[0];
      return `<div class="notice warn">上次上市申请（${esc(r.ticker)}）未通过：${esc(r.note || '组委会未说明原因')}。可以修改参数后重新提交。</div>` + eqApplyForm();
    }
    return eqApplyForm();
  }

  function eqApplyForm() {
    const bd = myBoardRow();
    const net = bd ? Number(bd.net_worth) || 0 : 0;
    return `<div class="card"><h3>提交上市申请</h3>
      <p class="hint">上市后你的公司会变成一只<b>可以公开交易的股票</b>：发行价由「当前净资产 ÷ 总股本」自动定出，你卖出多少比例的股份就募到多少现金，剩下部分自己持有。上市后别人可以买你的股票、你也可以回购；每财年还能自主决定分红。</p>
      <div class="notice info">当前净资产 <b>${fmt(net)} G</b>。总股本填得越大，每股价格就越低 —— 股数多便于小额交易，股数少则股价高、看起来"贵"。</div>
      <div class="grid c2">
        <div class="field"><label>股票代码（2–6 位大写字母或数字）</label><input id="ipTicker" maxlength="6" placeholder="例如 BIZLAND" autocomplete="off"></div>
        <div class="field"><label>股票简称（2–8 字）</label><input id="ipName" maxlength="8" placeholder="例如 商业机械"></div>
        <div class="field"><label>总股本（股）</label><input id="ipShares" type="number" min="100" step="100" value="10000"></div>
        <div class="field"><label>公开发行比例（5% – 50%）</label><input id="ipFloat" type="number" min="5" max="50" step="1" value="30"></div>
      </div>
      <button class="btn primary" data-act="ipoApply" ${isOpen() ? '' : 'disabled'}>提交上市申请</button>
      <p class="hint" style="margin-top:10px;">提交后进入组委会审批队列，核准即挂牌交易。每家公司同时只能有一份在审或已挂牌的申请。</p>
    </div>`;
  }

  function eqReviewHtml() {
    const pend = S.listings.filter(l => l.status === 'pending');
    if (!pend.length) return '<div class="empty">当前没有待审批的上市申请。</div>';
    return `<table>
      <thead><tr><th>股票</th><th>申请人</th><th class="num">定价</th><th class="num">总股本</th><th class="num">募资</th><th>定价依据</th><th style="width:230px;">核准</th></tr></thead>
      <tbody>${pend.map(l => `<tr>
        <td><b>${esc(l.ticker)}</b><div class="hint">${esc(l.name)}</div></td>
        <td>${esc(l.company_name)}</td>
        <td class="num"><b>${fmt(l.ipo_price, 2)}</b></td>
        <td class="num">${fmt(l.shares_total, 0)}</td>
        <td class="num">${fmt(l.raise_goal, 0)}</td>
        <td class="hint">${esc(l.basis || '—')}</td>
        <td><div class="toolbar" style="margin:0;">
          <input class="qty" id="irp-${l.id}" type="number" step="0.01" value="${raw(l.ipo_price)}" title="核准发行价，可在定价的 70% ~ 130% 之间调整">
          <button class="btn primary sm" data-act="ipoReview" data-id="${l.id}" data-ok="1">核准挂牌</button>
          <button class="btn danger sm" data-act="ipoReview" data-id="${l.id}" data-ok="0">驳回</button>
        </div></td>
      </tr>`).join('')}</tbody>
    </table>`;
  }

  function eqHoldersHtml() {
    if (!eqPick) return '';
    const h = HOLDERS[eqPick];
    const l = listingOf(eqPick);
    if (!h) return `<div class="card"><h3>股东名册 · ${esc(eqPick)}</h3><div class="empty">正在调取…</div></div>`;
    if (h.err) return `<div class="card"><h3>股东名册 · ${esc(eqPick)}</h3><div class="empty">${esc(h.err)}</div></div>`;
    const rows = (h.holders || []);
    return `<div class="card"><h3>股东名册 · ${esc(l ? l.name : eqPick)}（${esc(eqPick)}）<span class="pill blue">公开信息</span></h3>
      <p class="hint">交易所公示的持股结构。掌握谁在买你的股票，比盯着价格更有用 —— 大股东是谁，往往决定了下一轮谈判的筹码。</p>
      ${rows.length ? `<table>
        <thead><tr><th style="width:52px;">排名</th><th>股东</th><th>角色</th><th class="num">持股数</th><th class="num">持股比例</th><th style="width:190px;">占比</th></tr></thead>
        <tbody>${rows.map((r, i) => `<tr>
          <td><b>${i + 1}</b></td>
          <td>${esc(r.company_name)}${me && r.company_name === me.company_name ? ' <span class="pill amber">我</span>' : ''}</td>
          <td class="hint">${esc(ROLE_LABEL[r.role] || r.role || '—')}</td>
          <td class="num">${fmt(r.qty, 0)}</td>
          <td class="num"><b>${fmt(r.pct, 2)}%</b></td>
          <td><div class="bar teal"><i style="width:${Math.min(100, Number(r.pct) || 0).toFixed(1)}%"></i></div></td>
        </tr>`).join('')}</tbody>
      </table>` : '<div class="empty">暂无持股记录。</div>'}
      <div class="toolbar" style="margin-top:12px;"><button class="btn ghost sm" data-act="eqPick" data-code="">关闭名册</button></div>
    </div>`;
  }

  function viewListing() {
    const canReview = myRole() === 'admin' || myRole() === 'government';
    const tabs = [['board', '上市公司市值榜'], ['mine', '我的持股'], ['apply', '上市申请']];
    const pend = S.listings.filter(l => l.status === 'pending').length;
    return `
    ${phaseNotice()}
    <div class="grid c4" style="margin-bottom:16px;">
      <div class="stat"><div class="k">挂牌公司</div><div class="v">${listingsListed().length}<small>家</small></div><div class="n">另有 ${pend} 份申请待审</div></div>
      <div class="stat"><div class="k">全市场总市值</div><div class="v">${fmt(listingsListed().reduce((a, l) => a + eqCapOf(l), 0))}<small>G</small></div><div class="n">发行价 × 总股本</div></div>
      <div class="stat"><div class="k">股权指数 KEI</div><div class="v">${(() => { const i = (S.index || []).find(x => x.code === 'KEI'); return i ? fmt(i.value, 2) : '—'; })()}</div><div class="n">以发行价为 1000 点基准</div></div>
      <div class="stat"><div class="k">我的持股</div><div class="v">${S.stock.filter(s => s.kind === 'equity' && Number(s.qty) > 0).length}<small>家</small></div><div class="n">持仓市值 ${fmt(myBoardRow() ? myBoardRow().eq_value : 0)} G</div></div>
    </div>

    <div class="card">
      <h3>为什么要上市</h3>
      <p class="hint">
        没上市之前，公司值多少钱只有裁判和你自己知道。上市之后，你的公司变成<b>一只会被公开报价的股票</b> ——
        别人能买你，你也能回购；股价涨了，你的净资产跟着涨，排行榜上的位置也跟着动。<br>
        <b>募资是真的到账的</b>：你卖出 30% 股份，就按净资产拿到对应比例的现金，可以立刻拿去扩产、囤货或者打商战。代价是你从此要为股价负责 —— 公司亏了，股价跌，股东会用脚投票。
      </p>
      <div class="notice info">发行价由 <b>当前净资产 ÷ 总股本</b> 自动算出，组委会核准时只能在 ±30% 范围内微调，谁都别想凭一张嘴把公司定成天价。</div>
    </div>

    <div class="bk-tabs">
      ${tabs.map(t => `<button class="${eqTab === t[0] ? 'on' : ''}" data-act="eqTab" data-tab="${t[0]}">${t[1]}</button>`).join('')}
    </div>

    ${eqTab === 'board' ? `<div class="card"><h3>上市公司市值榜</h3>${eqBoardHtml()}</div>` : ''}
    ${eqTab === 'mine' ? `<div class="card"><h3>我的持股</h3>${eqMineHtml()}</div>` : ''}
    ${eqTab === 'apply' ? eqApplyHtml() : ''}
    ${eqHoldersHtml()}
    ${canReview ? `<div class="card"><h3>组委会审批队列 · 新股挂牌</h3>
      <p class="hint">核准前可以调整发行价（限定在原定价的 70% ~ 130%）。核准后立刻生成行情、给创始人记上自持股份，并把募资打进公司账户。</p>
      ${eqReviewHtml()}</div>` : ''}`;
  }

  // ================= 交易所：企业债市场 =================
  const RATING_PILL = { AAA: 'ok', AA: 'teal', A: 'blue', BBB: 'amber' };
  const BOND_STATUS = { pending: '待审批', active: '认购与存续中', matured: '已到期兑付', default: '已违约', rejected: '未获批准' };
  const BOND_PILL = { pending: 'amber', active: 'teal', matured: '', default: 'danger', rejected: '' };

  function bondBoardHtml() {
    const list = S.bonds.filter(b => b.status !== 'pending' && b.status !== 'rejected')
      .slice().sort((a, b) => (a.status === 'active' ? -1 : 1) - (b.status === 'active' ? -1 : 1) || a.id - b.id);
    if (!list.length) return '<div class="empty">目前市场上还没有企业债。任何一家公司都可以在下面申请发行。</div>';
    return `<table>
      <thead><tr><th>债券</th><th>发行人</th><th>评级</th><th class="num">面值</th><th class="num">票面利率</th><th class="num">认购进度</th><th class="num">到期财年</th><th>状态</th><th style="width:200px;"></th></tr></thead>
      <tbody>${list.map(b => {
        const left = Number(b.total) - Number(b.subscribed);
        const pct = Number(b.total) > 0 ? Number(b.subscribed) / Number(b.total) * 100 : 0;
        const mine = S.bonds && S.stock.some(s => s.kind === 'bond' && s.item_code === itemOfCode(b.code) && Number(s.qty) > 0);
        return `<tr>
          <td><b>${esc(b.code)}</b><div class="hint">${esc(b.name)}</div></td>
          <td>${esc(b.issuer_name)}${me && b.issuer_id === me.owner_id ? ' <span class="pill amber">我发行</span>' : ''}</td>
          <td><span class="pill ${RATING_PILL[b.rating] || ''}">${esc(b.rating)}</span></td>
          <td class="num">${fmt(b.face, 2)}</td>
          <td class="num"><b>${fmt(Number(b.coupon) * 100, 1)}%</b></td>
          <td class="num">${fmt(b.subscribed, 0)}<span class="hint"> / ${fmt(b.total, 0)}</span>${left > 0 ? `<div class="bar amber" style="margin-top:4px;"><i style="width:${pct.toFixed(1)}%"></i></div>` : ''}</td>
          <td class="num">第 ${b.mature_fy} 财年</td>
          <td><span class="pill ${BOND_PILL[b.status] || ''}">${BOND_STATUS[b.status] || b.status}</span></td>
          <td>${b.status === 'active' && left > 0 && (!me || b.issuer_id !== me.owner_id)
            ? `<div class="toolbar" style="margin:0;">
                 <input class="qty" id="bs-${b.id}" type="number" min="1" max="${left}" step="1" value="${Math.min(left, 10)}">
                 <button class="btn primary sm" data-act="bondSub" data-id="${b.id}" ${isOpen() ? '' : 'disabled'}>认购</button>
               </div>`
            : (mine ? '<span class="hint">我已持有</span>' : '')}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
  }

  function bondMineHtml() {
    const held = S.stock.filter(s => s.kind === 'bond' && Number(s.qty) > 0);
    if (!held.length) return '<div class="empty">你目前没有持有任何企业债。在「在发债券」里认购，或者到交易所买别人挂出来的。</div>';
    const total = held.reduce((a, s) => {
      const q = quoteOf('BND:' + s.item_code);
      return a + Number(s.qty) * (q ? Number(q.price) : 0);
    }, 0);
    return `<div class="grid c2" style="margin-bottom:14px;">
        <div class="stat"><div class="k">持债只数</div><div class="v">${held.length}<small>只</small></div></div>
        <div class="stat"><div class="k">持债市值</div><div class="v">${fmt(total)}<small>G</small></div><div class="n">按最新报价计</div></div>
      </div>` + `<table>
      <thead><tr><th>债券</th><th>发行人</th><th>评级</th><th class="num">面值</th><th class="num">票面利率</th><th class="num">持有张数</th><th class="num">最新报价</th><th class="num">市值</th><th class="num">到期财年</th><th style="width:100px;"></th></tr></thead>
      <tbody>${held.map(s => {
        const b = bondOfCode('BND:' + s.item_code);
        const q = quoteOf('BND:' + s.item_code);
        const px = q ? Number(q.price) : (b ? Number(b.face) : 0);
        return `<tr>
          <td><b>${esc(s.item_code)}</b><div class="hint">${esc(b ? b.name : '—')}</div></td>
          <td>${esc(b ? b.issuer_name : '—')}</td>
          <td>${b ? `<span class="pill ${RATING_PILL[b.rating] || ''}">${esc(b.rating)}</span>` : '—'}</td>
          <td class="num">${fmt(b ? b.face : 0, 2)}</td>
          <td class="num">${b ? fmt(Number(b.coupon) * 100, 1) + '%' : '—'}</td>
          <td class="num"><b>${fmt(s.qty, 0)}</b></td>
          <td class="num">${fmt(px, 2)}</td>
          <td class="num"><b>${fmt(px * Number(s.qty))}</b></td>
          <td class="num">第 ${b ? b.mature_fy : '—'} 财年</td>
          <td><button class="btn primary sm" data-act="ordGo" data-code="${esc('BND:' + s.item_code)}">去交易</button></td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
  }

  function bondApplyHtml() {
    const mine = S.bonds.filter(b => me && b.issuer_id === me.owner_id);
    const live = mine.find(b => b.status === 'pending' || b.status === 'active');
    const hist = mine.filter(b => b.status === 'matured' || b.status === 'default' || b.status === 'rejected');
    const histHtml = hist.length ? `<div class="card"><h3>我的历史发债</h3><table>
      <thead><tr><th>债券</th><th>评级</th><th class="num">面值</th><th class="num">利率</th><th class="num">发行张数</th><th>状态</th></tr></thead>
      <tbody>${hist.map(b => `<tr>
        <td><b>${esc(b.code)}</b></td>
        <td><span class="pill ${RATING_PILL[b.rating] || ''}">${esc(b.rating)}</span></td>
        <td class="num">${fmt(b.face, 2)}</td>
        <td class="num">${fmt(Number(b.coupon) * 100, 1)}%</td>
        <td class="num">${fmt(b.total, 0)}</td>
        <td><span class="pill ${BOND_PILL[b.status] || ''}">${BOND_STATUS[b.status] || b.status}</span></td>
      </tr>`).join('')}</tbody></table></div>` : '';
    if (live) {
      return `<div class="notice info">你有一笔 ${BOND_STATUS[live.status]} 的债券 —— <b>${esc(live.code)}</b>，面值 ${fmt(live.face, 2)} G，利率 ${fmt(Number(live.coupon) * 100, 1)}%，已认购 ${fmt(live.subscribed, 0)} / ${fmt(live.total, 0)} 张。募资款已进入公司账户，每个财年末需要付息，到期还本。</div>` + histHtml;
    }
    return `<div class="card"><h3>申请发行企业债</h3>
      <p class="hint">发债和上市不一样：<b>不用出让任何股份</b>，但钱是要还的。投资人按面值认购，你的公司立刻拿到募资款；此后每个财年末要按票面利率付息，到期偿还全部本金。评级越高，组委会核准的利率通常越低。</p>
      <div class="notice warn">如果到期时公司现金不足以还本，会被判定为<b>违约</b>，投资人只能按比例拿到部分本金 —— 这会直接写进全场公告。借钱之前先想清楚下一财年还得起还不起。</div>
      <div class="grid c2">
        <div class="field"><label>每张面值（1 – 10000 G）</label><input id="bdFace" type="number" min="1" max="10000" step="10" value="100"></div>
        <div class="field"><label>票面利率（1% – 30%）</label><input id="bdCoupon" type="number" min="1" max="30" step="0.5" value="8"></div>
        <div class="field"><label>发行张数（至少 10 张）</label><input id="bdTotal" type="number" min="10" step="10" value="200"></div>
        <div class="field"><label>期限（1 – 5 个财年）</label><input id="bdMature" type="number" min="1" max="5" step="1" value="2"></div>
      </div>
      <div class="field"><label>用途说明（会写入公告）</label><input id="bdReason" maxlength="60" placeholder="例如：扩建第二条产线"></div>
      <button class="btn primary" data-act="bondApply" ${isOpen() ? '' : 'disabled'}>提交发债申请</button>
    </div>` + histHtml;
  }

  function bondReviewHtml() {
    const pend = S.bonds.filter(b => b.status === 'pending');
    if (!pend.length) return '<div class="empty">当前没有待审批的发债申请。</div>';
    return `<table>
      <thead><tr><th>债券</th><th>发行人</th><th class="num">面值 × 张数</th><th class="num">申报利率</th><th>用途</th><th style="width:300px;">核准</th></tr></thead>
      <tbody>${pend.map(b => `<tr>
        <td><b>${esc(b.code)}</b><div class="hint">${esc(b.name)}</div></td>
        <td>${esc(b.issuer_name)}</td>
        <td class="num">${fmt(b.face, 2)} × ${fmt(b.total, 0)}<div class="hint">上限 ${fmt(Number(b.face) * Number(b.total), 0)} G</div></td>
        <td class="num">${fmt(Number(b.coupon) * 100, 1)}%</td>
        <td class="hint">${esc(b.reason || '—')}</td>
        <td><div class="toolbar" style="margin:0;">
          <input class="qty" id="brc-${b.id}" type="number" min="0.5" max="35" step="0.5" value="${raw(Number(b.coupon) * 100, 1)}" title="核准利率（%）">
          <select id="brr-${b.id}">
            ${['AAA', 'AA', 'A', 'BBB'].map(r => `<option value="${r}" ${r === 'A' ? 'selected' : ''}>${r}</option>`).join('')}
          </select>
          <button class="btn primary sm" data-act="bondReview" data-id="${b.id}" data-ok="1">核准发行</button>
          <button class="btn danger sm" data-act="bondReview" data-id="${b.id}" data-ok="0">驳回</button>
        </div></td>
      </tr>`).join('')}</tbody>
    </table>`;
  }

  function viewBonds() {
    const canReview = myRole() === 'admin' || myRole() === 'government';
    const tabs = [['board', '在发债券'], ['mine', '我的持债'], ['apply', '发债申请']];
    // 顺便把 KEI 之外的债券指数也算给用户看
    const active = S.bonds.filter(b => b.status === 'active');
    const issued = active.reduce((a, b) => a + Number(b.face) * Number(b.subscribed), 0);
    return `
    ${phaseNotice()}
    <div class="grid c4" style="margin-bottom:16px;">
      <div class="stat"><div class="k">存续债券</div><div class="v">${active.length}<small>只</small></div><div class="n">${S.bonds.filter(b => b.status === 'pending').length} 只待审批</div></div>
      <div class="stat"><div class="k">已募资金额</div><div class="v">${fmt(issued, 0)}<small>G</small></div><div class="n">面值 × 已认购张数</div></div>
      <div class="stat"><div class="k">我的持债</div><div class="v">${S.stock.filter(s => s.kind === 'bond' && Number(s.qty) > 0).length}<small>只</small></div><div class="n">市值 ${fmt(myBoardRow() ? myBoardRow().bd_value : 0)} G</div></div>
      <div class="stat"><div class="k">当前财年</div><div class="v">第 ${fy()} 财年</div><div class="n">每个财年末由组委会执行付息与兑付</div></div>
    </div>

    <div class="card">
      <h3>债券和股票有什么区别</h3>
      <p class="hint">
        <b>股票</b>是把自己的公司卖一部分出去 —— 不用还，但要分权、要分红，股价跌了股东会跑。<br>
        <b>债券</b>是向全场借钱 —— 股份一分不让，但<b>本息必须还</b>：每财年末按票面利率付息，到期一次性还本。还不上就是违约，全场都会看到你的公告。<br>
        对投资人来说，债券的收益是<b>写死在合同里的</b>，不看公司经营好坏 —— 只要不违约，拿到的就是票面利率。所以什么时候买债、什么时候买股，本身就是一道题。
      </p>
      <div class="notice info">债券同样在交易所挂牌，可以在「物品交易所」按市场价买卖转让 —— 急用钱时不必等到期。</div>
    </div>

    <div class="bk-tabs">
      ${tabs.map(t => `<button class="${bondTab === t[0] ? 'on' : ''}" data-act="bondTab" data-tab="${t[0]}">${t[1]}</button>`).join('')}
    </div>

    ${bondTab === 'board' ? `<div class="card"><h3>在发债券</h3>${bondBoardHtml()}</div>` : ''}
    ${bondTab === 'mine' ? `<div class="card"><h3>我的持债</h3>${bondMineHtml()}</div>` : ''}
    ${bondTab === 'apply' ? bondApplyHtml() : ''}
    ${canReview ? `<div class="card"><h3>组委会审批队列 · 企业债发行</h3>
      <p class="hint">核准时可以调整票面利率与信用评级。评级与利率会直接公示给全场投资人，建议让高评级对应低利率。</p>
      ${bondReviewHtml()}</div>` : ''}`;
  }

  // 净资产由服务端 wbs_realtime_board() 每次现算（现金 + 外币按当日汇率折算 + 库存估值），
  // 不依赖 wbs_players.total_asset 这个只在结算时刷新的缓存字段，因此任何交易后立刻可见。
  function boardRow(ownerId) {
    return S.board.find(b => b.owner_id === ownerId) || null;
  }

  function netWorthOf(p) {
    if (!p) return 0;
    const b = boardRow(p.owner_id);
    if (b) return Number(b.net_worth) || 0;
    // 兜底：服务端盘口尚未返回时，只能算现金与外币（库存受行级权限限制，看不到别队的）
    const cashOnly = Number(p.cash || 0)
      + Number(p.cash_a || 0) * fxRate('A')
      + Number(p.cash_b || 0) * fxRate('B');
    return me && p.owner_id === me.owner_id ? cashOnly + myStockValue() : cashOnly;
  }

  function boardRanked() {
    if (S.board.length) {
      return S.board.slice().sort((a, b) =>
        Number(b.net_worth) - Number(a.net_worth)
        || String(a.company_name || '').localeCompare(String(b.company_name || ''), 'zh'));
    }
    // 兜底：服务端盘口尚未返回时，用本地可见数据拼出同样的结构（别队库存受行级权限限制，只能算自己的）
    return S.players.map(p => {
      const fx = Number(p.cash_a || 0) * fxRate('A') + Number(p.cash_b || 0) * fxRate('B');
      const stock = me && p.owner_id === me.owner_id ? myStockValue() : 0;
      return {
        owner_id: p.owner_id, company_name: p.company_name, role: p.role,
        cash: Number(p.cash || 0), cash_a: Number(p.cash_a || 0), cash_b: Number(p.cash_b || 0),
        fx_value: fx, mat_value: stock, prod_value: 0,
        net_worth: Number(p.cash || 0) + fx + stock,
      };
    }).sort((a, b) => b.net_worth - a.net_worth);
  }

  function myBoardRow() {
    return me ? boardRow(me.owner_id) : null;
  }

  function myStockValue(fy) {
    const b = myBoardRow();
    if (b) return (Number(b.mat_value) || 0) + (Number(b.prod_value) || 0);
    let v = 0;
    S.stock.forEach(s => {
      if (s.kind === 'material') {
        const m = S.materials.find(x => x.code === s.item_code);
        v += Number(s.qty) * Number(m ? m.price : 0);
      } else {
        v += Number(s.qty) * prodCost(s.item_code);
      }
    });
    return v;
  }

  function myNetWorth() {
    const b = myBoardRow();
    if (b) return Number(b.net_worth) || 0;
    return Number(me ? me.cash : 0) + myFxValue() + myStockValue();
  }

  function myRank() {
    const list = boardRanked();
    const idx = list.findIndex(p => me && p.owner_id === me.owner_id);
    return idx < 0 ? '—' : (idx + 1) + ' / ' + list.length;
  }

  function unreadMail() {
    return S.mail.filter(m => me && m.recipient_id === me.owner_id && !m.is_read).length;
  }

  function myFxValue() {
    if (!me) return 0;
    return Number(me.cash_a || 0) * fxRate('A') + Number(me.cash_b || 0) * fxRate('B');
  }

  function roleGuide() {
    const r = myRole();
    if (r === 'government') return `<div class="notice info"><b>政府视角</b>：先看「政府台」顶部的<b>宏观体检报告</b> —— 国库有多少钱、物价指数跑到哪了、收支是结余还是赤字。手里的工具是 <b>采购招标</b>（主动开价买货）、<b>政策法令</b>（补贴 / 出口奖励 / 原料配额 / 基建）、<b>平准操作</b>（国库收储抛储动价格）。另外你还是裁判方 —— <b>强制执行贷款</b>、<b>调停战争</b>、<b>解除贸易战</b>都在「借贷中心」与「商战与制裁」里裁定。</div>`;
    if (r === 'manufacturer') return `<div class="notice info"><b>制造商路线</b>：原材料市场买料 → 研发中心设计产品（须政府审批）→ 生产中心投产（自动挂到交易所）→ 到交易所「挂单交易台」点「上架货物」卖货，或用「合同中心」定向卖。周转不开时可到「借贷中心」融资，也可以在「市场公告」里挂出合作策略招揽贸易商。</div>`;
    if (r === 'trader') return `<div class="notice info"><b>贸易商路线</b>：到交易所「挂单交易台」用「发布求购」收货、或到「市场挂单」直接吃单 → 路演中心提交方案 → 政府市场交付收外币 → 外汇兑换换回金币。想指定一家公司独占成交就去「合同中心」。缺钱就借贷，被抢就宣战。</div>`;
    if (r === 'media') return `<div class="notice info"><b>媒体视角</b>：发布资讯、承接收费广告，用舆论影响全场判断。也可以出借资金放贷收息。</div>`;
    return `<div class="notice info"><b>组委会视角</b>：开启与结算财年、调控各队资金、核查任意队伍账目；并在「借贷中心」「商战与制裁」里裁定强制执行与调停冲突。</div>`;
  }

  // ---------- 视图：总览 ----------
  function viewOverview() {
    const b = myBoardRow();
    const cash = b ? Number(b.cash) : Number(me.cash);
    const fx = b ? Number(b.fx_value) : myFxValue();
    const sv = b ? (Number(b.mat_value) || 0) + (Number(b.prod_value) || 0) : myStockValue();
    const nw = b ? Number(b.net_worth) : (cash + fx + sv);
    const demandRows = S.demand.map(d => {
      const unit = d.market === 'export'
        ? Number(d.price) * Number(S.game.exchange_rate) * (1 - Number(S.game.tariff_rate))
        : Number(d.price);
      return { ...d, unit };
    });

    return `
    ${phaseNotice()}
    ${roleGuide()}
    <div class="grid c4" style="margin-bottom:18px;">
      <div class="stat"><div class="k">金币</div><div class="v">${fmt(cash)}<small>G</small></div><div class="n">通用结算货币</div></div>
      <div class="stat"><div class="k">外币资产</div><div class="v">${fmt(fx)}<small>G</small></div><div class="n">★ ${fmt(me.cash_a)} ／ ◆ ${fmt(me.cash_b)}</div></div>
      <div class="stat"><div class="k">净资产</div><div class="v">${fmt(nw)}<small>G</small></div><div class="n">含库存估值 ${fmt(sv)} G</div></div>
      <div class="stat"><div class="k">当前排名</div><div class="v">${myRank()}</div><div class="n">按净资产实时排序</div></div>
    </div>

    <div class="card">
      <h3>本财年行情速览</h3>
      <p class="hint">内销市场只是保底渠道，价格由系统给出；真正的大单来自政府 —— 去「路演中心」提交方案争取政府报价。</p>
      <table>
        <thead><tr><th>产品</th><th>市场</th><th class="num">总需求</th><th class="num">剩余需求</th><th class="num">报价</th><th class="num">折算后单价</th></tr></thead>
        <tbody>
          ${demandRows.length ? demandRows.map(d => `
            <tr>
              <td>${esc(prodName(d.product_code))}</td>
              <td><span class="pill ${d.market === 'export' ? 'amber' : 'blue'}">${d.market === 'export' ? '出口' : '内销'}</span></td>
              <td class="num">${fmt(d.demand_total)}</td>
              <td class="num">${fmt(d.demand_left)}</td>
              <td class="num">${fmt(d.price)}${d.market === 'export' ? ' 外币' : ''}</td>
              <td class="num"><b>${fmt(d.unit)}</b> G</td>
            </tr>`).join('') : `<tr><td colspan="6" class="empty">本财年尚未生成市场需求</td></tr>`}
        </tbody>
      </table>
    </div>

    <div class="grid c2">
      <div class="card">
        <h3>我的库存</h3>
        <p class="hint">原材料与成品 · 「在委托中」= 挂在交易所还没卖掉的那部分</p>
        ${canTrade() ? stockTable() : `<div class="empty">你的角色不持有商品库存</div>`}
      </div>
      <div class="card">
        <h3>最新情报</h3>
        <p class="hint">媒体发布与广告投放</p>
        ${S.news.slice(0, 4).map(n => `
          <div class="feed-item">
            <h4>${esc(n.title)}</h4>
            <div class="meta">${esc(n.author || '系统')} · 财年 ${n.fiscal_year}${n.kind === 'ad' ? ' · 广告' : ''}</div>
          </div>`).join('') || `<div class="empty">暂时还没有情报</div>`}
      </div>
    </div>`;
  }

  // 某个商品正挂在交易所卖单里、被托管走的那部分数量（还没成交的）。
  // 「上架」会先把货从「我的库存」划到委托单上托管 —— 所以"可用库存"会立刻变小。
  // 货并没有丢，只是换了个地方放着；这里把它单独算出来显示，免得看库存时以为货没了。
  function escrowQty(kind, item) {
    if (!me || (kind !== 'material' && kind !== 'product')) return 0;
    const code = (kind === 'material' ? 'MAT:' : 'PRD:') + item;
    return S.orders
      .filter(o => o.owner_id === me.owner_id && o.side === 'sell' && o.code === code
        && (o.status === 'open' || o.status === 'partial'))
      .reduce((a, o) => a + Math.max(0, Number(o.qty) - Number(o.filled)), 0);
  }

  function stockTable() {
    const keep = s => Number(s.qty) > 0 || escrowQty(s.kind, s.item_code) > 0;
    const mats = S.stock.filter(s => s.kind === 'material' && keep(s));
    const prods = S.stock.filter(s => s.kind === 'product' && keep(s));
    const eqs = S.stock.filter(s => s.kind === 'equity' && Number(s.qty) > 0);
    const bds = S.stock.filter(s => s.kind === 'bond' && Number(s.qty) > 0);
    if (!mats.length && !prods.length && !eqs.length && !bds.length) return `<div class="empty">库存为空。先去采购原材料或从市场进货。</div>`;
    // 「在委托中」那一格：有托管量就亮出来，没有就留一个破折号，保持表格干净
    const escCell = x => {
      const m = escrowQty(x.kind, x.item_code);
      return m > 0
        ? `<td class="num"><span class="pill amber" title="已挂到交易所、还没成交的部分。撤单后原样退回可用库存。">${fmt(m)}</span></td>`
        : '<td class="num hint">—</td>';
    };
    return `
      <table>
        <thead><tr><th>类别</th><th>项目</th><th class="num">可用库存</th><th class="num">在委托中</th><th class="num">估值</th></tr></thead>
        <tbody>
          ${mats.map(s => {
            const m = S.materials.find(x => x.code === s.item_code) || { price: 0 };
            return `<tr><td><span class="pill">原材料</span></td><td>${esc(matName(s.item_code))}</td>
              <td class="num">${fmt(s.qty)}</td>${escCell(s)}<td class="num">${fmt(Number(s.qty) * Number(m.price))}</td></tr>`;
          }).join('')}
          ${prods.map(s => `<tr><td><span class="pill teal">成品</span></td><td>${esc(prodName(s.item_code))}</td>
              <td class="num">${fmt(s.qty)}</td>${escCell(s)}<td class="num">${fmt(Number(s.qty) * prodCost(s.item_code))}</td></tr>`).join('')}
          ${eqs.map(s => {
            const q = quoteOf(equityCode(s.item_code));
            const px = q ? Number(q.price) : 0;
            return `<tr><td><span class="pill amber">股权</span></td><td>${esc(s.item_code)} <span class="hint">${esc((listingOf(s.item_code) || {}).name || '')}</span></td>
              <td class="num">${fmt(s.qty, 0)}</td><td class="num hint">—</td><td class="num">${fmt(Number(s.qty) * px)}</td></tr>`;
          }).join('')}
          ${bds.map(s => {
            const q = quoteOf('BND:' + s.item_code);
            const px = q ? Number(q.price) : 0;
            return `<tr><td><span class="pill blue">债券</span></td><td>${esc(s.item_code)}</td>
              <td class="num">${fmt(s.qty, 0)}</td><td class="num hint">—</td><td class="num">${fmt(Number(s.qty) * px)}</td></tr>`;
          }).join('')}
        </tbody>
      </table>`;
  }

  // ---------- 视图：原材料市场 ----------
  function viewMarket() {
    const cash = Number(me.cash);
    return `
    ${phaseNotice()}
    <div class="card">
      <h3>原材料市场</h3>
      <p class="hint">每财年的供给是<b>限量</b>的，先到先得；但<b>成交价随行情浮动</b> —— 下面的现货价由行情中心每 6 秒刷新一次，涨了得多掏钱，跌了就是抄底的机会。当前现金：<b>${fmt(cash)} G</b></p>
      <table>
        <thead><tr><th>原材料</th><th class="num">现货价</th><th class="num">涨跌</th><th class="num">目录价</th><th class="num">本财年供给</th><th class="num">剩余</th><th style="width:130px;">供给进度</th><th class="num">我的库存</th><th style="width:200px;">购买</th></tr></thead>
        <tbody>
          ${S.materials.map(m => {
            const pct = Number(m.supply_total) ? Math.max(0, Number(m.supply_left) / Number(m.supply_total) * 100) : 0;
            const q = quoteOf('MAT:' + m.code);
            const spot = q ? Number(q.price) : Number(m.price);
            const c = q ? chgOf(q) : { pct: 0, dir: 'fl' };
            return `<tr>
              <td><b>${esc(m.name)}</b>${q ? '' : ' <span class="hint">未开盘</span>'}</td>
              <td class="num ${qClass(c.dir)}"><b>${fmt(spot, 2)}</b></td>
              <td class="num ${qClass(c.dir)}">${qArrow(c.dir)} ${signed(c.pct, 2)}%</td>
              <td class="num" style="color:var(--muted);">${fmt(m.price)}</td>
              <td class="num">${fmt(m.supply_total)}</td>
              <td class="num">${fmt(m.supply_left)}</td>
              <td><div class="bar ${pct < 25 ? 'danger' : pct < 60 ? 'amber' : 'teal'}"><i style="width:${pct}%"></i></div></td>
              <td class="num">${fmt(stockQty('material', m.code))}</td>
              <td>
                <div class="toolbar" style="margin:0;">
                  <input class="qty" id="q-${m.code}" type="number" min="1" step="1" value="10" ${isOpen() ? '' : 'disabled'}>
                  <button class="btn primary sm" data-act="buyMat" data-code="${m.code}" ${isOpen() ? '' : 'disabled'}>采购</button>
                </div>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
  }

  // ---------- 视图：生产中心 ----------
  // 生产有工时：原料一投下去就被锁死，产线跑完才出成品。所以这里先列「在建产线」，画进度条。
  // 单笔生产的预估工时（秒）。与服务端 wbs_produce 同一套口径：
  //   产品自己申报过工艺工时（prod_sec）就用它，否则用全场默认的每件追加工时。
  function perUnitSec(code) {
    const r = S.rules || {};
    const dflt = isFinite(Number(r.prod_per)) ? Number(r.prod_per) : 1.2;
    if (!code) return dflt;
    const p = (S.products || []).find(x => x.code === code);
    return (p && Number(p.prod_sec) > 0) ? Number(p.prod_sec) : dflt;
  }

  function prodLine(qty, code) {
    const r = S.rules || {};
    const base = isFinite(Number(r.prod_base)) ? Number(r.prod_base) : 8;
    const per = perUnitSec(code);
    const lo = isFinite(Number(r.prod_min)) ? Number(r.prod_min) : 8;
    const hi = isFinite(Number(r.prod_max)) ? Number(r.prod_max) : 1200;
    return Math.min(hi, Math.max(lo, Math.ceil(base + per * Number(qty || 0))));
  }

  // 按「指定的单件工时」估算某批量的完工秒数（研发申报时实时预览用）
  function prodLineWith(per, qty) {
    const r = S.rules || {};
    const base = isFinite(Number(r.prod_base)) ? Number(r.prod_base) : 8;
    const lo = isFinite(Number(r.prod_min)) ? Number(r.prod_min) : 8;
    const hi = isFinite(Number(r.prod_max)) ? Number(r.prod_max) : 1200;
    return Math.min(hi, Math.max(lo, Math.ceil(base + Number(per || 0) * Number(qty || 0))));
  }

  // 把秒数写成人话：90 → 「1 分 30 秒」，1200 → 「20 分钟」
  function fmtDur(sec) {
    const s = Math.max(0, Math.round(Number(sec) || 0));
    if (s < 60) return s + ' 秒';
    const m = Math.floor(s / 60), r = s % 60;
    if (!r) return m + ' 分钟';
    return m + ' 分 ' + r + ' 秒';
  }

  const autoList = () => !(S.rules && String(S.rules.auto_list) === '0');

  function myProduction() {
    const uid = me ? me.owner_id : '';
    return (S.production || []).filter(p => p.owner_id === uid);
  }

  function prodQueueCard() {
    const mine = myProduction();
    const running = mine.filter(p => p.status === 'running');
    const now = Date.now();
    const fresh = mine.filter(p => p.status === 'done' && p.done_at && (now - Date.parse(p.done_at)) < 90000);
    if (!running.length && !fresh.length) return '';
    const row = (p, done) => {
      const st = Date.parse(p.started_at), ft = Date.parse(p.finish_at);
      const pct = done ? 100
        : (isFinite(st) && isFinite(ft) && ft > st ? Math.max(0, Math.min(99, (now - st) / (ft - st) * 100)) : 0);
      const sec = isFinite(ft) ? Math.max(0, Math.ceil((ft - now) / 1000)) : 0;
      return `<tr>
        <td><b>${esc(p.product_name)}</b></td>
        <td class="num">${fmt(p.qty)}</td>
        <td><div class="bar teal"><i data-prod-bar="${p.id}" style="width:${pct.toFixed(1)}%"></i></div></td>
        <td class="num" data-prod-left="${p.id}">${done ? '已入库' : (sec > 0 ? fmtDur(sec) : '即将完工')}</td>
      </tr>`;
    };
    const r = S.rules || {};
    const rng = fmtDur(isFinite(Number(r.prod_min)) ? Number(r.prod_min) : 8)
      + ' – ' + fmtDur(isFinite(Number(r.prod_max)) ? Number(r.prod_max) : 1200);
    return `
    <div class="card">
      <h3>在建产线 <span class="pill ${autoList() ? 'teal' : ''}">${autoList() ? '完工自动上架' : '完工不自动上架'}</span></h3>
      <p class="hint">投产不是立刻出成品：<b>原料一投下去就被锁定，中途不能撤单</b>。产线跑完工时（${rng}，<b>做多少货就等多久</b>）才会入库。${autoList()
        ? '完工后系统<b>自动挂到交易所盘口</b>，价格是单位成本的 1.8 倍，你可以到「交易所 → 挂单交易台 → 我的委托」随时改价或撤单。'
        : '组委会当前<b>关闭了自动上架</b>：完工的货只进你的库存，要卖得自己到「挂单交易台」上架。'}</p>
      <table>
        <thead><tr><th>产品</th><th class="num">数量</th><th>进度</th><th class="num">剩余</th></tr></thead>
        <tbody>
          ${running.map(p => row(p, false)).join('')}
          ${fresh.map(p => row(p, true)).join('')}
        </tbody>
      </table>
    </div>`;
  }

  function viewFactory() {
    // 投产数量框默认就填「最多可产」：组委会给这款产品定的产量上限，再被手头原料卡住。
    const dflt = p => Math.max(1, maxProducible(p.code));
    return `
    ${phaseNotice()}
    ${prodQueueCard()}
    <div class="card">
      <h3>生产中心</h3>
      <p class="hint">消耗原材料产出成品。<b>生产不花钱，只消耗原料</b>——原料不够会被系统直接拒绝。<b>投产有工时</b>：原料一扣走就锁定，产线跑完才出成品，<b>做的货越多等得越久</b>；${autoList()
        ? '完工后系统自动把它挂到交易所盘口（价格 = 单位成本 × 1.8），你可以在「挂单交易台 → 我的委托」里随时改价或撤单'
        : '完工后只进你自己的库存，要卖得自己到「挂单交易台」上架'}，同时给所有贸易商发一封上架通知邮件。</p>
      <p class="hint">「单件工时」是你研发报批时核定的工艺参数；没有报批过的通用产品用全场默认值。<b>「最多可产」是这款产品单笔能投的最大数量</b>：研发报批时你申报的「预期可产」会固化成它，没报批过的产品用全场默认值（当前 <b>${ruleMaxQty()}</b> 件），再被手头原料卡住。<b>组委会可以在「赛制参数」调全场默认值，也能在「产品产量上限」里逐款单独改。</b></p>
      <p class="hint">列表里既有系统自带的产品，也有你自己研发并经政府审批通过的产品。想加新产品请到「研发中心」。</p>
      <table>
        <thead><tr><th>产品</th><th>配方</th><th class="num">原料成本</th><th class="num">参考市价</th><th class="num">理论毛利</th><th class="num">我的成品</th><th class="num">最多可产</th><th style="width:200px;">生产</th></tr></thead>
        <tbody>
          ${S.products.map(p => {
            const cost = prodCost(p.code);
            const cap = maxProducible(p.code);
            const n0 = dflt(p);
            const recipe = Object.keys(p.recipe || {}).map(k => `${esc(matName(k))} ×${p.recipe[k]}`).join(' ＋ ');
            return `<tr>
              <td><b>${esc(p.name)}</b></td>
              <td style="color:var(--muted);font-size:12.5px;">${recipe}</td>
              <td class="num">${fmt(cost)}</td>
              <td class="num">${fmt(p.ref_price)}</td>
              <td class="num" style="color:var(--ok);">${fmt(Number(p.ref_price) - cost)}</td>
              <td class="num">${fmt(stockQty('product', p.code))}</td>
              <td class="num"><b>${cap}</b>${cap < productMaxQty(p.code) ? ' <span class="hint">原料限制</span>' : ''}</td>
              <td>
                <div class="toolbar" style="margin:0;">
                  <input class="qty" id="p-${p.code}" type="number" min="1" max="${cap}" step="1" value="${n0}" ${isOpen() && cap > 0 ? '' : 'disabled'}>
                  <button class="btn teal sm" data-act="produce" data-code="${p.code}" ${isOpen() && cap > 0 ? '' : 'disabled'}>投产</button>
                </div>
                <div class="hint" style="margin-top:4px;" data-prod-est="${p.code}">约 ${fmtDur(prodLine(n0, p.code))}完工 · 单件 ${fmt(perUnitSec(p.code), 1)} 秒</div>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
  }

  // ---------- 视图：库存 ----------
  function viewInventory() {
    return `
    <div class="card">
      <h3>我的库存</h3>
      <p class="hint">库存估值合计 <b>${fmt(myStockValue())} G</b>（原材料按采购价、成品按配方原料成本计价）</p>
      <div class="notice info">挂到交易所当卖单的货，会从「<b>可用库存</b>」划到「<b>在委托中</b>」那一列 —— <b>货还是你的，只是挂在盘上等人来买</b>，撤单或成交后按结果结清。<b>买卖成交的那一刻，货会立刻出现在可用库存里。</b></div>
      ${stockTable()}
    </div>`;
  }

  // ---------- 视图：交易市场 ----------
  // ---------- 视图：贸易市场（已并入物品交易所） ----------
  // 「在售货盘 / 求购需求」与交易所的委托簿本来就是同一件事，两处并存只会让人不知道去哪挂单。
  // 现在统一到「交易所 → 挂单交易台」，这里保留别名，老链接不至于打不开。
  function viewTrade() { return viewBourse(); }

  // ---------- 视图：合同中心（起草 / 签署 / 管理） ----------
  function viewContract() {
    const open = isOpen();
    const list = S.offers.filter(o => o.fiscal_year === fy() || o.status === 'open');
    const mine = list.filter(o => me && o.owner_id === me.owner_id);
    const incoming = list.filter(o => !me || o.owner_id !== me.owner_id);

    const THEAD = '<tr><th>对方</th><th>方向</th><th>商品</th><th class="num">数量</th><th class="num">单价</th><th class="num">总额</th><th>限定</th><th>状态 / 操作</th></tr>';

    // 可指定的对象 = 全场所有已注册公司（含政府、媒体、裁判），不含自己
    const partners = S.players.filter(p => me && p.owner_id !== me.owner_id);

    const targetText = o => {
      if (o.target_owner) return `<span class="pill amber">专属 · ${esc(o.target_name || '指定公司')}</span>`;
      if (o.target_role) return ROLE_LABEL[o.target_role] || o.target_role;
      return '不限';
    };

    const row = (o, isMine) => {
      const total = Number(o.qty) * Number(o.price);
      const roleOk = !o.target_role || o.target_role === myRole();
      const mineToSign = (!o.target_owner || (me && o.target_owner === me.owner_id)) && roleOk;
      const act = o.status !== 'open'
        ? `<span class="pill ${STATUS_PILL[o.status] || ''}">${STATUS_LABEL[o.status] || o.status}</span>`
        : (isMine
          ? `<button class="btn danger sm" data-act="cancelOffer" data-id="${o.id}">撤销</button>`
          : (mineToSign
            ? `<button class="btn primary sm" data-act="acceptOffer" data-id="${o.id}" ${open ? '' : 'disabled'}>签署</button>`
            : `<button class="btn sm" disabled title="${roleOk ? '该合同指定了其他公司签署' : '该合同限定了签署角色'}">${roleOk ? '专属他人' : '限' + (ROLE_LABEL[o.target_role] || o.target_role)}</button>`));
      return `<tr>
        <td>${esc(o.company_name || '—')}${o.note ? `<div class="hint" style="margin:3px 0 0;font-size:11.5px;" title="${esc(o.note)}">📝 ${esc(o.note.length > 46 ? o.note.slice(0, 46) + '…' : o.note)}</div>` : ''}</td>
        <td><span class="pill ${o.side === 'sell' ? 'teal' : 'blue'}">${o.side === 'sell' ? '供货' : '求购'}</span></td>
        <td><b>${esc(offerItemName(o))}</b> <span class="hint">${o.kind === 'material' ? '原材料' : '成品'}</span></td>
        <td class="num">${fmt(o.qty)}</td>
        <td class="num">${fmt(o.price)}</td>
        <td class="num"><b>${fmt(total)}</b></td>
        <td>${targetText(o)}</td>
        <td>${act}</td>
      </tr>`;
    };

    const myOpen = mine.filter(o => o.status === 'open');
    const incomingOpen = incoming.filter(o => o.status === 'open'
      && (!o.target_owner || (me && o.target_owner === me.owner_id))
      && (!o.target_role || o.target_role === myRole()));
    const settled = list.filter(o => o.status === 'done');

    // 战时封锁 / 禁运：把服务端的拦截规则提前告诉用户，避免白填一张单
    const myLock = S.wars.filter(w => ['declared', 'fighting'].indexOf(w.status) >= 0
      && me && (w.attacker_id === me.owner_id || w.defender_id === me.owner_id));
    const myEmbargo = S.sanctions.filter(s => s.kind === 'embargo' && s.status === 'active'
      && Number(s.until_year) >= fy() && me && s.target_id === me.owner_id);

    return `
    ${phaseNotice()}
    ${myLock.length ? `<div class="notice warn"><b>战时封锁中</b>：你与 ${myLock.map(w => esc(w.attacker_id === me.owner_id ? w.defender_name : w.attacker_name)).join('、')} 正在交战，战事结束前<b>无法签署任何新合同</b>（存量合同不受影响）。</div>` : ''}
    ${myEmbargo.length ? `<div class="notice warn"><b>你正被禁运</b>：${myEmbargo.map(s => esc(s.company_name)).join('、')} 对你实施全面禁运，解除前你无法与任何人达成新合同。</div>` : ''}
    <div class="grid c4" style="margin-bottom:18px;">
      <div class="stat"><div class="k">我发起中</div><div class="v">${myOpen.length}<small>份</small></div><div class="n">等待对方签署</div></div>
      <div class="stat"><div class="k">待我签署</div><div class="v">${incomingOpen.length}<small>份</small></div><div class="n">对方发来的合同</div></div>
      <div class="stat"><div class="k">本财年已成交</div><div class="v">${settled.length}<small>份</small></div><div class="n">合同全部履行完毕</div></div>
      <div class="stat"><div class="k">可动用库存</div><div class="v">${S.stock.filter(s => Number(s.qty) > 0).length}<small>种</small></div><div class="n">决定你能供多少货</div></div>
    </div>

    <div class="card">
      <h3>起草合同</h3>
      <p class="hint">合同中心对<b>全场所有角色开放</b>——生产商、贸易商、新闻媒体、政府、裁判都可以起草与签署。默认对全场公开；也可以<b>指定一家已注册的公司</b>独占签署权 —— 商谈妥当后正式落单就用这个。指定后系统会自动给对方发一封站内邮件。</p>
      <div class="grid c4">
        <div class="field"><label>合同方向</label>
          <select id="ofSide"><option value="sell">供货（我卖货收钱）</option><option value="buy">求购（我买货付钱）</option></select></div>
        <div class="field"><label>标的（原材料 / 成品）</label>
          <select id="ofItem">
            <optgroup label="成品">
              ${S.products.map(p => `<option value="PRD:${esc(p.code)}">${esc(p.name)}（参考 ${fmt(p.ref_price)}）</option>`).join('')}
            </optgroup>
            <optgroup label="原材料">
              ${S.materials.map(m => `<option value="MAT:${esc(m.code)}">${esc(m.name)}（基准 ${fmt(m.price)}，现价 ${fmt(matSpot(m.code) || m.price)}）</option>`).join('')}
            </optgroup>
          </select></div>
        <div class="field"><label>数量</label><input id="ofQty" type="number" min="1" step="1" value="10"></div>
        <div class="field"><label>单价（金币）</label><input id="ofPrice" type="number" min="1" step="1" value="95"></div>
      </div>
      <div class="grid c2">
        <div class="field"><label>指定签署公司（推荐）</label>
          <select id="ofTargetOwner">
            <option value="">不指定 · 全场可签</option>
            ${partners.map(p => `<option value="${esc(p.owner_id)}">${esc(p.company_name)}（${ROLE_LABEL[p.role] || p.role}）</option>`).join('')}
          </select></div>
        <div class="field"><label>或限定角色（未指定公司时生效）</label>
          <select id="ofTarget">
            <option value="">不限角色</option>
            <option value="manufacturer">仅生产商</option>
            <option value="trader">仅贸易商</option>
            <option value="media">仅新闻媒体</option>
            <option value="government">仅政府</option>
            <option value="admin">仅裁判</option>
          </select></div>
      </div>
      <div class="field" style="margin-top:12px;"><label>合同说明（自拟文字，可选，最多 300 字）</label>
        <textarea id="ofNote" rows="2" maxlength="300" placeholder="想写什么写什么：交期、质量承诺、独家条款、发货方式、附加条件……对方会在签署前看到这段话。"
          style="width:100%;border:1px solid var(--line);border-radius:8px;padding:9px 11px;font:inherit;resize:vertical;"></textarea>
      </div>
      <div class="toolbar" style="border-top:1px solid var(--line-2);padding-top:14px;">
        <span class="hint">签署即交割：货权与货款同时转移，任何一方都不能反悔。</span>
        <span class="grow"></span>
        <button class="btn primary" data-act="createOffer" ${open ? '' : 'disabled'}>发布合同</button>
      </div>
    </div>

    <div class="card">
      <h3>我发起的合同</h3>
      <p class="hint">自己不能签自己的合同。反悔就在对方签署前撤销。</p>
      <table>
        <thead>${THEAD}</thead>
        <tbody>${mine.length ? mine.map(o => row(o, true)).join('') : `<tr><td colspan="8" class="empty">你还没有发起过合同</td></tr>`}</tbody>
      </table>
    </div>

    <div class="card">
      <h3>待我签署的合同</h3>
      <p class="hint">共 ${incomingOpen.length} 份待处理。签署前请先确认自己的库存与现金够不够履行。</p>
      <table>
        <thead>${THEAD}</thead>
        <tbody>${incoming.length ? incoming.slice(0, 60).map(o => row(o, false)).join('') : `<tr><td colspan="8" class="empty">暂时没有别人发来的合同</td></tr>`}</tbody>
      </table>
    </div>`;
  }

  // ---------- 视图：交付大厅（贸易商 / 制造商的专用交付板块，全场可见） ----------
  // 与「合同中心」的定向签署、「交易所」的连续撮合互补：这里是一次性的整批交付 ——
  // 上架的货立刻托管，其他公司（含政府 / 媒体）按单价直接接单，可部分接，钱货两清。
  // 标的只允许系统货池里的东西：原材料任选，成品必须是已审批品类（研发未批的挂不上）。
  function viewDelivery() {
    const open = isOpen();
    const canPost = myRole() === 'manufacturer' || myRole() === 'trader';
    const live = S.deliveries.filter(d => d.status === 'open');
    const mine = live.filter(d => me && d.owner_id === me.owner_id);
    const others = live.filter(d => !me || d.owner_id !== me.owner_id);
    const doneMine = S.deliveries.filter(d => me && d.owner_id === me.owner_id
      && d.status === 'done' && (d.fiscal_year === fy() || d.fiscal_year === 0));
    const dlvSum = arr => arr.reduce((a, d) => a + (Number(d.qty) - Number(d.filled)) * Number(d.price), 0);

    const row = d => {
      const left = Number(d.qty) - Number(d.filled);
      const mineRow = me && d.owner_id === me.owner_id;
      return `<tr>
        <td><b>${esc(spotItemName(d))}</b> <span class="hint">${d.kind === 'material' ? '原材料' : '成品'}</span>${d.note ? `<div class="hint" style="margin:3px 0 0;font-size:11.5px;" title="${esc(d.note)}">📝 ${esc(d.note.length > 40 ? d.note.slice(0, 40) + '…' : d.note)}</div>` : ''}</td>
        <td>${esc(d.company_name || '—')} ${mineRow ? '<span class="pill amber">我的</span>' : ''}</td>
        <td class="num">${fmt(left)}</td>
        <td class="num"><b>${fmt(d.price, 2)}</b></td>
        <td class="num">${fmt(left * Number(d.price))}</td>
        <td>${mineRow
          ? `<button class="btn danger sm" data-act="deliveryCancel" data-id="${d.id}" ${open ? '' : 'disabled'}>撤单退回</button>`
          : `<div class="row-inline"><input id="dlq-${d.id}" type="number" min="1" max="${Math.floor(left)}" step="1" value="${Math.floor(left)}" style="width:78px;" ${open ? '' : 'disabled'}><button class="btn primary sm" data-act="deliveryTake" data-id="${d.id}" ${open ? '' : 'disabled'}>接单</button></div>`}</td>
      </tr>`;
    };
    const THEAD = '<tr><th>标的</th><th>交付方</th><th class="num">可交付</th><th class="num">单价</th><th class="num">金额</th><th style="width:190px;">操作</th></tr>';

    // 上架表单：标的下拉只列「系统货池里有 + 我手上有货」的品种（初始为成品池，切类别会自动重填）
    const items0 = (S.products || []).filter(p => stockQty('product', p.code) > 0);
    const p0 = items0[0] || null;
    const have0 = p0 ? stockQty('product', p0.code) : 0;

    return `
    ${phaseNotice()}
    <div class="grid c4" style="margin-bottom:16px;">
      <div class="stat"><div class="k">全场在架交付单</div><div class="v">${live.length}<small>笔</small></div><div class="n">所有公司都看得见</div></div>
      <div class="stat"><div class="k">我的在架</div><div class="v">${mine.length}<small>笔</small></div><div class="n">托管中 ${fmt(dlvSum(mine))} G 的货</div></div>
      <div class="stat"><div class="k">本财年我已交付</div><div class="v">${doneMine.length}<small>笔</small></div><div class="n">对方接满即钱货两清</div></div>
      <div class="stat"><div class="k">可用现金</div><div class="v">${fmt(me ? me.cash : 0)}<small>G</small></div><div class="n">接单即采购，货立刻入库</div></div>
    </div>

    ${canPost ? `
    <div class="card">
      <h3>发布交付单</h3>
      <p class="hint">这是<b>贸易商与制造商的专用交付通道</b>：把手里的货上架成交付单，全场每家公司都能看到并直接接单。上架的货会立刻被<b>托管</b>，对方接单（可部分接）后钱货两清；撤单时托管的原货退回。标的必须是<b>系统货池里的原材料，或已审批的成品品类</b> —— 没审批下来的研发品挂不上，系统里没有的物品也挂不上。</p>
      <div class="grid c4">
        <div class="field"><label>标的类别</label>
          <select id="dlKind"><option value="product">成品</option><option value="material">原材料</option></select></div>
        <div class="field"><label>标的（只列你手上有货的）</label>
          <select id="dlItem">${items0.length ? items0.map(p => `<option value="${esc(p.code)}">${esc(p.name)}（可交 ${fmt(stockQty('product', p.code))}）</option>`).join('') : '<option value="">（你手上没有可交付的成品，先去投产或采购）</option>'}</select></div>
        <div class="field"><label>数量</label><input id="dlQty" type="number" min="1" step="1" value="${Math.max(1, Math.min(10, Math.floor(have0)))}"></div>
        <div class="field"><label>单价（金币）</label><input id="dlPrice" type="number" min="0.01" step="0.01" value="${p0 ? fmt(Number(p0.ref_price) || 50, 2) : '50.00'}"></div>
      </div>
      <div class="grid c2" style="margin-top:8px;">
        <div class="field"><label>交付说明（可选，最多 120 字）</label>
          <input id="dlNote" maxlength="120" placeholder="交期、包装、结算方式、独家条款……接单方在接单前会看到"></div>
        <div class="field"><label>当前标的可交付数量</label>
          <div class="stat" style="padding:8px 14px;"><div class="v" id="dlHave" style="font-size:22px;">${fmt(have0)}</div></div></div>
      </div>
      <div class="toolbar" style="border-top:1px solid var(--line-2);padding-top:14px;">
        <span class="hint">接单方不限角色 —— 政府、媒体、其他制造商和贸易商都能来接你的单。</span>
        <span class="grow"></span>
        <button class="btn primary" data-act="deliveryPost" ${open ? '' : 'disabled'}>上架交付单</button>
      </div>
    </div>` : `
    <div class="notice info">交付上架仅对<b>制造商与贸易商</b>开放。你可以浏览全场交付货单，看中任何一笔都能直接接单买货 —— 货立刻进你的库存。</div>`}

    <div class="card">
      <h3>全场交付货单</h3>
      <p class="hint">共 <b>${live.length}</b> 笔在架（我的 ${mine.length} 笔，他人的 ${others.length} 笔）。点「接单」按对方单价买入，默认整单接下，改小数量可部分接单。</p>
      <table><thead>${THEAD}</thead><tbody>${live.length ? live.map(row).join('') : '<tr><td colspan="6" class="empty">还没有任何交付单 —— 上面的「发布交付单」就是第一笔。</td></tr>'}</tbody></table>
    </div>`;
  }

  // 交付大厅：标的 / 类别变化时联动「可交付数量」与建议单价
  function syncDeliveryPick() {
    const kindSel = document.getElementById('dlKind');
    const itemSel = document.getElementById('dlItem');
    if (!kindSel || !itemSel) return;
    const kind = kindSel.value === 'material' ? 'material' : 'product';
    const code = itemSel.value;
    const haveEl = document.getElementById('dlHave');
    const qtyEl = document.getElementById('dlQty');
    const priceEl = document.getElementById('dlPrice');
    const have = code ? stockQty(kind, code) : 0;
    if (haveEl) haveEl.textContent = fmt(have);
    if (qtyEl && (Number(qtyEl.value) || 0) > have) qtyEl.value = Math.max(1, Math.floor(have));
    if (priceEl && code) {
      let px = 0;
      if (kind === 'material') px = Number(matSpot(code)) || Number((S.materials.find(m => m.code === code) || {}).price) || 0;
      else px = Number((S.products.find(p => p.code === code) || {}).ref_price) || 0;
      if (px > 0) priceEl.value = fmt(px, 2);
    }
  }

  // ---------- 视图：市场公告（招商与合作策略） ----------
  function viewPosts() {
    const open = isOpen();
    const mine = S.posts.filter(p => me && p.owner_id === me.owner_id);
    const others = S.posts.filter(p => !me || p.owner_id !== me.owner_id);
    const sorted = others.slice().sort((a, b) =>
      (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || Number(b.id) - Number(a.id));
    const myInterest = id => S.interests.find(i => i.post_id === id && me && i.owner_id === me.owner_id);

    const cardHtml = (p, isMine) => {
      const ints = S.interests.filter(i => i.post_id === p.id);
      const mi = myInterest(p.id);
      return `<div class="feed-item${p.pinned ? ' ad' : ''}">
        <h4>${p.pinned ? '📌 ' : ''}${esc(p.title)}
          <span class="pill ${POST_PILL[p.kind] || ''}">${POST_KIND[p.kind] || p.kind}</span>
          ${p.status === 'closed' ? '<span class="pill">已关闭</span>' : ''}</h4>
        <div class="meta">${esc(p.company_name || '—')}（${ROLE_LABEL[p.role] || p.role}） · ${fmtTime(p.created_at)}${p.want_role ? ' · 想找：' + (ROLE_LABEL[p.want_role] || p.want_role) : ''}</div>
        <p>${esc(p.body || '')}</p>
        <div class="toolbar" style="border-top:1px solid var(--line-2);padding-top:8px;">
          <span class="hint">合作意向 <b>${ints.length}</b> 家${ints.length ? '（' + ints.slice(0, 8).map(i => esc(i.company_name)).join('、') + '）' : ''}</span>
          <span class="grow"></span>
          ${isMine
            ? `<button class="btn ghost sm" data-act="pinPost" data-id="${p.id}">${p.pinned ? '取消置顶' : '置顶 200 G'}</button>
               <button class="btn ghost sm" data-act="closePost" data-id="${p.id}">${p.status === 'open' ? '关闭' : '重开'}</button>
               <button class="btn danger sm" data-act="deletePost" data-id="${p.id}">删除</button>`
            : `<button class="btn ${mi ? 'ghost' : 'primary'} sm" data-act="interestPost" data-id="${p.id}" ${open && p.status === 'open' ? '' : 'disabled'}>${mi ? '已递意向 · 改附言' : '表达合作意向'}</button>`}
        </div>
      </div>`;
    };

    return `
    ${phaseNotice()}
    <div class="grid c3" style="margin-bottom:18px;">
      <div class="stat"><div class="k">全场公告</div><div class="v">${S.posts.filter(p => p.status === 'open').length}<small>条</small></div><div class="n">正在招商 / 求合作</div></div>
      <div class="stat"><div class="k">我发布的</div><div class="v">${mine.length}<small>条</small></div><div class="n">收到的意向 ${mine.reduce((a, p) => a + Number(p.interest_count || 0), 0)} 条</div></div>
      <div class="stat"><div class="k">我递出的意向</div><div class="v">${S.interests.filter(i => me && i.owner_id === me.owner_id).length}<small>条</small></div><div class="n">对方会同时收到邮件</div></div>
    </div>

    <div class="card">
      <h3>发布市场公告</h3>
      <p class="hint">向全场广播你的<b>合作策略</b>：想找谁、能给什么、要什么。写得越具体，越容易钓到合作方。对方表达意向后，你会立刻收到站内邮件。</p>
      <div class="grid c2">
        <div class="field"><label>公告类型</label>
          <select id="poKind">
            <option value="coop">寻求合作</option>
            <option value="supply">我有货源</option>
            <option value="demand">我需要货源</option>
            <option value="partner">招募伙伴</option>
            <option value="bounty">发布悬赏</option>
            <option value="other">其他</option>
          </select></div>
        <div class="field"><label>希望的合作方</label>
          <select id="poWant">
            <option value="">不限</option>
            <option value="manufacturer">制造商</option>
            <option value="trader">贸易商</option>
            <option value="media">新闻媒体</option>
            <option value="any">任意角色</option>
          </select></div>
      </div>
      <div class="field"><label>标题</label><input id="poTitle" maxlength="40" placeholder="例如：长期收购石英钟，量大从优"></div>
      <div class="field"><label>正文 —— 写清你的筹码与诉求</label><textarea id="poBody" maxlength="600" placeholder="例如：本厂月产能 200 件机械钟表，可签半年框架协议，接受 30% 预付、70% 交货结清；希望找一家稳定贸易商共担原材料涨价风险…"></textarea></div>
      <div class="toolbar" style="border-top:1px solid var(--line-2);padding-top:14px;">
        <span class="hint">置顶 200 G，你的公告会排在最前面。</span>
        <span class="grow"></span>
        <button class="btn primary" data-act="postMessage" ${open ? '' : 'disabled'}>发布公告</button>
      </div>
    </div>

    <div class="card">
      <h3>我发布的公告（${mine.length}）</h3>
      ${mine.length ? mine.map(p => cardHtml(p, true)).join('') : `<div class="empty">还没有发布过公告</div>`}
    </div>

    <div class="card">
      <h3>全场公告板</h3>
      <p class="hint">置顶的排在最前面。越早表达意向，越容易抢到好条件。</p>
      ${sorted.length ? sorted.map(p => cardHtml(p, false)).join('') : `<div class="empty">场上还没有人发布公告</div>`}
    </div>`;
  }

  // ---------- 视图：借贷中心 ----------
  function viewLoan() {
    const open = isOpen();
    const judge = isJudge();
    const lv = S.loans.filter(l => l.fiscal_year === fy() || l.status === 'active' || l.status === 'open' || l.status === 'seize_req');
    const mineLoan = lv.filter(l => me && l.owner_id === me.owner_id);
    const signable = lv.filter(l => l.status === 'open' && (!me || l.owner_id !== me.owner_id)
      && (!l.target_owner || (me && l.target_owner === me.owner_id)));
    const asBorrower = lv.filter(l => l.status === 'active' && me && l.borrower_id === me.owner_id);
    const asLender = lv.filter(l => l.status === 'active' && me && l.lender_id === me.owner_id);
    const seizeReq = lv.filter(l => l.status === 'seize_req');
    const history = lv.filter(l => ['repaid', 'seized', 'cancelled'].indexOf(l.status) >= 0);

    const collText = l => {
      if (!l.collateral_kind || l.collateral_kind === 'none') return '无抵押（信用借款）';
      if (l.collateral_kind === 'cash') return '现金 ' + fmt(l.collateral_value) + ' G';
      return (l.collateral_kind === 'material' ? matName(l.collateral_item) : prodName(l.collateral_item))
        + ' ×' + fmt(l.collateral_qty) + '（估值 ' + fmt(l.collateral_value) + ' G）';
    };
    const dueOf = l => Number(l.principal) * (1 + Number(l.rate) / 100 * Number(l.term_years));

    const rowBase = l => `<td>${esc(l.company_name || '—')}</td>
      <td><span class="pill ${l.side === 'lend' ? 'teal' : 'blue'}">${l.side === 'lend' ? '出借' : '借入'}</span></td>
      <td class="num">${fmt(l.principal)}</td>
      <td class="num">${fmt(l.rate)}%</td>
      <td class="num">${fmt(dueOf(l))}</td>
      <td>于财年 ${l.due_year || '—'}</td>
      <td style="font-size:12.5px;">${collText(l)}</td>`;

    const actOf = l => {
      if (l.status === 'open') {
        return me && l.owner_id === me.owner_id
          ? `<button class="btn danger sm" data-act="cancelLoan" data-id="${l.id}">撤销</button>`
          : `<button class="btn primary sm" data-act="acceptLoan" data-id="${l.id}" ${open ? '' : 'disabled'}>签署</button>`;
      }
      if (l.status === 'active') {
        if (me && l.borrower_id === me.owner_id) return `<button class="btn primary sm" data-act="repayLoan" data-id="${l.id}" ${open ? '' : 'disabled'}>还款 ${fmt(dueOf(l))} G</button>`;
        if (me && l.lender_id === me.owner_id) return `<button class="btn danger sm" data-act="defaultLoan" data-id="${l.id}">申请强制执行</button>`;
        return '<span class="hint">他人履约中</span>';
      }
      if (l.status === 'seize_req') {
        return judge
          ? `<button class="btn primary sm" data-act="seizeLoan" data-id="${l.id}" data-ok="1">准予强执</button>
             <button class="btn ghost sm" data-act="seizeLoan" data-id="${l.id}" data-ok="0">驳回</button>`
          : '<span class="pill danger">待政府裁定</span>';
      }
      return `<span class="pill ${LOAN_PILL[l.status] || ''}">${LOAN_LABEL[l.status] || l.status}</span>`;
    };

    const table = (rows, empty) => `<table>
      <thead><tr><th>发起方</th><th>方向</th><th class="num">本金</th><th class="num">利率</th><th class="num">应还</th><th>到期</th><th>抵押物</th><th>状态 / 操作</th></tr></thead>
      <tbody>${rows.length ? rows.map(l => `<tr>${rowBase(l)}<td>${actOf(l)}</td></tr>`).join('') : `<tr><td colspan="8" class="empty">${empty}</td></tr>`}</tbody>
    </table>`;

    return `
    ${phaseNotice()}
    <div class="grid c4" style="margin-bottom:18px;">
      <div class="stat"><div class="k">我作为借款人</div><div class="v">${asBorrower.length}<small>笔</small></div><div class="n">待还本息 ${fmt(asBorrower.reduce((a, l) => a + dueOf(l), 0))} G</div></div>
      <div class="stat"><div class="k">我作为出借人</div><div class="v">${asLender.length}<small>笔</small></div><div class="n">应收本息 ${fmt(asLender.reduce((a, l) => a + dueOf(l), 0))} G</div></div>
      <div class="stat"><div class="k">待我签署</div><div class="v">${signable.length}<small>笔</small></div><div class="n">别人放出的借款</div></div>
      <div class="stat"><div class="k">待裁定强执</div><div class="v">${seizeReq.length}<small>笔</small></div><div class="n">政府 / 裁判处理</div></div>
    </div>

    ${seizeReq.length && judge ? `<div class="notice warn"><b>有待裁定的强制执行申请</b>：请在下方「履约中 / 待裁定」表里核准或驳回。</div>` : ''}

    <div class="card">
      <h3>发起借款合同</h3>
      <p class="hint">你可以<b>出借</b>资金赚利息，也可以<b>借入</b>资金并押上抵押物。到期不还，出借人可向政府申请强制执行，抵押物会被划走、信用分下调。</p>
      <div class="grid c4">
        <div class="field"><label>我的角色</label>
          <select id="lnSide">
            <option value="lend">我是出借人（我出钱收利息）</option>
            <option value="borrow">我是借款人（我借钱、我押抵押物）</option>
          </select></div>
        <div class="field"><label>本金（金币）</label><input id="lnAmount" type="number" min="1" step="10" value="500"></div>
        <div class="field"><label>年利率（%）</label><input id="lnRate" type="number" min="0" max="100" step="1" value="10"></div>
        <div class="field"><label>期限（财年）</label><input id="lnTerm" type="number" min="1" max="5" step="1" value="1"></div>
      </div>
      <div class="grid c4">
        <div class="field"><label>抵押物类型</label>
          <select id="lnCollKind">
            <option value="none">无抵押（信用借款，风险自担）</option>
            <option value="cash">现金抵押</option>
            <option value="material">原材料抵押</option>
            <option value="product">成品抵押</option>
          </select></div>
        <div class="field"><label>抵押物</label>
          <select id="lnCollItem">
            <option value="">—</option>
            ${S.materials.map(m => `<option value="material:${esc(m.code)}">原料 · ${esc(m.name)}（${fmt(m.price)} G）</option>`).join('')}
            ${S.products.map(p => `<option value="product:${esc(p.code)}">成品 · ${esc(p.name)}（成本 ${fmt(prodCost(p.code))} G）</option>`).join('')}
          </select></div>
        <div class="field"><label>抵押数量 / 金额</label><input id="lnCollQty" type="number" min="0" step="1" value="0"></div>
        <div class="field"><label>指定借款对象（可选）</label>
          <select id="lnTarget">
            <option value="">不指定 · 全场可签</option>
            ${S.players.filter(p => me && p.owner_id !== me.owner_id && ['manufacturer', 'trader', 'media'].indexOf(p.role) >= 0)
              .map(p => `<option value="${esc(p.owner_id)}">${esc(p.company_name)}（${ROLE_LABEL[p.role] || p.role}）</option>`).join('')}
          </select></div>
      </div>
      <div class="field"><label>备注（可选）</label><input id="lnNote" maxlength="300" placeholder="例如：长期合作伙伴，利率可再让 2 个点"></div>
      <div class="toolbar" style="border-top:1px solid var(--line-2);padding-top:14px;">
        <span class="hint">出借人的本金、借款人的抵押物，都会在发布的那一刻被锁定，撤销才退回。</span>
        <span class="grow"></span>
        <button class="btn primary" data-act="createLoan" ${open ? '' : 'disabled'}>发布借款合同</button>
      </div>
    </div>

    <div class="card">
      <h3>待签署的借款合同</h3>
      ${table(signable, '暂时没有人放出借款')}
    </div>

    <div class="card">
      <h3>履约中 / 待裁定（${asBorrower.length + asLender.length + seizeReq.length}）</h3>
      <p class="hint">借款人在到期财年之后仍未还款，出借人即可申请强制执行；由政府或裁判核准后划转抵押物。</p>
      ${table(lv.filter(l => l.status === 'active' || l.status === 'seize_req'), '没有进行中的借款')}
    </div>

    <div class="card">
      <h3>我发起的借款合同</h3>
      ${table(mineLoan, '你还没有发起过借款合同')}
    </div>

    <div class="card">
      <h3>历史记录</h3>
      ${table(history.slice(0, 40), '暂无历史记录')}
    </div>`;
  }

  // ---------- 视图：商战与制裁 ----------
  // 宣战与贸易战都必须先经组委会（政府 / 裁判）核准才生效；
  // 战争按轮推进、进度与逐轮战报实时可见，贸易战按财年倒计时。
  function viewWar() {
    const open = isOpen();
    const judge = isJudge();
    const mine = w => !!me && (w.attacker_id === me.owner_id || w.defender_id === me.owner_id);

    const myWars = S.wars.filter(mine);
    const myLive = myWars.filter(w => WAR_LIVE.indexOf(w.status) >= 0);
    const myRejected = myWars.filter(w => w.status === 'rejected');
    const incoming = S.wars.filter(w => w.status === 'declared' && me && w.defender_id === me.owner_id);
    const myFighting = myWars.filter(w => w.status === 'fighting');
    const pendingWars = S.wars.filter(w => w.status === 'pending');
    const myPendWar = pendingWars.filter(mine);

    const mySanc = S.sanctions.filter(s => me && s.owner_id === me.owner_id && s.status === 'active' && Number(s.until_year) >= fy());
    const pendingSanc = S.sanctions.filter(s => s.status === 'pending');
    const myPendSanc = pendingSanc.filter(s => me && s.owner_id === me.owner_id);
    const myCounterPend = pendingSanc.filter(s => me && s.owner_id === me.owner_id && s.counter_of);
    const onMe = S.sanctions.filter(s => me && s.target_id === me.owner_id && s.status === 'active' && Number(s.until_year) >= fy());

    // 可交战 / 可制裁的对象：除自己之外的所有非管理角色
    const partners = S.players.filter(p => me && p.owner_id !== me.owner_id
      && ['manufacturer', 'trader', 'media'].indexOf(p.role) >= 0);

    // 战争进度：轮次条 + 逐轮战报
    const warBar = w => {
      const total = Math.max(1, Number(w.rounds) || 1);
      const done = Math.max(0, Math.min(total, Number(w.round) || 0));
      const pct = Math.round(done / total * 100);
      const cls = w.status === 'settled' ? 'done' : (w.status === 'fighting' ? '' : 'spent');
      const log = Array.isArray(w.round_log) ? w.round_log : [];
      const chips = log.map(e => (e && e.note)
        ? `<span class="chip2 note">第 ${e.r} 轮 · ${esc(e.note)}</span>`
        : `<span class="chip2${Number(e.d) >= Number(e.a) ? ' def' : ' hit'}">第 ${e.r} 轮 · 攻 ${fmt(e.a)} / 守 ${fmt(e.d)}</span>`
      ).join('');
      const empty = w.status === 'pending' ? '等待组委会审批，尚未进入交战'
        : (w.status === 'declared' ? '已获批准，等待被宣战方应战' : '尚未推进任何一轮');
      return `<div class="wbar ${cls}"><div class="wbar-fill" style="width:${pct}%"></div></div>
        <div class="wbar-meta">
          <span>进度 <b>${done} / ${total}</b> 轮</span>
          <span>宣布军费 <b>${fmt(w.stake)}</b> G</span>
          <span>应战投入 <b>${fmt(w.defender_stake)}</b> G</span>
          <span>已消耗 攻 <b>${fmt(w.attacker_spent)}</b> · 守 <b>${fmt(w.defender_spent)}</b> G</span>
          ${Number(w.war_tax) > 0 ? `<span>动员税 <b>${fmt(w.war_tax)}</b> G</span>` : ''}
        </div>
        <div class="rlog">${chips || `<span class="hint">${empty}</span>`}</div>`;
    };

    // 战争卡片：进度 + 双方可执行的操作
    const warBlock = w => {
      const isAtk = me && w.attacker_id === me.owner_id;
      const isDef = me && w.defender_id === me.owner_id;
      let btns = '';
      if (w.status === 'pending') {
        if (judge) btns += `<button class="btn primary sm" data-act="approveWar" data-id="${w.id}" data-ok="1">批准宣战</button>
                            <button class="btn ghost sm" data-act="approveWar" data-id="${w.id}" data-ok="0">驳回</button>`;
        if (isAtk) btns += `<button class="btn ghost sm" data-act="mediateWar" data-id="${w.id}">撤回申请</button>`;
      } else if (w.status === 'declared') {
        if (isDef) btns += `<button class="btn primary sm" data-act="respondWar" data-id="${w.id}">应战</button>
                            <button class="btn ghost sm" data-act="respondWar" data-id="${w.id}" data-surrender="1">投降</button>`;
        if (isAtk) btns += `<button class="btn ghost sm" data-act="mediateWar" data-id="${w.id}">撤军</button>`;
        if (judge) btns += `<button class="btn ghost sm" data-act="mediateWar" data-id="${w.id}">调停</button>`;
      } else if (w.status === 'fighting') {
        if (isAtk || isDef || judge) btns += `<button class="btn primary sm" data-act="advanceWar" data-id="${w.id}">推进一轮</button>
                            <button class="btn teal sm" data-act="advanceWar" data-id="${w.id}" data-all="1">一次打完</button>`;
        if (isAtk || judge) btns += `<button class="btn ghost sm" data-act="mediateWar" data-id="${w.id}">停战</button>`;
      }
      const tail = [];
      if (w.cause) tail.push(`宣战理由：${esc(w.cause)}`);
      if (w.approve_status === 'rejected' && w.approve_note) tail.push(`组委会驳回：${esc(w.approve_note)}`);
      else if (w.approve_note) tail.push(`组委会裁定（${esc(w.approved_by || '组委会')}）：${esc(w.approve_note)}`);
      if (w.gov_note) tail.push(`停战说明：${esc(w.gov_note)}`);
      if (w.loot_note) tail.push(`战报：${esc(w.loot_note)}`);
      return `<div class="war-block${w.status === 'fighting' ? ' hot' : ''}">
        <div class="war-head">
          <span class="who">${esc(w.attacker_name)} <span class="hint">→</span> ${esc(w.defender_name)}</span>
          <span class="pill ${WAR_PILL[w.status] || ''}">${WAR_LABEL[w.status] || w.status}</span>
          ${w.result ? `<span class="pill ${w.result === 'attacker_win' ? 'danger' : 'ok'}">${WAR_RESULT[w.result] || w.result}</span>` : ''}
          <span class="grow"></span>
          <span class="hint">财年 ${w.fiscal_year || '—'} 发起</span>
        </div>
        ${warBar(w)}
        ${tail.map(t => `<div class="hint" style="margin-top:6px;">${t}</div>`).join('')}
        ${btns ? `<div class="toolbar"><span class="grow"></span>${btns}</div>` : ''}
      </div>`;
    };

    // 贸易战剩余年限进度
    const sancBar = s => {
      const start = Number(s.start_year || s.fiscal_year || fy());
      const until = Number(s.until_year || start);
      const total = Math.max(1, until - start);
      const left = Math.max(0, until - fy());
      const pct = Math.round(Math.min(1, left / total) * 100);
      return `<div class="wbar ${left > 0 ? '' : 'spent'}"><div class="wbar-fill" style="width:${pct}%"></div></div>
        <div class="wbar-meta" style="margin-top:5px;"><span>剩余 <b>${left}</b> 个财年 · 至财年 ${until}</span></div>`;
    };

    const sancRow = s => {
      const isOwner = me && s.owner_id === me.owner_id;
      const isTarget = me && s.target_id === me.owner_id;
      const expired = s.status === 'active' && Number(s.until_year) < fy();
      const active = s.status === 'active' && !expired;
      let act = expired
        ? '<span class="pill">已到期</span>'
        : `<span class="pill ${SANC_STATUS_PILL[s.status] || ''}">${SANC_STATUS[s.status] || s.status}</span>`;
      if (s.status === 'pending') {
        if (judge) act += ` <button class="btn primary sm" data-act="approveSanction" data-id="${s.id}" data-ok="1">批准</button>
                            <button class="btn ghost sm" data-act="approveSanction" data-id="${s.id}" data-ok="0">驳回</button>`;
        if (isOwner) act += ` <button class="btn ghost sm" data-act="liftSanction" data-id="${s.id}">撤回申请</button>`;
      } else if (active) {
        if (isTarget) act += ` <button class="btn danger sm" data-act="counterSanction" data-id="${s.id}">${Number(counterFor) === Number(s.id) ? '收起反制' : '发起反制'}</button>`;
        if (isOwner || judge) act += ` <button class="btn ghost sm" data-act="liftSanction" data-id="${s.id}">解除</button>`;
      }
      return `<tr>
        <td>${esc(s.company_name)} <span class="hint">→</span> ${esc(s.target_name)}${s.counter_of ? ' <span class="pill amber">反制</span>' : ''}</td>
        <td><span class="pill ${SANC_PILL[s.kind] || ''}">${SANC_LABEL[s.kind] || s.kind}</span></td>
        <td class="num">${s.kind === 'tariff' ? fmt(s.rate) + '%' : '—'}</td>
        <td style="min-width:150px;">${sancBar(s)}</td>
        <td style="font-size:12.5px;">${esc(s.reason || '—')}${s.approve_note ? `<div class="hint">裁定：${esc(s.approve_note)}</div>` : ''}</td>
        <td>${act}</td>
      </tr>`;
    };

    const SANC_THEAD = '<tr><th>施加方 → 对象</th><th>类型</th><th class="num">税率</th><th>剩余期限</th><th>理由 / 裁定</th><th>状态 / 操作</th></tr>';

    // 反制面板：被制裁方点「发起反制」后展开
    const cs = S.sanctions.find(s => Number(s.id) === Number(counterFor));
    const counterOpen = counterFor !== null && cs && cs.status === 'active'
      && me && cs.target_id === me.owner_id && Number(cs.until_year) >= fy();
    const counterCard = counterOpen ? `
    <div class="card audit">
      <h3>发起反制 · ${esc(cs.company_name)} 的${SANC_LABEL[cs.kind] || cs.kind}</h3>
      <p class="hint">反制同样需要组委会核准，批准后才生效。类型可以自选 —— 以关税对关税，也可以直接升级成全面禁运。</p>
      <div class="grid c3">
        <div class="field"><label>反制类型</label>
          <select id="ctKind">
            <option value="tariff"${cs.kind === 'tariff' ? ' selected' : ''}>关税壁垒</option>
            <option value="embargo"${cs.kind === 'embargo' ? ' selected' : ''}>全面禁运</option>
          </select></div>
        <div class="field"><label>关税率（%）</label><input id="ctRate" type="number" min="1" max="100" step="1" value="${cs.kind === 'tariff' ? Math.max(1, Math.round(Number(cs.rate) || 10)) : 15}"></div>
        <div class="field"><label>持续（财年）</label><input id="ctYears" type="number" min="1" max="5" step="1" value="2"></div>
      </div>
      <div class="field"><label>反制理由（可选）</label>
        <input id="ctReason" maxlength="200" value="${esc('对 ' + cs.company_name + ' 实施的' + (SANC_LABEL[cs.kind] || cs.kind) + '作出对等反制')}"></div>
      <div class="toolbar" style="border-top:1px solid var(--line-2);padding-top:14px;">
        <span class="hint">反制申请会与原制裁一起出现在组委会审批台中。</span>
        <span class="grow"></span>
        <button class="btn ghost" data-act="counterSanction" data-id="${cs.id}" data-cancel="1">取消</button>
        <button class="btn danger" data-act="counterSubmit" ${open ? '' : 'disabled'}>提交反制申请</button>
      </div>
    </div>` : '';

    // 组委会审批台
    const judgeDesk = judge ? `
    <div class="card audit">
      <h3>组委会审批台 <span class="pill amber">待批 ${pendingWars.length + pendingSanc.length} 项</span></h3>
      <p class="hint">宣战与贸易战<b>都必须先经组委会核准</b>才生效。批准宣战会立即划扣军费与 10% 战时动员税、给宣战方记 −5 信用分；驳回则申请作废，不产生任何费用。贸易战批准后按批准时的财年重新起算持续年限。</p>
      <h4 class="sub-h">待批宣战申请 <span class="pill amber">${pendingWars.length}</span></h4>
      ${pendingWars.length ? pendingWars.map(warBlock).join('') : '<p class="hint">当前没有待批的宣战申请。</p>'}
      <h4 class="sub-h">待批贸易战申请 <span class="pill amber">${pendingSanc.length}</span></h4>
      ${pendingSanc.length
        ? `<table><thead>${SANC_THEAD}</thead><tbody>${pendingSanc.map(sancRow).join('')}</tbody></table>`
        : '<p class="hint">当前没有待批的贸易战申请。</p>'}
    </div>` : '';

    const watch = judge
      ? S.wars.filter(w => w.status === 'declared' || w.status === 'fighting')
      : myLive;

    // ---------- 战时军需：把库存变成战力 ----------
    // 三条路径互补：① 交战方自己投料（最快，但吃自己的钱）
    //              ② 交战方挂军需订单（花现金买，第三方来供货，货款托管、战后自动退）
    //              ③ 政府拨军援（国库出钱，但有上限，逼政府在多方之间选边）
    const myWarIds = myLive.map(w => Number(w.id));
    const liveForMe = S.wars.filter(w => myWarIds.indexOf(Number(w.id)) >= 0);
    const allLive = S.wars.filter(w => WAR_LIVE.indexOf(w.status) >= 0);

    const wo = S.warOrders || [];
    const supplyLog = (S.warSupply || []).filter(s => me && s.owner_id === me.owner_id);
    const myWarOrders = wo.filter(o => me && o.owner_id === me.owner_id);
    const myOpenWarOrders = myWarOrders.filter(o => o.status === 'open' && Number(o.fiscal_year) === fy());
    // 我能供货的订单：别人挂的、还没满、财年内、且战争仍在打
    const feedable = wo.filter(o => (!me || o.owner_id !== me.owner_id)
      && o.status === 'open' && Number(o.fiscal_year) === fy()
      && S.wars.some(w => Number(w.id) === Number(o.war_id) && WAR_LIVE.indexOf(w.status) >= 0)
      && stockQty(o.kind, o.item_code) > 0);

    const supplyRate = Number((S.game && S.game.war_supply_rate) || 0.9);
    const myMatHold = (S.materials || []).filter(m => stockQty('material', m.code) > 0);
    const myProdHold = (S.products || []).filter(p => stockQty('product', p.code) > 0);

    const orderQtyLeft = o => Math.max(0, Number(o.qty) - Number(o.filled || 0));
    const orderPct = o => Math.max(0, Math.min(100, Math.round(Number(o.filled || 0) / Math.max(1, Number(o.qty)) * 100)));

    const WO_PILL = { open: 'amber', done: 'ok', closed: '', cancelled: '' };
    const WO_LABEL = { open: '求购中', done: '已满额', closed: '战争结束已关闭', cancelled: '已撤销' };

    const warName = id => {
      const w = S.wars.find(x => Number(x.id) === Number(id));
      return w ? (w.attacker_name + ' vs ' + w.defender_name) : ('战争 #' + id);
    };

    const myOrderRow = o => {
      const left = orderQtyLeft(o);
      const canCancel = o.status === 'open' && open;
      return `<tr>
        <td>${esc(warName(o.war_id))}<div class="hint">${o.side === 'attacker' ? '我方是攻方' : '我方是守方'}</div></td>
        <td>${o.kind === 'material' ? '原料' : '成品'} · ${esc(o.item_name || o.item_code)}</td>
        <td class="num">${fmt(o.filled || 0)} / ${fmt(o.qty)}</td>
        <td style="min-width:110px;"><div class="wbar ${o.status === 'done' ? 'done' : ''}"><div class="wbar-fill" style="width:${orderPct(o)}%"></div></div></td>
        <td class="num">${fmt(o.unit_price)} G</td>
        <td class="num">${fmt(o.escrow)} G</td>
        <td><span class="pill ${WO_PILL[o.status] || ''}">${WO_LABEL[o.status] || o.status}</span></td>
        <td>${canCancel ? `<button class="btn ghost sm" data-act="warOrderCancel" data-id="${o.id}">撤销退单</button>` : '<span class="hint">—</span>'}</td>
      </tr>`;
    };

    const feedRow = o => {
      const left = orderQtyLeft(o);
      const have = stockQty(o.kind, o.item_code);
      const price = o.kind === 'material'
        ? (matSpot(o.item_code) || 0)
        : (spotOf('PRD:' + o.item_code) || Number((S.products.find(p => p.code === o.item_code) || {}).ref_price) || 0);
      const vsMarket = price > 0 ? Math.round((Number(o.unit_price) / price - 1) * 100) : null;
      return `<tr>
        <td>${esc(warName(o.war_id))}<div class="hint">${esc(o.owner_name || '')}</div></td>
        <td>${o.kind === 'material' ? '原料' : '成品'} · ${esc(o.item_name || o.item_code)}</td>
        <td class="num">${fmt(left)}</td>
        <td class="num"><b>${fmt(o.unit_price)}</b> G
          ${vsMarket === null ? '' : `<div class="hint" style="color:${vsMarket >= 0 ? 'var(--up)' : 'var(--down)'};">${vsMarket >= 0 ? '高于' : '低于'}现价 ${Math.abs(vsMarket)}%</div>`}</td>
        <td class="num">我的库存 ${fmt(have)}</td>
        <td><div class="toolbar" style="gap:6px;">
          <input id="wf-${o.id}" type="number" min="1" max="${left}" step="1" value="${Math.min(have, left)}" style="width:78px;">
          <button class="btn primary sm" data-act="warOrderFill" data-id="${o.id}" ${open && have > 0 ? '' : 'disabled'}>交付</button>
        </div></td>
      </tr>`;
    };

    const WAR_THEAD = '<tr><th>战事</th><th>物资</th><th class="num">需求 / 已交</th><th>进度</th><th class="num">单价</th><th class="num">待付货款</th><th>状态</th><th>操作</th></tr>';

    const supplyCard = myLive.length ? `
    <div class="card">
      <h3>投入军需物资（把库存直接折成战力）</h3>
      <p class="hint">交战双方可以把<b>自己的库存</b>直接投进战场：按<b>当前市价的 ${Math.round(supplyRate * 100)}%</b> 折算成战力，立刻计入你这一方的累计战力。
        这是最快的加码方式，但物资一旦投出就<b>不再回来</b>（不是托管，是真消耗）—— 留着卖钱，还是换成胜负，你自己权衡。</p>
      <div class="grid c4">
        <div class="field"><label>投入哪场战事</label>
          <select id="wsWar">${myLive.map(w => `<option value="${w.id}">${esc(w.attacker_name)} vs ${esc(w.defender_name)}（${me && w.attacker_id === me.owner_id ? '我方攻' : '我方守'}）</option>`).join('')}</select></div>
        <div class="field"><label>物资类型</label>
          <select id="wsKind"><option value="material">原材料</option><option value="product">成品</option></select></div>
        <div class="field"><label>物资</label>
          <select id="wsItem">${myMatHold.map(m => `<option value="${esc(m.code)}">${esc(m.name)}（${fmt(stockQty('material', m.code))}）</option>`).join('')}</select></div>
        <div class="field"><label>投入数量</label><input id="wsQty" type="number" min="1" step="1" value="10"></div>
      </div>
      <div class="toolbar" style="border-top:1px solid var(--line-2);padding-top:14px;">
        <span class="hint">投入前请核对库存：原材料与成品的下拉项会随「物资类型」变化，切换类型后请重新查看可投清单。</span>
        <span class="grow"></span>
        <button class="btn danger" data-act="warSupp" ${open ? '' : 'disabled'}>投入军需（不可撤回）</button>
      </div>
      <h4 class="sub-h">我的投入记录 <span class="pill">${supplyLog.length}</span></h4>
      ${supplyLog.length ? `<table><thead><tr><th>战事</th><th>我方</th><th>物资</th><th class="num">数量</th><th class="num">折算战力</th><th>财年</th></tr></thead>
        <tbody>${supplyLog.slice(0, 20).map(s => `<tr>
          <td>${esc(warName(s.war_id))}</td>
          <td><span class="pill ${s.side === 'attacker' ? 'danger' : 'blue'}">${s.side === 'attacker' ? '攻方' : '守方'}</span></td>
          <td>${s.kind === 'material' ? '原料' : '成品'} · ${esc(matName(s.item_code) !== s.item_code ? matName(s.item_code) : prodName(s.item_code))}</td>
          <td class="num">${fmt(s.qty)}</td>
          <td class="num"><b>${fmt(s.value)}</b> G</td>
          <td>${s.fiscal_year || '—'}</td>
        </tr>`).join('')}</tbody></table>`
        : '<p class="hint">你还没有投入过军需物资。</p>'}
    </div>` : '';

    const warOrderCard = `
    <div class="card">
      <h3>军需订单（花现金买货 · 第三方来供货）</h3>
      <p class="hint">这是<b>战争与市场之间真正的接口</b>：交战方出钱挂买单，定品种、数量、单价，<b>货款挂单时全额从你的现金里托管</b>；
        全场任何公司（贸易商、制造商、甚至对手阵营的其他公司）都可以来交货赚钱，而<b>每交一笔货，就等于往你这一方加一份战力</b>。
        订单满额或战争结束即关闭，<b>未成交部分的托管货款在战争结束时自动全额退回</b>。每方每财年最多同时挂 4 笔。</p>
      ${myLive.length ? `
      <div class="grid c4">
        <div class="field"><label>为哪场战事采购</label>
          <select id="woWar">${myLive.map(w => `<option value="${w.id}">${esc(w.attacker_name)} vs ${esc(w.defender_name)}（${me && w.attacker_id === me.owner_id ? '我方攻' : '我方守'}）</option>`).join('')}</select></div>
        <div class="field"><label>物资类型</label>
          <select id="woKind"><option value="material">原材料</option><option value="product">成品</option></select></div>
        <div class="field"><label>物资</label>
          <select id="woItem">${(S.materials || []).map(m => `<option value="${esc(m.code)}">${esc(m.name)}</option>`).join('')}</select></div>
        <div class="field"><label>数量 / 单价（G）</label>
          <div class="toolbar" style="gap:6px;"><input id="woQty" type="number" min="1" step="1" value="20"><input id="woPrice" type="number" min="1" step="1" value="12"></div></div>
      </div>
      <div class="field"><label>备注（可选）</label><input id="woNote" maxlength="120" placeholder="例如：急用，当天交货加价"></div>
      <div class="toolbar" style="border-top:1px solid var(--line-2);padding-top:14px;">
        <span class="hint">定价低于市价没人接，定价高于市价会被抢单 —— 这就是战时的真实采购。</span>
        <span class="grow"></span>
        <button class="btn primary" data-act="warOrderCreate" ${open ? '' : 'disabled'}>挂军需买单（托管货款）</button>
      </div>` : '<p class="hint">你当前没有进行中的战事，无需采购军需。</p>'}
      <h4 class="sub-h">我发布的军需订单 <span class="pill">${myWarOrders.length}</span></h4>
      ${myWarOrders.length
        ? `<table><thead>${WAR_THEAD}</thead><tbody>${myWarOrders.slice(0, 20).map(myOrderRow).join('')}</tbody></table>`
        : '<p class="hint">你还没有发布过军需订单。</p>'}
    </div>

    <div class="card">
      <h3>军需供货（全场都能接的战争订单）<span class="pill amber">${feedable.length} 笔</span></h3>
      <p class="hint">战事一起，交战国就是<b>最不讲价的买家</b>。这里列的是全场交战方挂出的军需买单 —— 交货立刻收钱，
        而你的货会变成对方战场上的战力。<b>交战双方本人不能给自己的订单交货</b>（自有物资请用上面的「投入军需物资」）。</p>
      ${feedable.length
        ? `<table><thead><tr><th>战事 / 买家</th><th>物资</th><th class="num">剩余需求</th><th class="num">报价</th><th class="num">我的库存</th><th>交货</th></tr></thead>
           <tbody>${feedable.slice(0, 30).map(feedRow).join('')}</tbody></table>`
        : '<p class="hint">当前没有可承接的军需订单。战事一起，这里就会出现高价买单。</p>'}
    </div>`;

    const aidCard = (judge || (me && me.role === 'government')) ? `
    <div class="card audit">
      <h3>国库军援（政府在战事中选边）</h3>
      <p class="hint">政府可以从国库直接<b>拨款支援交战中的某一方</b>，这笔钱立刻计入该方的累计战力，等同于「用国库的钱替某一方加码」。
        但援助有硬上限：<b>不超过该方已投入军费（含自己投的物资）的 100%</b> —— 所以政府不能凭空造出一个赢家，只能扶一个已经在下本钱的人。
        国库是全场公用的，援了攻方就没钱援守方，也没钱发补贴 —— <b>每一次军援都是一次公开的站队</b>。</p>
      ${allLive.length ? `
      <div class="grid c4">
        <div class="field"><label>支援哪场战事</label>
          <select id="gaWar">${allLive.map(w => `<option value="${w.id}">${esc(w.attacker_name)} vs ${esc(w.defender_name)}</option>`).join('')}</select></div>
        <div class="field"><label>支援哪一方</label>
          <select id="gaSide"><option value="attacker">攻方</option><option value="defender">守方</option></select></div>
        <div class="field"><label>军援金额（国库金币）</label><input id="gaAmount" type="number" min="1" step="50" value="200"></div>
        <div class="field"><label>说明（可选）</label><input id="gaNote" maxlength="120" placeholder="例如：维护地区秩序"></div>
      </div>
      <div class="toolbar" style="border-top:1px solid var(--line-2);padding-top:14px;">
        <span class="hint">国库现有金币 <b>${fmt((S.gov && S.gov.cash) || (S.game && S.game.gov_cash) || 0)}</b> G。军援会即时公开通告全场。</span>
        <span class="grow"></span>
        <button class="btn teal" data-act="govAid" ${open ? '' : 'disabled'}>拨付军援（公开站队）</button>
      </div>` : '<p class="hint">当前没有正在进行的战事，无需军援。</p>'}
    </div>` : '';

    return `
    ${phaseNotice()}

    ${incoming.length ? `<div class="notice warn"><b>你已被宣战</b>：${incoming.map(w => esc(w.attacker_name) + '（军费 ' + fmt(w.stake) + ' G，' + (Number(w.rounds) || 1) + ' 轮）').join('；')}。到下面「进行中的战事」里应战或投降 —— 应战投入同等军费即打成平手，交战中双方都无法签新合同。</div>` : ''}
    ${onMe.length ? `<div class="notice warn"><b>你正被贸易制裁</b>：${onMe.map(s => `${esc(s.company_name)} 的 ${SANC_LABEL[s.kind] || s.kind}（至财年 ${s.until_year}）`).join('；')}。禁运会让交易彻底停摆，关税会从每笔合同里抽成（其中一半会蒸发）。你可以发起反制。</div>` : ''}
    ${(myPendWar.length + myPendSanc.length) ? `<div class="notice info"><b>你有 ${myPendWar.length + myPendSanc.length} 项申请正在等待组委会审批</b>${myCounterPend.length ? '（含 ' + myCounterPend.length + ' 项反制）' : ''}。批准前不会扣任何费用，也不会生效。</div>` : ''}
    ${myRejected.length ? `<div class="notice info">你最近有 <b>${myRejected.length}</b> 项宣战申请被组委会驳回，未产生任何费用。</div>` : ''}

    <div class="grid c4" style="margin-bottom:18px;">
      <div class="stat"><div class="k">针对我的宣战</div><div class="v" style="color:${incoming.length ? 'var(--danger)' : 'inherit'};">${incoming.length}<small>起</small></div><div class="n">${incoming.length ? '快去应战或投降' : '暂无战事'}</div></div>
      <div class="stat"><div class="k">交战中</div><div class="v" style="color:${myFighting.length ? 'var(--danger)' : 'inherit'};">${myFighting.length}<small>起</small></div><div class="n">${myFighting.length ? '逐轮推进，实时看进度' : '战事已平息'}</div></div>
      <div class="stat"><div class="k">我的申请待批</div><div class="v" style="color:${(myPendWar.length + myPendSanc.length) ? 'var(--amber)' : 'inherit'};">${myPendWar.length + myPendSanc.length}<small>项</small></div><div class="n">${myPendWar.length + myPendSanc.length ? '等待组委会核准' : '没有待批申请'}</div></div>
      <div class="stat"><div class="k">我施加的制裁</div><div class="v">${mySanc.length}<small>项</small></div><div class="n">生效中的关税 / 禁运</div></div>
    </div>

    ${judgeDesk}
    ${counterCard}

    <div class="card">
      <h3>申请发动战争（分轮交战 · 需组委会核准）</h3>
      <p class="hint">提交申请<b>不会立刻扣钱</b>：组委会核准后才划扣军费与 10% 战时动员税，宣战方信用分 −5。核准后对方应战即进入交战期，<b>交战期内双方都无法签署新合同</b>；共打若干轮，每轮按军费均摊消耗，逐轮推进、进度实时可见。</p>
      <p class="hint">结算规则：应战方投入 ≥ 宣战方军费 → 双方 1:1 对耗、打成平手；投入不足则宣战方胜 —— 差额按 <b>1.2 倍</b>索赔，先从对方现金划走，现金不够再按其库存估值搬走实物，同时宣战方信用 +8、败方 −12。</p>
      <div class="grid c4">
        <div class="field"><label>宣战对象</label>
          <select id="wrTarget">${partners.map(p => `<option value="${esc(p.owner_id)}">${esc(p.company_name)}（${ROLE_LABEL[p.role] || p.role}）</option>`).join('')}</select></div>
        <div class="field"><label>军费投入（金币）</label><input id="wrStake" type="number" min="1" step="50" value="300"></div>
        <div class="field"><label>交战轮数（1~5）</label><input id="wrRounds" type="number" min="1" max="5" step="1" value="3"></div>
        <div class="field"><label>宣战理由（可选）</label><input id="wrCause" maxlength="200" placeholder="例如：对方长期低价倾销"></div>
      </div>
      <div class="toolbar" style="border-top:1px solid var(--line-2);padding-top:14px;">
        <span class="hint">核准前撤回申请不产生任何费用；核准后撤军只能退回尚未消耗的军费。</span>
        <span class="grow"></span>
        <button class="btn danger" data-act="declareWar" ${open && partners.length ? '' : 'disabled'}>提交宣战申请</button>
      </div>
    </div>

    <div class="card">
      <h3>申请发动贸易战（需组委会核准）</h3>
      <p class="hint">
        <b>关税壁垒</b>：对方在制裁期内每签一份合同，都要按合同金额的百分比缴税；其中<b>一半归你，另一半作为贸易摩擦损耗直接蒸发</b>。<br>
        <b>全面禁运</b>：对方在制裁期内<b>无法与任何人达成新合同</b>（存量合同不受影响），是釜底抽薪的一招。<br>
        提交后同样要经组委会核准才生效；被制裁方可以发起<b>对等反制</b>。
      </p>
      <div class="grid c4">
        <div class="field"><label>制裁对象</label>
          <select id="scTarget">${partners.map(p => `<option value="${esc(p.owner_id)}">${esc(p.company_name)}（${ROLE_LABEL[p.role] || p.role}）</option>`).join('')}</select></div>
        <div class="field"><label>类型</label>
          <select id="scKind"><option value="tariff">关税壁垒</option><option value="embargo">全面禁运</option></select></div>
        <div class="field"><label>关税率（%）</label><input id="scRate" type="number" min="1" max="100" step="1" value="10"></div>
        <div class="field"><label>持续（1~5 财年）</label><input id="scYears" type="number" min="1" max="5" step="1" value="2"></div>
      </div>
      <div class="field"><label>理由（可选）</label><input id="scReason" maxlength="200" placeholder="例如：对方违反同盟约定，擅自降价"></div>
      <div class="toolbar" style="border-top:1px solid var(--line-2);padding-top:14px;">
        <span class="hint">同一对象、同类型的制裁不能叠加；驳回不产生任何效果，政府与裁判可随时解除。</span>
        <span class="grow"></span>
        <button class="btn danger" data-act="imposeSanction" ${open && partners.length ? '' : 'disabled'}>提交贸易战申请</button>
      </div>
    </div>

    <div class="card">
      <h3>${judge ? '全场进行中的战事' : '进行中的战事'}</h3>
      <p class="hint">战事按轮推进：每轮双方各消耗「军费 ÷ 轮数」。全部轮次打完后按累计投入判负 —— 投入少的一方要按差额的 1.2 倍赔偿。</p>
      ${watch.length ? watch.map(warBlock).join('') : '<p class="hint">当前没有进行中的战事。被宣战后你可以「应战」并填写愿意投入的军费；填 0 等于投降。</p>'}
    </div>

    ${supplyCard}
    ${warOrderCard}
    ${aidCard}

    <div class="card">
      <h3>贸易战 / 制裁清单</h3>
      <p class="hint">含待批、生效中与历史记录。剩余期限条按当前财年实时计算。</p>
      <table>
        <thead>${SANC_THEAD}</thead>
        <tbody>${S.sanctions.length ? S.sanctions.slice(0, 40).map(sancRow).join('') : `<tr><td colspan="6" class="empty">全场还没有发生过贸易战</td></tr>`}</tbody>
      </table>
    </div>

    <div class="card">
      <h3>全场战史（含已结束）</h3>
      <table>
        <thead><tr><th>交战方</th><th class="num">宣战方军费</th><th class="num">应战方投入</th><th>结果</th><th class="num">掠夺现金</th><th>状态</th><th>理由 / 战报</th></tr></thead>
        <tbody>${S.wars.length ? S.wars.slice(0, 40).map(w => `<tr>
          <td>${esc(w.attacker_name)} <span class="hint">→</span> ${esc(w.defender_name)}</td>
          <td class="num">${fmt(w.stake)}</td>
          <td class="num">${fmt(w.defender_stake)}</td>
          <td>${w.result ? `<span class="pill ${w.result === 'attacker_win' ? 'danger' : 'ok'}">${WAR_RESULT[w.result] || w.result}</span>` : '—'}</td>
          <td class="num">${fmt(w.loot_cash)}</td>
          <td><span class="pill ${WAR_PILL[w.status] || ''}">${WAR_LABEL[w.status] || w.status}</span></td>
          <td style="font-size:12.5px;">${esc(w.cause || '—')}${w.loot_note ? `<div class="hint" style="margin:2px 0 0;">${esc(w.loot_note)}</div>` : ''}</td>
        </tr>`).join('') : `<tr><td colspan="7" class="empty">全场还没有发生过战争</td></tr>`}</tbody>
      </table>
    </div>`;
  }

  // ---------- 视图：公司名录（信用档案） ----------
  function viewCompanies() {
    const rows = S.players.slice().sort((a, b) => netWorthOf(b) - netWorthOf(a));
    const creditOf = p => Number(p.credit_score == null ? 100 : p.credit_score);
    const creditPill = c => c >= 110 ? 'ok' : (c >= 90 ? 'blue' : (c >= 70 ? 'amber' : 'danger'));
    const creditWord = c => c >= 110 ? '信誉卓著' : (c >= 90 ? '正常' : (c >= 70 ? '有违约记录' : '信用受损'));

    const debtsOf = id => S.loans.filter(l => l.borrower_id === id);
    const lendedOf = id => S.loans.filter(l => l.lender_id === id);
    const warsOf = id => S.wars.filter(w => w.status === 'settled' && (w.attacker_id === id || w.defender_id === id));
    const winOf = id => S.wars.filter(w => w.status === 'settled'
      && ((w.attacker_id === id && w.result === 'attacker_win') || (w.defender_id === id && w.result === 'draw'))).length;

    return `
    ${phaseNotice()}
    <div class="card">
      <h3>公司名录 · 信用档案</h3>
      <p class="hint">
        全场所有已注册公司的公开档案。信用分起始 100：借款按时结清 +5，被强制执行 -30。
        和陌生人做生意的第一件事，就是先看这里。
      </p>
      <table>
        <thead><tr><th>公司</th><th>角色</th><th class="num">现金</th><th class="num">净资产</th><th class="num">信用分</th><th class="num">借入 / 出借</th><th class="num">参战 / 胜</th><th>状态</th></tr></thead>
        <tbody>${rows.map(p => {
          const c = creditOf(p);
          const b = boardRow(p.owner_id);
          const isMine = me && p.owner_id === me.owner_id;
          const debt = debtsOf(p.owner_id).filter(l => l.status === 'active' || l.status === 'seize_req').length;
          return `<tr${isMine ? ' style="background:var(--primary-soft);"' : ''}>
            <td><b>${esc(p.company_name)}</b>${isMine ? ' <span class="pill blue">我</span>' : ''}</td>
            <td><span class="pill ${ROLE_PILL[p.role] || ''}">${ROLE_LABEL[p.role] || p.role}</span></td>
            <td class="num">${fmt(b ? b.cash : p.cash)}</td>
            <td class="num"><b>${fmt(netWorthOf(p))}</b></td>
            <td class="num"><span class="pill ${creditPill(c)}">${c}</span></td>
            <td class="num">${debtsOf(p.owner_id).length} / ${lendedOf(p.owner_id).length}</td>
            <td class="num">${warsOf(p.owner_id).length} / ${winOf(p.owner_id)}</td>
            <td style="font-size:12.5px;">${creditWord(c)}${debt ? ` · <span class="pill danger">在贷 ${debt} 笔</span>` : ''}</td>
          </tr>`;
        }).join('') || `<tr><td colspan="8" class="empty">还没有公司注册</td></tr>`}</tbody>
      </table>
    </div>

    <div class="card">
      <h3>信用记录明细</h3>
      <table>
        <thead><tr><th>借款人</th><th>出借人</th><th class="num">本金</th><th class="num">应还</th><th>到期财年</th><th>状态</th></tr></thead>
        <tbody>${S.loans.length ? S.loans.filter(l => l.status !== 'open').slice(0, 50).map(l => `<tr>
          <td>${esc(l.borrower_name || l.company_name || '—')}</td>
          <td>${esc(l.lender_name || '—')}</td>
          <td class="num">${fmt(l.principal)}</td>
          <td class="num">${fmt(Number(l.principal) * (1 + Number(l.rate) / 100 * Number(l.term_years)))}</td>
          <td>财年 ${l.due_year || '—'}</td>
          <td><span class="pill ${LOAN_PILL[l.status] || ''}">${LOAN_LABEL[l.status] || l.status}</span></td>
        </tr>`).join('') : `<tr><td colspan="6" class="empty">还没有产生任何借贷记录</td></tr>`}</tbody>
      </table>
    </div>`;
  }

  // ---------- 视图：研发中心（制造商） ----------
  function viewRD() {
    const mine = S.rd.filter(r => me && r.owner_id === me.owner_id);
    const mats = S.stock.filter(s => s.kind === 'material' && Number(s.qty) > 0);
    const r = S.rules || {};
    const sMin = isFinite(Number(r.rd_sec_min)) ? Number(r.rd_sec_min) : 0.2;
    const sMax = isFinite(Number(r.rd_sec_max)) ? Number(r.rd_sec_max) : 60;
    const sDflt = Math.min(sMax, Math.max(sMin, 2));
    const qDflt = ruleMaxQty();
    return `
    ${phaseNotice()}
    <div class="card">
      <h3>研发中心</h3>
      <p class="hint">设计属于你自己的产品。配方只能从<b>你库存里现有的原材料</b>中挑选 —— 先去「原材料市场」备料。提交后要等政府审批通过，才能到生产中心投产。</p>
      <div class="grid c4">
        <div class="field"><label>产品名称</label><input id="rdName" maxlength="20" placeholder="例如：双芯石英钟"></div>
        <div class="field"><label>预期可产（最多可产）</label><input id="rdExpect" type="number" min="1" max="999" step="1" value="${qDflt}"></div>
        <div class="field"><label>试产数量（供政府参考）</label><input id="rdQty" type="number" min="1" step="1" value="10"></div>
        <div class="field"><label>预计单件生产工时（秒）</label><input id="rdSec" type="number" min="${sMin}" max="${sMax}" step="0.1" value="${fmt(sDflt, 1)}"></div>
      </div>
      <p class="hint"><b>「预期可产」就是这款产品将来的「最多可产」</b> —— 审批通过后它会固化下来，成为生产中心里这款产品<i>单笔最多能投多少件</i>的上限（比如填 50，就一次最多投 50 件，想多产就分几批继续投）。全场默认值是 <b>${qDflt}</b> 件，组委会事后还能单独调整。范围 1 – 999 件。</p>
      <p class="hint">「单件工时」是你要向政府申报的<b>工艺节拍</b>，审批通过后会固化成这款产品的量产工时：做得越精细（工时越长）单件越慢，一批货要等的时间也越久。<span id="rdPace">按当前填法：量产 100 件约等 ${fmtDur(prodLine(100, null))}，500 件约等 ${fmtDur(prodLine(500, null))}。</span>范围 ${sMin} – ${sMax} 秒。政府审批时会重点看这一项是否与配方难度相称。</p>
      <div class="field"><label>创意说明（可选）</label><textarea id="rdDesc" placeholder="说说这个产品的卖点、用料思路，会一并提交给政府作为审批依据…"></textarea></div>
      <div class="field"><label>配方 —— 只用你库存里有的材料</label>
        ${mats.length ? `<div class="grid c3">${mats.map(s => `
          <div class="field" style="margin-bottom:8px;">
            <label>${esc(matName(s.item_code))}（库存 ${fmt(s.qty)}）</label>
            <input class="rd-mat" data-code="${esc(s.item_code)}" type="number" min="0" step="1" value="0">
          </div>`).join('')}</div>` : `<div class="empty">你的库存里还没有原材料。先去「原材料市场」采购，研发配方只能从库存现有材料里选。</div>`}
      </div>
      <div class="toolbar" style="border-top:1px solid var(--line-2);padding-top:14px;">
        <span class="hint">填写该材料<b>每生产 1 件</b>需要消耗的数量，不需要的填 0。</span>
        <span class="grow"></span>
        <button class="btn primary" data-act="submitRD" ${isOpen() && mats.length ? '' : 'disabled'}>提交研发申请</button>
      </div>
    </div>

    <div class="card">
      <h3>我的研发产品</h3>
      <p class="hint">审批通过的产品会出现在「生产中心」，可随时投产。投产按<b>核定单件工时</b>计时，完工后${autoList() ? '自动挂到交易所盘口' : '只进库存（当前手动上架）'}并通知所有贸易商。</p>
      <table>
        <thead><tr><th>产品</th><th>配方（单件用料）</th><th class="num">单位成本</th><th class="num">单件工时</th><th class="num">最多可产</th><th class="num">成品库存</th><th>状态</th><th>政府评语</th></tr></thead>
        <tbody>${mine.length ? mine.map(r => {
          const approved = r.status === 'approved' && r.product_code;
          const ps = approved ? perUnitSec(r.product_code) : Number(r.plan_seconds || 0);
          const capShown = approved
            ? maxProducible(r.product_code) + '（上限 ' + productMaxQty(r.product_code) + '）'
            : (Number(r.expect_qty) > 0 ? '申报 ' + Math.floor(Number(r.expect_qty)) : '—');
          return `
          <tr>
            <td><b>${esc(r.product_name)}</b>${r.product_desc ? `<div class="hint" style="margin:2px 0 0;">${esc(r.product_desc)}</div>` : ''}</td>
            <td style="font-size:12.5px;">${recipeText(r.recipe)}</td>
            <td class="num">${fmt(r.unit_cost)}</td>
            <td class="num">${ps > 0 ? fmt(ps, 1) + ' 秒' : '—'}${approved ? '' : ' <span class="hint">申报</span>'}</td>
            <td class="num">${capShown}</td>
            <td class="num">${r.product_code ? fmt(stockQty('product', r.product_code)) : '—'}</td>
            <td><span class="pill ${RD_PILL[r.status] || ''}">${RD_LABEL[r.status] || r.status}</span></td>
            <td style="color:var(--muted);">${esc(r.gov_note || '—')}</td>
          </tr>`; }).join('') : `<tr><td colspan="8" class="empty">还没有提交过研发申请</td></tr>`}</tbody>
      </table>
    </div>`;
  }

  // ---------- 视图：路演中心（贸易商） ----------
  function viewPitch() {
    const mine = S.pitch.filter(p => me && p.owner_id === me.owner_id);
    return `
    ${phaseNotice()}
    <div class="notice info">路演是贸易商拿政府订单的通道。提交方案后政府会给出<b>收购报价</b>（单价 + 数量上限 + 结算货币），你再到「政府市场」按报价交付。</div>

    <div class="card">
      <h3>提交路演方案</h3>
      <p class="hint">线上填方案、线下上台讲，两种都行。方案对全场公开，政府据此定价。</p>
      <div class="grid c2">
        <div class="field"><label>路演主题</label><input id="ptTitle" maxlength="40" placeholder="例如：城市应急照明整体解决方案"></div>
        <div class="field"><label>主推产品</label>
          <select id="ptProduct">${S.products.map(p => `<option value="${p.code}">${esc(p.name)}</option>`).join('')}</select></div>
      </div>
      <div class="grid c2">
        <div class="field"><label>可供数量</label><input id="ptQty" type="number" min="1" step="1" value="10"></div>
        <div class="field"><label>期望单价（金币）</label><input id="ptAsk" type="number" min="1" step="1" value="120"></div>
      </div>
      <div class="field"><label>方案说明（至少 10 个字）</label><textarea id="ptText" placeholder="讲清产品价值、供货能力、交付方案…"></textarea></div>
      <div class="field"><label>图片 / 视频链接（可选）</label><input id="ptLink" placeholder="https://…"></div>
      <button class="btn primary" data-act="pitchSubmit" ${isOpen() && S.products.length ? '' : 'disabled'}>提交路演方案</button>
    </div>

    <div class="card">
      <h3>我的路演记录</h3>
      <table>
        <thead><tr><th>主题</th><th>主推</th><th class="num">可供</th><th class="num">期望价</th><th>状态</th><th class="num">政府报价</th><th class="num">已交付</th><th>政府评语</th></tr></thead>
        <tbody>${mine.length ? mine.map(p => `
          <tr>
            <td><b>${esc(p.title)}</b>${p.link ? ` <a href="${esc(p.link)}" target="_blank" rel="noopener" style="font-size:12px;">链接</a>` : ''}</td>
            <td>${esc(prodName(p.product_code))}</td>
            <td class="num">${fmt(p.qty)}</td>
            <td class="num">${fmt(p.ask_price)}</td>
            <td><span class="pill ${PITCH_PILL[p.status] || ''}">${PITCH_LABEL[p.status] || p.status}</span></td>
            <td class="num">${p.quote_price ? fmt(p.quote_price) + ' ' + (CUR_SIGN[p.quote_currency] || '') : '—'}</td>
            <td class="num">${fmt(p.sold_qty)}${p.quote_qty ? ' / ' + fmt(p.quote_qty) : ''}</td>
            <td style="color:var(--muted);">${esc(p.gov_note || '—')}</td>
          </tr>`).join('') : `<tr><td colspan="8" class="empty">还没有提交过路演</td></tr>`}</tbody>
      </table>
    </div>

    <div class="card">
      <h3>全场路演</h3>
      <p class="hint">看看对手在推什么。贸易商之间是竞争关系，但也可以联手组货、共同投标。</p>
      ${S.pitch.length ? S.pitch.map(p => `
        <div class="feed-item">
          <h4>${esc(p.title)} <span class="pill ${PITCH_PILL[p.status] || ''}">${PITCH_LABEL[p.status] || p.status}</span></h4>
          <div class="meta">${esc(p.company_name || '—')} · 主推 ${esc(prodName(p.product_code))} · 可供 ${fmt(p.qty)} · 期望 ${fmt(p.ask_price)} G · 财年 ${p.fiscal_year}</div>
          <p>${esc(p.pitch_text || '')}</p>
        </div>`).join('') : `<div class="empty">暂时还没有路演</div>`}
    </div>`;
  }

  // ---------- 视图：政府市场（贸易商） ----------
  // ---------- 视图：产业协作（代工订单 + 专利授权） ----------
  // 补上产业链里两个天然错配：① 有配方没产能（研发方想出货却没工厂）
  //                          ② 有产能没订单（工厂不想押资金囤料，只想赚加工费）
  function viewCoop() {
    const open = isOpen();
    const uid = me ? me.owner_id : null;
    const prods = S.products || [];
    const oemAll = S.oem || [];
    const licAll = S.licenses || [];

    const mfrs = S.players.filter(p => p.role === 'manufacturer' && p.owner_id !== uid);
    const myProds = prods.filter(p => p.owner_id === uid);
    const licensed = licAll.filter(l => l.licensee_id === uid && l.status === 'active' && Number(l.expire_year) >= fy())
      .map(l => l.product_code);

    const outOrders = oemAll.filter(o => o.buyer_id === uid);
    const inOrders = oemAll.filter(o => o.factory_id === uid);
    const outLic = licAll.filter(l => l.licensor_id === uid);
    const inLic = licAll.filter(l => l.licensee_id === uid);
    const openOut = outOrders.filter(o => o.status === 'open');
    const openIn = inOrders.filter(o => o.status === 'open');

    const OEM_LABEL = { open: '待开工', done: '已完成', cancelled: '已撤销' };
    const OEM_PILL = { open: 'amber', done: 'ok', cancelled: '' };
    const LIC_LABEL = { active: '生效中', revoked: '已撤销', expired: '已到期' };
    const LIC_PILL = { active: 'ok', revoked: '', expired: '' };

    const myMats = (S.materials || []).filter(m => stockQty('material', m.code) > 0);

    const oemTable = (list, side) => {
      if (!list.length) return `<p class="hint">${side === 'out' ? '你还没有委托过别人代工。' : '还没有人委托你代工。'}</p>`;
      return `<table>
        <thead><tr><th>${side === 'out' ? '代工厂' : '委托方'}</th><th>产品</th><th class="num">数量</th><th class="num">加工费托管</th><th class="num">原料估值</th><th>状态</th><th>操作</th></tr></thead>
        <tbody>${list.map(o => {
          const canRun = side === 'in' && o.status === 'open' && open && Number(o.fiscal_year) === fy();
          const canCancel = o.status === 'open' && open;
          const stale = o.status === 'open' && Number(o.fiscal_year) !== fy();
          return `<tr>
            <td>${esc(side === 'out' ? (o.factory_name || '—') : (o.buyer_name || '—'))}</td>
            <td>${esc(o.product_name || prodName(o.product_code))}</td>
            <td class="num">${fmt(o.qty)}</td>
            <td class="num">${fmt(o.fee_per_unit)} / 件<br><b>${fmt(o.fee_total)}</b> G</td>
            <td class="num">${fmt(o.mat_value)}</td>
            <td><span class="pill ${OEM_PILL[o.status] || ''}">${OEM_LABEL[o.status] || o.status}</span>
              ${stale ? '<div class="hint">已跨年，请撤销重下</div>' : ''}</td>
            <td>${canRun ? `<button class="btn primary sm" data-act="oemRun" data-id="${o.id}">开工生产</button>` : ''}
                ${canCancel ? `<button class="btn ghost sm" data-act="oemCancel" data-id="${o.id}">撤销</button>` : ''}
                ${!canRun && !canCancel ? '<span class="hint">—</span>' : ''}</td>
          </tr>`;
        }).join('')}</tbody>
      </table>`;
    };

    const licTable = (list, side) => {
      if (!list.length) return `<p class="hint">${side === 'out' ? '你还没有授权别人生产。' : '你还没有拿到别人的生产许可。'}</p>`;
      const rows = list.map(l => {
        const expired = Number(l.expire_year) < fy();
        const st = (l.status === 'active' && expired) ? 'expired' : l.status;
        const canRevoke = side === 'out' && l.status === 'active' && !expired && open;
        return `<tr>
          <td>${esc(l.product_name || prodName(l.product_code))}</td>
          <td>${esc(side === 'out' ? (l.licensee_name || '—') : (l.licensor_name || '—'))}</td>
          <td class="num">${fmt(l.fee_per_unit)} G / 件</td>
          <td class="num">${fmt(l.upfront)} G</td>
          <td>至财年 ${l.expire_year || '—'}</td>
          <td><span class="pill ${LIC_PILL[st] || ''}">${LIC_LABEL[st] || st}</span></td>
          <td>${canRevoke ? `<button class="btn ghost sm" data-act="licRevoke" data-id="${l.id}">撤销授权</button>` : '<span class="hint">—</span>'}</td>
        </tr>`;
      }).join('');
      return `<table>
        <thead><tr><th>产品</th><th>${side === 'out' ? '被授权方' : '授权方'}</th><th class="num">每件提成</th><th class="num">一次性授权费</th><th>有效期</th><th>状态</th><th>操作</th></tr></thead>
        <tbody>${rows}</tbody></table>`;
    };

    const canOem = open && mfrs.length > 0 && prods.length > 0;

    return `
    ${phaseNotice()}

    <div class="grid c4" style="margin-bottom:18px;">
      <div class="stat"><div class="k">我下的代工单</div><div class="v">${outOrders.length}<small>笔</small></div><div class="n">${openOut.length ? openOut.length + ' 笔待工厂开工' : '当前没有在办'}</div></div>
      <div class="stat"><div class="k">我接的代工单</div><div class="v" style="color:${openIn.length ? 'var(--amber)' : 'inherit'};">${inOrders.length}<small>笔</small></div><div class="n">${openIn.length ? openIn.length + ' 笔等你开工' : '暂无待开工'}</div></div>
      <div class="stat"><div class="k">我授权的产品</div><div class="v">${outLic.filter(l => l.status === 'active').length}<small>项</small></div><div class="n">每投产一件自动提成</div></div>
      <div class="stat"><div class="k">我获授的产品</div><div class="v">${licensed.length}<small>项</small></div><div class="n">已获授权的可直接生产</div></div>
    </div>

    <div class="notice info">
      <b>产业协作解决两件事</b>：<b>没工厂也能出货</b> —— 你出原料、付加工费，委托别人的工厂生产，成品直接进你的库；
      <b>有工厂不用押钱</b> —— 你只出产能，原料和加工费都由委托方先托管，零风险纯赚加工费。
      另外，你研发的产品可以<b>授权给别人生产</b>，收一次性授权费 + 每件提成，等于把配方变成长期现金流。
    </div>

    <div class="card">
      <h3>委托代工（我出货 · 别人出产能）</h3>
      <p class="hint">下单时<b>原料会被立刻从你的库存划走并托管</b>，加工费也会先扣到你这边，等工厂「开工生产」后成品直接入库、钱才付给工厂。
      工厂拒绝或你撤单，原料与加工费<b>全额退回</b>。每财年同时挂单上限 6 笔。</p>
      <div class="grid c4">
        <div class="field"><label>代工厂</label>
          <select id="ocFactory">${mfrs.map(f => `<option value="${esc(f.owner_id)}">${esc(f.company_name)}</option>`).join('')}</select></div>
        <div class="field"><label>产品</label>
          <select id="ocProduct">${prods.map(p => `<option value="${esc(p.code)}">${esc(p.name)}${p.owner_id ? (p.owner_id === uid ? '（我研发）' : (licensed.indexOf(p.code) >= 0 ? '（已获授权）' : '（需授权）')) : '（基础产品）'}</option>`).join('')}</select></div>
        <div class="field"><label>数量</label><input id="ocQty" type="number" min="1" max="999" step="1" value="10"></div>
        <div class="field"><label>加工费（G / 件）</label><input id="ocFee" type="number" min="0" step="1" value="8"></div>
      </div>
      <div class="field"><label>备注（可选）</label><input id="ocNote" maxlength="120" placeholder="例如：急单，本周内交货"></div>
      <div class="toolbar" style="border-top:1px solid var(--line-2);padding-top:14px;">
        <span class="hint">注意：<b>其他公司研发的产品</b>需要代工厂持有该产品的专利授权，或由权利人本人下单，否则会被拒绝。</span>
        <span class="grow"></span>
        <button class="btn primary" data-act="oemCreate" ${canOem ? '' : 'disabled'}>下单托管</button>
      </div>
      <h4 class="sub-h">我的原材料（下单前自查）</h4>
      ${myMats.length
        ? `<table><thead><tr><th>原材料</th><th class="num">我的库存</th><th class="num">现价</th></tr></thead><tbody>${myMats.map(m => `<tr><td>${esc(m.name)}</td><td class="num">${fmt(stockQty('material', m.code))}</td><td class="num">${fmt(matSpot(m.code) || m.price)}</td></tr>`).join('')}</tbody></table>`
        : '<p class="hint">你手上没有原材料。先到「原材料市场」或「物品交易所」补料，代工的原料必须由下单方提供。</p>'}
    </div>

    <div class="card">
      <h3>我下的代工订单 <span class="pill">${outOrders.length}</span></h3>
      ${oemTable(outOrders, 'out')}
    </div>

    <div class="card">
      <h3>我接的代工订单 ${openIn.length ? `<span class="pill amber">${openIn.length} 笔待开工</span>` : ''}</h3>
      <p class="hint">原料和加工费都已经由委托方托管，你只要点「开工生产」——成品直接进对方的库，加工费立刻到你账上。</p>
      ${oemTable(inOrders, 'in')}
    </div>

    <div class="card">
      <h3>专利授权（把配方变成长期现金流）</h3>
      <p class="hint">你研发的产品默认只有你能生产。授权给别的制造商后，对方每次投产都会<b>自动把每件提成打给你</b>，一次性授权费在下发授权时立即结算。
      授权只约束「新生产」，不影响既有库存；撤销授权后对方不能再新投产，已产出的货不受影响。</p>
      ${myProds.length ? `
      <div class="grid c4">
        <div class="field"><label>授权产品</label>
          <select id="lcProduct">${myProds.map(p => `<option value="${esc(p.code)}">${esc(p.name)}</option>`).join('')}</select></div>
        <div class="field"><label>被授权制造商</label>
          <select id="lcLicensee">${mfrs.map(f => `<option value="${esc(f.owner_id)}">${esc(f.company_name)}</option>`).join('')}</select></div>
        <div class="field"><label>每件提成（G）</label><input id="lcFee" type="number" min="0" step="1" value="5"></div>
        <div class="field"><label>一次性授权费（G）</label><input id="lcUpfront" type="number" min="0" step="50" value="0"></div>
      </div>
      <div class="field" style="max-width:220px;"><label>授权年限（1~5 财年）</label><input id="lcYears" type="number" min="1" max="5" step="1" value="2"></div>
      <div class="toolbar" style="border-top:1px solid var(--line-2);padding-top:14px;">
        <span class="hint">一次性授权费与每件提成不能同时为 0 —— 否则属于白送配方。</span>
        <span class="grow"></span>
        <button class="btn primary" data-act="licGrant" ${(open && mfrs.length) ? '' : 'disabled'}>下发授权</button>
      </div>` : '<p class="hint">你目前还没有自己研发的产品。到「研发中心」立项并通过审批后，就能把配方授权给别的制造商收提成。</p>'}
    </div>

    <div class="card">
      <h3>我发出的授权 <span class="pill">${outLic.filter(l => l.status === 'active').length} 项生效中</span></h3>
      ${licTable(outLic, 'out')}
    </div>

    <div class="card">
      <h3>我获得的授权 <span class="pill">${licensed.length} 项可用</span></h3>
      <p class="hint">有了授权，你就能在「生产中心」直接生产对方研发的产品，每投产一件会自动扣一笔提成给对方。</p>
      ${licTable(inLic, 'in')}
    </div>`;
  }

  function viewGovMarket() {
    const y = fy();
    const quoted = S.pitch.filter(p => me && p.owner_id === me.owner_id && p.status === 'quoted');
    const done = S.pitch.filter(p => me && p.owner_id === me.owner_id && Number(p.sold_qty) > 0);
    const procure = (S.procure || []).filter(p => Number(p.fiscal_year) === Number(y) && p.status === 'open'
      && (!p.target_owner || (me && p.target_owner === me.owner_id)));
    const policies = (S.policies || []).filter(p => Number(p.fiscal_year) === Number(y) && p.status === 'active');
    const grant = policies.find(p => p.kind === 'grant' && Number(p.cost) > 0);
    const subsidy = policies.find(p => p.kind === 'subsidy' && Number(p.cost) > 0);
    const polKindLabel = { subsidy: '产业补贴', grant: '出口奖励', quota: '原料配额', infra: '基建投资' };
    const polText = p => p.kind === 'subsidy' ? ('每件投产补 ' + fmt(p.amount) + ' G')
      : p.kind === 'grant' ? ('对政府交付额外 +' + fmt(p.rate, 1) + '%')
      : p.kind === 'quota' ? (matName(p.product_code) + ' 下财年供给 +' + fmt(p.rate, 1) + '%')
      : ('内销收购价 +' + fmt(p.rate, 1) + '%');

    return `
    ${phaseNotice()}
    <div class="notice info">这里是政府的钱袋子。<b>路演报价</b>是政府对你方案的出价；<b>采购招标</b>是政府主动挂出的买单，谁有货谁先交、交完即付。结算到手的可能是<b>外币</b>，可以到「外汇兑换」换回金币。</div>

    ${policies.length ? `<div class="card">
      <h3>本财年现行政策 <span class="hint">（政府颁布，全场适用）</span></h3>
      <table>
        <thead><tr><th>类型</th><th>政策</th><th>内容</th><th class="num">剩余资金池</th></tr></thead>
        <tbody>${policies.map(p => `<tr>
          <td><span class="pill blue">${esc(polKindLabel[p.kind] || p.kind)}</span></td>
          <td><b>${esc(p.title)}</b>${p.body ? `<div class="hint" style="margin:2px 0 0;">${esc(p.body)}</div>` : ''}</td>
          <td>${esc(polText(p))}</td>
          <td class="num">${Number(p.cost) > 0 ? fmt(p.cost) + ' G' : '—'}</td>
        </tr>`).join('')}</tbody>
      </table>
      <p class="hint">资金池用完政策就自动结束 —— 想拿补贴 / 奖励的，动作要快。</p>
    </div>` : ''}

    <div class="card">
      <h3>政府采购招标 <span class="hint">（${procure.length} 笔在办，先到先得）</span></h3>
      ${grant ? `<div class="notice ok" style="margin:0 0 12px;">现行「出口奖励」政策有效：每笔对政府交付额外奖励 <b>${fmt(grant.rate, 1)}%</b>（资金池还剩 ${fmt(grant.cost)} G）。</div>` : ''}
      <table>
        <thead><tr><th>产品</th><th class="num">政府单价</th><th>结算</th><th class="num">剩余可交付</th><th class="num">我的库存</th><th class="num">折合金币/件</th><th style="width:200px;">交付</th></tr></thead>
        <tbody>${procure.length ? procure.map(p => {
          const left = Math.max(0, Number(p.qty) - Number(p.filled));
          const have = stockQty('product', p.product_code);
          const cap = Math.max(0, Math.min(Math.floor(have), Math.floor(left)));
          const unit = Number(p.unit_price) * (p.currency === 'G' ? 1 : fxRate(p.currency));
          return `<tr>
            <td><b>${esc(prodName(p.product_code))}</b>${p.note ? `<div class="hint" style="margin:2px 0 0;">${esc(p.note)}</div>` : ''}</td>
            <td class="num">${fmt(p.unit_price)} ${CUR_SIGN[p.currency] || ''}</td>
            <td><span class="pill amber">${curLabel(p.currency)}</span></td>
            <td class="num">${fmt(left)}</td>
            <td class="num">${fmt(have)}</td>
            <td class="num"><b>${fmt(unit)}</b></td>
            <td><div class="toolbar" style="margin:0;">
              <input class="qty" id="pf-${p.id}" type="number" min="1" step="1" value="${Math.max(1, Math.min(5, cap))}" ${isOpen() && cap > 0 ? '' : 'disabled'}>
              <button class="btn teal sm" data-act="procFill" data-id="${p.id}" ${isOpen() && cap > 0 ? '' : 'disabled'}>交付</button>
            </div></td>
          </tr>`;
        }).join('') : `<tr><td colspan="7" class="empty">当前没有在办的政府招标。政府发布后会出现在这里，并给你发站内邮件。</td></tr>`}</tbody>
      </table>
    </div>

    <div class="card">
      <h3>可交付的政府订单（路演报价单）</h3>
      ${subsidy ? `<div class="notice ok" style="margin:0 0 12px;">现行「产业补贴」政策有效：制造商每投产一件 ${esc(prodName(subsidy.product_code))} 可领 ${fmt(subsidy.amount)} G（资金池还剩 ${fmt(subsidy.cost)} G）。</div>` : ''}
      <table>
        <thead><tr><th>路演主题</th><th>产品</th><th class="num">政府单价</th><th>结算货币</th><th class="num">剩余可交付</th><th class="num">我的库存</th><th class="num">折合金币/件</th><th style="width:200px;">交付</th></tr></thead>
        <tbody>${quoted.length ? quoted.map(p => {
          const left = Number(p.quote_qty) - Number(p.sold_qty);
          const have = stockQty('product', p.product_code);
          const cap = Math.max(0, Math.min(Math.floor(have), Math.floor(left)));
          const unit = Number(p.quote_price) * fxRate(p.quote_currency);
          return `<tr>
            <td><b>${esc(p.title)}</b></td>
            <td>${esc(prodName(p.product_code))}</td>
            <td class="num">${fmt(p.quote_price)} ${CUR_SIGN[p.quote_currency] || ''}</td>
            <td><span class="pill amber">${curLabel(p.quote_currency)}</span></td>
            <td class="num">${fmt(left)}</td>
            <td class="num">${fmt(have)}</td>
            <td class="num"><b>${fmt(unit)}</b></td>
            <td><div class="toolbar" style="margin:0;">
              <input class="qty" id="gov-${p.id}" type="number" min="1" step="1" value="${Math.max(1, Math.min(5, cap))}" ${isOpen() && cap > 0 ? '' : 'disabled'}>
              <button class="btn primary sm" data-act="sellToGov" data-id="${p.id}" ${isOpen() && cap > 0 ? '' : 'disabled'}>交付</button>
            </div></td>
          </tr>`;
        }).join('') : `<tr><td colspan="8" class="empty">还没有可交付的政府报价。先去「路演中心」提交方案，等政府报价。</td></tr>`}</tbody>
      </table>
    </div>

    <div class="card">
      <h3>已完成交付</h3>
      <table>
        <thead><tr><th>主题</th><th>产品</th><th class="num">政府单价</th><th class="num">已交付</th><th class="num">外币收入</th></tr></thead>
        <tbody>${done.length ? done.map(p => `
          <tr><td>${esc(p.title)}</td><td>${esc(prodName(p.product_code))}</td>
          <td class="num">${fmt(p.quote_price)} ${CUR_SIGN[p.quote_currency] || ''}</td>
          <td class="num">${fmt(p.sold_qty)}</td>
          <td class="num"><b>${fmt(Number(p.revenue_a) + Number(p.revenue_b))}</b> ${p.quote_currency === 'A' ? '★' : '◆'}</td></tr>`).join('') : `<tr><td colspan="5" class="empty">还没有完成过政府订单</td></tr>`}</tbody>
      </table>
    </div>`;
  }

  // ---------- 视图：政府台（经济调控中心） ----------
  function viewGov() {
    const g = S.gov || {};
    const open = isOpen();
    const y = fy();
    const pendRD = S.rd.filter(r => r.status === 'pending');
    const pendPitch = S.pitch.filter(p => p.status === 'submitted');

    const procure = (S.procure || []).filter(p => Number(p.fiscal_year) === Number(y));
    const policies = (S.policies || []).filter(p => Number(p.fiscal_year) === Number(y));
    const polActive = policies.filter(p => p.status === 'active');

    const traders = S.players.filter(p => p.role === 'trader');
    const reserve = g.reserve || {};
    const tradeRows = (S.quotes || []).filter(q => q.kind === 'material' || q.kind === 'product');

    const procQty = Number(g.procure_qty) || 0;
    const procFilled = Number(g.procure_filled) || 0;
    const procPct = procQty > 0 ? Math.round(procFilled / procQty * 100) : 0;
    const cpi = Number(g.cpi) || 100;
    const bal = Number(g.balance) || 0;
    const polCap = Number(g.policy_cap) || 3;

    // 政府体检报告：哪根杠杆该动了
    const advice = [];
    if (cpi >= 108) advice.push('物价指数 ' + fmt(cpi, 1) + ' 偏高 —— 通胀了，可以用<b>国库抛储</b>压价，或用「原料配额」下财年放量。');
    else if (cpi <= 92) advice.push('物价指数 ' + fmt(cpi, 1) + ' 偏低 —— 通缩，工厂不开工。试试<b>国库收储</b>托价，或直接发「产业补贴」。');
    else advice.push('物价指数 ' + fmt(cpi, 1) + ' 在合理区间，暂时不用动价。');
    if (bal < -4000) advice.push('本财年赤字 ' + fmt(Math.abs(bal)) + ' G —— 国库在失血，下财年拨款会被摊薄，先把不划算的采购停掉。');
    if (Number(g.cash || 0) < 800) advice.push('国库只剩 ' + fmt(g.cash) + ' G —— 再发采购或补贴会直接失败。');
    if (procQty > 0 && procPct < 40) advice.push('采购完成度只有 ' + procPct + '% —— 多半是报价低于市价，贸易商不愿意交。');
    if (!polActive.length) advice.push('本财年还没有任何政策生效 —— 手里有 ' + fmt(g.cash) + ' G 却没花出去。');

    const polKindLabel = { subsidy: '产业补贴', grant: '出口奖励', quota: '原料配额', infra: '基建投资' };
    const polForceText = p => p.kind === 'subsidy' ? ('每件 ' + fmt(p.amount) + ' G')
      : (fmt(p.rate, 1) + '%');
    const polTargetText = p => {
      if (!p.product_code) return '全场';
      if (p.kind === 'subsidy') return prodName(p.product_code);
      if (p.kind === 'quota') return matName(p.product_code);
      return '全场';
    };

    return `
    <div class="notice info"><b>你是政府。</b>你不持有库存、不上排行榜，你的目标是让这块大陆的经济跑起来 —— 物价别飞、工厂别停、贸易商有钱赚。下面是你的操控台：<b>国库</b>给钱、<b>采购招标</b>给单、<b>政策法令</b>改规则、<b>平准操作</b>动价格。</div>

    <div class="grid c4" style="margin-bottom:12px;">
      <div class="stat"><div class="k">国库金币</div><div class="v">${fmt(g.cash)}<small>G</small></div><div class="n">★ ${fmt(g.cash_a)} · ◆ ${fmt(g.cash_b)}</div></div>
      <div class="stat"><div class="k">本财年收入</div><div class="v">${fmt(g.income)}<small>G</small></div><div class="n">基础拨款 ＋ 上财年税收</div></div>
      <div class="stat"><div class="k">本财年支出</div><div class="v">${fmt(g.spend)}<small>G</small></div><div class="n">${bal >= 0 ? '结余 ' : '赤字 '}${fmt(Math.abs(bal))} G</div></div>
      <div class="stat"><div class="k">战略储备市值</div><div class="v">${fmt(g.reserve_value)}<small>G</small></div><div class="n">国库仓里压着的货</div></div>
    </div>

    <div class="grid c4" style="margin-bottom:18px;">
      <div class="stat"><div class="k">物价指数 CPI</div><div class="v">${fmt(cpi, 1)}</div><div class="n">100 = 原材料基准价</div></div>
      <div class="stat"><div class="k">全场流水 GDP</div><div class="v">${fmt(g.flow)}<small>G</small></div><div class="n">本财年全场入账总额</div></div>
      <div class="stat"><div class="k">交易所成交额</div><div class="v">${fmt(g.turnover)}<small>G</small></div><div class="n">撮合成交</div></div>
      <div class="stat"><div class="k">采购完成度</div><div class="v">${procPct}<small>%</small></div><div class="n">${fmt(procFilled)} / ${fmt(procQty)} 件</div></div>
    </div>

    <div class="notice warn"><b>体检报告</b><ul style="margin:6px 0 0 18px;">${advice.map(a => `<li>${a}</li>`).join('')}</ul></div>

    <div class="card">
      <h3>发布政府采购招标 <span class="hint">（国库立刻预扣，先到先得）</span></h3>
      <p class="hint">采购是<b>你主动开价</b>：定好产品、单价、数量，全场贸易商谁有货谁来交、交完即付。这和「路演报价」正好相反 —— 那边是贸易商提案、你定价；这边是你挂单、他们抢。</p>
      <div class="grid c4">
        <div class="field"><label>采购产品</label>
          <select id="pcProduct" ${open ? '' : 'disabled'}>
            ${S.products.map(p => `<option value="${esc(p.code)}">${esc(p.name)}</option>`).join('') || '<option value="">暂无产品</option>'}
          </select></div>
        <div class="field"><label>数量</label><input id="pcQty" type="number" min="1" step="1" value="10" ${open ? '' : 'disabled'}></div>
        <div class="field"><label>单价</label><input id="pcPrice" type="number" min="1" step="1" value="100" ${open ? '' : 'disabled'}></div>
        <div class="field"><label>结算货币</label>
          <select id="pcCur" ${open ? '' : 'disabled'}>
            <option value="G">G 金币</option><option value="A">★ 星洲币</option><option value="B">◆ 贺兰币</option>
          </select></div>
      </div>
      <div class="grid c2">
        <div class="field"><label>定向公司（留空 = 全场公开）</label>
          <select id="pcTarget" ${open ? '' : 'disabled'}>
            <option value="">全场贸易商，先到先得</option>
            ${traders.map(p => `<option value="${esc(p.owner_id)}">${esc(p.company_name)}（定向）</option>`).join('')}
          </select></div>
        <div class="field"><label>备注</label><input id="pcNote" maxlength="60" placeholder="例如：本财年公共工程用料" ${open ? '' : 'disabled'}></div>
      </div>
      <button class="btn primary" data-act="procCreate" ${open && S.products.length ? '' : 'disabled'}>发布招标（从国库支出）</button>
    </div>

    <div class="card">
      <h3>在办采购 <span class="hint">（本财年共 ${procure.length} 笔）</span></h3>
      <table>
        <thead><tr><th>产品</th><th class="num">单价</th><th>结算</th><th class="num">已成交 / 总量</th><th>交付对象</th><th>状态</th><th style="width:100px;">操作</th></tr></thead>
        <tbody>${procure.length ? procure.map(p => {
          const tgt = p.target_owner
            ? ((S.players.find(x => x.owner_id === p.target_owner) || {}).company_name || '（已离场）')
            : '全场公开';
          const st = p.status === 'open' ? '<span class="pill blue">进行中</span>'
            : (p.status === 'done' ? '<span class="pill amber">已完成</span>' : '<span class="pill">已结束</span>');
          return `<tr>
            <td><b>${esc(prodName(p.product_code))}</b>${p.note ? `<div class="hint" style="margin:2px 0 0;">${esc(p.note)}</div>` : ''}</td>
            <td class="num">${fmt(p.unit_price)} ${CUR_SIGN[p.currency] || ''}</td>
            <td>${curLabel(p.currency)}</td>
            <td class="num">${fmt(p.filled)} / ${fmt(p.qty)}</td>
            <td>${esc(tgt)}</td>
            <td>${st}</td>
            <td>${p.status === 'open' ? `<button class="btn ghost sm" data-act="procCancel" data-id="${p.id}">撤销</button>` : '—'}</td>
          </tr>`;
        }).join('') : `<tr><td colspan="7" class="empty">本财年还没有发布过采购招标</td></tr>`}</tbody>
      </table>
    </div>

    <div class="card">
      <h3>颁布政策法令 <span class="hint">（本财年最多 ${polCap} 项同时生效）</span></h3>
      <p class="hint">政策是政府唯一能<b>改变全场规则</b>的工具：颁布时从国库扣一笔预算，效果立刻生效或在新财年开局生效，跨年后自动过期、剩余预算退回国库。</p>
      <div class="grid c3">
        <div class="field"><label>政策类型</label>
          <select id="poKind" ${open ? '' : 'disabled'}>
            <option value="subsidy">产业补贴 —— 每投产一件发钱</option>
            <option value="grant">出口奖励 —— 对政府交付额外加成</option>
            <option value="quota">原料配额 —— 下财年原料放量</option>
            <option value="infra">基建投资 —— 本财年内销收购价提升</option>
          </select></div>
        <div class="field"><label>政策名称</label><input id="poTitle" maxlength="40" placeholder="例如：芯片产业振兴令" ${open ? '' : 'disabled'}></div>
        <div class="field"><label>政策预算（从国库扣）</label><input id="poBudget" type="number" min="0" step="100" value="1000" ${open ? '' : 'disabled'}></div>
      </div>
      <div class="grid c3">
        <div class="field"><label>目标品种（补贴选成品 / 配额选原材料）</label>
          <select id="poProduct" ${open ? '' : 'disabled'}>
            <optgroup label="成品">${S.products.map(p => `<option value="${esc(p.code)}">${esc(p.name)}</option>`).join('')}</optgroup>
            <optgroup label="原材料">${S.materials.map(m => `<option value="${esc(m.code)}">${esc(m.name)}</option>`).join('')}</optgroup>
          </select></div>
        <div class="field"><label>每件补贴 G（只有产业补贴填）</label><input id="poAmount" type="number" min="0" step="1" value="0" ${open ? '' : 'disabled'}></div>
        <div class="field"><label>比率 %（出口奖励 / 原料配额 / 基建填）</label><input id="poRate" type="number" min="0" max="50" step="1" value="0" ${open ? '' : 'disabled'}></div>
      </div>
      <div class="field"><label>政策说明（会写进全场公告）</label><textarea id="poBody" rows="2" placeholder="为什么要这么做…" ${open ? '' : 'disabled'}></textarea></div>
      <button class="btn teal" data-act="polIssue" ${open ? '' : 'disabled'}>颁布政策（从国库支出）</button>
    </div>

    <div class="card">
      <h3>生效中的政策 <span class="hint">（${polActive.length} / ${polCap}）</span></h3>
      <table>
        <thead><tr><th>类型</th><th>名称</th><th>目标</th><th class="num">力度</th><th class="num">剩余预算</th><th style="width:100px;">操作</th></tr></thead>
        <tbody>${polActive.length ? polActive.map(p => `<tr>
          <td><span class="pill blue">${esc(polKindLabel[p.kind] || p.kind)}</span></td>
          <td><b>${esc(p.title)}</b>${p.body ? `<div class="hint" style="margin:2px 0 0;">${esc(p.body)}</div>` : ''}</td>
          <td>${esc(polTargetText(p))}</td>
          <td class="num">${polForceText(p)}</td>
          <td class="num">${Number(p.cost) > 0 ? fmt(p.cost) + ' G' : '已用完'}</td>
          <td><button class="btn ghost sm" data-act="polRevoke" data-id="${p.id}">撤销</button></td>
        </tr>`).join('') : `<tr><td colspan="6" class="empty">本财年还没有生效中的政策</td></tr>`}</tbody>
      </table>
      ${policies.length > polActive.length ? `<p class="hint" style="margin-top:10px;">本财年另有 ${policies.length - polActive.length} 项已结束的政策（用完预算 / 被撤销 / 上财年到期）。</p>` : ''}
    </div>

    <div class="card">
      <h3>国库平准操作 <span class="hint">（收储托价 / 抛储压价）</span></h3>
      <p class="hint">最直接的物价杠杆：<b>收储</b>用国库的钱把货买进来、把价格推高；<b>抛储</b>把储备放出去、把价格压低。政府采购来的成品也会进国库仓，可以在这里再卖回市场。</p>
      <table>
        <thead><tr><th>品种</th><th>类别</th><th class="num">现价</th><th class="num">国库持仓</th><th class="num">持仓市值</th><th style="width:250px;">操作</th></tr></thead>
        <tbody>${tradeRows.length ? tradeRows.map(q => {
          const key = String(q.code).replace(/[^a-zA-Z0-9]/g, '_');
          const held = Number(reserve[q.code] || 0);
          return `<tr>
            <td><b>${esc(q.name)}</b></td>
            <td>${q.kind === 'material' ? '原材料' : '成品'}</td>
            <td class="num">${fmt(q.price, 2)}</td>
            <td class="num">${held > 0 ? '<b>' + fmt(held) + '</b>' : '—'}</td>
            <td class="num">${held > 0 ? fmt(held * Number(q.price || 0)) : '—'}</td>
            <td><div class="toolbar" style="margin:0;">
              <input class="qty" id="gt-${key}" type="number" min="1" step="1" value="10" style="width:70px;" ${open ? '' : 'disabled'}>
              <button class="btn teal sm" data-act="govTrade" data-code="${esc(q.code)}" data-side="buy" ${open ? '' : 'disabled'}>收储</button>
              <button class="btn danger sm" data-act="govTrade" data-code="${esc(q.code)}" data-side="sell" ${open && held > 0 ? '' : 'disabled'}>抛储</button>
            </div></td>
          </tr>`;
        }).join('') : `<tr><td colspan="6" class="empty">行情引擎还没启动</td></tr>`}</tbody>
      </table>
    </div>

    <div class="card">
      <h3>审批研发申请</h3>
      <p class="hint">通过后系统会自动为制造商建好产品档案（<b>含申报的单件工时，将固化为该产品的量产节拍</b>），并给对方发一封站内邮件。驳回时写清楚理由，帮助对方改进。</p>
      <table>
        <thead><tr><th>制造商</th><th>产品</th><th>配方（单件）</th><th class="num">单位成本</th><th class="num">试产 / 单件工时</th><th>创意说明</th><th style="width:270px;">审批</th></tr></thead>
        <tbody>${pendRD.length ? pendRD.map(r => {
          const ps = Number(r.plan_seconds || 0);
          return `
          <tr>
            <td>${esc(r.company_name || '—')}</td>
            <td><b>${esc(r.product_name)}</b></td>
            <td style="font-size:12.5px;">${recipeText(r.recipe)}</td>
            <td class="num">${fmt(r.unit_cost)}</td>
            <td class="num">${fmt(r.apply_qty)} 件<div class="hint" style="margin:2px 0 0;">${ps > 0 ? fmt(ps, 1) + ' 秒/件' : '—'}${ps > 0 ? ' · 百件约 ' + fmtDur(prodLineWith(ps, 100)) : ''}</div></td>
            <td style="color:var(--muted);max-width:200px;">${esc(r.product_desc || '—')}</td>
            <td><div class="toolbar" style="margin:0;">
              <input class="qty" id="rdnote-${r.id}" placeholder="评语（可选）" style="min-width:100px;">
              <button class="btn teal sm" data-act="reviewRD" data-id="${r.id}" data-ok="1">通过</button>
              <button class="btn danger sm" data-act="reviewRD" data-id="${r.id}" data-ok="0">驳回</button>
            </div></td>
          </tr>`; }).join('') : `<tr><td colspan="7" class="empty">暂无待审批的研发申请</td></tr>`}</tbody>
      </table>
    </div>

    <div class="card">
      <h3>路演报价</h3>
      <p class="hint">给贸易商的路演方案下达收购报价：单价用外币结算、数量不超过对方可供量。报价下达后对方即可到「政府市场」交付。</p>
      <table>
        <thead><tr><th>贸易商</th><th>主题 / 主推</th><th class="num">可供</th><th class="num">期望价</th><th>方案</th><th style="width:340px;">报价</th></tr></thead>
        <tbody>${pendPitch.length ? pendPitch.map(p => `
          <tr>
            <td>${esc(p.company_name || '—')}</td>
            <td><b>${esc(p.title)}</b><div class="hint" style="margin:2px 0 0;">${esc(prodName(p.product_code))}${p.link ? ` · <a href="${esc(p.link)}" target="_blank" rel="noopener">链接</a>` : ''}</div></td>
            <td class="num">${fmt(p.qty)}</td>
            <td class="num">${fmt(p.ask_price)}</td>
            <td style="color:var(--muted);max-width:200px;">${esc(p.pitch_text || '')}</td>
            <td><div class="toolbar" style="margin:0;flex-wrap:wrap;">
              <input class="qty" id="pq-price-${p.id}" type="number" min="1" step="1" value="${Math.max(1, Math.round(Number(p.ask_price) * 1.15))}" style="width:70px;" title="收购单价">
              <select id="pq-cur-${p.id}" class="qty" style="width:82px;">
                <option value="A">★ 星洲</option><option value="B">◆ 贺兰</option><option value="G">G 金币</option>
              </select>
              <input class="qty" id="pq-qty-${p.id}" type="number" min="1" step="1" value="${Math.floor(Number(p.qty))}" style="width:70px;" title="收购数量">
              <input class="qty" id="pq-note-${p.id}" placeholder="评语" style="min-width:80px;">
              <button class="btn teal sm" data-act="reviewPitch" data-id="${p.id}" data-ok="1">报价</button>
              <button class="btn danger sm" data-act="reviewPitch" data-id="${p.id}" data-ok="0">不采纳</button>
            </div></td>
          </tr>`).join('') : `<tr><td colspan="6" class="empty">暂无待报价的路演</td></tr>`}</tbody>
      </table>
    </div>

    <div class="card">
      <h3>汇率调控</h3>
      <p class="hint">汇率决定外币值多少金币。调高外币汇率会让贸易商出口收入变多、进口成本变高——这是政府手里最有力的杠杆之一。</p>
      <table>
        <thead><tr><th>货币</th><th>符号</th><th class="num">当前汇率（1 单位 = ? 金币）</th><th style="width:240px;">调整为</th></tr></thead>
        <tbody>${S.fx.map(f => `
          <tr><td><b>${esc(f.name)}</b></td><td>${esc(f.symbol)}</td><td class="num">${fmt(f.rate, 4)}</td>
          <td><div class="toolbar" style="margin:0;">
            <input class="qty" id="fx-${f.currency}" type="number" min="0.01" step="0.01" value="${fmt(f.rate, 2)}" style="width:96px;">
            <button class="btn primary sm" data-act="setFx" data-cur="${f.currency}">调整</button>
          </div></td></tr>`).join('') || `<tr><td colspan="4" class="empty">汇率数据缺失</td></tr>`}</tbody>
      </table>
    </div>

    <div class="card">
      <h3>全场公司</h3>
      <p class="hint">净资产为实时值：现金 ＋ 外币（按当日汇率折算） ＋ 库存估值。</p>
      <table>
        <thead><tr><th>队伍</th><th>角色</th><th class="num">金币</th><th class="num">★</th><th class="num">◆</th><th class="num">库存</th><th class="num">净资产</th></tr></thead>
        <tbody>${boardRanked().map(b => `<tr>
          <td>${esc(b.company_name)}</td>
          <td><span class="pill ${ROLE_PILL[b.role] || ''}">${ROLE_LABEL[b.role] || b.role}</span></td>
          <td class="num">${fmt(b.cash)}</td><td class="num">${fmt(b.cash_a)}</td><td class="num">${fmt(b.cash_b)}</td>
          <td class="num">${fmt((Number(b.mat_value) || 0) + (Number(b.prod_value) || 0))}</td>
          <td class="num"><b>${fmt(b.net_worth)}</b></td></tr>`).join('') || `<tr><td colspan="7" class="empty">还没有队伍</td></tr>`}</tbody>
      </table>
    </div>`;
  }

  // ---------- 视图：站内邮箱 ----------
  function viewMail() {
    const inbox = S.mail.filter(m => me && m.recipient_id === me.owner_id);
    const sent = S.mail.filter(m => me && m.sender_id === me.owner_id);
    const others = S.players.filter(p => me && p.owner_id !== me.owner_id);
    return `
    <div class="grid c3" style="margin-bottom:18px;">
      <div class="stat"><div class="k">收件箱</div><div class="v">${inbox.length}<small>封</small></div><div class="n">其中未读 ${unreadMail()} 封</div></div>
      <div class="stat"><div class="k">已发送</div><div class="v">${sent.length}<small>封</small></div><div class="n">你发出的邮件</div></div>
      <div class="stat"><div class="k">可联系对象</div><div class="v">${others.length}<small>家</small></div><div class="n">其他已注册参赛者</div></div>
    </div>

    <div class="card">
      <h3>写邮件</h3>
      <p class="hint">站内邮箱可以发给任何已注册的参赛者。谈合作、报价、下最后通牒——白纸黑字留痕，比口头承诺靠谱。</p>
      <div class="field"><label>收件人</label>
        <select id="mailTo">${others.map(p => `<option value="${esc(p.owner_id)}">${esc(p.company_name)}｜${ROLE_LABEL[p.role] || p.role}</option>`).join('')}</select></div>
      <div class="field"><label>主题</label><input id="mailSubject" maxlength="40" placeholder="例如：芯片长期供货协议"></div>
      <div class="field"><label>正文</label><textarea id="mailBody" placeholder="邮件内容…"></textarea></div>
      <button class="btn primary" data-act="sendMail" ${others.length ? '' : 'disabled'}>发送</button>
    </div>

    <div class="card">
      <h3>收件箱</h3>
      <table>
        <thead><tr><th>状态</th><th>发件人</th><th>主题与正文</th><th>时间</th><th></th></tr></thead>
        <tbody>${inbox.length ? inbox.map(m => `
          <tr${m.is_read ? '' : ' style="background:var(--primary-soft);"'}>
            <td>${m.is_read ? '<span class="pill">已读</span>' : '<span class="pill blue">未读</span>'}</td>
            <td>${esc(m.sender_name || '系统通知')}</td>
            <td><b>${esc(m.subject)}</b>${m.body ? `<div class="hint" style="margin:4px 0 0;white-space:pre-wrap;color:var(--muted);">${esc(m.body)}</div>` : ''}</td>
            <td style="color:var(--muted-2);font-size:12px;white-space:nowrap;">${esc(fmtTime(m.created_at))}</td>
            <td>${m.is_read ? '' : `<button class="btn ghost sm" data-act="readMail" data-id="${m.id}">标为已读</button>`}</td>
          </tr>`).join('') : `<tr><td colspan="5" class="empty">收件箱是空的</td></tr>`}</tbody>
      </table>
    </div>

    <div class="card">
      <h3>已发送</h3>
      <table>
        <thead><tr><th>收件人</th><th>主题</th><th>时间</th></tr></thead>
        <tbody>${sent.length ? sent.map(m => `
          <tr><td>${esc(m.recipient_name || '—')}</td><td>${esc(m.subject)}</td>
          <td style="color:var(--muted-2);font-size:12px;">${esc(fmtTime(m.created_at))}</td></tr>`).join('') : `<tr><td colspan="3" class="empty">还没有发过邮件</td></tr>`}</tbody>
      </table>
    </div>`;
  }

  // ---------- 视图：外汇兑换 ----------
  function viewExchange() {
    return `
    <div class="grid c3" style="margin-bottom:18px;">
      <div class="stat"><div class="k">金币</div><div class="v">${fmt(me.cash)}<small>G</small></div><div class="n">通用结算货币</div></div>
      <div class="stat"><div class="k">星洲币</div><div class="v">${fmt(me.cash_a)}<small>★</small></div><div class="n">≈ ${fmt(Number(me.cash_a || 0) * fxRate('A'))} G</div></div>
      <div class="stat"><div class="k">贺兰币</div><div class="v">${fmt(me.cash_b)}<small>◆</small></div><div class="n">≈ ${fmt(Number(me.cash_b || 0) * fxRate('B'))} G</div></div>
    </div>

    <div class="card">
      <h3>当前汇率</h3>
      <table>
        <thead><tr><th>货币</th><th class="num">1 单位折合</th></tr></thead>
        <tbody>${S.fx.map(f => `<tr><td>${esc(f.name)} ${esc(f.symbol)}</td><td class="num"><b>${fmt(f.rate, 4)}</b> G</td></tr>`).join('') ||
          `<tr><td colspan="2" class="empty">汇率数据缺失</td></tr>`}</tbody>
      </table>
      <p class="hint">汇率由政府和组委会调控，每财年开局也会小幅波动。拿到外币后可以在这里换成金币，也可以留着等汇率上涨。</p>
    </div>

    <div class="card">
      <h3>换汇</h3>
      <div class="grid c4">
        <div class="field"><label>卖出</label>
          <select id="fxFrom"><option value="A">★ 星洲币</option><option value="B">◆ 贺兰币</option><option value="G">G 金币</option></select></div>
        <div class="field"><label>买入</label>
          <select id="fxTo"><option value="G">G 金币</option><option value="A">★ 星洲币</option><option value="B">◆ 贺兰币</option></select></div>
        <div class="field"><label>数量</label><input id="fxAmount" type="number" min="1" step="1" value="100"></div>
        <div class="field" style="display:flex;align-items:flex-end;">
          <button class="btn primary" data-act="doExchange">确认兑换</button>
        </div>
      </div>
      <p class="hint">换算规则：先按卖出货币的汇率折成金币，再按买入货币的汇率折算回去。</p>
    </div>`;
  }

  // ---------- 视图：消费者市场 ----------
  function viewConsumers() {
    const rate = Number(S.game.exchange_rate);
    const tariff = Number(S.game.tariff_rate);
    const rowFor = (market) => S.demand.filter(d => d.market === market).map(d => {
      const unit = market === 'export' ? Number(d.price) * rate * (1 - tariff) : Number(d.price);
      const have = stockQty('product', d.product_code);
      const capped = Math.max(0, Math.min(Math.floor(have), Math.floor(Number(d.demand_left))));
      const pct = Number(d.demand_total) ? Number(d.demand_left) / Number(d.demand_total) * 100 : 0;
      return `<tr>
        <td><b>${esc(prodName(d.product_code))}</b></td>
        <td class="num">${fmt(d.price)}${market === 'export' ? ' 外币' : ''}</td>
        <td class="num">${fmt(d.demand_left)} / ${fmt(d.demand_total)}</td>
        <td><div class="bar ${pct < 25 ? 'danger' : pct < 60 ? 'amber' : 'teal'}"><i style="width:${pct}%"></i></div></td>
        <td class="num">${fmt(unit)}</td>
        <td class="num">${fmt(have)}</td>
        <td>
          <div class="toolbar" style="margin:0;">
            <input class="qty" id="m-${market}-${d.product_code}" type="number" min="1" step="1" value="${Math.max(1, Math.min(5, capped))}" ${isOpen() && capped > 0 ? '' : 'disabled'}>
            <button class="btn primary sm" data-act="sellMarket" data-market="${market}" data-code="${d.product_code}" ${isOpen() && capped > 0 ? '' : 'disabled'}>卖出</button>
          </div>
        </td>
      </tr>`;
    }).join('');

    return `
    ${phaseNotice()}
    <div class="notice info">内销价是系统给出的保底收购价，需求先到先得、卖完为止。想要更好的价格，请走「路演中心」争取政府订单。</div>

    <div class="card">
      <h3>国内市场（内销）</h3>
      <p class="hint">收入 = 数量 × 收购价</p>
      <table>
        <thead><tr><th>产品</th><th class="num">收购价</th><th class="num">剩余 / 总需求</th><th style="width:130px;">需求消耗</th><th class="num">成交单价</th><th class="num">我的库存</th><th style="width:200px;">销售</th></tr></thead>
        <tbody>${rowFor('domestic') || `<tr><td colspan="7" class="empty">本财年暂无内销需求</td></tr>`}</tbody>
      </table>
    </div>

    <div class="notice info">真正的大单来自政府。去「路演中心」提交方案 → 政府报价 → 到「政府市场」交付收外币 → 「外汇兑换」换回金币。</div>`;
  }

  // ---------- 视图：媒体中心 ----------
  function viewMedia() {
    const mine = S.news.filter(n => me && n.owner_id === me.owner_id);
    const myImpacts = S.news.filter(n => me && n.owner_id === me.owner_id
      && n.impact_code && Number(n.fiscal_year) === fy()).length;
    const adIncome = S.ledger.filter(l => l.kind === 'ad_income').reduce((a, l) => a + Number(l.amount), 0);
    const mediaList = S.players.filter(p => p.role === 'media');
    return `
    <div class="grid c3" style="margin-bottom:18px;">
      <div class="stat"><div class="k">我的现金</div><div class="v">${fmt(me.cash)}<small>G</small></div><div class="n">广告费会直接进账</div></div>
      <div class="stat"><div class="k">本财年广告收入</div><div class="v">${fmt(adIncome)}<small>G</small></div><div class="n">来自其他公司投放</div></div>
      <div class="stat"><div class="k">我的发布</div><div class="v">${mine.length}<small>条</small></div><div class="n">资讯与广告</div></div>
    </div>

    <div class="card">
      <h3>发布资讯</h3>
      <p class="hint">全场玩家都能在「情报流」看到。可以报道行情、点评队伍，也可以承接收费广告。</p>
      <div class="field"><label>标题</label><input id="newsTitle" maxlength="60" placeholder="例如：芯片供给告急，机械钟表产能或将腰斩"></div>
      <div class="field"><label>正文</label><textarea id="newsBody" placeholder="写出你的报道或广告内容…"></textarea></div>
      <button class="btn primary" data-act="postNews">发布</button>
    </div>

    <div class="card audit">
      <h3>左右行情 <span class="pill amber">媒体特权</span></h3>
      <p class="hint">
        媒体不只是记录市场，还能<b>推动市场</b>。一篇看多芯片的深度报道会让芯片应声上涨，一篇唱空布料的调查报道则会让它下跌。<br>
        单篇影响 <b>±0.5% ~ ±6%</b>，每个财年最多 <b>3 篇</b>，会立刻改写所有人的分时图与成本线 —— 这是真正的实权，也是真正的责任。
      </p>
      <div class="grid c4">
        <div class="field"><label>影响品种</label>
          <select id="miCode">${S.quotes.filter(q => q.kind !== 'fx').map(q => `<option value="${esc(q.code)}">${esc(q.name)}（现价 ${fmt(q.price, 2)}）</option>`).join('')}</select></div>
        <div class="field"><label>影响幅度（%，正涨负跌）</label>
          <input id="miPct" type="number" step="0.5" min="-6" max="6" value="-3"></div>
        <div class="field"><label>报道标题</label><input id="miTitle" maxlength="60" placeholder="例如：调查：布料库存积压严重"></div>
        <div class="field"><label>行情备注（显示在盘口）</label><input id="miNote" maxlength="40" placeholder="例如：媒体看空布料"></div>
      </div>
      <div class="field"><label>报道正文</label><textarea id="miBody" placeholder="写出你的报道内容…"></textarea></div>
      <div class="toolbar" style="border-top:1px solid var(--line-2);padding-top:14px;">
        <span class="hint">本财年已用 <b>${myImpacts}</b> / 3 篇。想连发三篇把价格打到地板？可以，但对手也会记住是谁写的。</span>
        <span class="grow"></span>
        <button class="btn danger" data-act="mediaImpact">发布报道并影响行情</button>
      </div>
    </div>

    <div class="card">
      <h3>广告合作</h3>
      <p class="hint">其他公司可以向你支付广告费，费用直接进入你的现金账户。这里展示可被投放的媒体（含你自己）。</p>
      <table>
        <thead><tr><th>媒体</th><th class="num">现金</th></tr></thead>
        <tbody>${mediaList.map(m => `<tr><td>${esc(m.company_name)}${me && m.owner_id === me.owner_id ? '（我）' : ''}</td><td class="num">${fmt(m.cash)}</td></tr>`).join('') || `<tr><td colspan="2" class="empty">暂无媒体</td></tr>`}</tbody>
      </table>
    </div>

    <div class="card">
      <h3>我发布的内容</h3>
      ${mine.length ? mine.map(n => `
        <div class="feed-item${n.kind === 'ad' ? ' ad' : ''}">
          <h4>${esc(n.title)}</h4>
          <div class="meta">财年 ${n.fiscal_year}${n.kind === 'ad' ? ' · 广告' : ' · 资讯'}${n.impact_code ? ` · <span class="pill ${Number(n.impact_pct) >= 0 ? 'ok' : 'danger'}">影响 ${esc(quoteName(n.impact_code))} ${signed(Number(n.impact_pct), 1)}%</span>` : ''}</div>
          <p>${esc(n.body || '')}</p>
        </div>`).join('') : `<div class="empty">还没有发布内容</div>`}
    </div>`;
  }

  // ---------- 视图：情报流 ----------
  function viewFeed() {
    const mediaList = S.players.filter(p => p.role === 'media');
    const canAd = canTrade();
    return `
    <div class="card">
      <h3>情报流</h3>
      <p class="hint">媒体发布的资讯与广告投放，全场公开。</p>
      ${S.news.length ? S.news.map(n => `
        <div class="feed-item${n.kind === 'ad' ? ' ad' : ''}">
          <h4>${esc(n.title)}</h4>
          <div class="meta">${esc(n.author || '系统')} · 财年 ${n.fiscal_year}${n.kind === 'ad' ? ' · 广告' : ''}${n.impact_code ? ` · <span class="pill ${Number(n.impact_pct) >= 0 ? 'ok' : 'danger'}">影响 ${esc(quoteName(n.impact_code))} ${signed(Number(n.impact_pct), 1)}%</span>` : ''}</div>
          <p>${esc(n.body || '')}</p>
        </div>`).join('') : `<div class="empty">暂时还没有情报</div>`}
    </div>

    ${canAd ? `
    <div class="card">
      <h3>投放广告</h3>
      <p class="hint">向媒体支付广告费，会以「广告」形式出现在全场情报流，同时也是给媒体的现金流支持。</p>
      ${mediaList.length ? mediaList.map(m => `
        <div class="toolbar" style="border-bottom:1px solid var(--line-2);padding-bottom:10px;">
          <b style="min-width:130px;">${esc(m.company_name)}</b>
          <input class="qty" id="ad-${m.owner_id}" type="number" min="1" step="10" value="50" style="width:110px;">
          <button class="btn ghost sm" data-act="placeAd" data-owner="${esc(m.owner_id)}" data-name="${esc(m.company_name)}">投广告 / 并附言</button>
        </div>`).join('') : `<div class="empty">场上还没有媒体角色</div>`}
    </div>` : ''}`;
  }

  // ---------- 视图：财务报表 ----------
  function viewFinance() {
    const rev = S.ledger.filter(l => Number(l.amount) > 0).reduce((a, l) => a + Number(l.amount), 0);
    const cost = -S.ledger.filter(l => Number(l.amount) < 0).reduce((a, l) => a + Number(l.amount), 0);
    const sv = myStockValue();
    const b = myBoardRow();
    const cash = b ? Number(b.cash) : Number(me.cash);
    const fxNow = b ? Number(b.fx_value) : myFxValue();
    const mineScores = S.scores.filter(s => me && s.owner_id === me.owner_id).sort((a, b) => b.fiscal_year - a.fiscal_year);
    return `
    <div class="grid c4" style="margin-bottom:18px;">
      <div class="stat"><div class="k">金币</div><div class="v">${fmt(cash)}<small>G</small></div></div>
      <div class="stat"><div class="k">外币资产</div><div class="v">${fmt(fxNow)}<small>G</small></div><div class="n">★ ${fmt(me.cash_a)} ／ ◆ ${fmt(me.cash_b)}</div></div>
      <div class="stat"><div class="k">本财年收入</div><div class="v" style="color:var(--ok);">${fmt(rev)}<small>G</small></div></div>
      <div class="stat"><div class="k">本财年支出</div><div class="v" style="color:var(--danger);">${fmt(cost)}<small>G</small></div></div>
    </div>
    <div class="grid c2" style="margin-bottom:18px;">
      <div class="stat"><div class="k">本财年利润</div><div class="v" style="color:${rev - cost >= 0 ? 'var(--ok)' : 'var(--danger)'};">${fmt(rev - cost)}<small>G</small></div></div>
      <div class="stat"><div class="k">净资产（实时）</div><div class="v">${fmt(myNetWorth())}<small>G</small></div><div class="n">现金 ＋ 外币 ＋ 库存 ${fmt(sv)}</div></div>
    </div>

    <div class="card">
      <h3>本财年流水（财年 ${fy()}）</h3>
      <p class="hint">收入 ${fmt(rev)} − 支出 ${fmt(cost)} ＝ 利润 ${fmt(rev - cost)} G</p>
      <table>
        <thead><tr><th>类型</th><th>摘要</th><th class="num">金额</th></tr></thead>
        <tbody>${S.ledger.length ? S.ledger.map(l => `
          <tr><td><span class="pill ${Number(l.amount) >= 0 ? 'ok' : ''}">${ledgerLabel(l.kind)}</span></td>
          <td>${esc(l.detail || '')}</td>
          <td class="num" style="color:${Number(l.amount) >= 0 ? 'var(--ok)' : 'var(--danger)'};">${Number(l.amount) >= 0 ? '+' : ''}${fmt(l.amount)}</td></tr>`).join('')
          : `<tr><td colspan="3" class="empty">本财年还没有流水</td></tr>`}</tbody>
      </table>
    </div>

    <div class="card">
      <h3>历史财年成绩</h3>
      <table>
        <thead><tr><th class="num">财年</th><th class="num">收入</th><th class="num">成本</th><th class="num">利润</th><th class="num">库存估值</th><th class="num">净资产</th></tr></thead>
        <tbody>${mineScores.length ? mineScores.map(s => `
          <tr><td class="num">${s.fiscal_year}</td><td class="num">${fmt(s.revenue)}</td><td class="num">${fmt(s.cost)}</td>
          <td class="num" style="color:${Number(s.profit) >= 0 ? 'var(--ok)' : 'var(--danger)'};">${fmt(s.profit)}</td>
          <td class="num">${fmt(s.stock_value)}</td><td class="num"><b>${fmt(s.net_worth)}</b></td></tr>`).join('')
          : `<tr><td colspan="6" class="empty">还没有结算过的财年</td></tr>`}</tbody>
      </table>
    </div>`;
  }

  // ---------- 视图：排行榜 ----------
  function viewRanking() {
    const years = Array.from(new Set(S.scores.map(s => s.fiscal_year))).sort((a, b) => b - a);
    const list = boardRanked();
    const myIdx = list.findIndex(p => me && p.owner_id === me.owner_id);
    const rateA = fxRate('A');
    const rateB = fxRate('B');
    const upd = S.boardAt || '刚刚';

    const medal = i => (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : String(i + 1));
    const cell = b => {
      const fx = Number(b.fx_value) || 0;
      const stock = (Number(b.mat_value) || 0) + (Number(b.prod_value) || 0);
      return { fx, stock };
    };

    return `
    ${phaseNotice()}
    <div class="card">
      <div class="toolbar" style="margin:0 0 10px;justify-content:space-between;">
        <h3 style="margin:0;">实时排行榜</h3>
        <div class="toolbar" style="margin:0;">
          <span class="hint" style="margin:0;">更新于 ${esc(upd)} · 每 8 秒自动同步</span>
          <button class="btn ghost sm" data-act="refreshBoard">立即刷新</button>
        </div>
      </div>
      <p class="hint">净资产 ＝ 现金 ＋ 外币（按当日汇率折算） ＋ 库存估值。每次交易、投产、换汇或汇率调整后立即重算${isOpen() ? '' : '；非交易期数字保持不变'}。</p>
      <table>
        <thead><tr><th class="num">名次</th><th>队伍</th><th>角色</th><th class="num">现金</th><th class="num">外币</th><th class="num">库存</th><th class="num">净资产</th></tr></thead>
        <tbody>${list.length ? list.map((b, i) => {
          const isMe = me && b.owner_id === me.owner_id;
          const c = cell(b);
          const fx = c.fx, stock = c.stock;
          return `<tr${isMe ? ' style="background:var(--primary-soft);"' : ''}>
            <td class="num">${medal(i)}</td>
            <td>${esc(b.company_name)}${isMe ? ' <span class="pill blue">我</span>' : ''}</td>
            <td><span class="pill ${ROLE_PILL[b.role] || ''}">${ROLE_LABEL[b.role] || b.role}</span></td>
            <td class="num">${fmt(b.cash)}</td>
            <td class="num">${fx > 0 ? fmt(fx) : '—'}<div class="hint" style="margin:0;font-size:11px;">★${fmt(b.cash_a)} ◆${fmt(b.cash_b)}</div></td>
            <td class="num">${stock > 0 ? fmt(stock) : '—'}</td>
            <td class="num"><b>${fmt(b.net_worth)}</b></td>
          </tr>`;
        }).join('') : `<tr><td colspan="7" class="empty">还没有队伍</td></tr>`}</tbody>
      </table>
      <p class="hint" style="margin-top:12px;">当前汇率：1 ★ ${esc(CUR_NAME.A)} = ${fmt(rateA, 2)} G ／ 1 ◆ ${esc(CUR_NAME.B)} = ${fmt(rateB, 2)} G${myIdx >= 0 ? ` · 你的名次 ${myIdx + 1} / ${list.length}` : ''}</p>
    </div>

    ${years.map(y => `
    <div class="card">
      <h3>财年 ${y} 结算成绩${isTrial() && y === fy() ? ' <span class="pill amber">试运营 · 不计入正式成绩</span>' : ''}</h3>
      <table>
        <thead><tr><th class="num">名次</th><th>队伍</th><th>角色</th><th class="num">收入</th><th class="num">成本</th><th class="num">利润</th><th class="num">库存估值</th><th class="num">净资产</th></tr></thead>
        <tbody>${S.scores.filter(s => s.fiscal_year === y).sort((a, b) => Number(b.net_worth) - Number(a.net_worth)).map((s, i) => `
          <tr><td class="num">${i + 1}</td><td>${esc(s.company_name)}</td>
          <td><span class="pill ${ROLE_PILL[s.role] || ''}">${ROLE_LABEL[s.role] || s.role}</span></td>
          <td class="num">${fmt(s.revenue)}</td><td class="num">${fmt(s.cost)}</td>
          <td class="num" style="color:${Number(s.profit) >= 0 ? 'var(--ok)' : 'var(--danger)'};">${fmt(s.profit)}</td>
          <td class="num">${fmt(s.stock_value)}</td><td class="num"><b>${fmt(s.net_worth)}</b></td></tr>`).join('')}</tbody>
      </table>
    </div>`).join('')}`;
  }

  // ---------- 视图：裁判台 ----------
  // 身份预览卡片：一眼看清「这个角色能看到哪些功能」
  function pvCard(r) {
    const groups = NAV_GROUPS
      .map(g => ({
        t: g.title,
        n: g.items.filter(n => n.roles.indexOf('*') >= 0 || n.roles.indexOf(r) >= 0),
      }))
      .filter(g => g.n.length);
    const total = groups.reduce((a, g) => a + g.n.length, 0);
    const on = previewRole === r;
    return `<div class="pv-card ${on ? 'on' : ''}" data-act="previewAs" data-role="${r}" title="点击以「${esc(ROLE_LABEL[r] || r)}」的视角查看界面">
      <div class="pc-h">${esc(ROLE_LABEL[r] || r)}${on ? ' <span class="pill blue">预览中</span>' : ''}</div>
      <div class="pc-body">
        可见功能 <b>${total}</b> 项<br>
        ${groups.map(g => `<b>${esc(g.t)}</b>：${g.n.map(n => esc(n.label)).join('、')}`).join('<br>')}
      </div>
      <div class="pc-tags">${(PV_CAPS[r] || []).map(c => `<span>${esc(c)}</span>`).join('')}</div>
    </div>`;
  }

  function viewJudge() {
    const openOffers = S.offers.filter(o => o.status === 'open').length;
    const counts = { manufacturer: 0, trader: 0, media: 0, admin: 0 };
    // 赛制参数面板：读值用 market_rules 下发的短名，写回用 wbs_settings 的真实键名
    const v_per = Number((S.rules && S.rules.prod_per) || 1.2);
    const jrows = [
      ['prod_base', 'produce_sec_base', '投产基础工时（秒）', '不管做几件，每一批都要先等的固定时间', 0],
      ['prod_per', 'produce_sec_per_unit', '每件追加工时（秒）', '通用产品每多产 1 件追加的秒数；研发报批过的产品用它自己核定的工时', 1],
      ['prod_min', 'produce_sec_min', '单笔最短工时（秒）', '再小的批量也要等这么久，避免「点一下立刻出成品」', 0],
      ['prod_max', 'produce_sec_max', '单笔最长工时（秒）', '上限，1200 秒 = 20 分钟 —— 大批量才会触到的天花板', 0],
      ['prod_qty_max', 'produce_max_qty', '全场默认「最多可产」（件）', '没单独设过产量上限的产品，单笔最多能投这么多件；研发报批过的产品用厂家申报的「预期可产」', 0],
      ['rd_sec_min', 'rd_sec_min', '研发申报单件工时下限（秒）', '制造商能申报的最快工艺节拍', 1],
      ['rd_sec_max', 'rd_sec_max', '研发申报单件工时上限（秒）', '制造商能申报的最慢工艺节拍', 1],
    ];
    S.players.forEach(p => { counts[p.role] = (counts[p.role] || 0) + 1; });
    const bannedPlayers = S.players.filter(p => p.status && p.status !== 'active');
    const banLabel = s => s === 'bankrupt' ? '破产' : (s === 'cancelled' ? '已注销' : '');
    const adjustNews = S.news.filter(n => String(n.title || '').indexOf('【资金调控】') === 0).slice(0, 5);
    const stockNews = S.news.filter(n => String(n.title || '').indexOf('【物资调拨】') === 0).slice(0, 5);
    const capNews = S.news.filter(n => String(n.title || '').indexOf('【产量上限】') === 0).slice(0, 5);
    // 产品产量上限表：每款产品的「最多可产」及归属，供组委会逐款调整
    const prodCapRows = () => S.products.map(p => {
      const own = Number(p.max_qty) > 0;
      const cap = productMaxQty(p.code);
      const holder = !p.owner_id
        ? '系统通用'
        : (me && p.owner_id === me.owner_id ? '我' : (((S.players || []).find(x => x.owner_id === p.owner_id) || {}).company_name || '其它队伍'));
      return `<tr>
        <td><b>${esc(p.name)}</b><div class="hint" style="margin:2px 0 0;">${esc(p.code)} · ${recipeText(p.recipe)}</div></td>
        <td>${esc(holder)}</td>
        <td class="num">${fmt(perUnitSec(p.code), 1)} 秒</td>
        <td class="num"><b>${cap}</b> <span class="pill ${own ? '' : 'blue'}">${own ? '单独设定' : '跟随默认'}</span></td>
        <td><div class="toolbar" style="margin:0;">
          <input class="qty" id="pm-${esc(p.code)}" type="number" min="1" max="999" step="1" value="${cap}" style="width:84px;">
          <button class="btn primary sm" data-act="setProductMax" data-code="${esc(p.code)}" data-mode="set">保存</button>
          <button class="btn ghost sm" data-act="setProductMax" data-code="${esc(p.code)}" data-mode="default" ${own ? '' : 'disabled'}>跟随默认</button>
        </div></td>
      </tr>`;
    }).join('');
    const auditName = oid => {
      const p = S.players.find(x => x.owner_id === oid);
      if (!p) return '未知队伍';
      return p.company_name + (me && p.owner_id === me.owner_id ? '（我）' : '');
    };
    return `
    <div class="grid c4" style="margin-bottom:18px;">
      <div class="stat"><div class="k">当前财年</div><div class="v">${fy()}${isTrial() ? ' <span class="pill amber">试运营</span>' : ''}</div><div class="n">${isTrial() ? '练手局 · 不计成绩' : PHASE_LABEL[phase()]}</div></div>
      <div class="stat"><div class="k">参赛队伍</div><div class="v">${S.players.length}</div><div class="n">生产商 ${counts.manufacturer} · 贸易商 ${counts.trader} · 媒体 ${counts.media}</div></div>
      <div class="stat"><div class="k">待签署合同</div><div class="v">${openOffers}</div></div>
      <div class="stat"><div class="k">汇率 / 关税</div><div class="v">${fmt(S.game.exchange_rate, 2)}<small>/ ${fmt(Number(S.game.tariff_rate) * 100, 1)}%</small></div></div>
    </div>

    <div class="card">
      <h3>赛程控制</h3>
      <p class="hint">开启财年会重置原材料供给、重新生成消费者需求并公布新的汇率与关税。汇率/关税留空则由系统随机生成。${fy() === 0 && phase() === 'prepare' && !isTrial() ? '<b>建议先开一个「试运营财年」</b>让大家熟悉操作——试运营的成绩不算数，也可以直接点「开启财年」跳过试运营。' : ''}${isTrial() ? '<b>当前是试运营财年：可直接点「开启财年」进入正式比赛（试运营数据会自动清空），也可先「结算财年」看成绩。</b>' : ''}</p>
      <div class="grid c3">
        <div class="field"><label>指定汇率（0.30 – 3.00，可留空）</label><input id="jyRate" type="number" step="0.01" min="0.3" max="3" placeholder="留空 = 随机"></div>
        <div class="field"><label>指定关税率（0 – 0.60，可留空）</label><input id="jyTariff" type="number" step="0.01" min="0" max="0.6" placeholder="留空 = 随机"></div>
        <div class="field" style="display:flex;align-items:flex-end;gap:8px;flex-wrap:wrap;">
          ${fy() === 0 && phase() === 'prepare' ? `<button class="btn teal" data-act="openTrial">🎮 开启试运营财年</button>` : ''}
          <button class="btn primary" data-act="openYear" ${phase() === 'open' && !isTrial() ? 'disabled' : ''}>开启财年</button>
          <button class="btn teal" data-act="closeYear" ${phase() === 'open' ? '' : 'disabled'}>结算财年</button>
          ${isTrial() ? `<button class="btn danger" data-act="endTrial">结束试运营 · 重置数据</button>` : ''}
        </div>
      </div>
      <div class="toolbar" style="border-top:1px solid var(--line-2);padding-top:14px;">
        <input id="jyAnn" placeholder="向全场发布公告，例如：还有 10 分钟结算" style="flex:1;min-width:220px;border:1px solid var(--line);border-radius:8px;padding:9px 11px;">
        <button class="btn ghost" data-act="announce">发布公告</button>
        <span class="grow"></span>
        <button class="btn danger" data-act="resetGame">重置整场比赛</button>
      </div>
    </div>

    <div class="card">
      <h3>赛制参数 <span class="pill amber">生产节奏的油门</span></h3>
      <p class="hint">生产工时的算法是：<b>基础工时 + 每件追加工时 × 投产数量</b>，再被「最短 / 最长」两端截断。<b>做的货越多等得越久</b>——默认单笔上限 1200 秒（20 分钟），要做到 999 件才会触顶。<b>改完立刻对之后的所有投产生效</b>，已经在跑的产线不受影响。</p>
      <table>
        <thead><tr><th style="width:320px;">参数</th><th class="num">当前值</th><th style="width:250px;">调整</th></tr></thead>
        <tbody>
          ${jrows.map(j => {
            const v = (S.rules && S.rules[j[0]] != null) ? S.rules[j[0]] : '';
            const dec = j[4];
            return `<tr>
              <td><b>${j[2]}</b><div class="hint" style="margin:2px 0 0;">${j[3]}</div></td>
              <td class="num"><b>${fmt(v, dec)}</b>${j[1] === 'produce_sec_max' ? ` <span class="hint">= ${fmtDur(v)}</span>` : ''}</td>
              <td><div class="toolbar" style="margin:0;">
                <input class="qty" id="js-${j[1]}" type="number" step="0.1" min="0" value="${v}" style="width:96px;">
                <button class="btn primary sm" data-act="judgeSet" data-key="${j[1]}">保存</button>
              </div></td>
            </tr>`;
          }).join('')}
          <tr>
            <td><b>投产完工后自动上架</b><div class="hint" style="margin:2px 0 0;">开启时，产线完工的成品会立刻按「单位成本 × 1.8」挂进交易所盘口（价格受涨跌停板约束），玩家可在「我的委托」改价或撤单；关闭时只入库，由玩家自行上架。</div></td>
            <td><span class="pill ${autoList() ? 'ok' : ''}">${autoList() ? '已开启' : '已关闭'}</span></td>
            <td><div class="toolbar" style="margin:0;"><button class="btn ${autoList() ? 'danger' : 'teal'} sm" data-act="judgeToggle" data-key="auto_list">${autoList() ? '关闭自动上架' : '开启自动上架'}</button></div></td>
          </tr>
        </tbody>
      </table>
      <p class="hint" style="margin-top:10px;">按当前「每件追加工时 ${fmt(v_per, 1)} 秒」折算：1 件约 ${fmtDur(prodLineWith(v_per, 1))} · 50 件约 ${fmtDur(prodLineWith(v_per, 50))} · 200 件约 ${fmtDur(prodLineWith(v_per, 200))} · 999 件约 ${fmtDur(prodLineWith(v_per, 999))}。</p>
    </div>

    <div class="card">
      <h3>产品产量上限 <span class="pill teal">控制「最多可产」</span></h3>
      <p class="hint">这里管的是<b>每一款产品单笔最多能投多少件</b>（生产中心里那列「最多可产」）。<b>研发报批过的产品</b>，上限就是厂家申报的「预期可产」，审批通过那一刻自动固化；<b>系统通用产品</b>跟随上面「全场默认最多可产」。</p>
      <p class="hint">想单独放宽或收紧某一款，直接改它的数字点「保存」；点「<b>跟随默认</b>」则清除单独设定、回到全场默认值。<b>手头原料不够时，实际能投的件数仍会被原料卡住</b> —— 这里改的是天花板，不是地板。改完立刻生效，已在跑的产线不受影响。</p>
      <table>
        <thead><tr><th>产品</th><th>归属</th><th class="num">单件工时</th><th class="num">当前最多可产</th><th style="width:280px;">调整</th></tr></thead>
        <tbody>${prodCapRows()}</tbody>
      </table>
      <div class="toolbar" style="border-top:1px solid var(--line-2);padding-top:14px;">
        <input id="pmReason" placeholder="调整事由（可留空；填了会写进公告与对方的站内邮件）" style="flex:1;min-width:220px;border:1px solid var(--line);border-radius:8px;padding:9px 11px;">
        <span class="grow"></span>
        <span class="hint" style="margin:0;">全场默认：<b>${ruleMaxQty()}</b> 件</span>
      </div>
      ${capNews.length ? `<div class="hint" style="margin-top:10px;">最近调整：${capNews.map(n => esc(n.title)).join(' ｜ ')}</div>` : ''}
    </div>

    <div class="card">
      <h3>交易所控制台 <span class="pill amber">赛前 / 财年节点用</span></h3>
      <p class="hint">交易所是一台独立运行的自动撮合系统：价格每 6 秒推进一档，<b>自营做市盘</b>（席位 EX-01）会在每个价位提供买卖报价，所以任何时刻全场都买得到、也卖得掉。你在这里要做的只有三件事。</p>
      <div class="grid c3">
        <div class="field">
          <label>① 集合竞价定开盘价</label>
          <div class="row-inline">
            <input id="acTicks" type="number" min="1" max="20" step="1" value="3" style="max-width:88px;">
            <button class="btn primary" data-act="auctionStart" ${phase() === 'open' ? '' : 'disabled'}>启动集合竞价</button>
          </div>
          <p class="hint">启动后先撤销盘口上所有旧挂单并原路退款，再封锁 N 档只接受申报、不产生价格；第 N+1 档按「可成交数量最大」的价位一次性定出开盘价。建议每个财年开年时点一次。</p>
        </div>
        <div class="field">
          <label>② 场内实时状态</label>
          <p class="hint" style="margin:0;line-height:1.9;">
            第 <b>${S.qTick}</b> 档 · ${isAuction() ? '<b>集合竞价中</b>' : (isHalted() ? '<b>熔断停牌至第 ' + circuitUntil() + ' 档</b>' : '连续竞价')}<br>
            综合指数 KCI <b>${S.idxKCI ? fmt(S.idxKCI.value, 2) : '—'}</b>
            ${S.idxKCI ? '<span class="' + (Number(S.idxKCI.value) >= Number(S.idxKCI.open) ? 'up-t' : 'dn-t') + '">' + signed(S.idxKCI.chgPct, 2) + '%</span>' : ''}<br>
            委托簿 <b>${S.orders.filter(o => o.status === 'open' || o.status === 'partial').length}</b> 笔 · 累计成交 <b>${S.trades.length}</b> 笔<br>
            挂牌公司 <b>${listingsListed().length}</b> 家 · 存续债券 <b>${S.bonds.filter(b => b.status === 'active').length}</b> 只
          </p>
          <div class="toolbar" style="margin-top:8px;">
            <button class="btn ghost sm" data-act="tickNow">手动推进一档行情</button>
          </div>
        </div>
        <div class="field">
          <label>③ 债券年度付息与兑付</label>
          <div class="row-inline">
            <button class="btn teal" data-act="bondSettle" ${S.bonds.filter(b => b.status === 'active').length ? '' : 'disabled'}>执行付息与兑付</button>
          </div>
          <p class="hint">对所有存续债券按票面利率付息；已到期的按面值兑付并摘牌下市。发行人现金不足时会按比例兑付并判定违约、全场公告。建议在每个财年结算后点一次。</p>
        </div>
      </div>
    </div>

    <div class="card">
      <h3>身份预览 · 全角色巡览 <span class="pill blue">讲解 / 检查用</span></h3>
      <p class="hint">下面把<b>五个角色能看到的界面</b>一次全部摊开：点任意一张卡片，立刻切换成那个人的视角；切换后顶栏还会出现一排角色快捷按钮，可以像翻书一样从头到尾巡一遍。用来给社员讲"每个角色分别看到什么"，或者开赛前自己检查权限有没有配错。<b>预览是只读的</b>：切换期间所有写操作（采购、投产、发布合同、审批、调资金……）都会被拦下，不会改动任何比赛数据。</p>
      <div class="pv-grid">${PV_ROLES.map(pvCard).join('')}</div>
      <div class="toolbar" style="border-top:1px solid var(--line-2);padding-top:14px;margin-top:15px;">
        <select id="prevRole">
          ${PV_ROLES.map(r => `<option value="${r}" ${previewRole === r ? 'selected' : ''}>${ROLE_LABEL[r]}</option>`).join('')}
        </select>
        <button class="btn primary" data-act="previewStart">开始预览</button>
        <button class="btn ghost" data-act="previewStop" ${previewRole ? '' : 'disabled'}>退出预览</button>
        <span class="grow"></span>
        <span class="hint" style="margin:0;">当前：${previewRole ? '正在以「' + esc(ROLE_LABEL[previewRole] || previewRole) + '」视角预览' : '未开启预览'}</span>
      </div>
    </div>

    <div class="card">
      <h3>管理口令</h3>
      <p class="hint">「政府」与「裁判 / 组委会」由组委会任命，注册时必须填写管理口令 —— 否则任何人都能给自己开一个裁判账号、随意调控全场资金。新口令<b>立即生效、旧口令作废</b>，只对之后的新注册生效，已注册的账号不受影响。</p>
      <div class="grid c2">
        <div class="field">
          <label>当前口令</label>
          <div id="judgeCodeBox" class="code-box"><button class="btn ghost sm" data-act="showJudgeCode">点击显示</button></div>
        </div>
        <div class="field">
          <label>重设口令（4–40 位）</label>
          <div class="row-inline">
            <input id="jCodeNew" placeholder="例如：KAGA-2026" autocomplete="off" maxlength="40">
            <button class="btn primary" data-act="setJudgeCode">更新口令</button>
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <h3>破产 / 注销管理台 <span class="pill danger">红屏冻结</span></h3>
      <p class="hint">以组委会身份<b>宣告某支队伍破产</b>或<b>注销其账号</b>：对方下次刷新（含重新登录）将进入<b style="color:#a31515;">全屏红屏警示页</b>，所有按钮、交易、下单全部冻结，只能查看公告与退出登录。选择「恢复经营」可解除冻结并归还全部权限。每次操作都会发布全场公告并给对方寄站内邮件。</p>
      <div class="grid c3">
        <div class="field"><label>目标队伍</label>
          <select id="jbanTarget">
            ${S.players.filter(p => p.role !== 'admin').map(p => `<option value="${esc(p.owner_id)}">${esc(p.company_name)}${me && p.owner_id === me.owner_id ? '（我）' : ''}｜${ROLE_LABEL[p.role] || p.role}${p.status && p.status !== 'active' ? '｜当前：' + banLabel(p.status) : ''}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label>执行动作</label>
          <select id="jbanStatus">
            <option value="bankrupt">宣告破产（红屏 · 可恢复）</option>
            <option value="cancelled">注销账号（红屏 · 可恢复）</option>
            <option value="active">恢复经营（解除红屏）</option>
          </select>
        </div>
        <div class="field"><label>裁定事由（会展示在对方红屏上）</label><input id="jbanReason" placeholder="例如：资不抵债 / 违规操作 / 主动退赛"></div>
      </div>
      <div class="toolbar" style="border-top:1px solid var(--line-2);padding-top:14px;">
        <button class="btn primary" data-act="banPlayer">执行裁定</button>
      </div>
      ${bannedPlayers.length ? `
      <table style="margin-top:16px;">
        <thead><tr><th>当前被冻结的账号</th><th>状态</th><th>事由</th><th>时间</th><th></th></tr></thead>
        <tbody>${bannedPlayers.map(p => `<tr>
          <td><b>${esc(p.company_name)}</b> <span class="hint">${esc(p.seat || '')}</span></td>
          <td><span class="pill ${p.status === 'bankrupt' ? 'amber' : 'danger'}">${banLabel(p.status)}</span></td>
          <td>${esc(p.ban_reason || '—')}</td>
          <td class="hint">${p.ban_at ? new Date(p.ban_at).toLocaleString('zh-CN', { hour12: false }) : '—'}</td>
          <td><button class="btn outline sm" data-act="banPlayer" data-restore="${esc(p.owner_id)}">恢复经营</button></td>
        </tr>`).join('')}</tbody>
      </table>` : '<p class="hint" style="margin-top:14px;">目前没有账号处于破产 / 注销状态。</p>'}
    </div>

    <div class="card">
      <h3>资金调控台</h3>
      <p class="hint">以组委会身份调整任意队伍的现金，<b>包括你自己的账号</b>。发放 / 扣减按增减计算；直接设定会把该队现金改成指定数值。每次调整都会记入该队流水，并向全场发布一条公告。</p>
      <div class="grid c3">
        <div class="field"><label>目标队伍</label>
          <select id="jcTarget">
            <option value="__ALL__">全体队伍（${S.players.length} 支，含自己）</option>
            ${S.players.map(p => `<option value="${esc(p.owner_id)}">${esc(p.company_name)}${me && p.owner_id === me.owner_id ? '（我）' : ''}｜${ROLE_LABEL[p.role] || p.role}｜现有 ${fmt(p.cash)} G</option>`).join('')}
          </select>
        </div>
        <div class="field"><label>操作方式</label>
          <select id="jcMode">
            <option value="grant">发放（增加现金）</option>
            <option value="fine">扣减（减少现金）</option>
            <option value="set">直接设定为</option>
          </select>
        </div>
        <div class="field"><label>金额（金币，整数）</label><input id="jcAmount" type="number" min="1" step="1" value="500"></div>
      </div>
      <div class="toolbar" style="border-top:1px solid var(--line-2);padding-top:14px;">
        <input id="jcReason" placeholder="调整事由，例如：开局启动资金 / 违规扣罚 / 优秀经营奖励" style="flex:1;min-width:220px;border:1px solid var(--line);border-radius:8px;padding:9px 11px;">
        <button class="btn primary" data-act="adjustCash">执行调整</button>
      </div>
      ${adjustNews.length ? `
      <table style="margin-top:16px;">
        <thead><tr><th>最近资金调控</th><th>明细</th></tr></thead>
        <tbody>${adjustNews.map(n => `<tr>
          <td>${esc(String(n.title).replace('【资金调控】', ''))}</td>
          <td>${esc(n.body || '')}</td></tr>`).join('')}</tbody>
      </table>` : ''}
    </div>

    <div class="card">
      <h3>物资调控台 <span class="pill teal">给别人家加货</span></h3>
      <p class="hint">以组委会身份<b>直接把货物调拨给任意队伍</b>：<b>入库</b>＝白送一批，<b>出库</b>＝从对方仓库扣走。执行后立刻改写目标队伍的库存、记入其资金流水、寄一封站内邮件，并在「新闻中心」留痕 —— <b>对方刷新即见，不用等结算</b>。只动货物、不动现金。</p>
      <div class="grid c3">
        <div class="field"><label>目标队伍</label>
          <select id="js2Target">
            <option value="__ALL__">全体队伍（${S.players.length} 支）</option>
            ${S.players.map(p => `<option value="${esc(p.owner_id)}">${esc(p.company_name)}${me && p.owner_id === me.owner_id ? '（我）' : ''}｜${ROLE_LABEL[p.role] || p.role}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label>货物</label>
          <select id="js2Item">
            <optgroup label="原材料">
              ${S.materials.map(m => `<option value="material|${esc(m.code)}">${esc(m.name)}（目录价 ${fmt(m.price)} G）</option>`).join('')}
            </optgroup>
            <optgroup label="成品">
              ${S.products.map(p => `<option value="product|${esc(p.code)}">${esc(p.name)}（参考价 ${fmt(p.ref_price)} G）</option>`).join('')}
            </optgroup>
          </select>
        </div>
        <div class="field"><label>操作方式</label>
          <select id="js2Mode">
            <option value="in">入库（给这一队加货）</option>
            <option value="out">出库（从这一队扣货）</option>
          </select>
        </div>
      </div>
      <div class="grid c3">
        <div class="field"><label>数量（整数）</label><input id="js2Qty" type="number" min="1" step="1" value="50"></div>
        <div class="field" style="grid-column:span 2;"><label>事由（必填，会写进对方流水与邮件）</label>
          <input id="js2Reason" placeholder="例如：开局原料配给 / 违规罚没 / 优秀经营奖励" style="width:100%;border:1px solid var(--line);border-radius:8px;padding:9px 11px;">
        </div>
      </div>
      <div class="toolbar" style="border-top:1px solid var(--line-2);padding-top:14px;">
        <span class="hint" style="margin:0;">扣货超过对方库存会被直接拒绝，不会把库存扣成负数。</span>
        <span class="grow"></span>
        <button class="btn primary" data-act="adjustStock">执行调拨</button>
      </div>
      ${stockNews.length ? `
      <table style="margin-top:16px;">
        <thead><tr><th style="width:320px;">最近物资调拨</th><th>明细</th></tr></thead>
        <tbody>${stockNews.map(n => `<tr>
          <td>${esc(String(n.title).replace('【物资调拨】', ''))}</td>
          <td>${esc(n.body || '')}</td></tr>`).join('')}</tbody>
      </table>` : ''}
    </div>

    <div class="card">
      <h3>全场公司</h3>
      <p class="hint">点「查账」可调阅该队伍的全部流水明细，用于核查资金去向。该查询为服务端只读，不会改动任何比赛数据。</p>
      <table>
        <thead><tr><th>队伍</th><th>角色</th><th class="num">现金</th><th class="num">净资产</th><th></th></tr></thead>
        <tbody>${boardRanked().map(b => `<tr>
          <td>${esc(b.company_name)}${me && b.owner_id === me.owner_id ? ' <span class="pill blue">我</span>' : ''}</td>
          <td><span class="pill ${ROLE_PILL[b.role] || ''}">${ROLE_LABEL[b.role] || b.role}</span></td>
          <td class="num">${fmt(b.cash)}</td><td class="num"><b>${fmt(b.net_worth)}</b></td>
          <td><button class="btn ghost" data-act="auditLedger" data-owner="${esc(b.owner_id)}">${auditTarget === b.owner_id ? '收起' : '查账'}</button></td></tr>`).join('') || `<tr><td colspan="5" class="empty">还没有队伍</td></tr>`}</tbody>
      </table>
    </div>

    <div class="card">
      <h3>全场合同</h3>
      <table>
        <thead><tr><th>发起方</th><th>方向</th><th>商品</th><th class="num">数量</th><th class="num">单价</th><th>状态</th></tr></thead>
        <tbody>${S.offers.slice(0, 40).map(o => `<tr>
          <td>${esc(o.company_name || '—')}</td>
          <td><span class="pill ${o.side === 'sell' ? 'teal' : 'blue'}">${o.side === 'sell' ? '供货' : '求购'}</span></td>
          <td><b>${esc(offerItemName(o))}</b> <span class="hint">${o.kind === 'material' ? '原材料' : '成品'}</span></td>
          <td class="num">${fmt(o.qty)}</td><td class="num">${fmt(o.price)}</td>
          <td><span class="pill ${STATUS_PILL[o.status] || ''}">${STATUS_LABEL[o.status] || o.status}</span></td></tr>`).join('') || `<tr><td colspan="6" class="empty">暂无合同</td></tr>`}</tbody>
      </table>
    </div>

    ${auditTarget ? `
    <div class="card" id="auditCard">
      <h3>账目核查 · ${esc(auditName(auditTarget))}</h3>
      <p class="hint">最近 ${auditRows.length} 条流水，按时间倒序。组委会的资金调整也会在这里以「组委会调整」显示。</p>
      <table>
        <thead><tr><th class="num">财年</th><th>类型</th><th>摘要</th><th class="num">金额</th><th>时间</th></tr></thead>
        <tbody>${auditRows.length ? auditRows.map(l => `<tr>
          <td class="num">${l.fiscal_year}</td>
          <td><span class="pill ${Number(l.amount) >= 0 ? 'ok' : ''}">${ledgerLabel(l.kind)}</span></td>
          <td>${esc(l.detail || '')}</td>
          <td class="num" style="color:${Number(l.amount) >= 0 ? 'var(--ok)' : 'var(--danger)'};">${Number(l.amount) >= 0 ? '+' : ''}${fmt(l.amount)}</td>
          <td>${esc(fmtTime(l.created_at))}</td></tr>`).join('')
          : `<tr><td colspan="5" class="empty">该队伍暂无流水记录</td></tr>`}</tbody>
      </table>
      <div class="toolbar"><button class="btn ghost" data-act="closeAudit">收起账目</button></div>
    </div>` : ''}`;
  }

  // ---------- 视图：规则手册 ----------
  function viewRules() {
    return `<div class="card">${window.RULEBOOK_HTML || '<p>规则手册加载失败</p>'}</div>`;
  }

  // ---------- 动作 ----------
  const ACTIONS = {
    goto(el) { view = el.getAttribute('data-view'); if (view !== 'war') counterFor = null; renderShell(); renderView(); window.scrollTo({ top: 0, behavior: 'smooth' }); },

    // 跳到规则手册并定位到具体章节（宪法 / 政策 / 避坑指南的入口用）
    gotoSec(el) {
      view = 'rules';
      counterFor = null;
      renderShell();
      renderView();
      const anchor = el.getAttribute('data-anchor');
      if (anchor === 'rb-top' || !anchor) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
      setTimeout(() => {
        try {
          const target = document.getElementById(anchor);
          if (!target) return;
          // 粘性顶栏（顶栏 60 + 指数条 + 新闻条）要补偿掉，否则章节标题会被盖住
          const y = target.getBoundingClientRect().top + (window.scrollY || window.pageYOffset || 0) - (60 + uiPrefs.idxH + uiPrefs.nbH);
          window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
        } catch (e) { /* 忽略定位异常 */ }
      }, 80);
    },

    // ---------- 行情中心 ----------
    gotoQuote(el) {
      const code = el.getAttribute('data-code');
      if (code) qPick = code;
      view = 'quotes';
      counterFor = null;
      renderShell();
      renderView();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },

    pickQuote(el) {
      const code = el.getAttribute('data-code');
      if (code) { qPick = code; hallPick = code; }
      renderView();
    },

    async tickNow() {
      await marketTick();
      toast('行情已推进到第 ' + S.qTick + ' 档');
      await reload();
    },

    async shockQuote() {
      const codeEl = $('#qkCode');
      const pctEl = $('#qkPct');
      const noteEl = $('#qkNote');
      if (!codeEl || !pctEl) return;
      const code = codeEl.value;
      const pct = Number(pctEl.value);
      const note = noteEl ? noteEl.value.trim() : '';
      if (!pct) { toast('请填写一个非 0 的涨跌幅度', true); return; }
      if (Math.abs(pct) > 60) { toast('单次干预幅度不能超过 ±60%', true); return; }
      const name = code === 'ALL' ? '全场所有品种' : ((quoteOf(code) || {}).name || code);
      if (!window.confirm('确认对「' + name + '」执行 ' + (pct > 0 ? '+' : '') + pct + '% 的市场干预？\n\n这会立刻改写所有队伍的原料成本线。')) return;
      const r = await rpc('wbs_market_shock', { p_code: code, p_pct: pct, p_note: note });
      applySnapshot(r);
      renderIdxBar();
      toast('已干预：' + name + ' ' + (pct > 0 ? '+' : '') + pct + '%');
      await reload();
    },

    async shockPreset(el) {
      const code = el.getAttribute('data-code') || 'ALL';
      const pct = Number(el.getAttribute('data-pct'));
      const note = el.getAttribute('data-note') || '';
      if (!pct) return;
      const name = code === 'ALL' ? '全场所有品种' : ((quoteOf(code) || {}).name || code);
      if (!window.confirm('确认对「' + name + '」执行 ' + (pct > 0 ? '+' : '') + pct + '% 的市场干预？')) return;
      const r = await rpc('wbs_market_shock', { p_code: code, p_pct: pct, p_note: note });
      applySnapshot(r);
      renderIdxBar();
      toast('已干预：' + name + ' ' + (pct > 0 ? '+' : '') + pct + '%');
      await reload();
    },

    // 自动波动控制台：预设填表 / 保存波动参数（支持小数） / 冻结行情
    fluctPreset(el) {
      const g = k => el.getAttribute('data-' + k);
      const set = (id, v) => { const n = $('#' + id); if (n) n.value = v; };
      set('fuMat', g('mat')); set('fuProd', g('prod')); set('fuOth', g('oth')); set('fuDrift', g('drift'));
      toast('预设已填入，点「保存并开启波动」生效');
    },

    async saveFluct(el) {
      const on = el.getAttribute('data-on') === '1';
      const mat = Number(($('#fuMat') || {}).value);
      const prod = Number(($('#fuProd') || {}).value);
      const oth = Number(($('#fuOth') || {}).value);
      const drift = Number(($('#fuDrift') || {}).value);
      const sec = Math.round(Number(($('#fuSec') || {}).value || 6));
      const minutes = Math.round(Number(($('#fuMin') || {}).value || 0));
      if ([mat, prod, oth, drift].some(x => !isFinite(x) || x < 0)) { toast('波动率不能为负数', true); return; }
      if (!isFinite(sec) || sec < 2 || sec > 120) { toast('更新间隔需在 2 ~ 120 秒之间', true); return; }
      if (!isFinite(minutes) || minutes < 0 || minutes > 600) { toast('持续时长需在 0 ~ 600 分钟之间', true); return; }
      if (!on) {
        if (!window.confirm('确认冻结全场行情？冻结期间所有品种价格保持不变，直到重新开启。')) return;
      } else {
        if (!window.confirm('确认应用自动波动参数？\n每 ' + sec + ' 秒一档 · 原材料 ±' + mat + '% · 成品 ±' + prod + '% · 其他 ±' + oth + '% · 回归强度 ' + drift + '%' + (minutes > 0 ? '\n持续 ' + minutes + ' 分钟，到期自动冻结' : '\n一直波动，直到你手动调整'))) return;
      }
      const r = await rpc('wbs_admin_fluct', { p_on: on ? '1' : '0', p_mat: mat, p_prod: prod, p_oth: oth, p_drift: drift, p_sec: sec, p_minutes: minutes });
      if (S.rules) { S.rules.fluct_on = r.on; S.rules.fluct_mat = r.mat; S.rules.fluct_prod = r.prod; S.rules.fluct_oth = r.oth; S.rules.fluct_drift = r.drift; S.rules.fluct_sec = r.sec; if (r.minutes > 0) S.rules.fluct_until = new Date(Date.now() + r.minutes * 60000).toISOString(); else delete S.rules.fluct_until; }
      setMarketTimer();
      toast(on ? '波动参数已生效（每 ' + r.sec + ' 秒一档）' : '全场行情已冻结');
      renderView();
    },

    async resetQuotes() {
      if (!window.confirm('把全部品种的价格重置回基准价，并清空分时历史。确定？')) return;
      await rpc('wbs_market_seed', { p_force: true });
      Object.keys(QHIST).forEach(k => { delete QHIST[k]; });
      await reload();
      toast('行情已重置回基准价');
    },

    // ---------- 交易大厅大屏 ----------
    hallFull() {
      hallOn = true;
      renderHall();
      if (document.documentElement && document.documentElement.requestFullscreen) {
        const p = document.documentElement.requestFullscreen();
        // 用户拒绝或浏览器不支持时忽略即可，页内大屏仍然可用
        if (p && p.catch) p.catch(() => {});
      }
    },

    hallExit() {
      hallOn = false;
      renderHall();
      if (document.fullscreenElement && document.exitFullscreen) {
        const p = document.exitFullscreen();
        if (p && p.catch) p.catch(() => { /* 忽略 */ });
      }
    },

    // ---------- 场外市场 ----------
    spotTab(el) {
      spotTab = el.getAttribute('data-tab') || 'sell';
      renderView();
    },

    // ---------- 物品交易所 ----------
    bourseTab(el) {
      bourseTab = el.getAttribute('data-tab') || 'book';
      renderView();
    },

    ordPick(el) {
      const code = el.getAttribute('data-code');
      if (!code || code === ordCode) return;
      ordCode = code;
      renderView();
      loadKline(code).then(() => { if (view === 'bourse') renderBourseLive(); });
    },

    ordGo(el) {
      const code = el.getAttribute('data-code');
      if (!code) return;
      ordCode = code;
      bourseTab = 'book';
      view = 'bourse';
      counterFor = null;
      renderShell();
      renderView();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      loadKline(code).then(() => { if (view === 'bourse') renderBourseLive(); });
    },

    ordSide(el) {
      ordSide = el.getAttribute('data-side') === 'sell' ? 'sell' : 'buy';
      renderView();
    },

    ordType(el) {
      ordType = el.getAttribute('data-type') === 'market' ? 'market' : 'limit';
      renderView();
    },

    ordStep(el) {
      kStep = Number(el.getAttribute('data-step')) || 4;
      renderView();
    },

    ordQtySet(el) {
      const inp = $('#bkQty');
      const q = quoteOf(ordCode);
      if (!inp || !q) return;
      const n = el.getAttribute('data-n');
      if (n !== 'max') { inp.value = n; return; }
      const b = bandOf(q);
      if (ordSide === 'buy') {
        const pxEl = $('#bkPrice');
        const px = ordType === 'market' ? b.hi : (Number(pxEl && pxEl.value) || Number(q.price) || b.base);
        const cash = Number(me ? me.cash : 0);
        inp.value = px > 0 ? String(Math.max(1, Math.floor(cash / (px * (1 + exFee()))))) : '1';
      } else {
        inp.value = String(Math.max(1, Math.floor(stockQty(q.kind, itemOfCode(ordCode)))));
      }
    },

    async ordPlace() {
      const q = quoteOf(ordCode);
      if (!q) { toast('请先选择交易品种', true); return; }
      const b = bandOf(q);
      const price = Number(($('#bkPrice') || {}).value);
      const qty = Number(($('#bkQty') || {}).value);
      if (!qty || qty <= 0) { toast('委托数量必须大于 0', true); return; }
      if (ordType === 'limit' && (!price || price <= 0)) { toast('限价委托必须填写价格', true); return; }
      if (ordType === 'limit' && (price > b.hi + 1e-9 || price < b.lo - 1e-9)) {
        toast('委托价超出涨跌停板（' + fmt(b.lo, 2) + ' ~ ' + fmt(b.hi, 2) + ' G）', true);
        return;
      }
      const px = ordType === 'market' ? (ordSide === 'buy' ? b.hi : b.lo) : price;
      const line = '确认' + (ordSide === 'buy' ? '买入' : '卖出') + '：' + q.name + ' ×' + fmt(qty, 0)
        + (ordType === 'market' ? '（市价委托）' : ' @ ' + fmt(px, 2) + ' G');
      const extra = ordSide === 'buy'
        ? '将冻结约 ' + fmt(px * qty * (1 + exFee()), 2) + ' G，多冻结的部分在成交或撤单时立刻退回。'
        : '将托管 ' + fmt(qty, 0) + ' 单位库存，撤单时原样退回。';
      if (!window.confirm(line + '\n' + extra)) return;
      const r = await rpc('wbs_order_place', {
        p_code: ordCode, p_side: ordSide, p_type: ordType,
        p_price: ordType === 'market' ? null : price, p_qty: qty,
      });
      toast(Number(r.matched) > 0
        ? '委托已成交 ' + r.matched + ' 笔，成交价以盘口为淮'
        : '委托已挂入盘口 @ ' + fmt(r.price, 2) + ' G');
      await reload();
      renderShell();
      renderView();
      loadKline(ordCode).then(() => { if (view === 'bourse') renderBourseLive(); });
    },

    async ordCancel(el) {
      const id = Number(el.getAttribute('data-id'));
      if (!window.confirm('撤销这笔委托？未成交部分的冻结资金 / 托管库存会原样退回。')) return;
      await rpc('wbs_order_cancel', { p_id: id });
      toast('已撤单');
      await reload();
      renderShell();
      renderView();
    },

    // ---------- 交易所「发布台」（贸易市场已并入交易所） ----------
    pubSide(el) {
      pubSide = el.getAttribute('data-side') === 'buy' ? 'buy' : 'sell';
      pubCode = null;
      ensurePubPick();
      renderView();
    },

    pubPick(el) {
      const code = el.getAttribute('data-code');
      if (!code) return;
      pubCode = code;
      ordCode = code;
      renderView();
      loadKline(code).then(() => { if (view === 'bourse') renderBourseLive(); });
    },

    pubQuick(el) {
      const inp = $('#pubQty');
      if (!inp) return;
      const n = el.getAttribute('data-n');
      if (n !== 'max') { inp.value = n; return; }
      const opt = ensurePubPick();
      if (!opt) return;
      const px = Number(($('#pubPrice') || {}).value) || pubSuggest(opt.code, pubSide);
      if (pubSide === 'buy') {
        const cash = Number(me ? me.cash : 0);
        inp.value = px > 0 ? String(Math.max(1, Math.floor(cash / (px * (1 + exFee()))))) : '1';
      } else {
        inp.value = String(Math.max(1, Math.floor(opt.qty)));
      }
    },

    async pubGo() {
      const opt = ensurePubPick();
      if (!opt) { toast('请先选择品种', true); return; }
      const q = opt.q;
      const b = bandOf(q);
      const price = Number(($('#pubPrice') || {}).value);
      const qty = Number(($('#pubQty') || {}).value);
      if (!qty || qty <= 0) { toast('数量必须大于 0', true); return; }
      if (!price || price <= 0) { toast('请填写价格', true); return; }
      if (price > b.hi + 1e-9 || price < b.lo - 1e-9) {
        toast('价格超出涨跌停板（' + fmt(b.lo, 2) + ' ~ ' + fmt(b.hi, 2) + ' G）', true);
        return;
      }
      if (pubSide === 'sell' && qty > opt.qty) { toast('你的库存只有 ' + fmt(opt.qty, 0) + '，挂不了这么多', true); return; }
      const line = (pubSide === 'sell' ? '上架货物' : '发布求购') + '：' + q.name + ' ×' + fmt(qty, 0) + ' @ ' + fmt(price, 2) + ' G';
      const extra = pubSide === 'sell'
        ? '将托管 ' + fmt(qty, 0) + ' 单位库存，成交或撤单时原样结算。'
        : '将冻结约 ' + fmt(price * qty * (1 + exFee()), 2) + ' G，成交价更优时多冻的部分当场退回。';
      if (!window.confirm(line + '\n' + extra)) return;
      const r = await rpc('wbs_order_place', { p_code: opt.code, p_side: pubSide, p_type: 'limit', p_price: price, p_qty: qty });
      toast(Number(r.matched) > 0
        ? '已成交 ' + r.matched + ' 笔，成交价以盘口为准'
        : (pubSide === 'sell' ? '已上架到交易所 @ ' : '已发布求购 @ ') + fmt(r.price, 2) + ' G');
      await reload();
      renderShell();
      renderView();
      loadKline(opt.code).then(() => { if (view === 'bourse') renderBourseLive(); });
    },

    // 一键吃单：按对方挂出的价格直接成交
    async takeOrder(el) {
      const id = Number(el.getAttribute('data-id'));
      const o = S.orders.find(x => Number(x.id) === id);
      if (!o) { toast('该挂单已不存在', true); return; }
      const left = Number(o.qty) - Number(o.filled);
      if (left <= 0) { toast('该挂单已经成交完毕', true); return; }
      const q = quoteOf(o.code);
      if (!q) { toast('该品种已下市', true); return; }
      const side = o.side === 'sell' ? 'buy' : 'sell';
      const px = Number(o.price);
      const fee = exFee();
      const maxQty = side === 'buy'
        ? (px > 0 ? Math.floor(Number(me ? me.cash : 0) / (px * (1 + fee))) : 0)
        : Math.floor(stockQty(q.kind, itemOfCode(o.code)));
      if (maxQty <= 0) { toast(side === 'buy' ? '现金不足，买不下这一笔' : '你没有这个品种的库存', true); return; }
      const qty = Math.min(left, maxQty);
      const line = '确认' + (side === 'buy' ? '买入' : '卖出') + '：' + o.name + ' ×' + fmt(qty, 0)
        + ' @ ' + fmt(px, 2) + ' G（吃 ' + (o.company_name || '—') + ' 的挂单）';
      if (!window.confirm(line)) return;
      const r = await rpc('wbs_order_place', { p_code: o.code, p_side: side, p_type: 'limit', p_price: px, p_qty: qty });
      toast(Number(r.matched) > 0 ? '已成交 ' + r.matched + ' 笔' : '已挂入盘口（暂时没有对手盘）');
      await reload();
      renderShell();
      renderView();
      loadKline(o.code).then(() => { if (view === 'bourse') renderBourseLive(); });
    },

    // 试样上架：从库存里挑两个数量最多的品种，各挂出 20%。
    // 不碰现金、不挂求购单，更不会把整仓货一次性托管走。
    // 挂上去只是"把货摆上货架"：系统商户只卖不买，所以不会被系统顺手收走，
    // 得等真实的贸易商 / 制造商 / 政府来接；成交前这批货仍算你的（库存页「在委托中」）。
    async autoList() {
      if (!window.confirm('从你的库存里挑两个数量最多的品种，各挂出 20% 摆上货架（货仍归你，随时可撤）。\n\n注意：系统商户只卖不买，挂了要等真实买家来接。继续？')) return;
      const r = await rpc('wbs_my_seed_orders', { p_force: true });
      const ns = Number(r.sell || 0);
      if (!ns) {
        toast('暂时没有可上架的货（库存为空，或这些货还没在交易所上市）', true);
      } else {
        const d = (r.details || []).map(x => x.name + ' ×' + fmt(x.qty, 0) + ' @ ' + fmt(x.price, 2) + ' G');
        toast('已上架 ' + ns + ' 个品种：' + d.join('、') + '（各为持仓的 20%，其余仍在可用库存；挂出的这部分在库存页显示为「在委托中」）');
      }
      await reload();
      renderShell();
      renderView();
      if (ordCode) loadKline(ordCode).then(() => { if (view === 'bourse') renderBourseLive(); });
    },

    // 组委会：重新布市（系统商户双边报价）
    async bourseSeed() {
      if (!window.confirm('重新布市会先清掉系统商户当前的报价，再重新挂出一批双边报价。继续？')) return;
      const r = await rpc('wbs_bourse_seed', {});
      toast('已布市：' + r.orders + ' 笔报价，覆盖 ' + r.codes + ' 个品种');
      await reload();
      renderShell();
      renderView();
    },

    // ---------- 主题 ----------
    themeToggle() {
      themeMode = themeMode === 'dark' ? 'light' : 'dark';
      saveTheme();
      applyTheme();
    },

    // ---------- 上市与股权 ----------
    eqTab(el) {
      eqTab = el.getAttribute('data-tab') || 'board';
      renderView();
    },

    eqPick(el) {
      const code = el.getAttribute('data-code');
      eqPick = code || null;
      renderView();
      if (eqPick) loadHolders(eqPick);
    },

    async ipoApply() {
      const ticker = (($('#ipTicker') || {}).value || '').trim().toUpperCase();
      const name = (($('#ipName') || {}).value || '').trim();
      const shares = Number(($('#ipShares') || {}).value);
      const fl = Number(($('#ipFloat') || {}).value);
      if (!ticker) { toast('请填写股票代码', true); return; }
      if (!name) { toast('请填写股票简称', true); return; }
      if (!shares || shares < 100) { toast('总股本至少 100 股', true); return; }
      if (!fl || fl < 5 || fl > 50) { toast('公开发行比例必须在 5% ~ 50% 之间', true); return; }
      if (!window.confirm('确认提交上市申请？\n代码 ' + ticker + ' · 简称 ' + name
        + '\n总股本 ' + fmt(shares, 0) + ' 股，公开发行 ' + fl + '%\n发行价由「净资产 ÷ 总股本」自动定出，组委会核准后挂牌。')) return;
      const r = await rpc('wbs_ipo_apply', { p_ticker: ticker, p_name: name, p_float: fl / 100, p_shares: shares });
      toast('已提交上市申请，定价 ' + fmt(r.price, 2) + ' G，拟募资 ' + fmt(r.raise, 0) + ' G');
      await reload();
      renderShell();
      renderView();
    },

    async ipoReview(el) {
      const id = Number(el.getAttribute('data-id'));
      const ok = el.getAttribute('data-ok') === '1';
      const price = Number(($('#irp-' + id) || {}).value) || 0;
      if (ok && !window.confirm('核准挂牌？将按 ' + fmt(price, 2) + ' G 生成行情，并把募资打入该公司账户。')) return;
      if (!ok && !window.confirm('驳回这份上市申请？')) return;
      const r = await rpc('wbs_ipo_review', { p_id: id, p_approve: ok, p_price: ok ? price : null, p_note: ok ? '' : '组委会未通过该上市申请' });
      toast(r.status === 'listed' ? '已挂牌：' + r.code + ' @ ' + fmt(r.price, 2) + ' G' : '已驳回');
      await reload();
      renderShell();
      renderView();
    },

    async divPay(el) {
      const ticker = el.getAttribute('data-ticker');
      const amt = Number(($('#dvAmt') || {}).value);
      if (!amt || amt <= 0) { toast('分红金额必须大于 0', true); return; }
      if (!window.confirm('确认派发红利 ' + fmt(amt, 0) + ' G？\n这笔钱会从公司现金中扣出，按持股比例分给全体股东。')) return;
      const r = await rpc('wbs_dividend', { p_ticker: ticker, p_amount: amt });
      toast('已派发 ' + fmt(r.amount, 0) + ' G 给 ' + r.holders + ' 位股东');
      await reload();
      renderShell();
      renderView();
    },

    // ---------- 企业债 ----------
    bondTab(el) {
      bondTab = el.getAttribute('data-tab') || 'board';
      renderView();
    },

    async bondApply() {
      const face = Number(($('#bdFace') || {}).value);
      const coupon = Number(($('#bdCoupon') || {}).value);
      const total = Number(($('#bdTotal') || {}).value);
      const mature = Number(($('#bdMature') || {}).value);
      const reason = (($('#bdReason') || {}).value || '').trim();
      if (!face || face < 1) { toast('面值必须大于 0', true); return; }
      if (!coupon || coupon < 1 || coupon > 30) { toast('票面利率应在 1% ~ 30% 之间', true); return; }
      if (!total || total < 10) { toast('发行张数至少 10 张', true); return; }
      if (!window.confirm('确认申请发行企业债？\n面值 ' + fmt(face, 2) + ' G × ' + fmt(total, 0) + ' 张 = 募资上限 '
        + fmt(face * total, 0) + ' G\n票面利率 ' + coupon + '%，' + mature + ' 个财年后到期（每财年末付息）。')) return;
      const r = await rpc('wbs_bond_apply', {
        p_face: face, p_coupon: coupon / 100, p_total: total, p_mature: mature, p_reason: reason,
      });
      toast('已提交发债申请 ' + r.code);
      await reload();
      renderShell();
      renderView();
    },

    async bondReview(el) {
      const id = Number(el.getAttribute('data-id'));
      const ok = el.getAttribute('data-ok') === '1';
      const cp = Number(($('#brc-' + id) || {}).value) / 100;
      const rt = ($('#brr-' + id) || {}).value || 'A';
      if (ok && !window.confirm('核准发行？评级 ' + rt + '，票面利率 ' + fmt(cp * 100, 1) + '%，核准后立刻开放认购。')) return;
      if (!ok && !window.confirm('驳回这份发债申请？')) return;
      const r = await rpc('wbs_bond_review', { p_id: id, p_approve: ok, p_coupon: ok ? cp : null, p_rating: rt, p_note: ok ? '' : '组委会未通过该发债申请' });
      toast(r.status === 'active' ? '已核准发行 ' + r.code + '（' + r.rating + '）' : '已驳回');
      await reload();
      renderShell();
      renderView();
    },

    async bondSub(el) {
      const id = Number(el.getAttribute('data-id'));
      const b = S.bonds.find(x => Number(x.id) === id);
      if (!b) return;
      const qty = Number(($('#bs-' + id) || {}).value);
      const left = Number(b.total) - Number(b.subscribed);
      if (!qty || qty <= 0) { toast('认购张数必须大于 0', true); return; }
      if (qty > left) { toast('最多只能认购 ' + fmt(left, 0) + ' 张', true); return; }
      if (!window.confirm('确认认购 ' + b.code + ' × ' + fmt(qty, 0) + ' 张？\n按面值 ' + fmt(b.face, 2)
        + ' G 支付 ' + fmt(qty * Number(b.face), 2) + ' G，每财年末按 ' + fmt(Number(b.coupon) * 100, 1) + '% 收息。')) return;
      const r = await rpc('wbs_bond_subscribe', { p_id: id, p_qty: qty });
      toast('已认购 ' + fmt(r.qty, 0) + ' 张，支付 ' + fmt(r.cost, 2) + ' G');
      await reload();
      renderShell();
      renderView();
    },

    async bondSettle() {
      if (!window.confirm('执行债券年度结算？\n将对所有存续债券付息，并把到期的债券按面值兑付摘牌。\n公司现金不足时会按比例兑付并判定为违约，此操作每财年只需执行一次。')) return;
      const r = await rpc('wbs_bond_settle', {});
      toast('债券结算完成：付息 ' + fmt(r.interest, 0) + ' G，还本 ' + fmt(r.principal, 0) + ' G'
        + (r.defaulted ? '，有 ' + r.defaulted + ' 只出现兑付不足' : ''));
      await reload();
      renderShell();
      renderView();
    },

    async auctionStart() {
      const n = Number(($('#acTicks') || {}).value) || 3;
      if (!window.confirm('启动集合竞价？\n会先撤销并原路退回盘口上所有旧的挂单，然后封锁 ' + n
        + ' 档行情只接受申报，第 ' + (n + 1) + ' 档按最大成交量价位一次性定出开盘价。')) return;
      const r = await rpc('wbs_auction_start', { p_n: n });
      toast('集合竞价已启动，第 ' + r.auction_until + ' 档结束');
      await reload();
      renderShell();
      renderView();
    },

    async spotPost() {
      const raw = ($('#spCode') || {}).value || '';
      const parts = raw.split('|');
      const kind = parts[0];
      const code = parts[1];
      const side = ($('#spSide') || {}).value || 'sell';
      const qty = Number(($('#spQty') || {}).value);
      const price = Number(($('#spPrice') || {}).value);
      if (!kind || !code) { toast('请选择标的', true); return; }
      if (!qty || qty <= 0) { toast('数量必须大于 0', true); return; }
      if (!price || price <= 0) { toast('报价必须大于 0', true); return; }
      const nm = kind === 'material' ? matName(code) : prodName(code);
      const ref = spotRef(kind, code);
      const dev = ref > 0 ? (price - ref) / ref * 100 : 0;
      const tip = side === 'sell'
        ? '确认挂出卖单：' + nm + ' ×' + qty + '，报价 ' + fmt(price, 2) + ' G？\n库存会立刻被托管，撤单时退回。'
        : '确认挂出买单：' + nm + ' ×' + qty + '，报价 ' + fmt(price, 2) + ' G？\n需冻结 ' + fmt(qty * price, 2) + ' G，撤单时退回。';
      if (!window.confirm(tip + (Math.abs(dev) >= 1 ? '\n\n参考现价 ' + fmt(ref, 2) + ' G，你的报价偏离 ' + signed(dev, 1) + '%。' : ''))) return;
      const r = await rpc('wbs_spot_post', { p_kind: kind, p_code: code, p_side: side, p_qty: qty, p_price: price });
      toast('已挂单：' + r.name + ' ×' + fmt(r.qty) + ' @ ' + fmt(r.price, 2) + ' G');
      await reload();
      renderShell();
      renderView();
    },

    async spotFill(el) {
      const id = Number(el.getAttribute('data-id'));
      const o = S.spot.find(x => Number(x.id) === id);
      if (!o) return;
      const qty = Number(($('#sf-' + id) || {}).value);
      const left = Number(o.qty) - Number(o.filled);
      if (!qty || qty <= 0) { toast('数量必须大于 0', true); return; }
      if (qty > left) { toast('最多只能成交 ' + fmt(left) + ' 单位', true); return; }
      const nm = spotItemName(o);
      const total = qty * Number(o.price);
      const verb = o.side === 'sell' ? '买入' : '卖出';
      if (!window.confirm('确认' + verb + '：' + nm + ' ×' + qty + ' @ ' + fmt(o.price, 2) + ' G，共 ' + fmt(total, 2) + ' G？\n对手方：' + o.company_name)) return;
      const r = await rpc('wbs_spot_fill', { p_id: id, p_qty: qty });
      toast('已成交：' + r.name + ' ×' + fmt(r.qty) + '，金额 ' + fmt(r.total, 2) + ' G');
      await reload();
      renderShell();
      renderView();
    },

    async spotCancel(el) {
      const id = Number(el.getAttribute('data-id'));
      const o = S.spot.find(x => Number(x.id) === id);
      if (!o) return;
      if (!window.confirm('撤销这笔「' + spotItemName(o) + '」挂单？托管的货 / 冻结的钱会原样退回。')) return;
      const r = await rpc('wbs_spot_cancel', { p_id: id });
      toast(r.refund > 0 ? '已撤单，退回 ' + fmt(r.refund, 2) + ' G' : '已撤单，退回 ' + fmt(r.qty) + ' 单位库存');
      await reload();
      renderShell();
      renderView();
    },

    // ---------- 交付大厅 ----------
    async deliveryPost() {
      const kindSel = $('#dlKind'), itemSel = $('#dlItem');
      const kind = kindSel && kindSel.value === 'material' ? 'material' : 'product';
      const code = itemSel && itemSel.value;
      const qty = Number(($('#dlQty') || {}).value);
      const price = Number(($('#dlPrice') || {}).value);
      const note = (($('#dlNote') || {}).value || '').trim();
      if (!code) { toast('请选择要交付的标的（下拉里只列你手上有货的）', true); return; }
      if (!qty || qty <= 0) { toast('数量必须大于 0', true); return; }
      if (!price || price <= 0) { toast('单价必须大于 0', true); return; }
      const nm = kind === 'material' ? matName(code) : prodName(code);
      if (!window.confirm('确认上架交付单：' + nm + ' ×' + qty + '，单价 ' + fmt(price, 2) + ' G？\n货物会立刻被托管，其他公司接单后钱货两清；撤单退回货物。')) return;
      const r = await rpc('wbs_delivery_post', { p_kind: kind, p_code: code, p_qty: qty, p_price: price, p_note: note || null });
      toast('交付单已上架：' + r.name + ' ×' + fmt(r.qty) + ' @ ' + fmt(r.price, 2) + ' G，全场可见');
      await reload();
      renderShell();
      renderView();
    },

    async deliveryTake(el) {
      const id = Number(el.getAttribute('data-id'));
      const d = S.deliveries.find(x => Number(x.id) === id);
      if (!d) return;
      const qty = Number(($('#dlq-' + id) || {}).value);
      const left = Number(d.qty) - Number(d.filled);
      if (!qty || qty <= 0) { toast('数量必须大于 0', true); return; }
      if (qty > left) { toast('只剩 ' + fmt(left) + ' 单位可交付', true); return; }
      const total = Math.round(qty * Number(d.price) * 100) / 100;
      if (!window.confirm('确认接单：向 ' + d.company_name + ' 采购 ' + spotItemName(d) + ' ×' + qty + ' @ ' + fmt(d.price, 2) + ' G，共 ' + fmt(total, 2) + ' G？\n货款立即支付，货立刻进你的库存。')) return;
      const r = await rpc('wbs_delivery_take', { p_id: id, p_qty: qty });
      toast('已交付：' + r.name + ' ×' + fmt(r.qty) + '，货款 ' + fmt(r.total, 2) + ' G，货已入库');
      await reload();
      renderShell();
      renderView();
    },

    async deliveryCancel(el) {
      const id = Number(el.getAttribute('data-id'));
      const d = S.deliveries.find(x => Number(x.id) === id);
      if (!d) return;
      if (!window.confirm('撤销这笔「' + spotItemName(d) + '」交付单？托管中未交付的货会原样退回你的库存。')) return;
      const r = await rpc('wbs_delivery_cancel', { p_id: id });
      toast('已撤单，退回 ' + fmt(r.qty) + ' 单位库存');
      await reload();
      renderShell();
      renderView();
    },

    // ---------- 衍生品中心 ----------
    async futOpen() {
      const code = ($('#fuCode') || {}).value;
      const side = ($('#fuSide') || {}).value || 'long';
      const qty = Number(($('#fuQty') || {}).value);
      const strike = Number(($('#fuStrike') || {}).value);
      const years = Number(($('#fuYears') || {}).value || 1);
      if (!code) { toast('请选择标的', true); return; }
      if (!qty || qty <= 0) { toast('数量必须大于 0', true); return; }
      if (!strike || strike <= 0) { toast('约定价必须大于 0', true); return; }
      const q = quoteOf(code) || {};
      const margin = Math.round(qty * strike * 0.10 * 100) / 100;
      const dirTxt = side === 'long' ? '锁买（看涨）' : '锁卖（看跌）';
      if (!window.confirm('确认签下锁价合约？\n\n' + dirTxt + ' ' + (q.name || code) + ' ×' + qty
        + '\n约定价 ' + fmt(strike, 2) + ' G（现价 ' + fmt(q.price, 2) + ' G）'
        + '\n期限 ' + years + ' 个财年\n保证金 ' + fmt(margin, 2) + ' G（最多亏这些）')) return;
      const r = await rpc('wbs_future_open', { p_code: code, p_qty: qty, p_strike: strike, p_years: years, p_side: side });
      toast('合约已签：' + r.name + ' ×' + fmt(r.qty) + ' @ ' + fmt(r.strike, 2) + ' G，保证金 ' + fmt(r.margin, 2) + ' G');
      await reload();
      renderShell();
      renderView();
    },

    async futSettle(el) {
      const id = Number(el.getAttribute('data-id'));
      const f = S.futures.find(x => Number(x.id) === id);
      if (!f) return;
      const pnl = futFloat(f);
      if (!window.confirm('结算这张合约？\n\n' + (f.side === 'long' ? '锁买' : '锁卖') + ' ' + f.name + ' ×' + fmt(f.qty)
        + '\n约定 ' + fmt(f.strike, 2) + ' G → 现价 ' + fmt(spotOf(f.code), 2) + ' G'
        + '\n按当前现价了结，预计盈亏 ' + signed(pnl, 2) + ' G')) return;
      const r = await rpc('wbs_future_settle', { p_id: id, p_all: false });
      toast('已结算，盈亏 ' + signed(Number(r.pnl), 2) + ' G');
      await reload();
      renderShell();
      renderView();
    },

    async futSettleAll() {
      const n = S.futures.filter(f => me && f.owner_id === me.owner_id && f.status === 'open').length;
      if (!n) { toast('你没有未平仓的合约', true); return; }
      if (!window.confirm('把手上 ' + n + ' 张合约全部按当前现价提前结算？')) return;
      const r = await rpc('wbs_future_settle', { p_id: null, p_all: true });
      toast('已结算 ' + r.count + ' 张，合计盈亏 ' + signed(Number(r.pnl), 2) + ' G');
      await reload();
      renderShell();
      renderView();
    },

    async shortOpen() {
      const code = ($('#shCode') || {}).value;
      const qty = Number(($('#shQty') || {}).value);
      if (!code) { toast('请选择标的', true); return; }
      if (!qty || qty <= 0) { toast('数量必须大于 0', true); return; }
      const q = quoteOf(code) || {};
      const spot = Number(q.price) || 0;
      const margin = Math.round(qty * spot * 0.30 * 100) / 100;
      const liq = spot > 0 ? spot + margin * 0.8 / qty : 0;
      if (!window.confirm('确认做空 ' + (q.name || code) + ' ×' + qty + '？\n\n'
        + '按现价 ' + fmt(spot, 2) + ' G 卖出，先进账 ' + fmt(qty * spot - margin, 2) + ' G\n'
        + '冻结保证金 ' + fmt(margin, 2) + ' G\n'
        + '价格涨到 ' + fmt(liq, 2) + ' G 就会被强制平仓，保证金亏光为止')) return;
      const r = await rpc('wbs_short_open', { p_code: code, p_qty: qty });
      toast('已开空：' + r.name + ' ×' + fmt(r.qty) + '，保证金 ' + fmt(r.margin, 2) + ' G');
      await reload();
      renderShell();
      renderView();
    },

    async shortClose(el) {
      const id = Number(el.getAttribute('data-id'));
      const s = S.shorts.find(x => Number(x.id) === id);
      if (!s) return;
      const pnl = shortFloat(s);
      if (!window.confirm('买回平仓？\n\n' + s.name + ' ×' + fmt(s.qty)
        + '\n开仓价 ' + fmt(s.entry, 2) + ' G → 现价 ' + fmt(spotOf(s.code), 2) + ' G'
        + '\n预计盈亏 ' + signed(pnl, 2) + ' G')) return;
      const r = await rpc('wbs_short_close', { p_id: id });
      toast('已平仓，盈亏 ' + signed(Number(r.pnl), 2) + ' G');
      await reload();
      renderShell();
      renderView();
    },

    async refreshBoard(el) {
      const btn = el || $('#view');
      if (btn && btn.classList) { btn.classList.add('busy'); btn.disabled = true; }
      try {
        await reload();
        toast('排行榜已更新');
      } catch (e) {
        toast(errMsg(e), true);
      } finally {
        if (btn && btn.classList) { btn.classList.remove('busy'); btn.disabled = false; }
      }
    },

    pickRole(el) { pickedRole = el.getAttribute('data-role'); renderRoles(); },

    async submitProfile() {
      const name = $('#setCompany').value.trim();
      if (!name) { toast('请填写队伍名称', true); return; }
      if (!pickedRole) { toast('请选择一个角色', true); return; }
      const code = roleNeedsCode(pickedRole) ? ($('#setJudgeCode').value || '').trim() : null;
      if (roleNeedsCode(pickedRole) && !code) {
        toast('注册「政府 / 裁判」需要向组委会索取管理口令', true);
        const f = $('#setJudgeCode');
        if (f) f.focus();
        return;
      }
      await rpc('wbs_setup_profile', { p_company: name, p_role: pickedRole, p_judge_code: code });
      toast('已进入赛场');
      await reload();
    },

    async buyMat(el) {
      const code = el.getAttribute('data-code');
      const qty = Number($('#q-' + code).value);
      if (!qty || qty <= 0) { toast('请输入正确的采购数量', true); return; }
      const r = await rpc('wbs_buy_material', { p_code: code, p_qty: qty });
      const unit = r && r.unit != null ? Number(r.unit) : null;
      const base = r && r.base != null ? Number(r.base) : null;
      const tail = (unit != null && base != null && Math.abs(unit - base) > 0.005)
        ? '（现货 ' + fmt(unit, 2) + ' G，目录价 ' + fmt(base, 2) + ' G）' : '';
      toast('采购 ' + matName(code) + ' ×' + qty + '，支出 ' + fmt(r.cost) + ' G' + tail);
      await reload();
    },

    async produce(el) {
      const code = el.getAttribute('data-code');
      const qty = Number($('#p-' + code).value);
      if (!qty || qty <= 0) { toast('请输入正确的生产数量', true); return; }
      const r = await rpc('wbs_produce', { p_product: code, p_qty: qty });
      toast('已投产 ' + r.name + ' ×' + r.qty + '：原料已锁定，' + fmtDur(r.seconds) + '后入库'
        + (autoList() ? '并自动挂入盘口 @ ' + fmt(r.list_price) + ' G（见「我的委托」）' : '到你自己的库存（当前为手动上架）'));
      await reload();
    },

    async createOffer() {
      const side = $('#ofSide').value;
      const item = $('#ofItem').value;
      const qty = Number($('#ofQty').value);
      const price = Number($('#ofPrice').value);
      const ownerEl = $('#ofTargetOwner');
      const targetOwner = ownerEl ? (ownerEl.value || null) : null;
      const target = targetOwner ? null : (($('#ofTarget') && $('#ofTarget').value) || null);
      const noteEl = $('#ofNote');
      const note = noteEl ? noteEl.value.trim() : '';
      if (!qty || qty <= 0 || !price || price <= 0) { toast('数量与单价必须大于 0', true); return; }
      await rpc('wbs_create_offer', {
        p_side: side, p_item: item, p_qty: qty, p_price: price,
        p_target_role: target, p_target_owner: targetOwner,
        p_note: note || null,
      });
      toast(targetOwner ? '专属合同已发布，已通知对方' : '合同已发布，等待对方签署');
      await reload();
    },

    async acceptOffer(el) {
      const id = Number(el.getAttribute('data-id'));
      const r = await rpc('wbs_accept_offer', { p_id: id });
      const alt = Number(r.tariff) > 0 ? '（另缴关税 ' + fmt(r.tariff) + ' G）' : '';
      toast('合同已签署并交割：' + prodName(r.item) + ' ×' + fmt(r.qty) + '，金额 ' + fmt(r.amount) + ' G' + alt);
      await reload();
    },

    async cancelOffer(el) {
      await rpc('wbs_cancel_offer', { p_id: Number(el.getAttribute('data-id')) });
      toast('合同已撤销');
      await reload();
    },

    // ---------- 市场公告 ----------
    async postMessage() {
      const kind = $('#poKind').value;
      const title = $('#poTitle').value.trim();
      const body = $('#poBody').value.trim();
      const want = $('#poWant').value || null;
      if (!title) { toast('请填写标题', true); return; }
      await rpc('wbs_post_message', { p_kind: kind, p_title: title, p_body: body, p_want_role: want });
      toast('公告已发布，全场可见');
      await reload();
    },

    async pinPost(el) {
      const r = await rpc('wbs_pin_post', { p_id: Number(el.getAttribute('data-id')) });
      toast(r.pinned ? '已置顶，扣除 ' + fmt(r.cost) + ' G' : '已取消置顶');
      await reload();
    },

    async closePost(el) {
      const r = await rpc('wbs_close_post', { p_id: Number(el.getAttribute('data-id')) });
      toast(r.status === 'closed' ? '公告已关闭' : '公告已重新开放');
      await reload();
    },

    async deletePost(el) {
      if (!window.confirm('删除后不可恢复，确定删除这条公告？')) return;
      await rpc('wbs_delete_post', { p_id: Number(el.getAttribute('data-id')) });
      toast('公告已删除');
      await reload();
    },

    async interestPost(el) {
      const id = Number(el.getAttribute('data-id'));
      const p = S.posts.find(x => Number(x.id) === id);
      const note = window.prompt('给对方留一句附言（会随系统邮件一起送达）：', '我们对这个合作很感兴趣，方便细谈吗？');
      if (note === null) return;
      const r = await rpc('wbs_interest_post', { p_id: id, p_note: note });
      toast('已向「' + ((p && p.company_name) || '对方') + '」表达合作意向，当前共 ' + r.count + ' 家');
      await reload();
    },

    // ---------- 借贷中心 ----------
    async createLoan() {
      const side = $('#lnSide').value;
      const amount = Number($('#lnAmount').value);
      const rate = Number($('#lnRate').value);
      const term = Number($('#lnTerm').value);
      const kind = $('#lnCollKind').value;
      const itemRaw = $('#lnCollItem').value;
      const qty = Number($('#lnCollQty').value) || 0;
      const targetOwner = $('#lnTarget').value || null;
      if (!amount || amount <= 0) { toast('本金必须大于 0', true); return; }
      if (!term || term < 1 || term > 5) { toast('期限必须在 1~5 个财年之间', true); return; }
      let item = null;
      if (kind === 'material' || kind === 'product') {
        if (!itemRaw) { toast('请选择抵押物', true); return; }
        const parts = itemRaw.split(':');
        if (parts[0] !== kind) { toast('抵押物类型与所选物品不匹配', true); return; }
        item = parts[1];
        if (!qty || qty <= 0) { toast('请填写抵押物数量', true); return; }
      }
      if (kind === 'cash' && (!qty || qty <= 0)) { toast('请填写抵押现金金额', true); return; }
      await rpc('wbs_loan_create', {
        p_side: side, p_amount: amount, p_rate: rate, p_term: term,
        p_collateral_kind: kind, p_collateral_item: item, p_collateral_qty: qty,
        p_target_owner: targetOwner, p_note: $('#lnNote').value.trim(),
      });
      toast(side === 'lend' ? '借款要约已发布，本金已锁定' : '借款需求已发布，抵押物已锁定');
      await reload();
    },

    async cancelLoan(el) {
      await rpc('wbs_loan_cancel', { p_id: Number(el.getAttribute('data-id')) });
      toast('借款合同已撤销，锁定资产已退回');
      await reload();
    },

    async acceptLoan(el) {
      const r = await rpc('wbs_loan_accept', { p_id: Number(el.getAttribute('data-id')) });
      toast('借款合同已生效：' + r.borrower + ' 借入 ' + fmt(r.principal) + ' G，到期财年 ' + r.due_year);
      await reload();
    },

    async repayLoan(el) {
      const id = Number(el.getAttribute('data-id'));
      const l = S.loans.find(x => Number(x.id) === id);
      const due = l ? Number(l.principal) * (1 + Number(l.rate) / 100 * Number(l.term_years)) : 0;
      if (!window.confirm('确认还款 ' + fmt(due) + ' G（本金 ' + fmt(l ? l.principal : 0) + ' + 利息）？\n还款后抵押物会立即解冻归还。')) return;
      const r = await rpc('wbs_loan_repay', { p_id: id });
      toast('已结清本息 ' + fmt(r.due) + ' G，信用分 +5');
      await reload();
    },

    async defaultLoan(el) {
      const id = Number(el.getAttribute('data-id'));
      if (!window.confirm('向政府 / 裁判申请对借款人强制执行？\n核准后抵押物将划转给你，差额从借款人现金中扣除，对方信用分 -30。')) return;
      const r = await rpc('wbs_loan_default', { p_id: id });
      toast('已提交强制执行申请（抄送 ' + r.notified + ' 位政府 / 裁判）');
      await reload();
    },

    async seizeLoan(el) {
      const id = Number(el.getAttribute('data-id'));
      const ok = el.getAttribute('data-ok') === '1';
      const note = window.prompt(ok ? '裁定说明（可留空）：' : '驳回理由（会通知出借人）：', ok ? '借款人逾期未还，准予强制执行' : '证据不足，暂不准予');
      if (note === null) return;
      const r = await rpc('wbs_loan_seize', { p_id: id, p_approve: ok, p_note: note });
      if (ok) toast('强制执行已完成：抵押 ' + fmt(r.collateral) + ' G，另扣现金 ' + fmt(r.cash_seized) + ' G');
      else toast('已驳回该强制执行申请');
      await reload();
    },

    // ---------- 商战与制裁 ----------
    async declareWar() {
      const target = $('#wrTarget').value;
      const stake = Number($('#wrStake').value);
      const roundsEl = $('#wrRounds');
      const rounds = roundsEl ? Number(roundsEl.value) : 3;
      if (!target) { toast('请选择宣战对象', true); return; }
      if (!stake || stake <= 0) { toast('军费必须大于 0', true); return; }
      if (!rounds || rounds < 1 || rounds > 5) { toast('交战轮数必须在 1~5 之间', true); return; }
      const p = S.players.find(x => x.owner_id === target) || {};
      const tax = Math.ceil(stake * 0.1);
      if (!window.confirm(
        '确认向「' + (p.company_name || '对方') + '」提交宣战申请？\n\n'
        + '· 军费：' + fmt(stake) + ' G\n'
        + '· 战时动员税：' + fmt(tax) + ' G（军费的 10%）\n'
        + '· 交战轮数：' + rounds + ' 轮\n'
        + '· 信用分：批准后 −5\n\n'
        + '申请提交后不扣任何费用，需等组委会（政府 / 裁判）批准才正式生效。'
      )) return;
      const r = await rpc('wbs_war_declare', {
        p_defender: target, p_stake: stake, p_cause: $('#wrCause').value.trim(), p_rounds: rounds,
      });
      toast('宣战申请已提交组委会审批：军费 ' + fmt(r.stake) + ' G + 动员税 ' + fmt(r.tax) + ' G，共 ' + r.rounds + ' 轮');
      await reload();
    },

    async approveWar(el) {
      const id = Number(el.getAttribute('data-id'));
      const ok = el.getAttribute('data-ok') === '1';
      const note = window.prompt(
        ok ? '批准说明（会通知交战双方）：' : '驳回理由（会通知宣战方）：',
        ok ? '组委会核准：宣战生效，请被宣战方准备应战' : '证据不足，不予批准'
      );
      if (note === null) return;
      const r = await rpc('wbs_war_approve', { p_id: id, p_approve: ok, p_note: note });
      if (ok) toast('已批准：划扣军费与动员税合计 ' + fmt(r.total) + ' G，交战 ' + r.rounds + ' 轮');
      else toast('已驳回该宣战申请，未产生任何费用');
      await reload();
    },

    async respondWar(el) {
      const id = Number(el.getAttribute('data-id'));
      const surrender = el.getAttribute('data-surrender') === '1';
      const w = S.wars.find(x => Number(x.id) === id) || {};
      const rounds = Number(w.rounds) || 1;
      let stake = 0;
      if (surrender) {
        if (!window.confirm('投降等于投入 0 军费，直接放弃抵抗。\n战事推进后，差额将按 1.2 倍索赔从你的现金与库存中划给对方（本次差额 ' + fmt(w.stake) + ' G × 1.2）。确定？')) return;
      } else {
        const v = window.prompt(
          '应战：请填写你愿意投入的军费。\n\n'
          + '对方投入 ' + fmt(w.stake) + ' G，共打 ' + rounds + ' 轮。\n'
          + '· 投入 ≥ ' + fmt(w.stake) + ' G → 1:1 对耗，双方打成平手\n'
          + '· 投入 < ' + fmt(w.stake) + ' G → 你判负，差额按 1.2 倍索赔（现金不够就搬库存）\n'
          + '· 填 0 → 等同投降\n\n你当前的现金：' + fmt(me ? me.cash : 0) + ' G',
          String(w.stake || 0));
        if (v === null) return;
        stake = Number(v);
        if (isNaN(stake) || stake < 0 || stake !== Math.round(stake)) { toast('军费必须是不小于 0 的整数', true); return; }
      }
      const r = await rpc('wbs_war_respond', { p_id: id, p_stake: stake });
      toast('已进入交战：你投入 ' + fmt(r.stake) + ' G，共 ' + r.rounds + ' 轮，请逐轮推进战事'
        + (Number(r.refund) > 0 ? '（超出对方的 ' + fmt(r.refund) + ' G 已原路退回）' : ''));
      await reload();
    },

    async advanceWar(el) {
      const id = Number(el.getAttribute('data-id'));
      const all = el.getAttribute('data-all') === '1';
      const r = await rpc('wbs_war_advance', { p_id: id, p_all: all });
      if (!r.settled) {
        toast('第 ' + r.round + ' / ' + r.rounds + ' 轮结束：攻方已耗 ' + fmt(r.attacker_spent) + ' G，守方已耗 ' + fmt(r.defender_spent) + ' G');
      } else if (r.result === 'draw') {
        toast('战事结束：' + r.rounds + ' 轮对耗，双方各消耗 ' + fmt(r.attacker_spent) + ' G，打成平手');
      } else {
        toast('战事结束：宣战方胜，掠夺现金 ' + fmt(r.loot_cash) + ' G，对方信用 −12、宣战方 +8');
      }
      await reload();
    },

    async mediateWar(el) {
      const id = Number(el.getAttribute('data-id'));
      const w = S.wars.find(x => Number(x.id) === id) || {};
      const word = w.status === 'pending' ? '撤回申请' : (w.status === 'declared' ? '撤军' : '停战');
      const note = window.prompt(
        word + '说明（会通知对方）：',
        w.status === 'pending' ? '申请方撤回宣战申请，双方均未受损'
          : (w.status === 'declared' ? '组委会出面调停，军费与动员税全额退回' : '双方停战，尚未消耗的军费退回各自账户')
      );
      if (note === null) return;
      const r = await rpc('wbs_war_mediate', { p_id: id, p_note: note });
      if (r.was === 'pending') toast('宣战申请已撤回，未产生任何费用');
      else toast('战事已终止：宣战方退回 ' + fmt(r.refund_attacker) + ' G，应战方退回 ' + fmt(r.refund_defender) + ' G');
      await reload();
    },

    // ---------- 战争 × 经济：军需物资 / 军需订单 / 国库军援 ----------

    async warSupp() {
      const warId = Number(($('#wsWar') || {}).value);
      const kind = ($('#wsKind') || {}).value || 'material';
      const item = ($('#wsItem') || {}).value || '';
      const qty = Number(($('#wsQty') || {}).value);
      if (!warId) { toast('请选择要投入的战事', true); return; }
      if (!item) { toast('请选择要投入的物资', true); return; }
      if (!qty || qty <= 0) { toast('投入数量必须大于 0', true); return; }
      const label = itemNameByCode((kind === 'material' ? 'MAT:' : 'PRD:') + item);
      if (!window.confirm('确认把 ' + label + ' ×' + fmt(qty) + ' 投入战场？\n\n' +
        '物资会从你的库存中直接扣除（不可撤回），并按当前市价折算成战力计入你这一方。')) return;
      try {
        const r = await rpc('wbs_war_supply', { p_id: warId, p_kind: kind, p_item: item, p_qty: qty });
        toast('已投入 ' + r.name + ' ×' + fmt(r.qty) + '，折算战力 ' + fmt(r.value) + ' G');
        await reload();
      } catch (e) {
        toast(errMsg(e), true);
      }
    },

    async warOrderCreate() {
      const warId = Number(($('#woWar') || {}).value);
      const kind = ($('#woKind') || {}).value || 'material';
      const item = ($('#woItem') || {}).value || '';
      const qty = Number(($('#woQty') || {}).value);
      const price = Number(($('#woPrice') || {}).value);
      const note = ($('#woNote') || {}).value || '';
      if (!warId) { toast('请选择为哪场战事采购', true); return; }
      if (!item) { toast('请选择物资', true); return; }
      if (!qty || qty <= 0) { toast('数量必须大于 0', true); return; }
      if (!price || price <= 0) { toast('单价必须大于 0', true); return; }
      const esc_ = price * qty;
      const label = itemNameByCode((kind === 'material' ? 'MAT:' : 'PRD:') + item);
      if (!window.confirm('确认发布军需订单：' + label + ' ×' + fmt(qty) + ' @ ' + fmt(price) + ' G？\n\n' +
        '货款 ' + fmt(esc_) + ' G 会立刻从你的现金中托管；\n' +
        '任何公司都可以交货，交货同时转化为你这一方的战力；\n' +
        '订单满额或战争结束即关闭，未成交部分在战争结束时自动全额退回。')) return;
      try {
        const r = await rpc('wbs_war_order_create', {
          p_war_id: warId, p_kind: kind, p_item: item, p_qty: qty, p_price: price,
          p_note: note || null
        });
        toast('军需订单已发布：' + r.name + ' ×' + fmt(r.qty) + '，托管 ' + fmt(r.escrow) + ' G');
        await reload();
      } catch (e) {
        toast(errMsg(e), true);
      }
    },

    async warOrderFill(el) {
      const id = Number(el.getAttribute('data-id'));
      const box = $('#wf-' + id);
      const qty = Number(box ? box.value : 0);
      if (!qty || qty <= 0) { toast('请输入交付数量', true); return; }
      try {
        const r = await rpc('wbs_war_order_fill', { p_id: id, p_qty: qty });
        toast('已交付 ' + r.name + ' ×' + fmt(r.qty) + '，收到货款 ' + fmt(r.pay) + ' G' +
          '（折合对方战力 ' + fmt(r.value) + ' G）' + (r.closed ? '，订单已满额' : ''));
        await reload();
      } catch (e) {
        toast(errMsg(e), true);
      }
    },

    async warOrderCancel(el) {
      const id = Number(el.getAttribute('data-id'));
      if (!window.confirm('确认撤销这笔军需订单？\n未成交部分托管的货款会全额退回你的现金。')) return;
      try {
        const r = await rpc('wbs_war_order_cancel', { p_id: id });
        toast('军需订单已撤销，退回 ' + fmt(r.refund) + ' G');
        await reload();
      } catch (e) {
        toast(errMsg(e), true);
      }
    },

    async govAid() {
      const warId = Number(($('#gaWar') || {}).value);
      const side = ($('#gaSide') || {}).value || 'attacker';
      const amount = Number(($('#gaAmount') || {}).value);
      const note = ($('#gaNote') || {}).value || '';
      if (!warId) { toast('请选择战事', true); return; }
      if (!amount || amount <= 0) { toast('军援金额必须大于 0', true); return; }
      const w = S.wars.find(x => Number(x.id) === warId) || {};
      const target = side === 'attacker' ? w.attacker_name : w.defender_name;
      if (!window.confirm('确认从国库拨付 ' + fmt(amount) + ' G 军援给「' + (target || '该方') + '」？\n\n' +
        '这笔钱立刻计入对方战力，并会公开通告全场 —— 这是一次明牌站队。\n' +
        '军援上限为该方已投入军费的 100%。')) return;
      try {
        const r = await rpc('wbs_gov_aid', { p_war_id: warId, p_side: side, p_amount: amount, p_note: note || null });
        toast('已军援 ' + r.target + ' ' + fmt(r.amount) + ' G（累计 ' + fmt(r.aid_total) + ' / 上限 ' + fmt(r.aid_cap) + ' G）');
        await reload();
      } catch (e) {
        toast(errMsg(e), true);
      }
    },

    async imposeSanction() {
      const target = $('#scTarget').value;
      const kind = $('#scKind').value;
      const rate = Number($('#scRate').value);
      const years = Number($('#scYears').value);
      if (!target) { toast('请选择制裁对象', true); return; }
      if (!years || years < 1 || years > 5) { toast('持续年限必须在 1~5 个财年之间', true); return; }
      if (kind === 'tariff' && (!rate || rate <= 0 || rate > 100)) { toast('关税率必须在 1~100 之间', true); return; }
      const p = S.players.find(x => x.owner_id === target) || {};
      const desc = kind === 'embargo'
        ? '全面禁运（对方无法与任何人签新合同）'
        : '关税壁垒（对方每签一份合同按 ' + rate + '% 缴税，其中一半归你、一半蒸发）';
      if (!window.confirm('确认对「' + (p.company_name || '对方') + '」提交' + desc + '的申请？\n\n持续 ' + years + ' 个财年，需经组委会（政府 / 裁判）批准后才生效。')) return;
      const r = await rpc('wbs_sanction_impose', {
        p_target: target, p_kind: kind,
        p_rate: kind === 'tariff' ? rate : 0,
        p_years: years, p_reason: $('#scReason').value.trim(),
      });
      toast('贸易战申请已提交组委会审批，拟持续 ' + r.years + ' 个财年');
      await reload();
    },

    async approveSanction(el) {
      const id = Number(el.getAttribute('data-id'));
      const ok = el.getAttribute('data-ok') === '1';
      const note = window.prompt(
        ok ? '批准说明（会通知施加方与被制裁方）：' : '驳回理由（会通知施加方）：',
        ok ? '组委会核准，制裁即刻生效' : '证据不足，不予批准'
      );
      if (note === null) return;
      const r = await rpc('wbs_sanction_approve', { p_id: id, p_approve: ok, p_note: note });
      if (ok) toast('已批准：制裁生效，至财年 ' + r.until_year + '（共 ' + r.years + ' 个财年）');
      else toast('已驳回该贸易战申请');
      await reload();
    },

    counterSanction(el) {
      // 展开 / 收起反制面板：纯前端切换，不发请求
      const id = Number(el.getAttribute('data-id'));
      counterFor = (el.getAttribute('data-cancel') === '1' || Number(counterFor) === id) ? null : id;
      renderView();
    },

    async counterSubmit() {
      if (counterFor === null) { toast('请先选择要反制的制裁', true); return; }
      const kind = $('#ctKind').value;
      const rate = Number($('#ctRate').value);
      const years = Number($('#ctYears').value);
      if (!years || years < 1 || years > 5) { toast('持续年限必须在 1~5 个财年之间', true); return; }
      if (kind === 'tariff' && (!rate || rate <= 0 || rate > 100)) { toast('关税率必须在 1~100 之间', true); return; }
      if (!window.confirm('确认提交反制申请？\n\n' + (kind === 'embargo'
        ? '类型：全面禁运（对方无法与任何人签新合同）'
        : '类型：关税壁垒 ' + rate + '%（对方每签一份合同按此比例缴税）')
        + '\n持续：' + years + ' 个财年\n\n反制同样需要组委会批准后才生效。')) return;
      const r = await rpc('wbs_sanction_counter', {
        p_id: counterFor, p_kind: kind,
        p_rate: kind === 'tariff' ? rate : 0,
        p_years: years, p_reason: ($('#ctReason') ? $('#ctReason').value.trim() : ''),
      });
      counterFor = null;
      toast('反制申请已提交组委会审批（对象：' + r.against + '）');
      await reload();
    },

    async liftSanction(el) {
      const id = Number(el.getAttribute('data-id'));
      const s = S.sanctions.find(x => Number(x.id) === id) || {};
      const pending = s.status === 'pending';
      const note = window.prompt(
        pending ? '撤回申请说明（会通知对方）：' : '解除说明（会通知对方）：',
        pending ? '施加方撤回贸易战申请，未产生任何效果' : '制裁解除，恢复正常贸易'
      );
      if (note === null) return;
      await rpc('wbs_sanction_lift', { p_id: id, p_note: note });
      toast(pending ? '贸易战申请已撤回' : '制裁已解除');
      await reload();
    },

    async sellMarket(el) {
      const market = el.getAttribute('data-market');
      const code = el.getAttribute('data-code');
      const qty = Number($('#m-' + market + '-' + code).value);
      if (!qty || qty <= 0) { toast('请输入正确的销售数量', true); return; }
      const r = await rpc('wbs_sell_to_market', { p_market: market, p_product: code, p_qty: qty });
      toast((market === 'export' ? '出口' : '内销') + ' ' + prodName(code) + ' ×' + fmt(r.qty) + '，收入 ' + fmt(r.income) + ' G');
      await reload();
    },

    async postNews() {
      const title = $('#newsTitle').value.trim();
      const body = $('#newsBody').value.trim();
      if (!title) { toast('请填写标题', true); return; }
      await rpc('wbs_post_news', { p_title: title, p_body: body });
      toast('已发布');
      await reload();
    },

    async mediaImpact() {
      const code = ($('#miCode') || {}).value;
      const pct = Number(($('#miPct') || {}).value);
      const title = ($('#miTitle') || {}).value.trim();
      const body = ($('#miBody') || {}).value.trim();
      const note = ($('#miNote') || {}).value.trim();
      if (!code) { toast('请选择影响品种', true); return; }
      if (!title) { toast('请填写报道标题', true); return; }
      if (!pct || Math.abs(pct) < 0.5) { toast('影响幅度不能小于 ±0.5%', true); return; }
      if (Math.abs(pct) > 6) { toast('单篇影响幅度不能超过 ±6%', true); return; }
      const q = quoteOf(code) || {};
      if (!window.confirm('确认发布这篇报道？\n\n《' + title + '》\n影响：' + (q.name || code) + ' ' + signed(pct, 1) + '%（现价 ' + fmt(q.price, 2) + ' → 约 ' + fmt(Number(q.price) * (1 + pct / 100), 2) + ' G）\n\n这会立刻改写全场的成本线，其他队伍会看到是你发的。')) return;
      const r = await rpc('wbs_media_push', { p_code: code, p_pct: pct, p_title: title, p_body: body, p_note: note });
      toast('报道已发出：' + r.name + ' ' + signed(Number(r.pct), 1) + '%（本财年第 ' + r.used + '/3 篇）');
      await reload();
      renderShell();
      renderView();
    },

    async placeAd(el) {
      const owner = el.getAttribute('data-owner');
      const name = el.getAttribute('data-name');
      const amount = Number($('#ad-' + owner).value);
      if (!amount || amount <= 0) { toast('请输入广告费金额', true); return; }
      const text = window.prompt('给「' + name + '」的广告附言（将出现在情报流中）：', '本公司的产品现已开放订购，欢迎洽谈。');
      if (text === null) return;
      await rpc('wbs_place_ad', { p_media_owner: owner, p_amount: amount, p_text: text });
      toast('已投放广告 ' + fmt(amount) + ' G');
      await reload();
    },

    // 组委会：宣告破产 / 注销账号 / 恢复经营（红屏冻结）
    async banPlayer(el) {
      const restore = el.getAttribute('data-restore');
      const target = restore || ($('#jbanTarget') || {}).value;
      const status = restore ? 'active' : (($('#jbanStatus') || {}).value || 'bankrupt');
      const reason = String((($('#jbanReason') || {}).value || '')).trim();
      if (!target) { toast('请选择目标队伍', true); return; }
      const p = S.players.find(x => x.owner_id === target);
      if (!p) { toast('目标账号不存在', true); return; }
      const verb = status === 'bankrupt' ? '宣告破产' : (status === 'cancelled' ? '注销账号' : '恢复经营');
      if (status !== 'active' && !reason) { toast('请填写裁定事由（会展示在对方红屏上）', true); return; }
      if (!window.confirm('确认对「' + p.company_name + '」执行【' + verb + '】？\n' + (status !== 'active' ? '对方刷新后将进入红屏冻结页，事由：' + reason : '对方的红屏将解除，全部权限恢复'))) return;
      const r = await rpc('wbs_admin_ban', { p_target: target, p_status: status, p_reason: reason || null });
      toast('已' + verb + '：' + (r.company || p.company_name));
      await reload();
    },

    async adjustCash() {
      const target = $('#jcTarget').value;
      const mode = $('#jcMode').value;
      const raw = Number($('#jcAmount').value);
      const reason = $('#jcReason').value.trim();
      if (!raw || raw <= 0 || raw !== Math.round(raw)) { toast('请输入大于 0 的整数金额', true); return; }
      if (!reason) { toast('请填写调整事由', true); return; }
      const targetName = target === '__ALL__'
        ? '全体参赛队伍'
        : ((S.players.find(p => p.owner_id === target) || {}).company_name || '该队伍');
      const p_mode = mode === 'set' ? 'set' : 'delta';
      const amount = mode === 'fine' ? -raw : raw;
      const verb = mode === 'grant' ? '发放' : (mode === 'fine' ? '扣减' : '设定为');
      if (!window.confirm('确认对「' + targetName + '」' + verb + ' ' + fmt(raw) + ' G？\n事由：' + reason)) return;
      const r = await rpc('wbs_admin_adjust_cash', { p_owner: target, p_amount: amount, p_reason: reason, p_mode: p_mode });
      toast('已调整 ' + r.count + ' 支队伍的现金');
      await reload();
    },

    // 组委会：给指定队伍直接调拨货物（入库 = 白送 / 出库 = 扣走）
    async adjustStock() {
      const target = ($('#js2Target') || {}).value || '__ALL__';
      const parts = String(($('#js2Item') || {}).value || '').split('|');
      const kind = parts[0], code = parts[1];
      const mode = ($('#js2Mode') || {}).value || 'in';
      const qty = Math.floor(Number(($('#js2Qty') || {}).value));
      const reason = String(($('#js2Reason') || {}).value || '').trim();
      if (!code) { toast('请选择要调拨的货物', true); return; }
      if (!qty || qty <= 0) { toast('数量必须是大于 0 的整数', true); return; }
      if (!reason) { toast('请填写调拨事由', true); return; }
      const targetName = target === '__ALL__'
        ? ('全体 ' + S.players.length + ' 支队伍')
        : (((S.players.find(p => p.owner_id === target) || {}).company_name) || '该队伍');
      const delta = mode === 'out' ? -qty : qty;
      const itemName = kind === 'material' ? matName(code) : prodName(code);
      if (!window.confirm('确认对「' + targetName + '」' + (delta > 0 ? '调拨入库' : '调拨出库')
        + '：' + itemName + ' ×' + fmt(qty, 0) + '？\n事由：' + reason
        + (delta > 0 ? '' : '\n出库会从对方仓库扣走货物，库存不够会被拒绝。'))) return;
      const r = await rpc('wbs_admin_adjust_stock', {
        p_owner: target, p_kind: kind, p_item: code, p_qty: delta, p_reason: reason,
      });
      toast('已' + r.op + ' ' + fmt(Math.abs(Number(r.delta)), 0) + ' 单位 ' + r.name
        + (Number(r.count) === 1 ? '：' + (r.before + ' → ' + r.after) : '，共影响 ' + r.count + ' 支队伍'));
      await reload();
      renderShell();
      renderView();
    },

    async auditLedger(el) {
      const owner = el.getAttribute('data-owner');
      if (auditTarget === owner) { auditTarget = null; auditRows = []; renderView(); return; }
      auditTarget = owner;
      try {
        const rows = await rpc('wbs_admin_ledger', { p_owner: owner, p_limit: 200 });
        auditRows = Array.isArray(rows) ? rows : [];
      } catch (e) {
        toast(errMsg(e), true);
        auditRows = [];
      }
      renderView();
      const card = $('#auditCard');
      if (card && card.scrollIntoView) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },

    closeAudit() {
      auditTarget = null;
      auditRows = [];
      renderView();
    },

    async submitRD() {
      const name = $('#rdName').value.trim();
      const desc = $('#rdDesc').value.trim();
      const qty = Number($('#rdQty').value);
      if (!name) { toast('请填写产品名称', true); return; }
      const recipe = {};
      $$('.rd-mat').forEach(inp => {
        const v = Number(inp.value);
        if (v > 0) recipe[inp.getAttribute('data-code')] = v;
      });
      if (!Object.keys(recipe).length) { toast('请至少为一种库存材料填写用量', true); return; }
      if (!qty || qty <= 0) { toast('请填写试产数量', true); return; }
      const exEl = $('#rdExpect');
      const expect = exEl ? Math.floor(Number(exEl.value)) : 0;
      if (!expect || expect < 1) { toast('请填写「预期可产」（这款产品最多能产几件）', true); return; }
      if (expect > 999) { toast('预期可产请控制在 999 件以内', true); return; }
      const secEl = $('#rdSec');
      const sec = secEl ? Number(secEl.value) : NaN;
      const r0 = S.rules || {};
      const sMin = isFinite(Number(r0.rd_sec_min)) ? Number(r0.rd_sec_min) : 0.2;
      const sMax = isFinite(Number(r0.rd_sec_max)) ? Number(r0.rd_sec_max) : 60;
      if (!sec || sec <= 0) { toast('请填写预计单件生产工时', true); return; }
      if (sec < sMin || sec > sMax) { toast('预计单件工时需在 ' + sMin + ' – ' + sMax + ' 秒之间', true); return; }
      const r = await rpc('wbs_submit_rd', { p_name: name, p_desc: desc, p_recipe: recipe, p_qty: qty, p_sec: sec, p_expect: expect });
      toast('研发申请已提交：单件成本 ' + fmt(r.unit_cost) + ' G，申报单件工时 ' + fmt(r.plan_seconds, 1)
        + ' 秒，预期可产 ' + fmt(r.expect_qty, 0) + ' 件（审批通过后即为「最多可产」）');
      await reload();
    },

    async pitchSubmit() {
      const title = $('#ptTitle').value.trim();
      const product = $('#ptProduct').value;
      const qty = Number($('#ptQty').value);
      const ask = Number($('#ptAsk').value);
      const text = $('#ptText').value.trim();
      const link = $('#ptLink').value.trim();
      if (!title) { toast('请填写路演主题', true); return; }
      if (text.length < 10) { toast('方案说明至少写 10 个字', true); return; }
      if (!qty || qty <= 0) { toast('可供数量必须大于 0', true); return; }
      if (!ask || ask <= 0) { toast('期望单价必须大于 0', true); return; }
      await rpc('wbs_pitch_submit', { p_title: title, p_text: text, p_link: link, p_product: product, p_qty: qty, p_ask: ask });
      toast('路演方案已提交，等待政府报价');
      await reload();
    },

    async reviewRD(el) {
      const id = Number(el.getAttribute('data-id'));
      const ok = el.getAttribute('data-ok') === '1';
      const box = $('#rdnote-' + id);
      const note = box ? box.value : '';
      if (!ok && !window.confirm('确认驳回这条研发申请？')) return;
      await rpc('wbs_review_rd', { p_id: id, p_approve: ok, p_note: note });
      toast(ok ? '已批准，对方现在可以投产' : '已驳回');
      await reload();
    },

    // ---------- 组委会：赛制参数 ----------
    async judgeSet(el) {
      const key = el.getAttribute('data-key');
      const box = $('#js-' + key);
      if (!box) return;
      const val = String(box.value).trim();
      if (!val) { toast('请先填入数值', true); return; }
      await rpc('wbs_judge_setting', { p_key: key, p_value: val });
      toast('参数已更新并立即生效');
      await reload();
      renderShell();
      renderView();
    },

    async judgeToggle(el) {
      const key = el.getAttribute('data-key');
      const next = (key === 'auto_list') ? (autoList() ? '0' : '1') : '1';
      await rpc('wbs_judge_setting', { p_key: key, p_value: next });
      toast(next === '1'
        ? '已开启自动上架：产线一完工就自动挂进交易所盘口'
        : '已关闭自动上架：产线完工只进库存，由玩家自行上架');
      await reload();
      renderShell();
      renderView();
    },

    // 组委会：逐款调整「最多可产」（单笔投产上限）
    async setProductMax(el) {
      const code = el.getAttribute('data-code');
      const mode = el.getAttribute('data-mode');
      let val = 0;
      if (mode === 'set') {
        const box = $('#pm-' + code);
        val = Math.floor(Number(box ? box.value : 0));
        if (!val || val < 1) { toast('「最多可产」必须是 1 – 999 之间的整数', true); return; }
        if (val > 999) { toast('「最多可产」最多 999 件', true); return; }
      }
      const box2 = $('#pmReason');
      const note = box2 ? String(box2.value).trim() : '';
      const r = await rpc('wbs_admin_set_product', { p_code: code, p_max_qty: mode === 'set' ? val : 0, p_note: note });
      toast('「' + r.name + '」最多可产：' + fmt(r.before, 0) + ' → ' + fmt(r.after, 0) + ' 件'
        + (r.follows_default ? '（已恢复跟随全场默认 ' + fmt(r.default, 0) + ' 件）' : ''));
      await reload();
      renderShell();
      renderView();
    },

    async reviewPitch(el) {
      const id = Number(el.getAttribute('data-id'));
      const ok = el.getAttribute('data-ok') === '1';
      const noteBox = $('#pq-note-' + id);
      const note = noteBox ? noteBox.value : '';
      if (!ok) {
        if (!window.confirm('确认不采纳这条路演？')) return;
        await rpc('wbs_review_pitch', { p_id: id, p_approve: false, p_price: null, p_currency: null, p_qty: null, p_note: note });
        toast('已标记为不采纳');
        await reload();
        return;
      }
      const price = Number($('#pq-price-' + id).value);
      const cur = $('#pq-cur-' + id).value;
      const qty = Number($('#pq-qty-' + id).value);
      if (!price || price <= 0) { toast('请填写收购单价', true); return; }
      if (!qty || qty <= 0) { toast('请填写收购数量', true); return; }
      await rpc('wbs_review_pitch', { p_id: id, p_approve: true, p_price: price, p_currency: cur, p_qty: qty, p_note: note });
      toast('报价已下达：' + fmt(price) + ' ' + (CUR_SIGN[cur] || cur) + ' × ' + fmt(qty));
      await reload();
    },

    async sellToGov(el) {
      const id = Number(el.getAttribute('data-id'));
      const amt = Number($('#gov-' + id).value);
      if (!amt || amt <= 0) { toast('请输入交付数量', true); return; }
      const r = await rpc('wbs_sell_to_gov', { p_pitch_id: id, p_qty: amt });
      toast('已交付 ' + fmt(r.qty) + ' 件，收到 ' + fmt(r.income) + ' ' + (CUR_SIGN[r.currency] || ''));
      await reload();
    },

    async setFx(el) {
      const cur = el.getAttribute('data-cur');
      const rate = Number($('#fx-' + cur).value);
      if (!rate || rate <= 0) { toast('汇率必须大于 0', true); return; }
      const r = await rpc('wbs_set_fx', { p_currency: cur, p_rate: rate });
      toast(r.name + ' 汇率已调整为 ' + fmt(r.rate, 4));
      await reload();
    },

    // ---------- 政府：政府采购招标 ----------

    async procCreate() {
      const product = ($('#pcProduct') || {}).value || '';
      const qty = Number(($('#pcQty') || {}).value);
      const price = Number(($('#pcPrice') || {}).value);
      const cur = ($('#pcCur') || {}).value || 'G';
      const target = ($('#pcTarget') || {}).value || '';
      const note = ($('#pcNote') || {}).value || '';
      if (!product) { toast('请选择要采购的产品', true); return; }
      if (!qty || qty <= 0) { toast('采购数量必须大于 0', true); return; }
      if (!price || price <= 0) { toast('采购单价必须大于 0', true); return; }
      const cost = price * qty;
      if (!window.confirm('确认从国库支出 ' + fmt(cost) + ' ' + (CUR_SIGN[cur] || cur) +
        ' 采购「' + prodName(product) + '」×' + fmt(qty) + '？\n（国库立刻预扣，取消或跨年会退回未成交部分）')) return;
      try {
        const r = await rpc('wbs_procure_create', {
          p_product: product, p_qty: qty, p_price: price, p_currency: cur,
          p_target: target || null, p_note: note || null,
        });
        toast('采购招标已发布：' + r.name + ' ×' + fmt(r.qty) + ' @ ' + fmt(r.price) + ' ' + (CUR_SIGN[cur] || cur));
        await reload();
      } catch (e) {
        toast(errMsg(e), true);
      }
    },

    async procCancel(el) {
      const id = Number(el.getAttribute('data-id'));
      if (!window.confirm('确认撤销这笔采购招标？未成交部分会退回国库。')) return;
      try {
        const r = await rpc('wbs_procure_cancel', { p_id: id });
        toast('已撤销，退回国库 ' + fmt(r.refund) + ' G');
        await reload();
      } catch (e) {
        toast(errMsg(e), true);
      }
    },

    async procFill(el) {
      const id = Number(el.getAttribute('data-id'));
      const box = $('#pf-' + id);
      const qty = Number(box ? box.value : 0);
      if (!qty || qty <= 0) { toast('请输入交付数量', true); return; }
      try {
        const r = await rpc('wbs_procure_fill', { p_id: id, p_qty: qty });
        toast('已交付 ' + fmt(r.qty) + ' 件，收到 ' + fmt(r.income) + ' ' + (CUR_SIGN[r.currency] || '') +
          (r.bonus > 0 ? '，另有出口奖励 ' + fmt(r.bonus) + ' G' : ''));
        await reload();
      } catch (e) {
        toast(errMsg(e), true);
      }
    },

    // ---------- 政府：政策法令 ----------

    async polIssue() {
      const kind = ($('#poKind') || {}).value || '';
      const title = ($('#poTitle') || {}).value || '';
      const body = ($('#poBody') || {}).value || '';
      const product = ($('#poProduct') || {}).value || '';
      const rate = Number(($('#poRate') || {}).value) || 0;
      const amount = Number(($('#poAmount') || {}).value) || 0;
      const budget = Number(($('#poBudget') || {}).value) || 0;
      if (!title.trim()) { toast('请填写政策名称', true); return; }
      const cost = budget;
      if (!window.confirm('确认颁布「' + title.trim() + '」？\n将从国库支出 ' + fmt(cost) + ' G。')) return;
      try {
        const r = await rpc('wbs_policy_issue', {
          p_kind: kind, p_title: title, p_body: body || null,
          p_product: product || null, p_rate: rate, p_amount: amount, p_budget: budget,
        });
        toast('政策已颁布：' + r.title);
        await reload();
      } catch (e) {
        toast(errMsg(e), true);
      }
    },

    async polRevoke(el) {
      const id = Number(el.getAttribute('data-id'));
      if (!window.confirm('确认撤销这项政策？剩余预算会退回国库。')) return;
      try {
        const r = await rpc('wbs_policy_revoke', { p_id: id, p_note: null });
        toast('已撤销，退回 ' + fmt(r.refund) + ' G');
        await reload();
      } catch (e) {
        toast(errMsg(e), true);
      }
    },

    // ---------- 政府：平准操作（国库收储 / 抛储）----------

    async govTrade(el) {
      const code = el.getAttribute('data-code');
      const side = el.getAttribute('data-side');
      const box = $('#gt-' + code.replace(/[^a-zA-Z0-9]/g, '_'));
      const qty = Number(box ? box.value : 0);
      if (!qty || qty <= 0) { toast('请输入数量', true); return; }
      if (!window.confirm((side === 'buy' ? '国库收储 ' : '国库抛储 ') + itemNameByCode(code) + ' ×' + fmt(qty) + '？\n' +
        '成交价按现价，且会直接推动行情（' + (side === 'buy' ? '上推' : '下压') + '）。')) return;
      try {
        const r = await rpc('wbs_gov_trade', { p_code: code, p_side: side, p_qty: qty });
        toast((side === 'buy' ? '收储' : '抛储') + '完成：' + r.name + ' ×' + fmt(r.qty) +
          '，成交 ' + fmt(r.amount) + ' G，行情 ' + (r.pct > 0 ? '+' : '') + fmt(r.pct, 2) + '%');
        await reload();
      } catch (e) {
        toast(errMsg(e), true);
      }
    },

    // ---------- 产业协作：代工订单与专利授权 ----------

    async oemCreate() {
      const factory = ($('#ocFactory') || {}).value || '';
      const product = ($('#ocProduct') || {}).value || '';
      const qty = Number(($('#ocQty') || {}).value);
      const fee = Number(($('#ocFee') || {}).value);
      const note = ($('#ocNote') || {}).value || '';
      if (!factory) { toast('请选择代工厂', true); return; }
      if (!product) { toast('请选择产品', true); return; }
      if (!qty || qty <= 0) { toast('代工数量必须大于 0', true); return; }
      if (isNaN(fee) || fee < 0) { toast('加工费不能为负', true); return; }
      const total = fee * qty;
      const f = (S.players || []).find(p => p.owner_id === factory) || {};
      if (!window.confirm('确认向「' + (f.company_name || '该工厂') + '」下代工订单：\n' +
        prodName(product) + ' ×' + fmt(qty) + '，加工费 ' + fmt(fee) + ' G/件（合计 ' + fmt(total) + ' G）？\n\n' +
        '下单后生产该产品所需的原材料会从你的库存中划走并托管，加工费也会先扣到你这边。\n' +
        '工厂开工后成品直接进你的库，钱才付给工厂；撤单则原料与加工费全额退回。')) return;
      try {
        const r = await rpc('wbs_oem_create', {
          p_factory: factory, p_product: product, p_qty: qty, p_fee: fee, p_note: note || null
        });
        toast('代工订单已下达：' + r.name + ' ×' + fmt(r.qty) + '，原料估值 ' + fmt(r.mat_value) + ' G，托管加工费 ' + fmt(r.fee_total) + ' G');
        await reload();
      } catch (e) {
        toast(errMsg(e), true);
      }
    },

    async oemRun(el) {
      const id = Number(el.getAttribute('data-id'));
      const o = (S.oem || []).find(x => Number(x.id) === id) || {};
      if (!window.confirm('确认开工生产「' + (o.product_name || '该产品') + '」×' + fmt(o.qty) + '？\n' +
        '成品会直接进入委托方的库存，加工费 ' + fmt(o.fee_total) + ' G 立刻转入你的账户。')) return;
      try {
        const r = await rpc('wbs_oem_run', { p_id: id });
        toast('代工完工：' + r.name + ' ×' + fmt(r.qty) + ' 已入库委托方，你收到加工费 ' + fmt(r.fee_total) + ' G');
        await reload();
      } catch (e) {
        toast(errMsg(e), true);
      }
    },

    async oemCancel(el) {
      const id = Number(el.getAttribute('data-id'));
      const o = (S.oem || []).find(x => Number(x.id) === id) || {};
      if (!window.confirm('确认撤销这笔代工订单？\n托管的原材料与加工费 ' + fmt(o.fee_total) + ' G 会全额退回下单方。')) return;
      try {
        const r = await rpc('wbs_oem_cancel', { p_id: id });
        toast('代工订单已撤销，退回加工费 ' + fmt(r.refund_fee) + ' G，归还原料 ' + fmt(r.materials_back) + ' 种');
        await reload();
      } catch (e) {
        toast(errMsg(e), true);
      }
    },

    async licGrant() {
      const product = ($('#lcProduct') || {}).value || '';
      const licensee = ($('#lcLicensee') || {}).value || '';
      const fee = Number(($('#lcFee') || {}).value);
      const upfront = Number(($('#lcUpfront') || {}).value);
      const years = Number(($('#lcYears') || {}).value);
      if (!product) { toast('请选择要授权的产品', true); return; }
      if (!licensee) { toast('请选择被授权方', true); return; }
      if (!years || years < 1 || years > 5) { toast('授权年限必须在 1~5 之间', true); return; }
      if ((!fee || fee <= 0) && (!upfront || upfront <= 0)) { toast('一次性授权费与每件提成不能同时为 0', true); return; }
      const m = (S.players || []).find(p => p.owner_id === licensee) || {};
      if (!window.confirm('确认把「' + prodName(product) + '」的生产许可授予「' + (m.company_name || '该制造商') + '」？\n\n' +
        '有效期 ' + years + ' 个财年；每件提成 ' + fmt(fee) + ' G；一次性授权费 ' + fmt(upfront) + ' G。\n' +
        '对方每次投产都会自动把提成打给你。')) return;
      try {
        const r = await rpc('wbs_license_grant', {
          p_product: product, p_licensee: licensee,
          p_fee: fee || 0, p_years: years, p_upfront: upfront || 0
        });
        toast('已授权 ' + r.licensee + ' 生产「' + r.name + '」，有效期至财年 ' + r.expire_year);
        await reload();
      } catch (e) {
        toast(errMsg(e), true);
      }
    },

    async licRevoke(el) {
      const id = Number(el.getAttribute('data-id'));
      const l = (S.licenses || []).find(x => Number(x.id) === id) || {};
      if (!window.confirm('确认撤销对「' + (l.licensee_name || '对方') + '」的「' + (l.product_name || '该产品') + '」生产许可？\n' +
        '对方此后不能再新投产该产品，已有库存不受影响。')) return;
      try {
        const r = await rpc('wbs_license_revoke', { p_id: id });
        toast('已撤销对 ' + r.licensee + ' 的「' + (l.product_name || '该产品') + '」授权');
        await reload();
      } catch (e) {
        toast(errMsg(e), true);
      }
    },

    async sendMail() {
      const to = $('#mailTo').value;
      const subject = $('#mailSubject').value.trim();
      const body = $('#mailBody').value.trim();
      if (!to) { toast('请选择收件人', true); return; }
      if (!subject) { toast('请填写邮件主题', true); return; }
      const r = await rpc('wbs_send_mail', { p_to: to, p_subject: subject, p_body: body });
      toast('邮件已发送给 ' + r.to);
      await reload();
    },

    async readMail(el) {
      await rpc('wbs_read_mail', { p_id: Number(el.getAttribute('data-id')) });
      await reload();
    },

    async doExchange() {
      const from = $('#fxFrom').value;
      const to = $('#fxTo').value;
      const amt = Number($('#fxAmount').value);
      if (from === to) { toast('卖出与买入不能是同一种货币', true); return; }
      if (!amt || amt <= 0) { toast('请输入兑换数量', true); return; }
      const r = await rpc('wbs_exchange', { p_from: from, p_to: to, p_amount: amt });
      toast('兑换完成：' + fmt(amt) + ' ' + (CUR_SIGN[from] || '') + ' → ' + fmt(r.got) + ' ' + (CUR_SIGN[to] || ''));
      await reload();
    },

    async openYear() {
      if (isTrial() && !window.confirm('当前是试运营财年：直接开启正式财年会自动清空试运营的全部数据（交易、库存、流水、成绩），所有队伍恢复 ¥2,000 初始资金。\n\n确认直接进入正式财年？')) return;
      const rateRaw = $('#jyRate').value.trim();
      const tariffRaw = $('#jyTariff').value.trim();
      const args = {};
      if (rateRaw) args.p_exchange = Number(rateRaw);
      if (tariffRaw) args.p_tariff = Number(tariffRaw);
      const r = await rpc('wbs_open_year', args);
      toast('财年 ' + r.fiscal_year + ' 已开启｜汇率 ' + fmt(r.exchange_rate, 2) + '｜关税 ' + fmt(Number(r.tariff_rate) * 100, 1) + '%');
      await reload();
    },

    async openTrial() {
      const r = await rpc('wbs_open_year', { p_trial: true });
      toast('🎮 试运营财年已开启（财年 ' + r.fiscal_year + '）——随便玩，成绩不算数！');
      await reload();
    },

    async endTrial() {
      if (!window.confirm('结束试运营并重置全部数据？\n\n试运营期间的所有交易、库存、流水、成绩都会清空，所有队伍恢复 ¥2,000 初始资金。\n重置后即可开启正式第 1 财年。')) return;
      if (!window.confirm('再次确认：试运营数据真的不要了吗？')) return;
      await rpc('wbs_reset_game', {});
      toast('试运营已结束，数据已重置。可以开启正式第 1 财年了 🚀');
      await reload();
    },

    async closeYear() {
      if (!window.confirm('确认结算当前财年？结算后本财年将无法再进行任何交易。')) return;
      const r = await rpc('wbs_close_year', {});
      toast('财年 ' + r.fiscal_year + ' 已结算，共 ' + r.companies + ' 家公司入榜');
      await reload();
    },

    async announce() {
      const text = $('#jyAnn').value.trim();
      if (!text) { toast('请先填写公告内容', true); return; }
      await rpc('wbs_post_news', { p_title: '【组委会公告】', p_body: text });
      toast('公告已发布');
      await reload();
    },

    async resetGame() {
      const ok = window.confirm('重置整场比赛将清空所有流水、库存、合同、资讯与历届成绩，并把所有队伍现金恢复为 2000。\n\n该操作不可恢复，确定继续？');
      if (!ok) return;
      const again = window.confirm('再次确认：真的要清空整场比赛的数据吗？');
      if (!again) return;
      await rpc('wbs_reset_game', {});
      toast('比赛已重置');
      view = 'judge';
      await reload();
    },

    // ---------- 身份预览（只读） ----------
    // 全角色巡览：直接点卡片切换视角，比「先选下拉、再点按钮」快得多
    previewAs(el) {
      if (!isRealAdmin() && !isPreview()) { toast('只有裁判 / 组委会可以切换预览视角', true); return; }
      const r = el.getAttribute('data-role');
      if (!r || !ROLE_LABEL[r]) return;
      previewRole = r;
      renderShell();
      renderView();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      toast('已切换到「' + ROLE_LABEL[r] + '」视角 · 只读预览');
    },

    previewStart() {
      if (!isRealAdmin()) { toast('只有裁判 / 组委会可以开启身份预览', true); return; }
      const sel = $('#prevRole');
      const r = sel ? sel.value : null;
      if (!r || !ROLE_LABEL[r]) { toast('请选择要预览的角色', true); return; }
      previewRole = r;
      view = 'overview';
      renderShell();
      renderView();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      toast('已切换到「' + ROLE_LABEL[r] + '」视角 · 只读预览');
    },

    previewStop() {
      if (!previewRole) return;
      previewRole = null;
      view = 'judge';
      renderShell();
      renderView();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      toast('已退出预览，回到裁判视角');
    },

    // ---------- 管理口令 ----------
    async showJudgeCode() {
      const box = $('#judgeCodeBox');
      if (!box) return;
      box.innerHTML = '<span class="hint">读取中…</span>';
      try {
        const r = await rpc('wbs_judge_code_get');
        box.innerHTML = r && r.is_set
          ? `<b>${esc(r.code)}</b><span class="hint" style="margin-left:10px;">注册「政府 / 裁判」时填这个</span>`
          : '<span class="hint">尚未设置，请在右侧重设一个</span>';
      } catch (e) {
        box.innerHTML = `<span class="hint">${esc(errMsg(e))}</span>`;
      }
    },

    async setJudgeCode() {
      const input = $('#jCodeNew');
      if (!input) return;
      const v = (input.value || '').trim();
      if (v.length < 4) { toast('管理口令至少 4 位', true); input.focus(); return; }
      if (v.length > 40) { toast('管理口令请控制在 40 位以内', true); input.focus(); return; }
      const r = await rpc('wbs_judge_code_set', { p_new_code: v });
      input.value = '';
      const box = $('#judgeCodeBox');
      if (box) box.innerHTML = `<b>${esc(r.code)}</b><span class="hint" style="margin-left:10px;">注册「政府 / 裁判」时填这个</span>`;
      toast('管理口令已更新，旧口令即刻作废');
      await reload();
    },
  };

  function bind(root) {
    $$('[data-act]', root).forEach(el => {
      if (el.__bound) return;
      el.__bound = true;
      el.addEventListener('click', async (e) => {
        e.preventDefault();
        const name = el.getAttribute('data-act');
        const fn = ACTIONS[name];
        if (!fn) return;
        if (el.disabled) return;
        // 身份预览是只读的：除导航跳转与退出预览外，任何写操作一律拦下
        if (previewBlocked(name)) {
          toast('预览模式：已屏蔽写操作，先点「退出预览」再操作', true);
          return;
        }
        el.disabled = true;
        try {
          await fn(el);
        } catch (err) {
          toast(errMsg(err), true);
        } finally {
          el.disabled = false;
        }
      });
    });
  }

  // 战时军需：切换「物资类型」时重填「物资」下拉 —— 原料池与成品池不是同一批东西
  // { 控件 id: [要重填的目标 select, 是否只列我持有的] }
  const KIND_TO_ITEM = { wsKind: ['wsItem', true], woKind: ['woItem', false] };
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (!t || !t.id) return;
    // 交付大厅：切类别重填标的下拉（只列系统货池里 + 我手上有货的），并联动建议价 / 可交付数
    if (t.id === 'dlKind') {
      const sel = document.getElementById('dlItem');
      const kind = t.value === 'material' ? 'material' : 'product';
      const pool = kind === 'material' ? (S.materials || []) : (S.products || []);
      const list = pool.filter(x => stockQty(kind, x.code) > 0);
      sel.innerHTML = list.length
        ? list.map(x => `<option value="${esc(x.code)}">${esc(x.name)}（可交 ${fmt(stockQty(kind, x.code))}）</option>`).join('')
        : '<option value="">（你手上没有可交付的货，先去采购 / 投产）</option>';
      syncDeliveryPick();
      return;
    }
    if (t.id === 'dlItem') { syncDeliveryPick(); return; }
    if (!KIND_TO_ITEM[t.id]) return;
    const cfg = KIND_TO_ITEM[t.id];
    const sel = document.getElementById(cfg[0]);
    if (!sel) return;
    const kind = t.value === 'product' ? 'product' : 'material';
    let list = kind === 'material' ? (S.materials || []) : (S.products || []);
    if (cfg[1]) list = list.filter(x => stockQty(kind, x.code) > 0);
    sel.innerHTML = list.length
      ? list.map(x => `<option value="${esc(x.code)}">${esc(x.name)}（${fmt(stockQty(kind, x.code))}）</option>`).join('')
      : '<option value="">（没有可用的物资）</option>';
  });

  // 建档页面的提交按钮
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!t) return;
    if (t.id === 'setSubmit') {
      ACTIONS.submitProfile().catch(err => toast(errMsg(err), true));
    }
    // 显示设置面板：齿轮开关；点面板外自动收起
    if (t.closest && t.closest('#btnUiPrefs')) {
      const panel = $('#uiPrefs');
      if (panel) panel.classList.toggle('hidden');
      return;
    }
    if (t.closest && t.closest('#upIdxScroll')) {
      uiPrefs.idxScroll = !uiPrefs.idxScroll;
      saveUiPrefs(); syncUiPanel();
      setBarScrolling($('#idxBar'), $('#idxTrack'), uiPrefs.idxScroll, 'idx');
      return;
    }
    if (t.closest && t.closest('#upNbScroll')) {
      uiPrefs.nbScroll = !uiPrefs.nbScroll;
      saveUiPrefs(); syncUiPanel();
      setBarScrolling($('#newsBar'), $('#nbTrack'), uiPrefs.nbScroll, 'nb');
      return;
    }
    const uiPanel = $('#uiPrefs');
    if (uiPanel && !uiPanel.classList.contains('hidden') && !(t.closest && t.closest('#uiPrefs'))) {
      uiPanel.classList.add('hidden');
    }
    // 右上角图标按钮内嵌了 svg / 角标，必须用 closest 才能命中
    if (t.closest && t.closest('#btnMail')) {
      view = 'mail';
      renderShell();
      renderView();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (t.id === 'btnRefresh') {
      reload(true);
    }
    if (t.closest && t.closest('#btnTheme')) {
      ACTIONS.themeToggle();
      return;
    }
    if (t.id === 'btnSignOut') {
      cloud.auth.signOut().then(() => onSignedOut()).catch(() => onSignedOut());
    }
  });

  // 显示设置：高度滑杆（拖动即时生效）
  document.addEventListener('input', (e) => {
    const t = e.target;
    if (!t) return;
    if (t.id === 'upIdxH') {
      uiPrefs.idxH = Math.min(100, Math.max(44, Number(t.value) || 56));
      saveUiPrefs(); syncUiPanel(); applyUiPrefs();
    } else if (t.id === 'upNbH') {
      uiPrefs.nbH = Math.min(80, Math.max(28, Number(t.value) || 36));
      saveUiPrefs(); syncUiPanel(); applyUiPrefs();
    } else if (t.id === 'rdSec') {
      // 研发申报：单件工时一改，就告诉你量产一批大概要等多久
      const pace = document.querySelector('#rdPace');
      const s = Number(t.value) || 0;
      if (pace) {
        pace.textContent = s > 0
          ? '按当前填法：量产 100 件约等 ' + fmtDur(prodLineWith(s, 100)) + '，500 件约等 ' + fmtDur(prodLineWith(s, 500)) + '。'
          : '';
      }
    } else if (t.id && t.id.indexOf('p-') === 0) {
      // 生产中心：数量一变就重算「预计多久完工」，让玩家投之前心里有数
      const code = t.id.slice(2);
      const est = document.querySelector('[data-prod-est="' + code + '"]');
      if (est) {
        const q = Number(t.value) || 0;
        est.textContent = q > 0
          ? '约 ' + fmtDur(prodLine(q, code)) + '完工 · 单件 ' + fmt(perUnitSec(code), 1) + ' 秒'
          : '请输入数量';
      }
    }
  });

  // ---------- 会话 ----------
  async function onSignedIn() {
    const { data } = await cloud.auth.getSession();
    session = data;
    if (!session) { showAuth(); return; }
    await refreshMe();
    if (!me) { showSetup(); return; }
    await loadAll();
    showApp();
    applyNavState();
    bindNavGrip();
    renderShell();
    renderView();
    startPolling();
  }

  function onSignedOut() {
    session = null;
    me = null;
    previewRole = null;
    S.game = null; S.players = []; S.offers = []; S.news = []; S.ledger = []; S.stock = [];
    S.posts = []; S.interests = []; S.loans = []; S.collateral = []; S.wars = []; S.sanctions = [];
    S.board = []; S.boardAt = '';
    stopPolling();
    showAuth();
  }

  // 行情心跳：6 秒一档。服务端做了节流，多个浏览器同时开着也只会推进一档，
  // 所以全场看到的是同一份走势 —— 就像一块真的交易所大屏。
  async function marketTick() {
    if (!session || !me) return;
    try {
      const { data, error } = await cloud.database.rpc('wbs_market_tick', {});
      if (error) throw error;
      applySnapshot(data);
      renderIdxBar();
      if (hallOn) renderHall();
      if (view === 'quotes') renderView();
      else if (view === 'bourse') {
        renderBourseLive();
        // K 线缓存每 5 档回补一次，其余档位直接用缓存重绘，省掉无谓请求
        kTickFlag = (kTickFlag + 1) % 5;
        if (kTickFlag === 0 && ordCode) loadKline(ordCode);
      }
      else if (view === 'hall') { /* 页内大屏由 renderHall 之外的卡片承载，价格靠 ticker 联动 */ }

      // 每 3 档做一次强平 / 到期清扫：把生死线交给市场，而不是靠人盯
      sweepFlag = (sweepFlag + 1) % 3;
      if (sweepFlag === 0) {
        const liq = await cloud.database.rpc('wbs_shorts_sweep', {});
        const due = await cloud.database.rpc('wbs_futures_sweep', {});
        const lc = liq && liq.data ? Number(liq.data.count) || 0 : 0;
        const dc = due && due.data ? Number(due.data.count) || 0 : 0;
        if (lc) toast('有 ' + lc + ' 笔做空头寸触及强平线，已被系统强制平仓', true);
        if (dc) toast('有 ' + dc + ' 张锁价合约到期，已按现价自动结算');
        if ((lc || dc) && (view === 'deriv' || view === 'quotes')) { await reload(); renderView(); }
      }
      // 每档顺手结算到期的产线：把「完成生产」交给场上的每一个客户端，谁在线谁推进
      try {
        const pr = await cloud.database.rpc('wbs_production_settle', {});
        const pc = pr && pr.data ? Number(pr.data.count) || 0 : 0;
        if (pc) {
          toast('有 ' + pc + ' 条产线完工，成品已入库并自动上架');
          if (view === 'factory' || view === 'inventory') await reload();
        }
      } catch (e) { /* 产线结算失败不该影响行情推进 */ }
    } catch (e) { /* 行情失败不影响比赛主流程 */ }
  }

  // 在建产线：进度条每秒走一格；一旦有产线到点就立刻结算，不必等 6 秒那一档行情。
  let prodTimer = null;
  let prodSettling = false;

  function tickProdProgress() {
    const now = Date.now();
    let due = false;
    (S.production || []).forEach(p => {
      if (p.status !== 'running') return;
      const st = Date.parse(p.started_at), ft = Date.parse(p.finish_at);
      if (isFinite(ft) && ft <= now) due = true;
      if (view !== 'factory') return;
      const bar = document.querySelector('[data-prod-bar="' + p.id + '"]');
      const left = document.querySelector('[data-prod-left="' + p.id + '"]');
      if (bar && isFinite(st) && isFinite(ft) && ft > st) {
        bar.style.width = Math.max(0, Math.min(99, (now - st) / (ft - st) * 100)).toFixed(1) + '%';
      }
      if (left && isFinite(ft)) {
        const sec = Math.max(0, Math.ceil((ft - now) / 1000));
        left.textContent = sec > 0 ? fmtDur(sec) : '即将完工';
      }
    });
    if (!due || prodSettling || !session || !me) return;
    prodSettling = true;
    rpc('wbs_production_settle', {}).then(async r => {
      const n = Number(r && r.count) || 0;
      if (n > 0) {
        const listed = Number(r && r.listed) || 0;
        toast(listed > 0
          ? '产线完工：' + (listed < n ? listed + ' 批已自动挂入盘口，其余' : '成品已自动挂入盘口，') + '去「我的委托」可改价或撤单'
          : '产线完工：成品已入库（当前为手动上架模式）');
        await reload();
      }
    }).catch(() => {}).finally(() => { prodSettling = false; });
  }

  // 行情轮询节奏跟随裁判设定的「几秒一更新」：客户端按不大于服务端间隔的节奏拉快照
  function marketIntervalMs() {
    const sec = Number((S.rules && S.rules.fluct_sec) || 6);
    return Math.max(2000, Math.min(6000, (isFinite(sec) ? sec : 6) * 1000 - 500));
  }
  function setMarketTimer() {
    if (marketTimer) clearInterval(marketTimer);
    marketTimer = setInterval(marketTick, marketIntervalMs());
  }

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(async () => {
      if (!session || !me) return;
      if (INPUT_VIEWS.indexOf(view) >= 0) {
        try { await loadAll(); renderShell(); } catch (e) { /* 静默 */ }
        return;
      }
      try { await loadAll(); renderShell(); renderView(); } catch (e) { /* 静默 */ }
    }, 8000);
    setMarketTimer();
    prodTimer = setInterval(tickProdProgress, 1000);
  }

  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    if (marketTimer) { clearInterval(marketTimer); marketTimer = null; }
    if (prodTimer) { clearInterval(prodTimer); prodTimer = null; }
  }

  // ---------- 启动 ----------
  async function boot() {
    try {
      loadTheme();
      applyTheme();
      loadUiPrefs();
      applyUiPrefs();
      loadNavState();
      applyNavState();
      bindNavGrip();
      const { data } = await cloud.auth.getSession();
      session = data;
      if (!session) { showAuth(); return; }
      await refreshMe();
      if (!me) { showSetup(); return; }
      await loadAll();
      showApp();
      renderShell();
      renderView();
      startPolling();
    } catch (e) {
      $('#boot').textContent = '连接失败：' + errMsg(e);
    }
  }

  cloud.auth.onAuthStateChange(async (event) => {
    if (event === 'SIGNED_OUT') { onSignedOut(); return; }
    if (event === 'SIGNED_IN') {
      const { data } = await cloud.auth.getSession();
      session = data;
    }
  });

  // 大屏用 Esc 退出（浏览器原生全屏也会吞掉 Esc，所以两个都监听）
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && hallOn) { ACTIONS.hallExit(); }
  });
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && hallOn) { hallOn = false; renderHall(); }
  });

  window.addEventListener('error', (e) => {
    if (e && e.message) toast('页面异常：' + e.message, true);
  });

  // 窗口尺寸变了就重量一次新闻条，按新宽度重新决定复制份数（否则放大窗口可能露出空底）
  let nbResizeTimer = 0;
  window.addEventListener('resize', () => {
    if (nbResizeTimer) clearTimeout(nbResizeTimer);
    nbResizeTimer = setTimeout(() => { nbRepsKey = ''; renderNewsBar(); }, 200);
  });

  boot();
})();
