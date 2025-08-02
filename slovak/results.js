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

    // Initialize Firebase app and database
    firebaseApp = initializeApp(firebaseConfig);
    database    = getDatabase(firebaseApp);

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

    // Dynamic import for database functions
    const { ref, get } = await import("https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js");

    // Get reference to the results node
    const resultsRef = ref(database, 'results');

    // Fetch all data
    const snapshot = await get(resultsRef);

    if (snapshot.exists()) {
      const data = snapshot.val();
      console.log("Fetched results from Firebase:", data);
      return data;
    } else {
      console.log("No results found in Firebase");
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
function aggregateWordPairStats(allResults) {
  const wordStats = new Map();

  // Process each quiz result
  Object.values(allResults).forEach(result => {
    if (result.words && Array.isArray(result.words)) {
      const quizType = result.quizType || 'unknown';

      result.words.forEach(wordData => {
        const frenchWord = wordData.wordPair[0];
        const slovakWord = wordData.wordPair[1];
        const wordPairKey = `${frenchWord}|${slovakWord}`;

        if (!wordStats.has(wordPairKey)) {
          wordStats.set(wordPairKey, {
            frenchWord: frenchWord,
            slovakWord: slovakWord,
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

  return Array.from(wordStats.values());
}

/**
 * Create and display the results table
 */
function displayResultsTable(wordPairStats) {
  // Sort by success rate (lowest first) to show most problematic words at the top
  wordPairStats.sort((a, b) => {
    const successRateA = a.totalQuestions > 0 ? ((a.totalQuestions - a.totalErrors) / a.totalQuestions) * 100 : 100;
    const successRateB = b.totalQuestions > 0 ? ((b.totalQuestions - b.totalErrors) / b.totalQuestions) * 100 : 100;
    return successRateA - successRateB; // Ascending order (lowest success rate first)
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

  // Create title
  const title = document.createElement('h2');
  title.textContent        = 'Statistiques des Mots';
  title.style.textAlign    = 'center';
  title.style.marginBottom = '20px';
  container.appendChild(title);

  // Create table
  const table = document.createElement('table');
  table.className            = 'results-table';
  table.style.width          = '100%';
  table.style.minWidth       = '1000px';  // Ensure minimum width for all columns
  table.style.borderCollapse = 'collapse';
  table.style.marginBottom   = '20px';

  // Make table scrollable on small screens
  const tableWrapper = document.createElement('div');
  tableWrapper.style.overflowX    = 'auto';
  tableWrapper.style.marginBottom = '20px';

  // Create header
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  headerRow.innerHTML = `
    <th>Français</th>
    <th>Slovaque</th>
    <th>Total Questions</th>
    <th>Réussite Globale</th>
    <th>Correspondances</th>
    <th>SK→FR Choix Multiple</th>
    <th>FR→SK Choix Multiple</th>
    <th>FR→SK Réorganiser</th>
    <th>SK→FR Saisie</th>
    <th>FR→SK Saisie</th>
  `;

  // Style header
  Array.from(headerRow.children).forEach((th, index) => {
    th.style.padding         = '8px 4px';
    th.style.border          = '1px solid #ddd';
    th.style.backgroundColor = '#f8f9fa';
    th.style.fontWeight      = 'bold';
    th.style.textAlign       = 'center';
    th.style.fontSize        = '13px';

    // Make first two columns wider for word text
    if (index < 2) {
      th.style.minWidth = '120px';
    } else {
      th.style.minWidth = '80px';
    }
  });

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

    row.innerHTML = `
      <td>${wordStats.frenchWord}</td>
      <td><strong>${wordStats.slovakWord}</strong></td>
      <td>${wordStats.totalQuestions}</td>
      <td>${globalSuccessRate}%</td>
      <td>${matchingSuccessRate}${matchingSuccessRate !== '-' ? '%' : ''}</td>
      <td>${slovakToFrenchMultipleChoiceSuccessRate}${slovakToFrenchMultipleChoiceSuccessRate !== '-' ? '%' : ''}</td>
      <td>${frenchToSlovakMultipleChoiceSuccessRate}${frenchToSlovakMultipleChoiceSuccessRate !== '-' ? '%' : ''}</td>
      <td>${reorderLettersSuccessRate}${reorderLettersSuccessRate !== '-' ? '%' : ''}</td>
      <td>${slovakToFrenchTypingSuccessRate}${slovakToFrenchTypingSuccessRate !== '-' ? '%' : ''}</td>
      <td>${frenchToSlovakTypingSuccessRate}${frenchToSlovakTypingSuccessRate !== '-' ? '%' : ''}</td>
    `;

    // Style cells
    Array.from(row.children).forEach((td, cellIndex) => {
      td.style.padding   = '6px 4px';
      td.style.border    = '1px solid #ddd';
      td.style.textAlign = cellIndex < 2 ? 'left' : 'center';
      td.style.fontSize  = '13px';

      // Highlight success rates (columns 3-9 are success rate columns)
      if (cellIndex >= 3 && cellIndex <= 9) {
        const rateText = td.textContent.replace('%', '');
        if (rateText !== '-') {
          const rate = parseFloat(rateText);
          if (rate >= 80) {
            td.style.backgroundColor = '#d4edda';
            td.style.color           = '#155724';
            td.style.fontWeight      = 'bold';
          } else if (rate >= 50) {
            td.style.backgroundColor = '#fff3cd';
            td.style.color           = '#856404';
            td.style.fontWeight      = 'bold';
          } else {
            td.style.backgroundColor = '#f8d7da';
            td.style.color           = '#721c24';
            td.style.fontWeight      = 'bold';
          }
        }
      }
    });

    // Alternate row colors
    if (index % 2 === 1) {
      row.style.backgroundColor = '#f8f9fa';
    }

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
  summary.className             = 'results-summary';
  summary.style.textAlign       = 'center';
  summary.style.padding         = '20px';
  summary.style.backgroundColor = '#f8f9fa';
  summary.style.border          = '1px solid #ddd';
  summary.style.borderRadius    = '5px';

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
 * Main function to load and display all results
 */
async function loadAndDisplayResults() {
  try {
    console.log("Loading results from Firebase...");

    // Show loading message
    const container = document.querySelector('.results-container') || document.body;
    container.innerHTML = '<div style="text-align: center; padding: 20px;">Chargement des résultats...</div>';

    // Fetch all results
    const allResults = await fetchAllResults();

    // Aggregate word pair statistics
    const wordPairStats = aggregateWordPairStats(allResults);

    // Display the table
    displayResultsTable(wordPairStats);

  } catch (error) {
    console.error("Error loading and displaying results:", error);

    // Show error message
    const container = document.querySelector('.results-container') || document.body;
    container.innerHTML = `
      <div style="text-align: center; padding: 20px; color: #dc3545;">
        <h3>Erreur de Chargement</h3>
        <p>Impossible de charger les résultats depuis Firebase.</p>
        <p style="font-size: 14px; color: #6c757d;">${error.message}</p>
      </div>
    `;
  }
}
