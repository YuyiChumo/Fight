(function() {
  // 初始化画布等
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');

  // UI 状态管理
  let gameState = 'menu'; 
  let aiLevel = 5;
  let gameMode = 'pve';
  let isPaused = false;

  let p1Name = '🔥 铁拳';
  let p2Name = '⚡ 闪电 (AI)';
  let isEditingName = false;

  let dummyPinned = false;
  let isDraggingDummy = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  const DUMMY_DEFAULT_X = 550;

  const ARM_LENGTH_BASE = 30;
  const ARM_LENGTH_EXTEND = 84;
  const ARM_LENGTH_LOW = 72;
  const ARM_LENGTH_AIR = 60;

  // 实体数据
  const P1 = {
    x:200, y:300, w:48, h:78, vx:0, vy:0, speed:4.6, jumpForce:-12, jumpForce2:-11,
    grounded:true, facing:1, jumpCount: 0, hp:100, maxHp:100, energy:0,
    attackTimer:0, attackCooldown:0, attackType:'none', hitStun:0,
    color:'#ff2a2a', accent:'#ff8a8a', trail:[], blocking:false, blockFlash:0, isAI:false,
    doubleJumpFx: 0, fireballCooldown: 0, burnTimer: 0, burnTickTimer: 0, burnOwner: 0, burnFxTimer: 0
  };

  const P2 = {
    x:550, y:300, w:48, h:78, vx:0, vy:0, speed:4.6, jumpForce:-12, jumpForce2:-11,
    grounded:true, facing:-1, jumpCount: 0, hp:100, maxHp:100, energy:0,
    attackTimer:0, attackCooldown:0, attackType:'none', hitStun:0,
    color:'#ff2a2a', accent:'#ff8a8a', trail:[], blocking:false, blockFlash:0, isAI:true,
    doubleJumpFx: 0, fireballCooldown: 0, burnTimer: 0, burnTickTimer: 0, burnOwner: 0, burnFxTimer: 0
  };

  const GROUND_Y = 360;
  P1.y = GROUND_Y - P1.h;
  P2.y = GROUND_Y - P2.h;

  // 战斗数值
  const GROUND_DMG = 7, GROUND_RANGE = ARM_LENGTH_EXTEND, GROUND_KB = 7.5, GROUND_ENERGY = 10;
  const LOW_DMG = 12, LOW_RANGE = ARM_LENGTH_LOW, LOW_KB = 9.0, LOW_ENERGY = 12;
  const AIR_DMG = 9, AIR_RANGE = ARM_LENGTH_AIR, AIR_KB = 10, AIR_ENERGY = 12;
  const ENERGY_MAX = 100;
  const ATTACK_COOLDOWN = 16;
  const BLOCK_REDUCTION = 0.25;
  const MAX_JUMPS = 2;

  const FIREBALL_DMG = 3, FIREBALL_KB = 3.0, FIREBALL_RADIUS = 12;
  const FIREBALL_GRAVITY = 0.22, FIREBALL_COOLDOWN = 45, FIREBALL_ENERGY_GAIN = 8;
  const FIREBALL_COLOR = '#ff7733', FIREBALL_GLOW = '#ffaa44', FIREBALL_PARTICLE_COLOR = '#ff5522';

  const BURN_DURATION = 60, BURN_TICK_INTERVAL = 60, BURN_DMG = 3, BURN_MAX_TICKS = 3;

  const BOSS_PHASE2_HP = 55, BOSS_PHASE3_HP = 25;
  const LEVEL_NAMES = ['初学','新手','入门','普通','熟练','进阶','高手','精英','大师','传说','BOSS'];
  const BOSS_LEVEL = 11;

  const keys = {
    a:false, d:false, w:false, f:false, s:false, g:false,
    ArrowLeft:false, ArrowRight:false, ArrowUp:false, ArrowDown:false, k:false, j:false
  };

  let hitEffects = [], particles = [], screenShake = 0;
  let winner = null, aiTimer = 0, aiDecision = 'idle', trainingDummyTimer = 0;
  let totalDamage = 0, wPressed = false, upPressed = false, fireballs = [];
  let phaseToastTimer = 0;

  // BOSS 专属状态
  const bossState = {
    phase: 'neutral', phaseTimer: 0, lastPlayerAttack: 0, punishWindow: 0,
    comboIndex: 0, comboTimer: 0, feintTimer: 0, isFeinting: false,
    dodgeTarget: null, preferredRange: 90, rageMode: false,
    regenCooldown: 0, regenTimer: 0, superArmorTimer: 0,
    chargeTimer: 0, isCharging: false, phaseAnnounced: 1,
    antiKiteTimer: 0, interceptTimer: 0, lastIncomingFireball: null,
    interceptTarget: null, interceptFlash: 0,
    memory: {
      playerJumpCount: 0, playerBlockStreak: 0, playerLastMoveDir: 0,
      playerIdleTime: 0, lastBlockTime: 0, blockCooldown: 0,
      consecutiveRangedDodge: 0, consecutiveFireballDodged: 0
    }
  };
  let bossAuraTimer = 0, bossCapeTimer = 0;

  // 辅助判断
  function isBossActive() {
    return aiLevel === BOSS_LEVEL && gameMode === 'pve' && P2.isAI;
  }

  function getBossCurrentPhase() {
    if (!isBossActive()) return 0;
    if (P2.hp <= BOSS_PHASE3_HP) return 3;
    if (P2.hp <= BOSS_PHASE2_HP) return 2;
    return 1;
  }

  function showPhaseToast(text) {
    const toast = document.getElementById('bossPhaseToast');
    toast.textContent = text;
    toast.classList.add('show');
    phaseToastTimer = 90;
  }

  function updatePhaseToast() {
    if (phaseToastTimer > 0) {
      phaseToastTimer--;
      if (phaseToastTimer <= 0) document.getElementById('bossPhaseToast').classList.remove('show');
    }
  }

  // UI 更新方法
  function updateNameDisplay() {
    const p1El = document.getElementById('p1NameDisplay');
    const p2El = document.getElementById('p2NameDisplay');
    if (!isEditingName || p1El.contentEditable !== 'true') p1El.textContent = p1Name;
    if (!isEditingName || p2El.contentEditable !== 'true') {
      let displayName = p2Name;
      if (gameMode === 'pvp') displayName = p2Name.replace(/\s*\(AI\)$/, '').replace(/\s*\(BOSS\)$/, '');
      else if (gameMode === 'training') displayName = '🥊 ' + (p2Name.replace(/^[^\s]+\s/, '').replace(/\(AI\)|\(BOSS\)/g, '') || '木桩');
      else if (aiLevel === BOSS_LEVEL && !p2Name.includes('BOSS')) displayName = p2Name.replace(/\s*\(AI\)$/, '') + ' (BOSS)';
      p2El.textContent = displayName;
    }
    updateBossUI();
  }

  function updateBossUI() {
    const hp2Fill = document.getElementById('hp2-fill');
    const energy2Fill = document.getElementById('energy2-fill');
    const hp2BarBg = document.getElementById('hp2-bar-bg');
    hp2BarBg.querySelectorAll('.hp-phase-mark').forEach(m => m.remove());

    if (isBossActive()) {
      hp2Fill.classList.add('boss-hp');
      energy2Fill.classList.add('boss-energy');
      const mark2 = document.createElement('div');
      mark2.className = 'hp-phase-mark'; mark2.style.left = (BOSS_PHASE2_HP / P2.maxHp * 100) + '%';
      hp2BarBg.appendChild(mark2);
      const mark3 = document.createElement('div');
      mark3.className = 'hp-phase-mark'; mark3.style.left = (BOSS_PHASE3_HP / P2.maxHp * 100) + '%';
      hp2BarBg.appendChild(mark3);
    } else {
      hp2Fill.classList.remove('boss-hp');
      energy2Fill.classList.remove('boss-energy');
    }
  }

  function updateHealthUI() {
    document.getElementById('hp1-fill').style.width = Math.max(0, (P1.hp / P1.maxHp) * 100) + '%';
    document.getElementById('hp2-fill').style.width = Math.max(0, (P2.hp / P2.maxHp) * 100) + '%';
    document.getElementById('hp1-text').innerText = Math.max(0, P1.hp);
    document.getElementById('hp2-text').innerText = Math.max(0, P2.hp);
  }

  function updateEnergyUI() {
    document.getElementById('energy1-fill').style.width = Math.min(100, P1.energy) + '%';
    document.getElementById('energy2-fill').style.width = Math.min(100, P2.energy) + '%';
  }

  function updatePinToggleUI() {
    document.getElementById('pinToggle').classList.toggle('pinned', dummyPinned);
  }

  function updateModeUI() {
    const p2Controls = document.getElementById('p2Controls');
    const trainingControls = document.getElementById('trainingControls');
    if (gameMode === 'pvp') {
      p2Controls.innerHTML = '<kbd>←</kbd><kbd>→</kbd> 移动 · <kbd>↑</kbd> 跳(二段) · <kbd>K</kbd> 地面拳 · <kbd>J</kbd> 下勾拳 · <kbd>↓</kbd> 火球 · 空中<kbd>K</kbd> 空中拳';
      trainingControls.classList.remove('show');
    } else if (gameMode === 'training') {
      p2Controls.textContent = '拖动木桩 · 练习连招';
      trainingControls.classList.add('show');
    } else {
      p2Controls.textContent = 'AI 控制';
      trainingControls.classList.remove('show');
    }
    updateCanvasCursor(); updateNameDisplay(); updateBossUI();
  }

  function updateCanvasCursor() {
    if (gameMode === 'training') {
      canvas.style.cursor = isDraggingDummy ? 'grabbing' : (dummyPinned ? 'not-allowed' : 'grab');
    } else {
      canvas.style.cursor = 'default';
    }
  }

  function resetGame() {
    P1.hp = 100; P1.energy = 0; P1.x = 200; P1.y = GROUND_Y - P1.h; P1.vx = 0; P1.vy = 0;
    P1.attackTimer = 0; P1.attackCooldown = 0; P1.hitStun = 0; P1.attackType = 'none'; P1.trail = [];
    P1.blocking = false; P1.blockFlash = 0; P1.facing = 1; P1.jumpCount = 0; P1.doubleJumpFx = 0; P1.fireballCooldown = 0;
    P1.burnTimer = 0; P1.burnTickTimer = 0; P1.burnOwner = 0; P1.burnFxTimer = 0;
    
    P2.hp = 100; P2.energy = 0; P2.x = DUMMY_DEFAULT_X; P2.y = GROUND_Y - P2.h; P2.vx = 0; P2.vy = 0;
    P2.attackTimer = 0; P2.attackCooldown = 0; P2.hitStun = 0; P2.attackType = 'none'; P2.trail = [];
    P2.blocking = false; P2.blockFlash = 0; P2.facing = -1; P2.jumpCount = 0; P2.doubleJumpFx = 0; P2.fireballCooldown = 0;
    P2.burnTimer = 0; P2.burnTickTimer = 0; P2.burnOwner = 0; P2.burnFxTimer = 0;
    
    hitEffects = []; particles = []; screenShake = 0; fireballs = [];
    winner = null; aiTimer = 0; aiDecision = 'idle'; trainingDummyTimer = 0; totalDamage = 0;
    isDraggingDummy = false; wPressed = false; upPressed = false;
    bossAuraTimer = 0; bossCapeTimer = 0; phaseToastTimer = 0;
    document.getElementById('bossPhaseToast').classList.remove('show');

    bossState.phase = 'neutral'; bossState.phaseTimer = 0; bossState.lastPlayerAttack = 0;
    bossState.punishWindow = 0; bossState.comboIndex = 0; bossState.comboTimer = 0; bossState.feintTimer = 0;
    bossState.isFeinting = false; bossState.dodgeTarget = null; bossState.rageMode = false;
    bossState.regenCooldown = 0; bossState.regenTimer = 0; bossState.superArmorTimer = 0;
    bossState.chargeTimer = 0; bossState.isCharging = false; bossState.phaseAnnounced = 1;
    bossState.antiKiteTimer = 0; bossState.interceptTimer = 0; bossState.lastIncomingFireball = null;
    bossState.interceptTarget = null; bossState.interceptFlash = 0;
    bossState.memory = {
      playerJumpCount: 0, playerBlockStreak: 0, playerLastMoveDir: 0,
      playerIdleTime: 0, lastBlockTime: 0, blockCooldown: 0,
      consecutiveRangedDodge: 0, consecutiveFireballDodged: 0
    };

    if (gameMode === 'training') {
      P2.hp = 100; P2.isAI = false; P1.isAI = false; dummyPinned = false; updatePinToggleUI();
    } else if (gameMode === 'pvp') {
      P2.isAI = false; P1.isAI = false;
    } else {
      P2.isAI = true; P1.isAI = false;
    }

    updateHealthUI(); updateEnergyUI(); updateModeUI(); updateNameDisplay();
  }

  // 核心战斗逻辑
  function doJump(player) {
    if (gameState !== 'playing' || player.hitStun > 0 || isEditingName) return;
    if (player.grounded) {
      player.vy = player.jumpForce; player.grounded = false; player.jumpCount = 1; player.blocking = false;
    } else if (player.jumpCount < MAX_JUMPS) {
      player.vy = player.jumpForce2; player.jumpCount++; player.doubleJumpFx = 12;
      for (let i = 0; i < 10; i++) {
        particles.push({
          x: player.x + player.w/2 + (Math.random()-0.5)*40, y: player.y + player.h - 10 + (Math.random()-0.5)*20,
          vx: (Math.random()-0.5)*6, vy: Math.random()*4 + 1, life: 0.7, size: 2 + Math.random()*4,
          color: isBossActive() && player === P2 ? '#ff3388' : player.color
        });
      }
      screenShake = 2;
    }
  }

  function shootFireball(player, isP1) {
    if (gameState !== 'playing' || player.hitStun > 0 || player.fireballCooldown > 0 || isEditingName) return false;
    player.fireballCooldown = FIREBALL_COOLDOWN; player.blocking = false; player.blockFlash = 0;

    const opponent = isP1 ? P2 : P1;
    if (player.x < opponent.x) player.facing = 1; else player.facing = -1;

    const dir = player.facing;
    const startX = player.x + player.w/2 + dir * 22;
    const startY = player.y + 30;

    let vy0 = -6.2, vx = 0, vyAdjust = 0;
    const distToOpponent = Math.abs(opponent.x - player.x);

    if (player.grounded) {
      vx = dir * (5.2 + Math.min(4.5, distToOpponent * 0.022));
      if (!opponent.grounded) vyAdjust = -1.2;
    } else {
      vy0 = -1.5;
      vx = dir * (6.0 + Math.min(4.0, distToOpponent * 0.02));
      vyAdjust = (!opponent.grounded && opponent.y < player.y - 30) ? -4.0 : 0;
    }

    fireballs.push({
      x: startX, y: startY, vx: vx, vy: vy0 + vyAdjust, radius: FIREBALL_RADIUS, owner: isP1 ? 1 : 2,
      color: FIREBALL_COLOR, colorGlow: FIREBALL_GLOW, life: 120, trail: [], intercepted: false, interceptFx: 0
    });

    for (let i = 0; i < 12; i++) {
      particles.push({
        x: startX + (Math.random()-0.5)*10, y: startY + (Math.random()-0.5)*10,
        vx: dir * (2 + Math.random()*4) + (Math.random()-0.5)*3, vy: (Math.random()-0.5)*5 - 1.5,
        life: 0.6, size: 2 + Math.random()*4, color: Math.random() < 0.5 ? '#ffaa44' : '#ff5522'
      });
    }
    screenShake = 3; return true;
  }

  function tryAttack(attacker, defender, type) {
    if (gameState !== 'playing' || attacker.attackCooldown > 0 || attacker.hitStun > 0) return false;
    if (type === 'air' && attacker.grounded) return false;
    if (type !== 'air' && !attacker.grounded) return false;

    if (attacker.x < defender.x) attacker.facing = 1; else attacker.facing = -1;
    attacker.blocking = false; attacker.blockFlash = 0;
    attacker.attackTimer = 8;
    attacker.attackCooldown = (type === 'low') ? ATTACK_COOLDOWN + 6 : ATTACK_COOLDOWN;
    attacker.attackType = type;
    attacker.vx += attacker.facing * ((type === 'ground') ? 1.8 : (type === 'low' ? 1.2 : 2.2));
    return true;
  }

  // 碰撞与伤害
  function applyBurn(target, owner) {
    target.burnTimer = BURN_DURATION * BURN_MAX_TICKS + 10;
    target.burnTickTimer = BURN_TICK_INTERVAL; target.burnOwner = owner; target.burnFxTimer = 0;
    hitEffects.push({ x: target.x + target.w/2, y: target.y - 20, text: '🔥 灼烧!', life: 1.0, vy: -1.5, color: '#ff5522' });
  }

  function updateBurn(player) {
    if (player.burnTimer > 0) {
      player.burnTimer--; player.burnFxTimer++;
      if (Math.random() < 0.3) {
        particles.push({
          x: player.x + Math.random() * player.w, y: player.y + Math.random() * player.h,
          vx: (Math.random() - 0.5) * 1.5, vy: -1 - Math.random() * 2,
          life: 0.5, size: 1.5 + Math.random() * 2.5, color: Math.random() < 0.6 ? '#ff5522' : '#ffaa44'
        });
      }
      if (player.burnTickTimer > 0) {
        player.burnTickTimer--;
        if (player.burnTickTimer <= 0) {
          if (gameMode === 'training') { player.hp = Math.max(5, player.hp - BURN_DMG); totalDamage += BURN_DMG; }
          else player.hp = Math.max(0, player.hp - BURN_DMG);
          
          hitEffects.push({ x: player.x + player.w/2 + (Math.random()-0.5)*20, y: player.y - 10, text: '-' + BURN_DMG, life: 0.7, vy: -1.0, color: '#ff5522' });
          screenShake = Math.max(screenShake, 1); updateHealthUI();

          if (player.hp <= 0 && gameState === 'playing' && gameMode !== 'training') triggerGameover(player.burnOwner === 1);
          if (player.burnTimer > 0) player.burnTickTimer = BURN_TICK_INTERVAL;
        }
      }
    }
  }

  function triggerGameover(attackerIsP1) {
    gameState = 'gameover';
    const winName = attackerIsP1 ? p1Name : p2Name;
    winner = (winName.replace(/\s*\(AI\)$/,'').replace(/\s*\(BOSS\)$/,'')) + ' 胜利!';
    document.getElementById('gameoverTitle').textContent = '🏆 ' + winner;
    document.getElementById('gameoverOverlay').classList.add('show');
    for (let i = 0; i < 30; i++) {
      particles.push({
        x: canvas.width/2 + (Math.random()-0.5)*240, y: canvas.height/2 + (Math.random()-0.5)*200,
        vx: (Math.random()-0.5)*10, vy: (Math.random()-0.5)*10, life: 1.0, size: 2 + Math.random()*6,
        color: attackerIsP1 ? '#ffbb77' : '#77bbff'
      });
    }
  }

  function applyFireballHit(fb, target, attackerIsP1) {
    let finalDmg = FIREBALL_DMG, isBlocked = false;
    if (target.blocking && gameMode !== 'training') {
      if ((fb.vx > 0 && target.facing === -1) || (fb.vx < 0 && target.facing === 1)) isBlocked = true;
    }
    let isSuperArmor = isBossActive() && target === P2 && bossState.superArmorTimer > 0;

    if (isBlocked) {
      finalDmg = Math.max(1, Math.floor(FIREBALL_DMG * BLOCK_REDUCTION));
      target.blockFlash = 10;
      for (let i = 0; i < 6; i++) {
        particles.push({
          x: target.x + target.w/2 + (Math.random()-0.5)*20, y: target.y + 30 + (Math.random()-0.5)*24,
          vx: (Math.random()-0.5)*4, vy: (Math.random()-0.8)*4 - 1, life: 0.4, size: 1.5 + Math.random()*2.5, color: '#aaddff'
        });
      }
      hitEffects.push({ x: target.x + 10, y: target.y - 5, text: '🛡️', life: 0.45, vy: -0.9, color: '#88ccff' });
    } else {
      if (isBossActive() && target === P2 && !bossState.rageMode && bossState.regenCooldown <= 0 && Math.random() < 0.12) {
        finalDmg = Math.max(1, Math.floor(finalDmg * 0.5));
        bossState.regenTimer = 40; bossState.regenCooldown = 180;
        hitEffects.push({ x: target.x + 10, y: target.y - 40, text: '吸收!', life: 0.9, vy: -1.5, color: '#88ff88' });
      }
      for (let i = 0; i < 12; i++) {
        particles.push({
          x: fb.x + (Math.random()-0.5)*20, y: fb.y + (Math.random()-0.5)*20,
          vx: (Math.random()-0.5)*7, vy: (Math.random()-0.8)*7, life: 0.7, size: 2 + Math.random()*5,
          color: Math.random() < 0.5 ? FIREBALL_COLOR : FIREBALL_PARTICLE_COLOR
        });
      }
      hitEffects.push({ x: target.x + (attackerIsP1 ? 10 : -10), y: target.y - 8, text: '🔥', life: 0.55, vy: -1.3, color: fb.colorGlow });
      applyBurn(target, fb.owner);
    }

    if (gameMode === 'training') {
      target.hp = Math.max(5, target.hp - finalDmg); totalDamage += finalDmg;
      hitEffects.push({ x: target.x + 10, y: target.y - 30, text: '-' + finalDmg, life: 0.7, vy: -1.0, color: '#ff8888' });
    } else {
      target.hp = Math.max(0, target.hp - finalDmg);
    }

    const knockDir = Math.sign(fb.vx) || 1;
    if (!isSuperArmor) {
      target.vx += knockDir * FIREBALL_KB;
      if (!isBlocked) { target.vy -= 2.5; target.hitStun = 10; }
      else target.vx += knockDir * 2.0;
    } else {
      target.vx += knockDir * FIREBALL_KB * 0.15; target.hitStun = Math.max(0, target.hitStun - 5);
    }

    const attacker = attackerIsP1 ? P1 : P2;
    attacker.energy = Math.min(ENERGY_MAX, attacker.energy + FIREBALL_ENERGY_GAIN);
    screenShake = isBlocked ? 2 : 5; updateHealthUI();

    if (target.hp <= 0 && gameState === 'playing' && gameMode !== 'training') triggerGameover(attackerIsP1);
  }

  function checkAttackHit(attacker, defender, isP1) {
    if (attacker.attackTimer <= 0 || attacker.hitStun > 0 || defender.hp <= 0) return;
    if (attacker.attackTimer < 6 && attacker.attackTimer > 1) {
      let dmg = 0, range = 0, kb = 0, energyGain = 0, effectColor = '', effectText = '';
      if (attacker.attackType === 'ground') {
        dmg = GROUND_DMG; range = GROUND_RANGE; kb = GROUND_KB; energyGain = GROUND_ENERGY;
        effectColor = '#ffbb77'; effectText = '💥';
      } else if (attacker.attackType === 'low') {
        dmg = LOW_DMG; range = LOW_RANGE; kb = LOW_KB; energyGain = LOW_ENERGY;
        effectColor = '#ffaa00'; effectText = '💢';
      } else if (attacker.attackType === 'air') {
        dmg = AIR_DMG; range = AIR_RANGE; kb = AIR_KB; energyGain = AIR_ENERGY;
        effectColor = '#ffdd44'; effectText = '💢';
      } else return;

      const dx = defender.x - attacker.x, dy = defender.y - attacker.y;
      if (Math.sign(dx) !== attacker.facing) return;
      if (attacker.attackType === 'low' && !defender.grounded) return;

      const dist = Math.abs(dx), verticalDiff = Math.abs(dy);
      let vTolerance = 50;
      if (attacker.attackType === 'low') vTolerance = 42;
      if (attacker.attackType === 'air') vTolerance = 80;

      if (dist < range && verticalDiff < vTolerance) {
        // ===== 破防机制：下勾拳无视防御 =====
        let isBlocked = false;
        if (defender.blocking && gameMode !== 'training') {
          const attackFromFront = (attacker.x - defender.x) * defender.facing > 0;
          // 如果是下勾拳，则直接击破防御，不算作格挡
          if (attackFromFront && attacker.attackType !== 'low') {
            isBlocked = true;
          }
        }
        
        let isSuperArmor = isBossActive() && !isP1 && bossState.superArmorTimer > 0;
        let finalDmg = isBlocked ? Math.max(1, Math.floor(dmg * BLOCK_REDUCTION)) : dmg;

        if (isBlocked) {
          defender.blockFlash = 10;
          for (let i = 0; i < 6; i++) {
            particles.push({
              x: defender.x + (defender.facing === 1 ? 10 : defender.w - 10) + (Math.random() - 0.5) * 20,
              y: defender.y + 30 + (Math.random() - 0.5) * 24,
              vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.8) * 4 - 1, life: 0.4, size: 1.5 + Math.random() * 2.5,
              color: (isBossActive() && defender === P2) ? '#ff66aa' : '#aaddff'
            });
          }
          hitEffects.push({ x: defender.x + (isP1 ? 10 : -10), y: defender.y - 5, text: '🛡️', life: 0.45, vy: -0.9, color: (isBossActive() && defender === P2) ? '#ff3388' : '#88ccff' });
          energyGain = Math.floor(energyGain * 0.3); kb *= 0.3;
          if (aiLevel === BOSS_LEVEL && isP1) bossState.memory.playerBlockStreak++;
        } else {
          // 如果是下勾拳破防，在这里加一个特殊的视觉提示 (可选)
          if (attacker.attackType === 'low' && defender.blocking) {
             hitEffects.push({ x: defender.x, y: defender.y - 20, text: '破防!', life: 0.8, vy: -1.5, color: '#ff3300' });
             screenShake = 8;
          }

          if (aiLevel === BOSS_LEVEL && isP1) { bossState.lastPlayerAttack = 30; bossState.memory.playerBlockStreak = 0; }
          const particleCount = (attacker.attackType === 'low') ? 10 : 6;
          const bossAttack = isBossActive() && attacker === P2;
          for (let i = 0; i < particleCount; i++) {
            particles.push({
              x: (attacker.x + defender.x) / 2 + (Math.random() - 0.5) * 20,
              y: (attacker.y + defender.y) / 2 - 8 + (Math.random() - 0.5) * 20,
              vx: (Math.random() - 0.5) * 5, vy: (Math.random() - 0.8) * 5, life: 0.6, size: 1.5 + Math.random() * 4,
              color: bossAttack ? '#ff3388' : (isP1 ? (attacker.attackType === 'low' ? '#ffaa00' : '#ffbb77') : (attacker.attackType === 'low' ? '#00aaff' : '#77bbff'))
            });
          }
          hitEffects.push({
            x: defender.x + (isP1 ? 10 : -10), y: defender.y - 6,
            text: attacker.attackType === 'low' ? '💢' : effectText, life: attacker.attackType === 'low' ? 0.5 : 0.45, vy: -1.2,
            color: bossAttack ? '#ff3388' : (attacker.attackType === 'low' ? '#ffcc00' : effectColor)
          });
        }

        if (gameMode === 'training') {
          defender.hp = Math.max(5, defender.hp - finalDmg); totalDamage += finalDmg;
          hitEffects.push({ x: defender.x + (isP1 ? 10 : -10), y: defender.y - 30, text: '-' + finalDmg, life: 0.7, vy: -1.0, color: '#ff8888' });
        } else {
          if (isBossActive() && !isP1 && !bossState.rageMode && bossState.regenCooldown <= 0 && Math.random() < 0.12) {
            finalDmg = Math.max(1, Math.floor(finalDmg * 0.5));
            bossState.regenTimer = 40; bossState.regenCooldown = 180;
            hitEffects.push({ x: defender.x + 10, y: defender.y - 40, text: '吸收!', life: 0.9, vy: -1.5, color: '#88ff88' });
          }
          defender.hp = Math.max(0, defender.hp - finalDmg);
        }

        const knockDir = Math.sign(dx) || attacker.facing;
        if (!isSuperArmor) defender.vx += knockDir * kb;
        else defender.vx += knockDir * kb * 0.15;

        if (!isBlocked && !isSuperArmor) {
          if (attacker.attackType === 'air') defender.vy -= 4.5;
          else if (attacker.attackType === 'low') defender.vy -= 2.5;
          else defender.vy -= 2.0;
          defender.hitStun = (attacker.attackType === 'air') ? 13 : (attacker.attackType === 'low' ? 14 : 9);
        } else if (isSuperArmor) defender.hitStun = Math.max(0, defender.hitStun - 5);
        else defender.vx += knockDir * 2.0;

        attacker.energy = Math.min(ENERGY_MAX, attacker.energy + energyGain);
        // 如果是破防，震动稍微大一点
        if (attacker.attackType === 'low' && defender.blocking) screenShake = 10;
        else screenShake = isBlocked ? 2 : ((attacker.attackType === 'low') ? 6 : (attacker.attackType === 'air') ? 5 : 3);

        updateHealthUI();

        if (defender.hp <= 0 && gameState === 'playing' && gameMode !== 'training') triggerGameover(isP1);
        attacker.attackTimer = 2;
      }
    }
  }

  // AI 控制
  function tryBossFireballIntercept() {
    if (!isBossActive() || bossState.interceptTimer > 0 || P2.hitStun > 0 || P2.attackTimer > 0 || P2.fireballCooldown > 0 || gameState !== 'playing') return false;
    const diff = window.GameAI.getAIParams(aiLevel);
    const threateningFireballs = fireballs.filter(fb => {
      if (fb.owner !== 1 || fb.intercepted) return false;
      const distX = Math.abs(fb.x - (P2.x + P2.w / 2));
      return ((fb.vx > 0 && P2.x + P2.w / 2 > fb.x) || (fb.vx < 0 && P2.x + P2.w / 2 < fb.x)) && distX < 320 && distX > 60;
    });
    if (threateningFireballs.length === 0) return false;

    threateningFireballs.sort((a, b) => (Math.abs(a.x - P2.x) + Math.abs(a.y - P2.y)) - (Math.abs(b.x - P2.x) + Math.abs(b.y - P2.y)));
    const target = threateningFireballs[0];

    let interceptProb = diff.fireballInterceptChance + (bossState.rageMode ? 0.15 : 0);
    interceptProb = Math.min(0.95, interceptProb + (1 - Math.min(1, Math.abs(target.x - P2.x) / 320)) * 0.2);

    if (Math.random() > interceptProb) return false;
    
    // 执行空摘
    const bossX = P2.x + P2.w / 2, bossY = P2.y + 30;
    const dx = target.x - bossX, dy = target.y - bossY;
    const dirX = Math.sign(dx) || 1, approxTime = Math.min(18, Math.max(6, Math.abs(dx) / 8));
    const vx = dirX * (Math.abs(dx) / approxTime);
    const vy = (dy - 0.5 * FIREBALL_GRAVITY * approxTime * approxTime) / approxTime;

    fireballs.push({
      x: bossX + dirX * 20, y: bossY, vx: vx, vy: vy, radius: FIREBALL_RADIUS, owner: 2,
      color: FIREBALL_COLOR, colorGlow: FIREBALL_GLOW, life: 90, trail: [], intercepted: false, interceptFx: 0, isInterceptBall: true
    });
    bossState.interceptTimer = 45; bossState.interceptFlash = 20; bossState.interceptTarget = target;
    P2.fireballCooldown = Math.max(P2.fireballCooldown, 20);

    for (let i = 0; i < 14; i++) {
      particles.push({
        x: bossX + dirX * 15 + (Math.random()-0.5)*20, y: bossY + (Math.random()-0.5)*20,
        vx: dirX * (2 + Math.random()*4) + (Math.random()-0.5)*2, vy: (Math.random()-0.5)*4 - 1,
        life: 0.6, size: 2 + Math.random()*5, color: FIREBALL_PARTICLE_COLOR
      });
    }
    hitEffects.push({ x: bossX + dirX * 25, y: bossY - 20, text: '🔮 空摘!', life: 0.8, vy: -1.5, color: '#cc88ff' });
    screenShake = 4;
    return true;
  }

  function updateBossAI() {
    if (gameState !== 'playing' || P2.hitStun > 0) return;

    const currentPhase = getBossCurrentPhase();
    if (currentPhase > bossState.phaseAnnounced) {
      bossState.phaseAnnounced = currentPhase;
      if (currentPhase === 2) { bossState.rageMode = false; showPhaseToast('⚡ BOSS 第二阶段：战术升级 ⚡'); }
      else if (currentPhase === 3) { bossState.rageMode = true; bossState.superArmorTimer = 9999; showPhaseToast('💀 BOSS 狂暴模式：霸体激活 💀'); }
    }

    if (bossState.lastPlayerAttack > 0) bossState.lastPlayerAttack--;
    if (bossState.punishWindow > 0) bossState.punishWindow--;
    if (bossState.memory.blockCooldown > 0) bossState.memory.blockCooldown--;
    if (bossState.regenCooldown > 0) bossState.regenCooldown--;
    if (bossState.chargeTimer > 0) bossState.chargeTimer--;
    if (bossState.interceptTimer > 0) bossState.interceptTimer--;
    if (bossState.interceptFlash > 0) bossState.interceptFlash--;

    if (bossState.regenTimer > 0) {
      bossState.regenTimer--;
      if (P2.hp < P2.maxHp) {
        P2.hp = Math.min(P2.maxHp, P2.hp + 0.6);
        if (Math.random() < 0.3) {
          particles.push({
            x: P2.x + P2.w/2 + (Math.random()-0.5)*40, y: P2.y + P2.h/2 + (Math.random()-0.5)*40,
            vx: (Math.random()-0.5)*2, vy: -Math.random()*2 - 1, life: 0.8, size: 2 + Math.random()*3, color: '#66ff99'
          });
        }
        updateHealthUI();
      }
    }

    const dx = P1.x - P2.x, dist = Math.abs(dx), dy = P2.y - P1.y;
    if (P2.attackTimer <= 0) P2.facing = dx > 0 ? 1 : -1;
    bossAuraTimer = (bossAuraTimer + 1) % 60; bossCapeTimer = (bossCapeTimer + 1) % 120;

    if (bossState.phaseTimer > 0) bossState.phaseTimer--;
    if (bossState.comboTimer > 0) bossState.comboTimer--;
    if (bossState.feintTimer > 0) bossState.feintTimer--;

    const playerIsAttacking = P1.attackTimer > 0;
    const playerIsRecovering = P1.attackCooldown > 0 && P1.attackTimer <= 0;
    const playerIsJumping = !P1.grounded;
    const playerIsVeryFar = dist > 280;

    if (playerIsVeryFar) bossState.memory.consecutiveRangedDodge++;
    else if (dist < 150) bossState.memory.consecutiveRangedDodge = 0;

    if (bossState.memory.consecutiveRangedDodge > 40 && !bossState.isCharging) {
      bossState.isCharging = true; bossState.chargeTimer = 50; bossState.phase = 'charge';
      bossState.phaseTimer = 50; bossState.memory.consecutiveRangedDodge = 0;
    }

    let shouldBlock = false;
    if (playerIsAttacking && P2.attackTimer <= 0 && bossState.memory.blockCooldown <= 0) {
      let threatRange = P1.attackType === 'low' ? LOW_RANGE + 15 : (P1.attackType === 'air' ? AIR_RANGE + 20 : GROUND_RANGE + 15);
      if (dist < threatRange && Math.abs(dy) < 70) {
        let blockProb = 0.45 + (P1.energy > 60 ? 0.15 : 0) - (bossState.lastPlayerAttack > 15 ? 0.1 : 0) + (bossState.rageMode ? 0.1 : 0);
        if (Math.random() < blockProb) shouldBlock = true;
      }
    }
    if (P1.attackType === 'air' && P2.grounded && Math.abs(dy) > 60) shouldBlock = false;
    
    // BOSS 如果遇到下勾拳，不再傻傻防御（AI高级逻辑）
    if (P1.attackType === 'low') shouldBlock = false;

    if (tryBossFireballIntercept()) return;

    if (shouldBlock) {
      P2.blocking = true; bossState.memory.lastBlockTime = 30; bossState.memory.blockCooldown = 8;
      P2.vx *= 0.7; return;
    } else if (!playerIsAttacking) P2.blocking = false;

    if (bossState.phase !== 'bait') P2.blocking = false;

    if (bossState.isCharging && bossState.chargeTimer > 0) {
      if (dx > 0) P2.vx += 2.0; else P2.vx -= 2.0;
      if (P2.attackCooldown <= 0 && dist < 100) {
        Math.random() < 0.5 ? tryAttack(P2, P1, 'low') : tryAttack(P2, P1, 'ground');
        bossState.isCharging = false; bossState.phase = 'neutral';
      }
      bossState.superArmorTimer = Math.max(bossState.superArmorTimer, 20);
      if (dist < 80) { bossState.isCharging = false; bossState.phase = 'neutral'; }
      return;
    } else if (bossState.isCharging) bossState.isCharging = false;

    const diff = window.GameAI.getAIParams(aiLevel);
    if (dist > 180 && P2.fireballCooldown <= 0 && P2.grounded && P2.attackTimer <= 0 && P2.hitStun <= 0) {
      if (Math.random() < diff.fireballChance) shootFireball(P2, false);
    }

    if (bossState.phaseTimer <= 0 && !shouldBlock) {
      if (bossState.rageMode) {
        if (playerIsRecovering && dist < 150) { bossState.phase = 'punish'; bossState.phaseTimer = 8; }
        else if (playerIsJumping && dist < 160) { bossState.phase = 'aerial'; bossState.phaseTimer = 12; }
        else if (dist > 150) { bossState.phase = 'rush'; bossState.phaseTimer = 10; }
        else if (dist > 80) { bossState.phase = Math.random() < 0.7 ? 'rush' : 'combo'; bossState.phaseTimer = 12; }
        else { bossState.phase = 'combo'; bossState.comboIndex = 0; bossState.phaseTimer = 20; }
      } else if (currentPhase === 2) {
        if (playerIsRecovering && dist < 130) { bossState.phase = 'punish'; bossState.phaseTimer = 9; }
        else if (playerIsJumping && dist < 150) { bossState.phase = 'aerial'; bossState.phaseTimer = 13; }
        else if (bossState.memory.playerBlockStreak >= 2 && dist < 110) { bossState.phase = 'poke'; bossState.phaseTimer = 10; }
        else if (bossState.memory.playerIdleTime > 15 && dist > 100) { bossState.phase = 'rush'; bossState.phaseTimer = 14; }
        else if (dist > 140) { bossState.phase = Math.random() < 0.7 ? 'rush' : 'bait'; bossState.phaseTimer = 18; }
        else if (dist > 80) { bossState.phase = Math.random() < 0.5 ? 'poke' : (Math.random() < 0.5 ? 'feint' : 'neutral'); bossState.phaseTimer = 13; }
        else { if (Math.random() < 0.6) { bossState.phase = 'combo'; bossState.comboIndex = 0; bossState.phaseTimer = 20; } else { bossState.phase = 'retreat'; bossState.phaseTimer = 10; } }
      } else {
        if (playerIsRecovering && dist < 120) { bossState.phase = 'punish'; bossState.phaseTimer = 10; }
        else if (playerIsJumping && dist < 140) { bossState.phase = 'aerial'; bossState.phaseTimer = 14; }
        else if (bossState.memory.playerBlockStreak >= 2 && dist < 100) { bossState.phase = 'poke'; bossState.phaseTimer = 12; }
        else if (bossState.memory.playerIdleTime > 20 && dist > 100) { bossState.phase = 'rush'; bossState.phaseTimer = 16; }
        else if (dist > 160) { bossState.phase = Math.random() < 0.6 ? 'rush' : 'bait'; bossState.phaseTimer = 20; }
        else if (dist > 80) { bossState.phase = Math.random() < 0.5 ? 'poke' : (Math.random() < 0.5 ? 'feint' : 'neutral'); bossState.phaseTimer = 14; }
        else { if (Math.random() < 0.55) { bossState.phase = 'combo'; bossState.comboIndex = 0; bossState.phaseTimer = 22; } else { bossState.phase = 'retreat'; bossState.phaseTimer = 12; } }
      }
    }

    switch (bossState.phase) {
      case 'rush':
        if (dist > 70) {
          const rushSpeed = bossState.rageMode ? 2.0 : 1.5;
          if (dx > 0) P2.vx += rushSpeed; else P2.vx -= rushSpeed;
        } else {
          if (P2.attackCooldown <= 0 && dist < 90) {
            if (P1.grounded) { Math.random() < 0.5 ? tryAttack(P2, P1, 'low') : tryAttack(P2, P1, 'ground'); }
            bossState.phase = 'neutral';
          }
        }
        if (playerIsJumping && P2.grounded && Math.random() < 0.15) doJump(P2);
        break;
      case 'charge': break;
      case 'poke':
        if (dist > 85) { if (dx > 0) P2.vx += 1.2; else P2.vx -= 1.2; }
        else if (dist < 65) { if (dx > 0) P2.vx -= 0.8; else P2.vx += 0.8; }
        else if (P2.attackCooldown <= 0) { tryAttack(P2, P1, 'low'); bossState.phaseTimer = 8; }
        if (playerIsAttacking && dist < 100 && P2.grounded && Math.random() < 0.3) { doJump(P2); bossState.phase = 'retreat'; }
        break;
      case 'punish':
        if (P2.attackCooldown <= 0) {
          const punishSpeed = bossState.rageMode ? 2.2 : 1.8;
          if (dx > 0) P2.vx += punishSpeed; else P2.vx -= punishSpeed;
          if (dist < 95) {
            Math.random() < 0.7 ? tryAttack(P2, P1, 'low') : tryAttack(P2, P1, 'ground');
            bossState.punishWindow = 0; bossState.phase = 'neutral';
          }
        }
        break;
      case 'aerial':
        if (P2.grounded && dist < 130) doJump(P2);
        else if (!P2.grounded) {
          if (dx > 0) P2.vx += 0.8; else P2.vx -= 0.8;
          if (P2.jumpCount < MAX_JUMPS && dy > 40 && Math.random() < 0.2) doJump(P2);
          if (P2.attackCooldown <= 0 && Math.abs(dy) < 70 && dist < 100) tryAttack(P2, P1, 'air');
        }
        break;
      case 'combo':
        bossState.comboTimer++;
        if (dist > 70) { if (dx > 0) P2.vx += 1.4; else P2.vx -= 1.4; }
        else if (P2.attackCooldown <= 0) {
          if (bossState.comboIndex === 0) { tryAttack(P2, P1, 'ground'); bossState.comboIndex = 1; }
          else if (bossState.comboIndex === 1) { tryAttack(P2, P1, 'low'); bossState.comboIndex = 2; }
          else {
            if (P1.x < P2.x && P2.facing === -1 || P1.x > P2.x && P2.facing === 1) {
              if (Math.random() < 0.5) tryAttack(P2, P1, 'ground'); else bossState.phase = 'retreat';
            } else bossState.phase = 'retreat';
            bossState.comboIndex = 0;
          }
        }
        break;
      case 'retreat':
        if (dist < 110) { if (dx > 0) P2.vx -= 1.2; else P2.vx += 1.2; }
        if (P1.attackTimer > 0 && dist < 80 && P2.attackCooldown <= 0 && Math.random() < 0.4) tryAttack(P2, P1, 'low');
        if (P2.grounded && dist < 90 && Math.random() < 0.2) doJump(P2);
        break;
      case 'feint':
        if (bossState.feintTimer <= 0) { bossState.feintTimer = 8; bossState.isFeinting = !bossState.isFeinting; }
        if (bossState.isFeinting) { if (dx > 0) P2.vx += 1.2; else P2.vx -= 1.2; }
        else {
          if (Math.random() < 0.5) { if (P2.attackCooldown <= 0 && dist < 95) tryAttack(P2, P1, 'ground'); }
          else { if (dx > 0) P2.vx -= 0.6; else P2.vx += 0.6; }
        }
        break;
      case 'bait':
        if (dist > 130) { if (dx > 0) P2.vx += 0.8; else P2.vx -= 0.8; }
        else if (dist < 100) { if (dx > 0) P2.vx -= 0.8; else P2.vx += 0.8; }
        if (playerIsAttacking && dist < 120) P2.blocking = true;
        break;
      default:
        if (dist > 140) { if (dx > 0) P2.vx += 0.8; else P2.vx -= 0.8; }
        else if (dist < 70) { if (dx > 0) P2.vx -= 0.6; else P2.vx += 0.6; }
        if (P2.grounded && Math.random() < 0.01) doJump(P2);
        if (playerIsAttacking && dist < 100 && Math.random() < 0.35) P2.blocking = true;
        break;
    }
    if (P1.energy > 80 && dist < 100 && Math.random() < 0.05) { bossState.phase = 'retreat'; bossState.phaseTimer = 10; }
  }

  // 物理更新
  function updatePlayer(player, opponent, isP1) {
    if (player.hitStun > 0) player.hitStun--;
    if (player.attackCooldown > 0) player.attackCooldown--;
    if (player.attackTimer > 0) player.attackTimer--;
    else if (player.attackType !== 'none' && player.attackTimer <= 0) player.attackType = 'none';

    if (player.blockFlash > 0) player.blockFlash--;
    if (player.doubleJumpFx > 0) player.doubleJumpFx--;
    if (player.fireballCooldown > 0) player.fireballCooldown--;

    updateBurn(player);
    player.energy = Math.max(0, player.energy - 0.03);

    if (player.hitStun <= 0 && gameState === 'playing' && player.attackTimer <= 0) {
      player.facing = player.x < opponent.x ? 1 : -1;
    }

    if (gameState === 'playing' && player.hitStun <= 0 && !isEditingName) {
      if (isP1) {
        let moveDir = (keys.a ? -1 : 0) + (keys.d ? 1 : 0);
        if (moveDir !== 0) {
          player.blocking = (moveDir * player.facing < 0);
          player.vx += moveDir * 0.9;
          if (aiLevel === BOSS_LEVEL) bossState.memory.playerLastMoveDir = moveDir;
        } else {
          player.blocking = false;
          if (aiLevel === BOSS_LEVEL) bossState.memory.playerIdleTime++;
        }
      } else if (!isP1 && gameMode === 'pvp') {
        let moveDir = (keys.ArrowLeft ? -1 : 0) + (keys.ArrowRight ? 1 : 0);
        if (moveDir !== 0) {
          player.blocking = (moveDir * player.facing < 0);
          player.vx += moveDir * 0.9;
        } else {
          player.blocking = false;
        }
      }
    } else {
      if (!isP1 || gameMode !== 'training') player.blocking = false;
    }

    if (gameMode === 'training' && !isP1 && dummyPinned) {
      player.vx = 0; player.vy += 0.65; player.y += player.vy;
      if (player.y + player.h >= GROUND_Y) { player.y = GROUND_Y - player.h; player.vy = 0; player.grounded = true; player.jumpCount = 0; }
      return;
    }

    player.vx *= 0.85;
    if (Math.abs(player.vx) < 0.15) player.vx = 0;
    player.vy += 0.65;
    player.x += player.vx; player.y += player.vy;

    if (player.y + player.h >= GROUND_Y) {
      player.y = GROUND_Y - player.h; player.vy = 0; player.grounded = true; player.jumpCount = 0;
    } else {
      player.grounded = false;
    }

    if (player.x < 30) player.x = 30;
    if (player.x + player.w > canvas.width - 30) player.x = canvas.width - 30 - player.w;

    if (Math.abs(player.x - opponent.x) < 45 && Math.abs(player.y - opponent.y) < 60) {
      const pushDir = Math.sign(player.x - opponent.x) || 1;
      if (gameMode === 'training' && !isP1 && dummyPinned) player.x += pushDir * 2.5;
      else { player.x += pushDir * 2.5; opponent.x -= pushDir * 1.5; }
    }

    if (Math.abs(player.vx) > 2 || Math.abs(player.vy) > 3) {
      player.trail.push({ x: player.x, y: player.y, life: 0.3 });
      if (player.trail.length > 8) player.trail.shift();
    }
    player.trail = player.trail.filter(t => { t.life -= 0.04; return t.life > 0; });
  }

  function updateFireballs() {
    for (let i = fireballs.length - 1; i >= 0; i--) {
      for (let j = i - 1; j >= 0; j--) {
        if (i >= fireballs.length || j >= fireballs.length) continue;
        const fb1 = fireballs[i], fb2 = fireballs[j];
        if (fb1.owner === fb2.owner || fb1.intercepted || fb2.intercepted) continue;
        const dist = Math.sqrt(Math.pow(fb1.x - fb2.x, 2) + Math.pow(fb1.y - fb2.y, 2));
        if (dist < fb1.radius + fb2.radius) {
          const cx = (fb1.x + fb2.x) / 2, cy = (fb1.y + fb2.y) / 2;
          for (let k = 0; k < 24; k++) {
            const angle = Math.random() * Math.PI * 2, speed = 2 + Math.random() * 7;
            particles.push({
              x: cx + (Math.random()-0.5)*15, y: cy + (Math.random()-0.5)*15,
              vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 1,
              life: 0.9, size: 3 + Math.random()*6, color: k % 2 === 0 ? FIREBALL_GLOW : FIREBALL_PARTICLE_COLOR
            });
          }
          hitEffects.push({ x: cx - 20, y: cy - 20, text: '⚡ 相撞!', life: 0.9, vy: -1.8, color: '#ffffff' });
          if (fb1.owner === 2 || fb2.owner === 2) {
            if (isBossActive()) P2.energy = Math.min(ENERGY_MAX, P2.energy + 5);
          }
          screenShake = 6;
          fb1.intercepted = true; fb2.intercepted = true;
          if (i > j) { fireballs.splice(i, 1); fireballs.splice(j, 1); }
          else { fireballs.splice(j, 1); fireballs.splice(i, 1); }
          break;
        }
      }
    }

    for (let i = fireballs.length - 1; i >= 0; i--) {
      const fb = fireballs[i];
      if (fb.intercepted) {
        fb.interceptFx++;
        if (fb.interceptFx > 8) fireballs.splice(i, 1);
        continue;
      }

      fb.x += fb.vx; fb.y += fb.vy; fb.vy += FIREBALL_GRAVITY; fb.life--;

      if (fb.life % 2 === 0) {
        fb.trail.push({ x: fb.x, y: fb.y, life: 0.5 });
        if (fb.trail.length > 8) fb.trail.shift();
      }
      fb.trail = fb.trail.filter(t => { t.life -= 0.04; return t.life > 0; });

      if (Math.random() < 0.4) {
        particles.push({
          x: fb.x + (Math.random() - 0.5) * 10, y: fb.y + (Math.random() - 0.5) * 10,
          vx: (Math.random() - 0.5) * 2 + fb.vx * 0.2, vy: (Math.random() - 0.8) * 3 - 0.5,
          life: 0.4 + Math.random() * 0.3, size: 1.5 + Math.random() * 3,
          color: Math.random() < 0.6 ? FIREBALL_PARTICLE_COLOR : '#ffcc44'
        });
      }

      if (fb.x < -50 || fb.x > canvas.width + 50 || fb.life <= 0) {
        fireballs.splice(i, 1); continue;
      }
      if (fb.y + fb.radius >= GROUND_Y) {
        for (let k = 0; k < 16; k++) {
          particles.push({
            x: fb.x + (Math.random()-0.5)*15, y: fb.y + (Math.random()-0.5)*15,
            vx: (Math.random()-0.5)*6, vy: (Math.random()-0.9)*6,
            life: 0.6, size: 2 + Math.random()*5, color: Math.random() < 0.5 ? FIREBALL_COLOR : FIREBALL_PARTICLE_COLOR
          });
        }
        screenShake = 2; fireballs.splice(i, 1); continue;
      }

      const target = fb.owner === 1 ? P2 : P1;
      const isTargetP1 = fb.owner === 2;
      if (target.hp > 0 && gameState === 'playing') {
        const dist = Math.sqrt(Math.pow(fb.x - (target.x + target.w/2), 2) + Math.pow(fb.y - (target.y + target.h/2), 2));
        if (dist < fb.radius + target.w * 0.6) {
          applyFireballHit(fb, target, !isTargetP1); fireballs.splice(i, 1); continue;
        }
      }
      if (gameMode === 'training' && fb.owner === 1) {
        const dist = Math.sqrt(Math.pow(fb.x - (P2.x + P2.w/2), 2) + Math.pow(fb.y - (P2.y + P2.h/2), 2));
        if (dist < fb.radius + P2.w * 0.6) {
          applyFireballHit(fb, P2, true); fireballs.splice(i, 1); continue;
        }
      }
    }
  }

  function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx; p.y += p.vy; p.vy += 0.25; p.vx *= 0.98; p.life -= 0.035;
      if (p.life <= 0 || p.y > canvas.height + 50) particles.splice(i, 1);
    }
    for (let i = hitEffects.length - 1; i >= 0; i--) {
      const e = hitEffects[i];
      e.y += e.vy; e.life -= 0.03;
      if (e.life <= 0) hitEffects.splice(i, 1);
    }
    if (screenShake > 0) screenShake--;
  }

  // 渲染逻辑
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (gameState === 'menu' || gameState === 'modeSelect' || gameState === 'difficultySelect') return;

    let shakeX = 0, shakeY = 0;
    if (screenShake > 0) {
      shakeX = (Math.random() - 0.5) * 6; shakeY = (Math.random() - 0.5) * 5;
    }
    ctx.save();
    ctx.translate(shakeX, shakeY);

    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, '#16202e'); grad.addColorStop(0.7, '#1e2b3c');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (isBossActive()) {
      const bossBg = ctx.createRadialGradient(400, 200, 80, 400, 200, 450);
      if (bossState.rageMode) {
        bossBg.addColorStop(0, 'rgba(80, 0, 30, 0.4)'); bossBg.addColorStop(1, 'rgba(0, 0, 0, 0)');
      } else {
        bossBg.addColorStop(0, 'rgba(60, 10, 40, 0.25)'); bossBg.addColorStop(1, 'rgba(0, 0, 0, 0)');
      }
      ctx.fillStyle = bossBg; ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    ctx.fillStyle = '#2a3a50'; ctx.fillRect(0, GROUND_Y, canvas.width, canvas.height - GROUND_Y + 10);
    ctx.fillStyle = '#3b4f6b'; ctx.fillRect(0, GROUND_Y, canvas.width, 10);
    ctx.fillStyle = '#1f2c3d';
    for (let i = 0; i < canvas.width; i += 40) ctx.fillRect(i, GROUND_Y + 12, 20, 6);

    ctx.beginPath(); ctx.arc(400, 100, 220, 0, Math.PI * 2); ctx.fillStyle = '#2d3e5a30'; ctx.fill();

    if (gameMode === 'training') {
      ctx.beginPath(); ctx.ellipse(P2.x + P2.w / 2, GROUND_Y + 6, 40, 14, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#4a9fd040'; ctx.fill();
      ctx.strokeStyle = dummyPinned ? '#ffaa0060' : '#6aafff60'; ctx.lineWidth = dummyPinned ? 2 : 1.5; ctx.stroke();
    }

    P2.trail.forEach(t => {
      ctx.globalAlpha = t.life * 0.3;
      ctx.fillStyle = (isBossActive() && P2 === P2) ? (bossState.rageMode ? '#ff0044' : '#ff0066') : '#ff2a2a';
      ctx.beginPath(); ctx.ellipse(t.x + P2.w/2, t.y + P2.h/2, P2.w/2, P2.h/2, 0, 0, Math.PI * 2); ctx.fill();
    });
    P1.trail.forEach(t => {
      ctx.globalAlpha = t.life * 0.3;
      ctx.fillStyle = '#ff2a2a';
      ctx.beginPath(); ctx.ellipse(t.x + P1.w/2, t.y + P1.h/2, P1.w/2, P1.h/2, 0, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1;

    // 二段跳特效
    [P2, P1].forEach((p, idx) => {
      if (p.doubleJumpFx <= 0) return;
      const progress = 1 - p.doubleJumpFx / 12, alpha = p.doubleJumpFx / 12;
      const cx = p.x + p.w / 2, cy = p.y + p.h - 6, radius = 10 + progress * 35;
      const isBoss = isBossActive() && p === P2;
      ctx.save();
      ctx.globalAlpha = alpha * 0.7;
      ctx.strokeStyle = isBoss ? '#ff3388' : (p === P1 ? '#ff8888' : '#88bbff');
      ctx.lineWidth = 3; ctx.shadowBlur = 16;
      ctx.shadowColor = isBoss ? '#ff0066' : (p === P1 ? '#ff5555' : '#5599ff');
      ctx.beginPath(); ctx.ellipse(cx, cy, radius, radius * 0.4, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = alpha * 0.4;
      ctx.beginPath(); ctx.ellipse(cx, cy, radius * 0.6, radius * 0.25, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    });

    // BOSS光环
    if (isBossActive()) {
      const auraRadius = 42 + Math.sin(bossAuraTimer * 0.15) * 5;
      const auraAlpha = 0.3 + Math.sin(bossAuraTimer * 0.1) * 0.12;
      ctx.save();
      if (bossState.rageMode) {
        ctx.globalAlpha = auraAlpha * 1.5; ctx.strokeStyle = '#ff0044'; ctx.lineWidth = 4;
        ctx.shadowBlur = 30; ctx.shadowColor = '#ff0044';
        ctx.beginPath(); ctx.ellipse(P2.x + P2.w/2, P2.y + P2.h/2, auraRadius + 8, auraRadius * 0.9 + 8, 0, 0, Math.PI * 2); ctx.stroke();
        if (bossAuraTimer % 4 === 0) {
          particles.push({
            x: P2.x + P2.w/2 + (Math.random()-0.5)*70, y: P2.y + P2.h/2 + (Math.random()-0.5)*70,
            vx: (Math.random()-0.5)*3, vy: -Math.random()*3 - 1, life: 0.6, size: 2 + Math.random()*4, color: '#ff3366'
          });
        }
      } else {
        ctx.globalAlpha = auraAlpha; ctx.strokeStyle = '#ff0066'; ctx.lineWidth = 3;
        ctx.shadowBlur = 24; ctx.shadowColor = '#ff0066';
        ctx.beginPath(); ctx.ellipse(P2.x + P2.w/2, P2.y + P2.h/2, auraRadius, auraRadius * 0.9, 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = auraAlpha * 0.5; ctx.strokeStyle = '#8a2be2';
      ctx.beginPath(); ctx.ellipse(P2.x + P2.w/2, P2.y + P2.h/2, auraRadius + 6, auraRadius * 0.9 + 5, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();

      if (bossState.interceptFlash > 0) {
        const flashAlpha = bossState.interceptFlash / 20;
        ctx.save(); ctx.globalAlpha = flashAlpha * 0.8; ctx.strokeStyle = '#cc88ff'; ctx.lineWidth = 3;
        ctx.shadowBlur = 30; ctx.shadowColor = '#cc88ff';
        ctx.beginPath(); ctx.arc(P2.x + P2.w/2, P2.y + 30, 45 - flashAlpha * 20, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      }
    }

    // 绘制角色
    drawPlayer(P2, false);
    drawPlayer(P1, true);

    // 绘制火球
    fireballs.forEach(fb => {
      if (fb.intercepted) {
        const progress = fb.interceptFx / 8;
        ctx.globalAlpha = 1 - progress; ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(fb.x, fb.y, fb.radius * (1 + progress * 2), 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1; return;
      }
      fb.trail.forEach(t => {
        ctx.globalAlpha = t.life * 0.5; ctx.fillStyle = fb.color;
        ctx.beginPath(); ctx.arc(t.x, t.y, fb.radius * 0.6 * t.life, 0, Math.PI * 2); ctx.fill();
      });
      ctx.globalAlpha = 1;
      ctx.save(); ctx.shadowBlur = 24; ctx.shadowColor = fb.colorGlow;
      const gradient = ctx.createRadialGradient(fb.x - 2, fb.y - 2, 2, fb.x, fb.y, fb.radius + 2);
      gradient.addColorStop(0, '#ffffff'); gradient.addColorStop(0.35, fb.colorGlow); gradient.addColorStop(1, fb.color);
      ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(fb.x, fb.y, fb.radius, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.4; ctx.fillStyle = fb.colorGlow;
      ctx.beginPath(); ctx.arc(fb.x, fb.y, fb.radius + 4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      if (fb.isInterceptBall) {
        ctx.save(); ctx.globalAlpha = 0.6; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5;
        ctx.shadowBlur = 12; ctx.shadowColor = '#cc88ff';
        ctx.beginPath(); ctx.arc(fb.x, fb.y, fb.radius + 5, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      }
    });

    if (isBossActive() && bossState.regenTimer > 0) {
      ctx.font = 'bold 14px "Segoe UI", sans-serif'; ctx.fillStyle = '#88ff99'; ctx.textAlign = 'center';
      ctx.shadowBlur = 8; ctx.shadowColor = '#66ff88'; ctx.fillText('💚 回血中...', P2.x + P2.w/2, P2.y - 14);
      ctx.shadowBlur = 0; ctx.textAlign = 'left';
    }

    [P1, P2].forEach((p, i) => {
      if (p.burnTimer > 0 && !(isBossActive() && p === P2)) {
        ctx.font = 'bold 12px "Segoe UI", sans-serif'; ctx.fillStyle = '#ff5522'; ctx.textAlign = 'center';
        ctx.shadowBlur = 8; ctx.shadowColor = '#ff5522'; ctx.fillText('🔥 灼烧', p.x + p.w/2, p.y - 10);
        ctx.shadowBlur = 0; ctx.textAlign = 'left';
      }
    });

    if (gameMode === 'training') {
      ctx.font = 'bold 20px "Segoe UI", sans-serif'; ctx.fillStyle = dummyPinned ? '#ffaa00' : '#88aaff'; ctx.textAlign = 'center';
      ctx.fillText(dummyPinned ? '📌 木桩(固定)' : '🥊 木桩', P2.x + P2.w / 2, P2.y - 20);
      if (!dummyPinned) {
        ctx.font = '12px "Segoe UI", sans-serif'; ctx.fillStyle = '#6a8aaa'; ctx.fillText('可拖动', P2.x + P2.w / 2, P2.y - 4);
      }
      ctx.textAlign = 'left'; ctx.font = 'bold 15px "Segoe UI", sans-serif'; ctx.fillStyle = '#ffaa44'; ctx.textAlign = 'center';
      ctx.fillText('累计伤害: ' + totalDamage, canvas.width / 2, 40); ctx.textAlign = 'left';
    }

    particles.forEach(p => {
      ctx.globalAlpha = p.life * 0.8; ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1;

    hitEffects.forEach(e => {
      ctx.globalAlpha = e.life; ctx.font = 'bold 22px "Segoe UI", "Arial Black", sans-serif';
      ctx.fillStyle = e.color || '#ffdd44'; ctx.shadowColor = '#ff9900'; ctx.shadowBlur = 6;
      ctx.fillText(e.text, e.x - 10, e.y); ctx.shadowBlur = 0;
    });
    ctx.globalAlpha = 1;

    if (gameState === 'playing' && !isEditingName && P1.fireballCooldown > 0) {
      const cdRatio = 1 - (P1.fireballCooldown / FIREBALL_COOLDOWN);
      ctx.fillStyle = '#ff7733aa'; ctx.fillRect(P1.x + P1.w/2 - 20, P1.y - 18, 40 * cdRatio, 4);
      ctx.strokeStyle = '#ffaa8866'; ctx.lineWidth = 1; ctx.strokeRect(P1.x + P1.w/2 - 20, P1.y - 18, 40, 4);
    }

    // 攻击判定特效
    [P1, P2].forEach((p, i) => {
      if (p.attackTimer > 1) {
        const dir = p.facing;
        const isBoss = isBossActive() && p === P2;
        const atkColor = isBoss ? '#ff3388' : (p.attackType === 'air' ? '#33aaff' : (p.attackType === 'low' ? '#00aaff' : '#66aaff'));
        
        let fillStyle = isBoss ? '#ff338850' : (p.attackType === 'air' ? '#33aaff50' : (p.attackType === 'low' ? '#00aaff50' : '#66aaff50'));
        let radius = p.attackType === 'low' ? 26 : 20;
        let offsetY = p.attackType === 'low' ? 56 : (p.attackType === 'air' ? 22 : 30);

        if (p === P1) {
          if (p.attackType === 'low') { fillStyle = '#ffaa0070'; radius = 8; offsetY = 56; }
          else if (p.attackType === 'air') { fillStyle = '#ffaa3350'; radius = 9; offsetY = 22; }
          else { fillStyle = '#ffcc6650'; radius = 8; offsetY = 30; }
        }

        ctx.beginPath();
        ctx.ellipse(p.x + p.w / 2 + dir * 34, p.y + offsetY, radius, 6, 0, 0, Math.PI * 2);
        ctx.fillStyle = fillStyle; ctx.shadowBlur = 10; ctx.shadowColor = atkColor;
        ctx.fill();
      }
    });
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  function drawPlayer(player, isP1) {
    const { x, y, w, h } = player;
    const isBoss = isBossActive() && !isP1;
    const bossRage = isBoss && bossState.rageMode;
    const px = 6;
    const mainColor = isBoss ? (bossRage ? '#ff1100' : '#aa0000') : '#ff2a2a';
    const outlineColor = '#000000';

    let armAngle = 0, armExtend = 0;
    if (player.attackTimer > 0) {
      if (player.attackType === 'ground') { armAngle = -0.1; armExtend = 14; }
      else if (player.attackType === 'low') { armAngle = 0.5; armExtend = 12; }
      else if (player.attackType === 'air') { armAngle = -0.6; armExtend = 10; }
    } else if (player.blocking) { armAngle = -1.0; armExtend = 4; }
    else if (!player.grounded) { armAngle = -0.3; armExtend = 6; }

    let legSwing = Math.sin(Date.now() / 100) * 2; 
    if (player.grounded && Math.abs(player.vx) < 0.5) legSwing = 0;
    
    ctx.save();
    ctx.translate(x + w/2, y + h);
    
    if (isBoss) { ctx.shadowBlur = bossRage ? 25 : 15; ctx.shadowColor = bossRage ? '#ff0044' : '#ff0066'; }
    else { ctx.shadowBlur = 10; ctx.shadowColor = '#ff000066'; }

    ctx.fillStyle = mainColor; ctx.strokeStyle = outlineColor; ctx.lineWidth = 3;

    ctx.beginPath();
    ctx.moveTo(-px, -px*1.5); ctx.lineTo(-px*2 + legSwing, -px*8); ctx.lineTo(-px*2.5 + legSwing, -px*13);
    ctx.lineTo(-px*0.5 + legSwing, -px*13); ctx.lineTo(0, -px*8); ctx.lineTo(px*0.5, -px*1.5);
    ctx.fill(); ctx.stroke();

    const legSpread = player.blocking ? 1 : 1.5;
    ctx.beginPath();
    ctx.moveTo(-px, -px*1.5); ctx.lineTo(px*legSpread - legSwing, -px*8); ctx.lineTo(px*legSpread + 0.5*px - legSwing, -px*13);
    ctx.lineTo(px*legSpread + 2*px - legSwing, -px*13); ctx.lineTo(px*1.5, -px*8); ctx.lineTo(px, -px*1.5);
    ctx.fill(); ctx.stroke();

    ctx.beginPath(); ctx.moveTo(0, -px*1.5); ctx.lineTo(0, -px*11);
    ctx.lineWidth = px*1.5; ctx.strokeStyle = mainColor; ctx.stroke();
    
    ctx.lineWidth = px*1.5 + 4; ctx.strokeStyle = outlineColor;
    ctx.globalCompositeOperation = 'destination-over'; ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';

    const headY = -px*16, headRadius = px*3.5;
    ctx.beginPath(); ctx.arc(0, headY, headRadius + 2, 0, Math.PI * 2);
    ctx.strokeStyle = outlineColor; ctx.lineWidth = px*1.5 + 4; ctx.stroke();

    ctx.beginPath(); ctx.arc(0, headY, headRadius, 0, Math.PI * 2);
    ctx.strokeStyle = mainColor; ctx.lineWidth = px*1.5; ctx.stroke();

    ctx.beginPath(); ctx.arc(0, headY, headRadius - px, 0, Math.PI * 2);
    ctx.fillStyle = '#1e2636'; ctx.fill();
    
    ctx.translate(0, -px*10);
    const facingDir = player.facing;
    ctx.rotate((armAngle) * facingDir);
    const armLength = px*5 + armExtend;
    
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(armLength * facingDir, 0);
    ctx.lineWidth = px * 1.2; ctx.strokeStyle = mainColor; ctx.stroke();
    
    ctx.lineWidth = px * 1.2 + 4; ctx.strokeStyle = outlineColor;
    ctx.globalCompositeOperation = 'destination-over'; ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';

    const fistSize = px * 2;
    ctx.fillStyle = mainColor; ctx.fillRect(armLength * facingDir - (facingDir===1?0:fistSize), -fistSize/2, fistSize, fistSize);
    ctx.strokeStyle = outlineColor; ctx.lineWidth = 2; ctx.strokeRect(armLength * facingDir - (facingDir===1?0:fistSize), -fistSize/2, fistSize, fistSize);

    ctx.restore();

    if (player.blocking) {
      ctx.save(); ctx.shadowBlur = 20; ctx.shadowColor = isBoss ? (bossRage ? '#ff2200' : '#ff3388') : '#88ccff';
      ctx.strokeStyle = (isBoss ? (bossRage ? '#ff2200' : '#ff3388') : '#aaddff') + (player.blockFlash > 0 ? 'cc' : '66');
      ctx.lineWidth = player.blockFlash > 0 ? 4 : 2;
      ctx.beginPath();
      const shieldX = x + (player.facing === 1 ? w + 2 : -10);
      ctx.ellipse(shieldX + (player.facing === 1 ? 3 : -3), y + h/2 - 5, 8, 28, 0, 0, Math.PI * 2); ctx.stroke();
      if (player.blockFlash > 0) {
        ctx.fillStyle = isBoss ? (bossRage ? '#ff220040' : '#ff338840') : '#aaddff40';
        ctx.beginPath(); ctx.ellipse(shieldX + (player.facing === 1 ? 3 : -3), y + h/2 - 5, 10, 32, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }

    if (isBoss && bossState.superArmorTimer > 0 && !bossState.rageMode) {
      ctx.save(); ctx.globalAlpha = 0.5 + Math.sin(bossAuraTimer * 0.3) * 0.2;
      ctx.strokeStyle = '#ffcc00'; ctx.lineWidth = 2; ctx.shadowBlur = 18; ctx.shadowColor = '#ffcc00';
      ctx.beginPath(); ctx.ellipse(x + w/2, y + h/2, w/2 + 4, h/2 + 4, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }

    if (gameMode === 'training' && !isP1 && dummyPinned) {
      ctx.font = '16px "Segoe UI", sans-serif'; ctx.textAlign = 'center'; ctx.fillText('📌', x + w / 2, y - 28); ctx.textAlign = 'left';
    }

    ctx.shadowBlur = 20; ctx.shadowColor = '#000000';
    ctx.fillStyle = isBoss ? (bossRage ? '#ff004440' : '#ff006630') : '#00000060';
    ctx.beginPath(); ctx.ellipse(x + w / 2, GROUND_Y + 6, isBoss ? 36 : 30, isBoss ? 12 : 10, 0, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  }

  // 主循环
  function gameLoop() {
    if (gameState === 'playing') {
      checkAttackHit(P1, P2, true);
      checkAttackHit(P2, P1, false);
      
      if (gameMode === 'pve') {
        if (aiLevel === BOSS_LEVEL) updateBossAI();
        else {
          const res = window.GameAI.updateNormalAI(
            { gameMode, gameState, isEditingName }, 
            P1, P2, aiLevel, aiTimer, aiDecision, 
            { doJump, shootFireball, tryAttack }
          );
          aiTimer = res.aiTimer;
          aiDecision = res.aiDecision;
        }
      }
      
      updatePlayer(P1, P2, true);
      updatePlayer(P2, P1, false);
      updateFireballs();
      if (gameMode === 'training') {
        trainingDummyTimer--;
        if (P2.hp < P2.maxHp) { P2.hp = Math.min(P2.maxHp, P2.hp + 0.08); updateHealthUI(); }
      }
      updateParticles();
      updateEnergyUI();
    } else if (gameState === 'gameover') {
      updateParticles();
    }

    updatePhaseToast();
    draw();
    requestAnimationFrame(gameLoop);
  }

  // 鼠标事件
  function getMousePos(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height)
    };
  }

  canvas.addEventListener('mousedown', (e) => {
    if (gameState !== 'playing' || gameMode !== 'training' || dummyPinned) return;
    const pos = getMousePos(e);
    if (pos.x >= P2.x && pos.x <= P2.x + P2.w && pos.y >= P2.y && pos.y <= P2.y + P2.h) {
      isDraggingDummy = true;
      dragOffsetX = pos.x - (P2.x + P2.w / 2); dragOffsetY = pos.y - (P2.y + P2.h / 2);
      updateCanvasCursor(); e.preventDefault();
    }
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDraggingDummy || gameMode !== 'training' || dummyPinned) return;
    const pos = getMousePos(e);
    P2.x = Math.max(30, Math.min(canvas.width - 30 - P2.w, pos.x - dragOffsetX));
    P2.y = Math.max(80, Math.min(GROUND_Y - P2.h, pos.y - dragOffsetY));
    P2.vx = 0; P2.vy = 0; e.preventDefault();
  });

  window.addEventListener('mouseup', () => {
    if (isDraggingDummy) { isDraggingDummy = false; updateCanvasCursor(); }
  });

  canvas.addEventListener('dblclick', (e) => {
    if (gameState !== 'playing' || gameMode !== 'training') return;
    const pos = getMousePos(e);
    if (pos.x >= P2.x && pos.x <= P2.x + P2.w && pos.y >= P2.y && pos.y <= P2.y + P2.h) {
      P2.x = DUMMY_DEFAULT_X; P2.y = GROUND_Y - P2.h; P2.vx = 0; P2.vy = 0;
      dummyPinned = false; updatePinToggleUI(); updateCanvasCursor(); e.preventDefault();
    }
  });

  document.getElementById('pinToggle').addEventListener('click', () => {
    if (gameMode !== 'training') return;
    dummyPinned = !dummyPinned;
    if (dummyPinned) { P2.vx = 0; P2.vy = 0; }
    updatePinToggleUI(); updateCanvasCursor();
  });

  // 键盘事件
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (gameState === 'playing') pauseGame();
      else if (gameState === 'paused') resumeGame();
      else if (gameState === 'gameover') goToMenu();
      else if (gameState === 'modeSelect') goToMenu();
      else if (gameState === 'difficultySelect') showModeSelect();
      return;
    }
    if (e.key === ' ' || e.key === 'Spacebar') {
      if (gameState === 'gameover') { e.preventDefault(); restartGame(); return; }
    }
    if (gameState !== 'playing' || isEditingName) return;

    const preventKeys = ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','a','d','w','f','s','g','j','k','A','D','W','F','S','G','J','K'];
    if (preventKeys.includes(e.key)) e.preventDefault();
    const key = e.key;

    if ((key === 'w' || key === 'W') && !wPressed) { wPressed = true; doJump(P1); }
    if (key === 'w' || key === 'W') keys.w = true;
    if (key === 'a' || key === 'A') keys.a = true;
    if (key === 'd' || key === 'D') keys.d = true;

    if ((key === 'f' || key === 'F') && !keys.f) { (!P1.grounded) ? tryAttack(P1, P2, 'air') : tryAttack(P1, P2, 'ground'); }
    if ((key === 'g' || key === 'G') && !keys.g && P1.grounded) { tryAttack(P1, P2, 'low'); }
    if ((key === 's' || key === 'S') && !keys.s) { shootFireball(P1, true); }
    if (key === 'f' || key === 'F') keys.f = true;
    if (key === 'g' || key === 'G') keys.g = true;
    if (key === 's' || key === 'S') keys.s = true;

    if (gameMode === 'pvp') {
      if ((key === 'ArrowUp') && !upPressed) { upPressed = true; doJump(P2); }
      if (key === 'ArrowUp') keys.ArrowUp = true;
      if (key === 'ArrowLeft') keys.ArrowLeft = true;
      if (key === 'ArrowRight') keys.ArrowRight = true;

      if ((key === 'k' || key === 'K') && !keys.k) { (!P2.grounded) ? tryAttack(P2, P1, 'air') : tryAttack(P2, P1, 'ground'); }
      if ((key === 'j' || key === 'J') && !keys.j && P2.grounded) { tryAttack(P2, P1, 'low'); }
      if ((key === 'ArrowDown') && !keys.ArrowDown) { shootFireball(P2, false); }
      if (key === 'k' || key === 'K') keys.k = true;
      if (key === 'j' || key === 'J') keys.j = true;
      if (key === 'ArrowDown') keys.ArrowDown = true;
    }
  });

  window.addEventListener('keyup', (e) => {
    const key = e.key;
    if (key === 'a' || key === 'A') keys.a = false;
    if (key === 'd' || key === 'D') keys.d = false;
    if (key === 'w' || key === 'W') { keys.w = false; wPressed = false; }
    if (key === 'f' || key === 'F') keys.f = false;
    if (key === 'g' || key === 'G') keys.g = false;
    if (key === 's' || key === 'S') keys.s = false;
    if (key === 'ArrowLeft') keys.ArrowLeft = false;
    if (key === 'ArrowRight') keys.ArrowRight = false;
    if (key === 'ArrowUp') { keys.ArrowUp = false; upPressed = false; }
    if (key === 'ArrowDown') keys.ArrowDown = false;
    if (key === 'k' || key === 'K') keys.k = false;
    if (key === 'j' || key === 'J') keys.j = false;
  });

  // UI 交互绑定
  function setupNameEditing() {
    const p1El = document.getElementById('p1NameDisplay');
    const p2El = document.getElementById('p2NameDisplay');

    function startEdit(el, isP1) {
      if (isEditingName) return;
      isEditingName = true;
      Object.keys(keys).forEach(k => keys[k] = false);

      const input = document.createElement('input');
      input.type = 'text'; input.className = 'name-input';
      input.value = isP1 ? p1Name : p2Name; input.maxLength = 16;
      el.textContent = ''; el.appendChild(input); input.focus(); input.select();

      function finishEdit(save) {
        if (!isEditingName) return;
        isEditingName = false;
        let newName = input.value.trim();
        if (save && newName.length > 0) { if (isP1) p1Name = newName; else p2Name = newName; }
        if (input.parentNode === el) el.removeChild(input);
        updateNameDisplay();
      }
      input.addEventListener('blur', () => finishEdit(true));
      input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); finishEdit(true); }
        else if (e.key === 'Escape') { e.preventDefault(); finishEdit(false); }
      });
      input.addEventListener('click', (e) => e.stopPropagation());
      input.addEventListener('mousedown', (e) => e.stopPropagation());
    }
    p1El.addEventListener('click', (e) => { e.stopPropagation(); startEdit(p1El, true); });
    p2El.addEventListener('click', (e) => { e.stopPropagation(); startEdit(p2El, false); });
  }

  const slider = document.getElementById('diffSlider');
  const diffValue = document.getElementById('diffValue');
  const diffName = document.getElementById('diffName');

  function updateSliderUI() {
    const val = parseInt(slider.value, 10);
    aiLevel = val;
    diffValue.textContent = val === BOSS_LEVEL ? 'BOSS' : val;
    diffName.textContent = LEVEL_NAMES[val - 1];
    if (val === BOSS_LEVEL) {
      diffValue.style.color = '#ff0066'; diffValue.style.textShadow = '0 0 15px #ff0066';
      diffValue.style.background = '#2a0f1f'; diffValue.style.borderColor = '#ff0066';
      if (!p2Name.includes('BOSS')) p2Name = '⚡ 闪电 (BOSS)';
    } else {
      const hue = 120 - (val - 1) * 12;
      diffValue.style.color = `hsl(${hue}, 85%, 70%)`; diffValue.style.textShadow = `0 0 10px hsla(${hue}, 85%, 60%, 0.6)`;
      diffValue.style.background = '#1e2536'; diffValue.style.borderColor = '#4b5a74';
      if (p2Name.includes('BOSS')) {
        p2Name = p2Name.replace(/\s*\(BOSS\)$/, '');
        if (!p2Name.includes('(AI)')) p2Name += ' (AI)';
      }
    }
    updateNameDisplay(); updateBossUI();
  }
  slider.addEventListener('input', updateSliderUI);
  updateSliderUI();
  setupNameEditing();

  // 页面切换控制
  const startScreen = document.getElementById('startScreen');
  const modeScreen = document.getElementById('modeScreen');
  const difficultyScreen = document.getElementById('difficultyScreen');
  const gameContainer = document.getElementById('gameContainer');
  const pauseOverlay = document.getElementById('pauseOverlay');
  const gameoverOverlay = document.getElementById('gameoverOverlay');
  const introModal = document.getElementById('introModal');

  function hideAllScreens() {
    startScreen.classList.add('hidden'); modeScreen.classList.add('hidden');
    difficultyScreen.classList.add('hidden'); gameContainer.classList.add('hidden');
    pauseOverlay.classList.remove('show'); gameoverOverlay.classList.remove('show');
  }

  function goToMenu() {
    hideAllScreens(); startScreen.classList.remove('hidden'); gameState = 'menu'; isPaused = false;
    hitEffects = []; particles = []; fireballs = []; screenShake = 0;
    document.getElementById('bossPhaseToast').classList.remove('show');
  }

  function showModeSelect() {
    hideAllScreens(); modeScreen.classList.remove('hidden'); gameState = 'modeSelect';
  }

  function showDifficultySelect() {
    hideAllScreens(); difficultyScreen.classList.remove('hidden'); gameState = 'difficultySelect';
  }

  function startGame() {
    hideAllScreens(); gameContainer.classList.remove('hidden'); gameState = 'playing'; isPaused = false; resetGame();
  }

  function pauseGame() {
    if (gameState !== 'playing') return;
    gameState = 'paused'; isPaused = true; pauseOverlay.classList.add('show');
  }

  function resumeGame() {
    if (gameState !== 'paused') return;
    gameState = 'playing'; isPaused = false; pauseOverlay.classList.remove('show');
  }

  function restartGame() {
    gameoverOverlay.classList.remove('show'); pauseOverlay.classList.remove('show'); startGame();
  }

  document.getElementById('startBtn').addEventListener('click', showModeSelect);
  document.getElementById('introBtn').addEventListener('click', () => introModal.classList.add('show'));
  document.getElementById('closeIntroBtn').addEventListener('click', () => introModal.classList.remove('show'));

  document.querySelectorAll('.mode-card').forEach(card => {
    card.addEventListener('click', () => {
      gameMode = card.dataset.mode;
      if (gameMode === 'pve') showDifficultySelect();
      else startGame();
    });
  });

  document.getElementById('backFromMode').addEventListener('click', goToMenu);
  document.getElementById('startFightBtn').addEventListener('click', startGame);
  document.getElementById('backFromDifficulty').addEventListener('click', showModeSelect);
  document.getElementById('pauseResumeBtn').addEventListener('click', resumeGame);
  document.getElementById('pauseRestartBtn').addEventListener('click', restartGame);
  document.getElementById('pauseExitBtn').addEventListener('click', goToMenu);
  document.getElementById('gameoverRestartBtn').addEventListener('click', restartGame);
  document.getElementById('gameoverMenuBtn').addEventListener('click', goToMenu);
  document.getElementById('backToMenuBtn').addEventListener('click', goToMenu);

  // 初始化启动
  resetGame();
  gameState = 'menu';
  updateModeUI();
  updateHealthUI(); updateEnergyUI();
  updateCanvasCursor(); updateNameDisplay(); updateBossUI();

  gameLoop();
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
})();