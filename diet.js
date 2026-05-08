  // ── 식단 / 음식 검색 변수 ──
  let foodSearchTimer = null;
  let addedFoodItems = [];

  function searchFoodLocal(query) {
    if (!query || query.length < 1) { hideFoodDropdown(); return; }
    const status = document.getElementById('food-search-status');
    const q = query.trim().replace(/\s+/g, '');
    
    // 정확한 이름 우선, 그 다음 포함 순으로 정렬 (최대 20개)
    const filtered = LOCAL_FOODS.foods.filter(f => f.n.replace(/\s+/g, '').includes(q));
    filtered.sort((a, b) => {
      const an = a.n.replace(/\s+/g, '');
      const bn = b.n.replace(/\s+/g, '');
      const aExact = an === q ? 0 : an.startsWith(q) ? 1 : 2;
      const bExact = bn === q ? 0 : bn.startsWith(q) ? 1 : 2;
      if (aExact !== bExact) return aExact - bExact;
      return an.length - bn.length; // 짧은 이름 우선
    });
    const results = filtered
      .slice(0, 20)
      .map(f => ({ name: f.n, kcal: f.k, protein: f.p || 0, fat: f.f || 0, carb: f.c || 0 }));

    if (status) status.textContent = results.length > 0 ? `${results.length}개 검색됨` : '결과 없음';
    showFoodDropdownNew(results);
  }

    function onFoodSearchInput(val) {
    clearTimeout(foodSearchTimer);
    if (!val) { hideFoodDropdown(); document.getElementById('food-search-status').textContent = ''; return; }
    foodSearchTimer = setTimeout(() => searchFoodLocal(val), 300);
  }

  function showFoodDropdownNew(results) {
    const dd = document.getElementById('food-search-dropdown');
    if (!dd) return;
    if (!results || results.length === 0) { dd.style.display = 'none'; return; }
    dd.innerHTML = results.map(item => {
      const name = (item.name || '').replace(/'/g, "\\'");
      const kcal = item.kcal || 0;
      return `<div onclick="addFoodItem('${name}',${kcal})"
        style="padding:10px 12px;cursor:pointer;border-bottom:0.5px solid var(--border);font-size:13px;"
        onmouseover="this.style.background='var(--bg)'" onmouseout="this.style.background='var(--card)'">
        <div style="font-weight:600;color:var(--text);">${item.name}</div>
        <div style="font-size:11px;color:var(--text-hint);margin-top:2px;">100g당 ${kcal} kcal</div>
      </div>`;
    }).join('');
    dd.style.display = 'block';
  }

  function hideFoodDropdown() {
    const dd = document.getElementById('food-search-dropdown');
    if (dd) dd.style.display = 'none';
  }

  function addFoodItem(name, kcalPer100g) {
    hideFoodDropdown();
    const mealType = document.getElementById('food-meal-type')?.value || '아침';
    const input = document.getElementById('food-search-input');
    if (input) { input.value = ''; }
    const status = document.getElementById('food-search-status');
    if (status) status.textContent = '';

    // 기본 100g 기준으로 추가
    const item = { name, kcal: kcalPer100g, kcalPer100g, amount: 100, meal: mealType, id: Date.now() };
    addedFoodItems.push(item);
    renderAddedFoods();
  }

  function renderAddedFoods() {
    const container = document.getElementById('food-items-container');
    const listWrap = document.getElementById('food-added-list');
    if (!container) return;

    if (addedFoodItems.length === 0) {
      if (listWrap) listWrap.style.display = 'none';
      return;
    }
    if (listWrap) listWrap.style.display = 'block';

    const mealColors = { '아침':'#BA7517','점심':'#185FA5','저녁':'#5F5E5A','간식':'#993556' };
    container.innerHTML = addedFoodItems.map(item => `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;padding:8px 10px;background:var(--card);border-radius:8px;">
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${item.name}</div>
          <div style="font-size:11px;color:${mealColors[item.meal]||'var(--text-hint)'};">${item.meal}</div>
        </div>
        <div style="display:flex;align-items:center;gap:4px;">
          <input type="number" value="${item.amount}" min="1" max="9999"
            onchange="updateFoodAmount(${item.id}, this.value)"
            style="width:52px;padding:4px 6px;border:1px solid var(--border);border-radius:6px;font-size:12px;text-align:center;background:var(--card);color:var(--text);font-family:'Noto Sans KR',sans-serif;">
          <span style="font-size:11px;color:var(--text-hint);">g</span>
        </div>
        <div style="font-size:13px;font-weight:700;color:#27500A;min-width:56px;text-align:right;">${Math.round(item.kcalPer100g * item.amount / 100)} kcal</div>
        <button onclick="removeFoodItem(${item.id})"
          style="background:none;border:none;color:#aaa;font-size:16px;cursor:pointer;padding:0 2px;">✕</button>
      </div>
    `).join('');

    updateTotalCalorie();
  }

  function updateFoodAmount(id, val) {
    const item = addedFoodItems.find(i => i.id === id);
    if (item) { item.amount = parseFloat(val) || 100; }
    renderAddedFoods();
  }

  function removeFoodItem(id) {
    addedFoodItems = addedFoodItems.filter(i => i.id !== id);
    renderAddedFoods();
  }

  function updateTotalCalorie() {
    const total = addedFoodItems.reduce((sum, i) => sum + Math.round(i.kcalPer100g * i.amount / 100), 0);
    const totalEl = document.getElementById('calorie-total');
    if (totalEl) totalEl.textContent = total > 0 ? '약 ' + total + ' kcal' : '';

    const userId = localStorage.getItem('current_user');
    const goalType = localStorage.getItem('body_goal_type_' + userId) || 'diet';
    const goalKcal = goalType === 'diet' ? 1500 : goalType === 'bulk' ? 2500 : 2000;
    const diff = goalKcal - total;
    const msgEl = document.getElementById('calorie-msg');
    if (msgEl && total > 0) {
      if (diff > 0) {
        msgEl.style.background = '#C0DD97'; msgEl.style.color = '#27500A';
        msgEl.textContent = '👍 목표보다 ' + diff + ' kcal 적어요!';
      } else if (diff < 0) {
        msgEl.style.background = '#F7C1C1'; msgEl.style.color = '#791F1F';
        msgEl.textContent = '⚠️ 목표보다 ' + Math.abs(diff) + ' kcal 초과했어요';
      } else {
        msgEl.style.background = '#C0DD97'; msgEl.style.color = '#27500A';
        msgEl.textContent = '🎯 목표 칼로리 딱 맞아요!';
      }
      msgEl.style.display = 'block';
    } else if (msgEl) { msgEl.style.display = 'none'; }
  }


  // ── 텍스트 입력 식단 칼로리 계산 ──
  function parseKcalFromText(text) {
    if (!text || !text.trim()) return 0;
    let total = 0;
    const items = text.split(/[,，\n]+/).map(s => s.trim()).filter(Boolean);

    items.forEach(item => {
      // ① g/ml 직접 표기 확인 ("200g", "150ml")
      const gDirectMatch = item.match(/(\d+\.?\d*)\s*g(?!l)/i);
      const mlDirectMatch = item.match(/(\d+\.?\d*)\s*ml/i);

      // ② 음식명 추출: 숫자+단위, 한글수량 모두 제거
      const cleanName = item
        .replace(/(\d+\.?\d*)\s*(개|봉|봉지|팩|줄|장|마리|조각|스쿱|스푼|큰술|작은술|캔|병|컵|잔|인분|그릇|공기|모|쪽|알|판|포|g|ml|kg)/gi, '')
        .replace(/(한|두|세|네|다섯)\s*(개|공기|그릇|줄|병|캔|컵|잔|팩|마리|인분|줌|스쿱|스푼|큰술|장|봉|봉지|조각|접시|판|알|쪽|송이|줌|냄비|상)/g, '')
        .replace(/반\s*(개|공기|그릇|줄|병|캔|컵|잔|팩|마리|인분|줌|스푼|판|모|줌|줄|마리)/g, '')
        .replace(/\s*(하나|소$|대$|중$)/g, '')
        .replace(/\d+/g, '')
        .trim();

      if (!cleanName) return;

      // ③ DB 매칭 (정확한 이름 우선, 짧은 이름 우선)
      let best = null, bestScore = 0;
      LOCAL_FOODS.foods.forEach(food => {
        const fn = food.n.replace(/\s+/g, '').toLowerCase();
        const cn = cleanName.replace(/\s+/g, '').toLowerCase();
        if (!cn) return;
        let score = 0;
        if (fn === cn) score = 1000;                        // 완전 일치 최우선
        else if (cn.length >= 2 && fn === cn) score = 900;
        else if (fn.startsWith(cn) || cn.startsWith(fn)) score = 500 - fn.length;
        else if (fn.includes(cn) && cn.length >= 2) score = 200 - fn.length;
        else if (cn.includes(fn) && fn.length >= 2) score = 100 - fn.length;
        if (score > bestScore) { bestScore = score; best = food; }
      });

      if (!best || bestScore === 0) return;

      // ④ g 직접 표기 → 그대로 사용
      if (gDirectMatch) {
        total += Math.round(best.k * parseFloat(gDirectMatch[1]) / 100);
        return;
      }
      if (mlDirectMatch) {
        total += Math.round(best.k * parseFloat(mlDirectMatch[1]) / 100);
        return;
      }

      // ⑤ 단위 테이블에서 1단위 그램 찾기
      // LOCAL_FOODS.units가 UNIT_TABLE보다 더 완전함 → units 우선, UNIT_TABLE은 보완
      let gramsPerUnit = 100;
      const mergedUnits = Object.assign({}, UNIT_TABLE, LOCAL_FOODS.units || {});
      let matchedKey = null, matchedUnitMap = null;
      // 1순위: cleanName 또는 best.n과 정확히 일치하는 키
      if (mergedUnits[cleanName]) { matchedKey = cleanName; matchedUnitMap = mergedUnits[cleanName]; }
      else if (mergedUnits[best.n]) { matchedKey = best.n; matchedUnitMap = mergedUnits[best.n]; }
      // 2순위: 가장 긴 키가 cleanName에 포함되거나, cleanName이 키에 포함 (긴 키 우선)
      if (!matchedKey) {
        let bestLen = 0;
        for (const k of Object.keys(mergedUnits)) {
          if (k.length > bestLen && (cleanName === k || cleanName.includes(k) || k.includes(cleanName))) {
            matchedKey = k; matchedUnitMap = mergedUnits[k]; bestLen = k.length;
          }
        }
      }
      // 3순위: best.n 기준 부분 매칭 (긴 키 우선)
      if (!matchedKey) {
        let bestLen = 0;
        for (const k of Object.keys(mergedUnits)) {
          if (k.length > bestLen && (best.n === k || best.n.includes(k) || k.includes(best.n))) {
            matchedKey = k; matchedUnitMap = mergedUnits[k]; bestLen = k.length;
          }
        }
      }
      let unitQtyFixed = false;
      if (matchedKey) {
        const unitMap = matchedUnitMap;
        // item에 포함된 단위 키워드 중 가장 긴 것 선택
        let bestUnitWord = null, bestUnitGram = 100;
        for (const [unitWord, unitGram] of Object.entries(unitMap)) {
          if (item.includes(unitWord)) {
            if (!bestUnitWord || unitWord.length > bestUnitWord.length) {
              bestUnitWord = unitWord; bestUnitGram = unitGram;
            }
          }
        }
        if (bestUnitWord) {
          gramsPerUnit = bestUnitGram;
          // 매칭된 단위에 숫자 없으면("반개","한공기","한줌") qty 고정
          unitQtyFixed = !/\d/.test(bestUnitWord);
        } else {
          // 직접 매칭 없으면 1단위 기준 그램 사용
          const oneUnit = Object.entries(unitMap).find(([w]) => w.startsWith('1'));
          if (oneUnit) gramsPerUnit = oneUnit[1];
        }
      }

      // ⑥ 수량(qty)
      let qty = 1;
      if (!unitQtyFixed) {
        const numUnitMatch = item.match(/(\d+\.?\d*)\s*(개|알|봉|봉지|팩|줄|장|마리|조각|인분|그릇|공기|캔|병|잔|컵)/);
        if (numUnitMatch) qty = parseFloat(numUnitMatch[1]);
        else if (/두\s*(개|공기|그릇)/.test(item)) qty = 2;
        else if (/세\s*(개|공기|그릇)/.test(item)) qty = 3;
      }

      total += Math.round(best.k * gramsPerUnit / 100) * qty;
    });
    return total;
  }


  // ── 카테고리별 임시저장 (운동팁/자유) ──
  function savePostDraft(cat) {
    if (cat === '식단') return; // 식단은 saveDietDraft()로 처리
    const today = new Date().toISOString().slice(0, 10);
    const content = document.getElementById('post-content')?.value || '';
    localStorage.setItem('post_draft_' + cat, JSON.stringify({ date: today, content }));
  }

  function loadPostDraft(cat) {
    if (cat === '식단') {
      setTimeout(() => loadDietDraft(), 100);
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    try {
      const draft = JSON.parse(localStorage.getItem('post_draft_' + cat) || 'null');
      if (!draft || draft.date !== today) return;
      const el = document.getElementById('post-content');
      if (el && draft.content) {
        el.value = draft.content;
        const toast = document.createElement('div');
        toast.textContent = '💾 오늘 임시저장된 내용을 불러왔어요!';
        toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#27500A;color:white;padding:10px 20px;border-radius:20px;font-size:13px;font-weight:700;z-index:9999;font-family:"Noto Sans KR",sans-serif;white-space:nowrap;';
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 2500);
      }
    } catch(e) {}
  }

  function clearPostDraft(cat) {
    if (cat === '식단') { localStorage.removeItem('diet_draft'); return; }
    localStorage.removeItem('post_draft_' + cat);
  }

  function toggleDietTip() {
    const box = document.getElementById('diet-tip-box');
    if (!box) return;
    box.style.display = box.style.display === 'none' ? 'block' : 'none';
  }

  function calcMealKcal() {
    const meals = {
      breakfast: { id: 'meal-breakfast', kcalId: 'kcal-breakfast' },
      lunch:     { id: 'meal-lunch',     kcalId: 'kcal-lunch' },
      dinner:    { id: 'meal-dinner',    kcalId: 'kcal-dinner' },
      snack:     { id: 'meal-snack',     kcalId: 'kcal-snack' },
    };
    let grandTotal = 0;
    Object.values(meals).forEach(m => {
      const el = document.getElementById(m.id);
      const kcalEl = document.getElementById(m.kcalId);
      if (!el || !kcalEl) return;
      const val = el.value.trim();
      if (!val) { kcalEl.textContent = ''; return; }
      const kcal = parseKcalFromText(val);
      kcalEl.textContent = kcal > 0 ? `약 ${kcal} kcal` : '';
      grandTotal += kcal;
    });

    const totalEl = document.getElementById('calorie-total');
    const listEl = document.getElementById('food-added-list');
    const msgEl = document.getElementById('calorie-msg');
    if (grandTotal > 0) {
      if (totalEl) totalEl.textContent = `약 ${grandTotal} kcal`;
      if (listEl) listEl.style.display = 'block';
      // 목표 칼로리 비교
      try {
        const u = JSON.parse(localStorage.getItem('current_user') || '{}');
        const goal = parseInt(u.goal_kcal || u.targetKcal || 0);
        if (goal > 0 && msgEl) {
          const diff = grandTotal - goal;
          if (diff < -100) { msgEl.style.background='#C0DD97';msgEl.style.color='#27500A';msgEl.textContent=`👍 목표보다 ${Math.abs(diff)} kcal 적게 드셨어요!`; }
          else if (diff > 100) { msgEl.style.background='#F7C1C1';msgEl.style.color='#791F1F';msgEl.textContent=`⚠️ 목표보다 ${diff} kcal 초과했어요`; }
          else { msgEl.style.background='#C0DD97';msgEl.style.color='#27500A';msgEl.textContent='🎯 목표 칼로리에 딱 맞게 드셨어요!'; }
          msgEl.style.display = 'block';
        } else if (msgEl) { msgEl.style.display = 'none'; }
      } catch(e) {}
    } else {
      if (listEl) listEl.style.display = 'none';
    }
  }

  function getMealSummaryForPost() {
    const b = document.getElementById('meal-breakfast')?.value.trim();
    const l = document.getElementById('meal-lunch')?.value.trim();
    const d = document.getElementById('meal-dinner')?.value.trim();
    const s = document.getElementById('meal-snack')?.value.trim();
    if (!b && !l && !d && !s) return '';
    let summary = '';
    // 끼니별 칼로리 계산 후 메뉴 끝에 표기
    if (b) { const k = parseKcalFromText(b); summary += `🌅 아침: ${b}${k > 0 ? ` (약 ${k} kcal)` : ''}\n`; }
    if (l) { const k = parseKcalFromText(l); summary += `☀️ 점심: ${l}${k > 0 ? ` (약 ${k} kcal)` : ''}\n`; }
    if (d) { const k = parseKcalFromText(d); summary += `🌙 저녁: ${d}${k > 0 ? ` (약 ${k} kcal)` : ''}\n`; }
    if (s) { const k = parseKcalFromText(s); summary += `🍎 간식: ${s}${k > 0 ? ` (약 ${k} kcal)` : ''}\n`; }
    const total = parseKcalFromText([b,l,d,s].filter(Boolean).join(','));
    if (total > 0) summary += `🔥 총 칼로리: 약 ${total} kcal`;
    return summary.trim();
  }

  // 기존 코드 호환용 (사용 안 함)
  function calcKcalFromText(text) {
    if (!text) return 0;
    let total = 0;
    const lines = text.split(/[,\n]/);
    lines.forEach(line => {
      line = line.trim();
      if (!line) return;
      // 수량 파싱 (예: 2개, 2인분, 반 공기)
      let qty = 1;
      const qtyMatch = line.match(/(\d+\.?\d*)\s*(개|인분|그릇|줄|장|마리|조각|스쿱|캔|병|컵|잔|큰술)/);
      if (qtyMatch) qty = parseFloat(qtyMatch[1]);
      if (line.includes('반')) qty = 0.5;
      if (line.includes('두') && !line.includes('두부')) qty = 2;
      if (line.includes('세') && line.includes('개')) qty = 3;

      // 그람 파싱 (예: 200g)
      let grams = null;
      const gramMatch = line.match(/(\d+\.?\d*)\s*g/);
      if (gramMatch) grams = parseFloat(gramMatch[1]);

      // DB에서 매칭
      let best = null;
      let bestScore = 0;
      LOCAL_FOODS.foods.forEach(food => {
        const foodName = food.n.replace(/\s+/g, '').toLowerCase();
        const lineLower = line.replace(/\s+/g, '').toLowerCase();
        // 음식 이름의 핵심 단어 추출
        const keywords = food.n.split(/[\s\d개그릇줄장마리조각스쿱캔병컵잔큰술gml]+/).filter(w => w.length >= 2);
        let score = 0;
        keywords.forEach(kw => {
          if (lineLower.includes(kw.toLowerCase())) score++;
        });
        if (score > bestScore) { bestScore = score; best = food; }
      });

      if (best && bestScore > 0) {
        // 그람 단위가 있으면 비례 계산
        if (grams) {
          const baseGramMatch = best.n.match(/(\d+)\s*g/);
          if (baseGramMatch) {
            const baseGram = parseFloat(baseGramMatch[1]);
            total += (best.k / baseGram) * grams * qty;
          } else {
            total += best.k * qty;
          }
        } else {
          total += best.k * qty;
        }
      }
    });
    return Math.round(total);
  }

  // 칼로리 계산 함수 (끼니별, 로컬 DB)
  function calcCalorieAI() {
    const meals = {
      breakfast: { label: '🌅 아침', val: document.getElementById('meal-breakfast')?.value.trim() },
      lunch:     { label: '☀️ 점심', val: document.getElementById('meal-lunch')?.value.trim() },
      dinner:    { label: '🌙 저녁', val: document.getElementById('meal-dinner')?.value.trim() },
      snack:     { label: '🍎 간식', val: document.getElementById('meal-snack')?.value.trim() },
    };
    const hasAny = Object.values(meals).some(m => m.val);
    if (!hasAny) { alert('최소 한 끼니 이상 입력해주세요!'); return; }

    const mealMap = { breakfast: '🌅 아침', lunch: '☀️ 점심', dinner: '🌙 저녁', snack: '🍎 간식' };
    const mealKcalIds = { breakfast: 'kcal-breakfast', lunch: 'kcal-lunch', dinner: 'kcal-dinner', snack: 'kcal-snack' };
    const results = {};
    let total = 0;

    Object.entries(meals).forEach(([key, meal]) => {
      const kcal = meal.val ? calcKcalFromText(meal.val) : 0;
      results[key] = kcal;
      total += kcal;
      const el = document.getElementById(mealKcalIds[key]);
      if (el) el.textContent = kcal > 0 ? '약 ' + kcal + ' kcal' : '';
    });

    // 결과 목록
    const listEl = document.getElementById('calorie-result-list');
    listEl.innerHTML = Object.entries(results).map(([key, kcal]) => `
      <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:5px;">
        <span style="color:var(--text-sub);">${mealMap[key]}</span>
        <span style="color:var(--text);font-weight:700;">${meals[key].val ? (kcal > 0 ? '약 ' + kcal + ' kcal' : '인식 불가') : '미입력'}</span>
      </div>
    `).join('');

    document.getElementById('calorie-total').textContent = '약 ' + total + ' kcal';

    // 목표 칼로리 대비 메시지
    const userId = localStorage.getItem('current_user');
    const goalType = localStorage.getItem('body_goal_type_' + userId) || 'diet';
    const goalKcal = goalType === 'diet' ? 1500 : goalType === 'bulk' ? 2500 : 2000;
    const diff = goalKcal - total;
    const msgEl = document.getElementById('calorie-msg');
    if (diff > 0) {
      msgEl.style.background = '#C0DD97';
      msgEl.style.color = '#27500A';
      msgEl.textContent = '👍 목표보다 ' + diff + ' kcal 적게 드셨어요!';
    } else if (diff < 0) {
      msgEl.style.background = '#F7C1C1';
      msgEl.style.color = '#791F1F';
      msgEl.textContent = '⚠️ 목표보다 ' + Math.abs(diff) + ' kcal 더 드셨어요';
    } else {
      msgEl.style.background = '#C0DD97';
      msgEl.style.color = '#27500A';
      msgEl.textContent = '🎯 목표 칼로리에 딱 맞게 드셨어요!';
    }

    document.getElementById('calorie-result').style.display = 'block';
  }


  // ── 식단 사진 그리드 관련 ──
  let mealPhotos = [null, null, null, null]; // 0:아침 1:점심 2:저녁 3:간식
  let currentPhotoIndex = 0;
  const mealPhotoLabels = ['🌅 아침', '☀️ 점심', '🌙 저녁', '🍎 간식'];

  function openPhotoSheet(idx) {
    currentPhotoIndex = idx;
    const sheet = document.getElementById('photo-sheet');
    const overlay = document.getElementById('photo-sheet-overlay');
    const title = document.getElementById('photo-sheet-title');
    const deleteBtn = document.getElementById('photo-sheet-delete');
    title.textContent = mealPhotoLabels[idx] + ' 사진';
    deleteBtn.style.display = mealPhotos[idx] ? 'block' : 'none';
    sheet.style.display = 'block';
    overlay.style.display = 'block';
  }

  function closePhotoSheet() {
    document.getElementById('photo-sheet').style.display = 'none';
    document.getElementById('photo-sheet-overlay').style.display = 'none';
  }

  function chooseMealPhoto(type) {
    closePhotoSheet();
    const input = document.getElementById(
      type === 'camera' ? 'meal-photo-camera-input' : 'meal-photo-gallery-input'
    );
    input.value = '';
    input.click();
  }

  function handleMealPhoto(input) {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = e => {
      mealPhotos[currentPhotoIndex] = e.target.result;
      renderMealPhotoGrid();
      saveDietDraftAuto();
    };
    reader.readAsDataURL(file);
  }

  function deleteMealPhoto() {
    mealPhotos[currentPhotoIndex] = null;
    renderMealPhotoGrid();
    closePhotoSheet();
    saveDietDraftAuto();
  }

  function renderMealPhotoGrid() {
    const labels = ['🌅 아침', '☀️ 점심', '🌙 저녁', '🍎 간식'];
    for (let i = 0; i < 4; i++) {
      const cell = document.getElementById('meal-photo-cell-' + i);
      if (!cell) continue;
      if (mealPhotos[i]) {
        cell.innerHTML = `
          <img src="${mealPhotos[i]}" style="width:100%;height:100%;object-fit:cover;display:block;" />
          <div style="position:absolute;bottom:4px;left:4px;background:rgba(0,0,0,0.5);color:white;font-size:10px;padding:2px 6px;border-radius:8px;">${labels[i]}</div>`;
        cell.style.border = 'none';
      } else {
        cell.innerHTML = `
          <div style="font-size:20px;">📷</div>
          <div style="font-size:11px;color:var(--text-hint);margin-top:4px;">${labels[i]}</div>`;
        cell.style.border = '1.5px dashed var(--border)';
      }
    }
  }

  // canvas로 사진 합성 (1~4장 → 1장)
  async function composeMealPhotos() {
    const photos = mealPhotos.filter(Boolean);
    if (photos.length === 0) return null;

    const SIZE = 800; // 출력 캔버스 크기
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(0, 0, SIZE, SIZE);

    const loadImg = src => new Promise(res => {
      const img = new Image();
      img.onload = () => res(img);
      img.src = src;
    });

    const imgs = await Promise.all(photos.map(loadImg));
    const n = imgs.length;

    if (n === 1) {
      ctx.drawImage(imgs[0], 0, 0, SIZE, SIZE);
    } else if (n === 2) {
      ctx.drawImage(imgs[0], 0, 0, SIZE/2 - 1, SIZE);
      ctx.drawImage(imgs[1], SIZE/2 + 1, 0, SIZE/2 - 1, SIZE);
    } else if (n === 3) {
      ctx.drawImage(imgs[0], 0, 0, SIZE/2 - 1, SIZE);
      ctx.drawImage(imgs[1], SIZE/2 + 1, 0, SIZE/2 - 1, SIZE/2 - 1);
      ctx.drawImage(imgs[2], SIZE/2 + 1, SIZE/2 + 1, SIZE/2 - 1, SIZE/2 - 1);
    } else {
      const h = SIZE / 2 - 1;
      const w = SIZE / 2 - 1;
      ctx.drawImage(imgs[0], 0,       0,       w, h);
      ctx.drawImage(imgs[1], SIZE/2+1, 0,       w, h);
      ctx.drawImage(imgs[2], 0,       SIZE/2+1, w, h);
      ctx.drawImage(imgs[3], SIZE/2+1, SIZE/2+1, w, h);
    }

    return new Promise(res => canvas.toBlob(blob => res(blob), 'image/jpeg', 0.75));
  }

  // ── 임시저장 ──
  // 사진 압축 (임시저장용 - 가로 400px, 품질 50% → 약 50~80KB)
  function compressPhotoForDraft(base64) {
    return new Promise(res => {
      const img = new Image();
      img.onload = () => {
        const MAX = 400;
        const ratio = Math.min(MAX / img.width, MAX / img.height, 1);
        const canvas = document.createElement('canvas');
        canvas.width  = Math.round(img.width  * ratio);
        canvas.height = Math.round(img.height * ratio);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        res(canvas.toDataURL('image/jpeg', 0.5));
      };
      img.onerror = () => res(null);
      img.src = base64;
    });
  }

  async function saveDietDraftAuto() {
    const today = new Date().toISOString().slice(0, 10);
    // 사진 압축 후 저장 (용량 초과 방지)
    const compressedPhotos = await Promise.all(
      mealPhotos.map(p => p ? compressPhotoForDraft(p) : Promise.resolve(null))
    );
    const draft = {
      date:      today,
      breakfast: document.getElementById('meal-breakfast')?.value || '',
      lunch:     document.getElementById('meal-lunch')?.value || '',
      dinner:    document.getElementById('meal-dinner')?.value || '',
      snack:     document.getElementById('meal-snack')?.value || '',
      photos:    compressedPhotos,
    };
    try {
      localStorage.setItem('diet_draft', JSON.stringify(draft));
      return true;
    } catch(e) {
      // 그래도 용량 초과 시 사진 없이 텍스트만 저장
      draft.photos = [null, null, null, null];
      try { localStorage.setItem('diet_draft', JSON.stringify(draft)); } catch(e2) {}
      return false;
    }
  }

  async function saveDietDraft() {
    const toast = document.createElement('div');
    toast.textContent = '저장 중...';
    toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#888;color:white;padding:10px 20px;border-radius:20px;font-size:13px;font-weight:700;z-index:9999;font-family:"Noto Sans KR",sans-serif;';
    document.body.appendChild(toast);
    const cat = document.getElementById('post-category')?.value || '식단';
    if (cat !== '식단') {
      savePostDraft(cat);
      const toast = document.createElement('div');
      toast.textContent = '💾 임시저장 완료!';
      toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#185FA5;color:white;padding:10px 20px;border-radius:20px;font-size:13px;font-weight:700;z-index:9999;font-family:"Noto Sans KR",sans-serif;';
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 2000);
      return;
    }
    const ok = await saveDietDraftAuto();
    toast.textContent = ok ? '💾 임시저장 완료!' : '💾 텍스트만 저장됐어요 (사진 용량 초과)';
    toast.style.background = ok ? '#185FA5' : '#e67e22';
    setTimeout(() => toast.remove(), 2000);
  }

  function loadDietDraft() {
    const today = new Date().toISOString().slice(0, 10);
    try {
      const draft = JSON.parse(localStorage.getItem('diet_draft') || 'null');
      if (!draft || draft.date !== today) return;
      const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
      set('meal-breakfast', draft.breakfast || '');
      set('meal-lunch',     draft.lunch     || '');
      set('meal-dinner',    draft.dinner    || '');
      set('meal-snack',     draft.snack     || '');
      if (draft.photos) {
        mealPhotos = draft.photos;
        renderMealPhotoGrid();
      }
      calcMealKcal();
      if (draft.breakfast || draft.lunch || draft.dinner || draft.snack) {
        const toast = document.createElement('div');
        toast.textContent = '💾 오늘 임시저장된 식단을 불러왔어요!';
        toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#27500A;color:white;padding:10px 20px;border-radius:20px;font-size:13px;font-weight:700;z-index:9999;font-family:"Noto Sans KR",sans-serif;white-space:nowrap;';
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 2500);
      }
    } catch(e) {}
  }

  function previewPostPhoto(input) {
    if (!input.files || !input.files[0]) return;
    postPhotoFile = input.files[0];
    const reader = new FileReader();
    reader.onload = e => {
      document.getElementById('post-photo-preview').src = e.target.result;
      document.getElementById('post-photo-preview-wrap').style.display = 'block';
      
    };
    reader.readAsDataURL(postPhotoFile);
  }

  function removePostPhoto() {
    postPhotoFile = null;
    document.getElementById('post-photo-preview-wrap').style.display = 'none';
    
    document.getElementById('post-photo-camera').value = '';
    document.getElementById('post-photo-gallery').value = '';
  }

  // ── 이미지 압축 (1MB 이하로) ──
  function compressImage(file, maxSizeMB = 1) {
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = e => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let { width, height } = img;
          // 최대 1280px
          const MAX = 1280;
          if (width > MAX || height > MAX) {
            if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
            else { width = Math.round(width * MAX / height); height = MAX; }
          }
          canvas.width = width; canvas.height = height;
          canvas.getContext('2d').drawImage(img, 0, 0, width, height);
          // 품질 조정
          let quality = 0.8;
          const tryCompress = () => {
            canvas.toBlob(blob => {
              if (blob.size > maxSizeMB * 1024 * 1024 && quality > 0.3) {
                quality -= 0.1;
                tryCompress();
              } else {
                resolve(blob);
              }
            }, 'image/jpeg', quality);
          };
          tryCompress();
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // ── 게시글 제출 ──
  async function submitPost() {
    const category = document.getElementById('post-category').value;
    let content = document.getElementById('post-content').value.trim();
    // 식단 카테고리면 추가된 음식 목록으로 내용 합치기
    if (category === '식단') {
      const mealSummary = getMealSummaryForPost();
      if (mealSummary) content = mealSummary;
    }
    if (!content) { alert('내용을 입력해주세요!'); return; }

    const userId = localStorage.getItem('current_user');
    const nickname = localStorage.getItem('name_' + userId) || '회원';
    const btn = document.getElementById('post-submit-btn');
    btn.textContent = '업로드 중...';
    btn.disabled = true;

    try {
      let photoURL = null;

      // 사진 업로드 (식단: 합성, 일반: 단일)
      const hasMealPhotos = mealPhotos.some(Boolean);
      if (category === '식단' && hasMealPhotos) {
        try {
          btn.textContent = '사진 합성 중...';
          const composed = await composeMealPhotos();
          if (composed) {
            btn.textContent = '사진 업로드 중...';
            const ref = storage.ref('posts/' + Date.now() + '_' + userId + '.jpg');
            const snapshot = await ref.put(composed);
            photoURL = await snapshot.ref.getDownloadURL();
          }
        } catch(photoErr) {
          console.error('사진 업로드 오류:', photoErr);
          const yn = confirm('사진 업로드에 실패했어요.\n사진 없이 글만 올릴까요?');
          if (!yn) { btn.textContent = '게시하기 🚀'; btn.disabled = false; return; }
        }
      } else if (postPhotoFile) {
        try {
          btn.textContent = '사진 업로드 중...';
          const compressed = await compressImage(postPhotoFile);
          const ref = storage.ref('posts/' + Date.now() + '_' + userId + '.jpg');
          const snapshot = await ref.put(compressed);
          photoURL = await snapshot.ref.getDownloadURL();
        } catch(photoErr) {
          console.error('사진 업로드 오류:', photoErr);
          const yn = confirm('사진 업로드에 실패했어요.\n사진 없이 글만 올릴까요?');
          if (!yn) { btn.textContent = '게시하기 🚀'; btn.disabled = false; return; }
        }
      }

      btn.textContent = '게시 중...';
      const postData = {
        authorId: userId, nickname, category, content,
        photoURL: photoURL || null,
        createdAt: Date.now(),
        commentCount: 0
      };

      await db.ref('posts').push(postData);
      const postCat = document.getElementById('post-category')?.value || '식단';
    clearPostDraft(postCat);
    mealPhotos = [null, null, null, null];
    closePostModal();
      // 피드 강제 갱신 (리스너 재등록)
      loadCommunityFeed(currentCategory);

    } catch(e) {
      console.error('게시글 업로드 오류:', e);
      alert('게시 실패했어요.\n오류: ' + (e.message || e));
      btn.textContent = '게시하기 🚀';
      btn.disabled = false;
    }
  }

  // ── 댓글 ──
  function openCommentModal(postId, preview) {
    currentCommentPostId = postId;
    document.getElementById('comment-post-preview').textContent = preview + (preview.length >= 50 ? '...' : '');
    document.getElementById('comment-input').value = '';
    loadComments(postId);
    document.getElementById('comment-modal').classList.add('active');
  }

  function closeCommentModal() {
    document.getElementById('comment-modal').classList.remove('active');
    currentCommentPostId = null;
  }

  let replyTargetId = null;   // 대댓글 대상 댓글 ID
  let replyTargetNick = null; // 대댓글 대상 닉네임

  function loadComments(postId) {
    const listEl = document.getElementById('comment-list');
    const titleEl = document.getElementById('comment-modal-title');
    listEl.innerHTML = '<div style="text-align:center;padding:16px;color:var(--text-hint);font-size:13px;">불러오는 중...</div>';

    db.ref('comments/' + postId).once('value', snap => {
      const userId = localStorage.getItem('current_user');
      const isAdmin = userId === ADMIN_ID;
      const comments = [];

      snap.forEach(child => {
        const val = child.val();
        if (val) comments.push({ id: child.key, ...val });
      });

      // 시간순 정렬
      comments.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

      // 실제 댓글 수로 commentCount 자동 보정 (update로 다른 필드 보존)
      const realCount = comments.length;
      db.ref('posts/' + postId + '/commentCount').once('value', cs => {
        if ((cs.val() || 0) !== realCount) {
          db.ref('posts/' + postId + '/commentCount').set(realCount);
        }
      });
      // 피드 카운터 즉시 업데이트
      const countEl = document.getElementById('comment-count-' + postId);
      if (countEl) countEl.textContent = realCount;

      if (titleEl) titleEl.textContent = '💬 댓글 ' + realCount + '개';

      if (comments.length === 0) {
        listEl.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-hint);font-size:13px;">첫 댓글을 남겨보세요!</div>';
        return;
      }

      // 루트 댓글 / 대댓글 분리
      const roots = comments.filter(c => !c.replyTo);
      const replyMap = {};
      comments.filter(c => c.replyTo).forEach(c => {
        if (!replyMap[c.replyTo]) replyMap[c.replyTo] = [];
        replyMap[c.replyTo].push(c);
      });

      function renderComment(c, isReply) {
        const replies = replyMap[c.id] || [];
        const avatarBg = isReply ? '#8b5cf6' : 'var(--blue)';
        const avatarSize = isReply ? 26 : 32;
        const replyTag = isReply ? `<span style="font-size:11px;color:var(--blue);font-weight:600;">@${c.replyToNick||''}</span>` : '';
        const indent = isReply ? 'margin-left:38px;padding-left:10px;border-left:2px solid var(--blue-light);' : '';

        return `
          <div style="padding:8px 0;border-bottom:1px solid var(--border);${indent}">
            <div style="display:flex;gap:8px;align-items:flex-start;">
              <div style="width:${avatarSize}px;height:${avatarSize}px;border-radius:50%;background:${avatarBg};color:white;display:flex;align-items:center;justify-content:center;font-size:${isReply?11:13}px;font-weight:700;flex-shrink:0;">${(maskName(c.nickname||'?', isAdmin))[0]}</div>
              <div style="flex:1;min-width:0;">
                <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-bottom:3px;">
                  <span style="font-size:13px;font-weight:700;color:var(--text);">${maskName(c.nickname, isAdmin)}</span>
                  ${replyTag}
                  <span style="font-size:11px;color:var(--text-hint);">${getTimeAgo(c.createdAt)}</span>
                  <button onclick="startReply('${c.id}','${(c.nickname||'').replace(/'/g,"\\'")}')" style="background:none;border:none;color:var(--blue);cursor:pointer;font-size:11px;font-weight:600;font-family:'Noto Sans KR',sans-serif;padding:0;">↩️ 답글</button>
                  ${(c.authorId === userId || isAdmin) ? `<button onclick="deleteComment('${postId}','${c.id}')" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:11px;padding:0;">삭제</button>` : ''}
                </div>
                <div style="font-size:13px;color:var(--text);line-height:1.6;word-break:break-all;">${(c.content||'').replace(/</g,'&lt;')}</div>
              </div>
            </div>
          </div>
          ${replies.map(r => renderComment(r, true)).join('')}`;
      }

      listEl.innerHTML = roots.map(c => renderComment(c, false)).join('');

    }, err => {
      console.error('댓글 오류:', err);
      if (titleEl) titleEl.textContent = '💬 댓글';
      listEl.innerHTML = '<div style="text-align:center;padding:16px;color:#ef4444;font-size:13px;">댓글을 불러오지 못했어요.</div>';
    });
  }

  function startReply(commentId, nickname) {
    replyTargetId = commentId;
    replyTargetNick = nickname;
    const indicator = document.getElementById('reply-indicator');
    indicator.style.display = 'flex';
    document.getElementById('reply-indicator-text').textContent = '↩️ ' + nickname + '님에게 답글 작성 중';
    document.getElementById('comment-input').placeholder = nickname + '님에게 답글...';
    document.getElementById('comment-input').focus();
  }

  function cancelReply() {
    replyTargetId = null;
    replyTargetNick = null;
    document.getElementById('reply-indicator').style.display = 'none';
    document.getElementById('comment-input').placeholder = '댓글을 입력하세요...';
  }

  function submitComment() {
    const content = document.getElementById('comment-input').value.trim();
    if (!content || !currentCommentPostId) return;
    const userId = localStorage.getItem('current_user');
    const nickname = localStorage.getItem('name_' + userId);
    // 로그인 상태 확인
    if (!userId || !nickname) {
      alert('로그인이 필요해요.\n다시 로그인해주세요.');
      return;
    }

    const comment = {
      authorId: userId, nickname, content,
      createdAt: Date.now()
    };

    // 대댓글이면 replyTo 필드 추가
    if (replyTargetId) {
      comment.replyTo = replyTargetId;
      comment.replyToNick = replyTargetNick;
    }

    // postId와 comment를 클로저로 캡처
    const capturedPostId = currentCommentPostId;
    const capturedComment = { ...comment };

    db.ref('comments/' + capturedPostId).push(capturedComment).then(() => {
      document.getElementById('comment-input').value = '';
      cancelReply();
      // 댓글 수 업데이트
      db.ref('posts/' + capturedPostId + '/commentCount').transaction(v => (v||0) + 1).then(result => {
        const newCount = result.snapshot.val() || 0;
        const countEl = document.getElementById('comment-count-' + capturedPostId);
        if (countEl) countEl.textContent = newCount;
      });
      // 알림 저장 (loadComments와 완전히 독립 실행)
      saveCommentNotification(capturedPostId, capturedComment);
      // 댓글 목록 갱신
      loadComments(capturedPostId);
    });
  }

  function deleteComment(postId, commentId) {
    if (!confirm('댓글을 삭제할까요?\n답글도 함께 삭제돼요.')) return;

    // 먼저 해당 댓글의 답글 수 파악 후 함께 삭제 (답글의 답글까지 전부)
    db.ref('comments/' + postId).once('value', snap => {
      let deleteCount = 0;
      const toDelete = new Set();

      // 1단계: 직접 답글 찾기
      snap.forEach(child => {
        const v = child.val();
        if (child.key === commentId) {
          toDelete.add(child.key);
        }
        if (v && v.replyTo === commentId) {
          toDelete.add(child.key);
        }
      });

      // 2단계: 답글의 답글 반복 탐색
      let changed = true;
      while (changed) {
        changed = false;
        snap.forEach(child => {
          const v = child.val();
          if (v && v.replyTo && toDelete.has(v.replyTo) && !toDelete.has(child.key)) {
            toDelete.add(child.key);
            changed = true;
          }
        });
      }

      deleteCount = toDelete.size;
      const toDeleteArr = Array.from(toDelete);

      // 일괄 삭제
      const deletePromises = toDeleteArr.map(key =>
        db.ref('comments/' + postId + '/' + key).remove()
      );

      Promise.all(deletePromises).then(() => {
        // 삭제된 총 개수만큼 commentCount 감소
        db.ref('posts/' + postId + '/commentCount').transaction(v =>
          Math.max((v || 0) - deleteCount, 0)
        ).then(result => {
          const newCount = result.snapshot.val() || 0;
          const countEl = document.getElementById('comment-count-' + postId);
          if (countEl) countEl.textContent = newCount;
        });
        loadComments(postId);
      });
    });
  }

  // ── 시간 계산 ──
  // ══════════════════════════════
  // 내 정보
  // ══════════════════════════════
