// Shared data helpers for Slovak quiz/results (global, non-module)
// Attach to window.SlovakData
(function() {
  function normalizeTimestamp(raw) {
    if (!raw) return 0;
    if (typeof raw === 'number') return raw;
    const s = String(raw);
    const normalized = (s.includes(' ') && !s.includes('T')) ? s.replace(' ', 'T') : s;
    const d = new Date(normalized);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  }

  function localDateKeyFromTs(ts) {
    const d   = new Date(ts);
    const y   = d.getFullYear();
    const m   = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function endOfLocalDayTs(dateKey) {
    const [y, m, d] = dateKey.split('-').map(Number);
    return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
  }

  function extractWordPairArray(wordPair) {
    if (Array.isArray(wordPair)) return wordPair;
    if (wordPair && typeof wordPair === 'object') {
      return [wordPair[0] || wordPair['0'], wordPair[1] || wordPair['1']];
    }
    return null;
  }

  // Build per-word attempts map from allResults
  // Returns Map<wordPairKey, { wordPair, wordSets:Set, attempts:[{t,ok,almost}], masteryTyping:[{t,ok,almost}] }>
  function normalizeSetName(name) {
    if (!name) return 'Unknown Set';
    let s = String(name).trim();
    // Strip adaptive suffixes added to quiz names
    s = s.replace(/\s*-\s*(Vérification des acquis|Consolidation de l'apprentissage|Correction des lacunes)$/i, '').trim();
    return s;
  }

  function buildPerWordAttempts(allResults) {
    const perWord = new Map();
    const resultsArr = Object.values(allResults || {}).map(r => ({
      ...r,
      _ts: normalizeTimestamp(r.completionTimestamp || r.timestamp || r.date)
    })).sort((a, b) => a._ts - b._ts);

    const pushAttempts = (arr, ts, s, a, f) => {
      for (let i = 0; i < (s || 0); i++) arr.push({ t: ts, ok: true,  almost: false });
      for (let i = 0; i < (a || 0); i++) arr.push({ t: ts, ok: false, almost: true  });
      for (let i = 0; i < (f || 0); i++) arr.push({ t: ts, ok: false, almost: false });
    };

    resultsArr.forEach(result => {
      const ts = result._ts;
      const isMasteryTyping = (result.selectionMode === 'mastered') && ((result.quizType || 'typing') === 'typing');
      if (!Array.isArray(result.words)) return;
      result.words.forEach(wordData => {
        const wp = extractWordPairArray(wordData.wordPair);
        if (!wp || wp.length < 2 || !wp[0] || !wp[1]) return;
        const key = `${wp[0]}|${wp[1]}`;
        const setName = normalizeSetName(wordData.wordSetName || result.quizName || 'Unknown Set');
        if (!perWord.has(key)) perWord.set(key, { wordPair: wp, wordSets: new Set(), attempts: [], masteryTyping: [] });
        const node = perWord.get(key);
        node.wordSets.add(setName);

        pushAttempts(node.attempts, ts, wordData.french_to_slovak_successes, wordData.french_to_slovak_almosts, wordData.french_to_slovak_failures);
        pushAttempts(node.attempts, ts, wordData.slovak_to_french_successes, wordData.slovak_to_french_almosts, wordData.slovak_to_french_failures);
        pushAttempts(node.attempts, ts, wordData.matching_successes,         wordData.matching_almosts,         wordData.matching_failures);

        if (isMasteryTyping) {
          // Push attempts with direction information for mastery typing
          const pushAttemptsWithDirection = (array, timestamp, successes, almosts, failures, direction) => {
            for (let i = 0; i < (successes || 0); i++) array.push({ t: timestamp, ok: true, almost: false, direction });
            for (let i = 0; i < (almosts || 0); i++) array.push({ t: timestamp, ok: false, almost: true, direction });
            for (let i = 0; i < (failures || 0); i++) array.push({ t: timestamp, ok: false, almost: false, direction });
          };

          pushAttemptsWithDirection(node.masteryTyping, ts, wordData.french_to_slovak_successes, wordData.french_to_slovak_almosts, wordData.french_to_slovak_failures, 'french_to_slovak');
          pushAttemptsWithDirection(node.masteryTyping, ts, wordData.slovak_to_french_successes, wordData.slovak_to_french_almosts, wordData.slovak_to_french_failures, 'slovak_to_french');
        }
      });
    });

    return perWord;
  }

  // Compute window stats for last N attempts up to dayTs
  function computeWindowStats(attempts, dayTs, windowSize) {
    const upto              = attempts.filter(a => a.t <= dayTs);
    const window            = upto.slice(-windowSize);
    const total             = window.length;
    const incorrectWeighted = window.reduce((acc, a) => acc + (!a.ok ? (a.almost ? 0.5 : 1) : 0), 0);
    const successRate       = total > 0 ? ((total - incorrectWeighted) / total) * 100 : 0;
    return { total, successRate };
  }

  function categorizeWordByCriteria(node, dayTs, thresholds, filterWordSet) {
    if (filterWordSet && filterWordSet !== 'all' && !node.wordSets.has(filterWordSet)) return null;
    // Only count words that have appeared by this day
    const appearedAttempts = node.attempts.filter(a => a.t <= dayTs);
    if (appearedAttempts.length === 0) return null;
    const masteredStreak = thresholds.masteredStreak ||  4;
    const windowSize     = thresholds.windowSize     || 20;
    const minMastering   = thresholds.minMastering   ??  5;
    const masteringRate  = thresholds.masteringRate  ?? 90;
    const minStruggling  = thresholds.minStruggling  ??  1;
    const strugglingRate = thresholds.strugglingRate ?? 70;

    // Overall rolling performance up to this day (with almost = 0.5 weighting)
    const { total, successRate } = computeWindowStats(node.attempts, dayTs, windowSize);
    const qualifiesMasteringOverall = (total >= minMastering) && (successRate >= masteringRate);

    // Mastered requires BOTH: 75% success on latest 2 attempts per direction AND overall qualifies for mastering
    const masteryAttempts = node.masteryTyping.filter(a => a.t <= dayTs);

    // Separate attempts by direction
    const frenchToSlovakAttempts = masteryAttempts.filter(a => a.direction === 'french_to_slovak').slice(-2);
    const slovakToFrenchAttempts = masteryAttempts.filter(a => a.direction === 'slovak_to_french').slice(-2);

    // Check if we have at least 2 attempts in each direction
    const hasSufficientFrenchToSlovak = frenchToSlovakAttempts.length >= 2;
    const hasSufficientSlovakToFrench = slovakToFrenchAttempts.length >= 2;

    if (hasSufficientFrenchToSlovak && hasSufficientSlovakToFrench) {
      // Calculate success rate for each direction (75% threshold)
      const frenchToSlovakScore = frenchToSlovakAttempts.reduce((sum, a) => sum + (a.ok ? 1 : (a.almost ? 0.5 : 0)), 0) / frenchToSlovakAttempts.length;
      const slovakToFrenchScore = slovakToFrenchAttempts.reduce((sum, a) => sum + (a.ok ? 1 : (a.almost ? 0.5 : 0)), 0) / slovakToFrenchAttempts.length;

      const meetsFrenchToSlovakThreshold = frenchToSlovakScore >= 0.75;
      const meetsSlovakToFrenchThreshold = slovakToFrenchScore >= 0.75;

      if (meetsFrenchToSlovakThreshold && meetsSlovakToFrenchThreshold && qualifiesMasteringOverall) {
        return 'mastered';
      }
    }

    if (total >= minMastering  && successRate >= masteringRate) return 'mastering';
    if (total >= minStruggling && successRate < strugglingRate) return 'struggling';
    return 'learning';
  }

  function computeDailyCounts(perWord, dayTs, thresholds, filterWordSet) {
    let mastered = 0, mastering = 0, learning = 0, struggling = 0;
    perWord.forEach(node => {
      const cat = categorizeWordByCriteria(node, dayTs, thresholds, filterWordSet);
      if (!cat) return;
      if      (cat === 'mastered')   mastered++;
      else if (cat === 'mastering')  mastering++;
      else if (cat === 'struggling') struggling++;
      else learning++;
    });
    return { mastered, mastering, learning, struggling };
  }

  function computeRecentMasteryRatePerWord(perWord) {
    const result = new Map();
    perWord.forEach((node, key) => {
      const last4 = node.masteryTyping.slice(-4);
      const total = last4.length;
      const score = last4.reduce((s, a) => s + (a.ok ? 1 : (a.almost ? 0.5 : 0)), 0);
      const rate  = total > 0 ? (score / total) * 100 : null;
      result.set(key, { total, rate });
    });
    return result;
  }

  window.SlovakData = {
    defaultThresholds: { masteredStreak: 4, windowSize: 20, minMastering: 5, masteringRate: 90, minStruggling: 1, strugglingRate: 70 },
    normalizeTimestamp,
    extractWordPairArray,
    buildPerWordAttempts,
    computeWindowStats,
    categorizeWordByCriteria,
    computeDailyCounts,
    computeRecentMasteryRatePerWord,
    localDateKeyFromTs,
    endOfLocalDayTs,
    // Expose normalized set name helper under a stable API used by UI code
    normalizeWordSetName: normalizeSetName
  };
})();


