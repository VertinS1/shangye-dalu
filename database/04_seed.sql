-- ============================================================
-- 第 4 步：基础数据（原材料目录 / 通用产品 / 汇率 / 赛制参数 / 比赛状态）
-- 注意：judge_code 是「政府 / 裁判」角色的注册口令，部署后请务必改成自己的口令！
-- ============================================================

-- 比赛全局状态（初始：筹备期 · 第 0 财年）
INSERT INTO wbs_game (id, fiscal_year, phase) VALUES (1, 0, 'prepare') ON CONFLICT (id) DO NOTHING;

-- 汇率牌价（星洲币 / 贺兰币）
INSERT INTO wbs_fx (currency, name, symbol, rate, sort_order) VALUES ('A', '星洲币', '★', 2.00, 1) ON CONFLICT (currency) DO UPDATE SET name = EXCLUDED.name, symbol = EXCLUDED.symbol, rate = EXCLUDED.rate, sort_order = EXCLUDED.sort_order;
INSERT INTO wbs_fx (currency, name, symbol, rate, sort_order) VALUES ('B', '贺兰币', '◆', 0.50, 2) ON CONFLICT (currency) DO UPDATE SET name = EXCLUDED.name, symbol = EXCLUDED.symbol, rate = EXCLUDED.rate, sort_order = EXCLUDED.sort_order;

-- 通用产品（54 种原材料目录见 materials； manufacturer 也可研发报批自有产品）
INSERT INTO wbs_products (code, name, recipe, ref_price, sort_order, prod_sec, max_qty) VALUES ('clock', '机械钟表', '{"ore": 2, "chip": 1}'::jsonb, 100, 1, 0, NULL) ON CONFLICT (code) DO NOTHING;
INSERT INTO wbs_products (code, name, recipe, ref_price, sort_order, prod_sec, max_qty) VALUES ('speaker', '智能音箱', '{"chip": 1, "wood": 1, "cloth": 1}'::jsonb, 88, 2, 0, NULL) ON CONFLICT (code) DO NOTHING;
INSERT INTO wbs_products (code, name, recipe, ref_price, sort_order, prod_sec, max_qty) VALUES ('sofa', '布艺沙发', '{"wood": 2, "cloth": 3}'::jsonb, 75, 3, 0, NULL) ON CONFLICT (code) DO NOTHING;

-- 原材料目录（54 种，supply_left 开财年时由 wbs_open_year 重新生成）
INSERT INTO wbs_materials (code, name, price, supply_total, supply_left, sort_order) VALUES ('ore', '铁矿', 10, 200, 0, 1) ON CONFLICT (code) DO NOTHING;
INSERT INTO wbs_materials (code, name, price, supply_total, supply_left, sort_order) VALUES ('wood', '木材', 8, 240, 0, 2) ON CONFLICT (code) DO NOTHING;
INSERT INTO wbs_materials (code, name, price, supply_total, supply_left, sort_order) VALUES ('chip', '芯片', 25, 104, 0, 3) ON CONFLICT (code) DO NOTHING;
INSERT INTO wbs_materials (code, name, price, supply_total, supply_left, sort_order) VALUES ('cloth', '布料', 6, 240, 0, 4) ON CONFLICT (code) DO NOTHING;
INSERT INTO wbs_materials (code, name, price, supply_total, supply_left, sort_order) VALUES ('copper', '铜', 18, 240, 0, 5) ON CONFLICT (code) DO NOTHING;
INSERT INTO wbs_materials (code, name, price, supply_total, supply_left, sort_order) VALUES ('aluminum', '铝', 14, 240, 0, 6) ON CONFLICT (code) DO NOTHING;
INSERT INTO wbs_materials (code, name, price, supply_total, supply_left, sort_order) VALUES ('rubber', '橡胶', 9, 200, 0, 7) ON CONFLICT (code) DO NOTHING;
INSERT INTO wbs_materials (code, name, price, supply_total, supply_left, sort_order) VALUES ('leather', '皮革', 16, 160, 0, 8) ON CONFLICT (code) DO NOTHING;
INSERT INTO wbs_materials (code, name, price, supply_total, supply_left, sort_order) VALUES ('silk', '丝绸', 30, 120, 0, 9) ON CONFLICT (code) DO NOTHING;
INSERT INTO wbs_materials (code, name, price, supply_total, supply_left, sort_order) VALUES ('glass', '玻璃', 7, 280, 0, 10) ON CONFLICT (code) DO NOTHING;
INSERT INTO wbs_materials (code, name, price, supply_total, supply_left, sort_order) VALUES ('ceramic', '陶瓷', 8, 240, 0, 11) ON CONFLICT (code) DO NOTHING;
INSERT INTO wbs_materials (code, name, price, supply_total, supply_left, sort_order) VALUES ('cotton', '棉花', 10, 300, 0, 12) ON CONFLICT (code) DO NOTHING;
INSERT INTO wbs_materials (code, name, price, supply_total, supply_left, sort_order) VALUES ('wool', '羊毛', 15, 200, 0, 13) ON CONFLICT (code) DO NOTHING;
INSERT INTO wbs_materials (code, name, price, supply_total, supply_left, sort_order) VALUES ('pulp', '纸浆', 5, 300, 0, 14) ON CONFLICT (code) DO NOTHING;
INSERT INTO wbs_materials (code, name, price, supply_total, supply_left, sort_order) VALUES ('bamboo', '竹材', 6, 260, 0, 15) ON CONFLICT (code) DO NOTHING;
INSERT INTO wbs_materials (code, name, price, supply_total, supply_left, sort_order) VALUES ('rattan', '藤条', 5, 200, 0, 16) ON CONFLICT (code) DO NOTHING;
INSERT INTO wbs_materials (code, name, price, supply_total, supply_left, sort_order) VALUES ('marble', '大理石', 12, 180, 0, 17) ON CONFLICT (code) DO NOTHING;
INSERT INTO wbs_materials (code, name, price, supply_total, supply_left, sort_order) VALUES ('granite', '花岗岩', 10, 200, 0, 18) ON CONFLICT (code) DO NOTHING;
INSERT INTO wbs_materials (code, name, price, supply_total, supply_left, sort_order) VALUES ('jade', '玉石', 40, 60, 0, 19) ON CONFLICT (code) DO NOTHING;
INSERT INTO wbs_materials (code, name, price, supply_total, supply_left, sort_order) VALUES ('crystal', '水晶', 28, 80, 0, 20) ON CONFLICT (code) DO NOTHING;
INSERT INTO wbs_materials (code, name, price, supply_total, supply_left, sort_order) VALUES ('rare_earth', '稀土', 45, 60, 0, 21) ON CONFLICT (code) DO NOTHING;
INSERT INTO wbs_materials (code, name, price, supply_total, supply_left, sort_order) VALUES ('coal', '煤炭', 7, 320, 0, 22) ON CONFLICT (code) DO NOTHING;
INSERT INTO wbs_materials (code, name, price, supply_total, supply_left, sort_order) VALUES ('petroleum', '石油', 20, 240, 0, 23) ON CONFLICT (code) DO NOTHING;
INSERT INTO wbs_materials (code, name, price, supply_total, supply_left, sort_order) VALUES ('natural_gas', '天然气', 16, 200, 0, 24) ON CONFLICT (code) DO NOTHING;
INSERT INTO wbs_materials (code, name, price, supply_total, supply_left, sort_order) VALUES ('silicon', '硅料', 22, 120, 0, 25) ON CONFLICT (code) DO NOTHING;
INSERT INTO wbs_materials (code, name, price, supply_total, supply_left, sort_order) VALUES ('lithium', '锂矿', 26, 100, 0, 26) ON CONFLICT (code) DO NOTHING;
INSERT INTO wbs_materials (code, name, price, supply_total, supply_left, sort_order) VALUES ('nickel', '镍矿', 24, 120, 0, 27) ON CONFLICT (code) DO NOTHING;
INSERT INTO wbs_materials (code, name, price, supply_total, supply_left, sort_order) VALUES ('zinc', '锌矿', 15, 180, 0, 28) ON CONFLICT (code) DO NOTHING;
INSERT INTO wbs_materials (code, name, price, supply_total, supply_left, sort_order) VALUES ('tin', '锡矿', 20, 140, 0, 29) ON CONFLICT (code) DO NOTHING;
INSERT INTO wbs_materials (code, name, price, supply_total, supply_left, sort_order) VALUES ('tungsten', '钨矿', 27, 100, 0, 30) ON CONFLICT (code) DO NOTHING;
INSERT INTO wbs_materials (code, name, price, supply_total, supply_left, sort_order) VALUES ('titanium', '钛合金', 35, 80, 0, 31) ON CONFLICT (code) DO NOTHING;
INSERT INTO wbs_materials (code, name, price, supply_total, supply_left, sort_order) VALUES ('steel', '不锈钢', 19, 240, 0, 32) ON CONFLICT (code) DO NOTHING;
INSERT INTO wbs_materials (code, name, price, supply_total, supply_left, sort_order) VALUES ('carbon_fiber', '碳纤维', 42, 60, 0, 33) ON CONFLICT (code) DO NOTHING;
INSERT INTO wbs_materials (code, name, price, supply_total, supply_left, sort_order) VALUES ('optical_fiber', '光纤', 24, 120, 0, 34) ON CONFLICT (code) DO NOTHING;
INSERT INTO wbs_materials (code, name, price, supply_total, supply_left, sort_order) VALUES ('linen', '亚麻', 11, 200, 0, 35) ON CONFLICT (code) DO NOTHING;
INSERT INTO wbs_materials (code, name, price, supply_total, supply_left, sort_order) VALUES ('jute', '黄麻', 6, 220, 0, 36) ON CONFLICT (code) DO NOTHING;
INSERT INTO wbs_materials (code, name, price, supply_total, supply_left, sort_order) VALUES ('wax', '蜡', 8, 180, 0, 37) ON CONFLICT (code) DO NOTHING;
INSERT INTO wbs_materials (code, name, price, supply_total, supply_left, sort_order) VALUES ('resin', '树脂', 12, 200, 0, 38) ON CONFLICT (code) DO NOTHING;
INSERT INTO wbs_materials (code, name, price, supply_total, supply_left, sort_order) VALUES ('dye', '染料', 13, 180, 0, 39) ON CONFLICT (code) DO NOTHING;
INSERT INTO wbs_materials (code, name, price, supply_total, supply_left, sort_order) VALUES ('salt', '盐', 4, 320, 0, 40) ON CONFLICT (code) DO NOTHING;
INSERT INTO wbs_materials (code, name, price, supply_total, supply_left, sort_order) VALUES ('sugar', '糖', 6, 300, 0, 41) ON CONFLICT (code) DO NOTHING;
INSERT INTO wbs_materials (code, name, price, supply_total, supply_left, sort_order) VALUES ('coffee', '咖啡豆', 18, 160, 0, 42) ON CONFLICT (code) DO NOTHING;
INSERT INTO wbs_materials (code, name, price, supply_total, supply_left, sort_order) VALUES ('cocoa', '可可豆', 20, 160, 0, 43) ON CONFLICT (code) DO NOTHING;
INSERT INTO wbs_materials (code, name, price, supply_total, supply_left, sort_order) VALUES ('tea', '茶叶', 15, 180, 0, 44) ON CONFLICT (code) DO NOTHING;
INSERT INTO wbs_materials (code, name, price, supply_total, supply_left, sort_order) VALUES ('spice', '香料', 25, 120, 0, 45) ON CONFLICT (code) DO NOTHING;
INSERT INTO wbs_materials (code, name, price, supply_total, supply_left, sort_order) VALUES ('herb', '草药', 17, 160, 0, 46) ON CONFLICT (code) DO NOTHING;
INSERT INTO wbs_materials (code, name, price, supply_total, supply_left, sort_order) VALUES ('ginseng', '人参', 38, 60, 0, 47) ON CONFLICT (code) DO NOTHING;
INSERT INTO wbs_materials (code, name, price, supply_total, supply_left, sort_order) VALUES ('coral', '珊瑚', 32, 60, 0, 48) ON CONFLICT (code) DO NOTHING;
INSERT INTO wbs_materials (code, name, price, supply_total, supply_left, sort_order) VALUES ('amber', '琥珀', 36, 60, 0, 49) ON CONFLICT (code) DO NOTHING;
INSERT INTO wbs_materials (code, name, price, supply_total, supply_left, sort_order) VALUES ('pearl', '珍珠', 38, 60, 0, 50) ON CONFLICT (code) DO NOTHING;
INSERT INTO wbs_materials (code, name, price, supply_total, supply_left, sort_order) VALUES ('gold', '黄金', 48, 60, 0, 51) ON CONFLICT (code) DO NOTHING;
INSERT INTO wbs_materials (code, name, price, supply_total, supply_left, sort_order) VALUES ('silver', '白银', 30, 100, 0, 52) ON CONFLICT (code) DO NOTHING;
INSERT INTO wbs_materials (code, name, price, supply_total, supply_left, sort_order) VALUES ('platinum', '铂金', 52, 50, 0, 53) ON CONFLICT (code) DO NOTHING;
INSERT INTO wbs_materials (code, name, price, supply_total, supply_left, sort_order) VALUES ('diamond', '钻石', 55, 40, 0, 54) ON CONFLICT (code) DO NOTHING;

-- 赛制参数（⚠ judge_code = 政府/裁判注册口令，务必修改！）
INSERT INTO wbs_settings (key, value, label) VALUES ('auction_done', '1', '集合竞价是否已完成') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, label = EXCLUDED.label;
INSERT INTO wbs_settings (key, value, label) VALUES ('auction_until', '0', '集合竞价截止档位') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, label = EXCLUDED.label;
INSERT INTO wbs_settings (key, value, label) VALUES ('auto_list', '1', '投产完工后是否自动挂到交易所（1 开 / 0 关）') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, label = EXCLUDED.label;
INSERT INTO wbs_settings (key, value, label) VALUES ('circuit_drop', '0.06', '大盘熔断阈值') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, label = EXCLUDED.label;
INSERT INTO wbs_settings (key, value, label) VALUES ('circuit_until', '0', '熔断截止档位') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, label = EXCLUDED.label;
INSERT INTO wbs_settings (key, value, label) VALUES ('ex_fee', '0.0015', '交易所撮合手续费率（单边）') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, label = EXCLUDED.label;
INSERT INTO wbs_settings (key, value, label) VALUES ('fluct_on', '1', '自动波动开关（1 开 / 0 冻结）') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, label = EXCLUDED.label;
INSERT INTO wbs_settings (key, value, label) VALUES ('fluct_mat', '1.60', '原材料波动率（% / 档）') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, label = EXCLUDED.label;
INSERT INTO wbs_settings (key, value, label) VALUES ('fluct_prod', '0.90', '成品波动率（% / 档）') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, label = EXCLUDED.label;
INSERT INTO wbs_settings (key, value, label) VALUES ('fluct_oth', '0.60', '其他品种波动率（% / 档）') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, label = EXCLUDED.label;
INSERT INTO wbs_settings (key, value, label) VALUES ('fluct_drift', '6', '向基准价回归强度（% / 档）') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, label = EXCLUDED.label;
INSERT INTO wbs_settings (key, value, label) VALUES ('fluct_sec', '6', '行情更新间隔（秒）') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, label = EXCLUDED.label;
INSERT INTO wbs_settings (key, value, label) VALUES ('fluct_until', '', '波动持续截止时间（空 = 一直波动）') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, label = EXCLUDED.label;
INSERT INTO wbs_settings (key, value, label) VALUES ('gov_aid_cap', '1', '政府军援上限（占该方已投入军费的比例）') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, label = EXCLUDED.label;
INSERT INTO wbs_settings (key, value, label) VALUES ('gov_budget_base', '3000', '政府每财年基础拨款（金币）') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, label = EXCLUDED.label;
INSERT INTO wbs_settings (key, value, label) VALUES ('gov_policy_cap', '3', '政府每财年最多同时生效几项政策') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, label = EXCLUDED.label;
INSERT INTO wbs_settings (key, value, label) VALUES ('gov_procure_cap', '8', '政府每财年最多发布几笔采购招标') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, label = EXCLUDED.label;
INSERT INTO wbs_settings (key, value, label) VALUES ('gov_tax_rate', '0.02', '政府每财年税抽成比例（上财年全场流水）') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, label = EXCLUDED.label;
INSERT INTO wbs_settings (key, value, label) VALUES ('judge_code', 'CHANGE-ME-2026', '管理类角色注册口令（政府 / 裁判）⚠ 请务必修改') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, label = EXCLUDED.label;
INSERT INTO wbs_settings (key, value, label) VALUES ('oem_cap', '6', '每人每财年最多同时挂几笔代工订单') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, label = EXCLUDED.label;
INSERT INTO wbs_settings (key, value, label) VALUES ('price_band', '0.20', '涨跌停板幅度') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, label = EXCLUDED.label;
INSERT INTO wbs_settings (key, value, label) VALUES ('produce_max_qty', '50', '全场默认「最多可产」（件）') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, label = EXCLUDED.label;
INSERT INTO wbs_settings (key, value, label) VALUES ('produce_sec_base', '8', '投产基础工时（秒）') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, label = EXCLUDED.label;
INSERT INTO wbs_settings (key, value, label) VALUES ('produce_sec_max', '1200', '单笔生产最长工时（秒，20 分钟）') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, label = EXCLUDED.label;
INSERT INTO wbs_settings (key, value, label) VALUES ('produce_sec_min', '8', '单笔生产最短工时（秒）') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, label = EXCLUDED.label;
INSERT INTO wbs_settings (key, value, label) VALUES ('produce_sec_per_unit', '1.2', '每件追加工时（秒）') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, label = EXCLUDED.label;
INSERT INTO wbs_settings (key, value, label) VALUES ('rd_sec_max', '60', '研发申报单件工时上限（秒）') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, label = EXCLUDED.label;
INSERT INTO wbs_settings (key, value, label) VALUES ('rd_sec_min', '0.2', '研发申报单件工时下限（秒）') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, label = EXCLUDED.label;
INSERT INTO wbs_settings (key, value, label) VALUES ('tick_cap', '0.03', '单档最大波幅') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, label = EXCLUDED.label;
INSERT INTO wbs_settings (key, value, label) VALUES ('war_order_cap', '4', '每方每财年最多挂几笔未完成的军需订单') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, label = EXCLUDED.label;
INSERT INTO wbs_settings (key, value, label) VALUES ('war_shock_pct', '2.5', '战争每推进一轮物资价格上浮百分比') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, label = EXCLUDED.label;
INSERT INTO wbs_settings (key, value, label) VALUES ('war_supply_rate', '0.90', '战时物资折算战力系数（按市价折算）') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, label = EXCLUDED.label;
