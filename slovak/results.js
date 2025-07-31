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
            frenchToSlovakQuestions: 0,
            frenchToSlovakErrors: 0,
            slovakToFrenchQuestions: 0,
            slovakToFrenchErrors: 0,
            matchingQuestions: 0,
            matchingErrors: 0
          });
        }

        const stats = wordStats.get(wordPairKey);

        // Aggregate French to Slovak stats
        const frenchToSlovakTotal = (wordData.french_to_slovak_successes || 0) + (wordData.french_to_slovak_failures || 0);
        stats.frenchToSlovakQuestions += frenchToSlovakTotal;
        stats.frenchToSlovakErrors += (wordData.french_to_slovak_failures || 0);

        // Aggregate Slovak to French stats
        const slovakToFrenchTotal = (wordData.slovak_to_french_successes || 0) + (wordData.slovak_to_french_failures || 0);
        stats.slovakToFrenchQuestions += slovakToFrenchTotal;
        stats.slovakToFrenchErrors += (wordData.slovak_to_french_failures || 0);

        // Aggregate Matching stats
        const matchingTotal = (wordData.matching_successes || 0) + (wordData.matching_failures || 0);
        stats.matchingQuestions += matchingTotal;
        stats.matchingErrors += (wordData.matching_failures || 0);

        // Update totals
        stats.totalQuestions += frenchToSlovakTotal + slovakToFrenchTotal + matchingTotal;
        stats.totalErrors += (wordData.french_to_slovak_failures || 0) + (wordData.slovak_to_french_failures || 0) + (wordData.matching_failures || 0);
      });
    }
  });

  return Array.from(wordStats.values());
}

/**
 * Create and display the results table
 */
function displayResultsTable(wordPairStats) {
  // Sort by Slovak word alphabetically
  wordPairStats.sort((a, b) => a.slovakWord.localeCompare(b.slovakWord, 'sk'));

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
  title.textContent = 'Statistiques des Mots';
  title.style.textAlign = 'center';
  title.style.marginBottom = '20px';
  container.appendChild(title);

  // Create table
  const table = document.createElement('table');
  table.className = 'results-table';
  table.style.width = '100%';
  table.style.borderCollapse = 'collapse';
  table.style.marginBottom = '20px';

  // Create header
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  headerRow.innerHTML = `
    <th>Français</th>
    <th>Slovaque</th>
    <th>Total Questions</th>
    <th>Total Erreurs</th>
    <th>Taux d'Erreur</th>
    <th>FR→SK Questions</th>
    <th>FR→SK Erreurs</th>
    <th>SK→FR Questions</th>
    <th>SK→FR Erreurs</th>
    <th>Correspondances Questions</th>
    <th>Correspondances Erreurs</th>
  `;

  // Style header
  Array.from(headerRow.children).forEach(th => {
    th.style.padding = '12px 8px';
    th.style.border = '1px solid #ddd';
    th.style.backgroundColor = '#f8f9fa';
    th.style.fontWeight = 'bold';
    th.style.textAlign = 'center';
    th.style.fontSize = '14px';
  });

  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Create body
  const tbody = document.createElement('tbody');

  wordPairStats.forEach((wordStats, index) => {
    const row = document.createElement('tr');

    // Calculate error rate
    const errorRate = wordStats.totalQuestions > 0
      ? ((wordStats.totalErrors / wordStats.totalQuestions) * 100).toFixed(1)
      : '0.0';

    row.innerHTML = `
      <td>${wordStats.frenchWord}</td>
      <td><strong>${wordStats.slovakWord}</strong></td>
      <td>${wordStats.totalQuestions}</td>
      <td>${wordStats.totalErrors}</td>
      <td>${errorRate}%</td>
      <td>${wordStats.frenchToSlovakQuestions}</td>
      <td>${wordStats.frenchToSlovakErrors}</td>
      <td>${wordStats.slovakToFrenchQuestions}</td>
      <td>${wordStats.slovakToFrenchErrors}</td>
      <td>${wordStats.matchingQuestions}</td>
      <td>${wordStats.matchingErrors}</td>
    `;

    // Style cells
    Array.from(row.children).forEach((td, cellIndex) => {
      td.style.padding = '8px';
      td.style.border = '1px solid #ddd';
      td.style.textAlign = cellIndex < 2 ? 'left' : 'center';
      td.style.fontSize = '14px';

      // Highlight high error rates
      if (cellIndex === 4) { // Error rate column
        const rate = parseFloat(errorRate);
        if (rate > 50) {
          td.style.backgroundColor = '#f8d7da';
          td.style.color = '#721c24';
        } else if (rate > 25) {
          td.style.backgroundColor = '#fff3cd';
          td.style.color = '#856404';
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
  container.appendChild(table);

  // Add summary statistics
  const totalWords = wordPairStats.length;
  const totalQuestions = wordPairStats.reduce((sum, stats) => sum + stats.totalQuestions, 0);
  const totalErrors = wordPairStats.reduce((sum, stats) => sum + stats.totalErrors, 0);
  const overallErrorRate = totalQuestions > 0 ? ((totalErrors / totalQuestions) * 100).toFixed(1) : '0.0';

  const summary = document.createElement('div');
  summary.className = 'results-summary';
  summary.style.textAlign = 'center';
  summary.style.padding = '20px';
  summary.style.backgroundColor = '#f8f9fa';
  summary.style.border = '1px solid #ddd';
  summary.style.borderRadius = '5px';

  summary.innerHTML = `
    <h3>Résumé Global</h3>
    <p><strong>Nombre de mots uniques:</strong> ${totalWords}</p>
    <p><strong>Total questions posées:</strong> ${totalQuestions}</p>
    <p><strong>Total erreurs:</strong> ${totalErrors}</p>
    <p><strong>Taux d'erreur global:</strong> ${overallErrorRate}%</p>
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
