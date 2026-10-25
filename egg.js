/* ============================================================
 * 商业大陆 · 彩蛋小游戏「商业大逃亡」（地铁跑酷式）
 * 触发：键盘依次输入 ↑ ↑ ↓ ↓ ← → ← →（仅电脑端监听）
 * 退出：ESC
 * 玩法：← →（或 A / D）切换车道，↑ / W / 空格 跳过低栏；
 *       躲开火车与路障，捡金币 +10，被抓到即结束；
 *       速度会越来越快，回车再来一局。
 * ============================================================ */
(function () {
  'use strict';

  // 只在电脑端启用：有精确指针（鼠标）且不是触摸设备
  try {
    var coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    var touch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    if (coarse || touch) return;
  } catch (e) { /* 检测失败就默认启用 */ }

  var SEQ = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight'];
  var idx = 0;

  document.addEventListener('keydown', function (ev) {
    if (state.on) return;                       // 游戏中按键交给游戏
    if (ev.key === SEQ[idx]) {
      idx += 1;
      if (idx === SEQ.length) { idx = 0; start(); }
    } else {
      idx = (ev.key === SEQ[0]) ? 1 : 0;
    }
  }, true);

  // ---------------- 状态 ----------------
  var state = { on: false };
  var overlay = null, canvas = null, ctx = null, raf = 0;
  var player, ents, dist, speed, coinsN, score, over, tPrev, spawnZ, crashAt;

  var HI_KEY = 'douluo_run_hi';
  var best = 0;
  try { best = Number(localStorage.getItem(HI_KEY)) || 0; } catch (e) { best = 0; }

  // ---------------- 构建 DOM ----------------
  function build() {
    overlay = document.createElement('div');
    overlay.id = 'eggOverlay';
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:99999;background:rgba(8,13,26,.88);' +
      'display:flex;align-items:center;justify-content:center;font-family:"PingFang SC","Microsoft YaHei",sans-serif;';
    overlay.innerHTML =
      '<div style="text-align:center;">' +
      '<div style="color:#8fa3c6;font-size:13px;letter-spacing:.3em;margin-bottom:8px;">BIZLAND CONTINENT · EGG</div>' +
      '<div style="color:#fff;font-size:26px;font-weight:800;letter-spacing:.12em;margin-bottom:14px;">商业大逃亡</div>' +
      '<canvas width="760" height="480" style="border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.5);max-width:92vw;outline:none;" tabindex="0"></canvas>' +
      '<div style="color:#8fa3c6;font-size:13px;margin-top:12px;">← → 换道 · ↑ / 空格 跳跃 · 躲开火车和路障 · 按 ESC 退出</div>' +
      '</div>';
    document.body.appendChild(overlay);
    canvas = overlay.querySelector('canvas');   // 浮层内查找，避免拿到残留画布
    ctx = canvas.getContext('2d');
  }

  function destroy() {
    cancelAnimationFrame(raf);
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    overlay = canvas = ctx = null;
    keys = {};                                  // 清空按键状态，防止下一局角色自己跑
    state.on = false;
  }

  // ---------------- 游戏参数 ----------------
  var W = 760, H = 480;
  var HORIZON = 168;          // 地平线
  var BASE_Y = H - 92;        // 玩家脚底基准线
  var LANE_HALF = 118;        // 车道半宽（z=0 处）
  var SPAWN_Z = 2000;         // 生成距离（世界单位）
  var GRAV = 2600;            // 重力
  var JUMP_V = 780;           // 起跳速度

  // ---------------- 逻辑 ----------------
  var keys = {};

  function reset() {
    keys = {};
    player = { laneX: 0, laneT: 0, jumpY: 0, vy: 0, air: false };
    ents = [];
    dist = 0; speed = 330; coinsN = 0; score = 0;
    over = false; tPrev = 0; crashAt = 0; spawnZ = 600;
  }

  function start() {
    if (state.on) return;
    try {
      build();
      reset();
    } catch (e) {
      destroy();                                // 构建失败不留半成品界面
      return;
    }
    state.on = true;
    try { canvas.focus(); } catch (e) {}
    toastLike('🎮 彩蛋解锁 · 商业大逃亡！');
    raf = requestAnimationFrame(loop);
  }

  function toastLike(msg) {
    var el = document.createElement('div');
    el.textContent = msg;
    el.style.cssText = 'position:fixed;top:18px;left:50%;transform:translateX(-50%);z-index:100000;' +
      'background:#2f5bea;color:#fff;font:600 15px/1 "PingFang SC",sans-serif;letter-spacing:.06em;' +
      'padding:12px 22px;border-radius:24px;box-shadow:0 8px 24px rgba(0,0,0,.3);';
    document.body.appendChild(el);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 2200);
  }

  function onKey(ev, down) {
    var k = ev.key;
    if (k === 'Escape') {
      if (!state.on) return;                    // 游戏没开时不要拦截 ESC
      ev.preventDefault(); destroy(); return;
    }
    if (!down) { keys[k] = false; return; }     // 松键总是记录，防止状态卡死
    if (!state.on) return;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A' || k === 'ArrowRight' || k === 'd' || k === 'D' ||
        k === 'ArrowUp' || k === 'w' || k === 'W' || k === ' ' || k === 'ArrowDown' || k === 's' || k === 'S') {
      ev.preventDefault();
      keys[k] = true;
    }
    if (ev.repeat) return;
    if (over) { if (k === 'Enter' || k === ' ') reset(); return; }
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') { player.laneT = Math.max(-1, player.laneT - 1); }
    if (k === 'ArrowRight' || k === 'd' || k === 'D') { player.laneT = Math.min(1, player.laneT + 1); }
    if ((k === 'ArrowUp' || k === 'w' || k === 'W' || k === ' ') && !player.air) {
      player.air = true; player.vy = JUMP_V;
    }
    if (k === 'ArrowDown' || k === 's' || k === 'S') {
      if (player.air) player.vy = Math.min(player.vy, -1100);   // 快速落地
    }
  }
  document.addEventListener('keydown', function (ev) { onKey(ev, true); }, true);
  document.addEventListener('keyup', function (ev) { onKey(ev, false); }, true);

  // ---------------- 生成 ----------------
  function spawn() {
    // 随机挑一条障碍车道 + 一条金币车道，保证至少一条道能活
    var lanes = [-1, 0, 1];
    shuffle(lanes);
    var obLane = lanes[0], coinLane = lanes[1];
    var r = Math.random();
    if (r < 0.42) {
      ents.push({ lane: obLane, z: SPAWN_Z, kind: 'train' });
    } else if (r < 0.82) {
      ents.push({ lane: obLane, z: SPAWN_Z, kind: 'hurdle' });
    }
    if (Math.random() < 0.75) {
      var n = 3 + Math.floor(Math.random() * 3);       // 3~5 枚金币
      for (var i = 0; i < n; i++) {
        ents.push({ lane: coinLane, z: SPAWN_Z + i * 150, kind: 'coin' });
      }
    }
  }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
  }

  // ---------------- 主循环 ----------------
  function loop(ts) {
    if (!state.on) return;
    if (!tPrev) tPrev = ts;
    var dt = Math.min(0.05, (ts - tPrev) / 1000);
    tPrev = ts;

    if (!over) {
      speed = Math.min(880, speed + 11 * dt);
      dist += speed * dt;
      score = Math.floor(dist * 0.06) + coinsN * 10;

      // 换道平滑
      player.laneX += (player.laneT - player.laneX) * Math.min(1, dt * 14);
      // 跳跃
      if (player.air) {
        player.vy -= GRAV * dt;
        player.jumpY += player.vy * dt;
        if (player.jumpY <= 0) { player.jumpY = 0; player.air = false; player.vy = 0; }
      }

      // 生成
      spawnZ -= speed * dt;
      if (spawnZ <= 0) { spawn(); spawnZ = Math.max(300, 520 - speed * 0.25); }

      // 推进 + 碰撞
      for (var i = ents.length - 1; i >= 0; i--) {
        var e = ents[i];
        e.z -= speed * dt;
        if (e.z < -120) { ents.splice(i, 1); continue; }
        var inZone = e.z < 40 && e.z > -40;
        var sameLane = Math.abs(e.lane - player.laneX) < 0.5;
        if (!inZone || !sameLane) continue;
        if (e.kind === 'coin') {
          ents.splice(i, 1);
          coinsN += 1;
          continue;
        }
        if (e.kind === 'hurdle') {
          if (player.jumpY > 34) continue;     // 跳过去了
        }
        // train / 没跳过的 hurdle → 被抓
        over = true;
        crashAt = ts;
        saveHi();
      }
    }

    draw(ts);
    raf = requestAnimationFrame(loop);
  }

  function saveHi() {
    if (score > best) {
      best = score;
      try { localStorage.setItem(HI_KEY, String(best)); } catch (e) {}
    }
  }

  // ---------------- 投影 ----------------
  function persp(z) { return 1 / (1 + Math.max(0, z) / 260); }
  function yAt(t) { return HORIZON + (BASE_Y - HORIZON) * t; }
  function xAt(lane, t) { return W / 2 + lane * LANE_HALF * t; }

  // ---------------- 绘制 ----------------
  function draw(ts) {
    // 天空
    var g = ctx.createLinearGradient(0, 0, 0, HORIZON + 60);
    g.addColorStop(0, '#0d1526'); g.addColorStop(1, '#28406e');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, HORIZON + 60);

    // 城市剪影（两层视差）
    skyline(0.012, '#141f38', 46, 118);
    skyline(0.03, '#1b2b4d', 26, 84);

    // 地面
    ctx.fillStyle = '#202c48'; ctx.fillRect(0, HORIZON, W, H - HORIZON);

    // 轨道区域（梯形）
    ctx.fillStyle = '#2a3856';
    ctx.beginPath();
    ctx.moveTo(W / 2 - LANE_HALF * 1.72 * persp(0), H);
    ctx.lineTo(W / 2 + LANE_HALF * 1.72 * persp(0), H);
    ctx.lineTo(W / 2 + LANE_HALF * 1.72 * 0.06, HORIZON + 2);
    ctx.lineTo(W / 2 - LANE_HALF * 1.72 * 0.06, HORIZON + 2);
    ctx.closePath(); ctx.fill();

    // 车道分隔虚线
    ctx.strokeStyle = 'rgba(180,200,240,.28)';
    for (var l = -0.5; l <= 0.5; l += 1) {
      ctx.beginPath();
      ctx.moveTo(xAt(l, persp(0)), H);
      ctx.lineTo(xAt(l, 0.06), HORIZON + 2);
      ctx.stroke();
    }

    // 移动的横向枕木（速度感）
    var gap = 130, off = dist % gap;
    ctx.fillStyle = 'rgba(160,180,220,.14)';
    for (var z = off; z < SPAWN_Z; z += gap) {
      var t = persp(z);
      if (t < 0.07) break;
      var y = yAt(t);
      var hw = LANE_HALF * 1.72 * t;
      ctx.fillRect(W / 2 - hw, y, hw * 2, Math.max(1, 9 * t));
    }

    // 实体（远 → 近）
    var sorted = ents.slice().sort(function (a, b) { return b.z - a.z; });
    for (var i = 0; i < sorted.length; i++) drawEnt(sorted[i]);

    // 玩家
    drawPlayer(ts);

    // 高速边缘速度线
    if (speed > 560 && !over) {
      ctx.strokeStyle = 'rgba(255,255,255,' + Math.min(0.35, (speed - 560) / 900) + ')';
      for (var s = 0; s < 6; s++) {
        var ly = 60 + ((s * 71 + dist * 0.7) % (H - 120));
        var len = 30 + (s * 37) % 60;
        ctx.beginPath();
        if (s % 2) { ctx.moveTo(0, ly); ctx.lineTo(len, ly); }
        else { ctx.moveTo(W, ly + 40); ctx.lineTo(W - len, ly + 40); }
        ctx.stroke();
      }
    }

    // 记分板
    ctx.fillStyle = '#fff'; ctx.font = 'bold 20px ui-monospace,Menlo,monospace'; ctx.textAlign = 'left';
    ctx.fillText('得分 ' + score, 18, 34);
    ctx.fillText('金币 ' + coinsN, 18, 62);
    ctx.textAlign = 'right';
    ctx.fillText('最高 ' + best, W - 18, 34);

    // 被抓 → 结算画面
    if (over) {
      ctx.fillStyle = 'rgba(8,13,26,' + Math.min(0.72, (ts - crashAt) / 500) + ')';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
      ctx.font = 'bold 34px "PingFang SC",sans-serif';
      ctx.fillText('被抓到了 · ' + score + ' 分', W / 2, H / 2 - 16);
      ctx.fillStyle = '#8fa3c6'; ctx.font = '16px "PingFang SC",sans-serif';
      ctx.fillText(score >= best && score > 0 ? '🏆 新纪录！' : '最高纪录 ' + best + ' · 回车再来一局 · ESC 退出', W / 2, H / 2 + 20);
    }
  }

  function skyline(par, color, minH, maxH) {
    var spacing = 90, off = (dist * par) % spacing;
    ctx.fillStyle = color;
    for (var x = -spacing + (-off); x < W + spacing; x += spacing) {
      var seed = Math.abs(Math.floor((x + off) / spacing)) % 7;
      var bh = minH + ((seed * 37) % (maxH - minH));
      var bw = 40 + (seed % 3) * 16;
      ctx.fillRect(x, HORIZON - bh, bw, bh);
    }
  }

  function drawEnt(e) {
    var t = persp(e.z);
    if (t < 0.06) return;
    var x = xAt(e.lane, t), y = yAt(t);
    if (e.kind === 'coin') {
      ctx.fillStyle = '#f5b942';
      ctx.beginPath(); ctx.arc(x, y - 26 * t, Math.max(2, 14 * t), 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#c98d1b';
      ctx.beginPath(); ctx.arc(x, y - 26 * t, Math.max(1.4, 9 * t), 0, Math.PI * 2); ctx.fill();
      if (t > 0.4) {
        ctx.fillStyle = '#fff3d6'; ctx.font = 'bold ' + Math.max(6, 11 * t) + 'px ui-monospace,monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('G', x, y - 26 * t);
      }
      return;
    }
    if (e.kind === 'hurdle') {
      var hw2 = 52 * t, hh = 44 * t;
      ctx.fillStyle = '#f0b429';
      ctx.fillRect(x - hw2, y - hh, hw2 * 2, hh);
      ctx.fillStyle = '#39435a';
      for (var s2 = -hw2; s2 < hw2; s2 += 16 * t) {
        ctx.fillRect(x + s2, y - hh, Math.max(1.5, 8 * t), hh);
      }
      ctx.fillStyle = '#222c44';
      ctx.fillRect(x - hw2, y - 6 * t, hw2 * 2, 6 * t);
      return;
    }
    // train：一节长车厢
    var tw = 84 * t, th = 120 * t;
    var yTop = y - th;
    ctx.fillStyle = '#2f5bea';
    ctx.fillRect(x - tw / 2, yTop, tw, th);
    ctx.fillStyle = '#4a74f0';
    ctx.fillRect(x - tw / 2, yTop, tw, Math.max(2, 12 * t));
    ctx.fillStyle = '#9db9ff';
    var winN = 4;
    for (var w2 = 0; w2 < winN; w2++) {
      var wy = yTop + (24 + w2 * 24) * t;
      if (wy > y - 14 * t) break;
      ctx.fillRect(x - tw / 2 + 12 * t, wy, tw - 24 * t, Math.max(1.5, 12 * t));
    }
    ctx.fillStyle = '#16213a';
    ctx.fillRect(x - tw / 2, y - 8 * t, tw, Math.max(2, 8 * t));   // 底盘
  }

  function drawPlayer(ts) {
    var x = xAt(player.laneX, 1);
    var y = BASE_Y - player.jumpY;
    var run = over ? 0 : Math.sin(dist * 0.05);

    // 影子
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath(); ctx.ellipse(x, BASE_Y + 6, 26 - player.jumpY * 0.06, 7, 0, 0, Math.PI * 2); ctx.fill();

    // 腿
    ctx.strokeStyle = '#1d2740'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - 6, y - 26); ctx.lineTo(x - 6 + run * 9, y - (player.air ? 14 : 2));
    ctx.moveTo(x + 6, y - 26); ctx.lineTo(x + 6 - run * 9, y - (player.air ? 20 : 2));
    ctx.stroke();

    // 身体（背包客风格：橙色卫衣 + 背包）
    ctx.fillStyle = '#f59e2b';
    rrect(x - 15, y - 62, 30, 38, 9); ctx.fill();
    ctx.fillStyle = '#2f5bea';                      // 背包
    rrect(x - 22, y - 56, 12, 24, 5); ctx.fill();

    // 头 + 帽子
    ctx.fillStyle = '#f5cfa8';
    ctx.beginPath(); ctx.arc(x, y - 72, 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e2554a';
    ctx.beginPath(); ctx.arc(x, y - 75, 11, Math.PI, 0); ctx.fill();
    ctx.fillRect(x - 13, y - 76, 26, 4);

    ctx.lineCap = 'butt'; ctx.lineWidth = 1;
  }

  function rrect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
})();
