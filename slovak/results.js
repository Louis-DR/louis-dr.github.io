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
let auth = null;
let currentUser = null;

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
    const { getAuth } = await import("https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js");

    // Initialize Firebase app and database
    firebaseApp = initializeApp(firebaseConfig);
    database    = getDatabase(firebaseApp);
    auth = getAuth(firebaseApp);

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
  const wordStats = new Map();
  const allWordSets = new Set(); // Track all unique word sets

  // Process each quiz result
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

        const frenchWord = wordPairArray[0];
        const slovakWord = wordPairArray[1];
        const wordSetName = wordData.wordSetName || result.quizName || 'Unknown Set';
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
            // Multiple choice stats
            frenchToSlovakMultipleChoiceQuestions: 0,
            frenchToSlovakMultipleChoiceErrors: 0,
            slovakToFrenchMultipleChoiceQuestions: 0,
            slovakToFrenchMultipleChoiceErrors: 0,
            // Typing stats
            frenchToSlovakTypingQuestions: 0,
            frenchToSlovakTypingErrors: 0,
            slovakToFrenchTypingQuestions: 0,
            slovakToFrenchTypingErrors: 0,
            // Reorder letters stats
            reorderLettersQuestions: 0,
            reorderLettersErrors: 0,
            // Matching stats
            matchingQuestions: 0,
            matchingErrors: 0
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
          stats.frenchToSlovakMultipleChoiceErrors += (wordData.french_to_slovak_failures || 0);

          // Aggregate Slovak to French multiple choice stats
          const slovakToFrenchTotal = (wordData.slovak_to_french_successes || 0) + (wordData.slovak_to_french_failures || 0);
          stats.slovakToFrenchMultipleChoiceQuestions += slovakToFrenchTotal;
          stats.slovakToFrenchMultipleChoiceErrors += (wordData.slovak_to_french_failures || 0);

          // Update totals
          stats.totalQuestions += frenchToSlovakTotal + slovakToFrenchTotal;
          stats.totalErrors += (wordData.french_to_slovak_failures || 0) + (wordData.slovak_to_french_failures || 0);

        } else if (quizType === 'typing') {
          // Aggregate typing stats for both directions
          const frenchToSlovakTotal = (wordData.french_to_slovak_successes || 0) + (wordData.french_to_slovak_failures || 0);
          stats.frenchToSlovakTypingQuestions += frenchToSlovakTotal;
          stats.frenchToSlovakTypingErrors += (wordData.french_to_slovak_failures || 0);

          const slovakToFrenchTotal = (wordData.slovak_to_french_successes || 0) + (wordData.slovak_to_french_failures || 0);
          stats.slovakToFrenchTypingQuestions += slovakToFrenchTotal;
          stats.slovakToFrenchTypingErrors += (wordData.slovak_to_french_failures || 0);

          // Update totals
          stats.totalQuestions += frenchToSlovakTotal + slovakToFrenchTotal;
          stats.totalErrors += (wordData.french_to_slovak_failures || 0) + (wordData.slovak_to_french_failures || 0);

        } else if (quizType === 'reorder_letters') {
          // Aggregate Reorder Letters stats (French to Slovak only)
          const reorderTotal = (wordData.french_to_slovak_successes || 0) + (wordData.french_to_slovak_failures || 0);
          stats.reorderLettersQuestions += reorderTotal;
          stats.reorderLettersErrors += (wordData.french_to_slovak_failures || 0);

          // Update totals
          stats.totalQuestions += reorderTotal;
          stats.totalErrors += (wordData.french_to_slovak_failures || 0);

        } else if (quizType === 'matching') {
          // Aggregate Matching stats
          const matchingTotal = (wordData.matching_successes || 0) + (wordData.matching_failures || 0);
          stats.matchingQuestions += matchingTotal;
          stats.matchingErrors += (wordData.matching_failures || 0);

          // Update totals
          stats.totalQuestions += matchingTotal;
          stats.totalErrors += (wordData.matching_failures || 0);
        }
      });
    }
  });

  // Convert wordSets from Set to Array for each word pair
  const result = Array.from(wordStats.values()).map(stats => ({
    ...stats,
    wordSets: Array.from(stats.wordSets).sort() // Convert Set to sorted Array
  }));

  return {
    wordPairStats: result,
    allWordSets: Array.from(allWordSets).sort() // Return all unique word sets
  };
}

/**
 * Create and display the results table
 */
function displayResultsTable(wordPairStats, allWordSets, selectedWordSet = 'all') {
  // Sort by success rate (lowest first) to show most problematic words at the top
  // If success rates are equal, sort by number of questions (highest first) to show better mastery
  wordPairStats.sort((a, b) => {
    const successRateA = a.totalQuestions > 0 ? ((a.totalQuestions - a.totalErrors) / a.totalQuestions) * 100 : 100;
    const successRateB = b.totalQuestions > 0 ? ((b.totalQuestions - b.totalErrors) / b.totalQuestions) * 100 : 100;

    // Primary sort: by success rate (ascending - lowest first)
    if (successRateA !== successRateB) {
      return successRateA - successRateB;
    }

    // Secondary sort: by number of questions (descending - most questions first for better mastery)
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

    row.innerHTML = `
      <td>${wordStats.frenchWord}</td>
      <td><strong>${wordStats.slovakWord}</strong></td>
      <td class="word-sets-cell">${wordSetsDisplay}</td>
      <td>${wordStats.totalQuestions}</td>
      <td>${globalSuccessRate}%</td>
      <td>${matchingSuccessRate}${matchingSuccessRate !== '-' ? '%' : ''}</td>
      <td>${slovakToFrenchMultipleChoiceSuccessRate}${slovakToFrenchMultipleChoiceSuccessRate !== '-' ? '%' : ''}</td>
      <td>${frenchToSlovakMultipleChoiceSuccessRate}${frenchToSlovakMultipleChoiceSuccessRate !== '-' ? '%' : ''}</td>
      <td>${reorderLettersSuccessRate}${reorderLettersSuccessRate !== '-' ? '%' : ''}</td>
      <td>${slovakToFrenchTypingSuccessRate}${slovakToFrenchTypingSuccessRate !== '-' ? '%' : ''}</td>
      <td>${frenchToSlovakTypingSuccessRate}${frenchToSlovakTypingSuccessRate !== '-' ? '%' : ''}</td>
    `;

    // Apply success rate colors (columns 3-9 are success rate columns)
    Array.from(row.children).forEach((td, cellIndex) => {
      // Add word coloring for first two columns
      if (cellIndex === 0) {
        td.innerHTML = `<span class="word-french">${td.textContent}</span>`;
      } else if (cellIndex === 1) {
        td.innerHTML = `<span class="word-slovak">${td.textContent}</span>`;
      }

      // Highlight success rates (columns 4-10 are success rate columns, after adding word sets column)
      if (cellIndex >= 4 && cellIndex <= 10) {
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

  console.log(`Displayed results for ${totalWords} word pairs`);
}

/**
 * Extract and prepare daily progression data for charts
 */
function prepareProgressionData(allResults, filterWordSet = 'all') {
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
        // Normalize common non-ISO "YYYY-MM-DD HH:mm:ss" to ISO by inserting 'T'
        const normalized = (tsString.includes(' ') && !tsString.includes('T')) ? tsString.replace(' ', 'T') : tsString;
        date = new Date(normalized);
      }

      // Check for invalid date
      if (isNaN(date.getTime())) {
        console.warn('Invalid timestamp found in progression data:', rawTs);
        return; // Skip this result
      }

      const dayKey = date.toISOString().split('T')[0]; // YYYY-MM-DD format

      timelineData.push({
        date: dayKey,
        timestamp: date.getTime(),
        quizType: result.quizType || 'unknown',
        quizName: result.quizName || 'Unknown Quiz',
        words: result.words
      });
    }
  });

  // Sort by timestamp
  timelineData.sort((a, b) => a.timestamp - b.timestamp);

  if (timelineData.length === 0) {
    return { dailyStats: [], labels: [] };
  }

  // Get all unique word pairs
  const allWordPairs = new Set();
  timelineData.forEach(entry => {
    entry.words.forEach(wordData => {
      // Handle both array and object formats for wordPair
      let wordPairArray;
      if (Array.isArray(wordData.wordPair)) {
        wordPairArray = wordData.wordPair;
      } else if (wordData.wordPair && typeof wordData.wordPair === 'object') {
        wordPairArray = [wordData.wordPair[0] || wordData.wordPair["0"], wordData.wordPair[1] || wordData.wordPair["1"]];
      }

      if (wordPairArray && wordPairArray.length >= 2 && wordPairArray[0] && wordPairArray[1]) {
        const wordPairKey = `${wordPairArray[0]}|${wordPairArray[1]}`;
        allWordPairs.add(wordPairKey);
      }
    });
  });

  // Create date range from first to last day
  const firstDay = timelineData[0].date;
  const lastDay = timelineData[timelineData.length - 1].date;

  const dateRange = [];
  const currentDate = new Date(firstDay);
  const endDate = new Date(lastDay);

  while (currentDate <= endDate) {
    dateRange.push(currentDate.toISOString().split('T')[0]);
    currentDate.setDate(currentDate.getDate() + 1);
  }

  // Calculate cumulative word stats for each day
  const dailyStats = [];

  console.log(`prepareProgressionData: Processing ${dateRange.length} days for filter "${filterWordSet}"`);
  console.log(`prepareProgressionData: Timeline data has ${timelineData.length} entries`);

  dateRange.forEach(day => {
    // Get all quiz results up to and including this day
    const resultsUpToThisDay = timelineData.filter(entry => entry.date <= day);

    // Track only words that have actually appeared by this day
    const cumulativeWordStats = new Map();

    // Process all results up to this day to find which words have been seen
    resultsUpToThisDay.forEach(entry => {
      entry.words.forEach(wordData => {
        // Handle both array and object formats for wordPair
        let wordPairArray;
        if (Array.isArray(wordData.wordPair)) {
          wordPairArray = wordData.wordPair;
        } else if (wordData.wordPair && typeof wordData.wordPair === 'object') {
          // Handle object format: {"0": "French", "1": "Slovak", "wordSetName": "..."}
          wordPairArray = [wordData.wordPair[0] || wordData.wordPair["0"], wordData.wordPair[1] || wordData.wordPair["1"]];
        } else {
          return; // Skip if wordPair is invalid
        }

        if (wordPairArray && wordPairArray.length >= 2 && wordPairArray[0] && wordPairArray[1]) {
          const wordSetName = wordData.wordSetName || entry.quizName || 'Unknown Set';

          // Debug logging for filtering
          if (day === dateRange[dateRange.length - 1]) { // Only log for the last day to avoid spam
            console.log(`prepareProgressionData: Word ${wordPairArray[1]}, wordSetName: "${wordSetName}", filter: "${filterWordSet}", matches: ${filterWordSet === 'all' || wordSetName === filterWordSet}`);
          }

          // Apply filter if specified
          if (filterWordSet && filterWordSet !== 'all' && wordSetName !== filterWordSet) {
            return; // Skip this word if it doesn't match the filter
          }

          const wordPairKey = `${wordPairArray[0]}|${wordPairArray[1]}`;

          // Initialize word stats if we haven't seen this word before
          if (!cumulativeWordStats.has(wordPairKey)) {
            cumulativeWordStats.set(wordPairKey, {
              totalQuestions: 0,
              totalCorrect: 0,
              successRate: 0
            });
          }

          const stats = cumulativeWordStats.get(wordPairKey);

          // Sum up all attempts across all quiz types
          const frenchToSlovakTotal = (wordData.french_to_slovak_successes || 0) + (wordData.french_to_slovak_failures || 0);
          const slovakToFrenchTotal = (wordData.slovak_to_french_successes || 0) + (wordData.slovak_to_french_failures || 0);
          const matchingTotal = (wordData.matching_successes || 0) + (wordData.matching_failures || 0);

          const totalAttempts = frenchToSlovakTotal + slovakToFrenchTotal + matchingTotal;
          const totalCorrect = (wordData.french_to_slovak_successes || 0) +
                              (wordData.slovak_to_french_successes || 0) +
                              (wordData.matching_successes || 0);

          stats.totalQuestions += totalAttempts;
          stats.totalCorrect += totalCorrect;
        }
      });
    });

    // Calculate success rates and categorize words (only words that have been seen)
    let masteredCount = 0;
    let learningCount = 0;
    let strugglingCount = 0;

    cumulativeWordStats.forEach(stats => {
      if (stats.totalQuestions > 0) {
        stats.successRate = (stats.totalCorrect / stats.totalQuestions) * 100;

        // Apply the same categorization logic as the adaptive quiz
        if (stats.totalQuestions >= 10 && stats.successRate >= 90) {
          masteredCount++;
        } else if (stats.successRate < 65) {
          strugglingCount++;
        } else {
          learningCount++;
        }
      } else {
        // This shouldn't happen since we only add words that have been quizzed
        learningCount++;
      }
    });

    const dayTotal = masteredCount + learningCount + strugglingCount;
    if (day === dateRange[dateRange.length - 1]) { // Only log for the last day
      console.log(`prepareProgressionData: Day ${day} stats - Mastered: ${masteredCount}, Learning: ${learningCount}, Struggling: ${strugglingCount}, Total: ${dayTotal}`);
    }

    dailyStats.push({
      date: day,
      mastered: masteredCount,
      learning: learningCount,
      struggling: strugglingCount,
      total: dayTotal
    });
  });

    return {
    dailyStats,
    labels: dateRange.map(date => {
      const d = new Date(date);
      // Show month/day for shorter labels
      return `${d.getDate()}/${d.getMonth() + 1}`;
    }),
    dateRange: dateRange // Keep original dates for debugging
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
        backgroundColor: 'rgba(40, 167, 69, 0.8)',
        borderColor: 'rgba(40, 167, 69, 1)',
        borderWidth: 1.5,
        fill: true,
        stepped: true // For step effect
      },
      {
        label: 'Mots en Apprentissage',
        data: progressionData.dailyStats.map(day => day.learning),
        backgroundColor: 'rgba(0, 123, 255, 0.8)',
        borderColor: 'rgba(0, 123, 255, 1)',
        borderWidth: 1.5,
        fill: true,
        stepped: true // For step effect
      },
      {
        label: 'Mots Difficiles',
        data: progressionData.dailyStats.map(day => day.struggling),
        backgroundColor: 'rgba(220, 53, 69, 0.8)',
        borderColor: 'rgba(220, 53, 69, 1)',
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
            afterLabel: function(context) {
              const dayData = progressionData.dailyStats[context.dataIndex];
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
  const lastDay = timelineData[timelineData.length - 1].date;

  const dateRange = [];
  const currentDate = new Date(firstDay);
  const endDate = new Date(lastDay);

  while (currentDate <= endDate) {
    dateRange.push(currentDate.toISOString().split('T')[0]);
    currentDate.setDate(currentDate.getDate() + 1);
  }

  // Calculate daily activity stats
  const dailyActivity = [];

  dateRange.forEach(day => {
    // Get quiz results for this specific day
    const dayResults = timelineData.filter(entry => entry.date === day);

    let correctAnswers = 0;
    let incorrectAnswers = 0;

    // Process all quiz results for this day
    dayResults.forEach(entry => {
      entry.words.forEach(wordData => {
        const wordSetName = wordData.wordSetName || entry.quizName || 'Unknown Set';

        // Apply filter if specified
        if (filterWordSet && filterWordSet !== 'all' && wordSetName !== filterWordSet) {
          return; // Skip this word if it doesn't match the filter
        }

        // Count all attempts across all quiz types
        const frenchToSlovakCorrect = wordData.french_to_slovak_successes || 0;
        const frenchToSlovakIncorrect = wordData.french_to_slovak_failures || 0;
        const slovakToFrenchCorrect = wordData.slovak_to_french_successes || 0;
        const slovakToFrenchIncorrect = wordData.slovak_to_french_failures || 0;
        const matchingCorrect = wordData.matching_successes || 0;
        const matchingIncorrect = wordData.matching_failures || 0;

        correctAnswers += frenchToSlovakCorrect + slovakToFrenchCorrect + matchingCorrect;
        incorrectAnswers += frenchToSlovakIncorrect + slovakToFrenchIncorrect + matchingIncorrect;
      });
    });

    dailyActivity.push({
      date: day,
      correct: correctAnswers,
      incorrect: incorrectAnswers,
      total: correctAnswers + incorrectAnswers
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
        backgroundColor: 'rgba(40, 167, 69, 0.8)',
        borderColor: 'rgba(40, 167, 69, 1)',
        borderWidth: 1
      },
      {
        label: 'Réponses Incorrectes',
        data: activityData.dailyActivity.map(day => day.incorrect),
        backgroundColor: 'rgba(220, 53, 69, 0.8)',
        borderColor: 'rgba(220, 53, 69, 1)',
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
              return `Total: ${dayData.total} réponses (${successRate}% de réussite)`;
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
    const { initializeApp } = await import("https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js");
    const { getDatabase } = await import("https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js");
    const { getAuth, onAuthStateChanged } = await import("https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js");

    if (!firebaseApp) {
      firebaseApp = initializeApp(firebaseConfig);
      database = getDatabase(firebaseApp);
      auth = getAuth(firebaseApp);
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
