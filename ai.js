/* AI 控制逻辑模块 */
window.GameAI = (function() {
  function getAIParams(level) {
    if (level === 11) {
      return {
        approachSpeed: 1.4, retreatSpeed: 1.4,
        jumpChance: 0.04, airAttackChance: 0.3,
        groundAttackChance: 0.35, lowAttackChance: 0.35,
        decisionInterval: 5, reactionDelay: 2, blockChance: 0.3,
        doubleJumpChance: 0.7, fireballChance: 0.18,
        fireballInterceptChance: 0.65, isBoss: true
      };
    }
    const t = (level - 1) / 9;
    return {
      approachSpeed: 0.5 + t * 0.9, retreatSpeed: 0.5 + t * 0.9,
      jumpChance: 0.006 + t * 0.03, airAttackChance: 0.05 + t * 0.25,
      groundAttackChance: 0.10 + t * 0.26, lowAttackChance: 0.08 + t * 0.26,
      decisionInterval: 20 - t * 15, reactionDelay: 14 - t * 12,
      blockChance: 0.04 + t * 0.22, doubleJumpChance: 0.3 + t * 0.4,
      fireballChance: 0.04 + t * 0.14, fireballInterceptChance: 0.05 + t * 0.15,
      isBoss: false
    };
  }

  // 普通 AI 逻辑
  function updateNormalAI(ctx, P1, P2, aiLevel, aiTimer, aiDecision, callbacks) {
    if (ctx.gameMode !== 'pve' || ctx.gameState !== 'playing' || P2.hitStun > 0 || ctx.isEditingName) return { aiTimer, aiDecision };
    
    const diff = getAIParams(aiLevel);
    aiTimer--;
    const distToP1 = Math.abs(P1.x - P2.x);
    const dx = P1.x - P2.x;
    const dy = P1.y - P2.y;

    if (P2.attackTimer <= 0) P2.facing = (dx > 0) ? 1 : -1;

    if (aiTimer <= 0) {
      aiTimer = Math.floor(diff.decisionInterval) + Math.floor(Math.random() * Math.floor(diff.decisionInterval));
      if (distToP1 > 120) aiDecision = 'approach';
      else if (distToP1 < 70) aiDecision = 'retreat';
      else aiDecision = Math.random() < 0.6 ? 'approach' : 'attack';
    }

    P2.blocking = false;

    if (aiDecision === 'approach' && distToP1 > 80) {
      if (dx > 0) P2.vx += diff.approachSpeed;
      else P2.vx -= diff.approachSpeed;
    } else if (aiDecision === 'retreat' && distToP1 < 100) {
      if (dx > 0) P2.vx -= diff.retreatSpeed;
      else P2.vx += diff.retreatSpeed;
      P2.blocking = true;
    }

    if (P2.blocking === false && distToP1 < 120 && Math.random() < diff.blockChance * 0.3) {
      if (P1.attackTimer > 0 || P1.attackCooldown > 8) P2.blocking = true;
    }

    if (P2.grounded && Math.random() < diff.jumpChance && distToP1 < 180) callbacks.doJump(P2);
    else if (!P2.grounded && P2.jumpCount < 2 && Math.random() < diff.doubleJumpChance * 0.08 && distToP1 < 150) callbacks.doJump(P2);

    if (distToP1 > 180 && P2.fireballCooldown <= 0 && P2.grounded && P2.attackTimer <= 0 && P2.hitStun <= 0) {
      if (Math.random() < diff.fireballChance) callbacks.shootFireball(P2, false);
    }

    if (P2.attackCooldown <= 0 && P2.hitStun <= 0) {
      if (!P2.grounded && distToP1 < 100 && Math.abs(dy) < 90) {
        if (Math.random() < diff.airAttackChance) callbacks.tryAttack(P2, P1, 'air');
      } else if (P2.grounded && distToP1 < 90) {
        if (!P1.grounded) {
          if (Math.random() < diff.groundAttackChance * 0.7) callbacks.tryAttack(P2, P1, 'ground');
        } else {
          const roll = Math.random();
          if (roll < diff.groundAttackChance) {
            if (Math.random() < 0.65) callbacks.tryAttack(P2, P1, 'low');
            else callbacks.tryAttack(P2, P1, 'ground');
          }
        }
      }
    }
    return { aiTimer, aiDecision };
  }

  return {
    getAIParams,
    updateNormalAI
  };
})();