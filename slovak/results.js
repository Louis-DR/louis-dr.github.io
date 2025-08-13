// Results display functionality - uses dynamic imports to avoid CORS issues
// Firebase configuration (same as quiz.js)
const firebaseConfig = {
  apiKey:            "AIzaSyA7ad7v3U1TatATrOrwzYYWcXk2gfKt78g",
  authDomain:        "slovakquiz-7c08b.firebaseapp.com",
  databaseURL:       "https://slovakquiz-7c08b-default-rtdb.europe-west1.firebasedatabase.app",
  projectId:         "slovakquiz-7c08b",
  storageBucket:     "slovakquiz-7c08b.firebasestorage.app",
  messagingSenderId: "815686679109",
  appId:             "1:815686679109:web:a539f63532c921707ec12c",
  measurementId:     "G-XGGHW6L1M1"
};

// Firebase app and database - will be initialized when needed
let firebaseApp = null;
let database    = null;
let auth        = null;
let currentUser = null;

// Ensure shared data helpers are present
async function ensureDataHelpersLoaded() {
  if (window.SlovakData) return true;
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src$="data.js"]');
    if (existing) {
      existing.addEventListener('load',  () => resolve(true));
      existing.addEventListener('error', () => reject(new Error('Failed to load data.js')));
      return;
    }
    const script = document.createElement('script');
    script.src = 'data.js';
    script.onload  = () => resolve(true);
    script.onerror = () => reject(new Error('Failed to load data.js'));
    document.head.appendChild(script);
  });
}

/**
 * Initialize Firebase if not already done
 */
async function initializeFirebase() {
  if (firebaseApp) {
    return; // Already initialized
  }

  try {
    // Dynamic imports to avoid CORS issues with file:// protocol
    const { initializeApp } = await import("https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js");
    const { getDatabase }   = await import("https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js");
    const { getAuth }       = await import("https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js");

    // Initialize Firebase app and database
    firebaseApp = initializeApp(firebaseConfig);
    database    = getDatabase(firebaseApp);
    auth        = getAuth(firebaseApp);

    console.log("Firebase initialized successfully for results");
  } catch (error) {
    console.error("Error initializing Firebase:", error);
    throw error;
  }
}

/**
 * Fetch all quiz results from Firebase
 */
async function fetchAllResults() {
  try {
    // Initialize Firebase if not already done
    await initializeFirebase();

    if (!currentUser) {
      console.log("No user logged in, cannot fetch results.");
      return {};
    }

    // Dynamic import for database functions
    const { ref, get } = await import("https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js");

    // Get reference to the results node for the current user
    const resultsRef = ref(database, `results/${currentUser.uid}`);

    // Fetch all data
    const snapshot = await get(resultsRef);

    if (snapshot.exists()) {
      const data = snapshot.val();
      console.log(`Fetched results for user ${currentUser.uid}:`, data);
      return data;
    } else {
      console.log(`No results found for user ${currentUser.uid}`);
      return {};
    }
  } catch (error) {
    console.error("Error fetching results from Firebase:", error);
    throw error;
  }
}

/**
 * Aggregate word pair statistics from all quiz results
 */
function aggregateWordPairStats(allResults, filterWordSet = null) {
  const wordStats   = new Map();
  const allWordSets = new Set(); // Track all unique word sets

  // Build a time-ordered list of results to compute recent mastery typing rates
  const orderedResults = Object.values(allResults)
    .map(r => ({
      ...r,
      _ts: (() => {
        const raw        = r.completionTimestamp || r.timestamp || r.date;
        const str        = typeof raw === 'number' ? new Date(raw).toISOString() : String(raw || '');
        const normalized = (str.includes(' ') && !str.includes('T')) ? str.replace(' ', 'T') : str;
        const d          = new Date(normalized);
        return isNaN(d.getTime()) ? 0 : d.getTime();
      })()
    }))
    .sort((a, b) => a._ts - b._ts);

  // Map of wordPairKey -> array of recent mastery typing attempt scores (1 success, 0.5 almost, 0 failure)
  const masteryAttemptScoresByWord = new Map();
  // Map of wordPairKey -> { frenchToSlovak: [], slovakToFrench: [] } for direction-specific tracking
  const masteryAttemptsByDirection = new Map();

  // Process each quiz result for aggregate stats
  Object.values(allResults).forEach(result => {
    if (result.words && Array.isArray(result.words)) {
      const quizType = result.quizType || 'unknown';

      result.words.forEach(wordData => {
        // Handle both array and object formats for wordPair
        let wordPairArray;
        if (Array.isArray(wordData.wordPair)) {
          wordPairArray = wordData.wordPair;
        } else if (wordData.wordPair && typeof wordData.wordPair === 'object') {
          wordPairArray = [wordData.wordPair[0] || wordData.wordPair["0"], wordData.wordPair[1] || wordData.wordPair["1"]];
        } else {
          return; // Skip if wordPair is invalid
        }

        if (!wordPairArray || wordPairArray.length < 2 || !wordPairArray[0] || !wordPairArray[1]) {
          return; // Skip if wordPair is invalid
        }

        const frenchWord  = wordPairArray[0];
        const slovakWord  = wordPairArray[1];
        const rawSetName  = wordData.wordSetName || result.quizName || 'Unknown Set';
        const wordSetName = (window.SlovakData && typeof window.SlovakData.normalizeWordSetName === 'function')
          ? window.SlovakData.normalizeWordSetName(rawSetName)
          : rawSetName;
        const wordPairKey = `${frenchWord}|${slovakWord}`;

        // Track all word sets
        allWordSets.add(wordSetName);

        // Apply filter if specified
        if (filterWordSet && filterWordSet !== 'all' && wordSetName !== filterWordSet) {
          return; // Skip this word if it doesn't match the filter
        }

        if (!wordStats.has(wordPairKey)) {
          wordStats.set(wordPairKey, {
            frenchWord: frenchWord,
            slovakWord: slovakWord,
            wordSets: new Set([wordSetName]), // Track word sets for this word pair
            totalQuestions: 0,
            totalErrors: 0,
            totalAlmosts: 0,
            // Multiple choice stats
            frenchToSlovakMultipleChoiceQuestions: 0,
            frenchToSlovakMultipleChoiceErrors: 0,
            frenchToSlovakMultipleChoiceAlmosts: 0,
            slovakToFrenchMultipleChoiceQuestions: 0,
            slovakToFrenchMultipleChoiceErrors: 0,
            slovakToFrenchMultipleChoiceAlmosts: 0,
            // Typing stats
            frenchToSlovakTypingQuestions: 0,
            frenchToSlovakTypingErrors: 0,
            frenchToSlovakTypingAlmosts: 0,
            slovakToFrenchTypingQuestions: 0,
            slovakToFrenchTypingErrors: 0,
            slovakToFrenchTypingAlmosts: 0,
            // Reorder letters stats
            reorderLettersQuestions: 0,
            reorderLettersErrors: 0,
            reorderLettersAlmosts: 0,
            // Matching stats
            matchingQuestions: 0,
            matchingErrors: 0,
            matchingAlmosts: 0
          });
        } else {
          // Add word set to existing word pair
          wordStats.get(wordPairKey).wordSets.add(wordSetName);
        }

        const stats = wordStats.get(wordPairKey);

        // Aggregate stats based on quiz type
        if (quizType === 'multiple_choice') {
          // Aggregate French to Slovak multiple choice stats
          const frenchToSlovakTotal = (wordData.french_to_slovak_successes || 0) + (wordData.french_to_slovak_failures || 0);
          stats.frenchToSlovakMultipleChoiceQuestions += frenchToSlovakTotal;
          stats.frenchToSlovakMultipleChoiceErrors    += (wordData.french_to_slovak_failures || 0);
          stats.frenchToSlovakMultipleChoiceAlmosts   += (wordData.french_to_slovak_almosts  || 0);

          // Aggregate Slovak to French multiple choice stats
          const slovakToFrenchTotal = (wordData.slovak_to_french_successes || 0) + (wordData.slovak_to_french_failures || 0);
          stats.slovakToFrenchMultipleChoiceQuestions += slovakToFrenchTotal;
          stats.slovakToFrenchMultipleChoiceErrors    += (wordData.slovak_to_french_failures || 0);
          stats.slovakToFrenchMultipleChoiceAlmosts   += (wordData.slovak_to_french_almosts  || 0);

          // Update totals
          stats.totalQuestions += frenchToSlovakTotal + slovakToFrenchTotal;
          stats.totalErrors    += (wordData.french_to_slovak_failures || 0) + (wordData.slovak_to_french_failures || 0);
          stats.totalAlmosts   += (wordData.french_to_slovak_almosts  || 0) + (wordData.slovak_to_french_almosts  || 0);

        } else if (quizType === 'typing') {
          // Aggregate typing stats for both directions
          const frenchToSlovakTotal = (wordData.french_to_slovak_successes || 0) + (wordData.french_to_slovak_failures || 0);
          stats.frenchToSlovakTypingQuestions += frenchToSlovakTotal;
          stats.frenchToSlovakTypingErrors    += (wordData.french_to_slovak_failures || 0);
          stats.frenchToSlovakTypingAlmosts   += (wordData.french_to_slovak_almosts  || 0);

          const slovakToFrenchTotal = (wordData.slovak_to_french_successes || 0) + (wordData.slovak_to_french_failures || 0);
          stats.slovakToFrenchTypingQuestions += slovakToFrenchTotal;
          stats.slovakToFrenchTypingErrors    += (wordData.slovak_to_french_failures || 0);
          stats.slovakToFrenchTypingAlmosts   += (wordData.slovak_to_french_almosts  || 0);

          // Update totals
          stats.totalQuestions += frenchToSlovakTotal + slovakToFrenchTotal;
          stats.totalErrors    += (wordData.french_to_slovak_failures || 0) + (wordData.slovak_to_french_failures || 0);
          stats.totalAlmosts   += (wordData.french_to_slovak_almosts  || 0) + (wordData.slovak_to_french_almosts  || 0);

        } else if (quizType === 'reorder_letters') {
          // Aggregate Reorder Letters stats (French to Slovak only)
          const reorderTotal = (wordData.french_to_slovak_successes || 0) + (wordData.french_to_slovak_failures || 0);
          stats.reorderLettersQuestions += reorderTotal;
          stats.reorderLettersErrors    += (wordData.french_to_slovak_failures || 0);
          stats.reorderLettersAlmosts   += (wordData.french_to_slovak_almosts  || 0);

          // Update totals
          stats.totalQuestions += reorderTotal;
          stats.totalErrors    += (wordData.french_to_slovak_failures || 0);
          stats.totalAlmosts   += (wordData.french_to_slovak_almosts  || 0);

        } else if (quizType === 'matching') {
          // Aggregate Matching stats
          const matchingTotal = (wordData.matching_successes || 0) + (wordData.matching_failures || 0);
          stats.matchingQuestions += matchingTotal;
          stats.matchingErrors    += (wordData.matching_failures || 0);
          stats.matchingAlmosts   += (wordData.matching_almosts  || 0);

          // Update totals
          stats.totalQuestions += matchingTotal;
          stats.totalErrors    += (wordData.matching_failures || 0);
          stats.totalAlmosts   += (wordData.matching_almosts  || 0);
        }
      });
    }
  });

  // Compute recent mastery typing success rate (last 4 attempts) per word
  orderedResults.forEach(result => {
    if (!result || !Array.isArray(result.words)) return;
    const isMasteryTyping = (result.selectionMode === 'mastered') && ((result.quizType || 'typing') === 'typing');
    if (!isMasteryTyping) return;
    result.words.forEach(wordData => {
      // Extract wordPair
      let wp;
      if (Array.isArray(wordData.wordPair)) wp = wordData.wordPair;
      else if (wordData.wordPair && typeof wordData.wordPair === 'object') wp = [wordData.wordPair[0] || wordData.wordPair['0'], wordData.wordPair[1] || wordData.wordPair['1']];
      if (!wp || wp.length < 2 || !wp[0] || !wp[1]) return;
      const key = `${wp[0]}|${wp[1]}`;

      if (!masteryAttemptScoresByWord.has(key)) masteryAttemptScoresByWord.set(key, []);
      if (!masteryAttemptsByDirection.has(key)) masteryAttemptsByDirection.set(key, { frenchToSlovak: [], slovakToFrench: [] });

      const arr = masteryAttemptScoresByWord.get(key);
      const dirArr = masteryAttemptsByDirection.get(key);

      const s1 = wordData.french_to_slovak_successes || 0;
      const f1 = wordData.french_to_slovak_failures  || 0;
      const a1 = wordData.french_to_slovak_almosts   || 0;
      const s2 = wordData.slovak_to_french_successes || 0;
      const f2 = wordData.slovak_to_french_failures  || 0;
      const a2 = wordData.slovak_to_french_almosts   || 0;

      // Push to overall array (legacy)
      for (let i = 0; i < s1 + s2; i++) arr.push(1);
      for (let i = 0; i < a1 + a2; i++) arr.push(0.5);
      for (let i = 0; i < f1 + f2; i++) arr.push(0);

      // Push to direction-specific arrays
      for (let i = 0; i < s1; i++) dirArr.frenchToSlovak.push(1);
      for (let i = 0; i < a1; i++) dirArr.frenchToSlovak.push(0.5);
      for (let i = 0; i < f1; i++) dirArr.frenchToSlovak.push(0);
      for (let i = 0; i < s2; i++) dirArr.slovakToFrench.push(1);
      for (let i = 0; i < a2; i++) dirArr.slovakToFrench.push(0.5);
      for (let i = 0; i < f2; i++) dirArr.slovakToFrench.push(0);
    });
  });

  // Attach recent mastery rate to stats with direction separation
  wordStats.forEach((stats, key) => {
    const scores = masteryAttemptScoresByWord.get(key) || [];
    const dirScores = masteryAttemptsByDirection.get(key) || { frenchToSlovak: [], slovakToFrench: [] };

    // Calculate overall recent rate (legacy)
    const recent = scores.slice(-4);
    const total = recent.length;
    const scoreSum = recent.reduce((s, v) => s + v, 0);
    const rate = total > 0 ? ((scoreSum / total) * 100) : null;
    stats.masteryRecentTotal = total;
    stats.masteryRecentRate = rate !== null ? rate.toFixed(1) : '-';

    // Calculate direction-specific mastery rates (latest 2 attempts per direction)
    const frenchToSlovakRecent = dirScores.frenchToSlovak.slice(-2);
    const slovakToFrenchRecent = dirScores.slovakToFrench.slice(-2);

    const frenchToSlovakRate = frenchToSlovakRecent.length >= 2
      ? (frenchToSlovakRecent.reduce((sum, score) => sum + score, 0) / frenchToSlovakRecent.length * 100)
      : null;
    const slovakToFrenchRate = slovakToFrenchRecent.length >= 2
      ? (slovakToFrenchRecent.reduce((sum, score) => sum + score, 0) / slovakToFrenchRecent.length * 100)
      : null;

    stats.masterySlovakToFrenchRate = slovakToFrenchRate !== null ? slovakToFrenchRate.toFixed(1) : '-';
    stats.masteryFrenchToSlovakRate = frenchToSlovakRate !== null ? frenchToSlovakRate.toFixed(1) : '-';

    // Determine mastery status based on the new criteria (75% in both directions + overall mastering)
    const meetsFrenchToSlovak = frenchToSlovakRate !== null && frenchToSlovakRate >= 75;
    const meetsSlovakToFrench = slovakToFrenchRate !== null && slovakToFrenchRate >= 75;
    const overallSuccessRate = stats.totalQuestions > 0 ? ((stats.totalQuestions - stats.totalErrors) / stats.totalQuestions) * 100 : 0;
    const qualifiesOverall = stats.totalQuestions >= 5 && overallSuccessRate >= 90;

    if (meetsFrenchToSlovak && meetsSlovakToFrench && qualifiesOverall) {
      stats.masteryStatus = 'mastered';
    } else if (qualifiesOverall) {
      stats.masteryStatus = 'mastering';
    } else if (stats.totalQuestions >= 1 && overallSuccessRate < 70) {
      stats.masteryStatus = 'struggling';
    } else {
      stats.masteryStatus = 'learning';
    }
  });

  // Convert wordSets from Set to Array for each word pair
  const result = Array.from(wordStats.values()).map(stats => ({
    ...stats,
    wordSets: Array.from(stats.wordSets).sort() // Convert Set to sorted Array
  }));

  // Compute recent rolling success rate (same criteria window used for mastering)
  try {
    if (window.SlovakData && typeof window.SlovakData.buildPerWordAttempts === 'function') {
      const perWord = window.SlovakData.buildPerWordAttempts(allResults);
      const thresholds = (window.SlovakData && window.SlovakData.defaultThresholds) ? window.SlovakData.defaultThresholds : { windowSize: 20 };
      const nowTs = Date.now();
      result.forEach(stats => {
        const key = `${stats.frenchWord}|${stats.slovakWord}`;
        const node = perWord.get(key);
        if (node && typeof window.SlovakData.computeWindowStats === 'function') {
          const { total, successRate } = window.SlovakData.computeWindowStats(node.attempts, nowTs, thresholds.windowSize);
          stats.recentWindowTotal = total;
          stats.recentWindowRate = total > 0 ? successRate.toFixed(1) : '-';
        } else {
          stats.recentWindowTotal = 0;
          stats.recentWindowRate = '-';
        }
      });
    }
  } catch (e) {
    console.warn('Failed computing recent rolling rates:', e);
  }

  return {
    wordPairStats: result,
    allWordSets: Array.from(allWordSets).sort() // Return all unique word sets
  };
}

/**
 * Create and display the results table
 */
function displayResultsTable(wordPairStats, allWordSets, selectedWordSet = 'all') {
  // Sort by recent rolling success rate (ascending). If equal, fallback to global success rate.
  wordPairStats.sort((a, b) => {
    const recentA = a.recentWindowRate === '-' ? -1 : parseFloat(a.recentWindowRate);
    const recentB = b.recentWindowRate === '-' ? -1 : parseFloat(b.recentWindowRate);
    if (recentA !== recentB) return recentA - recentB;

    const globalA = a.totalQuestions > 0 ? ((a.totalQuestions - a.totalErrors) / a.totalQuestions) * 100 : 100;
    const globalB = b.totalQuestions > 0 ? ((b.totalQuestions - b.totalErrors) / b.totalQuestions) * 100 : 100;
    if (globalA !== globalB) return globalA - globalB;

    return a.totalQuestions - b.totalQuestions;
  });

  // Get or create container
  let container = document.querySelector('.results-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'results-container';
    document.body.appendChild(container);
  }

  // Clear previous content
  container.innerHTML = '';

  // Create title and filter
  const headerSection = document.createElement('div');
  headerSection.className = 'results-header';

  const title = document.createElement('h2');
  title.textContent = 'Statistiques des Mots';
  headerSection.appendChild(title);

  // Create filter dropdown
  const filterSection = document.createElement('div');
  filterSection.className = 'filter-section';

  const filterLabel = document.createElement('label');
  filterLabel.textContent = 'Filtrer par ensemble de mots: ';
  filterLabel.htmlFor = 'wordset-filter';

  const filterSelect = document.createElement('select');
  filterSelect.id = 'wordset-filter';
  filterSelect.className = 'filter-select';

  // Add "All" option
  const allOption = document.createElement('option');
  allOption.value = 'all';
  allOption.textContent = 'Tous les ensembles';
  allOption.selected = selectedWordSet === 'all';
  filterSelect.appendChild(allOption);

  // Add word set options
  allWordSets.forEach(wordSet => {
    const option = document.createElement('option');
    option.value = wordSet;
    option.textContent = wordSet;
    option.selected = selectedWordSet === wordSet;
    filterSelect.appendChild(option);
  });

  // Add change listener
  filterSelect.addEventListener('change', () => {
    const selectedValue = filterSelect.value;
    loadAndDisplayResults(selectedValue);
  });

  filterSection.appendChild(filterLabel);
  filterSection.appendChild(filterSelect);
  headerSection.appendChild(filterSection);

  container.appendChild(headerSection);

  // Create table wrapper for horizontal scrolling
  const tableWrapper = document.createElement('div');
  tableWrapper.className = 'results-table-wrapper';

  // Create table
  const table = document.createElement('table');
  table.className = 'results-table';

  // Create header
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  headerRow.innerHTML = `
    <th>Français</th>
    <th>Slovaque</th>
    <th>Ensembles</th>
    <th>Total Questions</th>
    <th>Statut Maîtrise</th>
    <th>Réussite Récente</th>
    <th>Maîtrise SK→FR</th>
    <th>Maîtrise FR→SK</th>
    <th>Réussite Globale</th>
    <th>Correspondances</th>
    <th>SK→FR Choix Multiple</th>
    <th>FR→SK Choix Multiple</th>
    <th>FR→SK Réorganiser</th>
    <th>SK→FR Saisie</th>
    <th>FR→SK Saisie</th>
  `;

  // Table header styling is handled by CSS classes

  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Create body
  const tbody = document.createElement('tbody');

        wordPairStats.forEach((wordStats, index) => {
    const row = document.createElement('tr');

    // Calculate success rates for each exercise type
    const globalSuccessRate = wordStats.totalQuestions > 0
      ? (((wordStats.totalQuestions - wordStats.totalErrors) / wordStats.totalQuestions) * 100).toFixed(1)
      : '100.0';

    const matchingSuccessRate = wordStats.matchingQuestions > 0
      ? (((wordStats.matchingQuestions - wordStats.matchingErrors) / wordStats.matchingQuestions) * 100).toFixed(1)
      : '-';

    const slovakToFrenchMultipleChoiceSuccessRate = wordStats.slovakToFrenchMultipleChoiceQuestions > 0
      ? (((wordStats.slovakToFrenchMultipleChoiceQuestions - wordStats.slovakToFrenchMultipleChoiceErrors) / wordStats.slovakToFrenchMultipleChoiceQuestions) * 100).toFixed(1)
      : '-';

    const frenchToSlovakMultipleChoiceSuccessRate = wordStats.frenchToSlovakMultipleChoiceQuestions > 0
      ? (((wordStats.frenchToSlovakMultipleChoiceQuestions - wordStats.frenchToSlovakMultipleChoiceErrors) / wordStats.frenchToSlovakMultipleChoiceQuestions) * 100).toFixed(1)
      : '-';

    const reorderLettersSuccessRate = wordStats.reorderLettersQuestions > 0
      ? (((wordStats.reorderLettersQuestions - wordStats.reorderLettersErrors) / wordStats.reorderLettersQuestions) * 100).toFixed(1)
      : '-';

    const slovakToFrenchTypingSuccessRate = wordStats.slovakToFrenchTypingQuestions > 0
      ? (((wordStats.slovakToFrenchTypingQuestions - wordStats.slovakToFrenchTypingErrors) / wordStats.slovakToFrenchTypingQuestions) * 100).toFixed(1)
      : '-';

    const frenchToSlovakTypingSuccessRate = wordStats.frenchToSlovakTypingQuestions > 0
      ? (((wordStats.frenchToSlovakTypingQuestions - wordStats.frenchToSlovakTypingErrors) / wordStats.frenchToSlovakTypingQuestions) * 100).toFixed(1)
      : '-';

    // Format word sets for display
    const wordSetsDisplay = wordStats.wordSets.length > 1
      ? wordStats.wordSets.join(', ')
      : wordStats.wordSets[0] || 'Unknown';

    // Format mastery status with color-coded badge
    const masteryStatusDisplay = (() => {
      switch(wordStats.masteryStatus) {
        case 'mastered': return '<span class="status-mastered">Maîtrisé</span>';
        case 'mastering': return '<span class="status-mastering">En Maîtrise</span>';
        case 'learning': return '<span class="status-learning">Apprentissage</span>';
        case 'struggling': return '<span class="status-struggling">Difficile</span>';
        default: return '<span class="status-unknown">-</span>';
      }
    })();

    row.innerHTML = `
      <td>${wordStats.frenchWord}</td>
      <td><strong>${wordStats.slovakWord}</strong></td>
      <td class="word-sets-cell">${wordSetsDisplay}</td>
      <td>${wordStats.totalQuestions}</td>
      <td>${masteryStatusDisplay}</td>
      <td>${wordStats.recentWindowRate}${wordStats.recentWindowRate !== '-' ? '%' : ''}${wordStats.recentWindowTotal ? ` (${wordStats.recentWindowTotal})` : ''}</td>
      <td>${wordStats.masterySlovakToFrenchRate}${wordStats.masterySlovakToFrenchRate !== '-' ? '%' : ''}</td>
      <td>${wordStats.masteryFrenchToSlovakRate}${wordStats.masteryFrenchToSlovakRate !== '-' ? '%' : ''}</td>
      <td>${globalSuccessRate}%</td>
      <td>${matchingSuccessRate}${matchingSuccessRate !== '-' ? '%' : ''}</td>
      <td>${slovakToFrenchMultipleChoiceSuccessRate}${slovakToFrenchMultipleChoiceSuccessRate !== '-' ? '%' : ''}</td>
      <td>${frenchToSlovakMultipleChoiceSuccessRate}${frenchToSlovakMultipleChoiceSuccessRate !== '-' ? '%' : ''}</td>
      <td>${reorderLettersSuccessRate}${reorderLettersSuccessRate !== '-' ? '%' : ''}</td>
      <td>${slovakToFrenchTypingSuccessRate}${slovakToFrenchTypingSuccessRate !== '-' ? '%' : ''}</td>
      <td>${frenchToSlovakTypingSuccessRate}${frenchToSlovakTypingSuccessRate !== '-' ? '%' : ''}</td>
    `;

    // Apply styling to specific columns
    Array.from(row.children).forEach((td, cellIndex) => {
      // Add word coloring for first two columns
      if (cellIndex === 0) {
        td.innerHTML = `<span class="word-french">${td.textContent}</span>`;
      } else if (cellIndex === 1) {
        td.innerHTML = `<span class="word-slovak">${td.textContent}</span>`;
      }

      // Highlight success rates (columns 5, 6, 7, 8 and 9-14 are success rate columns)
      if ((cellIndex >= 5 && cellIndex <= 8) || (cellIndex >= 9 && cellIndex <= 14)) {
        const rateText = td.textContent.replace('%', '');
        if (rateText !== '-') {
          const rate = parseFloat(rateText);
          if (rate >= 90) {
            td.classList.add('success-rate-very-high');
          } else if (rate >= 80) {
            td.classList.add('success-rate-high');
          } else if (rate >= 70) {
            td.classList.add('success-rate-medium');
          } else if (rate >= 50) {
            td.classList.add('success-rate-low');
          } else {
            td.classList.add('success-rate-very-low');
          }
        }
      }
    });

    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  tableWrapper.appendChild(table);
  container.appendChild(tableWrapper);

    // Add summary statistics
  const totalWords         = wordPairStats.length;
  const totalQuestions     = wordPairStats.reduce((sum, stats) => sum + stats.totalQuestions, 0);
  const totalErrors        = wordPairStats.reduce((sum, stats) => sum + stats.totalErrors, 0);
  const overallSuccessRate = totalQuestions > 0 ? (((totalQuestions - totalErrors) / totalQuestions) * 100).toFixed(1) : '100.0';

  const summary = document.createElement('div');
  summary.className = 'results-summary';

  summary.innerHTML = `
    <h3>Résumé Global</h3>
    <p><strong>Nombre de mots uniques:</strong> ${totalWords}</p>
    <p><strong>Total questions posées:</strong> ${totalQuestions}</p>
    <p><strong>Total erreurs:</strong> ${totalErrors}</p>
    <p><strong>Taux de réussite global:</strong> ${overallSuccessRate}%</p>
  `;

  container.appendChild(summary);

  // Add CSS styles for mastery status badges if not already added
  if (!document.querySelector('#mastery-status-styles')) {
    const style = document.createElement('style');
    style.id = 'mastery-status-styles';
    style.textContent = `
      .status-mastered {
        background-color: hsla(130, 60%, 40%, 0.80);
        color: white;
        padding: 2px 8px;
        border-radius: 12px;
        font-size: 12px;
        font-weight: bold;
      }
      .status-mastering {
        background-color: hsla(210, 80%, 50%, 0.80);
        color: white;
        padding: 2px 8px;
        border-radius: 12px;
        font-size: 12px;
        font-weight: bold;
      }
      .status-learning {
        background-color: hsla(45, 80%, 50%, 0.80);
        color: white;
        padding: 2px 8px;
        border-radius: 12px;
        font-size: 12px;
        font-weight: bold;
      }
      .status-struggling {
        background-color: hsla(0, 60%, 50%, 0.80);
        color: white;
        padding: 2px 8px;
        border-radius: 12px;
        font-size: 12px;
        font-weight: bold;
      }
      .status-unknown {
        background-color: #ccc;
        color: #666;
        padding: 2px 8px;
        border-radius: 12px;
        font-size: 12px;
      }
    `;
    document.head.appendChild(style);
  }

  console.log(`Displayed results for ${totalWords} word pairs`);
}

/**
 * Extract and prepare daily progression data for charts
 */
function prepareProgressionData(allResults, filterWordSet = 'all') {
  if (!window.SlovakData) {
    console.warn('SlovakData not loaded; falling back to empty progression');
    return { dailyStats: [], labels: [] };
  }

  const resultsArr = Object.values(allResults || {}).map(r => ({
    ...r,
    _ts: window.SlovakData.normalizeTimestamp(r.completionTimestamp || r.timestamp || r.date)
  })).sort((a, b) => a._ts - b._ts);

  if (resultsArr.length === 0) return { dailyStats: [], labels: [] };

  const firstDay = window.SlovakData.localDateKeyFromTs(resultsArr[0]._ts);
  const lastDay  = window.SlovakData.localDateKeyFromTs(resultsArr[resultsArr.length - 1]._ts);

  const dateRange   = [];
  const currentDate = new Date(firstDay);
  const endDate     = new Date(lastDay);
  while (currentDate <= endDate) {
    dateRange.push(currentDate.toISOString().split('T')[0]);
    currentDate.setDate(currentDate.getDate() + 1);
  }

  // Build per-word attempts across all results once
  const perWord    = window.SlovakData.buildPerWordAttempts(allResults);
  const thresholds = { masteredStreak: 4, windowSize: 20, minMastering: 5, masteringRate: 90, minStruggling: 1, strugglingRate: 70 };

  const dailyStats = [];
  dateRange.forEach(day => {
    const dayTs  = window.SlovakData.endOfLocalDayTs(day);
    const counts = window.SlovakData.computeDailyCounts(perWord, dayTs, thresholds, filterWordSet);
    const total  = counts.mastered + counts.mastering + counts.learning + counts.struggling;
    dailyStats.push({ date: day, ...counts, total });
  });

  return {
    dailyStats,
    labels: dateRange.map(date => {
      const d = new Date(date);
      return `${d.getDate()}/${d.getMonth() + 1}`;
    }),
    dateRange
  };
}

/**
 * Create and display the progression chart
 */
function displayProgressionChart(progressionData, filterWordSet = 'all') {
  // Create chart container
  const chartContainer = document.createElement('div');
  chartContainer.className = 'chart-container';

  const chartTitle = document.createElement('h3');
  const titleText = filterWordSet === 'all'
    ? 'Progression de l\'Apprentissage dans le Temps'
    : `Progression de l\'Apprentissage dans le Temps - ${filterWordSet}`;
  chartTitle.textContent = titleText;
  chartContainer.appendChild(chartTitle);

  // Create canvas for chart
  const canvas = document.createElement('canvas');
  canvas.id = 'progressionChart';
  canvas.className = 'chart-canvas';
  chartContainer.appendChild(canvas);

  // Insert chart before the table
  const resultsContainer = document.querySelector('.results-container');
  if (resultsContainer) {
    const tableWrapper = resultsContainer.querySelector('div[style*="overflowX"]');
    if (tableWrapper) {
      resultsContainer.insertBefore(chartContainer, tableWrapper);
    } else {
      resultsContainer.appendChild(chartContainer);
    }
  } else {
    document.body.appendChild(chartContainer);
  }

  // Prepare chart data for stacked area chart
  const chartData = {
    labels: progressionData.labels,
    datasets: [
      {
        label: 'Mots Maîtrisés',
        data: progressionData.dailyStats.map(day => day.mastered),
        backgroundColor: 'hsla(130, 60%, 40%, 0.80)',
        borderColor: 'hsl(130, 60%, 40%)',
        borderWidth: 1.5,
        fill: true,
        stepped: true // For step effect
      },
      {
        label: 'Mots en Maîtrise',
        data: progressionData.dailyStats.map(day => day.mastering || 0),
        backgroundColor: 'hsla(210, 80%, 50%, 0.80)',
        borderColor: 'hsl(210, 80%, 50%)',
        borderWidth: 1.5,
        fill: true,
        stepped: true
      },
      {
        label: 'Mots en Apprentissage',
        data: progressionData.dailyStats.map(day => day.learning || 0),
        backgroundColor: 'hsla(45, 80%, 50%, 0.80)',
        borderColor: 'hsl(45, 80%, 50%)',
        borderWidth: 1.5,
        fill: true,
        stepped: true
      },
      {
        label: 'Mots Difficiles',
        data: progressionData.dailyStats.map(day => day.struggling),
        backgroundColor: 'hsla(0, 60%, 50%, 0.80)',
        borderColor: 'hsl(0, 60%, 50%)',
        borderWidth: 1.5,
        fill: true,
        stepped: true // For step effect
      }
    ]
  };

  // Chart configuration for stacked area chart (Chart.js v3 compatible)
  const chartConfig = {
    type: 'line',
    data: chartData,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      scales: {
        x: {
          display: true,
          title: {
            display: true,
            text: 'Date'
          }
        },
        y: {
          display: true,
          title: {
            display: true,
            text: 'Nombre de Mots'
          },
          stacked: true,
          beginAtZero: true
        }
      },
      elements: {
        point: {
          radius: 3,
          hoverRadius: 5
        }
      },
      plugins: {
        legend: {
          position: 'top',
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          callbacks: {
            footer: function(tooltipItems) {
              const dataIndex = tooltipItems[0].dataIndex;
              const dayData = progressionData.dailyStats[dataIndex];
              return `Total: ${dayData.total} mots`;
            }
          }
        }
      }
    }
  };

  // Load Chart.js dynamically and create chart (or use if already loaded)
  if (typeof Chart === 'undefined') {
    // Check if Chart.js is already being loaded by another chart
    const existingScript = document.querySelector('script[src*="chart.min.js"]');
    if (existingScript) {
      // Wait for existing script to load
      console.log('Waiting for Chart.js to load for progression chart...');
      existingScript.addEventListener('load', () => {
        if (typeof Chart !== 'undefined') {
          new Chart(canvas, chartConfig);
        }
      });
    } else {
      // Load Chart.js for the first time
      console.log('Loading Chart.js library for progression chart...');
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/3.9.1/chart.min.js';
      script.onload = () => {
        console.log('Chart.js loaded successfully for progression chart');
        if (typeof Chart !== 'undefined') {
          new Chart(canvas, chartConfig);
        } else {
          console.error('Chart.js failed to load properly');
        }
      };
      script.onerror = () => {
        console.error('Failed to load Chart.js from CDN');
      };
      document.head.appendChild(script);
    }
  } else {
    console.log('Chart.js already available for progression chart');
    new Chart(canvas, chartConfig);
  }

  console.log('Progression chart displayed with', progressionData.dailyStats.length, 'data points');
}

/**
 * Extract and prepare daily activity data for bar chart
 */
function prepareDailyActivityData(allResults, filterWordSet = 'all') {
  // Collect all quiz results with timestamps
  const timelineData = [];

  Object.values(allResults).forEach(result => {
    if (result && result.words && Array.isArray(result.words)) {
      const rawTs = result.completionTimestamp ?? result.timestamp ?? result.date;
      if (!rawTs) {
        return;
      }

      let date;
      if (typeof rawTs === 'number') {
        date = new Date(rawTs);
      } else {
        const tsString = String(rawTs);
        const normalized = (tsString.includes(' ') && !tsString.includes('T')) ? tsString.replace(' ', 'T') : tsString;
        date = new Date(normalized);
      }

      // Check for invalid date
      if (isNaN(date.getTime())) {
        console.warn('Invalid timestamp found in activity data:', rawTs);
        return; // Skip this result
      }

      const dayKey = date.toISOString().split('T')[0]; // YYYY-MM-DD format

      timelineData.push({
        date: dayKey,
        timestamp: date.getTime(),
        quizName: result.quizName || 'Unknown Quiz',
        selectionMode: result.selectionMode || 'all',
        words: result.words
      });
    }
  });

  // Sort by timestamp
  timelineData.sort((a, b) => a.timestamp - b.timestamp);

  if (timelineData.length === 0) {
    return { dailyActivity: [], labels: [] };
  }

  // Create date range from first to last day
  const firstDay = timelineData[0].date;
  const lastDay  = timelineData[timelineData.length - 1].date;

  const dateRange   = [];
  const currentDate = new Date(firstDay);
  const endDate     = new Date(lastDay);

  while (currentDate <= endDate) {
    dateRange.push(currentDate.toISOString().split('T')[0]);
    currentDate.setDate(currentDate.getDate() + 1);
  }

  // Calculate daily activity stats
  const dailyActivity = [];

  dateRange.forEach(day => {
    // Get quiz results for this specific day
    const dayResults = timelineData.filter(entry => entry.date === day);

    let correctAnswers   = 0;
    let incorrectAnswers = 0;
    let almostAnswers    = 0;

    // Process all quiz results for this day
    dayResults.forEach(entry => {
      entry.words.forEach(wordData => {
        const rawSetName  = wordData.wordSetName || entry.quizName || 'Unknown Set';
        const wordSetName = (window.SlovakData && typeof window.SlovakData.normalizeWordSetName === 'function')
          ? window.SlovakData.normalizeWordSetName(rawSetName)
          : rawSetName;

        // Apply filter if specified
        if (filterWordSet && filterWordSet !== 'all' && wordSetName !== filterWordSet) {
          return; // Skip this word if it doesn't match the filter
        }

        // Count all attempts across all quiz types
        const frenchToSlovakCorrect   = wordData.french_to_slovak_successes || 0;
        const frenchToSlovakIncorrect = wordData.french_to_slovak_failures  || 0;
        const frenchToSlovakAlmost    = wordData.french_to_slovak_almosts   || 0;
        const slovakToFrenchCorrect   = wordData.slovak_to_french_successes || 0;
        const slovakToFrenchIncorrect = wordData.slovak_to_french_failures  || 0;
        const slovakToFrenchAlmost    = wordData.slovak_to_french_almosts   || 0;
        const matchingCorrect         = wordData.matching_successes         || 0;
        const matchingIncorrect       = wordData.matching_failures          || 0;
        const matchingAlmost          = wordData.matching_almosts           || 0;

        correctAnswers   += frenchToSlovakCorrect   + slovakToFrenchCorrect   + matchingCorrect;
        incorrectAnswers += frenchToSlovakIncorrect + slovakToFrenchIncorrect + matchingIncorrect;
        almostAnswers    += frenchToSlovakAlmost    + slovakToFrenchAlmost    + matchingAlmost;
      });
    });

    dailyActivity.push({
      date: day,
      correct: correctAnswers,
      incorrect: incorrectAnswers,
      almost: almostAnswers,
      total: correctAnswers + incorrectAnswers + almostAnswers
    });
  });

  return {
    dailyActivity,
    labels: dateRange.map(date => {
      const d = new Date(date);
      return `${d.getDate()}/${d.getMonth() + 1}`;
    }),
    dateRange: dateRange
  };
}

/**
 * Create and display the daily activity chart
 */
function displayDailyActivityChart(activityData, filterWordSet = 'all') {
  // Create chart container
  const chartContainer = document.createElement('div');
  chartContainer.className = 'chart-container activity-chart';

  const chartTitle = document.createElement('h3');
  const titleText = filterWordSet === 'all'
    ? 'Activité Quotidienne des Quiz'
    : `Activité Quotidienne des Quiz - ${filterWordSet}`;
  chartTitle.textContent = titleText;
  chartContainer.appendChild(chartTitle);

  // Create canvas for chart
  const canvas = document.createElement('canvas');
  canvas.id = 'activityChart';
  canvas.className = 'chart-canvas';
  chartContainer.appendChild(canvas);

  // Insert chart after the progression chart
  const resultsContainer = document.querySelector('.results-container');
  if (resultsContainer) {
    const existingChart = resultsContainer.querySelector('.chart-container:not(.activity-chart)');
    if (existingChart && existingChart.nextSibling) {
      resultsContainer.insertBefore(chartContainer, existingChart.nextSibling);
    } else {
      const tableWrapper = resultsContainer.querySelector('div[style*="overflowX"]');
      if (tableWrapper) {
        resultsContainer.insertBefore(chartContainer, tableWrapper);
      } else {
        resultsContainer.appendChild(chartContainer);
      }
    }
  } else {
    document.body.appendChild(chartContainer);
  }

  // Prepare chart data for stacked bar chart
  const chartData = {
    labels: activityData.labels,
    datasets: [
      {
        label: 'Réponses Correctes',
        data: activityData.dailyActivity.map(day => day.correct),
        backgroundColor: 'hsla(130, 60%, 40%, 0.80)',
        borderColor: 'hsl(130, 60%, 40%)',
        borderWidth: 1
      },
      {
        label: 'Presque',
        data: activityData.dailyActivity.map(day => day.almost || 0),
        backgroundColor: 'hsla(45, 80%, 50%, 0.80)',
        borderColor: 'hsl(45, 80%, 50%)',
        borderWidth: 1
      },
      {
        label: 'Réponses Incorrectes',
        data: activityData.dailyActivity.map(day => day.incorrect),
        backgroundColor: 'hsla(0, 60%, 50%, 0.80)',
        borderColor: 'hsl(0, 60%, 50%)',
        borderWidth: 1
      }
    ]
  };

  // Chart configuration for stacked bar chart (Chart.js v3 compatible)
  const chartConfig = {
    type: 'bar',
    data: chartData,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      scales: {
        x: {
          display: true,
          title: {
            display: true,
            text: 'Date'
          },
          stacked: true
        },
        y: {
          display: true,
          title: {
            display: true,
            text: 'Nombre de Réponses'
          },
          stacked: true,
          beginAtZero: true
        }
      },
      plugins: {
        legend: {
          position: 'top',
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          callbacks: {
            footer: function(tooltipItems) {
              const dataIndex = tooltipItems[0].dataIndex;
              const dayData = activityData.dailyActivity[dataIndex];
              const successRate = dayData.total > 0 ? Math.round((dayData.correct / dayData.total) * 100) : 0;
              const almost = dayData.almost || 0;
              return `Total: ${dayData.total} réponses (${successRate}% de réussite, ${almost} presque)`;
            }
          }
        }
      }
    }
  };

  // Load Chart.js dynamically and create chart (or use if already loaded)
  if (typeof Chart === 'undefined') {
    // Check if Chart.js is already being loaded by another chart
    const existingScript = document.querySelector('script[src*="chart.min.js"]');
    if (existingScript) {
      // Wait for existing script to load
      console.log('Waiting for Chart.js to load for activity chart...');
      existingScript.addEventListener('load', () => {
        if (typeof Chart !== 'undefined') {
          new Chart(canvas, chartConfig);
        }
      });
    } else {
      // Load Chart.js for the first time
      console.log('Loading Chart.js library for activity chart...');
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/3.9.1/chart.min.js';
      script.onload = () => {
        console.log('Chart.js loaded successfully for activity chart');
        if (typeof Chart !== 'undefined') {
          new Chart(canvas, chartConfig);
        } else {
          console.error('Chart.js failed to load properly for activity chart');
        }
      };
      script.onerror = () => {
        console.error('Failed to load Chart.js from CDN for activity chart');
      };
      document.head.appendChild(script);
    }
  } else {
    console.log('Chart.js already available for activity chart');
    new Chart(canvas, chartConfig);
  }

  console.log('Activity chart displayed with', activityData.dailyActivity.length, 'data points');
}

/**
 * Test function to verify results.js is loaded correctly
 */
function testResultsFunction() {
  console.log('Results.js loaded successfully!');
  return true;
}

/**
 * Handle authentication state changes
 */
function handleAuthentication() {
  const { onAuthStateChanged } = auth; // Assumes auth is initialized

  onAuthStateChanged(auth, (user) => {
    currentUser = user;
    renderAuthStatusFooter();
    if (user) {
      console.log("User is signed in:", user.displayName);
      loadAndDisplayResults();
    } else {
      console.log("User is signed out.");
      renderLoginScreen();
    }
  });
}

/**
 * Render login screen
 */
function renderLoginScreen() {
  const container = document.querySelector('.results-container') || document.body;
  container.innerHTML = `
    <div class="login-container" style="text-align: center; padding: 50px;">
      <h2 style="color: #007bff; margin-bottom: 20px;">Authentification Requise</h2>
      <button id="google-login-button" class="btn btn-primary btn-lg">Se connecter avec Google</button>
    </div>
  `;
  document.getElementById('google-login-button').addEventListener('click', signInWithGoogle);
}

/**
 * Sign in with Google
 */
async function signInWithGoogle() {
  try {
    const { GoogleAuthProvider, signInWithPopup } = await import("https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js");
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
    // onAuthStateChanged will handle the UI update
  } catch (error) {
    console.error("Error during Google sign-in:", error);
    const container = document.querySelector('.results-container') || document.body;
    container.innerHTML = `<div class="error-message">La connexion a échoué: ${error.message}</div>`;
  }
}

/**
 * Render authentication status footer
 */
function renderAuthStatusFooter() {
  let footer = document.getElementById('auth-status-footer');
  if (!footer) {
    footer = document.createElement('div');
    footer.id = 'auth-status-footer';
    footer.style.cssText = 'position: fixed; bottom: 10px; right: 10px; font-size: 12px; color: #666; background-color: rgba(240, 240, 240, 0.8); padding: 5px 10px; border-radius: 5px; z-index: 1000;';
    document.body.appendChild(footer);
  }

  if (currentUser) {
    footer.innerHTML = `Connecté: <strong>${currentUser.displayName || currentUser.email}</strong> | <a href="#" id="logout-link" style="color: #007bff;">Se déconnecter</a>`;
    footer.querySelector('#logout-link').addEventListener('click', async (e) => {
      e.preventDefault();
      const { signOut } = await import("https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js");
      await signOut(auth);
    });
  } else {
    footer.innerHTML = `<a href="#" id="login-link" style="color: #007bff;">Se connecter</a>`;
    footer.querySelector('#login-link').addEventListener('click', (e) => {
      e.preventDefault();
      signInWithGoogle();
    });
  }
}

/**
 * Main function to load and display all results
 */
async function loadAndDisplayResults(filterWordSet = 'all') {
  try {
    console.log("Loading results from Firebase...");

    // Load shared helpers
    await ensureDataHelpersLoaded();

    // Show loading message
    const container = document.querySelector('.results-container') || document.body;
    container.innerHTML = '<div class="loading-message">Chargement des résultats...</div>';

    // Fetch all results
    const allResults = await fetchAllResults();

    // Aggregate word pair statistics with filtering
    const aggregationResult = aggregateWordPairStats(allResults, filterWordSet);
    const { wordPairStats, allWordSets } = aggregationResult;

    // Display the table with filter
    displayResultsTable(wordPairStats, allWordSets, filterWordSet);

    // Prepare and display progression chart (filtered)
    const progressionData = prepareProgressionData(allResults, filterWordSet);
    if (progressionData.dailyStats.length > 0) {
      displayProgressionChart(progressionData, filterWordSet);
    } else {
      console.log('No progression data available for chart');
    }

    // Prepare and display daily activity chart (filtered)
    const activityData = prepareDailyActivityData(allResults, filterWordSet);
    if (activityData.dailyActivity.length > 0) {
      displayDailyActivityChart(activityData, filterWordSet);
    } else {
      console.log('No activity data available for chart');
    }

  } catch (error) {
    console.error("Error loading and displaying results:", error);

    // Show error message
    const container = document.querySelector('.results-container') || document.body;
    container.innerHTML = `
      <div class="error-message">
        <h3>Erreur de Chargement</h3>
        <p>Impossible de charger les résultats depuis Firebase.</p>
        <p class="error-details">${error.message}</p>
      </div>
    `;
  }
}

/**
 * Initialize and authenticate the user on page load
 */
async function initializeAndAuthenticate() {
  if (auth) return; // Already initialized

  try {
    console.log("Initializing Firebase and Auth for results...");
    const { initializeApp }               = await import("https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js");
    const { getDatabase }                 = await import("https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js");
    const { getAuth, onAuthStateChanged } = await import("https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js");

    if (!firebaseApp) {
      firebaseApp = initializeApp(firebaseConfig);
      database    = getDatabase(firebaseApp);
      auth        = getAuth(firebaseApp);
      console.log("Firebase with Auth initialized successfully for results");
    }

    onAuthStateChanged(auth, (user) => {
      currentUser = user;
      renderAuthStatusFooter();
      if (user) {
        console.log("User is signed in for results:", user.displayName);
        loadAndDisplayResults();
      } else {
        console.log("User is signed out for results.");
        renderLoginScreen();
      }
    });
  } catch (error) {
    console.error("Failed to initialize Firebase for results page:", error);
    const container = document.querySelector('.results-container') || document.body;
    container.innerHTML = `<div class="error-message">Impossible d'initialiser Firebase.</div>`;
  }
}

// Start the process
initializeAndAuthenticate();
