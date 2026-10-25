-- ============================================================
-- 第 3 步：全部服务端函数（SECURITY DEFINER）
-- ============================================================

CREATE OR REPLACE FUNCTION public.wbs_accept_offer(p_id bigint)\nCREATE OR REPLACE FUNCTION public.wbs_accept_offer(p_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  o wbs_offers;
  v_uid text; v_name text; v_role text;
  v_seller text; v_seller_name text; v_buyer text; v_buyer_name text;
  v_amount numeric; v_cash numeric; v_stock numeric;
  v_fy int; v_phase text; v_pname text; v_kind text;
  v_emb text; v_fee numeric; v_mine numeric; v_burn numeric; v_tariff numeric := 0; v_need numeric;
  v_list jsonb; v_it jsonb; i int; v_tgt text; v_payer text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT phase, fiscal_year INTO v_phase, v_fy FROM wbs_game WHERE id = 1;
  IF v_phase <> 'open' THEN RAISE EXCEPTION '当前不在交易期，无法签单'; END IF;
  SELECT * INTO o FROM wbs_offers WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '挂单不存在'; END IF;
  IF o.status <> 'open' THEN RAISE EXCEPTION '该挂单已被处理'; END IF;
  IF o.owner_id = v_uid THEN RAISE EXCEPTION '不能接受自己的挂单'; END IF;
  IF o.target_owner IS NOT NULL AND o.target_owner <> v_uid THEN RAISE EXCEPTION '该合同指定了 % 签署，其他人无法签署', COALESCE(o.target_name, '其他公司'); END IF;
  SELECT company_name, role INTO v_name, v_role FROM wbs_players WHERE owner_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION '请先完成队伍注册'; END IF;
  IF o.target_role IS NOT NULL AND o.target_role <> v_role THEN RAISE EXCEPTION '该挂单仅面向指定角色'; END IF;

  v_kind := COALESCE(o.kind, 'product');
  IF v_kind = 'material' THEN
    SELECT name INTO v_pname FROM wbs_materials WHERE code = o.item_code;
  ELSE
    SELECT name INTO v_pname FROM wbs_products WHERE code = o.item_code;
  END IF;
  v_pname := COALESCE(v_pname, o.item_code);

  DECLARE v_lock text; BEGIN
    SELECT string_agg(DISTINCT w.attacker_name || ' / ' || w.defender_name, '；') INTO v_lock
      FROM wbs_wars w
     WHERE w.status IN ('declared','fighting')
       AND (w.attacker_id IN (v_uid, o.owner_id) OR w.defender_id IN (v_uid, o.owner_id));
    IF v_lock IS NOT NULL THEN RAISE EXCEPTION '战时封锁：% 正在交战，交战方在战事结束前无法签署新合同', v_lock; END IF;
  END;

  SELECT string_agg(x, '、') INTO v_emb FROM (
    SELECT DISTINCT p.company_name || '（被 ' || sn.company_name || ' 禁运）' AS x
      FROM wbs_sanctions sn JOIN wbs_players p ON p.owner_id = sn.target_id
     WHERE sn.kind = 'embargo' AND sn.status = 'active' AND sn.until_year >= v_fy
       AND sn.target_id IN (v_uid, o.owner_id)) q;
  IF v_emb IS NOT NULL THEN RAISE EXCEPTION '交易受阻：%', v_emb; END IF;

  v_amount := o.qty * o.price;
  IF o.side = 'sell' THEN
    v_seller := o.owner_id; v_seller_name := o.company_name; v_buyer := v_uid; v_buyer_name := v_name;
  ELSE
    v_buyer := o.owner_id; v_buyer_name := o.company_name; v_seller := v_uid; v_seller_name := v_name;
  END IF;
  SELECT cash INTO v_cash FROM wbs_players WHERE owner_id = v_buyer FOR UPDATE;
  IF COALESCE(v_cash, 0) < v_amount THEN RAISE EXCEPTION '买方现金不足，需要 % 金币', v_amount; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('tgt', sn.target_id, 'sowner', sn.owner_id, 'sname', sn.company_name, 'rate', sn.rate)), '[]'::jsonb)
    INTO v_list FROM wbs_sanctions sn
   WHERE sn.kind = 'tariff' AND sn.status = 'active' AND sn.until_year >= v_fy
     AND sn.target_id IN (v_uid, o.owner_id);
  IF jsonb_array_length(v_list) > 0 THEN
    FOR i IN 0 .. jsonb_array_length(v_list) - 1 LOOP
      v_it := v_list -> i;
      v_fee := round(v_amount * (v_it ->> 'rate')::numeric / 100.0, 2);
      IF v_fee > 0 THEN
        v_tariff := v_tariff + v_fee;
        v_tgt := v_it ->> 'tgt';
        SELECT company_name INTO v_payer FROM wbs_players WHERE owner_id = v_tgt;
        SELECT cash INTO v_cash FROM wbs_players WHERE owner_id = v_tgt FOR UPDATE;
        v_need := v_fee + CASE WHEN v_buyer = v_tgt THEN v_amount ELSE 0 END;
        IF COALESCE(v_cash, 0) < v_need THEN RAISE EXCEPTION '% 处于被加征关税状态，需缴 % 金币，现金不足', v_payer, v_fee; END IF;
      END IF;
    END LOOP;
  END IF;

  SELECT COALESCE(qty, 0) INTO v_stock FROM wbs_stock WHERE owner_id = v_seller AND kind = v_kind AND item_code = o.item_code;
  IF COALESCE(v_stock, 0) < o.qty THEN RAISE EXCEPTION '卖方%库存不足，无法交割', CASE WHEN v_kind = 'material' THEN '原材料' ELSE '成品' END; END IF;

  UPDATE wbs_players SET cash = cash - v_amount WHERE owner_id = v_buyer;
  UPDATE wbs_players SET cash = cash + v_amount WHERE owner_id = v_seller;
  UPDATE wbs_stock SET qty = qty - o.qty WHERE owner_id = v_seller AND kind = v_kind AND item_code = o.item_code;
  INSERT INTO wbs_stock(owner_id, kind, item_code, qty) VALUES (v_buyer, v_kind, o.item_code, o.qty)
    ON CONFLICT (owner_id, kind, item_code) DO UPDATE SET qty = wbs_stock.qty + EXCLUDED.qty;
  UPDATE wbs_offers SET status = 'done', counterparty_id = v_uid, counterparty_name = v_name WHERE id = p_id;
  INSERT INTO wbs_ledger(owner_id, fiscal_year, kind, detail, amount)
    VALUES (v_buyer, v_fy, 'contract_buy', '向 ' || v_seller_name || ' 采购 ' || v_pname || ' ×' || o.qty, -v_amount);
  INSERT INTO wbs_ledger(owner_id, fiscal_year, kind, detail, amount)
    VALUES (v_seller, v_fy, 'contract_sell', '售予 ' || v_buyer_name || ' ' || v_pname || ' ×' || o.qty, v_amount);

  IF jsonb_array_length(v_list) > 0 THEN
    FOR i IN 0 .. jsonb_array_length(v_list) - 1 LOOP
      v_it := v_list -> i;
      v_fee := round(v_amount * (v_it ->> 'rate')::numeric / 100.0, 2);
      IF v_fee > 0 THEN
        v_tgt := v_it ->> 'tgt';
        v_mine := round(v_fee * 0.5, 2);
        v_burn := v_fee - v_mine;
        UPDATE wbs_players SET cash = cash - v_fee WHERE owner_id = v_tgt;
        UPDATE wbs_players SET cash = cash + v_mine WHERE owner_id = (v_it ->> 'sowner');
        INSERT INTO wbs_ledger(owner_id, fiscal_year, kind, detail, amount)
          VALUES (v_tgt, v_fy, 'tariff_pay', '向 ' || (v_it ->> 'sname') || ' 缴纳贸易关税', -v_fee);
        INSERT INTO wbs_ledger(owner_id, fiscal_year, kind, detail, amount)
          VALUES ((v_it ->> 'sowner'), v_fy, 'tariff_gain', '自 ' || (SELECT company_name FROM wbs_players WHERE owner_id = v_tgt) || ' 收取的贸易关税（半数）', v_mine);
        IF v_burn > 0 THEN
          INSERT INTO wbs_ledger(owner_id, fiscal_year, kind, detail, amount)
            VALUES (v_tgt, v_fy, 'tariff_burn', '贸易摩擦损耗（关税的另一半蒸发）', -v_burn);
        END IF;
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('amount', v_amount, 'qty', o.qty, 'item', o.item_code, 'kind', v_kind, 'tariff', v_tariff);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_admin_adjust_cash(p_owner text, p_amount numeric, p_reason text, p_mode text DEFAULT 'delta'::text)\nCREATE OR REPLACE FUNCTION public.wbs_admin_adjust_cash(p_owner text, p_amount numeric, p_reason text, p_mode text DEFAULT 'delta'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_role text;
  v_fy int;
  v_reason text;
  v_mode text;
  v_n int := 0;
  v_delta numeric;
  v_before numeric;
  v_log text := '';
  r record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT role INTO v_role FROM wbs_players WHERE owner_id = auth.uid();
  IF v_role IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION '只有裁判 / 组委会可以调控资金'; END IF;

  v_reason := trim(COALESCE(p_reason, ''));
  IF length(v_reason) = 0 THEN RAISE EXCEPTION '请填写调整事由'; END IF;
  IF length(v_reason) > 40 THEN RAISE EXCEPTION '事由请控制在 40 字以内'; END IF;

  v_mode := COALESCE(NULLIF(trim(p_mode), ''), 'delta');
  IF v_mode NOT IN ('delta', 'set') THEN RAISE EXCEPTION '调整方式不合法'; END IF;
  IF p_amount IS NULL THEN RAISE EXCEPTION '请填写金额'; END IF;
  IF p_amount <> round(p_amount) THEN RAISE EXCEPTION '金额请填整数'; END IF;
  IF p_amount = 0 THEN RAISE EXCEPTION '金额不能为 0'; END IF;
  IF v_mode = 'set' AND p_amount < 0 THEN RAISE EXCEPTION '设定的金额不能是负数'; END IF;

  SELECT fiscal_year INTO v_fy FROM wbs_game WHERE id = 1;

  FOR r IN
    SELECT owner_id, company_name, cash
      FROM wbs_players
     WHERE (COALESCE(p_owner, '__ALL__') IN ('__ALL__', '') OR owner_id = p_owner)
     ORDER BY id
       FOR UPDATE
  LOOP
    v_before := r.cash;
    IF v_mode = 'set' THEN v_delta := p_amount - v_before; ELSE v_delta := p_amount; END IF;
    IF v_delta = 0 THEN CONTINUE; END IF;
    IF v_before + v_delta < 0 THEN
      RAISE EXCEPTION '「%」现金不足：当前 % G，本次最多只能扣 % G', r.company_name, v_before, v_before;
    END IF;
    UPDATE wbs_players
       SET cash = v_before + v_delta,
           total_asset = total_asset + v_delta
     WHERE owner_id = r.owner_id;
    INSERT INTO wbs_ledger(owner_id, fiscal_year, kind, detail, amount)
      VALUES (r.owner_id, v_fy, 'admin_adjust',
              (CASE WHEN v_delta > 0 THEN '组委会拨款：' ELSE '组委会扣减：' END) || v_reason,
              v_delta);
    v_log := v_log || CASE WHEN v_log = '' THEN '' ELSE '；' END
             || r.company_name || (CASE WHEN v_delta > 0 THEN ' +' ELSE ' ' END) || v_delta || ' G';
    v_n := v_n + 1;
  END LOOP;

  IF v_n = 0 THEN RAISE EXCEPTION '没有找到符合条件的队伍'; END IF;

  INSERT INTO wbs_news(owner_id, author, title, body, kind, fiscal_year)
    VALUES (auth.uid(), '组委会', '【资金调控】' || v_reason,
            '本次调整 ' || v_n || ' 支队伍：' || v_log, 'news', v_fy);

  RETURN jsonb_build_object('count', v_n, 'mode', v_mode, 'amount', p_amount);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_admin_adjust_stock(p_owner text, p_kind text, p_item text, p_qty numeric, p_reason text DEFAULT NULL::text)\nCREATE OR REPLACE FUNCTION public.wbs_admin_adjust_stock(p_owner text, p_kind text, p_item text, p_qty numeric, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid text; v_role text; v_fy int; v_name text; v_label text;
  v_qty numeric; v_op text; v_note text; v_all boolean;
  v_n int := 0; v_log text := ''; r record;
  v_before numeric; v_after numeric; v_lb numeric; v_la numeric; v_cname text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT role INTO v_role FROM wbs_players WHERE owner_id = v_uid;
  IF v_role IS NULL THEN RAISE EXCEPTION '请先完成队伍注册'; END IF;
  IF v_role NOT IN ('admin','government') THEN RAISE EXCEPTION '只有组委会 / 政府可以调拨货物'; END IF;

  IF p_kind NOT IN ('material','product') THEN RAISE EXCEPTION '只能调拨原材料或成品'; END IF;

  IF p_kind = 'material' THEN
    SELECT name INTO v_label FROM wbs_materials WHERE code = p_item;
    IF NOT FOUND THEN RAISE EXCEPTION '原材料不存在：%', COALESCE(p_item, '（空）'); END IF;
  ELSE
    SELECT name INTO v_label FROM wbs_products WHERE code = p_item;
    IF NOT FOUND THEN RAISE EXCEPTION '产品不存在：%', COALESCE(p_item, '（空）'); END IF;
  END IF;

  v_qty := round(COALESCE(p_qty, 0), 0);
  IF v_qty = 0 THEN RAISE EXCEPTION '调拨数量不能为 0'; END IF;
  IF abs(v_qty) > 100000 THEN RAISE EXCEPTION '单次调拨请控制在 100000 单位以内'; END IF;

  v_note := NULLIF(trim(COALESCE(p_reason, '')), '');
  IF v_note IS NULL THEN RAISE EXCEPTION '请填写调拨事由'; END IF;
  IF length(v_note) > 40 THEN RAISE EXCEPTION '事由请控制在 40 字以内'; END IF;

  SELECT fiscal_year INTO v_fy FROM wbs_game WHERE id = 1;
  v_fy := COALESCE(v_fy, 0);
  v_op := CASE WHEN v_qty > 0 THEN '调拨入库' ELSE '调拨出库' END;
  v_all := COALESCE(p_owner, '__ALL__') IN ('__ALL__', '');

  IF NOT v_all AND NOT EXISTS (SELECT 1 FROM wbs_players WHERE owner_id = p_owner) THEN
    RAISE EXCEPTION '目标队伍不存在';
  END IF;

  FOR r IN SELECT owner_id, company_name FROM wbs_players
            WHERE v_all OR owner_id = p_owner ORDER BY id FOR UPDATE
  LOOP
    v_cname := r.company_name;
    v_before := COALESCE((SELECT qty FROM wbs_stock
      WHERE owner_id = r.owner_id AND kind = p_kind AND item_code = p_item), 0);
    v_after := v_before + v_qty;
    IF v_after < 0 THEN
      RAISE EXCEPTION '「%」库存不够：% 目前只有 % 单位，本次要扣 % 单位', v_cname, v_label, v_before, abs(v_qty);
    END IF;
    IF v_after > 100000000 THEN RAISE EXCEPTION '「%」调拨后库存过大，请分批操作', v_cname; END IF;

    IF v_after = 0 THEN
      DELETE FROM wbs_stock WHERE owner_id = r.owner_id AND kind = p_kind AND item_code = p_item;
    ELSE
      INSERT INTO wbs_stock(owner_id, kind, item_code, qty) VALUES (r.owner_id, p_kind, p_item, v_after)
        ON CONFLICT (owner_id, kind, item_code) DO UPDATE SET qty = EXCLUDED.qty;
    END IF;

    INSERT INTO wbs_ledger(owner_id, fiscal_year, kind, detail, amount)
      VALUES (r.owner_id, v_fy,
        CASE WHEN v_qty > 0 THEN 'gov_grant' ELSE 'gov_seize' END,
        v_op || '：' || v_label || ' ×' || abs(v_qty) || '（' || v_note || '）', 0);

    INSERT INTO wbs_mail(sender_id, sender_name, recipient_id, recipient_name, subject, body, kind, fiscal_year)
      VALUES (NULL, '组委会', r.owner_id, v_cname,
        '【物资调拨】' || v_op || '：' || v_label || ' ×' || abs(v_qty),
        '组委会于第 ' || v_fy || ' 财年对贵司「' || v_label || '」执行了' || v_op || ' ' || abs(v_qty) || ' 单位。'
        || chr(10) || '调拨前 ' || v_before || ' 单位 → 调拨后 ' || v_after || ' 单位。'
        || chr(10) || '说明：' || v_note, 'system', v_fy);

    v_lb := v_before; v_la := v_after;
    v_log := v_log || CASE WHEN v_log = '' THEN '' ELSE '；' END
             || v_cname || ' ' || v_before || '→' || v_after;
    v_n := v_n + 1;
  END LOOP;

  IF v_n = 0 THEN RAISE EXCEPTION '没有找到符合条件的队伍'; END IF;

  INSERT INTO wbs_news(owner_id, author, title, body, kind, fiscal_year)
    VALUES (v_uid, '组委会', '【物资调拨】' || v_op || '：' || v_label || ' ×' || abs(v_qty),
            '本次调整 ' || v_n || ' 支队伍：' || v_log || '。事由：' || v_note, 'news', v_fy);

  RETURN jsonb_build_object('count', v_n, 'kind', p_kind, 'item', p_item, 'name', v_label,
    'delta', v_qty, 'op', v_op, 'log', v_log, 'before', v_lb, 'after', v_la, 'reason', v_note);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_admin_ban(p_target text, p_status text, p_reason text DEFAULT NULL::text)\nCREATE OR REPLACE FUNCTION public.wbs_admin_ban(p_target text, p_status text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid text; v_t record; v_name text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT role, company_name INTO v_uid, v_name FROM wbs_players WHERE owner_id = auth.uid();
  IF v_name IS NULL THEN RAISE EXCEPTION '请先完成注册'; END IF;
  IF v_uid <> 'admin' THEN RAISE EXCEPTION '只有裁判可以执行破产 / 注销'; END IF;
  IF p_status NOT IN ('bankrupt','cancelled','active') THEN RAISE EXCEPTION '状态不合法'; END IF;
  SELECT * INTO v_t FROM wbs_players WHERE owner_id = p_target FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '目标账号不存在'; END IF;
  IF v_t.role = 'admin' AND p_status <> 'active' THEN RAISE EXCEPTION '不能注销裁判账号'; END IF;
  UPDATE wbs_players SET status = p_status,
    ban_reason = CASE WHEN p_status = 'active' THEN NULL ELSE NULLIF(trim(COALESCE(p_reason,'')),'') END,
    ban_at = CASE WHEN p_status = 'active' THEN NULL ELSE now() END
   WHERE owner_id = p_target;
  INSERT INTO wbs_news(title, body, fiscal_year, kind) VALUES (
    CASE p_status
      WHEN 'bankrupt' THEN '【破产公告】' || v_t.company_name || ' 已由组委会宣告破产'
      WHEN 'cancelled' THEN '【注销公告】' || v_t.company_name || ' 的账号已被组委会注销'
      ELSE '【恢复公告】' || v_t.company_name || ' 已恢复经营资格'
    END,
    CASE WHEN p_status = 'active' THEN '经组委会核准，该队伍恢复全部交易权限。'
      ELSE '事由：' || COALESCE(NULLIF(trim(COALESCE(p_reason,'')),''), '组委会裁定') END,
    (SELECT fiscal_year FROM wbs_game WHERE id = 1), 'system');
  INSERT INTO wbs_mail(sender_id, sender_name, recipient_id, recipient_name, subject, body, kind, fiscal_year)
    VALUES (NULL, '系统通知', p_target, v_t.company_name,
    CASE p_status WHEN 'bankrupt' THEN '破产通知' WHEN 'cancelled' THEN '账号注销通知' ELSE '恢复经营通知' END,
    CASE WHEN p_status = 'active' THEN '你的账号已恢复全部权限。'
      ELSE '组委会已' || CASE p_status WHEN 'bankrupt' THEN '宣告你方破产' ELSE '注销你的账号' END || '。事由：' || COALESCE(NULLIF(trim(COALESCE(p_reason,'')),''), '组委会裁定') END,
    'system', (SELECT fiscal_year FROM wbs_game WHERE id = 1));
  RETURN jsonb_build_object('target', p_target, 'status', p_status, 'company', v_t.company_name);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_admin_fluct(p_on text, p_mat numeric, p_prod numeric, p_oth numeric, p_drift numeric)\nCREATE OR REPLACE FUNCTION public.wbs_admin_fluct(p_on text, p_mat numeric, p_prod numeric, p_oth numeric, p_drift numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role text; v_mat numeric; v_prod numeric; v_oth numeric; v_drift numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT role INTO v_role FROM wbs_players WHERE owner_id = auth.uid();
  IF v_role IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION '只有裁判可以设定自动波动'; END IF;
  IF p_on NOT IN ('0','1') THEN RAISE EXCEPTION '波动开关不合法'; END IF;
  v_mat := round(COALESCE(p_mat, 1.6), 2); v_prod := round(COALESCE(p_prod, 0.9), 2);
  v_oth := round(COALESCE(p_oth, 0.6), 2); v_drift := round(COALESCE(p_drift, 6), 2);
  IF v_mat < 0 OR v_mat > 20 THEN RAISE EXCEPTION '原材料波动率需在 0 ~ 20 之间'; END IF;
  IF v_prod < 0 OR v_prod > 20 THEN RAISE EXCEPTION '成品波动率需在 0 ~ 20 之间'; END IF;
  IF v_oth < 0 OR v_oth > 20 THEN RAISE EXCEPTION '其他品种波动率需在 0 ~ 20 之间'; END IF;
  IF v_drift < 0 OR v_drift > 50 THEN RAISE EXCEPTION '回归强度需在 0 ~ 50 之间'; END IF;
  UPDATE wbs_settings SET value = p_on, updated_at = now() WHERE key = 'fluct_on';
  UPDATE wbs_settings SET value = v_mat::text, updated_at = now() WHERE key = 'fluct_mat';
  UPDATE wbs_settings SET value = v_prod::text, updated_at = now() WHERE key = 'fluct_prod';
  UPDATE wbs_settings SET value = v_oth::text, updated_at = now() WHERE key = 'fluct_oth';
  UPDATE wbs_settings SET value = v_drift::text, updated_at = now() WHERE key = 'fluct_drift';
  IF p_on = '0' THEN
    PERFORM wbs_notice('system', '组委会公告：全场行情已冻结', '组委会已暂停自动波动，全部品种价格保持不变，直至恢复。');
  ELSE
    PERFORM wbs_notice('system', '组委会公告：行情波动参数已更新',
      '自动波动已开启：原材料 ±' || v_mat || '%、成品 ±' || v_prod || '%、其他 ±' || v_oth || '%（每 6 秒一档），向基准价回归强度 ' || v_drift || '%。');
  END IF;
  RETURN jsonb_build_object('on', p_on, 'mat', v_mat, 'prod', v_prod, 'oth', v_oth, 'drift', v_drift);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_admin_fluct(p_on text, p_mat numeric, p_prod numeric, p_oth numeric, p_drift numeric, p_sec integer DEFAULT 6, p_minutes integer DEFAULT 0)\nCREATE OR REPLACE FUNCTION public.wbs_admin_fluct(p_on text, p_mat numeric, p_prod numeric, p_oth numeric, p_drift numeric, p_sec integer DEFAULT 6, p_minutes integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp', 'cron'
AS $function$
DECLARE
  v_role text; v_mat numeric; v_prod numeric; v_oth numeric; v_drift numeric;
  v_sec int; v_minutes int; v_until text := '';
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT role INTO v_role FROM wbs_players WHERE owner_id = auth.uid();
  IF v_role IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION '只有裁判可以设定自动波动'; END IF;
  IF p_on NOT IN ('0','1') THEN RAISE EXCEPTION '波动开关不合法'; END IF;
  v_mat := round(COALESCE(p_mat, 1.6), 2); v_prod := round(COALESCE(p_prod, 0.9), 2);
  v_oth := round(COALESCE(p_oth, 0.6), 2); v_drift := round(COALESCE(p_drift, 6), 2);
  v_sec := COALESCE(p_sec, 6); v_minutes := COALESCE(p_minutes, 0);
  IF v_mat < 0 OR v_mat > 20 THEN RAISE EXCEPTION '原材料波动率需在 0 ~ 20 之间'; END IF;
  IF v_prod < 0 OR v_prod > 20 THEN RAISE EXCEPTION '成品波动率需在 0 ~ 20 之间'; END IF;
  IF v_oth < 0 OR v_oth > 20 THEN RAISE EXCEPTION '其他品种波动率需在 0 ~ 20 之间'; END IF;
  IF v_drift < 0 OR v_drift > 50 THEN RAISE EXCEPTION '回归强度需在 0 ~ 50 之间'; END IF;
  IF v_sec < 2 OR v_sec > 120 THEN RAISE EXCEPTION '更新间隔需在 2 ~ 120 秒之间'; END IF;
  IF v_minutes < 0 OR v_minutes > 600 THEN RAISE EXCEPTION '持续时长需在 0 ~ 600 分钟之间'; END IF;

  UPDATE wbs_settings SET value = p_on, updated_at = now() WHERE key = 'fluct_on';
  UPDATE wbs_settings SET value = v_mat::text, updated_at = now() WHERE key = 'fluct_mat';
  UPDATE wbs_settings SET value = v_prod::text, updated_at = now() WHERE key = 'fluct_prod';
  UPDATE wbs_settings SET value = v_oth::text, updated_at = now() WHERE key = 'fluct_oth';
  UPDATE wbs_settings SET value = v_drift::text, updated_at = now() WHERE key = 'fluct_drift';
  UPDATE wbs_settings SET value = v_sec::text, updated_at = now() WHERE key = 'fluct_sec';

  -- 持续时长：0 = 一直波动；>0 = 从现在起走这么久，到期自动冻结
  IF p_on = '1' AND v_minutes > 0 THEN
    v_until := to_char(now() + make_interval(mins => v_minutes), 'YYYY-MM-DD HH24:MI:SSOF');
  END IF;
  UPDATE wbs_settings SET value = v_until, updated_at = now() WHERE key = 'fluct_until';

  -- 行情定时任务按新间隔重排
  PERFORM cron.schedule('bizsim-market-autopilot', v_sec::text || ' seconds', 'SELECT public.wbs_market_autopilot()');

  IF p_on = '0' THEN
    PERFORM wbs_notice('system', '组委会公告：全场行情已冻结', '组委会已暂停自动波动，全部品种价格保持不变，直至恢复。');
  ELSE
    PERFORM wbs_notice('system', '组委会公告：行情波动参数已更新',
      '自动波动已开启：每 ' || v_sec || ' 秒一档，原材料 ±' || v_mat || '%、成品 ±' || v_prod || '%、其他 ±' || v_oth || '%，向基准价回归强度 ' || v_drift || '%' ||
      CASE WHEN v_minutes > 0 THEN '；本轮波动持续 ' || v_minutes || ' 分钟，到期自动冻结。' ELSE '；持续运行直到组委会调整。' END);
  END IF;
  RETURN jsonb_build_object('on', p_on, 'mat', v_mat, 'prod', v_prod, 'oth', v_oth, 'drift', v_drift, 'sec', v_sec, 'minutes', v_minutes);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_admin_ledger(p_owner text, p_limit integer DEFAULT 200)\nCREATE OR REPLACE FUNCTION public.wbs_admin_ledger(p_owner text, p_limit integer DEFAULT 200)
 RETURNS SETOF wbs_ledger
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
  v_role text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT role INTO v_role FROM wbs_players WHERE owner_id = auth.uid();
  IF v_role IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION '只有裁判 / 组委会可以核查他人账目'; END IF;
  IF p_owner IS NULL OR length(trim(p_owner)) = 0 THEN RAISE EXCEPTION '请指定要核查的队伍'; END IF;
  RETURN QUERY
    SELECT l.* FROM wbs_ledger l
     WHERE l.owner_id = p_owner
     ORDER BY l.id DESC
     LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 200), 500));
END $function$


CREATE OR REPLACE FUNCTION public.wbs_admin_set_product(p_code text, p_max_qty integer, p_note text)\nCREATE OR REPLACE FUNCTION public.wbs_admin_set_product(p_code text, p_max_qty integer, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid text; v_role text; v_cname text; v_fy int;
  r wbs_products;
  v_before int; v_after int; v_dflt int; v_note text;
  v_owner_name text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT role, company_name INTO v_role, v_cname FROM wbs_players WHERE owner_id = v_uid;
  IF v_role NOT IN ('admin','government') THEN RAISE EXCEPTION '只有组委会 / 政府可以调整产量上限'; END IF;
  IF p_code IS NULL OR trim(p_code) = '' THEN RAISE EXCEPTION '请选择要调整的产品'; END IF;

  SELECT * INTO r FROM wbs_products WHERE code = p_code FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '产品不存在：%', p_code; END IF;

  SELECT COALESCE(MAX(value::int) FILTER (WHERE key = 'produce_max_qty'), 50) INTO v_dflt
    FROM wbs_settings WHERE key = 'produce_max_qty';
  v_dflt := COALESCE(v_dflt, 50);
  v_note := NULLIF(trim(COALESCE(p_note, '')), '');
  SELECT fiscal_year INTO v_fy FROM wbs_game WHERE id = 1;
  v_fy := COALESCE(v_fy, 0);

  v_before := LEAST(999, GREATEST(1, COALESCE(NULLIF(r.max_qty, 0), v_dflt)));

  IF p_max_qty IS NULL OR p_max_qty = 0 THEN
    UPDATE wbs_products SET max_qty = NULL WHERE code = p_code;
    v_after := v_dflt;
  ELSE
    IF p_max_qty < 1 OR p_max_qty > 999 THEN RAISE EXCEPTION '「最多可产」需在 1 ~ 999 件之间'; END IF;
    UPDATE wbs_products SET max_qty = p_max_qty WHERE code = p_code;
    v_after := p_max_qty;
  END IF;

  INSERT INTO wbs_news(owner_id, author, title, body, kind, fiscal_year)
    VALUES (v_uid, v_cname, '【产量上限】' || r.name || '：' || v_before || ' → ' || v_after || ' 件',
            '组委会调整了「' || r.name || '」的单笔最多可产量：' || v_before || ' → ' || v_after || ' 件'
            || CASE WHEN p_max_qty IS NULL OR p_max_qty = 0 THEN '（已恢复跟随全场默认值）' ELSE '' END
            || CASE WHEN v_note IS NOT NULL THEN '。事由：' || v_note ELSE '。' END,
            'news', v_fy);

  IF r.owner_id IS NOT NULL THEN
    SELECT company_name INTO v_owner_name FROM wbs_players WHERE owner_id = r.owner_id;
    INSERT INTO wbs_mail(sender_id, sender_name, recipient_id, recipient_name, subject, body, kind, fiscal_year)
      VALUES (NULL, '组委会', r.owner_id, COALESCE(v_owner_name, ''),
              '【产量上限】' || r.name || '：' || v_before || ' → ' || v_after || ' 件',
              '你研发的产品「' || r.name || '」的单笔最多可产量已由组委会调整为 ' || v_after
              || ' 件（原 ' || v_before || ' 件）。生产中心会按新上限校验每一次投产。'
              || CASE WHEN v_note IS NOT NULL THEN E'\n\n事由：' || v_note ELSE '' END,
              'system', v_fy);
  END IF;

  RETURN jsonb_build_object('code', p_code, 'name', r.name, 'before', v_before, 'after', v_after,
                            'follows_default', (p_max_qty IS NULL OR p_max_qty = 0), 'default', v_dflt);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_auction_start(p_n integer DEFAULT 3)\nCREATE OR REPLACE FUNCTION public.wbs_auction_start(p_n integer DEFAULT 3)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_uid text; v_role text; v_tick int; v_phase text; v_n int; v_cleared int;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT role INTO v_role FROM wbs_players WHERE owner_id = v_uid;
  IF v_role NOT IN ('admin', 'government') THEN RAISE EXCEPTION '只有组委会可以启动集合竞价'; END IF;
  SELECT phase INTO v_phase FROM wbs_game WHERE id = 1;
  IF v_phase IS DISTINCT FROM 'open' THEN RAISE EXCEPTION '当前不是交易期，交易所尚未开市'; END IF;
  v_n := GREATEST(1, LEAST(20, COALESCE(p_n, 3)));
  SELECT COALESCE(max(tick), 0) INTO v_tick FROM wbs_quotes_live;

  v_cleared := wbs_orders_expire();
  PERFORM wbs_market_maker();

  UPDATE wbs_settings SET value = '0', updated_at = now() WHERE key = 'auction_done';
  UPDATE wbs_settings SET value = (v_tick + v_n)::text, updated_at = now() WHERE key = 'auction_until';
  UPDATE wbs_settings SET value = '0', updated_at = now() WHERE key = 'circuit_until';

  PERFORM wbs_notice('auction', '集合竞价开始 · 历时 ' || v_n || ' 档',
    '第 ' || (v_tick + 1) || ' ~ ' || (v_tick + v_n) || ' 档只接受委托申报、不产生价格；第 ' || (v_tick + v_n + 1) || ' 档按最大成交量价位一次性定出开盘价。开盘前已清理 ' || v_cleared || ' 笔旧委托并原路退款。');
  RETURN jsonb_build_object('auction_until', v_tick + v_n, 'ticks', v_n, 'cleared', v_cleared);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_bond_apply(p_face numeric, p_coupon numeric, p_total numeric, p_mature integer, p_reason text)\nCREATE OR REPLACE FUNCTION public.wbs_bond_apply(p_face numeric, p_coupon numeric, p_total numeric, p_mature integer, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_uid text; v_name text; v_fy int; v_id bigint; v_seq int; v_face numeric; v_total numeric; v_code text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT company_name INTO v_name FROM wbs_players WHERE owner_id = v_uid;
  IF v_name IS NULL THEN RAISE EXCEPTION '请先完成队伍注册'; END IF;
  IF EXISTS (SELECT 1 FROM wbs_bonds WHERE issuer_id = v_uid AND status = 'pending') THEN
    RAISE EXCEPTION '你已有一笔待审批的发债申请';
  END IF;
  v_face := round(COALESCE(p_face, 100), 2);
  IF v_face < 1 OR v_face > 10000 THEN RAISE EXCEPTION '面值应在 1 ~ 10000 G 之间'; END IF;
  IF COALESCE(p_coupon, 0) < 0.01 OR COALESCE(p_coupon, 0) > 0.30 THEN
    RAISE EXCEPTION '票面利率必须在 1%% ~ 30%% 之间';
  END IF;
  v_total := round(COALESCE(p_total, 0), 0);
  IF v_total < 10 THEN RAISE EXCEPTION '发行张数至少 10 张'; END IF;
  IF COALESCE(p_mature, 1) < 1 OR COALESCE(p_mature, 1) > 5 THEN RAISE EXCEPTION '期限应为 1 ~ 5 个财年'; END IF;
  SELECT fiscal_year INTO v_fy FROM wbs_game WHERE id = 1;
  SELECT COALESCE(max(id), 0) + 1 INTO v_seq FROM wbs_bonds;
  v_code := 'BND:' || lpad(v_seq::text, 4, '0');

  INSERT INTO wbs_bonds(code, name, issuer_id, issuer_name, face, coupon, total, issue_fy, mature_fy, status, reason)
  VALUES (v_code, v_name || '债 ' || lpad(v_seq::text, 2, '0'), v_uid, v_name, v_face, COALESCE(p_coupon, 0.06), v_total,
          v_fy, v_fy + COALESCE(p_mature, 1), 'pending', p_reason)
  RETURNING id INTO v_id;

  PERFORM wbs_notice('bond', v_name || ' 申请发行企业债 ' || v_code,
    '面值 ' || v_face || ' G，票面利率 ' || round(COALESCE(p_coupon, 0) * 100, 1) || '%，发行 ' || v_total || ' 张（募资上限 ' || round(v_face * v_total, 2) || ' G），' || COALESCE(p_mature, 1) || ' 个财年后到期。等待组委会核准。');
  RETURN jsonb_build_object('id', v_id, 'code', v_code, 'face', v_face, 'total', v_total, 'matureFy', v_fy + COALESCE(p_mature, 1));
END $function$


CREATE OR REPLACE FUNCTION public.wbs_bond_review(p_id bigint, p_approve boolean, p_coupon numeric, p_rating text, p_note text)\nCREATE OR REPLACE FUNCTION public.wbs_bond_review(p_id bigint, p_approve boolean, p_coupon numeric, p_rating text, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE b wbs_bonds; v_uid text; v_fy int; v_cp numeric; v_rt text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  IF NOT EXISTS (SELECT 1 FROM wbs_players WHERE owner_id = v_uid AND role IN ('admin', 'government')) THEN
    RAISE EXCEPTION '只有组委会（裁判 / 政府）可以核准发债';
  END IF;
  SELECT * INTO b FROM wbs_bonds WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '发债申请不存在'; END IF;
  IF b.status <> 'pending' THEN RAISE EXCEPTION '该申请已处理'; END IF;
  SELECT fiscal_year INTO v_fy FROM wbs_game WHERE id = 1;

  IF NOT p_approve THEN
    UPDATE wbs_bonds SET status = 'rejected', note = p_note, approved_by = v_uid WHERE id = p_id;
    PERFORM wbs_notice('bond', '发债申请未通过 · ' || b.issuer_name,
      COALESCE(NULLIF(btrim(p_note), ''), '组委会未通过该发债申请。'));
    RETURN jsonb_build_object('id', p_id, 'status', 'rejected');
  END IF;

  v_cp := round(COALESCE(NULLIF(p_coupon, 0), b.coupon), 4);
  IF v_cp < 0.005 OR v_cp > 0.35 THEN
    RAISE EXCEPTION '核准利率必须在 0.5%% ~ 35%% 之间';
  END IF;
  v_rt := upper(btrim(COALESCE(NULLIF(p_rating, ''), 'A')));
  IF v_rt NOT IN ('AAA', 'AA', 'A', 'BBB') THEN RAISE EXCEPTION '评级只能是 AAA / AA / A / BBB'; END IF;

  UPDATE wbs_bonds SET status = 'active', coupon = v_cp, rating = v_rt, note = p_note,
         approved_by = v_uid, issued_at = now() WHERE id = p_id;

  INSERT INTO wbs_quotes_live(code, name, kind, base, price, prev, "open", high, low, volume, tick, fiscal_year, updated_at)
  VALUES (b.code, b.issuer_name || '债', 'bond', b.face, b.face, b.face, b.face, b.face, b.face, 0,
          (SELECT COALESCE(max(tick), 0) FROM wbs_quotes_live), v_fy, now())
  ON CONFLICT (code) DO NOTHING;

  PERFORM wbs_notice('bond', '企业债发行 · ' || b.code || '（' || b.issuer_name || '）',
    '评级 ' || v_rt || '，面值 ' || b.face || ' G，票面利率 ' || round(v_cp * 100, 1) || '%，共 ' || b.total || ' 张，' || b.mature_fy || ' 财年到期。现已开放认购。');
  RETURN jsonb_build_object('id', p_id, 'status', 'active', 'code', b.code, 'coupon', v_cp, 'rating', v_rt);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_bond_settle(p_fy integer)\nCREATE OR REPLACE FUNCTION public.wbs_bond_settle(p_fy integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid text; v_fy int; b wbs_bonds; r record;
  v_int numeric; v_prin numeric; v_owed numeric; v_cash numeric; v_scale numeric;
  v_paid_i numeric := 0; v_paid_p numeric := 0; v_n int := 0; v_m int := 0; v_def int := 0; v_status text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  IF NOT EXISTS (SELECT 1 FROM wbs_players WHERE owner_id = v_uid AND role IN ('admin', 'government')) THEN
    RAISE EXCEPTION '只有组委会可以执行债券结算';
  END IF;
  SELECT fiscal_year INTO v_fy FROM wbs_game WHERE id = 1;
  IF p_fy IS NOT NULL THEN v_fy := p_fy; END IF;

  FOR b IN SELECT * FROM wbs_bonds WHERE status = 'active' ORDER BY id LOOP
    -- ① 年度付息
    IF b.paid_fy IS DISTINCT FROM v_fy THEN
      v_int := 0;
      FOR r IN SELECT owner_id, sum(qty) AS q FROM wbs_stock WHERE kind = 'bond' AND item_code = split_part(b.code, ':', 2) GROUP BY owner_id LOOP
        IF r.owner_id = b.issuer_id THEN CONTINUE; END IF;
        v_int := v_int + round(b.face * b.coupon * r.q, 2);
      END LOOP;
      IF v_int > 0 THEN
        SELECT cash INTO v_cash FROM wbs_players WHERE owner_id = b.issuer_id FOR UPDATE;
        v_scale := CASE WHEN COALESCE(v_cash, 0) >= v_int THEN 1 ELSE round(COALESCE(v_cash, 0) / v_int, 6) END;
        FOR r IN SELECT owner_id, sum(qty) AS q FROM wbs_stock WHERE kind = 'bond' AND item_code = split_part(b.code, ':', 2) GROUP BY owner_id LOOP
          CONTINUE WHEN r.owner_id = b.issuer_id;
          IF round(b.face * b.coupon * r.q, 2) <= 0 THEN CONTINUE; END IF;
          UPDATE wbs_players SET cash = cash + round(b.face * b.coupon * r.q * v_scale, 2) WHERE owner_id = r.owner_id;
          INSERT INTO wbs_ledger(owner_id, fiscal_year, kind, detail, amount)
            VALUES (r.owner_id, v_fy, 'bond_interest', '企业债付息 ' || b.code || ' ×' || r.q || ' 张', round(b.face * b.coupon * r.q * v_scale, 2));
        END LOOP;
        UPDATE wbs_players SET cash = GREATEST(0, cash - round(v_int * v_scale, 2)) WHERE owner_id = b.issuer_id;
        v_paid_i := v_paid_i + round(v_int * v_scale, 2);
        IF v_scale < 1 THEN
          PERFORM wbs_notice('bond', '付息不足 · ' || b.code, b.issuer_name || ' 现金不足，本次付息按 ' || round(v_scale * 100, 1) || '%% 比例支付。');
          v_def := v_def + 1;
        END IF;
      END IF;
      UPDATE wbs_bonds SET paid_fy = v_fy WHERE id = b.id;
      b.paid_fy := v_fy;
    END IF;

    -- ② 到期还本
    IF b.mature_fy <= v_fy THEN
      v_prin := 0;
      FOR r IN SELECT owner_id, sum(qty) AS q FROM wbs_stock WHERE kind = 'bond' AND item_code = split_part(b.code, ':', 2) GROUP BY owner_id LOOP
        CONTINUE WHEN r.owner_id = b.issuer_id;
        v_prin := v_prin + round(b.face * r.q, 2);
      END LOOP;
      v_owed := v_prin;
      SELECT cash INTO v_cash FROM wbs_players WHERE owner_id = b.issuer_id FOR UPDATE;
      v_scale := CASE WHEN v_owed <= 0 THEN 1 WHEN COALESCE(v_cash, 0) >= v_owed THEN 1 ELSE round(COALESCE(v_cash, 0) / v_owed, 6) END;
      FOR r IN SELECT owner_id, sum(qty) AS q FROM wbs_stock WHERE kind = 'bond' AND item_code = split_part(b.code, ':', 2) GROUP BY owner_id LOOP
        CONTINUE WHEN r.owner_id = b.issuer_id;
        UPDATE wbs_players SET cash = cash + round(b.face * r.q * v_scale, 2) WHERE owner_id = r.owner_id;
        INSERT INTO wbs_ledger(owner_id, fiscal_year, kind, detail, amount)
          VALUES (r.owner_id, v_fy, 'bond_redeem', '企业债到期还本 ' || b.code || ' ×' || r.q || ' 张', round(b.face * r.q * v_scale, 2));
      END LOOP;
      DELETE FROM wbs_stock WHERE kind = 'bond' AND item_code = split_part(b.code, ':', 2);
      v_paid_p := v_paid_p + round(v_owed * v_scale, 2);
      v_status := CASE WHEN v_scale >= 1 THEN 'matured' ELSE 'default' END;
      IF v_scale >= 1 THEN
        UPDATE wbs_players SET cash = GREATEST(0, cash - v_owed) WHERE owner_id = b.issuer_id;
        v_m := v_m + 1;
        PERFORM wbs_notice('bond', '企业债到期兑付 · ' || b.code, b.issuer_name || ' 足额偿还本金 ' || v_owed || ' G，债券摘牌。');
      ELSE
        UPDATE wbs_players SET cash = 0 WHERE owner_id = b.issuer_id;
        v_def := v_def + 1;
        PERFORM wbs_notice('bond', '企业债违约 · ' || b.code, b.issuer_name || ' 到期无力足额偿还，仅兑付 ' || round(v_scale * 100, 1) || '%% 本金。');
      END IF;
      UPDATE wbs_bonds SET status = v_status WHERE id = b.id;
      DELETE FROM wbs_quotes_live WHERE code = b.code;
      DELETE FROM wbs_orders WHERE code = b.code AND status IN ('open', 'partial');
    END IF;
    v_n := v_n + 1;
  END LOOP;

  RETURN jsonb_build_object('fiscal_year', v_fy, 'bonds', v_n, 'interest', v_paid_i, 'principal', v_paid_p, 'matured', v_m, 'defaulted', v_def);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_bond_subscribe(p_id bigint, p_qty numeric)\nCREATE OR REPLACE FUNCTION public.wbs_bond_subscribe(p_id bigint, p_qty numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE b wbs_bonds; v_uid text; v_qty numeric; v_cost numeric; v_cash numeric; v_fy int; v_item text; v_left numeric;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  IF NOT EXISTS (SELECT 1 FROM wbs_players WHERE owner_id = v_uid) THEN RAISE EXCEPTION '请先完成队伍注册'; END IF;
  SELECT * INTO b FROM wbs_bonds WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '债券不存在'; END IF;
  IF b.status <> 'active' THEN RAISE EXCEPTION '该债券不在认购期'; END IF;
  IF b.issuer_id = v_uid THEN RAISE EXCEPTION '发行人不能认购自己发行的债'; END IF;
  v_qty := round(COALESCE(p_qty, 0), 0);
  IF v_qty <= 0 THEN RAISE EXCEPTION '认购张数必须大于 0'; END IF;
  v_left := b.total - b.subscribed;
  IF v_qty > v_left THEN RAISE EXCEPTION '剩余可认购 % 张', v_left; END IF;
  v_cost := round(b.face * v_qty, 2);
  SELECT cash INTO v_cash FROM wbs_players WHERE owner_id = v_uid FOR UPDATE;
  IF COALESCE(v_cash, 0) < v_cost THEN RAISE EXCEPTION '现金不足，认购 % 张需 % G', v_qty, v_cost; END IF;
  SELECT fiscal_year INTO v_fy FROM wbs_game WHERE id = 1;
  v_item := split_part(b.code, ':', 2);

  UPDATE wbs_players SET cash = cash - v_cost WHERE owner_id = v_uid;
  UPDATE wbs_players SET cash = cash + v_cost WHERE owner_id = b.issuer_id;
  INSERT INTO wbs_stock(owner_id, kind, item_code, qty) VALUES (v_uid, 'bond', v_item, v_qty)
    ON CONFLICT (owner_id, kind, item_code) DO UPDATE SET qty = wbs_stock.qty + EXCLUDED.qty;
  UPDATE wbs_bonds SET subscribed = subscribed + v_qty WHERE id = p_id;

  INSERT INTO wbs_ledger(owner_id, fiscal_year, kind, detail, amount)
    VALUES (v_uid, v_fy, 'bond_buy', '认购企业债 ' || b.code || ' ×' || v_qty || ' 张 @ ' || b.face || ' G', -v_cost);
  INSERT INTO wbs_ledger(owner_id, fiscal_year, kind, detail, amount)
    VALUES (b.issuer_id, v_fy, 'bond_issue', '发行企业债 ' || b.code || ' 募集 ' || v_cost || ' G', v_cost);

  PERFORM wbs_notice('bond', '企业债认购 · ' || b.code, '有投资人认购 ' || v_qty || ' 张，累计认购 ' || (b.subscribed + v_qty) || ' / ' || b.total || ' 张。');
  RETURN jsonb_build_object('id', p_id, 'code', b.code, 'qty', v_qty, 'cost', v_cost, 'left', v_left - v_qty);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_bourse_seed()\nCREATE OR REPLACE FUNCTION public.wbs_bourse_seed()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_uid text; v_role text; v_n int; v_codes int; v_live int;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT role INTO v_role FROM wbs_players WHERE owner_id = v_uid;
  IF v_role IS NULL THEN RAISE EXCEPTION '请先完成队伍注册'; END IF;
  SELECT count(*) INTO v_live FROM wbs_orders WHERE owner_id = '__exchange__' AND status = 'open';
  IF v_role NOT IN ('admin','government') AND v_live > 0 THEN
    RAISE EXCEPTION '盘口已有报价，只有组委会可以重新布市';
  END IF;
  v_n := wbs_market_maker();
  SELECT count(DISTINCT code) INTO v_codes FROM wbs_orders WHERE owner_id = '__exchange__' AND status = 'open';
  IF v_role IN ('admin','government') THEN
    PERFORM wbs_notice('auction', '交易所已布市',
      '系统商户已挂出 ' || v_n || ' 笔双边报价，覆盖 ' || v_codes || ' 个品种。');
  END IF;
  RETURN jsonb_build_object('orders', v_n, 'codes', v_codes);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_buy_material(p_code text, p_qty numeric)\nCREATE OR REPLACE FUNCTION public.wbs_buy_material(p_code text, p_qty numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_uid text;
  v_base numeric;
  v_spot numeric;
  v_left numeric;
  v_cash numeric;
  v_cost numeric;
  v_fy int;
  v_phase text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  IF p_qty IS NULL OR p_qty <= 0 THEN RAISE EXCEPTION '购买数量必须大于 0'; END IF;
  SELECT phase, fiscal_year INTO v_phase, v_fy FROM wbs_game WHERE id = 1;
  IF v_phase <> 'open' THEN RAISE EXCEPTION '当前不在交易期，无法采购'; END IF;
  SELECT price, supply_left INTO v_base, v_left FROM wbs_materials WHERE code = p_code FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '原材料不存在'; END IF;
  IF p_qty > v_left THEN RAISE EXCEPTION '原材料剩余不足，仅剩 % 单位', v_left; END IF;

  -- 现货成交价：优先取行情中心的实时报价，取不到就退回目录基准价
  SELECT price INTO v_spot FROM wbs_quotes_live WHERE code = 'MAT:' || p_code;
  IF v_spot IS NULL OR v_spot <= 0 THEN v_spot := v_base; END IF;

  v_cost := round(v_spot * p_qty, 2);
  SELECT cash INTO v_cash FROM wbs_players WHERE owner_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '请先完成队伍注册'; END IF;
  IF v_cash < v_cost THEN RAISE EXCEPTION '现金不足，需要 % 金币', v_cost; END IF;
  UPDATE wbs_materials SET supply_left = supply_left - p_qty WHERE code = p_code;
  UPDATE wbs_players SET cash = cash - v_cost WHERE owner_id = v_uid;
  INSERT INTO wbs_stock(owner_id, kind, item_code, qty) VALUES (v_uid, 'material', p_code, p_qty)
    ON CONFLICT (owner_id, kind, item_code) DO UPDATE SET qty = wbs_stock.qty + EXCLUDED.qty;
  INSERT INTO wbs_ledger(owner_id, fiscal_year, kind, detail, amount)
    VALUES (v_uid, v_fy, 'buy_material',
      '采购原材料 ' || p_code || ' ×' || p_qty || '（现货 ' || v_spot || ' G）', -v_cost);
  RETURN jsonb_build_object('cost', v_cost, 'qty', p_qty, 'unit', v_spot, 'base', v_base);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_call_auction()\nCREATE OR REPLACE FUNCTION public.wbs_call_auction()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE r record; v_px numeric; v_vol numeric; v_base numeric; n int := 0;
BEGIN
  FOR r IN SELECT DISTINCT code FROM wbs_orders WHERE status IN ('open','partial') LOOP
    v_px := NULL; v_vol := NULL;
    SELECT c.px, c.vol INTO v_px, v_vol FROM (
      SELECT d.p AS px,
        LEAST(
          (SELECT COALESCE(sum(o.qty - o.filled), 0) FROM wbs_orders o
             WHERE o.code = r.code AND o.side = 'buy' AND o.status IN ('open','partial') AND o.price >= d.p),
          (SELECT COALESCE(sum(o.qty - o.filled), 0) FROM wbs_orders o
             WHERE o.code = r.code AND o.side = 'sell' AND o.status IN ('open','partial') AND o.price <= d.p)
        ) AS vol
      FROM (SELECT DISTINCT price AS p FROM wbs_orders WHERE code = r.code AND status IN ('open','partial')) d
    ) c
    WHERE c.vol > 0
    ORDER BY c.vol DESC, ABS(c.px - COALESCE((SELECT base FROM wbs_quotes_live WHERE code = r.code), c.px)) ASC
    LIMIT 1;
    CONTINUE WHEN v_px IS NULL;

    UPDATE wbs_quotes_live SET "open" = v_px, prev = v_px, price = v_px,
           high = GREATEST(high, v_px), low = LEAST(low, v_px), updated_at = now()
     WHERE code = r.code;
    PERFORM wbs_notice('auction', '集合竞价成交 · ' || (SELECT name FROM wbs_quotes_live WHERE code = r.code),
      '开盘价 ' || v_px || ' G，集合竞价成交量 ' || v_vol || ' 手');
    PERFORM wbs_match_orders(r.code);
    PERFORM wbs_market_cleanup(r.code);
    n := n + 1;
  END LOOP;
  PERFORM wbs_notice('auction', '集合竞价完成，' || n || ' 个品种定出开盘价',
    '开盘价由买卖双方申报量最大的价位决定，未参与竞价的品种沿用上一财年收盘价。');
  RETURN jsonb_build_object('codes', n);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_cancel_offer(p_id bigint)\nCREATE OR REPLACE FUNCTION public.wbs_cancel_offer(p_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE o wbs_offers;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT * INTO o FROM wbs_offers WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION '挂单不存在'; END IF;
  IF o.owner_id <> auth.uid() THEN RAISE EXCEPTION '只能撤销自己的挂单'; END IF;
  IF o.status <> 'open' THEN RAISE EXCEPTION '该挂单已成交或已撤销'; END IF;
  UPDATE wbs_offers SET status = 'cancelled' WHERE id = p_id;
  RETURN jsonb_build_object('ok', true);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_close_post(p_id bigint)\nCREATE OR REPLACE FUNCTION public.wbs_close_post(p_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_uid text; v_st text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT status INTO v_st FROM wbs_posts WHERE id = p_id AND owner_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '公告不存在或不属于你'; END IF;
  IF v_st = 'open' THEN UPDATE wbs_posts SET status = 'closed' WHERE id = p_id; RETURN jsonb_build_object('status','closed');
  ELSE UPDATE wbs_posts SET status = 'open' WHERE id = p_id; RETURN jsonb_build_object('status','open'); END IF;
END $function$


CREATE OR REPLACE FUNCTION public.wbs_close_year()\nCREATE OR REPLACE FUNCTION public.wbs_close_year()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_role text;
  v_fy int;
  p record;
  v_rev numeric; v_cost numeric; v_mat numeric; v_prod numeric; v_net numeric;
  v_fx numeric := 0; v_ra numeric := 0; v_rb numeric := 0;
  v_count int := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT role INTO v_role FROM wbs_players WHERE owner_id = auth.uid();
  IF v_role IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION '只有裁判可以结算财年'; END IF;
  SELECT fiscal_year INTO v_fy FROM wbs_game WHERE id = 1;
  IF (SELECT phase FROM wbs_game WHERE id = 1) <> 'open' THEN RAISE EXCEPTION '当前没有进行中的财年'; END IF;

  SELECT COALESCE(rate, 0) INTO v_ra FROM wbs_fx WHERE currency = 'A';
  SELECT COALESCE(rate, 0) INTO v_rb FROM wbs_fx WHERE currency = 'B';
  v_ra := COALESCE(v_ra, 0); v_rb := COALESCE(v_rb, 0);

  FOR p IN SELECT owner_id AS p_owner, company_name AS p_company, role AS p_role,
                  cash AS p_cash, cash_a AS p_a, cash_b AS p_b
             FROM wbs_players LOOP
    SELECT COALESCE(SUM(amount) FILTER (WHERE amount > 0), 0),
           COALESCE(-SUM(amount) FILTER (WHERE amount < 0), 0)
      INTO v_rev, v_cost
      FROM wbs_ledger
     WHERE owner_id = p.p_owner AND fiscal_year = v_fy AND kind <> 'admin_adjust';

    SELECT COALESCE(SUM(s.qty * m.price), 0) INTO v_mat
      FROM wbs_stock s JOIN wbs_materials m ON m.code = s.item_code
      WHERE s.owner_id = p.p_owner AND s.kind = 'material';

    SELECT COALESCE(SUM(s.qty * COALESCE((
        SELECT SUM((pr.recipe ->> k)::numeric * mm.price)
        FROM jsonb_object_keys(pr.recipe) AS k
        JOIN wbs_materials mm ON mm.code = k
      ), 0)), 0) INTO v_prod
      FROM wbs_stock s JOIN wbs_products pr ON pr.code = s.item_code
      WHERE s.owner_id = p.p_owner AND s.kind = 'product';

    v_fx := p.p_a * v_ra + p.p_b * v_rb;
    v_net := p.p_cash + v_fx + v_mat + v_prod;

    INSERT INTO wbs_scores(owner_id, company_name, role, fiscal_year, revenue, cost, profit, stock_value, net_worth)
    VALUES (p.p_owner, p.p_company, p.p_role, v_fy, v_rev, v_cost, v_rev - v_cost, v_mat + v_prod, v_net)
    ON CONFLICT (owner_id, fiscal_year) DO UPDATE
      SET revenue = EXCLUDED.revenue, cost = EXCLUDED.cost, profit = EXCLUDED.profit,
          stock_value = EXCLUDED.stock_value, net_worth = EXCLUDED.net_worth;

    UPDATE wbs_players SET total_asset = v_net WHERE owner_id = p.p_owner;
    v_count := v_count + 1;
  END LOOP;

  UPDATE wbs_game SET phase = 'closed', updated_at = now() WHERE id = 1;
  RETURN jsonb_build_object('fiscal_year', v_fy, 'companies', v_count);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_create_offer(p_side text, p_item text, p_qty numeric, p_price numeric, p_target_role text, p_target_owner text DEFAULT NULL::text, p_note text DEFAULT NULL::text)\nCREATE OR REPLACE FUNCTION public.wbs_create_offer(p_side text, p_item text, p_qty numeric, p_price numeric, p_target_role text, p_target_owner text DEFAULT NULL::text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid text; v_name text; v_role text; v_fy int; v_phase text; v_id bigint; v_stock numeric;
  v_to_name text; v_kind text; v_code text; v_label text; v_note text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT phase, fiscal_year INTO v_phase, v_fy FROM wbs_game WHERE id = 1;
  IF v_phase <> 'open' THEN RAISE EXCEPTION '当前不在交易期，无法起草合同'; END IF;
  IF p_qty IS NULL OR p_qty <= 0 THEN RAISE EXCEPTION '数量必须大于 0'; END IF;
  IF p_price IS NULL OR p_price <= 0 THEN RAISE EXCEPTION '单价必须大于 0'; END IF;
  IF p_side NOT IN ('sell','buy') THEN RAISE EXCEPTION '交易方向不合法'; END IF;
  v_note := NULLIF(btrim(COALESCE(p_note, '')), '');
  IF length(v_note) > 300 THEN RAISE EXCEPTION '合同说明最多 300 字'; END IF;

  IF p_item LIKE 'MAT:%' THEN v_kind := 'material'; v_code := substring(p_item from 5);
  ELSIF p_item LIKE 'PRD:%' THEN v_kind := 'product'; v_code := substring(p_item from 5);
  ELSE v_kind := 'product'; v_code := p_item;
  END IF;

  IF v_kind = 'material' THEN
    SELECT name INTO v_label FROM wbs_materials WHERE code = v_code;
    IF NOT FOUND THEN RAISE EXCEPTION '原材料不存在'; END IF;
  ELSE
    SELECT name INTO v_label FROM wbs_products WHERE code = v_code;
    IF NOT FOUND THEN RAISE EXCEPTION '产品不存在'; END IF;
  END IF;

  SELECT company_name, role INTO v_name, v_role FROM wbs_players WHERE owner_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION '请先完成队伍注册'; END IF;
  IF NULLIF(p_target_owner,'') IS NOT NULL THEN
    IF p_target_owner = v_uid THEN RAISE EXCEPTION '不能把合同指定给自己'; END IF;
    SELECT company_name INTO v_to_name FROM wbs_players WHERE owner_id = p_target_owner;
    IF NOT FOUND THEN RAISE EXCEPTION '指定的交易对象不存在'; END IF;
  END IF;

  IF p_side = 'sell' THEN
    SELECT COALESCE(qty, 0) INTO v_stock FROM wbs_stock
      WHERE owner_id = v_uid AND kind = v_kind AND item_code = v_code;
    IF COALESCE(v_stock, 0) < p_qty THEN
      RAISE EXCEPTION '可售%不足，现有 % 件', CASE WHEN v_kind = 'material' THEN '原材料' ELSE '成品' END, COALESCE(v_stock, 0);
    END IF;
  END IF;

  INSERT INTO wbs_offers(owner_id, company_name, fiscal_year, side, item_code, kind, qty, price, target_role, target_owner, target_name, status, note)
  VALUES (v_uid, v_name, v_fy, p_side, v_code, v_kind, p_qty, p_price, NULLIF(p_target_role, ''), NULLIF(p_target_owner,''),
          (SELECT company_name FROM wbs_players WHERE owner_id = NULLIF(p_target_owner,'')), 'open', v_note)
  RETURNING id INTO v_id;

  IF NULLIF(p_target_owner,'') IS NOT NULL THEN
    INSERT INTO wbs_mail(sender_id, sender_name, recipient_id, recipient_name, subject, body, kind, fiscal_year)
      VALUES (v_uid, v_name, p_target_owner, v_to_name, '【专属合同】' || v_name || ' 向你发出一份合同',
              v_name || ' 起草了一份专属合同：' || CASE WHEN p_side='sell' THEN '向你供货' ELSE '向你求购' END || ' ' || v_label || ' ×' || p_qty || '，单价 ' || p_price || ' G。' || COALESCE('合同说明：' || v_note || ' ', '') || '请到「合同中心」签署或拒绝。', 'system', v_fy);
  ELSIF p_side = 'sell' THEN
    PERFORM wbs_notify_role('trader', '交易所有新货上架',
      v_name || ' 上架了 ' || v_label || ' ×' || p_qty || '，报价 ' || p_price || ' G，可到「证券交易所」直接买入。', v_uid);
  ELSE
    PERFORM wbs_notify_role('manufacturer', '交易所有新的求购',
      v_name || ' 正在求购 ' || v_label || ' ×' || p_qty || '，出价 ' || p_price || ' G，有货可到「证券交易所」直接卖出。', v_uid);
  END IF;

  RETURN jsonb_build_object('id', v_id, 'kind', v_kind, 'code', v_code, 'name', v_label, 'qty', p_qty, 'price', p_price, 'side', p_side);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_delete_post(p_id bigint)\nCREATE OR REPLACE FUNCTION public.wbs_delete_post(p_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_uid text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  DELETE FROM wbs_post_interest WHERE post_id = p_id AND EXISTS (SELECT 1 FROM wbs_posts WHERE id = p_id AND owner_id = v_uid);
  DELETE FROM wbs_posts WHERE id = p_id AND owner_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION '公告不存在或不属于你'; END IF;
  RETURN jsonb_build_object('deleted', true);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_delivery_cancel(p_id bigint)\nCREATE OR REPLACE FUNCTION public.wbs_delivery_cancel(p_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid text; v_fy int; v_left numeric; v_d wbs_deliveries;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT fiscal_year INTO v_fy FROM wbs_game WHERE id = 1;
  IF v_fy IS NULL THEN v_fy := 0; END IF;
  SELECT * INTO v_d FROM wbs_deliveries WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '该交付单不存在'; END IF;
  IF v_d.owner_id <> v_uid THEN RAISE EXCEPTION '只能撤销自己的交付单'; END IF;
  IF v_d.status <> 'open' THEN RAISE EXCEPTION '该交付单已不可撤销'; END IF;
  v_left := v_d.qty - v_d.filled;
  IF v_left <= 0 THEN RAISE EXCEPTION '该交付单已全部交付'; END IF;
  INSERT INTO wbs_stock(owner_id, kind, item_code, qty) VALUES (v_uid, v_d.kind, v_d.item_code, v_left)
    ON CONFLICT (owner_id, kind, item_code) DO UPDATE SET qty = wbs_stock.qty + EXCLUDED.qty;
  UPDATE wbs_deliveries SET status = 'cancelled' WHERE id = p_id;
  INSERT INTO wbs_ledger(owner_id, fiscal_year, kind, detail, amount)
    VALUES (v_uid, v_fy, 'delivery_cancel', '撤销交付单：退回 ' || wbs_item_name(v_d.kind, v_d.item_code) || ' ×' || v_left, 0);
  RETURN jsonb_build_object('id', p_id, 'qty', v_left, 'name', wbs_item_name(v_d.kind, v_d.item_code));
END $function$


CREATE OR REPLACE FUNCTION public.wbs_delivery_post(p_kind text, p_code text, p_qty numeric, p_price numeric, p_note text DEFAULT NULL::text)\nCREATE OR REPLACE FUNCTION public.wbs_delivery_post(p_kind text, p_code text, p_qty numeric, p_price numeric, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid text; v_name text; v_role text; v_fy int; v_phase text;
  v_qty numeric; v_price numeric; v_have numeric; v_ok int; v_id bigint;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  IF p_kind NOT IN ('material','product') THEN RAISE EXCEPTION '只能交付原材料或成品'; END IF;
  SELECT role, company_name INTO v_role, v_name FROM wbs_players WHERE owner_id = v_uid FOR UPDATE;
  IF v_name IS NULL THEN RAISE EXCEPTION '请先完成队伍注册'; END IF;
  IF v_role NOT IN ('manufacturer','trader') THEN RAISE EXCEPTION '交付上架仅对制造商与贸易商开放'; END IF;
  v_qty := round(COALESCE(p_qty, 0), 0);
  v_price := round(COALESCE(p_price, 0), 2);
  IF v_qty <= 0 THEN RAISE EXCEPTION '数量必须大于 0'; END IF;
  IF v_price <= 0 THEN RAISE EXCEPTION '单价必须大于 0'; END IF;
  SELECT phase, fiscal_year INTO v_phase, v_fy FROM wbs_game WHERE id = 1;
  IF v_phase IS DISTINCT FROM 'open' THEN RAISE EXCEPTION '当前不在交易期，无法上架交付'; END IF;
  IF p_kind = 'material' THEN
    SELECT count(*) INTO v_ok FROM wbs_materials WHERE code = p_code;
  ELSE
    SELECT count(*) INTO v_ok FROM wbs_products WHERE code = p_code;
  END IF;
  IF v_ok = 0 THEN RAISE EXCEPTION '该标的不在系统货池里（成品须为已审批品类），无法上架'; END IF;
  SELECT qty INTO v_have FROM wbs_stock WHERE owner_id = v_uid AND kind = p_kind AND item_code = p_code FOR UPDATE;
  IF COALESCE(v_have, 0) < v_qty THEN RAISE EXCEPTION '库存不足，你只有 % 单位', COALESCE(v_have, 0); END IF;
  UPDATE wbs_stock SET qty = qty - v_qty WHERE owner_id = v_uid AND kind = p_kind AND item_code = p_code;
  INSERT INTO wbs_deliveries(owner_id, company_name, kind, item_code, qty, price, note, fiscal_year)
    VALUES (v_uid, v_name, p_kind, p_code, v_qty, v_price, NULLIF(trim(COALESCE(p_note, '')), ''), v_fy)
    RETURNING id INTO v_id;
  INSERT INTO wbs_ledger(owner_id, fiscal_year, kind, detail, amount)
    VALUES (v_uid, v_fy, 'delivery_escrow', '交付上架：托管 ' || wbs_item_name(p_kind, p_code) || ' ×' || v_qty || '（单价 ' || v_price || ' G）', 0);
  RETURN jsonb_build_object('id', v_id, 'qty', v_qty, 'price', v_price, 'name', wbs_item_name(p_kind, p_code));
END $function$


CREATE OR REPLACE FUNCTION public.wbs_delivery_take(p_id bigint, p_qty numeric)\nCREATE OR REPLACE FUNCTION public.wbs_delivery_take(p_id bigint, p_qty numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid text; v_name text; v_fy int; v_cash numeric; v_amt numeric;
  v_total numeric; v_left numeric; v_d wbs_deliveries;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT company_name, cash INTO v_name, v_cash FROM wbs_players WHERE owner_id = v_uid FOR UPDATE;
  IF v_name IS NULL THEN RAISE EXCEPTION '请先完成队伍注册'; END IF;
  SELECT fiscal_year INTO v_fy FROM wbs_game WHERE id = 1;
  IF v_fy IS NULL THEN v_fy := 0; END IF;
  SELECT * INTO v_d FROM wbs_deliveries WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '该交付单不存在'; END IF;
  IF v_d.status <> 'open' THEN RAISE EXCEPTION '该交付单已不可接单'; END IF;
  IF v_d.owner_id = v_uid THEN RAISE EXCEPTION '不能接自己的交付单'; END IF;
  v_left := v_d.qty - v_d.filled;
  v_amt := round(COALESCE(p_qty, 0), 0);
  IF v_amt <= 0 THEN RAISE EXCEPTION '数量必须大于 0'; END IF;
  IF v_amt > v_left THEN RAISE EXCEPTION '只剩 % 单位可交付', v_left; END IF;
  v_total := round(v_amt * v_d.price, 2);
  IF COALESCE(v_cash, 0) < v_total THEN RAISE EXCEPTION '现金不足，需要 % 金币', v_total; END IF;
  UPDATE wbs_players SET cash = cash - v_total WHERE owner_id = v_uid;
  UPDATE wbs_players SET cash = cash + v_total WHERE owner_id = v_d.owner_id;
  INSERT INTO wbs_stock(owner_id, kind, item_code, qty) VALUES (v_uid, v_d.kind, v_d.item_code, v_amt)
    ON CONFLICT (owner_id, kind, item_code) DO UPDATE SET qty = wbs_stock.qty + EXCLUDED.qty;
  UPDATE wbs_deliveries SET filled = filled + v_amt,
    status = CASE WHEN filled + v_amt >= qty THEN 'done' ELSE 'open' END
   WHERE id = p_id;
  INSERT INTO wbs_ledger(owner_id, fiscal_year, kind, detail, amount) VALUES
    (v_uid, v_fy, 'delivery_buy', '接单采购 ' || wbs_item_name(v_d.kind, v_d.item_code) || ' ×' || v_amt || '（' || v_d.price || ' G，交付方 ' || v_d.company_name || '）', -v_total),
    (v_d.owner_id, v_fy, 'delivery_sell', '交付 ' || wbs_item_name(v_d.kind, v_d.item_code) || ' ×' || v_amt || '（' || v_d.price || ' G，买家 ' || v_name || '）', v_total);
  INSERT INTO wbs_mail(sender_id, sender_name, recipient_id, recipient_name, subject, body, kind, fiscal_year)
    VALUES (NULL, '系统通知', v_d.owner_id, v_d.company_name,
      '交付单已被接单', v_name || ' 接了你的交付单：' || wbs_item_name(v_d.kind, v_d.item_code) || ' ×' || v_amt || '，货款 ' || round(v_total, 2) || ' G 已到账。', 'system', v_fy);
  RETURN jsonb_build_object('id', p_id, 'qty', v_amt, 'total', v_total, 'price', v_d.price, 'name', wbs_item_name(v_d.kind, v_d.item_code));
END $function$


CREATE OR REPLACE FUNCTION public.wbs_dividend(p_ticker text, p_amount numeric)\nCREATE OR REPLACE FUNCTION public.wbs_dividend(p_ticker text, p_amount numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid text; l wbs_listings; v_cash numeric; v_amt numeric;
  v_total numeric; r record; v_pay numeric; v_n int := 0; v_fy int; v_sum numeric := 0;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT * INTO l FROM wbs_listings WHERE ticker = upper(btrim(p_ticker)) AND status = 'listed';
  IF NOT FOUND THEN RAISE EXCEPTION '该公司未挂牌'; END IF;
  IF l.owner_id <> v_uid THEN RAISE EXCEPTION '只有本公司可以决定分红'; END IF;
  v_amt := round(COALESCE(p_amount, 0), 2);
  IF v_amt <= 0 THEN RAISE EXCEPTION '分红金额必须大于 0'; END IF;
  SELECT cash INTO v_cash FROM wbs_players WHERE owner_id = v_uid FOR UPDATE;
  IF COALESCE(v_cash, 0) < v_amt THEN RAISE EXCEPTION '现金不足，当前只有 % G', round(COALESCE(v_cash, 0), 2); END IF;
  SELECT COALESCE(sum(qty), 0) INTO v_total FROM wbs_stock WHERE kind = 'equity' AND item_code = l.ticker;
  IF v_total <= 0 THEN RAISE EXCEPTION '暂无股东持股，无法分红'; END IF;
  SELECT fiscal_year INTO v_fy FROM wbs_game WHERE id = 1;

  UPDATE wbs_players SET cash = cash - v_amt WHERE owner_id = v_uid;
  INSERT INTO wbs_ledger(owner_id, fiscal_year, kind, detail, amount)
    VALUES (v_uid, v_fy, 'dividend', '派发红利 · ' || l.name || '（' || l.ticker || '）共 ' || v_amt || ' G', -v_amt);

  FOR r IN SELECT owner_id, sum(qty) AS q FROM wbs_stock WHERE kind = 'equity' AND item_code = l.ticker GROUP BY owner_id LOOP
    v_pay := round(v_amt * r.q / v_total, 2);
    CONTINUE WHEN v_pay <= 0;
    IF r.owner_id <> v_uid THEN
      UPDATE wbs_players SET cash = cash + v_pay WHERE owner_id = r.owner_id;
      INSERT INTO wbs_ledger(owner_id, fiscal_year, kind, detail, amount)
        VALUES (r.owner_id, v_fy, 'dividend', '收到分红 · ' || l.name || '（' || l.ticker || '）×' || r.q || ' 股', v_pay);
    END IF;
    v_sum := v_sum + v_pay;
    v_n := v_n + 1;
  END LOOP;

  PERFORM wbs_notice('dividend', l.name || ' 派发红利 ' || v_amt || ' G',
    l.company_name || ' 按持股比例向 ' || v_n || ' 位股东派发红利，合计 ' || v_amt || ' G。');
  RETURN jsonb_build_object('ticker', l.ticker, 'amount', v_amt, 'holders', v_n, 'paid', v_sum);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_exchange(p_from text, p_to text, p_amount numeric)\nCREATE OR REPLACE FUNCTION public.wbs_exchange(p_from text, p_to text, p_amount numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_uid text; v_fy int;
  v_rate_from numeric := 1; v_rate_to numeric := 1;
  v_gold numeric; v_get numeric; v_have numeric;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  IF NOT EXISTS (SELECT 1 FROM wbs_players WHERE owner_id = v_uid) THEN RAISE EXCEPTION '请先完成队伍注册'; END IF;
  IF p_from NOT IN ('G','A','B') OR p_to NOT IN ('G','A','B') THEN RAISE EXCEPTION '货币不合法'; END IF;
  IF p_from = p_to THEN RAISE EXCEPTION '两种货币不能相同'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION '兑换数量必须大于 0'; END IF;

  SELECT fiscal_year INTO v_fy FROM wbs_game WHERE id = 1;
  IF p_from <> 'G' THEN SELECT rate INTO v_rate_from FROM wbs_fx WHERE currency = p_from; END IF;
  IF p_to <> 'G' THEN SELECT rate INTO v_rate_to FROM wbs_fx WHERE currency = p_to; END IF;
  IF v_rate_from IS NULL OR v_rate_to IS NULL OR v_rate_to <= 0 THEN RAISE EXCEPTION '汇率数据缺失'; END IF;

  v_gold := p_amount * v_rate_from;
  v_get := round(v_gold / v_rate_to, 2);
  IF v_get <= 0 THEN RAISE EXCEPTION '兑换金额太小'; END IF;

  IF p_from = 'G' THEN
    SELECT cash INTO v_have FROM wbs_players WHERE owner_id = v_uid FOR UPDATE;
    IF COALESCE(v_have,0) < p_amount THEN RAISE EXCEPTION '金币不足，现有 % G', COALESCE(v_have,0); END IF;
    UPDATE wbs_players SET cash = cash - p_amount WHERE owner_id = v_uid;
  ELSIF p_from = 'A' THEN
    SELECT cash_a INTO v_have FROM wbs_players WHERE owner_id = v_uid FOR UPDATE;
    IF COALESCE(v_have,0) < p_amount THEN RAISE EXCEPTION '星洲币不足，现有 % ★', COALESCE(v_have,0); END IF;
    UPDATE wbs_players SET cash_a = cash_a - p_amount WHERE owner_id = v_uid;
  ELSE
    SELECT cash_b INTO v_have FROM wbs_players WHERE owner_id = v_uid FOR UPDATE;
    IF COALESCE(v_have,0) < p_amount THEN RAISE EXCEPTION '贺兰币不足，现有 % ◆', COALESCE(v_have,0); END IF;
    UPDATE wbs_players SET cash_b = cash_b - p_amount WHERE owner_id = v_uid;
  END IF;

  IF p_to = 'G' THEN UPDATE wbs_players SET cash = cash + v_get WHERE owner_id = v_uid;
  ELSIF p_to = 'A' THEN UPDATE wbs_players SET cash_a = cash_a + v_get WHERE owner_id = v_uid;
  ELSE UPDATE wbs_players SET cash_b = cash_b + v_get WHERE owner_id = v_uid;
  END IF;

  INSERT INTO wbs_ledger(owner_id, fiscal_year, kind, detail, amount)
    VALUES (v_uid, v_fy, 'exchange', '换汇 ' || p_amount || ' ' || p_from || ' → ' || v_get || ' ' || p_to, 0);

  RETURN jsonb_build_object('from', p_from, 'to', p_to, 'amount', p_amount, 'got', v_get);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_future_open(p_code text, p_qty numeric, p_strike numeric, p_years integer DEFAULT 1, p_side text DEFAULT 'long'::text)\nCREATE OR REPLACE FUNCTION public.wbs_future_open(p_code text, p_qty numeric, p_strike numeric, p_years integer DEFAULT 1, p_side text DEFAULT 'long'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid text; v_name text; v_fy int; v_years int; v_qty numeric; v_strike numeric;
  v_spot numeric; v_margin numeric; v_cash numeric; v_name_q text; v_kind text; v_id bigint;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  IF p_side NOT IN ('long','short') THEN RAISE EXCEPTION '方向只能是锁买或锁卖'; END IF;
  v_qty := round(COALESCE(p_qty, 0), 0);
  v_strike := round(COALESCE(p_strike, 0), 2);
  v_years := COALESCE(p_years, 1);
  IF v_qty <= 0 THEN RAISE EXCEPTION '合约数量必须大于 0'; END IF;
  IF v_strike <= 0 THEN RAISE EXCEPTION '约定价必须大于 0'; END IF;
  IF v_years < 1 OR v_years > 3 THEN RAISE EXCEPTION '合约期限必须是 1~3 个财年'; END IF;

  SELECT fiscal_year INTO v_fy FROM wbs_game WHERE id = 1;
  IF v_fy IS NULL THEN v_fy := 1; END IF;
  SELECT company_name, cash INTO v_name, v_cash FROM wbs_players WHERE owner_id = v_uid;
  IF v_name IS NULL THEN RAISE EXCEPTION '请先完成队伍注册'; END IF;

  SELECT name, kind INTO v_name_q, v_kind FROM wbs_quotes_live WHERE code = p_code;
  IF v_name_q IS NULL THEN RAISE EXCEPTION '行情里没有这个品种'; END IF;
  IF v_kind = 'fx' THEN RAISE EXCEPTION '外汇不能签锁价合约'; END IF;

  v_spot := wbs_qprice(p_code);
  IF v_spot <= 0 THEN RAISE EXCEPTION '该品种暂无报价'; END IF;
  v_margin := round(v_qty * v_strike * 0.10, 2);
  IF v_cash < v_margin THEN RAISE EXCEPTION '保证金不够，需要 % 金币', v_margin; END IF;

  UPDATE wbs_players SET cash = cash - v_margin WHERE owner_id = v_uid;
  INSERT INTO wbs_futures(owner_id, company_name, code, name, side, qty, strike, open_price, margin, settle_year, note)
    VALUES (v_uid, v_name, p_code, v_name_q, p_side, v_qty, v_strike, v_spot, v_margin, v_fy + v_years,
      CASE WHEN p_side = 'long' THEN '锁买' ELSE '锁卖' END || '：押注 ' || v_name_q || ' 在财年 ' || (v_fy + v_years) || ' 的现价')
    RETURNING id INTO v_id;

  INSERT INTO wbs_ledger(owner_id, fiscal_year, kind, detail, amount)
    VALUES (v_uid, v_fy, 'future_margin',
      '锁价合约开仓：' || CASE WHEN p_side = 'long' THEN '锁买' ELSE '锁卖' END || ' ' || v_name_q || ' ×' || v_qty
      || '，约定价 ' || v_strike || ' G（现价 ' || v_spot || ' G），到期财年 ' || (v_fy + v_years),
      -v_margin);

  RETURN jsonb_build_object('id', v_id, 'name', v_name_q, 'qty', v_qty, 'strike', v_strike,
    'spot', v_spot, 'margin', v_margin, 'settle_year', v_fy + v_years, 'side', p_side);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_future_settle(p_id bigint DEFAULT NULL::bigint, p_all boolean DEFAULT false)\nCREATE OR REPLACE FUNCTION public.wbs_future_settle(p_id bigint DEFAULT NULL::bigint, p_all boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid text; v_fy int; r record; v_spot numeric; v_pnl numeric; v_pay numeric; n int := 0; v_sum numeric := 0;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT fiscal_year INTO v_fy FROM wbs_game WHERE id = 1;
  IF v_fy IS NULL THEN v_fy := 0; END IF;

  FOR r IN SELECT * FROM wbs_futures
            WHERE owner_id = v_uid AND status = 'open'
              AND (p_all OR id = p_id)
            ORDER BY id FOR UPDATE
  LOOP
    v_spot := wbs_qprice(r.code);
    IF v_spot <= 0 THEN CONTINUE; END IF;
    v_pnl := round((CASE WHEN r.side = 'long' THEN v_spot - r.strike ELSE r.strike - v_spot END) * r.qty, 2);
    v_pay := round(r.margin + v_pnl, 2);
    IF v_pay < 0 THEN v_pay := 0; END IF;

    UPDATE wbs_players SET cash = cash + v_pay WHERE owner_id = v_uid;
    UPDATE wbs_futures SET status = 'settled', pnl = v_pnl, settled_at = now() WHERE id = r.id;
    INSERT INTO wbs_ledger(owner_id, fiscal_year, kind, detail, amount)
      VALUES (v_uid, v_fy, 'future_settle',
        '锁价合约结算：' || CASE WHEN r.side = 'long' THEN '锁买' ELSE '锁卖' END || ' ' || r.name || ' ×' || r.qty
        || '，约定 ' || r.strike || ' G → 现价 ' || v_spot || ' G，盈亏 ' || v_pnl || ' G，退回保证金 ' || r.margin || ' G',
        v_pay);
    n := n + 1;
    v_sum := v_sum + v_pnl;
  END LOOP;

  IF n = 0 THEN RAISE EXCEPTION '没有找到可结算的合约'; END IF;
  RETURN jsonb_build_object('count', n, 'pnl', v_sum);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_futures_sweep()\nCREATE OR REPLACE FUNCTION public.wbs_futures_sweep()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid text; v_fy int; r record; v_spot numeric; v_pnl numeric; v_pay numeric; n int := 0;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT fiscal_year INTO v_fy FROM wbs_game WHERE id = 1;
  IF v_fy IS NULL THEN v_fy := 1; END IF;

  FOR r IN SELECT * FROM wbs_futures WHERE status = 'open' AND settle_year < v_fy FOR UPDATE
  LOOP
    v_spot := wbs_qprice(r.code);
    IF v_spot <= 0 THEN CONTINUE; END IF;
    v_pnl := round((CASE WHEN r.side = 'long' THEN v_spot - r.strike ELSE r.strike - v_spot END) * r.qty, 2);
    v_pay := round(r.margin + v_pnl, 2);
    IF v_pay < 0 THEN v_pay := 0; END IF;
    UPDATE wbs_players SET cash = cash + v_pay WHERE owner_id = r.owner_id;
    UPDATE wbs_futures SET status = 'settled', pnl = v_pnl, settled_at = now() WHERE id = r.id;
    INSERT INTO wbs_ledger(owner_id, fiscal_year, kind, detail, amount)
      VALUES (r.owner_id, v_fy, 'future_settle',
        '锁价合约到期强制结算：' || r.name || ' ×' || r.qty || '，约定 ' || r.strike || ' G → 现价 ' || v_spot || ' G，盈亏 ' || v_pnl || ' G',
        v_pay);
    n := n + 1;
  END LOOP;

  RETURN jsonb_build_object('count', n);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_gov_aid(p_war_id bigint, p_side text, p_amount numeric, p_note text DEFAULT NULL::text)\nCREATE OR REPLACE FUNCTION public.wbs_gov_aid(p_war_id bigint, p_side text, p_amount numeric, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE w wbs_wars; v_uid text; v_name text; v_role text; v_fy int; v_phase text;
        v_amt numeric; v_cap numeric; v_used numeric; v_side text; v_target text; v_tname text;
        v_rate numeric; v_note text; v_cash numeric;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT phase, fiscal_year INTO v_phase, v_fy FROM wbs_game WHERE id = 1;
  IF v_phase <> 'open' THEN RAISE EXCEPTION '当前不在交易期，无法拨付军援'; END IF;
  SELECT company_name, role INTO v_name, v_role FROM wbs_players WHERE owner_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION '请先完成队伍注册'; END IF;
  IF v_role NOT IN ('admin','government') THEN RAISE EXCEPTION '只有政府 / 裁判可以拨付军援'; END IF;
  SELECT * INTO w FROM wbs_wars WHERE id = p_war_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '战争记录不存在'; END IF;
  IF w.status NOT IN ('declared','fighting') THEN RAISE EXCEPTION '该战争不在可军援的阶段'; END IF;
  v_side := lower(trim(COALESCE(p_side,'')));
  IF v_side NOT IN ('attacker','defender') THEN RAISE EXCEPTION '请指定军援攻方还是守方'; END IF;
  v_amt := round(COALESCE(p_amount,0), 2);
  IF v_amt <= 0 THEN RAISE EXCEPTION '军援金额必须大于 0'; END IF;
  v_rate := COALESCE(NULLIF(wbs_setting('gov_aid_cap','1'),'')::numeric, 1);
  IF v_side = 'attacker' THEN
    v_target := w.attacker_id; v_tname := w.attacker_name; v_used := COALESCE(w.aid_attacker,0);
    v_cap := round((COALESCE(w.stake,0) + COALESCE(w.attacker_supply,0)) * v_rate, 2);
  ELSE
    v_target := w.defender_id; v_tname := w.defender_name; v_used := COALESCE(w.aid_defender,0);
    v_cap := round((COALESCE(w.defender_stake,0) + COALESCE(w.defender_supply,0)) * v_rate, 2);
  END IF;
  IF v_used + v_amt > v_cap THEN
    RAISE EXCEPTION '军援超过上限：最多只能援助该方已投入军费的 %%%，已援 % G，本次最多还能援 % G', round(v_rate*100,0), v_used, GREATEST(0, round(v_cap - v_used,2));
  END IF;
  SELECT COALESCE(gov_cash,0) INTO v_cash FROM wbs_game WHERE id = 1;
  IF v_cash < v_amt THEN RAISE EXCEPTION '国库金币不足：军援需 % G，现有 % G', v_amt, v_cash; END IF;
  UPDATE wbs_game SET gov_cash = gov_cash - v_amt, gov_spend = gov_spend + v_amt, updated_at = now() WHERE id = 1;
  IF v_side = 'attacker' THEN
    UPDATE wbs_wars SET aid_attacker = COALESCE(aid_attacker,0) + v_amt WHERE id = p_war_id;
  ELSE
    UPDATE wbs_wars SET aid_defender = COALESCE(aid_defender,0) + v_amt WHERE id = p_war_id;
  END IF;
  v_note := NULLIF(trim(COALESCE(p_note,'')),'');
  INSERT INTO wbs_ledger(owner_id, fiscal_year, kind, detail, amount)
    VALUES (v_uid, v_fy, 'gov_aid', '军援 ' || v_tname || '（对 ' || CASE WHEN v_side='attacker' THEN w.defender_name ELSE w.attacker_name END || '）', -v_amt);
  PERFORM wbs_notice('gov_aid', '国库军援：' || v_tname || ' 获 ' || v_amt || ' G',
    '政府从国库拨付 ' || v_amt || ' G 军援给 ' || v_tname || '（' || CASE WHEN v_side='attacker' THEN '攻方' ELSE '守方' END || '）。'
    || COALESCE(' 说明：' || v_note, ''));
  INSERT INTO wbs_mail(sender_id, sender_name, recipient_id, recipient_name, subject, body, kind, fiscal_year)
    VALUES (NULL, '系统通知', v_target, v_tname, '【军援】国库拨付 ' || v_amt || ' G',
            '政府向你的战争行动拨付了 ' || v_amt || ' G 军援，已计入你的战力。'
            || COALESCE(chr(10) || '说明：' || v_note, ''), 'system', v_fy);
  RETURN jsonb_build_object('war_id', p_war_id, 'side', v_side, 'target', v_tname, 'amount', v_amt,
                            'aid_total', v_used + v_amt, 'aid_cap', v_cap);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_gov_metrics()\nCREATE OR REPLACE FUNCTION public.wbs_gov_metrics()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role text; g record; v_fy int;
  v_cpi numeric; v_flow numeric; v_exports numeric; v_turnover numeric;
  v_reserve numeric := 0; v_po int; v_pq numeric; v_pf numeric; v_pol int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT role INTO v_role FROM wbs_players WHERE owner_id = auth.uid();
  IF v_role NOT IN ('admin','government','media') THEN RAISE EXCEPTION '只有组委会（政府 / 裁判）可以查看宏观账目'; END IF;

  SELECT * INTO g FROM wbs_game WHERE id = 1;
  v_fy := COALESCE(g.fiscal_year, 1);

  -- 全场流水只看真实经济产出：排除裁判手动调资金（那不是 GDP，也不该抽税）
  SELECT COALESCE(sum(amount),0) INTO v_flow FROM wbs_ledger
   WHERE fiscal_year = v_fy AND amount > 0 AND kind <> 'admin_adjust';
  SELECT COALESCE(sum(amount),0) INTO v_turnover FROM wbs_trades WHERE fiscal_year = v_fy;
  SELECT COALESCE(sum(COALESCE(p.revenue_a,0) * COALESCE(fa.rate,0) + COALESCE(p.revenue_b,0) * COALESCE(fb.rate,0)), 0)
    INTO v_exports
    FROM wbs_pitch p
    LEFT JOIN wbs_fx fa ON fa.currency = 'A'
    LEFT JOIN wbs_fx fb ON fb.currency = 'B'
   WHERE p.fiscal_year = v_fy;

  SELECT COALESCE(round(100 * sum(price) / NULLIF(sum(base),0), 1), 100) INTO v_cpi
    FROM wbs_quotes_live WHERE kind = 'material';

  SELECT COALESCE(sum((e.value)::numeric * COALESCE(q.price, 0)), 0) INTO v_reserve
    FROM jsonb_each_text(COALESCE(g.gov_reserve,'{}'::jsonb)) e
    LEFT JOIN wbs_quotes_live q ON q.code = e.key;

  SELECT count(*), COALESCE(sum(qty),0), COALESCE(sum(filled),0)
    INTO v_po, v_pq, v_pf
    FROM wbs_procure WHERE fiscal_year = v_fy AND status = 'open';
  SELECT count(*) INTO v_pol FROM wbs_policies WHERE fiscal_year = v_fy AND status = 'active';

  RETURN jsonb_build_object(
    'fy', v_fy,
    'cash', COALESCE(g.gov_cash,0),
    'cash_a', COALESCE(g.gov_cash_a,0),
    'cash_b', COALESCE(g.gov_cash_b,0),
    'income', COALESCE(g.gov_income,0),
    'spend', COALESCE(g.gov_spend,0),
    'balance', round(COALESCE(g.gov_income,0) - COALESCE(g.gov_spend,0), 2),
    'reserve', COALESCE(g.gov_reserve,'{}'::jsonb),
    'reserve_value', round(v_reserve, 2),
    'flow', v_flow,
    'turnover', v_turnover,
    'exports', round(v_exports, 2),
    'cpi', v_cpi,
    'procure_open', v_po,
    'procure_qty', v_pq,
    'procure_filled', v_pf,
    'policies', v_pol,
    'fx_a', (SELECT rate FROM wbs_fx WHERE currency='A'),
    'fx_b', (SELECT rate FROM wbs_fx WHERE currency='B'),
    'tariff', COALESCE(g.tariff_rate, 0),
    'budget_base', COALESCE(NULLIF(wbs_setting('gov_budget_base',''),''),'3000'),
    'tax_rate', COALESCE(NULLIF(wbs_setting('gov_tax_rate',''),''),'0.02'),
    'policy_cap', COALESCE(NULLIF(wbs_setting('gov_policy_cap',''),'')::int, 3),
    'procure_cap', COALESCE(NULLIF(wbs_setting('gov_procure_cap',''),'')::int, 8)
  );
END $function$


CREATE OR REPLACE FUNCTION public.wbs_gov_trade(p_code text, p_side text, p_qty numeric)\nCREATE OR REPLACE FUNCTION public.wbs_gov_trade(p_code text, p_side text, p_qty numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid text; v_role text; v_fy int; v_phase text; v_tick int;
  v_name text; v_kind text; v_base numeric; v_price numeric;
  v_qty numeric; v_amt numeric; v_have numeric; v_pct numeric; v_new numeric; v_sign text;
  v_key text; v_held numeric;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT role INTO v_role FROM wbs_players WHERE owner_id = v_uid;
  IF v_role NOT IN ('admin','government') THEN RAISE EXCEPTION '只有政府可以执行平准操作'; END IF;
  SELECT phase, fiscal_year INTO v_phase, v_fy FROM wbs_game WHERE id = 1;
  IF v_phase <> 'open' THEN RAISE EXCEPTION '当前不在交易期，无法平准'; END IF;
  v_qty := round(COALESCE(p_qty,0), 2);
  IF v_qty <= 0 THEN RAISE EXCEPTION '数量必须大于 0'; END IF;
  IF v_qty > 2000 THEN RAISE EXCEPTION '单笔平准数量请控制在 2000 以内'; END IF;
  v_sign := lower(trim(COALESCE(p_side,'')));
  IF v_sign NOT IN ('buy','sell') THEN RAISE EXCEPTION '方向只能是 buy 或 sell'; END IF;

  SELECT name, kind, base, price INTO v_name, v_kind, v_base, v_price
    FROM wbs_quotes_live WHERE code = p_code FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '品种不存在：%', p_code; END IF;

  v_amt := round(COALESCE(v_price,0) * v_qty, 2);
  v_key := p_code;
  SELECT COALESCE((COALESCE(gov_reserve,'{}'::jsonb) ->> v_key)::numeric, 0) INTO v_held FROM wbs_game WHERE id = 1;

  IF v_sign = 'buy' THEN
    SELECT COALESCE(gov_cash,0) INTO v_have FROM wbs_game WHERE id = 1;
    IF v_have < v_amt THEN RAISE EXCEPTION '国库金币不足：收储需 % G，现有 % G', v_amt, v_have; END IF;
    UPDATE wbs_game SET gov_cash = gov_cash - v_amt, gov_spend = gov_spend + v_amt,
      gov_reserve = jsonb_set(COALESCE(gov_reserve,'{}'::jsonb), ARRAY[v_key], to_jsonb(COALESCE(v_held,0) + v_qty)),
      updated_at = now() WHERE id = 1;
  ELSE
    IF COALESCE(v_held,0) < v_qty THEN RAISE EXCEPTION '战略储备不足：「%」只有 % 单位', v_name, COALESCE(v_held,0); END IF;
    UPDATE wbs_game SET gov_cash = gov_cash + v_amt, gov_income = gov_income + v_amt,
      gov_reserve = jsonb_set(COALESCE(gov_reserve,'{}'::jsonb), ARRAY[v_key], to_jsonb(COALESCE(v_held,0) - v_qty)),
      updated_at = now() WHERE id = 1;
  END IF;

  v_pct := LEAST(8, GREATEST(0.4, round(v_qty * 0.15, 2))) * CASE WHEN v_sign = 'buy' THEN 1 ELSE -1 END;
  v_new := round(GREATEST(COALESCE(v_base,0) * 0.62, LEAST(COALESCE(v_base,0) * 1.55, COALESCE(v_price,0) * (1 + v_pct / 100.0))), 2);
  SELECT COALESCE(max(tick),0) INTO v_tick FROM wbs_quotes_live;

  UPDATE wbs_quotes_live SET prev = price, price = v_new, volume = COALESCE(volume,0) + v_qty,
         high = GREATEST(COALESCE(high, v_new), v_new), low = LEAST(COALESCE(low, v_new), v_new),
         note = CASE WHEN v_sign = 'buy' THEN '国库收储' ELSE '国库抛储' END, updated_at = now()
   WHERE code = p_code;

  INSERT INTO wbs_quotes(code, name, kind, price, prev, base, volume, tick, drift, fiscal_year, phase, at)
    VALUES (p_code, v_name, v_kind, v_new, v_price, v_base, v_qty, v_tick, round(v_pct::numeric,5), v_fy, 'gov', now());

  PERFORM wbs_notice('gov_trade',
    CASE WHEN v_sign = 'buy' THEN '国库收储：' ELSE '国库抛储：' END || v_name || ' ×' || v_qty,
    '政府对「' || v_name || '」' || CASE WHEN v_sign = 'buy' THEN '买入 ' ELSE '卖出 ' END || v_qty || ' 单位，成交额 ' || v_amt || ' G，' || CASE WHEN v_sign = 'buy' THEN '价格上推 ' ELSE '价格下压 ' END || abs(v_pct) || '%。');

  RETURN jsonb_build_object('code', p_code, 'name', v_name, 'side', v_sign, 'qty', v_qty, 'amount', v_amt, 'pct', v_pct, 'price', v_new);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_gov_year_rollover(p_prev_fy integer, p_fy integer)\nCREATE OR REPLACE FUNCTION public.wbs_gov_year_rollover(p_prev_fy integer, p_fy integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role text; r record; p record;
  v_left numeric; v_refund numeric; v_refunded numeric := 0;
  v_tax numeric; v_base numeric; v_rate numeric; v_flow numeric; v_total numeric;
  v_closed int := 0; v_expired int := 0; v_quota int := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT role INTO v_role FROM wbs_players WHERE owner_id = auth.uid();
  IF v_role <> 'admin' THEN RAISE EXCEPTION '只有裁判可以执行财年结转'; END IF;

  FOR r IN SELECT * FROM wbs_procure WHERE fiscal_year = p_prev_fy AND status = 'open' LOOP
    v_left := GREATEST(COALESCE(r.qty,0) - COALESCE(r.filled,0), 0);
    v_refund := round(COALESCE(r.unit_price,0) * v_left, 2);
    IF v_refund > 0 THEN
      IF r.currency = 'A' THEN
        UPDATE wbs_game SET gov_cash_a = gov_cash_a + v_refund, gov_spend = GREATEST(0, gov_spend - v_refund) WHERE id = 1;
      ELSIF r.currency = 'B' THEN
        UPDATE wbs_game SET gov_cash_b = gov_cash_b + v_refund, gov_spend = GREATEST(0, gov_spend - v_refund) WHERE id = 1;
      ELSE
        UPDATE wbs_game SET gov_cash = gov_cash + v_refund, gov_spend = GREATEST(0, gov_spend - v_refund) WHERE id = 1;
      END IF;
      v_refunded := v_refunded + v_refund;
    END IF;
    UPDATE wbs_procure SET status = 'closed', updated_at = now() WHERE id = r.id;
    v_closed := v_closed + 1;
  END LOOP;

  FOR p IN SELECT * FROM wbs_policies WHERE status = 'active' AND fiscal_year < p_fy LOOP
    IF p.kind = 'quota' AND p.product_code IS NOT NULL THEN
      UPDATE wbs_materials
         SET supply_total = GREATEST(1, round(supply_total * (1 + COALESCE(p.rate,0) / 100.0)))
       WHERE code = p.product_code;
      UPDATE wbs_materials SET supply_left = supply_total WHERE code = p.product_code;
      v_quota := v_quota + 1;
    END IF;
    IF COALESCE(p.cost,0) > 0 THEN
      UPDATE wbs_game SET gov_cash = gov_cash + p.cost, gov_spend = GREATEST(0, gov_spend - p.cost) WHERE id = 1;
      v_refunded := v_refunded + p.cost;
    END IF;
    UPDATE wbs_policies SET status = 'expired', cost = 0 WHERE id = p.id;
    v_expired := v_expired + 1;
  END LOOP;

  v_rate := COALESCE(NULLIF(wbs_setting('gov_tax_rate',''),'')::numeric, 0.02);
  v_base := COALESCE(NULLIF(wbs_setting('gov_budget_base',''),'')::numeric, 3000);
  -- 税基 = 上财年全场真实经济流水（排除裁判手动调资金）
  SELECT COALESCE(sum(amount),0) INTO v_flow FROM wbs_ledger
   WHERE fiscal_year = p_prev_fy AND amount > 0 AND kind <> 'admin_adjust';
  v_tax := round(v_flow * v_rate, 2);
  v_total := round(v_base + v_tax, 2);

  UPDATE wbs_game
     SET gov_cash = gov_cash + v_total,
         gov_income = v_total,
         gov_spend = 0,
         gov_budget_fy = p_fy,
         updated_at = now()
   WHERE id = 1;

  PERFORM wbs_notice('gov_budget', '第 ' || p_fy || ' 财年财政拨款到账',
    '基础拨款 ' || v_base || ' G ＋ 上财年税收 ' || v_tax || ' G（按全场流水 ' || round(v_flow,0) || ' G × ' || round(v_rate*100,2) || '%%）＝ ' || v_total || ' G 已进入国库。' ||
    CASE WHEN v_closed > 0 THEN '另有 ' || v_closed || ' 笔跨年采购单已结清，退回 ' || v_refunded || ' G。' ELSE '' END);

  RETURN jsonb_build_object('fy', p_fy, 'base', v_base, 'tax', v_tax, 'total', v_total,
    'flow', v_flow, 'closed', v_closed, 'expired', v_expired, 'quota', v_quota, 'refunded', v_refunded);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_holders(p_ticker text)\nCREATE OR REPLACE FUNCTION public.wbs_holders(p_ticker text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_t text; v_total numeric; v_json jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  v_t := upper(btrim(COALESCE(p_ticker, '')));
  IF NOT EXISTS (SELECT 1 FROM wbs_listings WHERE ticker = v_t AND status = 'listed') THEN
    RAISE EXCEPTION '该公司未挂牌';
  END IF;
  SELECT COALESCE(sum(s.qty), 0) INTO v_total FROM wbs_stock s WHERE s.kind = 'equity' AND s.item_code = v_t;
  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.qty DESC), '[]'::jsonb) INTO v_json FROM (
    SELECT COALESCE(p.company_name, '（已退场）') AS company_name,
           p.role AS role,
           round(s.qty, 0) AS qty,
           CASE WHEN v_total > 0 THEN round(s.qty / v_total * 100, 2) ELSE 0 END AS pct
      FROM wbs_stock s
      LEFT JOIN wbs_players p ON p.owner_id = s.owner_id
     WHERE s.kind = 'equity' AND s.item_code = v_t AND s.qty > 0
  ) x;
  RETURN jsonb_build_object('ticker', v_t, 'total', v_total, 'holders', v_json);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_index_tick()\nCREATE OR REPLACE FUNCTION public.wbs_index_tick()
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v numeric; v_e numeric; v_tick integer; v_fy integer; v_has boolean; v_has_e boolean; v_cnt int;
BEGIN
  SELECT COALESCE(avg(CASE WHEN base > 0 THEN price / base ELSE 1 END), 1) INTO v
    FROM wbs_quotes_live WHERE kind IN ('material', 'product');
  v := round(1000 * v, 2);
  SELECT count(*) INTO v_cnt FROM wbs_quotes_live WHERE kind = 'equity';
  SELECT COALESCE(avg(CASE WHEN base > 0 THEN price / base ELSE 1 END), 1) INTO v_e
    FROM wbs_quotes_live WHERE kind = 'equity';
  v_e := round(1000 * v_e, 2);
  SELECT COALESCE(max(tick), 0) INTO v_tick FROM wbs_quotes_live;
  SELECT fiscal_year INTO v_fy FROM wbs_game WHERE id = 1;

  SELECT true INTO v_has FROM wbs_index WHERE code = 'KCI';
  IF v_has IS NULL THEN
    INSERT INTO wbs_index(code, name, base, value, prev, "open", high, low, tick, fiscal_year)
    VALUES ('KCI', '卡加综合指数', 1000, v, v, v, v, v, v_tick, v_fy);
  ELSE
    UPDATE wbs_index SET prev = value, value = v, high = GREATEST(high, v), low = LEAST(low, v),
           tick = v_tick, fiscal_year = v_fy, updated_at = now()
     WHERE code = 'KCI';
  END IF;

  IF v_cnt > 0 THEN
    SELECT true INTO v_has_e FROM wbs_index WHERE code = 'KEI';
    IF v_has_e IS NULL THEN
      INSERT INTO wbs_index(code, name, base, value, prev, "open", high, low, tick, fiscal_year)
      VALUES ('KEI', '卡加股权指数', 1000, v_e, v_e, v_e, v_e, v_e, v_tick, v_fy);
    ELSE
      UPDATE wbs_index SET prev = value, value = v_e, high = GREATEST(high, v_e), low = LEAST(low, v_e),
             tick = v_tick, fiscal_year = v_fy, updated_at = now()
       WHERE code = 'KEI';
    END IF;
  END IF;
  RETURN v;
END $function$


CREATE OR REPLACE FUNCTION public.wbs_interest_post(p_id bigint, p_note text)\nCREATE OR REPLACE FUNCTION public.wbs_interest_post(p_id bigint, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_uid text; v_name text; bl record; n int := 0;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT company_name INTO v_name FROM wbs_players WHERE owner_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION '请先完成队伍注册'; END IF;
  SELECT * INTO bl FROM wbs_posts WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION '公告不存在'; END IF;
  IF bl.owner_id = v_uid THEN RAISE EXCEPTION '不需要对自己的公告表达意向'; END IF;
  IF bl.status <> 'open' THEN RAISE EXCEPTION '该公告已关闭'; END IF;
  IF length(COALESCE(p_note,'')) > 300 THEN RAISE EXCEPTION '附言请控制在 300 字以内'; END IF;
  INSERT INTO wbs_post_interest(post_id, owner_id, company_name, note) VALUES (p_id, v_uid, v_name, NULLIF(trim(COALESCE(p_note,'')),''))
    ON CONFLICT (post_id, owner_id) DO UPDATE SET note = EXCLUDED.note;
  SELECT count(*) INTO n FROM wbs_post_interest WHERE post_id = p_id;
  UPDATE wbs_posts SET interest_count = n WHERE id = p_id;
  INSERT INTO wbs_mail(sender_id, sender_name, recipient_id, recipient_name, subject, body, kind, fiscal_year)
    VALUES (v_uid, v_name, bl.owner_id, bl.company_name, '合作意向：' || left(bl.title, 24), '对方在你发布的《' || bl.title || '》下表达了合作意向。' || COALESCE(E'\n附言：' || NULLIF(trim(COALESCE(p_note,'')),''), ''), 'system', bl.fiscal_year);
  RETURN jsonb_build_object('count', n);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_ipo_apply(p_ticker text, p_name text, p_float numeric, p_shares numeric)\nCREATE OR REPLACE FUNCTION public.wbs_ipo_apply(p_ticker text, p_name text, p_float numeric, p_shares numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid text; v_name text; v_fy int; v_t text; v_nm text;
  v_net numeric; v_price numeric; v_goal numeric; v_id bigint; v_shares numeric;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT company_name INTO v_name FROM wbs_players WHERE owner_id = v_uid;
  IF v_name IS NULL THEN RAISE EXCEPTION '请先完成队伍注册'; END IF;
  SELECT fiscal_year INTO v_fy FROM wbs_game WHERE id = 1;
  v_t := upper(btrim(COALESCE(p_ticker, '')));
  v_nm := btrim(COALESCE(p_name, ''));
  IF v_t !~ '^[A-Z0-9]{2,6}$' THEN RAISE EXCEPTION '股票代码只能是 2~6 位大写字母或数字'; END IF;
  IF char_length(v_nm) < 2 THEN RAISE EXCEPTION '股票简称至少 2 个字'; END IF;
  IF EXISTS (SELECT 1 FROM wbs_listings WHERE ticker = v_t) THEN RAISE EXCEPTION '股票代码 % 已被占用', v_t; END IF;
  IF EXISTS (SELECT 1 FROM wbs_listings WHERE owner_id = v_uid AND status IN ('pending', 'listed')) THEN
    RAISE EXCEPTION '你已有在审或已挂牌的上市申请，不能重复提交';
  END IF;
  IF COALESCE(p_float, 0) < 0.05 OR COALESCE(p_float, 0) > 0.5 THEN
    RAISE EXCEPTION '公开发行比例必须在 5%% ~ 50%% 之间';
  END IF;
  v_shares := round(COALESCE(p_shares, 0), 0);
  IF v_shares < 100 THEN RAISE EXCEPTION '总股本至少 100 股'; END IF;
  IF v_shares > 100000000 THEN RAISE EXCEPTION '总股本过大'; END IF;

  SELECT (x ->> 'net_worth')::numeric INTO v_net
    FROM jsonb_array_elements(wbs_realtime_board() -> 'board') AS x
   WHERE x ->> 'owner_id' = v_uid;
  IF COALESCE(v_net, 0) <= 0 THEN RAISE EXCEPTION '净资产为 0，无法定价上市'; END IF;

  v_price := round(v_net / v_shares, 2);
  IF v_price < 0.01 THEN RAISE EXCEPTION '总股本过大，每股不足 0.01 G，请减少股本'; END IF;
  v_goal := round(v_price * v_shares * COALESCE(p_float, 0), 2);

  INSERT INTO wbs_listings(ticker, name, owner_id, company_name, shares_total, shares_float, ipo_price, raise_goal, listed_fy, status, basis)
  VALUES (v_t, v_nm, v_uid, v_name, v_shares, round(v_shares * COALESCE(p_float, 0), 0), v_price, v_goal, v_fy, 'pending',
          '净资产 ' || v_net || ' G 除以总股本 ' || v_shares || ' 股')
  RETURNING id INTO v_id;

  PERFORM wbs_notice('ipo', v_name || ' 提交上市申请 · ' || v_nm || '（' || v_t || '）',
    '总股本 ' || v_shares || ' 股，公开发行 ' || round(COALESCE(p_float, 0) * 100, 0) || '%，按净资产定出每股 ' || v_price || ' G，拟募资 ' || v_goal || ' G。等待组委会核准挂牌。');
  RETURN jsonb_build_object('id', v_id, 'ticker', v_t, 'price', v_price, 'raise', v_goal, 'shares', v_shares, 'net', v_net);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_ipo_review(p_id bigint, p_approve boolean, p_price numeric, p_note text)\nCREATE OR REPLACE FUNCTION public.wbs_ipo_review(p_id bigint, p_approve boolean, p_price numeric, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  l wbs_listings; v_uid text; v_fy int; v_code text;
  v_price numeric; v_stake numeric; v_goal numeric;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  IF NOT EXISTS (SELECT 1 FROM wbs_players WHERE owner_id = v_uid AND role IN ('admin', 'government')) THEN
    RAISE EXCEPTION '只有组委会（裁判 / 政府）可以核准上市';
  END IF;
  SELECT * INTO l FROM wbs_listings WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '上市申请不存在'; END IF;
  IF l.status <> 'pending' THEN RAISE EXCEPTION '该申请已处理'; END IF;
  SELECT fiscal_year INTO v_fy FROM wbs_game WHERE id = 1;

  IF NOT p_approve THEN
    UPDATE wbs_listings SET status = 'rejected', note = p_note, approved_by = v_uid WHERE id = p_id;
    PERFORM wbs_notice('ipo', '上市申请未通过 · ' || l.company_name,
      COALESCE(NULLIF(btrim(p_note), ''), '组委会未通过该上市申请。'));
    RETURN jsonb_build_object('id', p_id, 'status', 'rejected');
  END IF;

  v_price := round(COALESCE(NULLIF(p_price, 0), l.ipo_price), 2);
  IF v_price > l.ipo_price * 1.3 OR v_price < l.ipo_price * 0.7 THEN
    RAISE EXCEPTION '核准价只能在定价 % G 的 70%% ~ 130%% 之间', l.ipo_price;
  END IF;
  v_goal := round(v_price * l.shares_float, 2);
  v_code := 'EQ:' || l.ticker;

  INSERT INTO wbs_quotes_live(code, name, kind, base, price, prev, "open", high, low, volume, tick, fiscal_year, updated_at)
  VALUES (v_code, l.name, 'equity', v_price, v_price, v_price, v_price, v_price, v_price, 0,
          (SELECT COALESCE(max(tick), 0) FROM wbs_quotes_live), v_fy, now())
  ON CONFLICT (code) DO NOTHING;

  v_stake := round(l.shares_total - l.shares_float, 0);
  IF v_stake > 0 THEN
    INSERT INTO wbs_stock(owner_id, kind, item_code, qty)
    VALUES (l.owner_id, 'equity', l.ticker, v_stake)
    ON CONFLICT (owner_id, kind, item_code) DO UPDATE SET qty = wbs_stock.qty + EXCLUDED.qty;
  END IF;

  IF v_goal > 0 THEN
    UPDATE wbs_players SET cash = cash + v_goal WHERE owner_id = l.owner_id;
    INSERT INTO wbs_ledger(owner_id, fiscal_year, kind, detail, amount)
      VALUES (l.owner_id, v_fy, 'ipo_raise',
        '上市募集资金 · ' || l.name || '（' || l.ticker || '）发行 ' || l.shares_float || ' 股，每股 ' || v_price || ' G', v_goal);
  END IF;

  UPDATE wbs_listings SET status = 'listed', ipo_price = v_price, raise_goal = v_goal, listed_fy = v_fy,
         listed_at = now(), note = p_note, approved_by = v_uid WHERE id = p_id;

  PERFORM wbs_notice('ipo', '新股上市 · ' || l.name || '（' || l.ticker || '）',
    l.company_name || ' 挂牌交易，发行价 ' || v_price || ' G，总股本 ' || l.shares_total || ' 股，总市值 ' || round(v_price * l.shares_total, 2) || ' G，募资 ' || v_goal || ' G。现已可在「证券交易所」买卖。');
  RETURN jsonb_build_object('id', p_id, 'status', 'listed', 'code', v_code, 'price', v_price, 'raise', v_goal, 'founderShares', v_stake);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_item_name(p_kind text, p_code text)\nCREATE OR REPLACE FUNCTION public.wbs_item_name(p_kind text, p_code text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v text;
BEGIN
  IF p_kind = 'material' THEN
    SELECT name INTO v FROM wbs_materials WHERE code = p_code;
  ELSIF p_kind = 'product' THEN
    SELECT name INTO v FROM wbs_products WHERE code = p_code;
  ELSE
    v := NULL;
  END IF;
  RETURN COALESCE(v, p_code);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_judge_code_get()\nCREATE OR REPLACE FUNCTION public.wbs_judge_code_get()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role text;
  v_code text;
BEGIN
  SELECT role INTO v_role FROM wbs_players WHERE owner_id = auth.uid();
  IF v_role IS NULL THEN RAISE EXCEPTION '请先登录并加入比赛'; END IF;
  IF v_role <> 'admin' THEN RAISE EXCEPTION '只有裁判 / 组委会可以查看管理口令'; END IF;
  SELECT value INTO v_code FROM wbs_settings WHERE key = 'judge_code';
  RETURN jsonb_build_object('code', coalesce(v_code, ''), 'is_set', v_code IS NOT NULL, 'gate_roles', jsonb_build_array('government','admin'));
END $function$


CREATE OR REPLACE FUNCTION public.wbs_judge_code_set(p_new_code text)\nCREATE OR REPLACE FUNCTION public.wbs_judge_code_set(p_new_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role text;
  v_code text;
BEGIN
  SELECT role INTO v_role FROM wbs_players WHERE owner_id = auth.uid();
  IF v_role IS NULL THEN RAISE EXCEPTION '请先登录并加入比赛'; END IF;
  IF v_role <> 'admin' THEN RAISE EXCEPTION '只有裁判 / 组委会可以修改管理口令'; END IF;

  v_code := trim(coalesce(p_new_code, ''));
  IF length(v_code) < 4 THEN RAISE EXCEPTION '管理口令至少 4 位'; END IF;
  IF length(v_code) > 40 THEN RAISE EXCEPTION '管理口令请控制在 40 位以内'; END IF;

  INSERT INTO wbs_settings(key, value, label)
  VALUES ('judge_code', v_code, '管理类角色注册口令（政府 / 裁判）')
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

  INSERT INTO wbs_news(author, title, body, kind, fiscal_year)
  VALUES ('组委会', '【管理口令】裁判已更新管理口令', '政府 / 裁判角色的注册口令已变更，请转告需要注册这两类角色的成员。', 'news', 0);

  RETURN jsonb_build_object('ok', true, 'code', v_code);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_judge_setting(p_key text, p_value text)\nCREATE OR REPLACE FUNCTION public.wbs_judge_setting(p_key text, p_value text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid text; v_role text;
  v_key text := lower(trim(COALESCE(p_key, '')));
  v_val text := trim(COALESCE(p_value, ''));
  v_num numeric; v_a numeric; v_b numeric;
  v_allowed text[] := ARRAY['produce_sec_base','produce_sec_per_unit','produce_sec_min','produce_sec_max',
                            'auto_list','rd_sec_min','rd_sec_max','produce_max_qty'];
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT role INTO v_role FROM wbs_players WHERE owner_id = v_uid;
  IF v_role NOT IN ('admin','government') THEN RAISE EXCEPTION '只有政府或组委会可以调整赛制参数'; END IF;
  IF NOT (v_key = ANY(v_allowed)) THEN RAISE EXCEPTION '该参数不允许在后台修改'; END IF;

  IF v_key = 'auto_list' THEN
    IF v_val NOT IN ('0','1') THEN RAISE EXCEPTION '自动上架只能是 1（开）或 0（关）'; END IF;
  ELSE
    BEGIN
      v_num := v_val::numeric;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION '请输入数字';
    END;
    IF v_key = 'produce_sec_min'      AND (v_num < 1 OR v_num > 7200)  THEN RAISE EXCEPTION '最短工时需在 1 ~ 7200 秒之间'; END IF;
    IF v_key = 'produce_sec_max'      AND (v_num < 1 OR v_num > 7200)  THEN RAISE EXCEPTION '最长工时需在 1 ~ 7200 秒之间（上限 2 小时）'; END IF;
    IF v_key = 'produce_sec_base'     AND (v_num < 0 OR v_num > 3600)  THEN RAISE EXCEPTION '基础工时需在 0 ~ 3600 秒之间'; END IF;
    IF v_key = 'produce_sec_per_unit' AND (v_num < 0 OR v_num > 300)   THEN RAISE EXCEPTION '每件追加工时需在 0 ~ 300 秒之间'; END IF;
    IF v_key = 'rd_sec_min'           AND (v_num < 0.1 OR v_num > 600) THEN RAISE EXCEPTION '研发申报单件工时下限需在 0.1 ~ 600 秒之间'; END IF;
    IF v_key = 'rd_sec_max'           AND (v_num < 0.1 OR v_num > 600) THEN RAISE EXCEPTION '研发申报单件工时上限需在 0.1 ~ 600 秒之间'; END IF;
    IF v_key = 'produce_max_qty'      AND (v_num < 1 OR v_num > 999 OR v_num <> round(v_num)) THEN
      RAISE EXCEPTION '全场默认「最多可产」需为 1 ~ 999 之间的整数';
    END IF;
    v_val := v_num::text;
  END IF;

  INSERT INTO wbs_settings(key, value, label, updated_at)
    VALUES (v_key, v_val, v_key, now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

  SELECT MAX(value::numeric) FILTER (WHERE key = 'produce_sec_min'),
         MAX(value::numeric) FILTER (WHERE key = 'produce_sec_max')
    INTO v_a, v_b FROM wbs_settings WHERE key IN ('produce_sec_min','produce_sec_max');
  IF COALESCE(v_a,0) > COALESCE(v_b,0) THEN RAISE EXCEPTION '最短工时不能大于最长工时（% > %）', v_a, v_b; END IF;

  SELECT MAX(value::numeric) FILTER (WHERE key = 'rd_sec_min'),
         MAX(value::numeric) FILTER (WHERE key = 'rd_sec_max')
    INTO v_a, v_b FROM wbs_settings WHERE key IN ('rd_sec_min','rd_sec_max');
  IF COALESCE(v_a,0) > COALESCE(v_b,0) THEN RAISE EXCEPTION '研发申报工时下限不能大于上限（% > %）', v_a, v_b; END IF;

  RETURN jsonb_build_object('key', v_key, 'value', v_val);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_league(p_limit integer DEFAULT 20)\nCREATE OR REPLACE FUNCTION public.wbs_league(p_limit integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH g AS (
    SELECT owner, max(nm) AS nm, max(st) AS st,
           round(sum(amount), 2) AS amt, sum(buys) AS nb, sum(sells) AS ns,
           sum(q1) AS qb, sum(q2) AS qs
      FROM (
        SELECT buyer_id AS owner, buyer_name AS nm, buyer_seat AS st, amount, 1 AS buys, 0 AS sells, qty AS q1, 0 AS q2
          FROM wbs_trades WHERE fiscal_year = (SELECT fiscal_year FROM wbs_game WHERE id = 1) AND buyer_id <> '__exchange__'
        UNION ALL
        SELECT seller_id, seller_name, seller_seat, amount, 0, 1, 0, qty
          FROM wbs_trades WHERE fiscal_year = (SELECT fiscal_year FROM wbs_game WHERE id = 1) AND seller_id <> '__exchange__'
      ) t GROUP BY owner
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'owner', owner, 'name', nm, 'seat', st, 'amount', amt,
      'buys', nb, 'sells', ns, 'qtyBought', qb, 'qtySold', qs) ORDER BY amt DESC), '[]'::jsonb)
    FROM (SELECT * FROM g ORDER BY amt DESC LIMIT GREATEST(1, LEAST(60, p_limit))) z
$function$


CREATE OR REPLACE FUNCTION public.wbs_license_grant(p_product text, p_licensee text, p_fee numeric DEFAULT 0, p_years integer DEFAULT 2, p_upfront numeric DEFAULT 0)\nCREATE OR REPLACE FUNCTION public.wbs_license_grant(p_product text, p_licensee text, p_fee numeric DEFAULT 0, p_years integer DEFAULT 2, p_upfront numeric DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_uid text; v_name text; v_fy int; v_phase text; v_owner text; v_pname text;
        l_name text; l_role text; v_fee numeric; v_up numeric; v_years int; v_exp int; v_id bigint; v_cash numeric;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT phase, fiscal_year INTO v_phase, v_fy FROM wbs_game WHERE id = 1;
  IF v_phase <> 'open' THEN RAISE EXCEPTION '当前不在交易期，无法办理授权'; END IF;
  SELECT company_name INTO v_name FROM wbs_players WHERE owner_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION '请先完成队伍注册'; END IF;
  SELECT owner_id, name INTO v_owner, v_pname FROM wbs_products WHERE code = p_product;
  IF NOT FOUND THEN RAISE EXCEPTION '产品不存在'; END IF;
  IF v_owner IS NULL THEN RAISE EXCEPTION '「%」是基础产品，任何制造商都可以直接生产，无需授权', v_pname; END IF;
  IF v_owner <> v_uid THEN RAISE EXCEPTION '只有「%」的研发方可以授权他人生产', v_pname; END IF;
  IF p_licensee = v_uid THEN RAISE EXCEPTION '不用给自己授权'; END IF;
  SELECT company_name, role INTO l_name, l_role FROM wbs_players WHERE owner_id = p_licensee;
  IF NOT FOUND THEN RAISE EXCEPTION '被授权方不存在'; END IF;
  IF l_role <> 'manufacturer' THEN RAISE EXCEPTION '% 不是制造商，无法获得生产授权', l_name; END IF;
  v_fee := round(GREATEST(0, COALESCE(p_fee,0)), 2);
  v_up  := round(GREATEST(0, COALESCE(p_upfront,0)), 2);
  IF v_fee = 0 AND v_up = 0 THEN RAISE EXCEPTION '一次性授权费与每件提成不能同时为 0'; END IF;
  v_years := COALESCE(p_years, 2);
  IF v_years < 1 OR v_years > 5 THEN RAISE EXCEPTION '授权年限必须在 1~5 之间'; END IF;
  IF EXISTS (SELECT 1 FROM wbs_licenses WHERE product_code = p_product AND licensee_id = p_licensee
              AND status = 'active' AND expire_year >= v_fy) THEN
    RAISE EXCEPTION '你已授权 % 生产「%」，请先撤销原授权', l_name, v_pname; END IF;
  IF v_up > 0 THEN
    SELECT cash INTO v_cash FROM wbs_players WHERE owner_id = p_licensee FOR UPDATE;
    IF COALESCE(v_cash,0) < v_up THEN RAISE EXCEPTION '% 的现金不足以支付一次性授权费 % G', l_name, v_up; END IF;
    UPDATE wbs_players SET cash = cash - v_up WHERE owner_id = p_licensee;
    UPDATE wbs_players SET cash = cash + v_up, total_asset = total_asset + v_up WHERE owner_id = v_uid;
    INSERT INTO wbs_ledger(owner_id, fiscal_year, kind, detail, amount)
      VALUES (p_licensee, v_fy, 'license_pay', '专利授权费：' || v_pname || ' → ' || v_name, -v_up);
    INSERT INTO wbs_ledger(owner_id, fiscal_year, kind, detail, amount)
      VALUES (v_uid, v_fy, 'license_income', '专利授权收入：' || v_pname || ' → ' || l_name, v_up);
  END IF;
  v_exp := v_fy + v_years;
  INSERT INTO wbs_licenses(product_code, product_name, licensor_id, licensor_name, licensee_id, licensee_name,
                           fee_per_unit, upfront, start_year, expire_year, status)
    VALUES (p_product, v_pname, v_uid, v_name, p_licensee, l_name, v_fee, v_up, v_fy, v_exp, 'active')
    RETURNING id INTO v_id;
  INSERT INTO wbs_mail(sender_id, sender_name, recipient_id, recipient_name, subject, body, kind, fiscal_year)
    VALUES (NULL, '系统通知', p_licensee, l_name,
            '【专利授权】你已获得「' || v_pname || '」的生产许可',
            v_name || ' 授权你生产「' || v_pname || '」，有效期到财年 ' || v_exp || '。'
            || chr(10) || '每件提成：' || v_fee || ' G；一次性授权费：' || v_up || ' G。'
            || chr(10) || '现在你可以在「生产中心」生产该产品了，提成会在投产时自动结算给对方。', 'system', v_fy);
  RETURN jsonb_build_object('id', v_id, 'product', p_product, 'name', v_pname, 'licensee', l_name,
                            'fee_per_unit', v_fee, 'upfront', v_up, 'expire_year', v_exp);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_license_revoke(p_id bigint)\nCREATE OR REPLACE FUNCTION public.wbs_license_revoke(p_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE l wbs_licenses; v_uid text; v_name text; v_role text; v_fy int;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT company_name, role INTO v_name, v_role FROM wbs_players WHERE owner_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION '请先完成队伍注册'; END IF;
  SELECT fiscal_year INTO v_fy FROM wbs_game WHERE id = 1;
  SELECT * INTO l FROM wbs_licenses WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '授权记录不存在'; END IF;
  IF l.status <> 'active' THEN RAISE EXCEPTION '该授权已失效或已撤销'; END IF;
  IF v_role NOT IN ('admin','government') AND l.licensor_id <> v_uid THEN
    RAISE EXCEPTION '只有授权方（或组委会）可以撤销授权'; END IF;
  UPDATE wbs_licenses SET status = 'revoked' WHERE id = p_id;
  INSERT INTO wbs_mail(sender_id, sender_name, recipient_id, recipient_name, subject, body, kind, fiscal_year)
    VALUES (NULL, '系统通知', l.licensee_id, l.licensee_name,
            '【授权撤销】「' || l.product_name || '」的生产许可已被撤销',
            COALESCE(l.licensor_name, v_name) || ' 撤销了你对「' || l.product_name || '」的生产许可。此后你不能再生产该产品，既有库存不受影响。', 'system', v_fy);
  RETURN jsonb_build_object('id', p_id, 'status', 'revoked', 'product', l.product_code, 'licensee', l.licensee_name);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_loan_accept(p_id bigint)\nCREATE OR REPLACE FUNCTION public.wbs_loan_accept(p_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  l wbs_loans; v_uid text; v_name text; v_role text; v_fy int; v_phase text;
  v_cash numeric; v_qty numeric; v_bid text; v_bname text; v_lid text; v_lname text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT phase, fiscal_year INTO v_phase, v_fy FROM wbs_game WHERE id = 1;
  IF v_phase <> 'open' THEN RAISE EXCEPTION '当前不在交易期，无法签署借贷合同'; END IF;
  SELECT * INTO l FROM wbs_loans WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '借款合同不存在'; END IF;
  IF l.status <> 'open' THEN RAISE EXCEPTION '该合同已被处理'; END IF;
  IF l.owner_id = v_uid THEN RAISE EXCEPTION '不能签自己发起的合同'; END IF;
  IF l.target_owner IS NOT NULL AND l.target_owner <> v_uid THEN RAISE EXCEPTION '该合同指定了其他签署方'; END IF;
  SELECT company_name, role INTO v_name, v_role FROM wbs_players WHERE owner_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION '请先完成队伍注册'; END IF;
  IF v_role NOT IN ('manufacturer','trader','media') THEN RAISE EXCEPTION '该角色不参与借贷'; END IF;

  IF l.side = 'lend' THEN
    v_lid := l.owner_id; v_lname := l.company_name; v_bid := v_uid; v_bname := v_name;
    IF l.collateral_kind = 'cash' THEN
      SELECT cash INTO v_cash FROM wbs_players WHERE owner_id = v_uid FOR UPDATE;
      IF v_cash < l.collateral_value THEN RAISE EXCEPTION '需提供 % G 现金抵押，你的现金不足', l.collateral_value; END IF;
      UPDATE wbs_players SET cash = cash - l.collateral_value WHERE owner_id = v_uid;
    ELSIF l.collateral_kind IN ('material','product') THEN
      SELECT COALESCE(qty,0) INTO v_qty FROM wbs_stock WHERE owner_id = v_uid AND kind = l.collateral_kind AND item_code = l.collateral_item;
      IF COALESCE(v_qty,0) < l.collateral_qty THEN RAISE EXCEPTION '抵押库存不足，需要 % 件', l.collateral_qty; END IF;
      UPDATE wbs_stock SET qty = qty - l.collateral_qty WHERE owner_id = v_uid AND kind = l.collateral_kind AND item_code = l.collateral_item;
      INSERT INTO wbs_collateral(loan_id, owner_id, kind, item_code, qty, status) VALUES (p_id, v_uid, l.collateral_kind, l.collateral_item, l.collateral_qty, 'locked');
    END IF;
    UPDATE wbs_players SET cash = cash + l.principal WHERE owner_id = v_uid;
  ELSE
    v_lid := v_uid; v_lname := v_name; v_bid := l.owner_id; v_bname := l.company_name;
    SELECT cash INTO v_cash FROM wbs_players WHERE owner_id = v_uid FOR UPDATE;
    IF v_cash < l.principal THEN RAISE EXCEPTION '你的现金不足以放款，需要 % 金币', l.principal; END IF;
    UPDATE wbs_players SET cash = cash - l.principal WHERE owner_id = v_uid;
    UPDATE wbs_players SET cash = cash + l.principal WHERE owner_id = l.owner_id;
  END IF;

  UPDATE wbs_loans SET status = 'active', borrower_id = v_bid, borrower_name = v_bname,
         lender_id = v_lid, lender_name = v_lname, start_year = v_fy, due_year = v_fy + l.term_years
   WHERE id = p_id;
  INSERT INTO wbs_ledger(owner_id, fiscal_year, kind, detail, amount) VALUES (v_bid, v_fy, 'loan_in', '向 ' || v_lname || ' 借款 ' || l.principal || ' G', l.principal);
  INSERT INTO wbs_ledger(owner_id, fiscal_year, kind, detail, amount) VALUES (v_lid, v_fy, 'loan_out', '向 ' || v_bname || ' 放款 ' || l.principal || ' G', -l.principal);
  INSERT INTO wbs_mail(sender_id, sender_name, recipient_id, recipient_name, subject, body, kind, fiscal_year)
    VALUES (v_uid, v_name, CASE WHEN l.side='lend' THEN l.owner_id ELSE l.owner_id END, l.company_name,
            '借款合同已生效', v_name || ' 已签署你的借款合同。本金 ' || l.principal || ' G，年利率 ' || l.rate || '%，到期财年 ' || (v_fy + l.term_years) || '。', 'system', v_fy);
  RETURN jsonb_build_object('principal', l.principal, 'due_year', v_fy + l.term_years, 'borrower', v_bname, 'lender', v_lname);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_loan_cancel(p_id bigint)\nCREATE OR REPLACE FUNCTION public.wbs_loan_cancel(p_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE l wbs_loans; v_uid text; v_fy int; c record;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT * INTO l FROM wbs_loans WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '借款合同不存在'; END IF;
  IF l.owner_id <> v_uid THEN RAISE EXCEPTION '只能撤销自己发起的合同'; END IF;
  IF l.status <> 'open' THEN RAISE EXCEPTION '该合同已签署或已处理，无法撤销'; END IF;
  SELECT fiscal_year INTO v_fy FROM wbs_game WHERE id = 1;
  IF l.side = 'lend' THEN
    UPDATE wbs_players SET cash = cash + l.principal WHERE owner_id = v_uid;
    INSERT INTO wbs_ledger(owner_id, fiscal_year, kind, detail, amount) VALUES (v_uid, v_fy, 'loan_in', '撤销借款要约，本金退回 ' || l.principal || ' G', l.principal);
  ELSE
    IF l.collateral_kind = 'cash' THEN
      UPDATE wbs_players SET cash = cash + l.collateral_value WHERE owner_id = v_uid;
    ELSIF l.collateral_kind IN ('material','product') THEN
      FOR c IN SELECT * FROM wbs_collateral WHERE loan_id = p_id AND status = 'locked' LOOP
        INSERT INTO wbs_stock(owner_id, kind, item_code, qty) VALUES (c.owner_id, c.kind, c.item_code, c.qty)
          ON CONFLICT (owner_id, kind, item_code) DO UPDATE SET qty = wbs_stock.qty + EXCLUDED.qty;
      END LOOP;
      UPDATE wbs_collateral SET status = 'returned' WHERE loan_id = p_id AND status = 'locked';
    END IF;
  END IF;
  UPDATE wbs_loans SET status = 'cancelled' WHERE id = p_id;
  RETURN jsonb_build_object('status','cancelled');
END $function$


CREATE OR REPLACE FUNCTION public.wbs_loan_create(p_side text, p_amount numeric, p_rate numeric, p_term integer, p_collateral_kind text, p_collateral_item text, p_collateral_qty numeric, p_target_owner text, p_note text)\nCREATE OR REPLACE FUNCTION public.wbs_loan_create(p_side text, p_amount numeric, p_rate numeric, p_term integer, p_collateral_kind text, p_collateral_item text, p_collateral_qty numeric, p_target_owner text, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid text; v_name text; v_role text; v_fy int; v_phase text; v_id bigint;
  v_cash numeric; v_qty numeric; v_unit numeric; v_cval numeric := 0; v_kind text; v_item text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT phase, fiscal_year INTO v_phase, v_fy FROM wbs_game WHERE id = 1;
  IF v_phase <> 'open' THEN RAISE EXCEPTION '当前不在交易期，无法发起借贷'; END IF;
  SELECT company_name, role INTO v_name, v_role FROM wbs_players WHERE owner_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION '请先完成队伍注册'; END IF;
  IF v_role NOT IN ('manufacturer','trader','media') THEN RAISE EXCEPTION '该角色不参与借贷'; END IF;
  IF p_side NOT IN ('lend','borrow') THEN RAISE EXCEPTION '借贷方向不合法'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount <> round(p_amount) THEN RAISE EXCEPTION '本金必须是大于 0 的整数'; END IF;
  IF p_rate IS NULL OR p_rate < 0 OR p_rate > 100 THEN RAISE EXCEPTION '利率必须在 0~100 之间'; END IF;
  IF p_term IS NULL OR p_term < 1 OR p_term > 5 THEN RAISE EXCEPTION '期限必须在 1~5 个财年之间'; END IF;
  v_kind := COALESCE(NULLIF(p_collateral_kind,''), 'none');
  IF v_kind NOT IN ('none','cash','material','product') THEN RAISE EXCEPTION '抵押类型不合法'; END IF;
  IF NULLIF(p_target_owner,'') IS NOT NULL THEN
    IF p_target_owner = v_uid THEN RAISE EXCEPTION '不能指定自己'; END IF;
    IF NOT EXISTS (SELECT 1 FROM wbs_players WHERE owner_id = p_target_owner) THEN RAISE EXCEPTION '指定的交易对象不存在'; END IF;
  END IF;
  IF length(COALESCE(p_note,'')) > 300 THEN RAISE EXCEPTION '备注请控制在 300 字以内'; END IF;

  IF v_kind = 'cash' THEN
    IF p_collateral_qty IS NULL OR p_collateral_qty <= 0 THEN RAISE EXCEPTION '请填写抵押现金金额'; END IF;
    v_cval := p_collateral_qty; v_item := NULL;
  ELSIF v_kind IN ('material','product') THEN
    IF p_collateral_qty IS NULL OR p_collateral_qty <= 0 THEN RAISE EXCEPTION '请填写抵押物数量'; END IF;
    IF v_kind = 'material' THEN
      SELECT price INTO v_unit FROM wbs_materials WHERE code = p_collateral_item;
    ELSE
      SELECT COALESCE((SELECT SUM((pr.recipe->>k)::numeric * m.price) FROM jsonb_object_keys(pr.recipe) AS k JOIN wbs_materials m ON m.code = k), 0)
        INTO v_unit FROM wbs_products pr WHERE pr.code = p_collateral_item;
    END IF;
    IF v_unit IS NULL THEN RAISE EXCEPTION '抵押物不存在'; END IF;
    v_cval := v_unit * p_collateral_qty; v_item := p_collateral_item;
  END IF;

  INSERT INTO wbs_loans(owner_id, company_name, side, target_owner, target_name, principal, rate, term_years,
                        collateral_kind, collateral_item, collateral_qty, collateral_value, note, status, fiscal_year)
  VALUES (v_uid, v_name, p_side, NULLIF(p_target_owner,''),
          (SELECT company_name FROM wbs_players WHERE owner_id = NULLIF(p_target_owner,'')),
          p_amount, p_rate, p_term, v_kind, v_item, COALESCE(p_collateral_qty,0), v_cval,
          NULLIF(trim(COALESCE(p_note,'')), ''), 'open', v_fy)
  RETURNING id INTO v_id;

  IF p_side = 'lend' THEN
    SELECT cash INTO v_cash FROM wbs_players WHERE owner_id = v_uid FOR UPDATE;
    IF v_cash < p_amount THEN RAISE EXCEPTION '现金不足以放款，需要 % 金币', p_amount; END IF;
    UPDATE wbs_players SET cash = cash - p_amount WHERE owner_id = v_uid;
    INSERT INTO wbs_ledger(owner_id, fiscal_year, kind, detail, amount)
      VALUES (v_uid, v_fy, 'loan_out', '发出借款要约，本金锁定 ' || p_amount || ' G', -p_amount);
  ELSE
    IF v_kind = 'cash' THEN
      SELECT cash INTO v_cash FROM wbs_players WHERE owner_id = v_uid FOR UPDATE;
      IF v_cash < v_cval THEN RAISE EXCEPTION '现金不足以提供 % 的抵押', v_cval; END IF;
      UPDATE wbs_players SET cash = cash - v_cval WHERE owner_id = v_uid;
    ELSIF v_kind IN ('material','product') THEN
      SELECT COALESCE(qty,0) INTO v_qty FROM wbs_stock WHERE owner_id = v_uid AND kind = v_kind AND item_code = v_item;
      IF COALESCE(v_qty,0) < p_collateral_qty THEN RAISE EXCEPTION '库存不足，无法抵押（现有 %）', COALESCE(v_qty,0); END IF;
      UPDATE wbs_stock SET qty = qty - p_collateral_qty WHERE owner_id = v_uid AND kind = v_kind AND item_code = v_item;
      INSERT INTO wbs_collateral(loan_id, owner_id, kind, item_code, qty, status) VALUES (v_id, v_uid, v_kind, v_item, p_collateral_qty, 'locked');
    END IF;
  END IF;
  RETURN jsonb_build_object('id', v_id, 'collateral_value', v_cval);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_loan_default(p_id bigint)\nCREATE OR REPLACE FUNCTION public.wbs_loan_default(p_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE l wbs_loans; v_uid text; v_fy int; n int;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT * INTO l FROM wbs_loans WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '借款合同不存在'; END IF;
  IF l.status <> 'active' THEN RAISE EXCEPTION '该合同当前不处于履约中'; END IF;
  IF l.lender_id <> v_uid THEN RAISE EXCEPTION '只有出借人可以申请强制执行'; END IF;
  SELECT fiscal_year INTO v_fy FROM wbs_game WHERE id = 1;
  IF v_fy < l.due_year THEN RAISE EXCEPTION '尚未到期（到期财年 %）', l.due_year; END IF;
  UPDATE wbs_loans SET status = 'seize_req' WHERE id = p_id;
  INSERT INTO wbs_mail(sender_id, sender_name, recipient_id, recipient_name, subject, body, kind, fiscal_year)
  SELECT v_uid, l.lender_name, p.owner_id, p.company_name, '【强制执行申请】' || l.borrower_name,
         l.lender_name || ' 申请对 ' || l.borrower_name || ' 强制执行借款合同（本金 ' || l.principal || ' G）。抵押 ' || l.collateral_kind || ' ' || COALESCE(l.collateral_item,'') || '，估值 ' || l.collateral_value || ' G。请到借贷中心裁定。',
         'system', v_fy
    FROM wbs_players p WHERE p.role IN ('government','admin');
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN jsonb_build_object('notified', n);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_loan_repay(p_id bigint)\nCREATE OR REPLACE FUNCTION public.wbs_loan_repay(p_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE l wbs_loans; v_uid text; v_fy int; v_due numeric; v_cash numeric; c record;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT * INTO l FROM wbs_loans WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '借款合同不存在'; END IF;
  IF l.status <> 'active' THEN RAISE EXCEPTION '该合同当前不处于履约中'; END IF;
  IF l.borrower_id <> v_uid THEN RAISE EXCEPTION '只有借款人可以还款'; END IF;
  SELECT fiscal_year INTO v_fy FROM wbs_game WHERE id = 1;
  v_due := round(l.principal * (1 + l.rate / 100.0 * l.term_years), 2);
  SELECT cash INTO v_cash FROM wbs_players WHERE owner_id = v_uid FOR UPDATE;
  IF v_cash < v_due THEN RAISE EXCEPTION '现金不足，需偿还 % G（本金 % + 利息）', v_due, l.principal; END IF;
  UPDATE wbs_players SET cash = cash - v_due WHERE owner_id = v_uid;
  UPDATE wbs_players SET cash = cash + v_due WHERE owner_id = l.lender_id;

  IF l.collateral_kind = 'cash' THEN
    UPDATE wbs_players SET cash = cash + l.collateral_value WHERE owner_id = v_uid;
  ELSIF l.collateral_kind IN ('material','product') THEN
    FOR c IN SELECT * FROM wbs_collateral WHERE loan_id = p_id AND status = 'locked' LOOP
      INSERT INTO wbs_stock(owner_id, kind, item_code, qty) VALUES (c.owner_id, c.kind, c.item_code, c.qty)
        ON CONFLICT (owner_id, kind, item_code) DO UPDATE SET qty = wbs_stock.qty + EXCLUDED.qty;
    END LOOP;
    UPDATE wbs_collateral SET status = 'returned' WHERE loan_id = p_id AND status = 'locked';
  END IF;

  UPDATE wbs_loans SET status = 'repaid' WHERE id = p_id;
  UPDATE wbs_players SET credit_score = credit_score + 5 WHERE owner_id = v_uid;
  INSERT INTO wbs_ledger(owner_id, fiscal_year, kind, detail, amount) VALUES (v_uid, v_fy, 'loan_repay', '偿还 ' || l.lender_name || ' 借款本息', -v_due);
  INSERT INTO wbs_ledger(owner_id, fiscal_year, kind, detail, amount) VALUES (l.lender_id, v_fy, 'loan_return', '收回 ' || l.borrower_name || ' 借款本息', v_due);
  INSERT INTO wbs_mail(sender_id, sender_name, recipient_id, recipient_name, subject, body, kind, fiscal_year)
    VALUES (v_uid, l.borrower_name, l.lender_id, l.lender_name, '借款已结清', l.borrower_name || ' 已偿还本息共 ' || v_due || ' G，抵押物已归还。感谢守信。', 'system', v_fy);
  RETURN jsonb_build_object('due', v_due, 'interest', round(v_due - l.principal, 2));
END $function$


CREATE OR REPLACE FUNCTION public.wbs_loan_seize(p_id bigint, p_approve boolean, p_note text)\nCREATE OR REPLACE FUNCTION public.wbs_loan_seize(p_id bigint, p_approve boolean, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE l wbs_loans; v_uid text; v_name text; v_role text; v_fy int; v_due numeric; v_owed numeric; v_cash numeric; v_take numeric; c record;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT company_name, role INTO v_name, v_role FROM wbs_players WHERE owner_id = v_uid;
  IF NOT FOUND OR v_role NOT IN ('government','admin') THEN RAISE EXCEPTION '只有政府或裁判可以裁定强制执行'; END IF;
  SELECT * INTO l FROM wbs_loans WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '借款合同不存在'; END IF;
  IF l.status <> 'seize_req' THEN RAISE EXCEPTION '该合同当前没有待处理的强制执行申请'; END IF;
  SELECT fiscal_year INTO v_fy FROM wbs_game WHERE id = 1;

  IF NOT p_approve THEN
    UPDATE wbs_loans SET status = 'active', gov_note = COALESCE(NULLIF(trim(COALESCE(p_note,'')),''), '申请驳回') WHERE id = p_id;
    INSERT INTO wbs_mail(sender_id, sender_name, recipient_id, recipient_name, subject, body, kind, fiscal_year)
      VALUES (v_uid, v_name, l.lender_id, l.lender_name, '强制执行申请被驳回', COALESCE(NULLIF(trim(COALESCE(p_note,'')),''), '政府驳回了你的强制执行申请。'), 'system', v_fy);
    RETURN jsonb_build_object('status','active');
  END IF;

  v_due := round(l.principal * (1 + l.rate / 100.0 * l.term_years), 2);
  IF l.collateral_kind = 'cash' THEN
    UPDATE wbs_players SET cash = cash + l.collateral_value WHERE owner_id = l.lender_id;
  ELSIF l.collateral_kind IN ('material','product') THEN
    FOR c IN SELECT * FROM wbs_collateral WHERE loan_id = p_id AND status = 'locked' LOOP
      INSERT INTO wbs_stock(owner_id, kind, item_code, qty) VALUES (l.lender_id, c.kind, c.item_code, c.qty)
        ON CONFLICT (owner_id, kind, item_code) DO UPDATE SET qty = wbs_stock.qty + EXCLUDED.qty;
    END LOOP;
    UPDATE wbs_collateral SET status = 'seized' WHERE loan_id = p_id AND status = 'locked';
  END IF;
  v_owed := GREATEST(v_due - l.collateral_value, 0);
  IF v_owed > 0 THEN
    SELECT cash INTO v_cash FROM wbs_players WHERE owner_id = l.borrower_id FOR UPDATE;
    v_take := LEAST(v_owed, GREATEST(COALESCE(v_cash,0), 0));
    IF v_take > 0 THEN
      UPDATE wbs_players SET cash = cash - v_take WHERE owner_id = l.borrower_id;
      UPDATE wbs_players SET cash = cash + v_take WHERE owner_id = l.lender_id;
    END IF;
  ELSE
    v_take := 0;
  END IF;
  UPDATE wbs_loans SET status = 'seized', gov_note = COALESCE(NULLIF(trim(COALESCE(p_note,'')),''), '强制执行已批准') WHERE id = p_id;
  UPDATE wbs_players SET credit_score = GREATEST(credit_score - 30, 0) WHERE owner_id = l.borrower_id;
  INSERT INTO wbs_ledger(owner_id, fiscal_year, kind, detail, amount) VALUES (l.lender_id, v_fy, 'loan_return', '强制执行收回：' || l.borrower_name, l.collateral_value + v_take);
  INSERT INTO wbs_mail(sender_id, sender_name, recipient_id, recipient_name, subject, body, kind, fiscal_year)
    VALUES (v_uid, v_name, l.borrower_id, l.borrower_name, '【已强制执行】借款违约', '政府已批准对 ' || l.borrower_name || ' 的强制执行。抵押物已划转给 ' || l.lender_name || '，另扣现金 ' || v_take || ' G。信用分已下调。', 'system', v_fy);
  INSERT INTO wbs_mail(sender_id, sender_name, recipient_id, recipient_name, subject, body, kind, fiscal_year)
    VALUES (v_uid, v_name, l.lender_id, l.lender_name, '强制执行已完成', '已从 ' || l.borrower_name || ' 处划转抵押物（估值 ' || l.collateral_value || ' G）与现金 ' || v_take || ' G 给你。', 'system', v_fy);
  RETURN jsonb_build_object('collateral', l.collateral_value, 'cash_seized', v_take, 'due', v_due);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_log_ticks(p_tick integer, p_fy integer)\nCREATE OR REPLACE FUNCTION public.wbs_log_ticks(p_tick integer, p_fy integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  INSERT INTO wbs_ticks(code, name, kind, tick, price, volume, fiscal_year, at)
  SELECT q.code, q.name, q.kind, p_tick, q.price,
         COALESCE((SELECT sum(t.qty) FROM wbs_trades t WHERE t.code = q.code AND t.tick = p_tick), 0),
         p_fy, now()
    FROM wbs_quotes_live q;
  INSERT INTO wbs_ticks(code, name, kind, tick, price, volume, fiscal_year, at)
  SELECT 'KCI', '卡加综合指数', 'index', p_tick, value, 0, p_fy, now() FROM wbs_index WHERE code = 'KCI';
  DELETE FROM wbs_ticks WHERE tick < p_tick - 600;
END $function$


CREATE OR REPLACE FUNCTION public.wbs_market_autopilot()\nCREATE OR REPLACE FUNCTION public.wbs_market_autopilot()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_phase text;
BEGIN
  -- 只在比赛进行 / 结算阶段自主波动；休赛期不空转
  SELECT phase INTO v_phase FROM wbs_game WHERE id = 1;
  IF v_phase IS NULL OR v_phase NOT IN ('open','closing') THEN
    RETURN jsonb_build_object('skipped', true);
  END IF;
  BEGIN
    PERFORM set_config('request.jwt.claims', '{"sub":"__system__","role":"authenticated"}', true);
    PERFORM set_config('role', 'authenticated', true);
    RETURN wbs_market_tick(false);
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('error', SQLERRM);
  END;
END $function$


CREATE OR REPLACE FUNCTION public.wbs_market_cleanup(p_code text)\nCREATE OR REPLACE FUNCTION public.wbs_market_cleanup(p_code text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN SELECT id FROM wbs_orders WHERE code = p_code AND otype = 'market' AND status IN ('open','partial') LOOP
    PERFORM wbs_order_refund(r.id, 'cancelled');
    n := n + 1;
  END LOOP;
  RETURN n;
END $function$


CREATE OR REPLACE FUNCTION public.wbs_market_maker()\nCREATE OR REPLACE FUNCTION public.wbs_market_maker()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_band numeric; v_hi numeric; v_lo numeric; v_mid numeric; v_tick integer; v_fy integer;
  k int; r record; v_px numeric; v_qty numeric; v_prev numeric; n int := 0;
  v_names text[] := ARRAY['卡加商行','北岭商社','远洋货栈','星洲贸易','贺兰物产','卡加商会'];
  v_nm text; v_seat text;
BEGIN
  v_band := COALESCE(wbs_setting('price_band','0.20')::numeric, 0.20);
  SELECT fiscal_year INTO v_fy FROM wbs_game WHERE id = 1;
  SELECT COALESCE(max(tick), 0) INTO v_tick FROM wbs_quotes_live;

  DELETE FROM wbs_orders WHERE owner_id = '__exchange__' AND status = 'open';
  DELETE FROM wbs_orders WHERE owner_id = '__exchange__' AND status <> 'open' AND created_at < now() - interval '4 minutes';

  FOR r IN SELECT code, name, kind, base, price, "open" AS op FROM wbs_quotes_live WHERE kind <> 'fx' ORDER BY code LOOP
    CONTINUE WHEN r.price IS NULL OR r.price <= 0;
    v_hi := round(COALESCE(NULLIF(r.op, 0), r.base) * (1 + v_band), 2);
    v_lo := round(GREATEST(0.01, COALESCE(NULLIF(r.op, 0), r.base) * (1 - v_band)), 2);
    v_mid := LEAST(v_hi / 1.004, GREATEST(v_lo * 1.004, r.price));

    -- 只挂卖盘（ask）：系统商户提供货源，任何人随时都买得到货；
    -- 但绝不挂买盘 —— 玩家挂出来的货必须等真实买家（贸易商 / 制造商 / 政府）来买，
    -- 不能被系统商户顺手吃掉。这是赛制明确要求，不要再加回买单。
    v_prev := 0;
    FOR k IN 1..5 LOOP
      v_px := round(v_mid * (1 + k * 0.004), 2);
      IF v_px <= v_prev THEN v_px := round(v_prev + 0.01, 2); END IF;
      IF v_px > v_hi THEN CONTINUE; END IF;
      v_prev := v_px;
      v_qty := GREATEST(5, round(r.base * 25 * (1 + (k - 1) * 0.6) / v_px, 0));
      n := n + 1;
      v_nm := v_names[1 + (n % array_length(v_names, 1))];
      v_seat := 'S-0' || (1 + (n % 5))::text;
      INSERT INTO wbs_orders(owner_id, company_name, seat, code, name, kind, item_code, side, otype, price, qty, escrow, status, fiscal_year, tick)
      VALUES ('__exchange__', v_nm, v_seat, r.code, r.name, r.kind, split_part(r.code, ':', 2), 'sell', 'limit', v_px, v_qty, 0, 'open', v_fy, v_tick);
    END LOOP;
  END LOOP;
  RETURN n;
END $function$


CREATE OR REPLACE FUNCTION public.wbs_market_rules()\nCREATE OR REPLACE FUNCTION public.wbs_market_rules()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  RETURN jsonb_build_object(
    'ex_fee',      COALESCE(wbs_setting('ex_fee', '0.0015')::numeric, 0.0015),
    'price_band',  COALESCE(wbs_setting('price_band', '0.20')::numeric, 0.20),
    'tick_cap',    COALESCE(wbs_setting('tick_cap', '0.03')::numeric, 0.03),
    'circuit_drop', COALESCE(wbs_setting('circuit_drop', '0.06')::numeric, 0.06),
    'auction_done', COALESCE(wbs_setting('auction_done', '1'), '1'),
    'auction_until', COALESCE(wbs_setting('auction_until', '0')::int, 0),
    'circuit_until', COALESCE(wbs_setting('circuit_until', '0')::int, 0),
    'prod_base',   COALESCE(wbs_setting('produce_sec_base', '8')::numeric, 8),
    'prod_per',    COALESCE(wbs_setting('produce_sec_per_unit', '1.2')::numeric, 1.2),
    'prod_min',    COALESCE(wbs_setting('produce_sec_min', '8')::int, 8),
    'prod_max',    COALESCE(wbs_setting('produce_sec_max', '1200')::int, 1200),
    'auto_list',   COALESCE(wbs_setting('auto_list', '1'), '1'),
    'rd_sec_min',  COALESCE(wbs_setting('rd_sec_min', '0.2')::numeric, 0.2),
    'rd_sec_max',  COALESCE(wbs_setting('rd_sec_max', '60')::numeric, 60),
    'prod_qty_max', COALESCE(wbs_setting('produce_max_qty', '50')::int, 50),
    'fluct_on',    COALESCE(wbs_setting('fluct_on', '1'), '1'),
    'fluct_mat',   COALESCE(wbs_setting('fluct_mat', '1.6')::numeric, 1.6),
    'fluct_prod',  COALESCE(wbs_setting('fluct_prod', '0.9')::numeric, 0.9),
    'fluct_oth',   COALESCE(wbs_setting('fluct_oth', '0.6')::numeric, 0.6),
    'fluct_drift', COALESCE(wbs_setting('fluct_drift', '6')::numeric, 6),
    'fluct_sec',   GREATEST(2, LEAST(120, COALESCE(wbs_setting('fluct_sec', '6')::int, 6))),
    'fluct_until', COALESCE(NULLIF(wbs_setting('fluct_until', ''), ''), NULL::text)
  );
END $function$


CREATE OR REPLACE FUNCTION public.wbs_market_seed(p_force boolean DEFAULT false)\nCREATE OR REPLACE FUNCTION public.wbs_market_seed(p_force boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_cnt int;
  v_fy int;
BEGIN
  SELECT fiscal_year INTO v_fy FROM wbs_game WHERE id = 1;
  IF v_fy IS NULL THEN v_fy := 1; END IF;
  SELECT count(*) INTO v_cnt FROM wbs_quotes_live;
  IF v_cnt > 0 AND NOT p_force THEN
    RETURN jsonb_build_object('seeded', false, 'count', v_cnt);
  END IF;
  IF p_force THEN DELETE FROM wbs_quotes_live; END IF;

  INSERT INTO wbs_quotes_live(code, name, kind, base, price, prev, open, high, low, volume, tick, fiscal_year, updated_at)
  SELECT 'MAT:' || m.code, m.name, 'material', m.price, m.price, m.price, m.price, m.price, m.price, 0, 0, v_fy, now()
    FROM wbs_materials m
  ON CONFLICT (code) DO NOTHING;

  INSERT INTO wbs_quotes_live(code, name, kind, base, price, prev, open, high, low, volume, tick, fiscal_year, updated_at)
  SELECT 'PRD:' || p.code, p.name, 'product', p.ref_price, p.ref_price, p.ref_price, p.ref_price, p.ref_price, p.ref_price, 0, 0, v_fy, now()
    FROM wbs_products p
  ON CONFLICT (code) DO NOTHING;

  INSERT INTO wbs_quotes_live(code, name, kind, base, price, prev, open, high, low, volume, tick, fiscal_year, updated_at)
  SELECT 'FX:' || f.currency, f.name, 'fx', f.rate, f.rate, f.rate, f.rate, f.rate, f.rate, 0, 0, v_fy, now()
    FROM wbs_fx f
  ON CONFLICT (code) DO NOTHING;

  SELECT count(*) INTO v_cnt FROM wbs_quotes_live;
  RETURN jsonb_build_object('seeded', true, 'count', v_cnt);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_market_shock(p_code text, p_pct numeric, p_note text)\nCREATE OR REPLACE FUNCTION public.wbs_market_shock(p_code text, p_pct numeric, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_uid text;
  v_role text;
  v_hit int;
  v_tick int;
  v_fy int;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT role INTO v_role FROM wbs_players WHERE owner_id = v_uid;
  IF v_role IS NULL OR v_role NOT IN ('admin','government') THEN
    RAISE EXCEPTION '只有组委会（政府 / 裁判）可以干预市场';
  END IF;
  IF p_pct IS NULL OR p_pct = 0 THEN RAISE EXCEPTION '冲击幅度不能为 0'; END IF;
  IF abs(p_pct) > 60 THEN RAISE EXCEPTION '单次冲击幅度不得超过 ±60%%'; END IF;

  PERFORM wbs_market_seed(false);
  SELECT COALESCE(max(tick),0), COALESCE(max(fiscal_year),1) INTO v_tick, v_fy FROM wbs_quotes_live;

  UPDATE wbs_quotes_live
     SET prev = price,
         price = GREATEST(0.01, LEAST(round(base * 1.55, 2), GREATEST(round(base * 0.62, 2), round(price * (1 + p_pct / 100.0), 2)))),
         note = NULLIF(p_note, ''),
         updated_at = now()
   WHERE (p_code = 'ALL' OR code = p_code);
  GET DIAGNOSTICS v_hit = ROW_COUNT;
  IF v_hit = 0 THEN RAISE EXCEPTION '没有找到该品种'; END IF;

  UPDATE wbs_quotes_live SET high = GREATEST(high, price), low = LEAST(low, price)
   WHERE (p_code = 'ALL' OR code = p_code);

  INSERT INTO wbs_quotes(code, name, kind, price, prev, base, volume, tick, drift, fiscal_year, phase, at)
  SELECT code, name, kind, price, prev, base, 0, v_tick, round(p_pct::numeric, 5), v_fy, 'shock', now()
    FROM wbs_quotes_live
   WHERE (p_code = 'ALL' OR code = p_code);

  RETURN wbs_market_snapshot();
END $function$


CREATE OR REPLACE FUNCTION public.wbs_market_snapshot()\nCREATE OR REPLACE FUNCTION public.wbs_market_snapshot()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT jsonb_build_object(
    'tick', COALESCE(max(q.tick), 0),
    'at', COALESCE(max(q.updated_at), now()),
    'band', COALESCE((SELECT value::numeric FROM wbs_settings WHERE key = 'price_band'), 0.20),
    'fee',  COALESCE((SELECT value::numeric FROM wbs_settings WHERE key = 'ex_fee'), 0.0015),
    'circuitUntil', COALESCE((SELECT value::int FROM wbs_settings WHERE key = 'circuit_until'), 0),
    'auctionDone', COALESCE((SELECT value FROM wbs_settings WHERE key = 'auction_done'), '1'),
    'index', COALESCE((SELECT jsonb_build_object('code', i.code, 'name', i.name, 'value', i.value,
        'prev', i.prev, 'open', i."open", 'high', i.high, 'low', i.low, 'base', i.base, 'tick', i.tick,
        'chg', round(i.value - i."open", 2),
        'chgPct', CASE WHEN i."open" > 0 THEN round((i.value - i."open") / i."open" * 100, 2) ELSE 0 END)
      FROM wbs_index i WHERE i.code = 'KCI'), '{}'::jsonb),
    'rows', COALESCE(jsonb_agg(jsonb_build_object(
      'code', q.code, 'name', q.name, 'kind', q.kind,
      'base', q.base, 'price', q.price, 'prev', q.prev,
      'open', q."open", 'high', q.high, 'low', q.low,
      'volume', q.volume, 'tick', q.tick, 'note', q.note,
      'chg', round(q.price - q.base, 2),
      'chg_pct', CASE WHEN q.base > 0 THEN round((q.price - q.base) / q.base * 100, 2) ELSE 0 END,
      'delta', round(q.price - q.prev, 2),
      'delta_pct', CASE WHEN q.prev > 0 THEN round((q.price - q.prev) / q.prev * 100, 2) ELSE 0 END
    ) ORDER BY q.kind, q.code), '[]'::jsonb)
  ) FROM wbs_quotes_live q;
$function$


CREATE OR REPLACE FUNCTION public.wbs_market_tick(p_force boolean DEFAULT false)\nCREATE OR REPLACE FUNCTION public.wbs_market_tick(p_force boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid text; v_fy int; v_phase text; v_last timestamptz; v_tick int;
  v_wars int; v_sanc int; v_heat numeric; v_vol numeric; v_move numeric; v_new numeric;
  v_band numeric; v_cap numeric; v_hi numeric; v_lo numeric; v_o numeric;
  v_auc_until int; v_auc_done text; v_circ_until int; v_matched int;
  v_kci numeric; v_kci_open numeric; r record; t record; v_stopped int := 0;
  v_fluct_on text; v_fluct_drift numeric; v_sec int; v_until timestamptz;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;

  PERFORM wbs_market_seed(false);
  SELECT fiscal_year, phase INTO v_fy, v_phase FROM wbs_game WHERE id = 1;
  IF v_fy IS NULL THEN v_fy := 1; END IF;
  IF v_phase IS NULL THEN v_phase := 'open'; END IF;

  v_sec := GREATEST(2, LEAST(120, COALESCE(wbs_setting('fluct_sec','6')::int, 6)));
  SELECT max(updated_at), COALESCE(max(tick), 0) INTO v_last, v_tick FROM wbs_quotes_live;
  IF NOT p_force AND v_last IS NOT NULL AND now() - v_last < make_interval(secs => v_sec) THEN
    RETURN wbs_market_snapshot();
  END IF;

  PERFORM pg_advisory_xact_lock(918273645);

  SELECT max(updated_at) INTO v_last FROM wbs_quotes_live;
  IF NOT p_force AND v_last IS NOT NULL AND now() - v_last < make_interval(secs => v_sec) THEN
    RETURN wbs_market_snapshot();
  END IF;

  v_band := COALESCE(wbs_setting('price_band','0.20')::numeric, 0.20);
  v_cap  := COALESCE(wbs_setting('tick_cap','0.03')::numeric, 0.03);
  v_auc_until := COALESCE(wbs_setting('auction_until','0')::int, 0);
  v_auc_done  := COALESCE(wbs_setting('auction_done','1'), '1');
  v_circ_until := COALESCE(wbs_setting('circuit_until','0')::int, 0);
  v_fluct_on  := COALESCE(wbs_setting('fluct_on','1'), '1');
  v_fluct_drift := COALESCE(wbs_setting('fluct_drift','6')::numeric, 6);

  -- 波动持续期：裁判设了时长且已到期 → 自动冻结（只提示一次）
  v_until := NULLIF(wbs_setting('fluct_until',''), '')::timestamptz;
  IF v_fluct_on = '1' AND v_until IS NOT NULL AND now() >= v_until THEN
    UPDATE wbs_settings SET value = '0', updated_at = now() WHERE key = 'fluct_on';
    UPDATE wbs_settings SET value = '', updated_at = now() WHERE key = 'fluct_until';
    v_fluct_on := '0';
    PERFORM wbs_notice('system', '组委会公告：本轮波动时间已结束', '行情自动波动已按设定时长自动结束，全场价格进入冻结状态，等待组委会下一步指令。');
  END IF;

  v_tick := COALESCE(v_tick, 0) + 1;

  -- ① 集合竞价：只收委托，不报价、不撮合
  IF v_auc_done = '0' AND v_tick <= v_auc_until THEN
    UPDATE wbs_quotes_live SET tick = v_tick, fiscal_year = v_fy, updated_at = now();
    PERFORM wbs_index_tick();
    PERFORM wbs_log_ticks(v_tick, v_fy);
    RETURN wbs_market_snapshot();
  END IF;

  -- 集合竞价结束：按最大成交量的价位定开盘价，并一次性撮合
  IF v_auc_done = '0' THEN
    PERFORM wbs_call_auction();
    UPDATE wbs_settings SET value = '1', updated_at = now() WHERE key = 'auction_done';
  END IF;

  -- ② 熔断期间：全场停牌，价格冻结、不撮合
  IF v_tick <= v_circ_until THEN
    UPDATE wbs_quotes_live SET tick = v_tick, fiscal_year = v_fy, updated_at = now();
    PERFORM wbs_index_tick();
    PERFORM wbs_log_ticks(v_tick, v_fy);
    RETURN wbs_market_snapshot();
  END IF;

  -- ③ 正常撮合档：随机游走 + 向基准价回归，受涨跌停板与单档波幅双重限制
  --    波动率、回归强度、每档间隔、持续时长全部由裁判在「自动波动控制台」设定（支持小数）
  SELECT count(*) INTO v_wars FROM wbs_wars WHERE status IN ('declared','fighting');
  SELECT count(*) INTO v_sanc FROM wbs_sanctions WHERE status = 'active';
  v_heat := 1 + LEAST(2.5, COALESCE(v_wars,0) * 0.55 + COALESCE(v_sanc,0) * 0.18);

  v_stopped := 0;
  FOR r IN SELECT * FROM wbs_quotes_live ORDER BY code LOOP
    v_o := COALESCE(NULLIF(r."open", 0), r.base);
    v_hi := round(v_o * (1 + v_band), 2);
    v_lo := round(GREATEST(0.01, v_o * (1 - v_band)), 2);

    v_vol := CASE r.kind
               WHEN 'material' THEN COALESCE(wbs_setting('fluct_mat','1.6')::numeric, 1.6)
               WHEN 'product'  THEN COALESCE(wbs_setting('fluct_prod','0.9')::numeric, 0.9)
               ELSE COALESCE(wbs_setting('fluct_oth','0.6')::numeric, 0.6)
             END / 100.0;
    v_vol := v_vol * v_heat;
    IF v_phase <> 'open' THEN v_vol := v_vol * 0.45; END IF;

    IF v_fluct_on = '0' THEN
      -- 裁判关闭自动波动：价格冻结，只推进档位与撮合
      UPDATE wbs_quotes_live
         SET tick = v_tick, fiscal_year = v_fy, updated_at = now()
       WHERE code = r.code;
      CONTINUE;
    END IF;

    v_move := (CASE WHEN r.base > 0 THEN (r.price - r.base) / r.base * -(v_fluct_drift / 100.0) ELSE 0 END)
              + (random() - 0.5) * 2 * v_vol;
    IF v_move > v_cap THEN v_move := v_cap; END IF;
    IF v_move < -v_cap THEN v_move := -v_cap; END IF;
    v_new := round(r.price * (1 + v_move::numeric), 2);
    IF v_new > v_hi THEN v_new := v_hi; END IF;
    IF v_new < v_lo THEN v_new := v_lo; END IF;
    IF v_new < 0.01 THEN v_new := 0.01; END IF;

    IF v_new >= v_hi AND r.prev < v_hi THEN
      PERFORM wbs_notice('limit', r.name || ' 涨停', '价格触及涨停板 ' || v_hi || ' G（开盘价 ' || v_o || ' G 上浮 20%），买盘堆积，卖盘稀少。');
    END IF;
    IF v_new <= v_lo AND r.prev > v_lo THEN
      PERFORM wbs_notice('limit', r.name || ' 跌停', '价格触及跌停板 ' || v_lo || ' G（开盘价 ' || v_o || ' G 下浮 20%），卖盘堆积，买盘稀少。');
    END IF;

    UPDATE wbs_quotes_live
       SET prev = r.price, price = v_new,
           high = GREATEST(r.high, v_new), low = LEAST(r.low, v_new),
           volume = round(r.volume + (random() * (CASE r.kind WHEN 'material' THEN 40 ELSE 20 END))::numeric, 0),
           tick = v_tick, fiscal_year = v_fy, updated_at = now()
     WHERE code = r.code;
  END LOOP;

  -- ④ 交易所自营盘重新报价，随后全体委托进入撮合
  PERFORM wbs_market_maker();
  FOR t IN SELECT DISTINCT code FROM wbs_orders WHERE owner_id = '__exchange__' AND status = 'open' LOOP
    v_matched := v_matched + wbs_match_orders(t.code);
    PERFORM wbs_market_cleanup(t.code);
  END LOOP;

  -- ⑤ 逐档快照、tick 日志与大盘指数
  INSERT INTO wbs_quotes(code, name, kind, price, prev, base, volume, tick, drift, fiscal_year, phase, at)
  SELECT code, name, kind, price, prev, base, volume, v_tick, 0, v_fy, v_phase, now() FROM wbs_quotes_live;
  DELETE FROM wbs_quotes WHERE tick < v_tick - 200;
  v_kci := wbs_index_tick();
  PERFORM wbs_log_ticks(v_tick, v_fy);

  -- ⑥ 大盘熔断：综合指数较开盘跌幅超过阈值 → 全场停牌 3 档
  SELECT "open" INTO v_kci_open FROM wbs_index WHERE code = 'KCI';
  IF v_kci_open > 0 AND v_kci <= round(v_kci_open * (1 - COALESCE(wbs_setting('circuit_drop','0.06')::numeric, 0.06)), 2) THEN
    UPDATE wbs_settings SET value = (v_tick + 3)::text, updated_at = now() WHERE key = 'circuit_until';
    PERFORM wbs_notice('circuit', '大盘熔断 · 全场停牌 3 档',
      '卡加综合指数 ' || v_kci || '，较开盘价 ' || v_kci_open || ' 下跌超过 6%，触发熔断。第 ' || (v_tick+1) || ' ~ ' || (v_tick+3) || ' 档暂停全部撮合。');
  END IF;

  DELETE FROM wbs_trades WHERE id < (SELECT COALESCE(max(id),0) - 3000 FROM wbs_trades);

  RETURN wbs_market_snapshot();
END $function$


CREATE OR REPLACE FUNCTION public.wbs_match_orders(p_code text)\nCREATE OR REPLACE FUNCTION public.wbs_match_orders(p_code text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_fee numeric; v_fy int; v_tick int; v_n int := 0; v_i int := 0;
  b wbs_orders; s wbs_orders;
  v_qty numeric; v_px numeric; v_amt numeric;
  v_left numeric; v_portion numeric; v_pay numeric; v_refund numeric; v_fee_amt numeric;
  v_taker text; v_fillb numeric; v_fills numeric;
BEGIN
  v_fee := COALESCE(wbs_setting('ex_fee','0.0015')::numeric, 0.0015);
  SELECT fiscal_year INTO v_fy FROM wbs_game WHERE id = 1;
  v_fy := COALESCE(v_fy, 0);
  SELECT COALESCE(max(tick),0) INTO v_tick FROM wbs_quotes_live;

  LOOP
    v_i := v_i + 1;
    EXIT WHEN v_i > 200;

    -- 只让真人买方进场撮合：系统商户（__exchange__）不做被动买盘。
    -- 玩家挂出来的货必须等真实买家，不能被系统顺手吃掉。
    SELECT * INTO b FROM wbs_orders
     WHERE code = p_code AND side = 'buy' AND status IN ('open','partial')
       AND owner_id <> '__exchange__'
     ORDER BY price DESC, id ASC LIMIT 1;
    EXIT WHEN NOT FOUND;

    -- 直接选出"能跟这张买单成交、且不是他自己挂的"最优卖单；
    -- 一次筛掉自成交（同一 owner 买卖对甸）与价格不匹配的卖单。
    SELECT * INTO s FROM wbs_orders
     WHERE code = p_code AND side = 'sell' AND status IN ('open','partial')
       AND owner_id <> b.owner_id
       AND price <= b.price
     ORDER BY price ASC, id ASC LIMIT 1;
    EXIT WHEN NOT FOUND;

    v_qty := LEAST(b.qty - b.filled, s.qty - s.filled);
    EXIT WHEN v_qty <= 0;

    v_px := CASE WHEN b.id < s.id THEN b.price ELSE s.price END;
    v_amt := round(v_px * v_qty, 2);
    v_fee_amt := round(v_amt * v_fee, 2);
    v_taker := CASE WHEN b.id < s.id THEN 'sell' ELSE 'buy' END;

    IF b.owner_id <> '__exchange__' THEN
      v_left := b.qty - b.filled;
      IF v_qty >= v_left THEN v_portion := b.escrow;
      ELSE v_portion := LEAST(b.escrow, round(b.price * v_qty * (1 + v_fee), 2));
      END IF;
      v_pay := LEAST(v_portion, round(v_px * v_qty * (1 + v_fee), 2));
      v_refund := GREATEST(0, v_portion - v_pay);
      IF v_refund > 0 THEN
        UPDATE wbs_players SET cash = cash + v_refund WHERE owner_id = b.owner_id;
        INSERT INTO wbs_ledger(owner_id, fiscal_year, kind, detail, amount)
          VALUES (b.owner_id, v_fy, 'ex_order_back',
            '成交价优于委托价，解冻多冻结的 ' || v_refund || ' G（' || b.name || ' ×' || v_qty || ' @ ' || v_px || ' G）', v_refund);
      END IF;
      INSERT INTO wbs_stock(owner_id, kind, item_code, qty) VALUES (b.owner_id, b.kind, b.item_code, v_qty)
        ON CONFLICT (owner_id, kind, item_code) DO UPDATE SET qty = wbs_stock.qty + EXCLUDED.qty;
      INSERT INTO wbs_ledger(owner_id, fiscal_year, kind, detail, amount)
        VALUES (b.owner_id, v_fy, 'ex_trade_buy',
          '撮合成交 买入 ' || b.name || ' ×' || v_qty || ' @ ' || v_px || ' G（含手续费 ' || v_fee_amt
          || ' G，已在委托冻结中扣付）', 0);
      UPDATE wbs_orders SET escrow = GREATEST(0, escrow - v_portion) WHERE id = b.id;
    END IF;

    IF s.owner_id <> '__exchange__' THEN
      UPDATE wbs_players SET cash = cash + v_amt - v_fee_amt WHERE owner_id = s.owner_id;
      INSERT INTO wbs_ledger(owner_id, fiscal_year, kind, detail, amount)
        VALUES (s.owner_id, v_fy, 'ex_trade_sell', '撮合成交 卖出 ' || s.name || ' ×' || v_qty || ' @ ' || v_px || ' G', v_amt);
      IF v_fee_amt > 0 THEN
        INSERT INTO wbs_ledger(owner_id, fiscal_year, kind, detail, amount)
          VALUES (s.owner_id, v_fy, 'ex_trade_fee', '撮合手续费（卖出 ' || s.name || ' ×' || v_qty || '）', -v_fee_amt);
      END IF;
    END IF;

    INSERT INTO wbs_trades(code, name, kind, item_code, price, qty, amount, fee,
      buy_order_id, sell_order_id, buyer_id, buyer_name, buyer_seat,
      seller_id, seller_name, seller_seat, taker, tick, fiscal_year)
    VALUES (p_code, b.name, b.kind, b.item_code, v_px, v_qty, v_amt, v_fee_amt * 2,
      b.id, s.id, b.owner_id, b.company_name, b.seat,
      s.owner_id, s.company_name, s.seat, v_taker, v_tick, v_fy);

    v_fillb := b.filled + v_qty;
    v_fills := s.filled + v_qty;
    UPDATE wbs_orders SET filled = v_fillb, status = CASE WHEN v_fillb >= qty THEN 'filled' ELSE 'partial' END, updated_at = now() WHERE id = b.id;
    UPDATE wbs_orders SET filled = v_fills, status = CASE WHEN v_fills >= qty THEN 'filled' ELSE 'partial' END, updated_at = now() WHERE id = s.id;

    UPDATE wbs_quotes_live
       SET prev = price, price = v_px,
           high = GREATEST(high, v_px), low = LEAST(low, v_px),
           volume = round(volume + v_qty, 0), updated_at = now()
     WHERE code = p_code;

    v_n := v_n + 1;
  END LOOP;

  RETURN v_n;
END $function$


CREATE OR REPLACE FUNCTION public.wbs_media_push(p_code text, p_pct numeric, p_title text, p_body text, p_note text)\nCREATE OR REPLACE FUNCTION public.wbs_media_push(p_code text, p_pct numeric, p_title text, p_body text, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid text; v_name text; v_role text; v_fy int; v_pct numeric; v_n int;
  v_tick int; v_qname text; v_kind text; v_hit int;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT company_name, role INTO v_name, v_role FROM wbs_players WHERE owner_id = v_uid;
  IF v_name IS NULL THEN RAISE EXCEPTION '请先完成队伍注册'; END IF;
  IF v_role <> 'media' THEN RAISE EXCEPTION '只有媒体可以发报道影响行情'; END IF;

  SELECT fiscal_year INTO v_fy FROM wbs_game WHERE id = 1;
  IF v_fy IS NULL THEN v_fy := 1; END IF;

  v_pct := round(COALESCE(p_pct, 0), 2);
  IF v_pct = 0 THEN RAISE EXCEPTION '影响幅度不能为 0'; END IF;
  IF abs(v_pct) < 0.5 THEN RAISE EXCEPTION '影响幅度不得小于 0.5%%'; END IF;
  IF abs(v_pct) > 6 THEN RAISE EXCEPTION '单篇报道影响幅度不得超过 ±6%%'; END IF;

  SELECT count(*) INTO v_n FROM wbs_news WHERE owner_id = v_uid AND kind = 'news' AND fiscal_year = v_fy AND impact_code IS NOT NULL;
  IF v_n >= 3 THEN RAISE EXCEPTION '本财年的行情影响力已用完（每财年限 3 篇）'; END IF;

  SELECT name, kind INTO v_qname, v_kind FROM wbs_quotes_live WHERE code = p_code;
  IF v_qname IS NULL THEN RAISE EXCEPTION '行情里没有这个品种'; END IF;
  IF v_kind = 'fx' THEN RAISE EXCEPTION '外汇行情不受报道影响'; END IF;

  SELECT COALESCE(max(tick), 0) + 1 INTO v_tick FROM wbs_quotes_live;
  UPDATE wbs_quotes_live
     SET prev = price,
         price = GREATEST(round(base * 0.62, 2), LEAST(round(base * 1.55, 2), round(price * (1 + v_pct / 100.0), 2))),
         high = GREATEST(high, GREATEST(round(base * 0.62, 2), LEAST(round(base * 1.55, 2), round(price * (1 + v_pct / 100.0), 2)))),
         low = LEAST(low, GREATEST(round(base * 0.62, 2), LEAST(round(base * 1.55, 2), round(price * (1 + v_pct / 100.0), 2)))),
         tick = v_tick,
         note = NULLIF(p_note, ''),
         updated_at = now()
   WHERE code = p_code;
  GET DIAGNOSTICS v_hit = ROW_COUNT;
  IF v_hit = 0 THEN RAISE EXCEPTION '没有找到该品种'; END IF;

  INSERT INTO wbs_quotes(code, name, kind, price, prev, base, volume, tick, drift, fiscal_year, phase, at)
  SELECT code, name, kind, price, prev, base, 0, v_tick, v_pct, v_fy, 'media', now()
    FROM wbs_quotes_live WHERE code = p_code;

  INSERT INTO wbs_news(owner_id, author, title, body, kind, fiscal_year, impact_code, impact_pct)
    VALUES (v_uid, v_name, p_title, p_body, 'news', v_fy, p_code, v_pct);

  RETURN jsonb_build_object('name', v_qname, 'pct', v_pct, 'used', v_n + 1, 'limit', 3, 'tick', v_tick);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_my_seed_orders(p_force boolean DEFAULT false)\nCREATE OR REPLACE FUNCTION public.wbs_my_seed_orders(p_force boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid text; v_role text; v_fy int; v_name text; v_cash numeric;
  v_key text; v_flag text; v_phase text; v_band numeric;
  r record; v_sell int := 0; v_buy int := 0;
  v_spot numeric; v_ref numeric; v_px numeric; v_qty numeric; v_hi numeric; v_lo numeric;
  v_details jsonb := '[]'::jsonb; v_res jsonb;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT phase, fiscal_year INTO v_phase, v_fy FROM wbs_game WHERE id = 1;
  IF v_phase IS DISTINCT FROM 'open' THEN RAISE EXCEPTION '交易所尚未开市，无法自动上架'; END IF;
  SELECT company_name, cash, role INTO v_name, v_cash, v_role FROM wbs_players WHERE owner_id = v_uid;
  IF v_name IS NULL THEN RAISE EXCEPTION '请先完成队伍注册'; END IF;

  v_key := 'seed:' || v_uid;
  SELECT value INTO v_flag FROM wbs_settings WHERE key = v_key;
  IF v_flag = v_fy::text AND NOT p_force THEN
    RETURN jsonb_build_object('skipped', true, 'sell', 0, 'buy', 0, 'details', '[]'::jsonb);
  END IF;

  v_band := COALESCE(wbs_setting('price_band','0.20')::numeric, 0.20);

  FOR r IN
    SELECT s.kind, s.item_code, s.qty, q.price AS spot, q.name, q.code, q."open" AS qo, q.base AS qbase
      FROM wbs_stock s
      JOIN wbs_quotes_live q
        ON q.code = CASE WHEN s.kind = 'material' THEN 'MAT:' ELSE 'PRD:' END || s.item_code
     WHERE s.owner_id = v_uid AND s.kind IN ('material','product') AND s.qty > 0 AND q.kind <> 'fx'
     ORDER BY s.qty DESC, s.item_code LIMIT 2
  LOOP
    v_spot := COALESCE(NULLIF(r.spot, 0), NULLIF(r.qbase, 0), 1);
    v_ref  := COALESCE(NULLIF(r.qo, 0), NULLIF(r.qbase, 0), v_spot);
    v_hi   := round(v_ref * (1 + v_band), 2);
    v_lo   := round(GREATEST(0.01, v_ref * (1 - v_band)), 2);
    v_px   := LEAST(v_hi, GREATEST(v_lo, round(v_spot * 1.05, 2)));
    v_qty  := GREATEST(1, floor(r.qty * 0.2));
    IF v_qty > r.qty THEN v_qty := r.qty; END IF;
    BEGIN
      v_res := wbs_order_place(r.code, 'sell', 'limit', v_px, v_qty);
      v_sell := v_sell + 1;
      v_details := v_details || jsonb_build_array(jsonb_build_object(
        'side','sell','name',r.name,'code',r.code,'qty',v_qty,'price',v_px,'held_before',r.qty));
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;

  v_buy := 0;

  INSERT INTO wbs_settings(key, value, label, updated_at) VALUES (v_key, v_fy::text, '自动上架记录', now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

  RETURN jsonb_build_object('skipped', false, 'sell', v_sell, 'buy', v_buy, 'details', v_details);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_notice(p_kind text, p_title text, p_body text)\nCREATE OR REPLACE FUNCTION public.wbs_notice(p_kind text, p_title text, p_body text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_fy int; v_tick int;
BEGIN
  SELECT fiscal_year INTO v_fy FROM wbs_game WHERE id = 1;
  SELECT COALESCE(max(tick),0) INTO v_tick FROM wbs_quotes_live;
  INSERT INTO wbs_notices(kind,title,body,fiscal_year,tick) VALUES (p_kind, p_title, p_body, v_fy, v_tick);
  DELETE FROM wbs_notices WHERE id < (SELECT COALESCE(max(id),0) - 200 FROM wbs_notices);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_notice_post(p_kind text, p_title text, p_body text)\nCREATE OR REPLACE FUNCTION public.wbs_notice_post(p_kind text, p_title text, p_body text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_role text; v_id bigint;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT role INTO v_role FROM wbs_players WHERE owner_id = auth.uid();
  IF v_role NOT IN ('admin','government','media') THEN RAISE EXCEPTION '只有组委会与媒体可以发布交易所公告'; END IF;
  IF p_title IS NULL OR length(trim(p_title)) = 0 THEN RAISE EXCEPTION '请填写公告标题'; END IF;
  IF length(trim(p_title)) > 60 THEN RAISE EXCEPTION '标题请控制在 60 字以内'; END IF;
  PERFORM wbs_notice(COALESCE(NULLIF(trim(p_kind), ''), 'general'), trim(p_title), left(COALESCE(p_body, ''), 400));
  SELECT max(id) INTO v_id FROM wbs_notices;
  RETURN jsonb_build_object('id', v_id, 'title', trim(p_title));
END $function$


CREATE OR REPLACE FUNCTION public.wbs_notify_role(p_role text, p_subject text, p_body text, p_exclude text DEFAULT NULL::text)\nCREATE OR REPLACE FUNCTION public.wbs_notify_role(p_role text, p_subject text, p_body text, p_exclude text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE v_n int;
BEGIN
  INSERT INTO wbs_mail(sender_id, sender_name, recipient_id, recipient_name, subject, body, kind, fiscal_year)
  SELECT NULL, '系统通知', p.owner_id, p.company_name, p_subject, p_body, 'system',
         (SELECT fiscal_year FROM wbs_game WHERE id = 1)
    FROM wbs_players p
   WHERE p.role = p_role AND (p_exclude IS NULL OR p.owner_id <> p_exclude);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $function$


CREATE OR REPLACE FUNCTION public.wbs_oem_cancel(p_id bigint)\nCREATE OR REPLACE FUNCTION public.wbs_oem_cancel(p_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE o wbs_oem; v_uid text; v_name text; v_role text; v_fy int; k text; v_n int := 0;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT company_name, role INTO v_name, v_role FROM wbs_players WHERE owner_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION '请先完成队伍注册'; END IF;
  SELECT fiscal_year INTO v_fy FROM wbs_game WHERE id = 1;
  SELECT * INTO o FROM wbs_oem WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '代工订单不存在'; END IF;
  IF o.status = 'done' THEN RAISE EXCEPTION '该代工订单已完成，无法撤销'; END IF;
  IF o.status = 'cancelled' THEN RAISE EXCEPTION '该代工订单已经撤销过了'; END IF;
  IF v_role NOT IN ('admin','government') AND v_uid <> o.buyer_id AND v_uid <> o.factory_id THEN
    RAISE EXCEPTION '只有下单方、代工厂或组委会可以撤销该订单';
  END IF;
  FOR k IN SELECT jsonb_object_keys(COALESCE(o.materials,'{}'::jsonb)) LOOP
    v_n := v_n + 1;
    INSERT INTO wbs_stock(owner_id, kind, item_code, qty)
      VALUES (o.buyer_id, 'material', k, (o.materials ->> k)::numeric)
      ON CONFLICT (owner_id, kind, item_code) DO UPDATE SET qty = wbs_stock.qty + EXCLUDED.qty;
  END LOOP;
  IF COALESCE(o.fee_total,0) > 0 THEN
    UPDATE wbs_players SET cash = cash + o.fee_total WHERE owner_id = o.buyer_id;
    INSERT INTO wbs_ledger(owner_id, fiscal_year, kind, detail, amount)
      VALUES (o.buyer_id, v_fy, 'oem_refund', '代工撤销退款：' || o.product_name || ' ×' || o.qty, o.fee_total);
  END IF;
  UPDATE wbs_oem SET status = 'cancelled', done_at = now() WHERE id = p_id;
  IF o.buyer_id <> v_uid THEN
    INSERT INTO wbs_mail(sender_id, sender_name, recipient_id, recipient_name, subject, body, kind, fiscal_year)
      VALUES (NULL, '系统通知', o.buyer_id, o.buyer_name,
              '【代工撤销】' || COALESCE(o.factory_name,'代工厂') || ' 撤销了你的代工订单',
              '你的代工订单「' || o.product_name || ' ×' || o.qty || '」已被撤销，托管原料与加工费 ' || COALESCE(o.fee_total,0) || ' G 已全额退回。', 'system', v_fy);
  END IF;
  IF o.factory_id <> v_uid THEN
    INSERT INTO wbs_mail(sender_id, sender_name, recipient_id, recipient_name, subject, body, kind, fiscal_year)
      VALUES (NULL, '系统通知', o.factory_id, o.factory_name,
              '【代工撤销】' || COALESCE(o.buyer_name,'下单方') || ' 撤销了代工订单',
              '代工订单「' || o.product_name || ' ×' || o.qty || '」已被撤销，无需再生产。', 'system', v_fy);
  END IF;
  RETURN jsonb_build_object('id', o.id, 'status', 'cancelled', 'product', o.product_code, 'qty', o.qty,
                            'refund_fee', COALESCE(o.fee_total,0), 'materials_back', v_n);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_oem_create(p_factory text, p_product text, p_qty integer, p_fee numeric, p_note text DEFAULT NULL::text)\nCREATE OR REPLACE FUNCTION public.wbs_oem_create(p_factory text, p_product text, p_qty integer, p_fee numeric, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid text; v_name text; v_role text; v_fy int; v_phase text;
  f_name text; f_role text;
  v_recipe jsonb; v_pname text; v_owner text;
  k text; v_need numeric; v_have numeric; v_mp numeric; v_matname text;
  v_mats jsonb := '{}'::jsonb; v_matval numeric := 0;
  v_fee numeric; v_total numeric; v_cash numeric; v_id bigint;
  v_cap int; v_open int; v_note text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT phase, fiscal_year INTO v_phase, v_fy FROM wbs_game WHERE id = 1;
  IF v_phase <> 'open' THEN RAISE EXCEPTION '当前不在交易期，无法下代工订单'; END IF;
  SELECT company_name, role INTO v_name, v_role FROM wbs_players WHERE owner_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION '请先完成队伍注册'; END IF;
  IF v_role NOT IN ('manufacturer','trader','media') THEN RAISE EXCEPTION '该角色不参与代工下单'; END IF;
  IF NULLIF(trim(COALESCE(p_factory,'')),'') IS NULL THEN RAISE EXCEPTION '请选择代工厂'; END IF;
  IF p_factory = v_uid THEN RAISE EXCEPTION '不能给自己下代工订单，直接到「生产中心」投产即可'; END IF;
  SELECT company_name, role INTO f_name, f_role FROM wbs_players WHERE owner_id = p_factory;
  IF NOT FOUND THEN RAISE EXCEPTION '代工厂不存在'; END IF;
  IF f_role <> 'manufacturer' THEN RAISE EXCEPTION '% 不是制造商，无法承接代工', f_name; END IF;
  IF p_qty IS NULL OR p_qty <= 0 THEN RAISE EXCEPTION '代工数量必须大于 0'; END IF;
  IF p_qty > 999 THEN RAISE EXCEPTION '单笔代工请控制在 999 件以内'; END IF;
  SELECT recipe, name, owner_id INTO v_recipe, v_pname, v_owner FROM wbs_products WHERE code = p_product;
  IF NOT FOUND THEN RAISE EXCEPTION '产品不存在'; END IF;
  IF v_owner IS NOT NULL AND v_owner <> v_uid AND v_owner <> p_factory
     AND NOT EXISTS (SELECT 1 FROM wbs_licenses WHERE product_code = p_product AND licensee_id = p_factory
                     AND status = 'active' AND expire_year >= v_fy) THEN
    RAISE EXCEPTION '「%」的配方属于其他公司：需要代工厂先取得该产品的专利授权，或由权利人本人下单', v_pname;
  END IF;
  v_cap := COALESCE(NULLIF(wbs_setting('oem_cap','6'),'')::int, 6);
  SELECT count(*) INTO v_open FROM wbs_oem WHERE buyer_id = v_uid AND status = 'open' AND fiscal_year = v_fy;
  IF v_open >= v_cap THEN RAISE EXCEPTION '你本财年未完成的代工订单已达上限（% 笔）', v_cap; END IF;
  FOR k IN SELECT jsonb_object_keys(v_recipe) LOOP
    v_need := (v_recipe ->> k)::numeric * p_qty;
    SELECT COALESCE(qty,0) INTO v_have FROM wbs_stock WHERE owner_id = v_uid AND kind = 'material' AND item_code = k;
    IF COALESCE(v_have,0) < v_need THEN
      SELECT name INTO v_matname FROM wbs_materials WHERE code = k;
      RAISE EXCEPTION '你的原材料不足：% 需要 % 单位，现有 % 单位（代工的原料由下单方提供）', COALESCE(v_matname,k), v_need, COALESCE(v_have,0);
    END IF;
    SELECT price INTO v_mp FROM wbs_materials WHERE code = k;
    v_matval := v_matval + COALESCE(v_mp,0) * v_need;
    v_mats := v_mats || jsonb_build_object(k, v_need);
  END LOOP;
  v_fee := round(COALESCE(p_fee,0), 2);
  IF v_fee < 0 THEN RAISE EXCEPTION '加工费不能为负'; END IF;
  v_total := round(v_fee * p_qty, 2);
  SELECT cash INTO v_cash FROM wbs_players WHERE owner_id = v_uid FOR UPDATE;
  IF COALESCE(v_cash,0) < v_total THEN RAISE EXCEPTION '现金不足以支付加工费（需 % G，现有 % G）', v_total, COALESCE(v_cash,0); END IF;
  FOR k IN SELECT jsonb_object_keys(v_recipe) LOOP
    UPDATE wbs_stock SET qty = qty - (v_recipe ->> k)::numeric * p_qty
      WHERE owner_id = v_uid AND kind = 'material' AND item_code = k;
  END LOOP;
  IF v_total > 0 THEN
    UPDATE wbs_players SET cash = cash - v_total WHERE owner_id = v_uid;
    INSERT INTO wbs_ledger(owner_id, fiscal_year, kind, detail, amount)
      VALUES (v_uid, v_fy, 'oem_pay', '委托代工托管：' || v_pname || ' ×' || p_qty || ' → ' || f_name, -v_total);
  END IF;
  v_note := NULLIF(trim(COALESCE(p_note,'')),'');
  INSERT INTO wbs_oem(buyer_id, buyer_name, factory_id, factory_name, product_code, product_name, qty,
                      fee_per_unit, fee_total, materials, mat_value, status, fiscal_year, note)
    VALUES (v_uid, v_name, p_factory, f_name, p_product, v_pname, p_qty,
            v_fee, v_total, v_mats, round(v_matval,2), 'open', v_fy, v_note)
    RETURNING id INTO v_id;
  INSERT INTO wbs_mail(sender_id, sender_name, recipient_id, recipient_name, subject, body, kind, fiscal_year)
    VALUES (NULL, '系统通知', p_factory, f_name,
            '【代工订单】' || v_name || ' 委托你生产 ' || v_pname || ' ×' || p_qty,
            v_name || ' 向你下了一笔代工订单：' || v_pname || ' ×' || p_qty || '。'
            || chr(10) || '原料已由对方托管，加工费 ' || v_fee || ' G/件（合计 ' || v_total || ' G）已托管。'
            || chr(10) || '到「生产中心 · 代工订单」点「开工生产」即可，成品直接归对方。'
            || COALESCE(chr(10) || '备注：' || v_note, ''), 'system', v_fy);
  RETURN jsonb_build_object('id', v_id, 'product', p_product, 'name', v_pname, 'qty', p_qty,
                            'fee_per_unit', v_fee, 'fee_total', v_total, 'mat_value', round(v_matval,2),
                            'factory', f_name, 'status', 'open');
END $function$


CREATE OR REPLACE FUNCTION public.wbs_oem_run(p_id bigint)\nCREATE OR REPLACE FUNCTION public.wbs_oem_run(p_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE o wbs_oem; v_uid text; v_name text; v_fy int; v_phase text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT phase, fiscal_year INTO v_phase, v_fy FROM wbs_game WHERE id = 1;
  IF v_phase <> 'open' THEN RAISE EXCEPTION '当前不在交易期，无法开工'; END IF;
  SELECT company_name INTO v_name FROM wbs_players WHERE owner_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION '请先完成队伍注册'; END IF;
  SELECT * INTO o FROM wbs_oem WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '代工订单不存在'; END IF;
  IF o.factory_id <> v_uid THEN RAISE EXCEPTION '只有受托的代工厂可以开工生产'; END IF;
  IF o.status = 'done' THEN RAISE EXCEPTION '该代工订单已经完成'; END IF;
  IF o.status = 'cancelled' THEN RAISE EXCEPTION '该代工订单已被撤销'; END IF;
  IF o.fiscal_year <> v_fy THEN RAISE EXCEPTION '该代工订单属于财年 %，已跨年作废，请让下单方撤销后重新下单', o.fiscal_year; END IF;
  INSERT INTO wbs_stock(owner_id, kind, item_code, qty)
    VALUES (o.buyer_id, 'product', o.product_code, o.qty)
    ON CONFLICT (owner_id, kind, item_code) DO UPDATE SET qty = wbs_stock.qty + EXCLUDED.qty;
  IF COALESCE(o.fee_total,0) > 0 THEN
    UPDATE wbs_players SET cash = cash + o.fee_total, total_asset = total_asset + o.fee_total WHERE owner_id = v_uid;
    INSERT INTO wbs_ledger(owner_id, fiscal_year, kind, detail, amount)
      VALUES (v_uid, v_fy, 'oem_income', '代工收入：为 ' || COALESCE(o.buyer_name,'对方') || ' 生产 ' || o.product_name || ' ×' || o.qty, o.fee_total);
  END IF;
  UPDATE wbs_oem SET status = 'done', done_at = now() WHERE id = p_id;
  INSERT INTO wbs_mail(sender_id, sender_name, recipient_id, recipient_name, subject, body, kind, fiscal_year)
    VALUES (NULL, '系统通知', o.buyer_id, o.buyer_name,
            '【已完工】' || o.product_name || ' ×' || o.qty || ' 已入库',
            v_name || ' 已完成你的代工订单。' || o.product_name || ' ×' || o.qty || ' 已放入你的库存，加工费 '
            || COALESCE(o.fee_total,0) || ' G 已支付给代工厂。', 'system', v_fy);
  RETURN jsonb_build_object('id', o.id, 'status', 'done', 'product', o.product_code, 'qty', o.qty,
                            'fee_total', COALESCE(o.fee_total,0), 'factory', v_name, 'buyer', o.buyer_name);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_open_year(p_exchange numeric DEFAULT NULL::numeric, p_tariff numeric DEFAULT NULL::numeric, p_trial boolean DEFAULT false)\nCREATE OR REPLACE FUNCTION public.wbs_open_year(p_exchange numeric DEFAULT NULL::numeric, p_tariff numeric DEFAULT NULL::numeric, p_trial boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ DECLARE v_role text; v_fy int; v_rate numeric; v_tariff numeric; v_gov jsonb; BEGIN IF auth.uid() IS NULL THEN RAISE EXCEPTION '请先登录'; END IF; SELECT role INTO v_role FROM wbs_players WHERE owner_id = auth.uid(); IF v_role IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION '只有裁判可以开启财年'; END IF; IF (SELECT is_trial FROM wbs_game WHERE id = 1) AND NOT COALESCE(p_trial, false) THEN PERFORM wbs_reset_game(); END IF; IF (SELECT phase FROM wbs_game WHERE id = 1) = 'open' THEN RAISE EXCEPTION '当前财年尚未结算，请先结算'; END IF; UPDATE wbs_game SET fiscal_year = fiscal_year + 1 WHERE id = 1 RETURNING fiscal_year INTO v_fy; v_rate := COALESCE(p_exchange, ROUND((0.80 + random() * 0.45)::numeric, 2)); v_tariff := COALESCE(p_tariff, ROUND((0.05 + random() * 0.15)::numeric, 2)); IF v_rate <= 0 THEN RAISE EXCEPTION '汇率必须大于 0'; END IF; IF v_tariff < 0 OR v_tariff >= 1 THEN RAISE EXCEPTION '关税率需在 0 与 1 之间'; END IF; v_gov := wbs_gov_year_rollover(v_fy - 1, v_fy); UPDATE wbs_game SET phase = 'open', exchange_rate = v_rate, tariff_rate = v_tariff, is_trial = COALESCE(p_trial, false), updated_at = now() WHERE id = 1; UPDATE wbs_materials SET supply_left = supply_total; UPDATE wbs_offers SET status = 'cancelled' WHERE status = 'open' AND fiscal_year < v_fy; UPDATE wbs_fx SET rate = ROUND(GREATEST(0.05, rate * (0.92 + random() * 0.16))::numeric, 4) WHERE currency IN ('A','B'); DELETE FROM wbs_demand WHERE fiscal_year = v_fy; INSERT INTO wbs_demand(fiscal_year, market, product_code, demand_total, demand_left, price) SELECT v_fy, 'domestic', p.code, q.n, q.n, q.price FROM wbs_products p CROSS JOIN LATERAL ( SELECT (20 + floor(random() * 40))::numeric AS n, GREATEST(1, ROUND(COALESCE(p.ref_price, 50) * (0.90 + random() * 0.25)))::numeric AS price ) q; RETURN jsonb_build_object('fiscal_year', v_fy, 'exchange_rate', v_rate, 'tariff_rate', v_tariff, 'is_trial', COALESCE(p_trial, false), 'gov', v_gov); END $function$


CREATE OR REPLACE FUNCTION public.wbs_order_cancel(p_id bigint)\nCREATE OR REPLACE FUNCTION public.wbs_order_cancel(p_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE o wbs_orders; v_left numeric; v_back numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT * INTO o FROM wbs_orders WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION '委托不存在'; END IF;
  IF o.owner_id <> auth.uid() THEN RAISE EXCEPTION '只能撤销自己的委托'; END IF;
  IF o.status NOT IN ('open','partial') THEN RAISE EXCEPTION '该委托已结束，无法撤销'; END IF;
  v_left := o.qty - o.filled;
  v_back := wbs_order_refund(p_id, 'cancelled');
  RETURN jsonb_build_object('id', p_id, 'released', v_back, 'side', o.side, 'qty', v_left, 'name', o.name);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_order_place(p_code text, p_side text, p_type text DEFAULT 'limit'::text, p_price numeric DEFAULT NULL::numeric, p_qty numeric DEFAULT NULL::numeric)\nCREATE OR REPLACE FUNCTION public.wbs_order_place(p_code text, p_side text, p_type text DEFAULT 'limit'::text, p_price numeric DEFAULT NULL::numeric, p_qty numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid text; v_name text; v_seat text; v_cash numeric;
  v_kind text; v_item text; v_qname text; v_base numeric; v_spot numeric; v_open numeric;
  v_fee numeric; v_band numeric; v_hi numeric; v_lo numeric;
  v_qty numeric; v_price numeric; v_escrow numeric; v_have numeric;
  v_fy int; v_phase text; v_id bigint; v_tick integer; v_matched int := 0;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT company_name, cash, seat INTO v_name, v_cash, v_seat FROM wbs_players WHERE owner_id = v_uid;
  IF v_name IS NULL THEN RAISE EXCEPTION '请先完成队伍注册'; END IF;
  SELECT phase, fiscal_year INTO v_phase, v_fy FROM wbs_game WHERE id = 1;
  IF v_phase IS DISTINCT FROM 'open' THEN RAISE EXCEPTION '当前不在交易期，交易所已闭市'; END IF;
  IF p_side NOT IN ('buy','sell') THEN RAISE EXCEPTION '方向只能是买入或卖出'; END IF;

  SELECT kind, name, base, price, "open" INTO v_kind, v_qname, v_base, v_spot, v_open FROM wbs_quotes_live WHERE code = p_code;
  IF NOT FOUND THEN RAISE EXCEPTION '该品种未在交易所上市'; END IF;
  IF v_kind = 'fx' THEN RAISE EXCEPTION '外汇由央行定价，不参与竞价交易'; END IF;
  v_item := split_part(p_code, ':', 2);

  v_qty := round(COALESCE(p_qty, 0), 0);
  IF v_qty <= 0 THEN RAISE EXCEPTION '委托数量必须大于 0'; END IF;
  IF v_qty > 200000 THEN RAISE EXCEPTION '单笔委托数量过大'; END IF;

  v_fee := COALESCE(wbs_setting('ex_fee','0.0015')::numeric, 0.0015);
  v_band := COALESCE(wbs_setting('price_band','0.20')::numeric, 0.20);
  IF v_open IS NULL OR v_open <= 0 THEN v_open := v_base; END IF;
  v_hi := round(v_open * (1 + v_band), 2);
  v_lo := round(GREATEST(0.01, v_open * (1 - v_band)), 2);

  IF p_type = 'market' THEN
    IF p_side = 'buy' THEN v_price := v_hi; ELSE v_price := v_lo; END IF;
  ELSE
    v_price := round(COALESCE(p_price, 0), 2);
    IF v_price <= 0 THEN RAISE EXCEPTION '委托价格必须大于 0'; END IF;
    IF v_price > v_hi OR v_price < v_lo THEN
      RAISE EXCEPTION '委托价超出涨跌停板（% ~ % G）', v_lo, v_hi;
    END IF;
  END IF;

  IF p_side = 'buy' THEN
    v_escrow := round(v_price * v_qty * (1 + v_fee), 2);
    IF v_cash < v_escrow THEN RAISE EXCEPTION '现金不足，需冻结 % G（含手续费）', v_escrow; END IF;
    UPDATE wbs_players SET cash = cash - v_escrow WHERE owner_id = v_uid;
  ELSE
    SELECT qty INTO v_have FROM wbs_stock WHERE owner_id = v_uid AND kind = v_kind AND item_code = v_item;
    IF COALESCE(v_have, 0) < v_qty THEN RAISE EXCEPTION '库存不足，你只有 % 单位', COALESCE(v_have, 0); END IF;
    UPDATE wbs_stock SET qty = qty - v_qty WHERE owner_id = v_uid AND kind = v_kind AND item_code = v_item;
    v_escrow := 0;
  END IF;

  SELECT COALESCE(max(tick), 0) INTO v_tick FROM wbs_quotes_live;
  INSERT INTO wbs_orders(owner_id, company_name, seat, code, name, kind, item_code, side, otype, price, qty, escrow, status, fiscal_year, tick)
  VALUES (v_uid, v_name, COALESCE(v_seat, wbs_seat(v_uid)), p_code, v_qname, v_kind, v_item, p_side, p_type, v_price, v_qty, v_escrow, 'open', v_fy, v_tick)
  RETURNING id INTO v_id;

  INSERT INTO wbs_ledger(owner_id, fiscal_year, kind, detail, amount)
  VALUES (v_uid, v_fy, CASE WHEN p_side = 'buy' THEN 'ex_order_buy' ELSE 'ex_order_sell' END,
    CASE WHEN p_side = 'buy' THEN '委托买入 ' || v_qname || ' ×' || v_qty || ' @ ' || v_price || ' G'
         ELSE '委托卖出 ' || v_qname || ' ×' || v_qty || ' @ ' || v_price || ' G' END,
    CASE WHEN p_side = 'buy' THEN -v_escrow ELSE 0 END);

  IF COALESCE(wbs_setting('auction_done','1'), '1') = '1'
     AND v_tick > COALESCE(wbs_setting('circuit_until','0')::int, 0) THEN
    v_matched := wbs_match_orders(p_code);
    PERFORM wbs_market_cleanup(p_code);
  END IF;

  RETURN jsonb_build_object('id', v_id, 'code', p_code, 'name', v_qname, 'side', p_side,
    'type', p_type, 'price', v_price, 'qty', v_qty, 'escrow', v_escrow, 'matched', v_matched,
    'bandLow', v_lo, 'bandHigh', v_hi, 'spot', v_spot);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_order_refund(p_id bigint, p_status text DEFAULT 'cancelled'::text)\nCREATE OR REPLACE FUNCTION public.wbs_order_refund(p_id bigint, p_status text DEFAULT 'cancelled'::text)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE o wbs_orders; v_left numeric; v_back numeric := 0; v_fy int;
BEGIN
  SELECT * INTO o FROM wbs_orders WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 0; END IF;
  IF o.status NOT IN ('open','partial') THEN RETURN 0; END IF;
  v_left := o.qty - o.filled;
  SELECT fiscal_year INTO v_fy FROM wbs_game WHERE id = 1;
  IF o.owner_id = '__exchange__' THEN
    UPDATE wbs_orders SET status = p_status, escrow = 0, updated_at = now() WHERE id = o.id;
    RETURN 0;
  END IF;
  IF o.side = 'buy' THEN
    IF o.escrow > 0 THEN
      UPDATE wbs_players SET cash = cash + o.escrow WHERE owner_id = o.owner_id;
      v_back := o.escrow;
      INSERT INTO wbs_ledger(owner_id, fiscal_year, kind, detail, amount)
        VALUES (o.owner_id, v_fy, 'ex_order_back', '委托退回 ' || o.name || ' ×' || v_left || '，' || o.escrow || ' G 已解冻', o.escrow);
    END IF;
  ELSE
    IF v_left > 0 THEN
      INSERT INTO wbs_stock(owner_id, kind, item_code, qty) VALUES (o.owner_id, o.kind, o.item_code, v_left)
        ON CONFLICT (owner_id, kind, item_code) DO UPDATE SET qty = wbs_stock.qty + EXCLUDED.qty;
      v_back := v_left;
    END IF;
  END IF;
  UPDATE wbs_orders SET status = p_status, escrow = 0, updated_at = now() WHERE id = o.id;
  RETURN v_back;
END $function$


CREATE OR REPLACE FUNCTION public.wbs_orders_expire()\nCREATE OR REPLACE FUNCTION public.wbs_orders_expire()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN SELECT id FROM wbs_orders WHERE status IN ('open','partial') AND owner_id <> '__exchange__' LOOP
    PERFORM wbs_order_refund(r.id, 'expired');
    n := n + 1;
  END LOOP;
  UPDATE wbs_orders SET status = 'cancelled', escrow = 0, updated_at = now()
   WHERE owner_id = '__exchange__' AND status IN ('open','partial');
  RETURN n;
END $function$


CREATE OR REPLACE FUNCTION public.wbs_pin_post(p_id bigint)\nCREATE OR REPLACE FUNCTION public.wbs_pin_post(p_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_uid text; v_pin boolean; v_fy int; v_cost numeric := 200; v_cash numeric;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT pinned INTO v_pin FROM wbs_posts WHERE id = p_id AND owner_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '公告不存在或不属于你'; END IF;
  SELECT fiscal_year INTO v_fy FROM wbs_game WHERE id = 1;
  IF v_pin THEN UPDATE wbs_posts SET pinned = false WHERE id = p_id; RETURN jsonb_build_object('pinned', false); END IF;
  SELECT cash INTO v_cash FROM wbs_players WHERE owner_id = v_uid FOR UPDATE;
  IF v_cash < v_cost THEN RAISE EXCEPTION '置顶需支付 % 金币，现金不足', v_cost; END IF;
  UPDATE wbs_players SET cash = cash - v_cost WHERE owner_id = v_uid;
  UPDATE wbs_posts SET pinned = true WHERE id = p_id;
  INSERT INTO wbs_ledger(owner_id, fiscal_year, kind, detail, amount) VALUES (v_uid, v_fy, 'ad_cost', '市场公告置顶服务费', -v_cost);
  RETURN jsonb_build_object('pinned', true, 'cost', v_cost);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_pitch_submit(p_title text, p_text text, p_link text, p_product text, p_qty numeric, p_ask numeric)\nCREATE OR REPLACE FUNCTION public.wbs_pitch_submit(p_title text, p_text text, p_link text, p_product text, p_qty numeric, p_ask numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_uid text; v_cname text; v_role text; v_fy int; v_phase text;
  v_pname text; v_id bigint; v_msg text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT phase, fiscal_year INTO v_phase, v_fy FROM wbs_game WHERE id = 1;
  IF v_phase <> 'open' THEN RAISE EXCEPTION '当前不在交易期，无法提交路演'; END IF;
  SELECT company_name, role INTO v_cname, v_role FROM wbs_players WHERE owner_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION '请先完成队伍注册'; END IF;
  IF v_role <> 'trader' THEN RAISE EXCEPTION '只有贸易商可以提交路演'; END IF;
  IF p_title IS NULL OR length(trim(p_title)) = 0 THEN RAISE EXCEPTION '请填写路演主题'; END IF;
  IF length(trim(p_title)) > 40 THEN RAISE EXCEPTION '路演主题请控制在 40 字以内'; END IF;
  IF p_text IS NULL OR length(trim(p_text)) < 10 THEN RAISE EXCEPTION '请写一段路演说明（至少 10 个字）'; END IF;
  IF length(trim(p_text)) > 1000 THEN RAISE EXCEPTION '路演说明请控制在 1000 字以内'; END IF;
  SELECT name INTO v_pname FROM wbs_products WHERE code = p_product;
  IF NOT FOUND THEN RAISE EXCEPTION '主推产品不存在'; END IF;
  IF p_qty IS NULL OR p_qty <= 0 THEN RAISE EXCEPTION '可供数量必须大于 0'; END IF;
  IF p_ask IS NULL OR p_ask <= 0 THEN RAISE EXCEPTION '期望单价必须大于 0'; END IF;

  INSERT INTO wbs_pitch(owner_id, company_name, fiscal_year, title, pitch_text, link, product_code, qty, ask_price, status)
    VALUES (v_uid, v_cname, v_fy, trim(p_title), trim(p_text), NULLIF(trim(COALESCE(p_link,'')), ''), p_product, p_qty, p_ask, 'submitted')
    RETURNING id INTO v_id;

  v_msg := v_cname || ' 提交了路演方案，主推「' || v_pname || '」，可供 ' || p_qty || ' 件，期望单价 ' || p_ask || ' G。请及时给出收购报价。';
  PERFORM wbs_notify_role('government', '收到路演方案：' || trim(p_title), v_msg, NULL);
  PERFORM wbs_notify_role('admin', '收到路演方案：' || trim(p_title), v_msg, NULL);

  RETURN jsonb_build_object('id', v_id);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_place_ad(p_media_owner text, p_amount numeric, p_text text)\nCREATE OR REPLACE FUNCTION public.wbs_place_ad(p_media_owner text, p_amount numeric, p_text text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE v_uid text; v_name text; v_role text; v_cash numeric; v_fy int; v_media_name text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION '广告费必须大于 0'; END IF;
  SELECT fiscal_year INTO v_fy FROM wbs_game WHERE id = 1;
  SELECT company_name, role, cash INTO v_name, v_role, v_cash FROM wbs_players WHERE owner_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION '请先完成队伍注册'; END IF;
  IF v_role = 'media' THEN RAISE EXCEPTION '媒体不能给自己投广告'; END IF;
  SELECT company_name INTO v_media_name FROM wbs_players WHERE owner_id = p_media_owner AND role = 'media';
  IF NOT FOUND THEN RAISE EXCEPTION '指定的媒体不存在'; END IF;
  IF v_cash < p_amount THEN RAISE EXCEPTION '现金不足，需要 % 金币', p_amount; END IF;
  UPDATE wbs_players SET cash = cash - p_amount WHERE owner_id = v_uid;
  UPDATE wbs_players SET cash = cash + p_amount WHERE owner_id = p_media_owner;
  INSERT INTO wbs_news(owner_id, author, title, body, kind, fiscal_year)
    VALUES (p_media_owner, v_media_name, '【广告】' || v_name, p_text, 'ad', v_fy);
  INSERT INTO wbs_ledger(owner_id, fiscal_year, kind, detail, amount)
    VALUES (v_uid, v_fy, 'ad_cost', '向 ' || v_media_name || ' 投放广告', -p_amount);
  INSERT INTO wbs_ledger(owner_id, fiscal_year, kind, detail, amount)
    VALUES (p_media_owner, v_fy, 'ad_income', '广告收入：' || v_name, p_amount);
  RETURN jsonb_build_object('amount', p_amount);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_policy_issue(p_kind text, p_title text, p_body text DEFAULT NULL::text, p_product text DEFAULT NULL::text, p_rate numeric DEFAULT 0, p_amount numeric DEFAULT 0, p_budget numeric DEFAULT 0)\nCREATE OR REPLACE FUNCTION public.wbs_policy_issue(p_kind text, p_title text, p_body text DEFAULT NULL::text, p_product text DEFAULT NULL::text, p_rate numeric DEFAULT 0, p_amount numeric DEFAULT 0, p_budget numeric DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid text; v_role text; v_fy int; v_phase text; v_kind text;
  v_cost numeric; v_have numeric; v_cap int; v_used int; v_id bigint;
  v_pool numeric; v_name text; v_sign text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT role INTO v_role FROM wbs_players WHERE owner_id = v_uid;
  IF v_role NOT IN ('admin','government') THEN RAISE EXCEPTION '只有政府可以颁布政策'; END IF;
  SELECT phase, fiscal_year INTO v_phase, v_fy FROM wbs_game WHERE id = 1;
  IF v_phase <> 'open' THEN RAISE EXCEPTION '当前不在交易期，无法颁布政策'; END IF;

  v_kind := lower(trim(COALESCE(p_kind,'')));
  IF v_kind NOT IN ('subsidy','grant','quota','infra') THEN RAISE EXCEPTION '未知的政策类型：%', p_kind; END IF;
  IF p_title IS NULL OR length(trim(p_title)) = 0 THEN RAISE EXCEPTION '请填写政策名称'; END IF;
  IF length(trim(p_title)) > 40 THEN RAISE EXCEPTION '政策名称请控制在 40 字以内'; END IF;

  v_cap := COALESCE(NULLIF(wbs_setting('gov_policy_cap','3'),'')::int, 3);
  SELECT count(*) INTO v_used FROM wbs_policies WHERE fiscal_year = v_fy AND status = 'active';
  IF v_used >= v_cap THEN RAISE EXCEPTION '本财年生效中的政策已达上限（% 项），先撤销一项再颁新的', v_cap; END IF;

  IF v_kind IN ('subsidy','quota') THEN
    IF p_product IS NULL OR trim(p_product) = '' THEN RAISE EXCEPTION '该类政策需要指定目标品种'; END IF;
    IF EXISTS (SELECT 1 FROM wbs_policies WHERE fiscal_year = v_fy AND status = 'active' AND kind = v_kind AND product_code = trim(p_product)) THEN
      RAISE EXCEPTION '本财年已经对同一品种颁过同类政策了'; END IF;
  END IF;
  IF v_kind = 'infra' AND EXISTS (SELECT 1 FROM wbs_policies WHERE fiscal_year = v_fy AND status = 'active' AND kind = 'infra') THEN
    RAISE EXCEPTION '本财年已经有一项基建投资在办了';
  END IF;
  IF v_kind = 'grant' AND EXISTS (SELECT 1 FROM wbs_policies WHERE fiscal_year = v_fy AND status = 'active' AND kind = 'grant' AND cost > 0) THEN
    RAISE EXCEPTION '本财年的出口奖励资金池还在，先把它用完或撤销';
  END IF;

  IF v_kind = 'subsidy' THEN
    IF COALESCE(p_amount,0) <= 0 THEN RAISE EXCEPTION '请填写每件投产补贴金额'; END IF;
  ELSE
    IF COALESCE(p_rate,0) <= 0 OR p_rate > 50 THEN RAISE EXCEPTION '比率需在 0 到 50 之间'; END IF;
  END IF;

  IF v_kind IN ('subsidy','grant') THEN
    v_cost := round(COALESCE(p_budget,0), 2);
    IF v_cost <= 0 THEN RAISE EXCEPTION '请填写政策预算（从国库预扣，用完为止）'; END IF;
    v_pool := v_cost;
  ELSE
    v_cost := round(COALESCE(p_budget,0), 2);
    v_pool := 0;
  END IF;

  SELECT COALESCE(gov_cash,0) INTO v_have FROM wbs_game WHERE id = 1;
  IF v_have < v_cost THEN RAISE EXCEPTION '国库金币不足：需要 % G，现有 % G', v_cost, v_have; END IF;

  IF v_kind = 'subsidy' THEN
    SELECT name INTO v_name FROM wbs_products WHERE code = trim(p_product);
    IF NOT FOUND THEN RAISE EXCEPTION '产品不存在：%', p_product; END IF;
  ELSIF v_kind = 'quota' THEN
    SELECT name INTO v_name FROM wbs_materials WHERE code = trim(p_product);
    IF NOT FOUND THEN RAISE EXCEPTION '原材料不存在：%', p_product; END IF;
  END IF;

  UPDATE wbs_game SET gov_cash = gov_cash - v_cost, gov_spend = gov_spend + v_cost, updated_at = now() WHERE id = 1;

  INSERT INTO wbs_policies(fiscal_year, kind, title, body, product_code, rate, amount, cost, created_by)
    VALUES (v_fy, v_kind, trim(p_title), left(COALESCE(p_body,''),300),
            NULLIF(trim(COALESCE(p_product,'')),''), COALESCE(p_rate,0), COALESCE(p_amount,0), v_pool, v_uid)
    RETURNING id INTO v_id;

  IF v_kind = 'infra' THEN
    UPDATE wbs_demand SET price = GREATEST(1, round(price * (1 + COALESCE(p_rate,0) / 100.0)))
      WHERE fiscal_year = v_fy;
  END IF;

  v_sign := CASE v_kind
    WHEN 'subsidy' THEN '产业补贴：' || COALESCE(v_name, '') || ' 每件投产补贴 ' || COALESCE(p_amount,0) || ' G，预算池 ' || v_cost || ' G'
    WHEN 'grant' THEN '出口奖励：对政府交付额外奖励 ' || COALESCE(p_rate,0) || '%，预算池 ' || v_cost || ' G'
    WHEN 'quota' THEN '原料配额：下一财年「' || COALESCE(v_name,'') || '」供给提升 ' || COALESCE(p_rate,0) || '%'
    ELSE '基建投资：本财年内销收购价提升 ' || COALESCE(p_rate,0) || '%'
  END;

  PERFORM wbs_notice('gov_policy', '新政颁布：' || trim(p_title), v_sign || '。' || COALESCE(p_body,''));
  PERFORM wbs_notify_role('trader', '新政颁布：' || trim(p_title), v_sign || '。' || COALESCE(p_body,''), NULL);
  PERFORM wbs_notify_role('manufacturer', '新政颁布：' || trim(p_title), v_sign || '。' || COALESCE(p_body,''), NULL);

  RETURN jsonb_build_object('id', v_id, 'kind', v_kind, 'title', trim(p_title), 'cost', v_cost, 'pool', v_pool);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_policy_revoke(p_id bigint, p_note text DEFAULT NULL::text)\nCREATE OR REPLACE FUNCTION public.wbs_policy_revoke(p_id bigint, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE r wbs_policies; v_uid text; v_role text; v_left numeric;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT role INTO v_role FROM wbs_players WHERE owner_id = v_uid;
  IF v_role NOT IN ('admin','government') THEN RAISE EXCEPTION '只有政府可以撤销政策'; END IF;
  SELECT * INTO r FROM wbs_policies WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '政策不存在'; END IF;
  IF r.status <> 'active' THEN RAISE EXCEPTION '该政策已结束（%）', r.status; END IF;
  v_left := GREATEST(COALESCE(r.cost,0), 0);
  IF v_left > 0 THEN
    UPDATE wbs_game SET gov_cash = gov_cash + v_left, gov_spend = GREATEST(0, gov_spend - v_left), updated_at = now() WHERE id = 1;
  END IF;
  UPDATE wbs_policies SET status = 'revoked' WHERE id = p_id;
  PERFORM wbs_notice('gov_policy', '政策撤销：' || r.title, '政府已撤销该项政策。' || COALESCE(p_note, ''));
  RETURN jsonb_build_object('id', p_id, 'refund', v_left);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_post_message(p_kind text, p_title text, p_body text, p_want_role text)\nCREATE OR REPLACE FUNCTION public.wbs_post_message(p_kind text, p_title text, p_body text, p_want_role text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_uid text; v_name text; v_role text; v_fy int; v_id bigint;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT company_name, role INTO v_name, v_role FROM wbs_players WHERE owner_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION '请先完成队伍注册'; END IF;
  IF p_kind NOT IN ('coop','supply','demand','partner','bounty','other') THEN RAISE EXCEPTION '公告类型不合法'; END IF;
  IF p_title IS NULL OR length(trim(p_title)) = 0 THEN RAISE EXCEPTION '请填写标题'; END IF;
  IF length(trim(p_title)) > 40 THEN RAISE EXCEPTION '标题请控制在 40 字以内'; END IF;
  IF length(COALESCE(p_body, '')) > 600 THEN RAISE EXCEPTION '正文请控制在 600 字以内'; END IF;
  IF NULLIF(p_want_role,'') IS NOT NULL AND p_want_role NOT IN ('manufacturer','trader','media','any') THEN RAISE EXCEPTION '期望合作方角色不合法'; END IF;
  SELECT fiscal_year INTO v_fy FROM wbs_game WHERE id = 1;
  INSERT INTO wbs_posts(owner_id, company_name, role, fiscal_year, kind, title, body, want_role)
    VALUES (v_uid, v_name, v_role, v_fy, p_kind, trim(p_title), NULLIF(trim(COALESCE(p_body,'')), ''), NULLIF(p_want_role,''))
    RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'title', trim(p_title));
END $function$


CREATE OR REPLACE FUNCTION public.wbs_post_news(p_title text, p_body text)\nCREATE OR REPLACE FUNCTION public.wbs_post_news(p_title text, p_body text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE v_uid text; v_name text; v_role text; v_fy int; v_id bigint;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  IF p_title IS NULL OR length(trim(p_title)) = 0 THEN RAISE EXCEPTION '请填写消息标题'; END IF;
  IF length(trim(p_title)) > 60 THEN RAISE EXCEPTION '标题请控制在 60 字以内'; END IF;
  SELECT company_name, role INTO v_name, v_role FROM wbs_players WHERE owner_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION '请先完成队伍注册'; END IF;
  IF v_role NOT IN ('media','admin') THEN RAISE EXCEPTION '只有媒体或裁判可以发布资讯'; END IF;
  SELECT fiscal_year INTO v_fy FROM wbs_game WHERE id = 1;
  INSERT INTO wbs_news(owner_id, author, title, body, kind, fiscal_year)
    VALUES (v_uid, v_name, trim(p_title), p_body, 'news', v_fy)
    RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_procure_cancel(p_id bigint)\nCREATE OR REPLACE FUNCTION public.wbs_procure_cancel(p_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r wbs_procure; v_uid text; v_role text; v_left numeric; v_refund numeric;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT role INTO v_role FROM wbs_players WHERE owner_id = v_uid;
  IF v_role NOT IN ('admin','government') THEN RAISE EXCEPTION '只有政府可以取消采购招标'; END IF;
  SELECT * INTO r FROM wbs_procure WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '采购单不存在'; END IF;
  IF r.status <> 'open' THEN RAISE EXCEPTION '该采购单已结束，无法取消'; END IF;
  v_left := GREATEST(COALESCE(r.qty,0) - COALESCE(r.filled,0), 0);
  v_refund := round(COALESCE(r.unit_price,0) * v_left, 2);
  IF r.currency = 'A' THEN
    UPDATE wbs_game SET gov_cash_a = gov_cash_a + v_refund, gov_spend = GREATEST(0, gov_spend - v_refund), updated_at = now() WHERE id = 1;
  ELSIF r.currency = 'B' THEN
    UPDATE wbs_game SET gov_cash_b = gov_cash_b + v_refund, gov_spend = GREATEST(0, gov_spend - v_refund), updated_at = now() WHERE id = 1;
  ELSE
    UPDATE wbs_game SET gov_cash = gov_cash + v_refund, gov_spend = GREATEST(0, gov_spend - v_refund), updated_at = now() WHERE id = 1;
  END IF;
  UPDATE wbs_procure SET status = 'cancelled', updated_at = now() WHERE id = p_id;
  RETURN jsonb_build_object('id', p_id, 'refund', v_refund, 'left', v_left);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_procure_create(p_product text, p_qty numeric, p_price numeric, p_currency text DEFAULT 'G'::text, p_target text DEFAULT NULL::text, p_note text DEFAULT NULL::text)\nCREATE OR REPLACE FUNCTION public.wbs_procure_create(p_product text, p_qty numeric, p_price numeric, p_currency text DEFAULT 'G'::text, p_target text DEFAULT NULL::text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid text; v_role text; v_fy int; v_phase text; v_pname text;
  v_cost numeric; v_cur text; v_have numeric; v_id bigint; v_used int; v_cap int; v_sign text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT role INTO v_role FROM wbs_players WHERE owner_id = v_uid;
  IF v_role NOT IN ('admin','government') THEN RAISE EXCEPTION '只有政府可以发布采购招标'; END IF;
  SELECT phase, fiscal_year INTO v_phase, v_fy FROM wbs_game WHERE id = 1;
  IF v_phase <> 'open' THEN RAISE EXCEPTION '当前不在交易期，无法发布采购'; END IF;
  IF p_qty IS NULL OR p_qty <= 0 THEN RAISE EXCEPTION '采购数量必须大于 0'; END IF;
  IF p_price IS NULL OR p_price <= 0 THEN RAISE EXCEPTION '采购单价必须大于 0'; END IF;
  IF p_qty > 9999 THEN RAISE EXCEPTION '单笔采购数量请控制在 9999 件以内'; END IF;

  SELECT name INTO v_pname FROM wbs_products WHERE code = p_product;
  IF NOT FOUND THEN RAISE EXCEPTION '产品不存在：%', p_product; END IF;

  v_cap := COALESCE(NULLIF(wbs_setting('gov_procure_cap','8'),'')::int, 8);
  SELECT count(*) INTO v_used FROM wbs_procure WHERE fiscal_year = v_fy;
  IF v_used >= v_cap THEN RAISE EXCEPTION '本财年采购招标已达上限（% 笔），先把在办的卖掉或取消', v_cap; END IF;

  v_cur := UPPER(COALESCE(NULLIF(trim(p_currency), ''), 'G'));
  IF v_cur NOT IN ('G','A','B') THEN RAISE EXCEPTION '结算货币只能是 G / A / B'; END IF;
  v_cost := round(p_price * p_qty, 2);
  v_sign := CASE v_cur WHEN 'A' THEN '★' WHEN 'B' THEN '◆' ELSE 'G' END;

  IF v_cur = 'A' THEN
    SELECT COALESCE(gov_cash_a,0) INTO v_have FROM wbs_game WHERE id = 1;
    IF v_have < v_cost THEN RAISE EXCEPTION '国库星洲币不足：需要 % ★，现有 % ★', v_cost, v_have; END IF;
    UPDATE wbs_game SET gov_cash_a = gov_cash_a - v_cost, gov_spend = gov_spend + v_cost, updated_at = now() WHERE id = 1;
  ELSIF v_cur = 'B' THEN
    SELECT COALESCE(gov_cash_b,0) INTO v_have FROM wbs_game WHERE id = 1;
    IF v_have < v_cost THEN RAISE EXCEPTION '国库贺兰币不足：需要 % ◆，现有 % ◆', v_cost, v_have; END IF;
    UPDATE wbs_game SET gov_cash_b = gov_cash_b - v_cost, gov_spend = gov_spend + v_cost, updated_at = now() WHERE id = 1;
  ELSE
    SELECT COALESCE(gov_cash,0) INTO v_have FROM wbs_game WHERE id = 1;
    IF v_have < v_cost THEN RAISE EXCEPTION '国库金币不足：需要 % G，现有 % G', v_cost, v_have; END IF;
    UPDATE wbs_game SET gov_cash = gov_cash - v_cost, gov_spend = gov_spend + v_cost, updated_at = now() WHERE id = 1;
  END IF;

  INSERT INTO wbs_procure(fiscal_year, product_code, qty, unit_price, currency, target_owner, note, created_by)
    VALUES (v_fy, p_product, p_qty, p_price, v_cur, NULLIF(trim(COALESCE(p_target,'')),''), left(COALESCE(p_note,''),200), v_uid)
    RETURNING id INTO v_id;

  PERFORM wbs_notice('gov_procure', '政府采购：「' || v_pname || '」×' || p_qty || ' 公开招标',
    '政府以 ' || p_price || ' ' || v_sign || '/件 采购「' || v_pname || '」共 ' || p_qty || ' 件，先到先得、售完即止。' || COALESCE('备注：' || p_note, ''));
  PERFORM wbs_notify_role('trader', '政府采购招标：' || v_pname,
    '政府正在以 ' || p_price || ' ' || v_sign || '/件 采购「' || v_pname || '」共 ' || p_qty || ' 件，到「政府市场」即可交付。', NULL);

  RETURN jsonb_build_object('id', v_id, 'product', p_product, 'name', v_pname, 'qty', p_qty, 'price', p_price, 'currency', v_cur, 'cost', v_cost);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_procure_fill(p_id bigint, p_qty numeric)\nCREATE OR REPLACE FUNCTION public.wbs_procure_fill(p_id bigint, p_qty numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r wbs_procure; v_uid text; v_role text; v_fy int; v_phase text; v_cname text;
  v_left numeric; v_stock numeric; v_income numeric; v_pname text;
  v_rate numeric := 1; v_cur_name text; v_sign text; v_key text;
  v_pol record; v_bonus numeric := 0; v_rest numeric;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT role, company_name INTO v_role, v_cname FROM wbs_players WHERE owner_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION '请先完成队伍注册'; END IF;
  IF v_role <> 'trader' THEN RAISE EXCEPTION '只有贸易商可以承接政府采购'; END IF;
  SELECT phase, fiscal_year INTO v_phase, v_fy FROM wbs_game WHERE id = 1;
  IF v_phase <> 'open' THEN RAISE EXCEPTION '当前不在交易期，无法交付'; END IF;
  SELECT * INTO r FROM wbs_procure WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '采购单不存在'; END IF;
  IF r.status <> 'open' THEN RAISE EXCEPTION '该采购单已结束'; END IF;
  IF r.fiscal_year <> v_fy THEN RAISE EXCEPTION '该采购单属于上一财年，已失效'; END IF;
  IF r.target_owner IS NOT NULL AND r.target_owner <> v_uid THEN RAISE EXCEPTION '这是政府对其他公司指定的定向采购'; END IF;
  IF p_qty IS NULL OR p_qty <= 0 THEN RAISE EXCEPTION '交付数量必须大于 0'; END IF;
  v_left := GREATEST(COALESCE(r.qty,0) - COALESCE(r.filled,0), 0);
  IF p_qty > v_left THEN RAISE EXCEPTION '超出剩余采购量，还可交付 % 件', v_left; END IF;
  SELECT COALESCE(qty,0) INTO v_stock FROM wbs_stock WHERE owner_id = v_uid AND kind = 'product' AND item_code = r.product_code;
  IF COALESCE(v_stock,0) < p_qty THEN RAISE EXCEPTION '库存不足，现有 % 件', COALESCE(v_stock,0); END IF;

  UPDATE wbs_stock SET qty = qty - p_qty WHERE owner_id = v_uid AND kind = 'product' AND item_code = r.product_code;
  v_key := 'PRD:' || r.product_code;
  UPDATE wbs_game SET gov_reserve = jsonb_set(COALESCE(gov_reserve,'{}'::jsonb), ARRAY[v_key],
      to_jsonb(COALESCE((COALESCE(gov_reserve,'{}'::jsonb) ->> v_key)::numeric, 0) + p_qty)) WHERE id = 1;

  v_income := round(r.unit_price * p_qty, 2);
  v_sign := CASE r.currency WHEN 'A' THEN '★' WHEN 'B' THEN '◆' ELSE 'G' END;
  IF r.currency = 'A' THEN
    SELECT rate, name INTO v_rate, v_cur_name FROM wbs_fx WHERE currency = 'A';
    UPDATE wbs_players SET cash_a = cash_a + v_income, total_asset = total_asset + v_income * COALESCE(v_rate,0) WHERE owner_id = v_uid;
  ELSIF r.currency = 'B' THEN
    SELECT rate, name INTO v_rate, v_cur_name FROM wbs_fx WHERE currency = 'B';
    UPDATE wbs_players SET cash_b = cash_b + v_income, total_asset = total_asset + v_income * COALESCE(v_rate,0) WHERE owner_id = v_uid;
  ELSE
    v_rate := 1; v_cur_name := '金币';
    UPDATE wbs_players SET cash = cash + v_income, total_asset = total_asset + v_income WHERE owner_id = v_uid;
  END IF;

  SELECT name INTO v_pname FROM wbs_products WHERE code = r.product_code;

  SELECT * INTO v_pol FROM wbs_policies WHERE fiscal_year = v_fy AND status = 'active' AND kind = 'grant' AND cost > 0 ORDER BY id LIMIT 1;
  IF FOUND THEN
    v_rest := round(v_income * COALESCE(v_rate,1) * COALESCE(v_pol.rate,0) / 100.0, 2);
    v_bonus := LEAST(v_rest, v_pol.cost);
    IF v_bonus > 0 THEN
      UPDATE wbs_game SET gov_cash = gov_cash - v_bonus, gov_spend = gov_spend + v_bonus, updated_at = now() WHERE id = 1;
      UPDATE wbs_players SET cash = cash + v_bonus, total_asset = total_asset + v_bonus WHERE owner_id = v_uid;
      UPDATE wbs_policies SET cost = GREATEST(0, cost - v_bonus), status = CASE WHEN cost - v_bonus <= 0 THEN 'exhausted' ELSE status END WHERE id = v_pol.id;
    END IF;
  END IF;

  UPDATE wbs_procure SET filled = filled + p_qty,
         status = CASE WHEN filled + p_qty >= qty THEN 'done' ELSE 'open' END,
         updated_at = now() WHERE id = p_id;

  INSERT INTO wbs_ledger(owner_id, fiscal_year, kind, detail, amount)
    VALUES (v_uid, v_fy, 'gov_sale',
      '政府采购交付 ' || COALESCE(v_pname, r.product_code) || ' ×' || p_qty || '（' || v_cur_name || ' 结算）',
      round(v_income * COALESCE(v_rate,1) + v_bonus, 2));

  RETURN jsonb_build_object('qty', p_qty, 'income', v_income, 'currency', r.currency, 'bonus', v_bonus, 'sign', v_sign);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_produce(p_product text, p_qty integer)\nCREATE OR REPLACE FUNCTION public.wbs_produce(p_product text, p_qty integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid text; v_recipe jsonb; v_owner text; v_pname text; v_psec numeric := 0;
  v_role text; v_cname text; v_fy int; v_phase text;
  k text; v_matname text; v_need numeric; v_have numeric; v_mp numeric;
  v_cost numeric := 0; v_price numeric;
  v_pol record; v_sub numeric := 0;
  v_lic wbs_licenses; v_lfee numeric := 0;
  v_sec int; v_base numeric; v_per numeric; v_min int; v_max int;
  v_id bigint; v_finish timestamptz;
  v_pmax int; v_dflt int; v_cap int;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  IF p_qty IS NULL OR p_qty <= 0 THEN RAISE EXCEPTION '生产数量必须大于 0'; END IF;
  IF p_qty > 999 THEN RAISE EXCEPTION '单次生产请控制在 999 件以内'; END IF;
  SELECT phase, fiscal_year INTO v_phase, v_fy FROM wbs_game WHERE id = 1;
  IF v_phase <> 'open' THEN RAISE EXCEPTION '当前不在交易期，无法生产'; END IF;
  SELECT company_name, role INTO v_cname, v_role FROM wbs_players WHERE owner_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION '请先完成队伍注册'; END IF;
  IF v_role <> 'manufacturer' THEN RAISE EXCEPTION '只有制造商可以生产'; END IF;

  SELECT recipe, owner_id, name, prod_sec, max_qty INTO v_recipe, v_owner, v_pname, v_psec, v_pmax FROM wbs_products WHERE code = p_product;
  IF NOT FOUND THEN RAISE EXCEPTION '产品不存在'; END IF;

  -- 「最多可产」：产品自己核定的产量上限（研发审批时就固化了）；没单独设过就按全场默认。
  SELECT COALESCE(MAX(value::int) FILTER (WHERE key = 'produce_max_qty'), 50) INTO v_dflt
    FROM wbs_settings WHERE key = 'produce_max_qty';
  v_cap := LEAST(999, GREATEST(1, COALESCE(NULLIF(v_pmax, 0), COALESCE(v_dflt, 50))));
  IF p_qty > v_cap THEN
    RAISE EXCEPTION '「%」单笔最多可产 % 件，你现在填了 % 件。可以分几批继续投，或请组委会调整产量上限', v_pname, v_cap, p_qty;
  END IF;

  IF v_owner IS NOT NULL AND v_owner <> v_uid THEN
    SELECT * INTO v_lic FROM wbs_licenses
     WHERE product_code = p_product AND licensee_id = v_uid AND status = 'active' AND expire_year >= v_fy
     ORDER BY id LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION '「%」是其他公司研发的产品：你需要在「产业协作」申请专利授权，或委托代工', v_pname;
    END IF;
  END IF;

  FOR k IN SELECT jsonb_object_keys(v_recipe) LOOP
    v_need := (v_recipe ->> k)::numeric * p_qty;
    SELECT COALESCE(qty, 0) INTO v_have FROM wbs_stock WHERE owner_id = v_uid AND kind = 'material' AND item_code = k;
    IF COALESCE(v_have, 0) < v_need THEN
      SELECT name INTO v_matname FROM wbs_materials WHERE code = k;
      RAISE EXCEPTION '原材料不足：% 需要 % 单位，现有 % 单位', COALESCE(v_matname, k), v_need, COALESCE(v_have, 0);
    END IF;
    SELECT price INTO v_mp FROM wbs_materials WHERE code = k;
    v_cost := v_cost + COALESCE(v_mp, 0) * (v_recipe ->> k)::numeric * p_qty;
  END LOOP;

  FOR k IN SELECT jsonb_object_keys(v_recipe) LOOP
    UPDATE wbs_stock SET qty = qty - (v_recipe ->> k)::numeric * p_qty
      WHERE owner_id = v_uid AND kind = 'material' AND item_code = k;
  END LOOP;

  SELECT COALESCE(MAX(value::numeric) FILTER (WHERE key = 'produce_sec_base'), 8),
         COALESCE(MAX(value::numeric) FILTER (WHERE key = 'produce_sec_per_unit'), 1.2),
         COALESCE(MAX(value::int)     FILTER (WHERE key = 'produce_sec_min'), 8),
         COALESCE(MAX(value::int)     FILTER (WHERE key = 'produce_sec_max'), 1200)
    INTO v_base, v_per, v_min, v_max
    FROM wbs_settings
   WHERE key IN ('produce_sec_base','produce_sec_per_unit','produce_sec_min','produce_sec_max');

  IF COALESCE(v_psec, 0) > 0 THEN v_per := v_psec; END IF;
  v_sec := LEAST(v_max, GREATEST(v_min, ceil(v_base + v_per * p_qty)::int));

  INSERT INTO wbs_production(owner_id, company_name, product_code, product_name, qty, mat_value,
                             status, fiscal_year, seconds, started_at, finish_at)
    VALUES (v_uid, v_cname, p_product, v_pname, p_qty, round(v_cost, 2),
            'running', v_fy, v_sec, now(), now() + make_interval(secs => v_sec))
    RETURNING id, finish_at INTO v_id, v_finish;

  v_price := GREATEST(1, ceil(v_cost / p_qty * 1.8));

  IF v_lic.id IS NOT NULL THEN
    SELECT LEAST(round(COALESCE(v_lic.fee_per_unit,0) * p_qty, 2), GREATEST(COALESCE(cash,0), 0))
      INTO v_lfee FROM wbs_players WHERE owner_id = v_uid FOR UPDATE;
    IF COALESCE(v_lfee,0) > 0 THEN
      UPDATE wbs_players SET cash = cash - v_lfee WHERE owner_id = v_uid;
      UPDATE wbs_players SET cash = cash + v_lfee, total_asset = total_asset + v_lfee WHERE owner_id = v_lic.licensor_id;
      INSERT INTO wbs_ledger(owner_id, fiscal_year, kind, detail, amount)
        VALUES (v_uid, v_fy, 'license_pay', '专利提成：' || v_pname || ' ×' || p_qty || ' → ' || COALESCE(v_lic.licensor_name,'授权方'), -v_lfee);
      INSERT INTO wbs_ledger(owner_id, fiscal_year, kind, detail, amount)
        VALUES (v_lic.licensor_id, v_fy, 'license_income', '专利提成收入：' || v_pname || ' ×' || p_qty || '（' || v_cname || '）', v_lfee);
    END IF;
  END IF;

  SELECT * INTO v_pol FROM wbs_policies
   WHERE fiscal_year = v_fy AND status = 'active' AND kind = 'subsidy'
     AND product_code = p_product AND cost > 0 ORDER BY id LIMIT 1;
  IF FOUND THEN
    v_sub := LEAST(round(COALESCE(v_pol.amount,0) * p_qty, 2), v_pol.cost);
    IF v_sub > 0 THEN
      UPDATE wbs_game SET gov_cash = gov_cash - v_sub, gov_spend = gov_spend + v_sub, updated_at = now() WHERE id = 1;
      UPDATE wbs_players SET cash = cash + v_sub, total_asset = total_asset + v_sub WHERE owner_id = v_uid;
      UPDATE wbs_policies SET cost = GREATEST(0, cost - v_sub),
             status = CASE WHEN cost - v_sub <= 0 THEN 'exhausted' ELSE status END
       WHERE id = v_pol.id;
      INSERT INTO wbs_ledger(owner_id, fiscal_year, kind, detail, amount)
        VALUES (v_uid, v_fy, 'subsidy', '产业补贴（' || v_pol.title || '）：' || v_pname || ' ×' || p_qty, v_sub);
    END IF;
  END IF;

  RETURN jsonb_build_object('id', v_id, 'product', p_product, 'name', v_pname, 'qty', p_qty,
                            'seconds', v_sec, 'finish_at', v_finish, 'list_price', v_price,
                            'per_unit', v_per, 'subsidy', v_sub, 'license_fee', COALESCE(v_lfee,0),
                            'max_qty', v_cap);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_production_settle()\nCREATE OR REPLACE FUNCTION public.wbs_production_settle()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid text; r record;
  v_list boolean; v_did boolean;
  v_price numeric; v_want numeric;
  v_qcode text; v_qbase numeric; v_open numeric; v_band numeric; v_hi numeric; v_lo numeric;
  v_tick integer; v_seat text; n int := 0; n_list int := 0;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  v_list := COALESCE(wbs_setting('auto_list','1'), '1') = '1';
  v_band := COALESCE(wbs_setting('price_band','0.20')::numeric, 0.20);
  SELECT COALESCE(MAX(tick), 0) INTO v_tick FROM wbs_quotes_live;

  FOR r IN
    WITH due AS (
      UPDATE wbs_production
         SET status = 'done', done_at = now()
       WHERE status = 'running' AND finish_at <= now()
       RETURNING *
    )
    SELECT * FROM due ORDER BY id
  LOOP
    INSERT INTO wbs_stock(owner_id, kind, item_code, qty)
      VALUES (r.owner_id, 'product', r.product_code, r.qty)
      ON CONFLICT (owner_id, kind, item_code) DO UPDATE SET qty = wbs_stock.qty + EXCLUDED.qty;

    v_did := false;
    v_want := GREATEST(1, ceil(r.mat_value / GREATEST(r.qty, 1) * 1.8));
    v_price := v_want;
    v_qcode := 'PRD:' || r.product_code;
    v_open := NULL; v_qbase := NULL;
    SELECT "open", base INTO v_open, v_qbase FROM wbs_quotes_live WHERE code = v_qcode;

    IF FOUND AND v_list THEN
      IF v_open IS NULL OR v_open <= 0 THEN v_open := v_qbase; END IF;
      IF v_open IS NULL OR v_open <= 0 THEN v_open := v_want; END IF;
      v_hi := round(v_open * (1 + v_band), 2);
      v_lo := round(GREATEST(0.01, v_open * (1 - v_band)), 2);
      v_price := LEAST(v_hi, GREATEST(v_lo, v_want));

      SELECT seat INTO v_seat FROM wbs_players WHERE owner_id = r.owner_id;
      UPDATE wbs_stock SET qty = qty - r.qty
        WHERE owner_id = r.owner_id AND kind = 'product' AND item_code = r.product_code;

      INSERT INTO wbs_orders(owner_id, company_name, seat, code, name, kind, item_code, side, otype,
                             price, qty, filled, escrow, status, fiscal_year, tick)
        VALUES (r.owner_id, r.company_name, COALESCE(v_seat, wbs_seat(r.owner_id)), v_qcode,
                r.product_name, 'product', r.product_code, 'sell', 'limit',
                v_price, r.qty, 0, 0, 'open', r.fiscal_year, v_tick);

      UPDATE wbs_production SET listed = true WHERE id = r.id;
      PERFORM wbs_match_orders(v_qcode);
      PERFORM wbs_market_cleanup(v_qcode);
      v_did := true;
      n_list := n_list + 1;

      INSERT INTO wbs_ledger(owner_id, fiscal_year, kind, detail, amount)
        VALUES (r.owner_id, r.fiscal_year, 'produce',
          '生产完工：' || r.product_name || ' ×' || r.qty || '（自动挂入交易所盘口 @' || v_price || ' G，见「我的委托」）', 0);
    ELSE
      INSERT INTO wbs_ledger(owner_id, fiscal_year, kind, detail, amount)
        VALUES (r.owner_id, r.fiscal_year, 'produce',
          '生产完工：' || r.product_name || ' ×' || r.qty || '（已入库，待自行上架）', 0);
    END IF;

    PERFORM wbs_notify_role('trader', '新品上架：' || r.product_name,
      r.company_name || ' 已生产 ' || r.qty || ' 件「' || r.product_name || '」，'
      || CASE WHEN v_did THEN '已挂入交易所盘口 @ ' || v_price || ' G/件，欢迎吃单。'
              ELSE '已入库，可与其联系洽购。' END, NULL);

    n := n + 1;
  END LOOP;

  RETURN jsonb_build_object('count', n, 'listed', n_list, 'auto_list', v_list);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_qprice(p_code text)\nCREATE OR REPLACE FUNCTION public.wbs_qprice(p_code text)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v numeric;
BEGIN
  SELECT price INTO v FROM wbs_quotes_live WHERE code = p_code;
  IF v IS NULL THEN
    IF p_code LIKE 'MAT:%' THEN
      SELECT price INTO v FROM wbs_materials WHERE code = substring(p_code from 5);
    ELSIF p_code LIKE 'PRD:%' THEN
      SELECT ref_price INTO v FROM wbs_products WHERE code = substring(p_code from 5);
    ELSIF p_code LIKE 'FX:%' THEN
      SELECT rate INTO v FROM wbs_fx WHERE currency = substring(p_code from 4);
    END IF;
  END IF;
  RETURN COALESCE(v, 0);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_read_mail(p_id bigint)\nCREATE OR REPLACE FUNCTION public.wbs_read_mail(p_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE v_uid text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  UPDATE wbs_mail SET is_read = true WHERE id = p_id AND recipient_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION '邮件不存在或不属于你'; END IF;
  RETURN jsonb_build_object('ok', true);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_realtime_board()\nCREATE OR REPLACE FUNCTION public.wbs_realtime_board()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_ra numeric; v_rb numeric; v_fy int; v_phase text; v_json jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  IF NOT EXISTS (SELECT 1 FROM wbs_players WHERE owner_id = auth.uid()) THEN
    RAISE EXCEPTION '请先登录并加入比赛';
  END IF;
  PERFORM wbs_seat_ensure();

  SELECT COALESCE(rate, 0) INTO v_ra FROM wbs_fx WHERE currency = 'A';
  SELECT COALESCE(rate, 0) INTO v_rb FROM wbs_fx WHERE currency = 'B';
  v_ra := COALESCE(v_ra, 0);
  v_rb := COALESCE(v_rb, 0);
  SELECT fiscal_year, phase INTO v_fy, v_phase FROM wbs_game WHERE id = 1;

  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.net_worth DESC, x.company_name), '[]'::jsonb)
    INTO v_json
    FROM (
      SELECT p.owner_id            AS owner_id,
             p.company_name        AS company_name,
             p.role                AS role,
             p.seat                AS seat,
             p.cash::numeric       AS cash,
             p.cash_a::numeric     AS cash_a,
             p.cash_b::numeric     AS cash_b,
             ROUND(p.cash_a * v_ra + p.cash_b * v_rb, 2)              AS fx_value,
             ROUND(COALESCE(b.mat_value, 0), 2)                        AS mat_value,
             ROUND(COALESCE(b.prod_value, 0), 2)                       AS prod_value,
             ROUND(COALESCE(b.eq_value, 0), 2)                         AS eq_value,
             ROUND(COALESCE(b.bd_value, 0), 2)                         AS bd_value,
             ROUND(p.cash + p.cash_a * v_ra + p.cash_b * v_rb
                   + COALESCE(b.mat_value, 0) + COALESCE(b.prod_value, 0)
                   + COALESCE(b.eq_value, 0) + COALESCE(b.bd_value, 0), 2) AS net_worth
        FROM wbs_players p
        LEFT JOIN (
          SELECT s.owner_id,
                 SUM(CASE WHEN s.kind = 'material' THEN s.qty * COALESCE(m.price, 0) ELSE 0 END) AS mat_value,
                 SUM(CASE WHEN s.kind = 'product' THEN s.qty * COALESCE((
                       SELECT SUM((pr.recipe ->> k)::numeric * mm.price)
                         FROM jsonb_object_keys(pr.recipe) AS k
                         JOIN wbs_materials mm ON mm.code = k
                     ), 0) ELSE 0 END) AS prod_value,
                 SUM(CASE WHEN s.kind = 'equity' THEN s.qty * COALESCE(eq.price, 0) ELSE 0 END) AS eq_value,
                 SUM(CASE WHEN s.kind = 'bond' THEN s.qty * COALESCE(bd.price, 0) ELSE 0 END) AS bd_value
            FROM wbs_stock s
            LEFT JOIN wbs_materials  m  ON m.code  = s.item_code
            LEFT JOIN wbs_products   pr ON pr.code = s.item_code
            LEFT JOIN wbs_quotes_live eq ON s.kind = 'equity' AND eq.code = 'EQ:'  || s.item_code
            LEFT JOIN wbs_quotes_live bd ON s.kind = 'bond'   AND bd.code = 'BND:' || s.item_code
           WHERE s.qty > 0
           GROUP BY s.owner_id
        ) b ON b.owner_id = p.owner_id
    ) x;

  RETURN jsonb_build_object(
    'fiscal_year', v_fy,
    'phase', v_phase,
    'rate_a', v_ra,
    'rate_b', v_rb,
    'board', v_json,
    'at', to_char(now(), 'HH24:MI:SS')
  );
END $function$


CREATE OR REPLACE FUNCTION public.wbs_reset_game()\nCREATE OR REPLACE FUNCTION public.wbs_reset_game()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ DECLARE v_role text; BEGIN IF auth.uid() IS NULL THEN RAISE EXCEPTION '请先登录'; END IF; SELECT role INTO v_role FROM wbs_players WHERE owner_id = auth.uid(); IF v_role IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION '只有裁判可以重置比赛'; END IF; DELETE FROM wbs_orders; DELETE FROM wbs_trades; DELETE FROM wbs_index; DELETE FROM wbs_ticks; DELETE FROM wbs_spot; DELETE FROM wbs_futures; DELETE FROM wbs_shorts; DELETE FROM wbs_listings; DELETE FROM wbs_bonds; DELETE FROM wbs_notices; DELETE FROM wbs_stock; DELETE FROM wbs_offers; DELETE FROM wbs_deliveries; DELETE FROM wbs_demand; DELETE FROM wbs_ledger; DELETE FROM wbs_scores; DELETE FROM wbs_news; DELETE FROM wbs_pitch; DELETE FROM wbs_rd; DELETE FROM wbs_mail; DELETE FROM wbs_post_interest; DELETE FROM wbs_posts; DELETE FROM wbs_collateral; DELETE FROM wbs_loans; DELETE FROM wbs_wars; DELETE FROM wbs_sanctions; DELETE FROM wbs_quotes; DELETE FROM wbs_quotes_live; DELETE FROM wbs_products WHERE owner_id IS NOT NULL; UPDATE wbs_players SET cash = 2000, cash_a = 0, cash_b = 0, total_asset = 2000, credit_score = 100; UPDATE wbs_game SET fiscal_year = 0, phase = 'prepare', exchange_rate = 1.00, tariff_rate = 0.10, is_trial = false, announcement = NULL, updated_at = now() WHERE id = 1; UPDATE wbs_materials SET supply_left = 0; UPDATE wbs_fx SET rate = 2.00 WHERE currency = 'A'; UPDATE wbs_fx SET rate = 0.50 WHERE currency = 'B'; UPDATE wbs_settings SET value = '1', updated_at = now() WHERE key = 'auction_done'; UPDATE wbs_settings SET value = '0', updated_at = now() WHERE key IN ('auction_until', 'circuit_until'); UPDATE wbs_settings SET value = '0.0015', updated_at = now() WHERE key = 'ex_fee'; UPDATE wbs_settings SET value = '0.20', updated_at = now() WHERE key = 'price_band'; UPDATE wbs_settings SET value = '0.03', updated_at = now() WHERE key = 'tick_cap'; UPDATE wbs_settings SET value = '0.06', updated_at = now() WHERE key = 'circuit_drop'; PERFORM wbs_market_seed(false); RETURN jsonb_build_object('ok', true); END $function$


CREATE OR REPLACE FUNCTION public.wbs_review_pitch(p_id bigint, p_approve boolean, p_price numeric, p_currency text, p_qty numeric, p_note text)\nCREATE OR REPLACE FUNCTION public.wbs_review_pitch(p_id bigint, p_approve boolean, p_price numeric, p_currency text, p_qty numeric, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_uid text; v_role text; v_cname text;
  r wbs_pitch; v_pname text; v_cur_name text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT role, company_name INTO v_role, v_cname FROM wbs_players WHERE owner_id = v_uid;
  IF v_role NOT IN ('admin','government') THEN RAISE EXCEPTION '只有政府或组委会可以给出收购报价'; END IF;
  IF p_id IS NULL THEN RAISE EXCEPTION '请选择要处理的路演'; END IF;

  SELECT * INTO r FROM wbs_pitch WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '该路演不存在'; END IF;
  IF r.status <> 'submitted' THEN RAISE EXCEPTION '该路演已经处理过了'; END IF;
  SELECT name INTO v_pname FROM wbs_products WHERE code = r.product_code;

  IF p_approve THEN
    IF p_price IS NULL OR p_price <= 0 THEN RAISE EXCEPTION '收购单价必须大于 0'; END IF;
    IF p_qty IS NULL OR p_qty <= 0 THEN RAISE EXCEPTION '收购数量必须大于 0'; END IF;
    IF p_qty > r.qty THEN RAISE EXCEPTION '收购数量不能超过对方可供的 % 件', r.qty; END IF;
    IF p_currency NOT IN ('A','B','G') THEN RAISE EXCEPTION '结算货币不合法'; END IF;
    SELECT name INTO v_cur_name FROM wbs_fx WHERE currency = p_currency;
    IF p_currency = 'G' THEN v_cur_name := '金币'; END IF;
    UPDATE wbs_pitch SET status = 'quoted', quote_price = p_price, quote_currency = p_currency,
           quote_qty = p_qty, gov_note = NULLIF(trim(COALESCE(p_note,'')), ''), updated_at = now()
     WHERE id = p_id;
    INSERT INTO wbs_mail(sender_id, sender_name, recipient_id, recipient_name, subject, body, kind, fiscal_year)
      VALUES (v_uid, v_cname, r.owner_id, r.company_name, '路演报价已下达：' || r.title,
              '政府对「' || r.title || '」给出收购报价：' || p_price || ' ' || COALESCE(v_cur_name, p_currency) || ' / 件，最多收购 ' || p_qty || ' 件。'
              || E'\n\n请到「政府市场」完成交付。'
              || CASE WHEN COALESCE(trim(p_note),'') <> '' THEN E'\n\n政府评语：' || trim(p_note) ELSE '' END,
              'system', r.fiscal_year);
    RETURN jsonb_build_object('quoted', true, 'price', p_price, 'currency', p_currency, 'qty', p_qty);
  ELSE
    UPDATE wbs_pitch SET status = 'rejected', gov_note = NULLIF(trim(COALESCE(p_note,'')), ''), updated_at = now() WHERE id = p_id;
    INSERT INTO wbs_mail(sender_id, sender_name, recipient_id, recipient_name, subject, body, kind, fiscal_year)
      VALUES (v_uid, v_cname, r.owner_id, r.company_name, '路演未获采纳：' || r.title,
              '政府本次未采纳「' || r.title || '」的收购方案。'
              || CASE WHEN COALESCE(trim(p_note),'') <> '' THEN E'\n\n政府评语：' || trim(p_note) ELSE '可以修改方案后重新提交。' END,
              'system', r.fiscal_year);
    RETURN jsonb_build_object('quoted', false);
  END IF;
END $function$


CREATE OR REPLACE FUNCTION public.wbs_review_rd(p_id bigint, p_approve boolean, p_note text)\nCREATE OR REPLACE FUNCTION public.wbs_review_rd(p_id bigint, p_approve boolean, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_uid text; v_role text; v_cname text;
  r wbs_rd;
  v_code text;
  v_ref numeric;
  v_sec numeric;
  v_batch int;
  v_cap int;
  v_dflt int;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT role, company_name INTO v_role, v_cname FROM wbs_players WHERE owner_id = v_uid;
  IF v_role NOT IN ('admin','government') THEN RAISE EXCEPTION '只有政府或组委会可以审批研发申请'; END IF;
  IF p_id IS NULL THEN RAISE EXCEPTION '请选择要审批的申请'; END IF;

  SELECT * INTO r FROM wbs_rd WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '研发申请不存在'; END IF;
  IF r.status <> 'pending' THEN RAISE EXCEPTION '该申请已经处理过了'; END IF;

  IF p_approve THEN
    v_code := 'rd' || r.id;
    v_ref := GREATEST(1, round(r.unit_cost * 2));
    v_sec := COALESCE(NULLIF(r.plan_seconds, 0), 1.2);
    -- 「最多可产」：厂家申报的预期可产直接固化成这款产品的产量上限；
    -- 没填就沿用全场默认值。之后组委会仍可在「产品产量上限」里单独调整。
    SELECT COALESCE(MAX(value::int) FILTER (WHERE key = 'produce_max_qty'), 50) INTO v_dflt
      FROM wbs_settings WHERE key = 'produce_max_qty';
    v_dflt := COALESCE(v_dflt, 50);
    v_cap := LEAST(999, GREATEST(1, COALESCE(NULLIF(r.expect_qty, 0), v_dflt)));
    INSERT INTO wbs_products(code, name, recipe, ref_price, sort_order, owner_id, rd_id, prod_sec, max_qty)
      VALUES (v_code, r.product_name, r.recipe, v_ref, 100, r.owner_id, r.id, v_sec, v_cap)
      ON CONFLICT (code) DO NOTHING;
    IF NOT EXISTS (SELECT 1 FROM wbs_quotes_live WHERE code = 'PRD:' || v_code) THEN
      INSERT INTO wbs_quotes_live(code, name, kind, base, price, prev, open, high, low, volume, tick, fiscal_year, updated_at)
        VALUES ('PRD:' || v_code, r.product_name, 'product', v_ref, v_ref, v_ref, v_ref, v_ref, v_ref, 0, 0, r.fiscal_year, now());
    END IF;
    UPDATE wbs_rd SET status = 'approved', gov_note = NULLIF(trim(COALESCE(p_note,'')), ''), product_code = v_code, updated_at = now()
     WHERE id = p_id;
    v_batch := GREATEST(8, round(8 + v_sec * GREATEST(r.apply_qty, 1)));
    INSERT INTO wbs_mail(sender_id, sender_name, recipient_id, recipient_name, subject, body, kind, fiscal_year)
      VALUES (v_uid, v_cname, r.owner_id, r.company_name, '研发申请已通过：' || r.product_name,
              '你的产品「' || r.product_name || '」已获得批准，现在可以进入生产中心投产。'
              || E'\n\n核准工艺参数：单件工时 ' || v_sec || ' 秒（你申报的试产量 ' || r.apply_qty || ' 件约需 ' || v_batch || ' 秒）。'
              || E'\n核准产量参数：单笔最多可产 ' || v_cap || ' 件（你申报的预期可产）。'
              || '生产中心会自动按此参数推算每一批的完工时间与投产量上限，量产越多耗工越长。'
              || E'\n\n该产品已同步挂牌到交易所。'
              || CASE WHEN COALESCE(trim(p_note),'') <> '' THEN E'\n\n政府评语：' || trim(p_note) ELSE '' END,
              'system', r.fiscal_year);
    RETURN jsonb_build_object('approved', true, 'product_code', v_code, 'prod_sec', v_sec, 'max_qty', v_cap);
  ELSE
    UPDATE wbs_rd SET status = 'rejected', gov_note = NULLIF(trim(COALESCE(p_note,'')), ''), updated_at = now() WHERE id = p_id;
    INSERT INTO wbs_mail(sender_id, sender_name, recipient_id, recipient_name, subject, body, kind, fiscal_year)
      VALUES (v_uid, v_cname, r.owner_id, r.company_name, '研发申请被驳回：' || r.product_name,
              '很抱歉，你的产品「' || r.product_name || '」未获批准。'
              || CASE WHEN COALESCE(trim(p_note),'') <> '' THEN E'\n\n政府评语：' || trim(p_note) ELSE '' END,
              'system', r.fiscal_year);
    RETURN jsonb_build_object('approved', false);
  END IF;
END $function$


CREATE OR REPLACE FUNCTION public.wbs_sanction_approve(p_id bigint, p_approve boolean, p_note text)\nCREATE OR REPLACE FUNCTION public.wbs_sanction_approve(p_id bigint, p_approve boolean, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE s wbs_sanctions; v_uid text; v_name text; v_role text; v_fy int; v_note text; v_years int; v_until int; v_kind text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT company_name, role INTO v_name, v_role FROM wbs_players WHERE owner_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION '请先完成队伍注册'; END IF;
  IF v_role NOT IN ('government','admin') THEN RAISE EXCEPTION '只有组委会（政府 / 裁判）可以审批贸易战申请'; END IF;
  SELECT * INTO s FROM wbs_sanctions WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '制裁记录不存在'; END IF;
  IF s.status <> 'pending' THEN RAISE EXCEPTION '该申请已处理完毕'; END IF;
  SELECT fiscal_year INTO v_fy FROM wbs_game WHERE id = 1;
  v_note := NULLIF(trim(COALESCE(p_note,'')),'');
  v_kind := CASE WHEN s.kind = 'embargo' THEN '全面禁运' ELSE '关税壁垒' END;

  IF NOT p_approve THEN
    UPDATE wbs_sanctions SET status = 'rejected', approve_status = 'rejected',
           approved_by = v_name, approve_note = COALESCE(v_note, '组委会驳回，理由未填写') WHERE id = p_id;
    INSERT INTO wbs_mail(sender_id, sender_name, recipient_id, recipient_name, subject, body, kind, fiscal_year)
      VALUES (v_uid, v_name, s.owner_id, s.company_name, '【驳回】对 ' || s.target_name || ' 的' || v_kind || '申请未获批准',
              '组委会驳回了你对 ' || s.target_name || ' 的' || v_kind || '申请，未产生任何效果。'
              || COALESCE(E'\n裁定说明：' || v_note, ''), 'system', v_fy);
    RETURN jsonb_build_object('status','rejected','note', v_note);
  END IF;

  v_years := GREATEST(1, LEAST(5, COALESCE(s.until_year, v_fy + 1) - COALESCE(s.start_year, s.fiscal_year, v_fy)));
  v_until := v_fy + v_years;
  UPDATE wbs_sanctions SET status = 'active', approve_status = 'approved', approved_by = v_name,
         approve_note = v_note, start_year = v_fy, until_year = v_until WHERE id = p_id;
  INSERT INTO wbs_news(author, title, body, kind, fiscal_year)
    VALUES ('组委会', '【贸易战】' || s.company_name || ' 对 ' || s.target_name || ' 实施' || v_kind,
            '组委会已批准该贸易战申请，自财年 ' || v_fy || ' 起持续 ' || v_years || ' 个财年（到财年 ' || v_until || ' 为止）。'
            || CASE WHEN s.kind = 'embargo'
                    THEN s.target_name || ' 在此期间无法与任何人达成新合同。'
                    ELSE '在此期间，' || s.target_name || ' 每签署一份合同，都要按合同金额的 ' || s.rate || '% 缴纳关税；其中一半归 ' || s.company_name || '，另一半作为贸易摩擦损耗直接蒸发。' END
            || COALESCE(' 理由：' || s.reason, ''), 'news', v_fy);
  INSERT INTO wbs_mail(sender_id, sender_name, recipient_id, recipient_name, subject, body, kind, fiscal_year)
    VALUES (v_uid, v_name, s.target_id, s.target_name, '【生效】你已被 ' || s.company_name || ' 实施' || v_kind,
            '组委会已批准，制裁即刻生效，到财年 ' || v_until || ' 为止。'
            || CASE WHEN s.kind = 'embargo' THEN E'\n禁运期间你无法与任何人签署新合同（存量合同不受影响）。'
                    ELSE E'\n你每签署一份合同都要按合同金额的 ' || s.rate || '% 缴税，其中一半会被当作贸易摩擦损耗蒸发。' END
            || E'\n你可以到「商战与制裁」发起对等反制。', 'system', v_fy);
  INSERT INTO wbs_mail(sender_id, sender_name, recipient_id, recipient_name, subject, body, kind, fiscal_year)
    VALUES (v_uid, v_name, s.owner_id, s.company_name, '【已批准】对 ' || s.target_name || ' 的' || v_kind || '已生效',
            '组委会批准了你的申请，有效期到财年 ' || v_until || '。'
            || CASE WHEN s.kind = 'embargo' THEN E'\n对方在此期间无法签任何新合同。'
                    ELSE E'\n关税按合同金额 ' || s.rate || '% 抽取，其中一半归你、一半损耗蒸发。' END, 'system', v_fy);
  RETURN jsonb_build_object('status','active','until_year',v_until,'years',v_years);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_sanction_counter(p_id bigint, p_kind text, p_rate numeric, p_years integer, p_reason text)\nCREATE OR REPLACE FUNCTION public.wbs_sanction_counter(p_id bigint, p_kind text, p_rate numeric, p_years integer, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE s wbs_sanctions; v_uid text; v_name text; v_fy int; v_res jsonb; v_reason text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT company_name INTO v_name FROM wbs_players WHERE owner_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION '请先完成队伍注册'; END IF;
  SELECT * INTO s FROM wbs_sanctions WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION '制裁记录不存在'; END IF;
  IF s.target_id <> v_uid THEN RAISE EXCEPTION '只有被制裁方可以发起反制'; END IF;
  IF s.status <> 'active' THEN RAISE EXCEPTION '该制裁当前并未生效，无需反制'; END IF;
  SELECT fiscal_year INTO v_fy FROM wbs_game WHERE id = 1;
  IF COALESCE(s.until_year, 0) < v_fy THEN RAISE EXCEPTION '该制裁已到期，无需反制'; END IF;
  v_reason := COALESCE(NULLIF(trim(COALESCE(p_reason,'')),''), '对 ' || s.company_name || ' 实施的' || CASE WHEN s.kind='embargo' THEN '禁运' ELSE '关税壁垒' END || '作出对等反制');
  v_res := wbs_sanction_impose(s.owner_id, p_kind, p_rate, p_years, v_reason, p_id);
  UPDATE wbs_sanctions SET counter_of = p_id WHERE id = (v_res->>'id')::bigint;
  RETURN v_res || jsonb_build_object('counter_of', p_id, 'against', s.company_name);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_sanction_impose(p_target text, p_kind text, p_rate numeric, p_years integer, p_reason text, p_counter_of bigint DEFAULT NULL::bigint)\nCREATE OR REPLACE FUNCTION public.wbs_sanction_impose(p_target text, p_kind text, p_rate numeric, p_years integer, p_reason text, p_counter_of bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_uid text; v_name text; v_role text; t_name text; t_role text; v_fy int; v_phase text;
        v_id bigint; v_until int; v_years int; v_tag text; v_tax int;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT phase, fiscal_year INTO v_phase, v_fy FROM wbs_game WHERE id = 1;
  IF v_phase <> 'open' THEN RAISE EXCEPTION '当前不在交易期，无法发动贸易战'; END IF;
  SELECT company_name, role INTO v_name, v_role FROM wbs_players WHERE owner_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION '请先完成队伍注册'; END IF;
  IF v_role NOT IN ('manufacturer','trader','media') THEN RAISE EXCEPTION '该角色不参与贸易战'; END IF;
  IF NULLIF(p_target,'') IS NULL THEN RAISE EXCEPTION '请选择贸易战对象'; END IF;
  IF p_target = v_uid THEN RAISE EXCEPTION '不能对自己发动贸易战'; END IF;
  SELECT company_name, role INTO t_name, t_role FROM wbs_players WHERE owner_id = p_target;
  IF NOT FOUND THEN RAISE EXCEPTION '对象不存在'; END IF;
  IF t_role NOT IN ('manufacturer','trader','media') THEN RAISE EXCEPTION '不能对政府或裁判发动贸易战'; END IF;
  IF p_kind NOT IN ('tariff','embargo') THEN RAISE EXCEPTION '贸易战类型不合法'; END IF;
  IF p_kind = 'tariff' AND (p_rate IS NULL OR p_rate <= 0 OR p_rate > 100) THEN RAISE EXCEPTION '关税率必须在 0~100 之间'; END IF;
  IF length(COALESCE(p_reason,'')) > 200 THEN RAISE EXCEPTION '理由请控制在 200 字以内'; END IF;
  v_years := COALESCE(p_years, 1);
  IF v_years < 1 OR v_years > 5 THEN RAISE EXCEPTION '制裁持续年限必须在 1~5 之间'; END IF;
  v_until := v_fy + v_years;
  IF EXISTS (SELECT 1 FROM wbs_sanctions WHERE target_id = p_target AND owner_id = v_uid AND kind = p_kind
              AND status IN ('pending','active')) THEN
    RAISE EXCEPTION '你已对该公司提交过同类型的贸易战申请或制裁仍在生效';
  END IF;
  INSERT INTO wbs_sanctions(owner_id, company_name, target_id, target_name, kind, rate, until_year, start_year,
                            reason, status, approve_status, counter_of, fiscal_year)
    VALUES (v_uid, v_name, p_target, t_name, p_kind, COALESCE(p_rate,0), v_until, v_fy,
            NULLIF(trim(COALESCE(p_reason,'')),''), 'pending', 'pending', p_counter_of, v_fy)
    RETURNING id INTO v_id;
  v_tag := CASE WHEN p_counter_of IS NULL THEN '贸易战申请' ELSE '反制申请' END;
  v_tax := CASE WHEN p_kind = 'embargo' THEN 100 ELSE LEAST(60, GREATEST(10, COALESCE(p_rate,0) * 3)) END;
  PERFORM wbs_notify_role('admin', '【待审批】' || v_tag || '：' || v_name || ' → ' || t_name,
    v_name || ' 申请对 ' || t_name || ' 实施' || CASE WHEN p_kind='embargo' THEN '全面禁运' ELSE '关税壁垒（' || p_rate || '%）' END
    || '，拟持续 ' || v_years || ' 个财年（到财年 ' || v_until || '）。'
    || COALESCE(E'\n理由：' || NULLIF(trim(COALESCE(p_reason,'')),''), '')
    || E'\n\n请到「商战与制裁 · 组委会审批台」裁定。批准后制裁立即生效并全场公告；驳回则申请作废。', v_uid);
  PERFORM wbs_notify_role('government', '【待审批】' || v_tag || '：' || v_name || ' → ' || t_name,
    v_name || ' 申请对 ' || t_name || ' 实施' || CASE WHEN p_kind='embargo' THEN '全面禁运' ELSE '关税壁垒（' || p_rate || '%）' END
    || '，拟持续 ' || v_years || ' 个财年。' || COALESCE(E'\n理由：' || NULLIF(trim(COALESCE(p_reason,'')),''), '')
    || E'\n请到「商战与制裁 · 组委会审批台」裁定。', v_uid);
  INSERT INTO wbs_mail(sender_id, sender_name, recipient_id, recipient_name, subject, body, kind, fiscal_year)
    VALUES (v_uid, v_name, p_target, t_name, '【预警】' || v_name || ' 已申请对你实施' || CASE WHEN p_kind='embargo' THEN '禁运' ELSE '关税壁垒' END,
            v_name || ' 已向组委会提交对你的贸易战申请，等待审批。审批通过后即生效；你也可以到「商战与制裁」查看并准备反制。'
            || COALESCE(E'\n对方理由：' || NULLIF(trim(COALESCE(p_reason,'')),''), ''), 'system', v_fy);
  RETURN jsonb_build_object('id', v_id, 'until_year', v_until, 'years', v_years, 'status', 'pending', 'suggest_tax', v_tax);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_sanction_lift(p_id bigint, p_note text)\nCREATE OR REPLACE FUNCTION public.wbs_sanction_lift(p_id bigint, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE s wbs_sanctions; v_uid text; v_name text; v_role text; v_fy int; v_was text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT company_name, role INTO v_name, v_role FROM wbs_players WHERE owner_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION '请先完成队伍注册'; END IF;
  SELECT * INTO s FROM wbs_sanctions WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '制裁记录不存在'; END IF;
  IF s.status NOT IN ('pending','active') THEN RAISE EXCEPTION '该制裁已解除或已作废'; END IF;
  IF v_role NOT IN ('government','admin') AND s.owner_id <> v_uid THEN RAISE EXCEPTION '只有施加方或政府、裁判可以解除'; END IF;
  SELECT fiscal_year INTO v_fy FROM wbs_game WHERE id = 1;
  v_was := s.status;
  IF s.status = 'pending' THEN
    UPDATE wbs_sanctions SET status = 'withdrawn', approve_status = 'withdrawn',
           approve_note = COALESCE(NULLIF(trim(COALESCE(p_note,'')),''), '施加方撤回申请') WHERE id = p_id;
    INSERT INTO wbs_mail(sender_id, sender_name, recipient_id, recipient_name, subject, body, kind, fiscal_year)
      VALUES (v_uid, v_name, s.target_id, s.target_name, '贸易战申请已撤回',
              s.company_name || ' 撤回了一项针对你的贸易战申请，未产生任何效果。', 'system', v_fy);
  ELSE
    UPDATE wbs_sanctions SET status = 'lifted', approve_note = NULLIF(trim(COALESCE(p_note,'')),'') WHERE id = p_id;
    INSERT INTO wbs_news(author, title, body, kind, fiscal_year)
      VALUES ('组委会', '【解除】' || s.company_name || ' 对 ' || s.target_name || ' 的贸易限制已解除',
              '自财年 ' || v_fy || ' 起，' || s.target_name || ' 恢复自由交易。'
              || COALESCE(' 说明：' || NULLIF(trim(COALESCE(p_note,'')),''), ''), 'news', v_fy);
    INSERT INTO wbs_mail(sender_id, sender_name, recipient_id, recipient_name, subject, body, kind, fiscal_year)
      VALUES (v_uid, v_name, s.target_id, s.target_name, '贸易战已解除',
              v_name || ' 已解除对你的贸易限制，你可以正常签署合同了。'
              || COALESCE(E'\n说明：' || NULLIF(trim(COALESCE(p_note,'')),'')), 'system', v_fy);
  END IF;
  RETURN jsonb_build_object('status', CASE WHEN v_was = 'pending' THEN 'withdrawn' ELSE 'lifted' END, 'was', v_was);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_seat(p_owner text)\nCREATE OR REPLACE FUNCTION public.wbs_seat(p_owner text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v text;
BEGIN
  IF p_owner IS NULL THEN RETURN NULL; END IF;
  SELECT seat INTO v FROM wbs_players WHERE owner_id = p_owner;
  IF v IS NULL THEN
    UPDATE wbs_players SET seat = wbs_seat_code(id) WHERE owner_id = p_owner AND seat IS NULL;
    SELECT seat INTO v FROM wbs_players WHERE owner_id = p_owner;
  END IF;
  RETURN v;
END $function$


CREATE OR REPLACE FUNCTION public.wbs_seat_code(p_id bigint)\nCREATE OR REPLACE FUNCTION public.wbs_seat_code(p_id bigint)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT chr((65 + ((p_id - 1) / 10 % 26))::int) || '-' || lpad((((p_id - 1) % 10) + 1)::text, 2, '0')
$function$


CREATE OR REPLACE FUNCTION public.wbs_seat_ensure()\nCREATE OR REPLACE FUNCTION public.wbs_seat_ensure()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  UPDATE wbs_players SET seat = wbs_seat_code(id) WHERE seat IS NULL;
END $function$


CREATE OR REPLACE FUNCTION public.wbs_sell_to_gov(p_pitch_id bigint, p_qty numeric)\nCREATE OR REPLACE FUNCTION public.wbs_sell_to_gov(p_pitch_id bigint, p_qty numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r wbs_pitch;
  v_uid text; v_fy int; v_phase text;
  v_stock numeric; v_left numeric; v_income numeric;
  v_pname text; v_rate numeric := 1; v_cur_name text;
  v_pol record; v_bonus numeric := 0; v_base_g numeric;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT phase, fiscal_year INTO v_phase, v_fy FROM wbs_game WHERE id = 1;
  IF v_phase <> 'open' THEN RAISE EXCEPTION '当前不在交易期，无法交付'; END IF;
  SELECT * INTO r FROM wbs_pitch WHERE id = p_pitch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '该路演不存在'; END IF;
  IF r.owner_id <> v_uid THEN RAISE EXCEPTION '只能对自己的路演交付'; END IF;
  IF r.status <> 'quoted' THEN RAISE EXCEPTION '政府尚未给出报价，或该报价已结束'; END IF;
  IF p_qty IS NULL OR p_qty <= 0 THEN RAISE EXCEPTION '交付数量必须大于 0'; END IF;
  v_left := COALESCE(r.quote_qty, 0) - COALESCE(r.sold_qty, 0);
  IF p_qty > v_left THEN RAISE EXCEPTION '超出政府收购上限，剩余可交付 % 件', v_left; END IF;

  SELECT COALESCE(qty, 0) INTO v_stock FROM wbs_stock WHERE owner_id = v_uid AND kind = 'product' AND item_code = r.product_code;
  IF COALESCE(v_stock, 0) < p_qty THEN RAISE EXCEPTION '库存不足，现有 % 件', COALESCE(v_stock, 0); END IF;

  v_income := round(r.quote_price * p_qty, 2);
  UPDATE wbs_stock SET qty = qty - p_qty WHERE owner_id = v_uid AND kind = 'product' AND item_code = r.product_code;

  IF r.quote_currency = 'A' THEN
    SELECT rate, name INTO v_rate, v_cur_name FROM wbs_fx WHERE currency = 'A';
    UPDATE wbs_players SET cash_a = cash_a + v_income, total_asset = total_asset + v_income * COALESCE(v_rate, 0) WHERE owner_id = v_uid;
  ELSIF r.quote_currency = 'B' THEN
    SELECT rate, name INTO v_rate, v_cur_name FROM wbs_fx WHERE currency = 'B';
    UPDATE wbs_players SET cash_b = cash_b + v_income, total_asset = total_asset + v_income * COALESCE(v_rate, 0) WHERE owner_id = v_uid;
  ELSE
    v_rate := 1; v_cur_name := '金币';
    UPDATE wbs_players SET cash = cash + v_income, total_asset = total_asset + v_income WHERE owner_id = v_uid;
  END IF;

  UPDATE wbs_pitch
     SET sold_qty = sold_qty + p_qty,
         revenue_a = revenue_a + CASE WHEN r.quote_currency = 'A' THEN v_income ELSE 0 END,
         revenue_b = revenue_b + CASE WHEN r.quote_currency = 'B' THEN v_income ELSE 0 END,
         status = CASE WHEN sold_qty + p_qty >= COALESCE(r.quote_qty, 0) THEN 'done' ELSE 'quoted' END,
         updated_at = now()
   WHERE id = p_pitch_id;

  SELECT name INTO v_pname FROM wbs_products WHERE code = r.product_code;
  INSERT INTO wbs_ledger(owner_id, fiscal_year, kind, detail, amount)
    VALUES (v_uid, v_fy, 'gov_sale',
            '对政府交付 ' || COALESCE(v_pname, r.product_code) || ' ×' || p_qty || '（' || COALESCE(v_cur_name, 'G') || ' 结算）',
            round(v_income * COALESCE(v_rate, 1), 2));

  -- 出口奖励：本财年生效的 grant 政策，按交付额一定比例从预算池额外奖励
  v_base_g := round(v_income * COALESCE(v_rate, 1), 2);
  SELECT * INTO v_pol FROM wbs_policies
   WHERE fiscal_year = v_fy AND status = 'active' AND kind = 'grant' AND cost > 0 ORDER BY id LIMIT 1;
  IF FOUND THEN
    v_bonus := LEAST(round(v_base_g * COALESCE(v_pol.rate,0) / 100.0, 2), v_pol.cost);
    IF v_bonus > 0 THEN
      UPDATE wbs_game SET gov_cash = gov_cash - v_bonus, gov_spend = gov_spend + v_bonus, updated_at = now() WHERE id = 1;
      UPDATE wbs_players SET cash = cash + v_bonus, total_asset = total_asset + v_bonus WHERE owner_id = v_uid;
      UPDATE wbs_policies SET cost = GREATEST(0, cost - v_bonus),
             status = CASE WHEN cost - v_bonus <= 0 THEN 'exhausted' ELSE status END
       WHERE id = v_pol.id;
      INSERT INTO wbs_ledger(owner_id, fiscal_year, kind, detail, amount)
        VALUES (v_uid, v_fy, 'grant', '出口奖励（' || v_pol.title || '）', v_bonus);
    END IF;
  END IF;

  RETURN jsonb_build_object('qty', p_qty, 'income', v_income, 'currency', r.quote_currency, 'bonus', v_bonus);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_sell_to_market(p_market text, p_product text, p_qty numeric)\nCREATE OR REPLACE FUNCTION public.wbs_sell_to_market(p_market text, p_product text, p_qty numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_uid text; v_role text; v_phase text; v_fy int;
  d wbs_demand;
  v_rate numeric; v_tariff numeric; v_stock numeric; v_unit numeric; v_income numeric;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT phase, fiscal_year INTO v_phase, v_fy FROM wbs_game WHERE id = 1;
  IF v_phase <> 'open' THEN RAISE EXCEPTION '当前不在交易期，无法销售'; END IF;
  IF p_market NOT IN ('domestic','export') THEN RAISE EXCEPTION '目标市场不合法'; END IF;
  IF p_qty IS NULL OR p_qty <= 0 THEN RAISE EXCEPTION '销售数量必须大于 0'; END IF;
  SELECT role INTO v_role FROM wbs_players WHERE owner_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION '请先完成队伍注册'; END IF;
  IF v_role <> 'trader' THEN RAISE EXCEPTION '只有贸易商可以直接面向消费者市场销售'; END IF;
  SELECT * INTO d FROM wbs_demand WHERE fiscal_year = v_fy AND market = p_market AND product_code = p_product FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '该市场本财年无此商品需求'; END IF;
  IF p_qty > d.demand_left THEN RAISE EXCEPTION '市场需求不足，仅剩 % 件', d.demand_left; END IF;
  SELECT COALESCE(qty, 0) INTO v_stock FROM wbs_stock WHERE owner_id = v_uid AND kind = 'product' AND item_code = p_product;
  IF COALESCE(v_stock, 0) < p_qty THEN RAISE EXCEPTION '成品库存不足，现有 % 件', COALESCE(v_stock, 0); END IF;
  SELECT exchange_rate, tariff_rate INTO v_rate, v_tariff FROM wbs_game WHERE id = 1;
  IF p_market = 'export' THEN
    v_unit := ROUND(d.price * v_rate * (1 - v_tariff), 2);
  ELSE
    v_unit := d.price;
  END IF;
  v_income := v_unit * p_qty;
  UPDATE wbs_demand SET demand_left = demand_left - p_qty WHERE id = d.id;
  UPDATE wbs_stock SET qty = qty - p_qty WHERE owner_id = v_uid AND kind = 'product' AND item_code = p_product;
  UPDATE wbs_players SET cash = cash + v_income WHERE owner_id = v_uid;
  INSERT INTO wbs_ledger(owner_id, fiscal_year, kind, detail, amount)
    VALUES (v_uid, v_fy,
      CASE WHEN p_market = 'export' THEN 'export' ELSE 'domestic' END,
      CASE WHEN p_market = 'export' THEN '出口 ' ELSE '内销 ' END || p_product || ' ×' || p_qty,
      v_income);
  RETURN jsonb_build_object('income', v_income, 'unit', v_unit, 'qty', p_qty);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_send_mail(p_to text, p_subject text, p_body text)\nCREATE OR REPLACE FUNCTION public.wbs_send_mail(p_to text, p_subject text, p_body text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_uid text; v_cname text; v_fy int; v_to_name text; v_id bigint;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT company_name INTO v_cname FROM wbs_players WHERE owner_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION '请先完成队伍注册'; END IF;
  IF p_to IS NULL OR length(trim(p_to)) = 0 THEN RAISE EXCEPTION '请选择收件人'; END IF;
  IF trim(p_to) = v_uid THEN RAISE EXCEPTION '不能给自己发邮件'; END IF;
  SELECT company_name INTO v_to_name FROM wbs_players WHERE owner_id = trim(p_to);
  IF NOT FOUND THEN RAISE EXCEPTION '收件人不存在'; END IF;
  IF p_subject IS NULL OR length(trim(p_subject)) = 0 THEN RAISE EXCEPTION '请填写邮件主题'; END IF;
  IF length(trim(p_subject)) > 40 THEN RAISE EXCEPTION '邮件主题请控制在 40 字以内'; END IF;
  IF length(COALESCE(p_body, '')) > 1000 THEN RAISE EXCEPTION '邮件正文请控制在 1000 字以内'; END IF;
  SELECT fiscal_year INTO v_fy FROM wbs_game WHERE id = 1;

  INSERT INTO wbs_mail(sender_id, sender_name, recipient_id, recipient_name, subject, body, kind, fiscal_year)
    VALUES (v_uid, v_cname, trim(p_to), v_to_name, trim(p_subject), NULLIF(trim(COALESCE(p_body, '')), ''), 'mail', v_fy)
    RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'to', v_to_name);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_set_fx(p_currency text, p_rate numeric)\nCREATE OR REPLACE FUNCTION public.wbs_set_fx(p_currency text, p_rate numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE v_role text; v_name text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT role INTO v_role FROM wbs_players WHERE owner_id = auth.uid();
  IF v_role NOT IN ('admin','government') THEN RAISE EXCEPTION '只有政府或组委会可以调控汇率'; END IF;
  IF p_currency NOT IN ('A','B') THEN RAISE EXCEPTION '该货币不可调控'; END IF;
  IF p_rate IS NULL OR p_rate <= 0 THEN RAISE EXCEPTION '汇率必须大于 0'; END IF;
  IF p_rate > 100 THEN RAISE EXCEPTION '汇率过大，请填 100 以内'; END IF;
  UPDATE wbs_fx SET rate = round(p_rate, 4) WHERE currency = p_currency RETURNING name INTO v_name;
  IF NOT FOUND THEN RAISE EXCEPTION '货币不存在'; END IF;
  INSERT INTO wbs_news(owner_id, author, title, body, kind, fiscal_year)
    SELECT auth.uid(), '政府', '【汇率公告】' || v_name || ' 调整为 ' || round(p_rate,4),
           '1 ' || v_name || ' = ' || round(p_rate,4) || ' 金币', 'news', fiscal_year
      FROM wbs_game WHERE id = 1;
  RETURN jsonb_build_object('currency', p_currency, 'name', v_name, 'rate', round(p_rate,4));
END $function$


CREATE OR REPLACE FUNCTION public.wbs_setting(p_key text, p_def text)\nCREATE OR REPLACE FUNCTION public.wbs_setting(p_key text, p_def text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE((SELECT value FROM wbs_settings WHERE key = p_key), p_def)
$function$


CREATE OR REPLACE FUNCTION public.wbs_setup_profile(p_company text, p_role text, p_judge_code text DEFAULT NULL::text)\nCREATE OR REPLACE FUNCTION public.wbs_setup_profile(p_company text, p_role text, p_judge_code text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r wbs_players;
  v_code text;
  v_gate boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  IF p_company IS NULL OR length(trim(p_company)) = 0 THEN RAISE EXCEPTION '请填写队伍名称'; END IF;
  IF length(trim(p_company)) > 24 THEN RAISE EXCEPTION '队伍名称请控制在 24 字以内'; END IF;
  IF p_role NOT IN ('admin','government','manufacturer','trader','media') THEN RAISE EXCEPTION '角色不合法'; END IF;

  -- 政府与裁判是组委会任命的管理类角色，必须持有管理口令
  v_gate := p_role IN ('admin','government');
  IF v_gate THEN
    SELECT value INTO v_code FROM wbs_settings WHERE key = 'judge_code';
    IF v_code IS NULL OR length(v_code) = 0 THEN
      RAISE EXCEPTION '组委会尚未设置管理口令，请联系裁判';
    END IF;
    IF trim(coalesce(p_judge_code, '')) = '' THEN
      RAISE EXCEPTION '注册「政府 / 裁判」需要填写管理口令';
    END IF;
    IF trim(p_judge_code) <> v_code THEN
      RAISE EXCEPTION '管理口令不正确';
    END IF;
  END IF;

  -- 公司名唯一，否则合同 / 名录 / 邮件里会出现两个同名对手方
  IF EXISTS (
    SELECT 1 FROM wbs_players
     WHERE company_name = trim(p_company) AND owner_id <> auth.uid()
  ) THEN
    RAISE EXCEPTION '已经有一支队伍叫这个名字了，换一个吧';
  END IF;

  INSERT INTO wbs_players(owner_id, company_name, role)
  VALUES (auth.uid(), trim(p_company), p_role)
  ON CONFLICT (owner_id) DO UPDATE
    SET company_name = EXCLUDED.company_name, role = EXCLUDED.role
  RETURNING * INTO r;
  RETURN to_jsonb(r);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_short_close(p_id bigint)\nCREATE OR REPLACE FUNCTION public.wbs_short_close(p_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid text; v_fy int; v_spot numeric; v_pay numeric; v_pnl numeric; v_cash numeric; v_s wbs_shorts;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT fiscal_year INTO v_fy FROM wbs_game WHERE id = 1;
  IF v_fy IS NULL THEN v_fy := 0; END IF;
  SELECT cash INTO v_cash FROM wbs_players WHERE owner_id = v_uid FOR UPDATE;
  IF v_cash IS NULL THEN RAISE EXCEPTION '请先完成队伍注册'; END IF;

  SELECT * INTO v_s FROM wbs_shorts WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '头寸不存在'; END IF;
  IF v_s.owner_id <> v_uid THEN RAISE EXCEPTION '只能平自己的仓'; END IF;
  IF v_s.status <> 'open' THEN RAISE EXCEPTION '该头寸已结束'; END IF;

  v_spot := wbs_qprice(v_s.code);
  IF v_spot <= 0 THEN RAISE EXCEPTION '该品种暂无报价，无法平仓'; END IF;
  v_pay := round(v_s.qty * v_spot - v_s.margin, 2);
  IF v_cash < v_pay THEN
    RAISE EXCEPTION '现金不足以买回平仓：按现价 % G 买回需支付 % G', v_spot, v_pay;
  END IF;
  v_pnl := round((v_s.entry - v_spot) * v_s.qty, 2);

  UPDATE wbs_players SET cash = cash - v_pay WHERE owner_id = v_uid;
  UPDATE wbs_shorts SET status = 'closed', pnl = v_pnl, closed_at = now() WHERE id = p_id;

  INSERT INTO wbs_ledger(owner_id, fiscal_year, kind, detail, amount)
    VALUES (v_uid, v_fy, 'short_close',
      '做空平仓：按 ' || v_spot || ' G 买回 ' || v_s.name || ' ×' || v_s.qty || '（开仓价 ' || v_s.entry || ' G），盈亏 ' || v_pnl || ' G',
      -v_pay);

  RETURN jsonb_build_object('id', p_id, 'pnl', v_pnl, 'spot', v_spot, 'entry', v_s.entry, 'name', v_s.name);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_short_open(p_code text, p_qty numeric)\nCREATE OR REPLACE FUNCTION public.wbs_short_open(p_code text, p_qty numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid text; v_name text; v_fy int; v_phase text; v_qty numeric;
  v_spot numeric; v_notional numeric; v_margin numeric; v_cash numeric; v_qname text; v_kind text; v_id bigint;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  v_qty := round(COALESCE(p_qty, 0), 0);
  IF v_qty <= 0 THEN RAISE EXCEPTION '做空数量必须大于 0'; END IF;

  SELECT phase, fiscal_year INTO v_phase, v_fy FROM wbs_game WHERE id = 1;
  IF v_phase IS DISTINCT FROM 'open' THEN RAISE EXCEPTION '当前不在交易期，无法开仓'; END IF;
  SELECT company_name, cash INTO v_name, v_cash FROM wbs_players WHERE owner_id = v_uid;
  IF v_name IS NULL THEN RAISE EXCEPTION '请先完成队伍注册'; END IF;

  SELECT name, kind INTO v_qname, v_kind FROM wbs_quotes_live WHERE code = p_code;
  IF v_qname IS NULL THEN RAISE EXCEPTION '行情里没有这个品种'; END IF;
  IF v_kind = 'fx' THEN RAISE EXCEPTION '外汇不能做空'; END IF;

  v_spot := wbs_qprice(p_code);
  IF v_spot <= 0 THEN RAISE EXCEPTION '该品种暂无报价'; END IF;
  v_notional := round(v_qty * v_spot, 2);
  v_margin := round(v_notional * 0.30, 2);
  IF v_cash < v_margin * 2 THEN
    RAISE EXCEPTION '开仓后必须保留至少等同保证金的缓冲，你需要 % 金币（保证金 % G × 2）', round(v_margin * 2, 2), v_margin;
  END IF;

  UPDATE wbs_players SET cash = cash + v_notional - v_margin WHERE owner_id = v_uid;
  INSERT INTO wbs_shorts(owner_id, company_name, code, name, qty, entry, margin)
    VALUES (v_uid, v_name, p_code, v_qname, v_qty, v_spot, v_margin)
    RETURNING id INTO v_id;

  INSERT INTO wbs_ledger(owner_id, fiscal_year, kind, detail, amount)
    VALUES (v_uid, v_fy, 'short_open',
      '做空开仓：借入 ' || v_qname || ' ×' || v_qty || ' 按现价 ' || v_spot || ' G 卖出，冻结保证金 ' || v_margin || ' G',
      round(v_notional - v_margin, 2));

  RETURN jsonb_build_object('id', v_id, 'name', v_qname, 'qty', v_qty, 'entry', v_spot,
    'margin', v_margin, 'proceeds', round(v_notional - v_margin, 2));
END $function$


CREATE OR REPLACE FUNCTION public.wbs_shorts_sweep()\nCREATE OR REPLACE FUNCTION public.wbs_shorts_sweep()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid text; v_fy int; r record; v_spot numeric; v_pay numeric; v_pnl numeric; n int := 0;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT fiscal_year INTO v_fy FROM wbs_game WHERE id = 1;
  IF v_fy IS NULL THEN v_fy := 1; END IF;

  FOR r IN SELECT * FROM wbs_shorts WHERE status = 'open' FOR UPDATE
  LOOP
    v_spot := wbs_qprice(r.code);
    IF v_spot <= 0 THEN CONTINUE; END IF;
    -- 亏损达到保证金的 80% 即强制平仓
    IF round((v_spot - r.entry) * r.qty, 2) >= round(r.margin * 0.8, 2) THEN
      v_pay := round(r.qty * v_spot - r.margin, 2);
      v_pnl := round((r.entry - v_spot) * r.qty, 2);
      UPDATE wbs_players SET cash = GREATEST(0, cash - v_pay) WHERE owner_id = r.owner_id;
      UPDATE wbs_shorts SET status = 'liquidated', pnl = v_pnl, closed_at = now() WHERE id = r.id;
      INSERT INTO wbs_ledger(owner_id, fiscal_year, kind, detail, amount)
        VALUES (r.owner_id, v_fy, 'short_liq',
          '做空被强制平仓：' || r.name || ' ×' || r.qty || ' 现价涨到 ' || v_spot || ' G（开仓 ' || r.entry || ' G），亏损 ' || v_pnl || ' G',
          -v_pay);
      n := n + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('count', n);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_spot_cancel(p_id bigint)\nCREATE OR REPLACE FUNCTION public.wbs_spot_cancel(p_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid text; v_fy int; v_left numeric; v_refund numeric := 0; v_o wbs_spot;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT fiscal_year INTO v_fy FROM wbs_game WHERE id = 1;
  IF v_fy IS NULL THEN v_fy := 0; END IF;

  SELECT * INTO v_o FROM wbs_spot WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '该挂单不存在'; END IF;
  IF v_o.owner_id <> v_uid THEN RAISE EXCEPTION '只能撤销自己的挂单'; END IF;
  IF v_o.status <> 'open' THEN RAISE EXCEPTION '该挂单已结束，无法撤销'; END IF;

  v_left := v_o.qty - v_o.filled;
  UPDATE wbs_spot SET status = 'cancelled' WHERE id = p_id;

  IF v_left > 0 THEN
    IF v_o.side = 'sell' THEN
      INSERT INTO wbs_stock(owner_id, kind, item_code, qty) VALUES (v_uid, v_o.kind, v_o.item_code, v_left)
        ON CONFLICT (owner_id, kind, item_code) DO UPDATE SET qty = wbs_stock.qty + EXCLUDED.qty;
    ELSE
      v_refund := round(v_left * v_o.price, 2);
      UPDATE wbs_players SET cash = cash + v_refund WHERE owner_id = v_uid;
    END IF;
    INSERT INTO wbs_ledger(owner_id, fiscal_year, kind, detail, amount)
      VALUES (v_uid, v_fy, 'spot_refund',
        '撤销场外挂单，退回 ' || wbs_item_name(v_o.kind, v_o.item_code) || ' ×' || v_left || '（折算 ' || round(v_left * v_o.price, 2) || ' G）',
        v_refund);
  END IF;

  RETURN jsonb_build_object('ok', true, 'refund', v_refund, 'qty', v_left);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_spot_fill(p_id bigint, p_qty numeric)\nCREATE OR REPLACE FUNCTION public.wbs_spot_fill(p_id bigint, p_qty numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid text; v_name text; v_fy int; v_cash numeric; v_amt numeric;
  v_total numeric; v_left numeric; v_have numeric; v_o wbs_spot;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT fiscal_year INTO v_fy FROM wbs_game WHERE id = 1;
  IF v_fy IS NULL THEN v_fy := 0; END IF;
  SELECT company_name, cash INTO v_name, v_cash FROM wbs_players WHERE owner_id = v_uid;
  IF v_name IS NULL THEN RAISE EXCEPTION '请先完成队伍注册'; END IF;

  SELECT * INTO v_o FROM wbs_spot WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '该挂单不存在'; END IF;
  IF v_o.status <> 'open' THEN RAISE EXCEPTION '该挂单已不可成交'; END IF;
  IF v_o.owner_id = v_uid THEN RAISE EXCEPTION '不能吃自己的挂单'; END IF;

  v_left := v_o.qty - v_o.filled;
  v_amt := round(COALESCE(p_qty, 0), 0);
  IF v_amt <= 0 THEN RAISE EXCEPTION '数量必须大于 0'; END IF;
  IF v_amt > v_left THEN RAISE EXCEPTION '只剩 % 单位可成交', v_left; END IF;
  v_total := round(v_amt * v_o.price, 2);

  IF v_o.side = 'sell' THEN
    IF v_cash < v_total THEN RAISE EXCEPTION '现金不足，需要 % 金币', v_total; END IF;
    UPDATE wbs_players SET cash = cash - v_total WHERE owner_id = v_uid;
    UPDATE wbs_players SET cash = cash + v_total WHERE owner_id = v_o.owner_id;
    INSERT INTO wbs_stock(owner_id, kind, item_code, qty) VALUES (v_uid, v_o.kind, v_o.item_code, v_amt)
      ON CONFLICT (owner_id, kind, item_code) DO UPDATE SET qty = wbs_stock.qty + EXCLUDED.qty;
  ELSE
    SELECT qty INTO v_have FROM wbs_stock WHERE owner_id = v_uid AND kind = v_o.kind AND item_code = v_o.item_code FOR UPDATE;
    IF COALESCE(v_have, 0) < v_amt THEN RAISE EXCEPTION '库存不足，你只有 % 单位', COALESCE(v_have, 0); END IF;
    UPDATE wbs_stock SET qty = qty - v_amt WHERE owner_id = v_uid AND kind = v_o.kind AND item_code = v_o.item_code;
    UPDATE wbs_players SET cash = cash + v_total WHERE owner_id = v_uid;
    INSERT INTO wbs_stock(owner_id, kind, item_code, qty) VALUES (v_o.owner_id, v_o.kind, v_o.item_code, v_amt)
      ON CONFLICT (owner_id, kind, item_code) DO UPDATE SET qty = wbs_stock.qty + EXCLUDED.qty;
  END IF;

  UPDATE wbs_spot SET filled = filled + v_amt,
         status = CASE WHEN filled + v_amt >= qty THEN 'done' ELSE 'open' END
   WHERE id = p_id;

  INSERT INTO wbs_ledger(owner_id, fiscal_year, kind, detail, amount) VALUES
    (v_uid, v_fy, 'spot_trade',
      CASE v_o.side WHEN 'sell'
        THEN '场外买入 ' || wbs_item_name(v_o.kind, v_o.item_code) || ' ×' || v_amt || '（' || v_o.price || ' G，来自 ' || v_o.company_name || '）'
        ELSE '场外卖出 ' || wbs_item_name(v_o.kind, v_o.item_code) || ' ×' || v_amt || '（' || v_o.price || ' G，卖给 ' || v_o.company_name || '）' END,
      CASE v_o.side WHEN 'sell' THEN -v_total ELSE v_total END),
    (v_o.owner_id, v_fy, 'spot_trade',
      CASE v_o.side WHEN 'sell'
        THEN '场外卖出 ' || wbs_item_name(v_o.kind, v_o.item_code) || ' ×' || v_amt || '（' || v_o.price || ' G，买家 ' || v_name || '）'
        ELSE '场外买入 ' || wbs_item_name(v_o.kind, v_o.item_code) || ' ×' || v_amt || '（' || v_o.price || ' G，卖家 ' || v_name || '）' END,
      CASE v_o.side WHEN 'sell' THEN v_total ELSE 0 END);

  RETURN jsonb_build_object('id', p_id, 'qty', v_amt, 'total', v_total, 'side', v_o.side,
    'name', wbs_item_name(v_o.kind, v_o.item_code), 'price', v_o.price);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_spot_post(p_kind text, p_code text, p_side text, p_qty numeric, p_price numeric)\nCREATE OR REPLACE FUNCTION public.wbs_spot_post(p_kind text, p_code text, p_side text, p_qty numeric, p_price numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid text; v_name text; v_fy int; v_phase text;
  v_qty numeric; v_price numeric; v_cash numeric; v_have numeric; v_cost numeric; v_id bigint; v_ok int;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  IF p_kind NOT IN ('material','product') THEN RAISE EXCEPTION '只能挂原材料或成品'; END IF;
  IF p_side NOT IN ('buy','sell') THEN RAISE EXCEPTION '方向只能是买入或卖出'; END IF;
  v_qty := round(COALESCE(p_qty, 0), 0);
  v_price := round(COALESCE(p_price, 0), 2);
  IF v_qty <= 0 THEN RAISE EXCEPTION '数量必须大于 0'; END IF;
  IF v_price <= 0 THEN RAISE EXCEPTION '报价必须大于 0'; END IF;

  SELECT phase, fiscal_year INTO v_phase, v_fy FROM wbs_game WHERE id = 1;
  IF v_phase IS DISTINCT FROM 'open' THEN RAISE EXCEPTION '当前不在交易期，无法挂单'; END IF;
  SELECT company_name, cash INTO v_name, v_cash FROM wbs_players WHERE owner_id = v_uid FOR UPDATE;
  IF v_name IS NULL THEN RAISE EXCEPTION '请先完成队伍注册'; END IF;

  IF p_kind = 'material' THEN
    SELECT count(*) INTO v_ok FROM wbs_materials WHERE code = p_code;
  ELSE
    SELECT count(*) INTO v_ok FROM wbs_products WHERE code = p_code;
  END IF;
  IF v_ok = 0 THEN RAISE EXCEPTION '标的不存在'; END IF;

  IF p_side = 'sell' THEN
    SELECT qty INTO v_have FROM wbs_stock WHERE owner_id = v_uid AND kind = p_kind AND item_code = p_code FOR UPDATE;
    IF COALESCE(v_have, 0) < v_qty THEN RAISE EXCEPTION '库存不足，你只有 % 单位', COALESCE(v_have, 0); END IF;
    UPDATE wbs_stock SET qty = qty - v_qty WHERE owner_id = v_uid AND kind = p_kind AND item_code = p_code;
  ELSE
    v_cost := round(v_qty * v_price, 2);
    IF v_cash < v_cost THEN RAISE EXCEPTION '现金不足，需要冻结 % 金币', v_cost; END IF;
    UPDATE wbs_players SET cash = cash - v_cost WHERE owner_id = v_uid;
  END IF;

  INSERT INTO wbs_spot(owner_id, company_name, kind, item_code, side, qty, price, fiscal_year)
    VALUES (v_uid, v_name, p_kind, p_code, p_side, v_qty, v_price, v_fy)
    RETURNING id INTO v_id;

  INSERT INTO wbs_ledger(owner_id, fiscal_year, kind, detail, amount)
    VALUES (v_uid, v_fy, 'spot_escrow',
      CASE p_side WHEN 'sell'
        THEN '场外挂单：托管 ' || wbs_item_name(p_kind, p_code) || ' ×' || v_qty || '（报价 ' || v_price || ' G）'
        ELSE '场外挂单：冻结 ' || round(v_qty * v_price, 2) || ' G 求购 ' || wbs_item_name(p_kind, p_code) || ' ×' || v_qty END,
      CASE p_side WHEN 'sell' THEN 0 ELSE -round(v_qty * v_price, 2) END);

  RETURN jsonb_build_object('id', v_id, 'qty', v_qty, 'price', v_price, 'side', p_side,
    'name', wbs_item_name(p_kind, p_code));
END $function$


CREATE OR REPLACE FUNCTION public.wbs_submit_rd(p_name text, p_desc text, p_recipe jsonb, p_qty integer, p_sec numeric DEFAULT 1.2, p_expect integer DEFAULT NULL::integer)\nCREATE OR REPLACE FUNCTION public.wbs_submit_rd(p_name text, p_desc text, p_recipe jsonb, p_qty integer, p_sec numeric DEFAULT 1.2, p_expect integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_uid text; v_cname text; v_role text; v_fy int; v_phase text;
  k text; v_have numeric; v_matname text; v_matprice numeric;
  v_cost numeric := 0; v_id bigint; v_msg text;
  v_smin numeric; v_smax numeric; v_sec numeric;
  v_default int; v_expect int;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT phase, fiscal_year INTO v_phase, v_fy FROM wbs_game WHERE id = 1;
  IF v_phase <> 'open' THEN RAISE EXCEPTION '当前不在交易期，无法提交研发'; END IF;
  SELECT company_name, role INTO v_cname, v_role FROM wbs_players WHERE owner_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION '请先完成队伍注册'; END IF;
  IF v_role <> 'manufacturer' THEN RAISE EXCEPTION '只有制造商可以研发新产品'; END IF;
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN RAISE EXCEPTION '请填写产品名称'; END IF;
  IF length(trim(p_name)) > 20 THEN RAISE EXCEPTION '产品名称请控制在 20 字以内'; END IF;
  IF p_recipe IS NULL OR jsonb_typeof(p_recipe) <> 'object' THEN RAISE EXCEPTION '请选择配方材料'; END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(p_recipe)) = 0 THEN RAISE EXCEPTION '配方至少要选一种材料'; END IF;
  IF p_qty IS NULL OR p_qty <= 0 THEN RAISE EXCEPTION '试产数量必须大于 0'; END IF;
  IF p_qty > 999 THEN RAISE EXCEPTION '试产数量请控制在 999 以内'; END IF;

  SELECT COALESCE(MAX(value::numeric) FILTER (WHERE key = 'rd_sec_min'), 0.2),
         COALESCE(MAX(value::numeric) FILTER (WHERE key = 'rd_sec_max'), 60)
    INTO v_smin, v_smax FROM wbs_settings WHERE key IN ('rd_sec_min','rd_sec_max');
  IF p_sec IS NULL THEN RAISE EXCEPTION '请填写预计单件生产工时（秒）'; END IF;
  IF p_sec < v_smin OR p_sec > v_smax THEN
    RAISE EXCEPTION '预计单件工时需在 % ~ % 秒之间（工序越长，量产越慢）', v_smin, v_smax;
  END IF;
  v_sec := round(p_sec, 2);

  -- 「预期可产」= 这款产品将来单笔最多能投产几件。留空则沿用全场默认值。
  SELECT COALESCE(MAX(value::int) FILTER (WHERE key = 'produce_max_qty'), 50) INTO v_default
    FROM wbs_settings WHERE key = 'produce_max_qty';
  v_default := COALESCE(v_default, 50);
  v_expect := COALESCE(p_expect, v_default);
  IF v_expect < 1 OR v_expect > 999 THEN RAISE EXCEPTION '预期可产需在 1 ~ 999 件之间'; END IF;

  FOR k IN SELECT jsonb_object_keys(p_recipe) LOOP
    IF (p_recipe ->> k)::numeric <= 0 THEN RAISE EXCEPTION '每种材料的用量必须大于 0'; END IF;
    IF (p_recipe ->> k)::numeric <> round((p_recipe ->> k)::numeric) THEN RAISE EXCEPTION '材料用量请填整数'; END IF;
    SELECT name, price INTO v_matname, v_matprice FROM wbs_materials WHERE code = k;
    IF NOT FOUND THEN RAISE EXCEPTION '材料不存在：%', k; END IF;
    SELECT COALESCE(qty, 0) INTO v_have FROM wbs_stock WHERE owner_id = v_uid AND kind = 'material' AND item_code = k;
    IF COALESCE(v_have, 0) <= 0 THEN RAISE EXCEPTION '库存里没有「%」，不能写进配方', v_matname; END IF;
    v_cost := v_cost + v_matprice * (p_recipe ->> k)::numeric;
  END LOOP;

  IF EXISTS (SELECT 1 FROM wbs_rd WHERE owner_id = v_uid AND product_name = trim(p_name) AND status IN ('pending','approved')) THEN
    RAISE EXCEPTION '你已经有一个同名产品了，换个名字吧';
  END IF;

  INSERT INTO wbs_rd(owner_id, company_name, fiscal_year, product_name, product_desc, recipe, unit_cost, apply_qty, plan_seconds, expect_qty, status)
    VALUES (v_uid, v_cname, v_fy, trim(p_name), NULLIF(trim(p_desc), ''), p_recipe, v_cost, p_qty, v_sec, v_expect, 'pending')
    RETURNING id INTO v_id;

  v_msg := v_cname || ' 提交了研发申请「' || trim(p_name) || '」（单件成本 ' || v_cost || ' G，单件工时 ' || v_sec
        || ' 秒，试产 ' || p_qty || ' 件约需 ' || GREATEST(8, round(8 + v_sec * p_qty)) || ' 秒，预期可产 ' || v_expect || ' 件），等待审批。';
  PERFORM wbs_notify_role('government', '研发申请待审批：' || trim(p_name), v_msg, NULL);
  PERFORM wbs_notify_role('admin', '研发申请待审批：' || trim(p_name), v_msg, NULL);

  RETURN jsonb_build_object('id', v_id, 'unit_cost', v_cost, 'plan_seconds', v_sec, 'expect_qty', v_expect);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_ticks_get(p_code text, p_limit integer DEFAULT 300)\nCREATE OR REPLACE FUNCTION public.wbs_ticks_get(p_code text, p_limit integer DEFAULT 300)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE(jsonb_agg(x ORDER BY tk), '[]'::jsonb) FROM (
    SELECT tk, jsonb_build_object('tick', tk, 'price', px, 'volume', vol) AS x FROM (
      SELECT tick AS tk, price AS px, COALESCE(volume, 0) AS vol
        FROM wbs_ticks WHERE code = p_code
       ORDER BY tick DESC LIMIT GREATEST(10, LEAST(900, p_limit))
    ) z
  ) s
$function$


CREATE OR REPLACE FUNCTION public.wbs_war_advance(p_id bigint, p_all boolean DEFAULT false)\nCREATE OR REPLACE FUNCTION public.wbs_war_advance(p_id bigint, p_all boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  w wbs_wars; v_uid text; v_name text; v_role text; v_fy int;
  v_ar numeric; v_dr numeric; v_ac numeric; v_dc numeric; v_n numeric;
  v_sa numeric; v_sd numeric; v_r int; v_log jsonb; v_hit text;
  v_need numeric; v_take numeric := 0; v_loot text := ''; v_cash numeric; v_result text;
  v_at numeric; v_dt numeric; v_shock numeric; v_shock_tot numeric; v_rtxt text;
  r record;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT company_name, role INTO v_name, v_role FROM wbs_players WHERE owner_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION '请先完成队伍注册'; END IF;
  SELECT fiscal_year INTO v_fy FROM wbs_game WHERE id = 1;
  SELECT * INTO w FROM wbs_wars WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '战争记录不存在'; END IF;
  IF w.status <> 'fighting' THEN RAISE EXCEPTION '该战争当前不在交战中'; END IF;
  IF v_role NOT IN ('government','admin') AND v_uid <> w.attacker_id AND v_uid <> w.defender_id THEN
    RAISE EXCEPTION '只有交战双方或组委会可以推进战事';
  END IF;

  v_at := COALESCE(w.stake,0) + COALESCE(w.attacker_supply,0) + COALESCE(w.aid_attacker,0);
  v_dt := COALESCE(w.defender_stake,0) + COALESCE(w.defender_supply,0) + COALESCE(w.aid_defender,0);
  v_ar := floor(v_at / GREATEST(w.rounds,1));
  v_dr := floor(v_dt / GREATEST(w.rounds,1));
  v_sa := COALESCE(w.attacker_spent, 0);
  v_sd := COALESCE(w.defender_spent, 0);
  v_r  := COALESCE(w.round, 0);
  v_log := COALESCE(w.round_log, '[]'::jsonb);
  v_shock := COALESCE(NULLIF(wbs_setting('war_shock_pct','2.5'),'')::numeric, 2.5);
  v_shock_tot := COALESCE(w.war_shock, 0);

  WHILE v_r < w.rounds LOOP
    v_r := v_r + 1;
    IF v_r = w.rounds THEN
      v_ac := v_at - v_sa;
      v_dc := v_dt - v_sd;
    ELSE
      v_ac := v_ar; v_dc := v_dr;
    END IF;
    IF v_ac < 0 THEN v_ac := 0; END IF;
    IF v_dc < 0 THEN v_dc := 0; END IF;
    v_sa := v_sa + v_ac;
    v_sd := v_sd + v_dc;
    v_log := v_log || jsonb_build_object('r', v_r, 'a', v_ac, 'd', v_dc);
    PERFORM wbs_war_market_shock(v_shock, '战事冲击：第 ' || v_r || ' 轮');
    v_shock_tot := v_shock_tot + v_shock;
    EXIT WHEN NOT p_all;
  END LOOP;

  UPDATE wbs_wars SET round = v_r, attacker_spent = v_sa, defender_spent = v_sd,
         round_log = v_log, war_shock = v_shock_tot WHERE id = p_id;

  IF v_r < w.rounds THEN
    RETURN jsonb_build_object('settled', false, 'status', 'fighting', 'round', v_r, 'rounds', w.rounds,
                              'attacker_spent', v_sa, 'defender_spent', v_sd,
                              'attacker_power', v_at, 'defender_power', v_dt, 'shock', v_shock_tot);
  END IF;

  IF v_shock_tot > 0 THEN
    PERFORM wbs_war_market_shock(-round(v_shock_tot * 0.6, 2), '战事结束：军工溢价回落');
  END IF;

  v_rtxt := '攻方战力 ' || v_at || ' G vs 守方战力 ' || v_dt || ' G';

  IF v_dt >= v_at THEN
    v_result := 'draw';
    UPDATE wbs_wars SET status = 'settled', result = 'draw',
           attacker_loss = v_sa, defender_loss = v_sd, loot_cash = 0,
           loot_note = '交战 ' || w.rounds || ' 轮：' || v_rtxt || '，势均力敌，打成平手'
     WHERE id = p_id;
    INSERT INTO wbs_mail(sender_id, sender_name, recipient_id, recipient_name, subject, body, kind, fiscal_year)
      VALUES (NULL, '系统通知', w.attacker_id, w.attacker_name, '【战报】与 ' || w.defender_name || ' 打成平手',
              '经过 ' || w.rounds || ' 轮对耗，' || v_rtxt || '，无人获益，信用分不变。', 'system', v_fy);
    INSERT INTO wbs_mail(sender_id, sender_name, recipient_id, recipient_name, subject, body, kind, fiscal_year)
      VALUES (NULL, '系统通知', w.defender_id, w.defender_name, '【战报】成功抵御 ' || w.attacker_name || '，打成平手',
              '经过 ' || w.rounds || ' 轮对耗，' || v_rtxt || '，打成平手，信用分不变。', 'system', v_fy);
  ELSE
    v_result := 'attacker_win';
    v_need := ceil((v_at - v_dt) * 1.2);
    SELECT cash INTO v_cash FROM wbs_players WHERE owner_id = w.defender_id FOR UPDATE;
    v_take := LEAST(v_need, GREATEST(COALESCE(v_cash,0), 0));
    IF v_take > 0 THEN
      UPDATE wbs_players SET cash = cash - v_take WHERE owner_id = w.defender_id;
      UPDATE wbs_players SET cash = cash + v_take WHERE owner_id = w.attacker_id;
      v_need := v_need - v_take;
      INSERT INTO wbs_ledger(owner_id, fiscal_year, kind, detail, amount)
        VALUES (w.defender_id, v_fy, 'war_cost', '战败赔偿给 ' || w.attacker_name, -v_take);
      INSERT INTO wbs_ledger(owner_id, fiscal_year, kind, detail, amount)
        VALUES (w.attacker_id, v_fy, 'war_loot', '战胜 ' || w.defender_name || ' 所得战争赔偿', v_take);
    END IF;
    IF v_need > 0 THEN
      FOR r IN
        SELECT z.kind, z.item_code, z.qty, z.unit FROM (
          SELECT s.kind, s.item_code, s.qty,
                 CASE WHEN s.kind = 'material' THEN (SELECT price FROM wbs_materials WHERE code = s.item_code)
                      ELSE COALESCE((SELECT SUM((pr.recipe->>k)::numeric * m.price) FROM jsonb_object_keys(pr.recipe) AS k JOIN wbs_materials m ON m.code = k), 0) END AS unit
            FROM wbs_stock s LEFT JOIN wbs_products pr ON pr.code = s.item_code
           WHERE s.owner_id = w.defender_id AND s.qty > 0 AND s.kind IN ('material','product')
        ) z WHERE z.unit > 0 ORDER BY z.kind DESC, z.item_code
      LOOP
        EXIT WHEN v_need <= 0;
        CONTINUE WHEN COALESCE(r.unit, 0) <= 0;
        v_n := LEAST(floor(v_need / r.unit), r.qty);
        CONTINUE WHEN v_n <= 0;
        UPDATE wbs_stock SET qty = qty - v_n WHERE owner_id = w.defender_id AND kind = r.kind AND item_code = r.item_code;
        INSERT INTO wbs_stock(owner_id, kind, item_code, qty) VALUES (w.attacker_id, r.kind, r.item_code, v_n)
          ON CONFLICT (owner_id, kind, item_code) DO UPDATE SET qty = wbs_stock.qty + EXCLUDED.qty;
        v_need := v_need - v_n * r.unit;
        v_loot := v_loot || CASE WHEN r.kind = 'material' THEN '原料' ELSE '成品' END || ' ' || r.item_code || '×' || v_n || ' ';
      END LOOP;
    END IF;
    UPDATE wbs_players SET credit_score = LEAST(200, COALESCE(credit_score,100) + 8) WHERE owner_id = w.attacker_id;
    UPDATE wbs_players SET credit_score = GREATEST(0, COALESCE(credit_score,100) - 12) WHERE owner_id = w.defender_id;
    v_hit := '战力差 ' || (v_at - v_dt) || ' G × 1.2 倍索赔 = ' || ceil((v_at - v_dt) * 1.2)
             || ' G；现金赔偿 ' || v_take || ' G' || CASE WHEN length(v_loot) > 0 THEN '；实物折抵 ' || v_loot ELSE '' END;
    UPDATE wbs_wars SET status = 'settled', result = 'attacker_win',
           attacker_loss = v_sa, defender_loss = v_sd + v_take,
           loot_cash = v_take, loot_note = v_hit
     WHERE id = p_id;
    INSERT INTO wbs_mail(sender_id, sender_name, recipient_id, recipient_name, subject, body, kind, fiscal_year)
      VALUES (NULL, '系统通知', w.attacker_id, w.attacker_name, '【战报】你战胜了 ' || w.defender_name,
              '经过 ' || w.rounds || ' 轮对耗，' || v_rtxt || '。'
              || chr(10) || v_hit || chr(10) || '信用分 +8。', 'system', v_fy);
    INSERT INTO wbs_mail(sender_id, sender_name, recipient_id, recipient_name, subject, body, kind, fiscal_year)
      VALUES (NULL, '系统通知', w.defender_id, w.defender_name, '【战报】你败给了 ' || w.attacker_name,
              v_rtxt || '，你不足以与对方展开 1:1 对耗。'
              || chr(10) || v_hit || chr(10) || '信用分 -12。', 'system', v_fy);
  END IF;

  RETURN jsonb_build_object('settled', true, 'status', 'settled', 'result', v_result,
                            'rounds', w.rounds, 'loot_cash', v_take,
                            'attacker_spent', v_sa, 'defender_spent', v_sd,
                            'attacker_power', v_at, 'defender_power', v_dt);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_war_approve(p_id bigint, p_approve boolean, p_note text)\nCREATE OR REPLACE FUNCTION public.wbs_war_approve(p_id bigint, p_approve boolean, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE w wbs_wars; v_uid text; v_name text; v_role text; v_fy int; v_cash numeric; v_tax numeric; v_note text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT company_name, role INTO v_name, v_role FROM wbs_players WHERE owner_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION '请先完成队伍注册'; END IF;
  IF v_role NOT IN ('government','admin') THEN RAISE EXCEPTION '只有组委会（政府 / 裁判）可以审批战争申请'; END IF;
  SELECT * INTO w FROM wbs_wars WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '战争记录不存在'; END IF;
  IF w.status <> 'pending' THEN RAISE EXCEPTION '该申请已处理完毕'; END IF;
  SELECT fiscal_year INTO v_fy FROM wbs_game WHERE id = 1;
  v_note := NULLIF(trim(COALESCE(p_note,'')),'');

  IF NOT p_approve THEN
    UPDATE wbs_wars SET status = 'rejected', approve_status = 'rejected', approved_by = v_name,
           approve_note = COALESCE(v_note, '组委会驳回，理由未填写') WHERE id = p_id;
    INSERT INTO wbs_mail(sender_id, sender_name, recipient_id, recipient_name, subject, body, kind, fiscal_year)
      VALUES (v_uid, v_name, w.attacker_id, w.attacker_name, '【驳回】向 ' || w.defender_name || ' 的宣战申请未获批准',
              '组委会驳回了你对 ' || w.defender_name || ' 的宣战申请，未扣除任何费用。' || COALESCE(E'\n裁定说明：' || v_note, ''), 'system', v_fy);
    RETURN jsonb_build_object('status','rejected','note', v_note);
  END IF;

  v_tax := ceil(w.stake * 0.1);
  SELECT cash INTO v_cash FROM wbs_players WHERE owner_id = w.attacker_id FOR UPDATE;
  IF COALESCE(v_cash,0) < w.stake + v_tax THEN
    UPDATE wbs_wars SET status = 'rejected', approve_status = 'rejected', approved_by = v_name,
           approve_note = '宣战方现金不足，申请自动作废' WHERE id = p_id;
    INSERT INTO wbs_mail(sender_id, sender_name, recipient_id, recipient_name, subject, body, kind, fiscal_year)
      VALUES (v_uid, v_name, w.attacker_id, w.attacker_name, '【作废】宣战申请因资金不足自动失效',
              '批准时发现你已无力支付 ' || w.stake || ' G 军费与 ' || v_tax || ' G 战时动员税，申请作废，未扣除任何费用。', 'system', v_fy);
    RAISE EXCEPTION '宣战方现金不足（需 % G），申请已作废', w.stake + v_tax;
  END IF;

  UPDATE wbs_players SET cash = cash - w.stake - v_tax,
         credit_score = GREATEST(0, COALESCE(credit_score,100) - 5) WHERE owner_id = w.attacker_id;
  UPDATE wbs_wars SET status = 'declared', approve_status = 'approved', approved_by = v_name,
         war_tax = v_tax, approve_note = v_note WHERE id = p_id;
  INSERT INTO wbs_ledger(owner_id, fiscal_year, kind, detail, amount)
    VALUES (w.attacker_id, v_fy, 'war_cost', '战争拨款：宣战 ' || w.defender_name, -w.stake);
  INSERT INTO wbs_ledger(owner_id, fiscal_year, kind, detail, amount)
    VALUES (w.attacker_id, v_fy, 'war_tax', '战时动员税（军费的 10%）', -v_tax);
  INSERT INTO wbs_news(author, title, body, kind, fiscal_year)
    VALUES ('组委会', '【战云】' || v_name || ' 对 ' || w.defender_name || ' 宣战',
            '组委会已批准该宣战申请。' || v_name || ' 投入军费 ' || w.stake || ' G（另缴动员税 ' || v_tax || ' G，信用分 -5），'
            || '交战共 ' || w.rounds || ' 轮，双方在交战期内同时被贸易封锁。'
            || COALESCE(' 宣战理由：' || w.cause, ''), 'news', v_fy);
  INSERT INTO wbs_mail(sender_id, sender_name, recipient_id, recipient_name, subject, body, kind, fiscal_year)
    VALUES (v_uid, v_name, w.defender_id, w.defender_name, '【宣战】' || v_name || ' 已对你宣战',
            v_name || ' 已对你宣战，军费投入 ' || w.stake || ' G，交战共 ' || w.rounds || ' 轮。'
            || COALESCE(E'\n理由：' || w.cause, '')
            || E'\n请到「商战与制裁」应战（投入同等军费即打成平手）或投降；交战期内双方都不能签新合同。', 'system', v_fy);
  INSERT INTO wbs_mail(sender_id, sender_name, recipient_id, recipient_name, subject, body, kind, fiscal_year)
    VALUES (v_uid, v_name, w.attacker_id, w.attacker_name, '【已批准】对 ' || w.defender_name || ' 的宣战生效',
            '组委会批准了你的宣战申请。已划扣军费 ' || w.stake || ' G 与战时动员税 ' || v_tax || ' G，信用分 -5。'
            || E'\n等待对方应战后进入交战，战事推进请在「商战与制裁」操作。', 'system', v_fy);
  RETURN jsonb_build_object('status','declared','tax',v_tax,'total',w.stake + v_tax,'rounds',w.rounds);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_war_declare(p_defender text, p_stake numeric, p_cause text, p_rounds integer DEFAULT 3)\nCREATE OR REPLACE FUNCTION public.wbs_war_declare(p_defender text, p_stake numeric, p_cause text, p_rounds integer DEFAULT 3)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_uid text; v_name text; v_role text; d_name text; d_role text;
        v_fy int; v_phase text; v_cash numeric; v_id bigint; v_n int; v_tax numeric;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT phase, fiscal_year INTO v_phase, v_fy FROM wbs_game WHERE id = 1;
  IF v_phase <> 'open' THEN RAISE EXCEPTION '当前不在交易期，无法宣战'; END IF;
  SELECT company_name, role INTO v_name, v_role FROM wbs_players WHERE owner_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION '请先完成队伍注册'; END IF;
  IF v_role NOT IN ('manufacturer','trader','media') THEN RAISE EXCEPTION '该角色不参与商战'; END IF;
  IF NULLIF(p_defender,'') IS NULL THEN RAISE EXCEPTION '请选择宣战对象'; END IF;
  IF p_defender = v_uid THEN RAISE EXCEPTION '不能对自己宣战'; END IF;
  SELECT company_name, role INTO d_name, d_role FROM wbs_players WHERE owner_id = p_defender;
  IF NOT FOUND THEN RAISE EXCEPTION '宣战对象不存在'; END IF;
  IF d_role NOT IN ('manufacturer','trader','media') THEN RAISE EXCEPTION '不能对政府或裁判宣战'; END IF;
  IF p_stake IS NULL OR p_stake <= 0 OR p_stake <> round(p_stake) THEN RAISE EXCEPTION '军费必须是大于 0 的整数'; END IF;
  IF length(COALESCE(p_cause,'')) > 200 THEN RAISE EXCEPTION '宣战理由请控制在 200 字以内'; END IF;
  v_n := COALESCE(p_rounds, 3);
  IF v_n < 1 OR v_n > 5 THEN RAISE EXCEPTION '交战轮数必须在 1~5 之间'; END IF;
  IF EXISTS (SELECT 1 FROM wbs_wars WHERE attacker_id = v_uid AND defender_id = p_defender AND status IN ('pending','declared','fighting')) THEN
    RAISE EXCEPTION '你与该公司的上一场战争尚未结束';
  END IF;
  IF EXISTS (SELECT 1 FROM wbs_wars WHERE attacker_id = p_defender AND defender_id = v_uid AND status IN ('pending','declared','fighting')) THEN
    RAISE EXCEPTION '对方已向你宣战，请到战争面板应战';
  END IF;
  v_tax := ceil(p_stake * 0.1);
  SELECT cash INTO v_cash FROM wbs_players WHERE owner_id = v_uid FOR UPDATE;
  IF COALESCE(v_cash,0) < p_stake + v_tax THEN
    RAISE EXCEPTION '现金不足：需备妥军费 % G 与战时动员税 % G，合计 % G', p_stake, v_tax, p_stake + v_tax;
  END IF;
  INSERT INTO wbs_wars(attacker_id, attacker_name, defender_id, defender_name, stake, cause, status, approve_status, rounds, round, round_log, fiscal_year)
    VALUES (v_uid, v_name, p_defender, d_name, p_stake, NULLIF(trim(COALESCE(p_cause,'')),''), 'pending', 'pending', v_n, 0, '[]'::jsonb, v_fy)
    RETURNING id INTO v_id;
  PERFORM wbs_notify_role('admin', '【待审批】宣战申请：' || v_name || ' → ' || d_name,
    v_name || ' 申请对 ' || d_name || ' 宣战。' || E'\n军费投入：' || p_stake || ' G；战时动员税：' || v_tax || ' G；交战轮数：' || v_n
    || COALESCE(E'\n宣战理由：' || NULLIF(trim(COALESCE(p_cause,'')),''), '')
    || E'\n\n请到「商战与制裁 · 组委会审批台」裁定。批准后军费与动员税立即划扣，宣战方信用分 -5；驳回则申请作废、不扣任何费用。', v_uid);
  PERFORM wbs_notify_role('government', '【待审批】宣战申请：' || v_name || ' → ' || d_name,
    v_name || ' 申请对 ' || d_name || ' 宣战。' || E'\n军费投入：' || p_stake || ' G；战时动员税：' || v_tax || ' G；交战轮数：' || v_n
    || E'\n\n请到「商战与制裁 · 组委会审批台」裁定。', v_uid);
  RETURN jsonb_build_object('id', v_id, 'defender', d_name, 'stake', p_stake, 'rounds', v_n, 'status', 'pending', 'tax', v_tax);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_war_market_shock(p_pct numeric, p_note text)\nCREATE OR REPLACE FUNCTION public.wbs_war_market_shock(p_pct numeric, p_note text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_tick int; v_fy int;
BEGIN
  IF p_pct IS NULL OR p_pct = 0 THEN RETURN; END IF;
  PERFORM wbs_market_seed(false);
  SELECT COALESCE(max(tick),0), COALESCE(max(fiscal_year),1) INTO v_tick, v_fy FROM wbs_quotes_live;
  UPDATE wbs_quotes_live
     SET prev = price,
         price = GREATEST(round(base * 0.62, 2), LEAST(round(base * 1.55, 2), round(price * (1 + p_pct / 100.0), 2))),
         note = COALESCE(NULLIF(p_note,''), note),
         updated_at = now()
   WHERE kind = 'material';
  UPDATE wbs_quotes_live SET high = GREATEST(high, price), low = LEAST(low, price) WHERE kind = 'material';
  INSERT INTO wbs_quotes(code, name, kind, price, prev, base, volume, tick, drift, fiscal_year, phase, at)
  SELECT code, name, kind, price, prev, base, 0, v_tick, round(p_pct::numeric,5), v_fy, 'war', now()
    FROM wbs_quotes_live WHERE kind = 'material';
END $function$


CREATE OR REPLACE FUNCTION public.wbs_war_mediate(p_id bigint, p_note text)\nCREATE OR REPLACE FUNCTION public.wbs_war_mediate(p_id bigint, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE w wbs_wars; v_uid text; v_name text; v_role text; v_fy int;
        v_back_a numeric := 0; v_back_d numeric := 0; v_shock_tot numeric;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT company_name, role INTO v_name, v_role FROM wbs_players WHERE owner_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION '请先完成队伍注册'; END IF;
  SELECT * INTO w FROM wbs_wars WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '战争记录不存在'; END IF;
  IF w.status NOT IN ('pending','declared','fighting') THEN RAISE EXCEPTION '该战争已结束，无需终止'; END IF;
  IF v_role NOT IN ('government','admin') AND w.attacker_id <> v_uid THEN
    RAISE EXCEPTION '只有政府、裁判或宣战方本人可以终止战争';
  END IF;
  SELECT fiscal_year INTO v_fy FROM wbs_game WHERE id = 1;

  IF w.status = 'pending' THEN
    UPDATE wbs_wars SET status = 'stopped', approve_status = 'withdrawn',
           gov_note = COALESCE(NULLIF(trim(COALESCE(p_note,'')),''), '申请已撤回') WHERE id = p_id;
    INSERT INTO wbs_mail(sender_id, sender_name, recipient_id, recipient_name, subject, body, kind, fiscal_year)
      VALUES (v_uid, v_name, w.defender_id, w.defender_name, '宣战申请已撤回',
              v_name || ' 撤回了对 ' || w.defender_name || ' 的宣战申请，双方均未受损。'
              || COALESCE(chr(10) || '说明：' || NULLIF(trim(COALESCE(p_note,'')),''), ''), 'system', v_fy);
    RETURN jsonb_build_object('status','stopped','refund_attacker',0,'refund_defender',0,'was','pending');
  END IF;

  IF w.status = 'declared' THEN
    v_back_a := COALESCE(w.stake,0) + COALESCE(w.war_tax,0);
    v_back_d := 0;
  ELSE
    v_back_a := (COALESCE(w.stake,0) - COALESCE(w.attacker_spent,0)) + COALESCE(w.war_tax,0);
    v_back_d := COALESCE(w.defender_stake,0) - COALESCE(w.defender_spent,0);
  END IF;
  IF v_back_a < 0 THEN v_back_a := 0; END IF;
  IF v_back_d < 0 THEN v_back_d := 0; END IF;

  IF v_back_a > 0 THEN
    UPDATE wbs_players SET cash = cash + v_back_a WHERE owner_id = w.attacker_id;
    INSERT INTO wbs_ledger(owner_id, fiscal_year, kind, detail, amount)
      VALUES (w.attacker_id, v_fy, 'war_cost', '战争终止，军费与动员税退回', v_back_a);
  END IF;
  IF v_back_d > 0 THEN
    UPDATE wbs_players SET cash = cash + v_back_d WHERE owner_id = w.defender_id;
    INSERT INTO wbs_ledger(owner_id, fiscal_year, kind, detail, amount)
      VALUES (w.defender_id, v_fy, 'war_cost', '战争终止，未消耗军费退回', v_back_d);
  END IF;

  v_shock_tot := COALESCE(w.war_shock, 0);
  IF v_shock_tot > 0 THEN
    PERFORM wbs_war_market_shock(-round(v_shock_tot * 0.6, 2), '战事终止：军工溢价回落');
  END IF;

  UPDATE wbs_wars SET status = 'stopped',
         round_log = COALESCE(round_log,'[]'::jsonb) || jsonb_build_array(jsonb_build_object('r', COALESCE(round,0), 'note', '战事终止')),
         gov_note = COALESCE(NULLIF(trim(COALESCE(p_note,'')),''), '已调停') WHERE id = p_id;
  INSERT INTO wbs_mail(sender_id, sender_name, recipient_id, recipient_name, subject, body, kind, fiscal_year)
    VALUES (v_uid, v_name, w.attacker_id, w.attacker_name, '战争已终止',
            v_name || ' 终止了你对 ' || w.defender_name || ' 的战争。' || chr(10) || '退回军费 ' || v_back_a || ' G。'
            || COALESCE(chr(10) || '说明：' || NULLIF(trim(COALESCE(p_note,'')),''), ''), 'system', v_fy);
  INSERT INTO wbs_mail(sender_id, sender_name, recipient_id, recipient_name, subject, body, kind, fiscal_year)
    VALUES (v_uid, v_name, w.defender_id, w.defender_name, '战争已终止',
            v_name || ' 终止了与 ' || w.attacker_name || ' 的战争。' || chr(10) || '退回未消耗军费 ' || v_back_d || ' G。'
            || COALESCE(chr(10) || '说明：' || NULLIF(trim(COALESCE(p_note,'')),''), ''), 'system', v_fy);
  RETURN jsonb_build_object('status','stopped','refund_attacker',v_back_a,'refund_defender',v_back_d,'was',w.status,'shock',v_shock_tot);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_war_on_settle()\nCREATE OR REPLACE FUNCTION public.wbs_war_on_settle()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.status IN ('settled','stopped') AND COALESCE(OLD.status,'') NOT IN ('settled','stopped') THEN
    PERFORM wbs_war_orders_settle(NEW.id);
  END IF;
  RETURN NEW;
END $function$


CREATE OR REPLACE FUNCTION public.wbs_war_order_cancel(p_id bigint)\nCREATE OR REPLACE FUNCTION public.wbs_war_order_cancel(p_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE o wbs_war_orders; v_uid text; v_name text; v_role text; v_fy int; v_back numeric;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT company_name, role INTO v_name, v_role FROM wbs_players WHERE owner_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION '请先完成队伍注册'; END IF;
  SELECT fiscal_year INTO v_fy FROM wbs_game WHERE id = 1;
  SELECT * INTO o FROM wbs_war_orders WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '军需订单不存在'; END IF;
  IF o.status <> 'open' THEN RAISE EXCEPTION '该军需订单已关闭'; END IF;
  IF v_role NOT IN ('admin','government') AND o.owner_id <> v_uid THEN
    RAISE EXCEPTION '只有下单方或组委会可以撤销该军需订单';
  END IF;
  v_back := GREATEST(0, round(COALESCE(o.escrow,0), 2));
  IF v_back > 0 THEN
    UPDATE wbs_players SET cash = cash + v_back WHERE owner_id = o.owner_id;
    INSERT INTO wbs_ledger(owner_id, fiscal_year, kind, detail, amount)
      VALUES (o.owner_id, v_fy, 'war_order_refund', '军需订单撤销退款：' || o.item_name || ' ×' || o.qty, v_back);
  END IF;
  UPDATE wbs_war_orders SET status = 'cancelled', escrow = 0, updated_at = now() WHERE id = p_id;
  RETURN jsonb_build_object('id', p_id, 'status', 'cancelled', 'refund', v_back);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_war_order_create(p_war_id bigint, p_kind text, p_item text, p_qty numeric, p_price numeric, p_note text DEFAULT NULL::text)\nCREATE OR REPLACE FUNCTION public.wbs_war_order_create(p_war_id bigint, p_kind text, p_item text, p_qty numeric, p_price numeric, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE w wbs_wars; v_uid text; v_name text; v_fy int; v_phase text;
        v_qty numeric; v_price numeric; v_esc numeric; v_cash numeric;
        v_side text; v_iname text; v_cap int; v_open int; v_id bigint; v_note text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT phase, fiscal_year INTO v_phase, v_fy FROM wbs_game WHERE id = 1;
  IF v_phase <> 'open' THEN RAISE EXCEPTION '当前不在交易期，无法发布军需订单'; END IF;
  SELECT company_name INTO v_name FROM wbs_players WHERE owner_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION '请先完成队伍注册'; END IF;
  SELECT * INTO w FROM wbs_wars WHERE id = p_war_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '战争记录不存在'; END IF;
  IF w.status NOT IN ('declared','fighting') THEN RAISE EXCEPTION '该战争不在可采购军需的阶段'; END IF;
  IF v_uid = w.attacker_id THEN v_side := 'attacker';
  ELSIF v_uid = w.defender_id THEN v_side := 'defender';
  ELSE RAISE EXCEPTION '只有交战双方可以发布军需订单'; END IF;
  IF p_kind NOT IN ('material','product') THEN RAISE EXCEPTION '物资类型不合法'; END IF;
  v_qty := round(COALESCE(p_qty,0), 2);
  IF v_qty <= 0 THEN RAISE EXCEPTION '采购数量必须大于 0'; END IF;
  IF v_qty > 9999 THEN RAISE EXCEPTION '单笔军需订单请控制在 9999 以内'; END IF;
  v_price := round(COALESCE(p_price,0), 2);
  IF v_price < 0 THEN RAISE EXCEPTION '单价不能为负'; END IF;
  v_iname := COALESCE(wbs_item_name(p_kind, p_item), p_item);
  IF COALESCE(v_iname,'') = '' THEN RAISE EXCEPTION '物资不存在'; END IF;
  v_cap := COALESCE(NULLIF(wbs_setting('war_order_cap','4'),'')::int, 4);
  SELECT count(*) INTO v_open FROM wbs_war_orders
   WHERE war_id = p_war_id AND side = v_side AND status = 'open' AND fiscal_year = v_fy;
  IF v_open >= v_cap THEN RAISE EXCEPTION '你这一方未完成的军需订单已达上限（% 笔）', v_cap; END IF;
  v_esc := round(v_qty * v_price, 2);
  SELECT cash INTO v_cash FROM wbs_players WHERE owner_id = v_uid FOR UPDATE;
  IF COALESCE(v_cash,0) < v_esc THEN RAISE EXCEPTION '现金不足以预付军需货款（需 % G，现有 % G）', v_esc, COALESCE(v_cash,0); END IF;
  IF v_esc > 0 THEN
    UPDATE wbs_players SET cash = cash - v_esc WHERE owner_id = v_uid;
    INSERT INTO wbs_ledger(owner_id, fiscal_year, kind, detail, amount)
      VALUES (v_uid, v_fy, 'war_order', '军需采购托管：' || v_iname || ' ×' || v_qty || ' @' || v_price, -v_esc);
  END IF;
  v_note := NULLIF(trim(COALESCE(p_note,'')),'');
  INSERT INTO wbs_war_orders(war_id, side, owner_id, owner_name, kind, item_code, item_name, qty, unit_price, escrow, status, fiscal_year, note)
    VALUES (p_war_id, v_side, v_uid, v_name, p_kind, p_item, v_iname, v_qty, v_price, v_esc, 'open', v_fy, v_note)
    RETURNING id INTO v_id;
  PERFORM wbs_notice('war_order', '军需订单：' || v_name || ' 求购 ' || v_iname || ' ×' || v_qty,
    v_name || ' 在战时发布军需订单，以 ' || v_price || ' G/件 求购 ' || v_iname || ' ×' || v_qty
    || '，货款已全额托管。任何公司都可以交货换钱 —— 交货会同时转化为该方的战力。');
  RETURN jsonb_build_object('id', v_id, 'side', v_side, 'kind', p_kind, 'item', p_item, 'name', v_iname,
                            'qty', v_qty, 'unit_price', v_price, 'escrow', v_esc, 'status', 'open');
END $function$


CREATE OR REPLACE FUNCTION public.wbs_war_order_fill(p_id bigint, p_qty numeric)\nCREATE OR REPLACE FUNCTION public.wbs_war_order_fill(p_id bigint, p_qty numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE o wbs_war_orders; w wbs_wars; v_uid text; v_name text; v_fy int; v_phase text;
        v_qty numeric; v_rem numeric; v_have numeric; v_pay numeric; v_price numeric;
        v_rate numeric; v_val numeric; v_done boolean := false;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT phase, fiscal_year INTO v_phase, v_fy FROM wbs_game WHERE id = 1;
  IF v_phase <> 'open' THEN RAISE EXCEPTION '当前不在交易期，无法交付军需'; END IF;
  SELECT company_name INTO v_name FROM wbs_players WHERE owner_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION '请先完成队伍注册'; END IF;
  SELECT * INTO o FROM wbs_war_orders WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '军需订单不存在'; END IF;
  IF o.status <> 'open' THEN RAISE EXCEPTION '该军需订单已关闭'; END IF;
  IF o.fiscal_year <> v_fy THEN RAISE EXCEPTION '该军需订单属于财年 %，已跨年作废', o.fiscal_year; END IF;
  SELECT * INTO w FROM wbs_wars WHERE id = o.war_id;
  IF NOT FOUND OR w.status NOT IN ('declared','fighting') THEN RAISE EXCEPTION '该战争已结束，军需订单失效'; END IF;
  IF v_uid = w.attacker_id OR v_uid = w.defender_id THEN
    RAISE EXCEPTION '交战双方不能给自己的军需订单交货；自有物资请用「投入军需物资」直接转化战力';
  END IF;
  v_qty := round(COALESCE(p_qty,0), 2);
  IF v_qty <= 0 THEN RAISE EXCEPTION '交付数量必须大于 0'; END IF;
  v_rem := round(o.qty - COALESCE(o.filled,0), 2);
  IF v_rem <= 0 THEN RAISE EXCEPTION '该军需订单已足额'; END IF;
  IF v_qty > v_rem + 0.001 THEN RAISE EXCEPTION '订单只剩 % 单位，本次交付请不超过该数量', v_rem; END IF;
  SELECT COALESCE(qty,0) INTO v_have FROM wbs_stock WHERE owner_id = v_uid AND kind = o.kind AND item_code = o.item_code;
  IF COALESCE(v_have,0) < v_qty THEN RAISE EXCEPTION '库存不足：% 只有 % 单位', COALESCE(o.item_name, o.item_code), COALESCE(v_have,0); END IF;
  v_pay := round(COALESCE(o.unit_price,0) * v_qty, 2);
  UPDATE wbs_stock SET qty = qty - v_qty WHERE owner_id = v_uid AND kind = o.kind AND item_code = o.item_code;
  IF v_pay > 0 THEN
    UPDATE wbs_players SET cash = cash + v_pay, total_asset = total_asset + v_pay WHERE owner_id = v_uid;
    INSERT INTO wbs_ledger(owner_id, fiscal_year, kind, detail, amount)
      VALUES (v_uid, v_fy, 'war_sell', '军需交货：' || o.item_name || ' ×' || v_qty || ' → ' || COALESCE(o.owner_name,'交战方'), v_pay);
  END IF;
  v_price := wbs_qprice(CASE WHEN o.kind = 'material' THEN 'MAT:' ELSE 'PRD:' END || o.item_code);
  IF COALESCE(v_price,0) <= 0 AND o.kind = 'product' THEN
    SELECT COALESCE(ref_price,0) INTO v_price FROM wbs_products WHERE code = o.item_code;
  END IF;
  v_rate := COALESCE(NULLIF(wbs_setting('war_supply_rate','0.90'),'')::numeric, 0.90);
  v_val := round(v_qty * COALESCE(v_price,0) * v_rate, 2);
  IF v_val > 0 THEN
    IF o.side = 'attacker' THEN
      UPDATE wbs_wars SET attacker_supply = COALESCE(attacker_supply,0) + v_val WHERE id = o.war_id;
    ELSE
      UPDATE wbs_wars SET defender_supply = COALESCE(defender_supply,0) + v_val WHERE id = o.war_id;
    END IF;
    INSERT INTO wbs_war_supply(war_id, owner_id, company_name, side, kind, item_code, qty, value, fiscal_year)
      VALUES (o.war_id, v_uid, v_name, o.side, o.kind, o.item_code, v_qty, v_val, v_fy);
  END IF;
  UPDATE wbs_war_orders SET filled = COALESCE(filled,0) + v_qty,
         status = CASE WHEN COALESCE(filled,0) + v_qty >= qty - 0.001 THEN 'done' ELSE status END,
         escrow = GREATEST(0, round(COALESCE(escrow,0) - v_pay, 2)),
         updated_at = now()
   WHERE id = p_id;
  SELECT (status = 'done') INTO v_done FROM wbs_war_orders WHERE id = p_id;
  PERFORM wbs_notice('war_order', '军需交货：' || v_name || ' 向 ' || COALESCE(o.owner_name,'交战方') || ' 交付 ' || o.item_name || ' ×' || v_qty,
    v_name || ' 通过军需订单向 ' || COALESCE(o.owner_name,'交战方') || ' 交付 ' || o.item_name || ' ×' || v_qty
    || '，获得货款 ' || v_pay || ' G，折合战力 ' || v_val || ' G。');
  RETURN jsonb_build_object('id', p_id, 'war_id', o.war_id, 'side', o.side, 'kind', o.kind, 'item', o.item_code,
                            'name', o.item_name, 'qty', v_qty, 'unit_price', o.unit_price, 'pay', v_pay,
                            'value', v_val, 'filled', COALESCE(o.filled,0) + v_qty, 'total', o.qty, 'closed', v_done);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_war_orders_settle(p_war_id bigint)\nCREATE OR REPLACE FUNCTION public.wbs_war_orders_settle(p_war_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE r record; v_fy int; v_n int := 0; v_sum numeric := 0;
BEGIN
  SELECT fiscal_year INTO v_fy FROM wbs_game WHERE id = 1;
  FOR r IN SELECT * FROM wbs_war_orders WHERE war_id = p_war_id AND status = 'open' FOR UPDATE LOOP
    IF COALESCE(r.escrow,0) > 0 THEN
      UPDATE wbs_players SET cash = cash + r.escrow WHERE owner_id = r.owner_id;
      INSERT INTO wbs_ledger(owner_id, fiscal_year, kind, detail, amount)
        VALUES (r.owner_id, v_fy, 'war_order_refund', '战争结束，军需订单退款：' || r.item_name || ' ×' || r.qty, r.escrow);
      v_sum := v_sum + r.escrow;
    END IF;
    UPDATE wbs_war_orders SET status = 'closed', escrow = 0, updated_at = now() WHERE id = r.id;
    v_n := v_n + 1;
  END LOOP;
  RETURN jsonb_build_object('closed', v_n, 'refund', round(v_sum,2));
END $function$


CREATE OR REPLACE FUNCTION public.wbs_war_respond(p_id bigint, p_stake numeric)\nCREATE OR REPLACE FUNCTION public.wbs_war_respond(p_id bigint, p_stake numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE w wbs_wars; v_uid text; v_name text; v_fy int; v_cash numeric; v_ds numeric; v_back numeric;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT fiscal_year INTO v_fy FROM wbs_game WHERE id = 1;
  SELECT * INTO w FROM wbs_wars WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '战争记录不存在'; END IF;
  IF w.status = 'pending' THEN RAISE EXCEPTION '该宣战申请还在组委会审批中'; END IF;
  IF w.status <> 'declared' THEN RAISE EXCEPTION '该战争已结束或无法应战'; END IF;
  IF w.defender_id <> v_uid THEN RAISE EXCEPTION '只有被宣战方可以应战'; END IF;
  SELECT company_name INTO v_name FROM wbs_players WHERE owner_id = v_uid;
  IF p_stake IS NULL OR p_stake < 0 OR p_stake <> round(p_stake) THEN RAISE EXCEPTION '投入军费必须是大于等于 0 的整数'; END IF;
  SELECT cash INTO v_cash FROM wbs_players WHERE owner_id = v_uid FOR UPDATE;
  IF COALESCE(v_cash,0) < p_stake THEN RAISE EXCEPTION '现金不足以投入 % G 军费', p_stake; END IF;

  v_ds := LEAST(p_stake, w.stake);
  v_back := p_stake - v_ds;
  UPDATE wbs_players SET cash = cash - p_stake + v_back WHERE owner_id = v_uid;
  UPDATE wbs_wars SET defender_stake = v_ds, status = 'fighting', round = 0,
         round_log = '[]'::jsonb, attacker_spent = 0, defender_spent = 0 WHERE id = p_id;
  INSERT INTO wbs_ledger(owner_id, fiscal_year, kind, detail, amount)
    VALUES (v_uid, v_fy, 'war_cost', '应战 ' || w.attacker_name || '，军费投入', -v_ds);
  IF v_ds = 0 THEN
    INSERT INTO wbs_mail(sender_id, sender_name, recipient_id, recipient_name, subject, body, kind, fiscal_year)
      VALUES (NULL, '系统通知', w.attacker_id, w.attacker_name, '【不设防】' || w.defender_name || ' 未投入任何军费',
              w.defender_name || ' 选择了投入 0 G 应战，等于放弃抵抗。' || E'\n战事推进后，差额会按 1.2 倍战争赔偿从对方现金与库存中划归你。', 'system', v_fy);
  ELSE
    INSERT INTO wbs_mail(sender_id, sender_name, recipient_id, recipient_name, subject, body, kind, fiscal_year)
      VALUES (NULL, '系统通知', w.attacker_id, w.attacker_name, '【应战】' || w.defender_name || ' 已投入军费应战',
              w.defender_name || ' 投入 ' || v_ds || ' G 军费应战（对方需 1:1 对抗 ' || w.stake || ' G）。' || E'\n战事共 ' || w.rounds || ' 轮，请到「商战与制裁」推进。', 'system', v_fy);
  END IF;
  RETURN jsonb_build_object('status','fighting','stake',v_ds,'rounds',w.rounds,'refund',v_back);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_war_supply(p_id bigint, p_kind text, p_item text, p_qty numeric)\nCREATE OR REPLACE FUNCTION public.wbs_war_supply(p_id bigint, p_kind text, p_item text, p_qty numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE w wbs_wars; v_uid text; v_name text; v_fy int; v_phase text;
        v_qty numeric; v_price numeric; v_val numeric; v_rate numeric; v_have numeric;
        v_side text; v_names text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT phase, fiscal_year INTO v_phase, v_fy FROM wbs_game WHERE id = 1;
  IF v_phase <> 'open' THEN RAISE EXCEPTION '当前不在交易期，无法投入军需物资'; END IF;
  SELECT company_name INTO v_name FROM wbs_players WHERE owner_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION '请先完成队伍注册'; END IF;
  SELECT * INTO w FROM wbs_wars WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '战争记录不存在'; END IF;
  IF w.status NOT IN ('declared','fighting') THEN RAISE EXCEPTION '该战争不在可投入物资的阶段'; END IF;
  IF v_uid = w.attacker_id THEN v_side := 'attacker';
  ELSIF v_uid = w.defender_id THEN v_side := 'defender';
  ELSE RAISE EXCEPTION '只有交战双方可以投入军需物资'; END IF;
  IF p_kind NOT IN ('material','product') THEN RAISE EXCEPTION '物资类型不合法'; END IF;
  v_qty := round(COALESCE(p_qty,0), 2);
  IF v_qty <= 0 THEN RAISE EXCEPTION '投入数量必须大于 0'; END IF;
  IF v_qty > 9999 THEN RAISE EXCEPTION '单笔投入请控制在 9999 以内'; END IF;
  SELECT COALESCE(qty,0) INTO v_have FROM wbs_stock WHERE owner_id = v_uid AND kind = p_kind AND item_code = p_item;
  IF COALESCE(v_have,0) < v_qty THEN RAISE EXCEPTION '库存不足：% 只有 % 单位', p_item, COALESCE(v_have,0); END IF;
  v_price := wbs_qprice(CASE WHEN p_kind = 'material' THEN 'MAT:' ELSE 'PRD:' END || p_item);
  IF COALESCE(v_price,0) <= 0 AND p_kind = 'product' THEN
    SELECT COALESCE(ref_price,0) INTO v_price FROM wbs_products WHERE code = p_item;
  END IF;
  IF COALESCE(v_price,0) <= 0 THEN RAISE EXCEPTION '该物资没有可用市价，无法折算成战力'; END IF;
  v_rate := COALESCE(NULLIF(wbs_setting('war_supply_rate','0.90'),'')::numeric, 0.90);
  v_val := round(v_qty * v_price * v_rate, 2);
  IF v_val <= 0 THEN RAISE EXCEPTION '折算后的战力为 0，无法投入'; END IF;
  UPDATE wbs_stock SET qty = qty - v_qty WHERE owner_id = v_uid AND kind = p_kind AND item_code = p_item;
  INSERT INTO wbs_war_supply(war_id, owner_id, company_name, side, kind, item_code, qty, value, fiscal_year)
    VALUES (p_id, v_uid, v_name, v_side, p_kind, p_item, v_qty, v_val, v_fy);
  IF v_side = 'attacker' THEN
    UPDATE wbs_wars SET attacker_supply = COALESCE(attacker_supply,0) + v_val WHERE id = p_id;
  ELSE
    UPDATE wbs_wars SET defender_supply = COALESCE(defender_supply,0) + v_val WHERE id = p_id;
  END IF;
  v_names := COALESCE(wbs_item_name(p_kind, p_item), p_item);
  PERFORM wbs_notice('war_supply', '战时军需：' || v_name || ' 投入 ' || v_names || ' ×' || v_qty,
    v_name || ' 在对 ' || CASE WHEN v_side = 'attacker' THEN w.defender_name ELSE w.attacker_name END
    || ' 的战争中投入 ' || v_names || ' ×' || v_qty || '，按市价折算战力 ' || v_val || ' G。');
  RETURN jsonb_build_object('war_id', p_id, 'side', v_side, 'kind', p_kind, 'item', p_item, 'name', v_names,
                            'qty', v_qty, 'unit', v_price, 'rate', v_rate, 'value', v_val);
END $function$


CREATE OR REPLACE FUNCTION public.wbs_whoami()\nCREATE OR REPLACE FUNCTION public.wbs_whoami()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT to_jsonb(p) FROM wbs_players p WHERE p.owner_id = auth.uid() LIMIT 1
$function$


-- 行情自动驾驶：用 pg_cron 让服务器自己按设定的秒数推进行情（无需浏览器在线）
CREATE EXTENSION IF NOT EXISTS pg_cron;
GRANT USAGE ON SCHEMA cron TO public;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA cron TO public;
SELECT cron.schedule('bizsim-market-autopilot', '6 seconds', 'SELECT public.wbs_market_autopilot()');
