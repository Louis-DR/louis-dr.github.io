// Finite State Machine Quiz System
// Clean architecture without hacks and bandaids

// Quiz States
const QuizStates = {
  INITIAL:       'initial',
  START_SCREEN:  'start_screen',
  ADAPTIVE_MENU: 'adaptive_menu',
  QUIZ_ACTIVE:   'quiz_active',
  QUIZ_COMPLETE: 'quiz_complete'
};

// Quiz Types
const QuizTypes = {
  MATCHING:                'matching',
  MULTIPLE_CHOICE:         'multiple_choice',
  REORDER_LETTERS:         'reorder_letters',
  SLOVAK_TO_FRENCH_TYPING: 'slovak_to_french_typing',
  FRENCH_TO_SLOVAK_TYPING: 'french_to_slovak_typing'
};

// Firebase configuration
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

const maxWords = 8;

// Utility function to get local timestamp in ISO format
function getLocalTimestamp() {
  const now = new Date();

  // Get local date components
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const milliseconds = String(now.getMilliseconds()).padStart(3, '0');

  // Get timezone offset in ±HH:MM format
  const offset = -now.getTimezoneOffset();
  const offsetHours = String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0');
  const offsetMinutes = String(Math.abs(offset) % 60).padStart(2, '0');
  const offsetSign = offset >= 0 ? '+' : '-';

  // Return proper ISO 8601 format with timezone
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${milliseconds}${offsetSign}${offsetHours}:${offsetMinutes}`;
}

// Firebase globals
let firebaseApp = null;
let database    = null;
let auth        = null;

// Dynamic loader for shared helpers
async function ensureDataHelpersLoaded() {
  if (window.SlovakData) return true;
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src$="data.js"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(true));
      existing.addEventListener('error', () => reject(new Error('Failed to load data.js')));
      return;
    }
    const script = document.createElement('script');
    script.src = 'data.js';
    script.onload = () => resolve(true);
    script.onerror = () => reject(new Error('Failed to load data.js'));
    document.head.appendChild(script);
  });
}

// Dynamic loader for audio library
async function ensureAudioLibLoaded() {
  if (window.AudioLib && typeof window.AudioLib.play === 'function') return true;
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src$="audio.js"]');
    if (existing) {
      // If script exists but AudioLib isn't ready yet, wait for it
      if (window.AudioLib && typeof window.AudioLib.play === 'function') {
        resolve(true);
      } else {
        existing.addEventListener('load', () => resolve(true));
        existing.addEventListener('error', () => reject(new Error('Failed to load audio.js')));
      }
      return;
    }
    const script = document.createElement('script');
    script.src = 'audio.js';
    script.onload = () => resolve(true);
    script.onerror = () => reject(new Error('Failed to load audio.js'));
    document.head.appendChild(script);
  });
}

// Main Quiz State Machine
class QuizStateMachine {
  constructor() {
    this.state                   = QuizStates.INITIAL;
    this.wordPairs               = [];
    this.quizName                = 'Slovak Language Quiz';
    this.selectionMode           = 'all'; // all, mastered, learning, struggling
    this.enabledQuizTypes        = [QuizTypes.MATCHING, QuizTypes.MULTIPLE_CHOICE, QuizTypes.REORDER_LETTERS, QuizTypes.SLOVAK_TO_FRENCH_TYPING, QuizTypes.FRENCH_TO_SLOVAK_TYPING];
    this.currentQuizTypeIndex    = 0;
    this.selectedWordPairs       = [];
    this.wordQueue               = [];
    this.correctAnswers          = 0;
    this.totalQuestions          = 0;
    this.results                 = {};
    this.currentQuestion         = null;
    this.feedbackData            = null;
    this.user                    = null;
    this.isGlobalAdaptive        = false;
    this.autoAudioEnabled        = this.getAutoAudioSetting();

    // UI state
    this.matchingSelections      = {};
    this.matchingPairs           = {};
    this.reorderSelectedLetters  = [];
    this.reorderAvailableLetters = [];
    this.reorderKeydownHandler   = null;
    this.activeAdaptivePool      = null;
    this.masteryCategories       = null;

    // Initialize
    this.container               = null;
    this.bindEvents();
  }

  // State machine core
  async transition(newState, data = {}) {
    console.log(`State transition: ${this.state} -> ${newState}`);
    this.state = newState;
    await this.render(data);
  }

  async render(data = {}) {
    this.container = this.getQuizContainer();
    if (!this.container) return;

    this.cleanup();
    this.container.innerHTML = '';

    switch (this.state) {
      case QuizStates.START_SCREEN:
        this.renderStartScreen();
        break;
      case QuizStates.ADAPTIVE_MENU:
        this.renderAdaptiveMenu(data.categories);
        break;
      case QuizStates.QUIZ_ACTIVE:
        await this.renderActiveQuiz();
        break;
      case QuizStates.QUIZ_COMPLETE:
        this.renderCompletion();
        break;
    }
  }

  // Initialization methods
  async initialize(wordPairs, quizName, enabledQuizTypes) {
    this.wordPairs        = wordPairs        || [];
    this.quizName         = quizName         || 'Slovak Language Quiz';
    this.isGlobalAdaptive = !wordPairs || (Array.isArray(wordPairs) && wordPairs.length === 0);
    this.selectionMode    = 'all'; // Default to 'all' for regular quizzes
    this.enabledQuizTypes = enabledQuizTypes || [QuizTypes.MATCHING, QuizTypes.MULTIPLE_CHOICE, QuizTypes.REORDER_LETTERS, QuizTypes.SLOVAK_TO_FRENCH_TYPING, QuizTypes.FRENCH_TO_SLOVAK_TYPING];

    // Set wordSetName for provided word pairs (regular vocabulary page quizzes)
    if (this.wordPairs.length > 0) {
      this.wordPairs.forEach(pair => {
        if (!pair.wordSetName) {
          pair.wordSetName = this.quizName;
        }
      });
    }

    try {
      await this.initializeFirebaseAndAuth();
    } catch (error) {
      this.renderError("Failed to initialize Firebase authentication.");
    }
  }

  async initializeFirebaseAndAuth() {
    if (auth) return; // Already initialized

    try {
      console.log("Initializing Firebase and Auth...");
      const { initializeApp }               = await import("https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js");
      const { getDatabase }                 = await import("https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js");
      const { getAuth, onAuthStateChanged } = await import("https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js");

      if (!firebaseApp) {
        firebaseApp = initializeApp(firebaseConfig);
        database    = getDatabase(firebaseApp);
        auth        = getAuth(firebaseApp);
        console.log("Firebase with Auth initialized successfully");
      }

      onAuthStateChanged(auth, async (user) => {
        this.user = user;
        this.renderAuthStatusFooter();

        if (user) {
          console.log("User is signed in:", user.displayName);
          await this.initializeAdaptiveQuiz();
  } else {
          console.log("User is signed out.");
          this.renderLoginScreen();
        }
      });
    } catch (error) {
      console.error("Error during Firebase initialization and auth setup:", error);
      throw error;
    }
  }

  async initializeAdaptiveQuiz() {
    try {
      this.container = this.getQuizContainer();
      if (this.container) {
        this.container.innerHTML = '<div class="loading-message">Récupération de votre historique d\'apprentissage...</div>';
      }

      // Analyze performance for both provided word pairs and historical data
      const { perWord, extractedWordPairs } = await this.analyzeWordPairPerformance(this.wordPairs);

      // For global adaptive quiz (no word pairs provided), use extracted word pairs
      if (this.wordPairs.length === 0 && extractedWordPairs.length > 0) {
        this.wordPairs = extractedWordPairs;
      }

      // Create categories from the per-word attempts map
      const isGlobalHistory = (this.quizName && this.quizName.toLowerCase().includes('historique'));
      // Normalize quizName to match saved set names (strip adaptive suffixes)
      const normalizeSetName = (name) => {
        if (!name) return null;
        let s = String(name).trim();
        s = s.replace(/\s*-\s*(Vérification des acquis|Consolidation de l'apprentissage|Correction des lacunes)$/i, '').trim();
        return s;
      };
      // If no explicit wordPairs were provided (global adaptive quiz), do not filter by set
      const filterWordSet = (isGlobalHistory || this.isGlobalAdaptive || this.quizName === 'Slovak Language Quiz') ? null : normalizeSetName(this.quizName);
      const categories = this.categorizeWordPairs(perWord, filterWordSet);

      // Always show adaptive menu
      await this.transition(QuizStates.ADAPTIVE_MENU, { categories });
    } catch (error) {
      console.error("Error initializing adaptive quiz:", error);
      // Show empty adaptive menu on error
      const emptyCategories = {
        mastered:   [],
        learning:   [],
        struggling: []
      };
      await this.transition(QuizStates.ADAPTIVE_MENU, { categories: emptyCategories });
    }
  }

  async startQuiz(selectedWordPairs = null) {
    // Select words for this quiz session
    if (selectedWordPairs) {
      this.selectedWordPairs = selectedWordPairs;
    } else if (this.selectionMode === 'mastered' && this.masteryCategories) {
      // For mastery quizzes, always use intelligent selection to ensure proper randomization
      this.selectedWordPairs = this.selectMasteryWords(this.masteryCategories);
    } else if (Array.isArray(this.activeAdaptivePool) && this.activeAdaptivePool.length > 0) {
      // For struggling and learning modes, we need to apply intelligent selection logic on restart
      if (this.selectionMode === 'struggling') {
        // Re-apply struggling mode selection logic with current categories
        this.selectedWordPairs = await this.applyStrugglingModeSelection(this.activeAdaptivePool);
      } else if (this.selectionMode === 'learning') {
        // Re-apply learning mode selection logic
        this.selectedWordPairs = await this.applyLearningModeSelection(this.activeAdaptivePool);
      } else {
        // For other modes, use simple random selection
      const maxPairs = Math.min(maxWords, this.activeAdaptivePool.length);
      const shuffled = this.shuffleArray([...this.activeAdaptivePool]);
      this.selectedWordPairs = shuffled.slice(0, maxPairs);
      }
    } else {
      const fallbackMax = Math.min(maxWords, this.wordPairs.length);
      const shuffledPairs = this.shuffleArray([...this.wordPairs]);
      this.selectedWordPairs = shuffledPairs.slice(0, fallbackMax);
    }

    // Reset quiz state
    this.currentQuizTypeIndex  = 0;
    this.lastCompletedQuizType = null;
    this.wordQueue             = this.shuffleArray([...this.selectedWordPairs]);
    this.correctAnswers        = 0;
    this.totalQuestions        = 0;
    this.results               = {};

    // Initialize results tracking
    this.selectedWordPairs.forEach(pair => {
      const wordKey = pair[1];

      // Always ensure wordPair is a clean array, never an object with nested properties
      const cleanWordPair = Array.isArray(pair) ? [pair[0], pair[1]] : [pair[0] || pair['0'], pair[1] || pair['1']];

      this.results[wordKey] = {
        wordPair: cleanWordPair,
        // Track per-word word set name (normalize to strip adaptive suffixes if helper exists)
        wordSetName: (window.SlovakData && typeof window.SlovakData.normalizeWordSetName === 'function')
          ? window.SlovakData.normalizeWordSetName(pair.wordSetName || this.quizName)
          : (pair.wordSetName || this.quizName),
        attempts: []
      };
    });

    await this.transition(QuizStates.QUIZ_ACTIVE);
  }

  getCurrentQuizType() {
    return this.enabledQuizTypes[this.currentQuizTypeIndex];
  }

  selectMasteryWords(categories) {
    const masteredWords = categories.mastered || [];
    const masteringWords = categories.mastering || [];

    // Create prioritized selection with weighted preference for mastering words
    const targetMasteringWords = Math.min(4, masteringWords.length); // At least 4 mastering words if available
    const remainingSlots = Math.max(0, maxWords - targetMasteringWords);

    // Select mastering words first (shuffled)
    const shuffledMastering = this.shuffleArray([...masteringWords]);
    const selectedMastering = shuffledMastering.slice(0, targetMasteringWords);

    // Fill remaining slots with mastered words, but prefer fewer mastered words
    const shuffledMastered = this.shuffleArray([...masteredWords]);
    const selectedMastered = shuffledMastered.slice(0, remainingSlots);

    // Combine and shuffle the final selection
    const combinedSelection = [...selectedMastering, ...selectedMastered];
    const finalSelection = this.shuffleArray(combinedSelection);

    console.log(`Mastery quiz selection: ${selectedMastering.length} mastering words, ${selectedMastered.length} mastered words (total: ${finalSelection.length})`);

    return finalSelection;
  }

  getMasteryQuizDirection() {
    // Get the current direction from localStorage, default to Slovak to French
    const lastDirection = localStorage.getItem('masteryQuizDirection') || QuizTypes.SLOVAK_TO_FRENCH_TYPING;

    // Alternate to the opposite direction
    const newDirection = lastDirection === QuizTypes.SLOVAK_TO_FRENCH_TYPING
      ? QuizTypes.FRENCH_TO_SLOVAK_TYPING
      : QuizTypes.SLOVAK_TO_FRENCH_TYPING;

    // Store the new direction for next time
    localStorage.setItem('masteryQuizDirection', newDirection);

    console.log(`Mastery quiz direction: ${lastDirection} -> ${newDirection}`);
    return newDirection;
  }

  async applyStrugglingModeSelection(allAvailableWords) {
    try {
      // Re-analyze performance to get current categories
      const { perWord } = await this.analyzeWordPairPerformance(this.wordPairs);
      const isGlobalHistory = (this.quizName && this.quizName.toLowerCase().includes('historique'));
      const normalizeSetName = (name) => {
        if (!name) return null;
        let s = String(name).trim();
        s = s.replace(/\s*-\s*(Vérification des acquis|Consolidation de l'apprentissage|Correction des lacunes)$/i, '').trim();
        return s;
      };
      const filterWordSet = (isGlobalHistory || this.isGlobalAdaptive || this.quizName === 'Slovak Language Quiz') ? null : normalizeSetName(this.quizName);
      const categories = this.categorizeWordPairs(perWord, filterWordSet);

      const strugglingWords = [...categories.struggling];
      const unencounteredWords = [...(categories.unencountered || [])];

      // Apply the same selection logic as in the adaptive menu
      const targetStruggling = Math.min(4, strugglingWords.length);
      const remainingSlotsAfterStruggling = Math.max(0, maxWords - targetStruggling);
      const targetUnencountered = Math.min(remainingSlotsAfterStruggling, unencounteredWords.length);

      const shuffledStruggling = this.shuffleArray(strugglingWords);
      const selectedStruggling = shuffledStruggling.slice(0, targetStruggling);

      const shuffledUnencountered = this.shuffleArray(unencounteredWords);
      const selectedUnencountered = shuffledUnencountered.slice(0, targetUnencountered);

      const currentSelection = selectedStruggling.length + selectedUnencountered.length;
      const slotsToFill = maxWords - currentSelection;

      let additionalWords = [];
      if (slotsToFill > 0) {
        const alreadySelectedKeys = new Set([
          ...selectedStruggling.map(w => `${w[0]}|${w[1]}`),
          ...selectedUnencountered.map(w => `${w[0]}|${w[1]}`)
        ]);

        const paddingWords = allAvailableWords.filter(pair => !alreadySelectedKeys.has(`${pair[0]}|${pair[1]}`));
        const shuffledPadding = this.shuffleArray(paddingWords);
        additionalWords = shuffledPadding.slice(0, slotsToFill);
      }

      const combinedSelection = [...selectedStruggling, ...selectedUnencountered, ...additionalWords];
      return this.shuffleArray(combinedSelection);
    } catch (error) {
      console.error('Error in applyStrugglingModeSelection:', error);
      // Fallback to simple random selection
      const maxPairs = Math.min(maxWords, allAvailableWords.length);
      const shuffled = this.shuffleArray([...allAvailableWords]);
      return shuffled.slice(0, maxPairs);
    }
  }

  async applyLearningModeSelection(allAvailableWords) {
    try {
      // Re-analyze performance to get current categories
      const { perWord } = await this.analyzeWordPairPerformance(this.wordPairs);
      const isGlobalHistory = (this.quizName && this.quizName.toLowerCase().includes('historique'));
      const normalizeSetName = (name) => {
        if (!name) return null;
        let s = String(name).trim();
        s = s.replace(/\s*-\s*(Vérification des acquis|Consolidation de l'apprentissage|Correction des lacunes)$/i, '').trim();
        return s;
      };
      const filterWordSet = (isGlobalHistory || this.isGlobalAdaptive || this.quizName === 'Slovak Language Quiz') ? null : normalizeSetName(this.quizName);
      const categories = this.categorizeWordPairs(perWord, filterWordSet);

      const learningWords = [...categories.learning];

      if (learningWords.length >= maxWords) {
        const shuffledLearning = this.shuffleArray(learningWords);
        return shuffledLearning.slice(0, maxWords);
      } else {
        // Need to pad with additional words
        const slotsToFill = maxWords - learningWords.length;
        const alreadySelectedKeys = new Set(learningWords.map(w => `${w[0]}|${w[1]}`));
        const paddingWords = allAvailableWords.filter(pair => !alreadySelectedKeys.has(`${pair[0]}|${pair[1]}`));
        const shuffledPadding = this.shuffleArray(paddingWords);
        const selectedPadding = shuffledPadding.slice(0, slotsToFill);

        const combinedSelection = [...learningWords, ...selectedPadding];
        return this.shuffleArray(combinedSelection);
      }
    } catch (error) {
      console.error('Error in applyLearningModeSelection:', error);
      // Fallback to simple random selection
      const maxPairs = Math.min(maxWords, allAvailableWords.length);
      const shuffled = this.shuffleArray([...allAvailableWords]);
      return shuffled.slice(0, maxPairs);
    }
  }

  // Event handlers
  bindEvents() {
    // Global keyboard handler
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        this.handleEnterKey(event);
      }
    });
  }

  async handleEnterKey(event) {
    // Handle Enter key for continue button when feedback is shown
    if (this.state === QuizStates.QUIZ_ACTIVE) {
      const nextButton = document.querySelector('.next-button');
      if (nextButton && !nextButton.disabled) {
        event.preventDefault();
        await this.continue();
      }
    }
    // Handle Enter key for restart button on completion screen
    else if (this.state === QuizStates.QUIZ_COMPLETE) {
      const restartButton = document.querySelector('#restart-quiz-button');
      if (restartButton && !restartButton.disabled) {
        event.preventDefault();
        await this.restart();
      }
    }
  }

  submitAnswer(answer, isCorrect) {
    // Record attempt
    const wordKey = this.currentQuestion.pair[1];
    this.results[wordKey].attempts.push({
      direction: this.currentQuestion.direction,
      isCorrect: isCorrect,
      // Optional fields for typing/reorder quizzes (may be undefined for other types)
      isAlmost: this.currentQuestion.isAlmost,
      mistakeMetric: this.currentQuestion.mistakeMetric,
      userInput: typeof answer === 'string' ? answer : undefined,
      timestamp: getLocalTimestamp()
    });

    this.totalQuestions++;

    if (isCorrect) {
      this.correctAnswers++;
      this.wordQueue.shift(); // Remove from queue
  } else {
      // Move to back of queue
      const incorrectPair = this.wordQueue.shift();
      this.wordQueue.push(incorrectPair);
    }

    // Show inline feedback based on quiz type
    this.showInlineFeedback(answer, isCorrect);
  }

  async continue() {
    console.log(`Continue called - wordQueue length: ${this.wordQueue.length}, currentQuizTypeIndex: ${this.currentQuizTypeIndex}, enabledQuizTypes length: ${this.enabledQuizTypes.length}`);

        if (this.wordQueue.length > 0) {
      // Continue current quiz type
      console.log('Continuing current quiz type');
      await this.transition(QuizStates.QUIZ_ACTIVE);
    } else {
      // Move to next quiz type or complete
      this.currentQuizTypeIndex++;
      console.log(`Moving to next quiz type - new index: ${this.currentQuizTypeIndex}`);

      // Always upload results for the just-completed quiz type
      console.log('Quiz type completed - uploading results for:', this.enabledQuizTypes[this.currentQuizTypeIndex - 1]);
      await this.uploadCurrentQuizTypeResults();

      if (this.currentQuizTypeIndex >= this.enabledQuizTypes.length) {
        console.log('All quiz types completed - showing completion screen');
        await this.transition(QuizStates.QUIZ_COMPLETE);
      } else {
        console.log('Resetting for next quiz type');
        // Reset word queue for next quiz type
        this.wordQueue = this.shuffleArray([...this.selectedWordPairs]);
        console.log('Reset wordQueue to:', this.wordQueue.length, 'words from selectedWordPairs:', this.selectedWordPairs.length);
        this.correctAnswers = 0; // Reset for new quiz type
        await this.transition(QuizStates.QUIZ_ACTIVE);
      }
    }
  }

  async uploadCurrentQuizTypeResults() {
    const justCompletedQuizType = this.enabledQuizTypes[this.currentQuizTypeIndex - 1];
    console.log('uploadCurrentQuizTypeResults() called for:', justCompletedQuizType);

    const results = this.generateQuizResults(justCompletedQuizType);
    console.log('Quiz Results for', justCompletedQuizType, ':', results);
    console.log('Pushing results to Firebase...');
    await this.pushQuizResultsToFirebase(results);
    console.log('Results pushed for', justCompletedQuizType);

    // Clear results for next quiz type
    this.resetResultsForNextQuizType();
  }

  resetResultsForNextQuizType() {
    // Clear attempts from all words but keep the word structure
    Object.keys(this.results).forEach(wordKey => {
      this.results[wordKey].attempts = [];
    });
    this.totalQuestions = 0;
  }

  async restart() {
    console.log('restart() called');
    this.currentQuizTypeIndex = 0;

    // If this is a mastery quiz, update the direction for the new session
    if (this.selectionMode === 'mastered') {
      const newDirection = this.getMasteryQuizDirection();
      this.enabledQuizTypes = [newDirection];
      console.log('Mastery quiz restart: updated direction to', newDirection);
    }

    await this.startQuiz(); // This will select new random words
  }

  renderLoginScreen() {
    this.container = this.getQuizContainer();
    if (!this.container) return;
    this.cleanup();
    this.container.innerHTML = `
      <div class="login-container" style="text-align: center; padding: 50px;">
        <h2 style="color: #007bff; margin-bottom: 20px;">Authentification Requise</h2>
        <button id="google-login-button" class="btn btn-primary btn-lg">Se connecter avec Google</button>
      </div>
    `;
    document.getElementById('google-login-button').addEventListener('click', () => this.signInWithGoogle());
  }

  async signInWithGoogle() {
    try {
      const { GoogleAuthProvider, signInWithPopup } = await import("https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js");
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      // onAuthStateChanged will handle the UI update
    } catch (error) {
      console.error("Error during Google sign-in:", error);
      this.renderError("La connexion avec Google a échoué. Veuillez réessayer.", error.message);
    }
  }

  renderAuthStatusFooter() {
    let footer = document.getElementById('auth-status-footer');
    if (!footer) {
      footer = document.createElement('div');
      footer.id = 'auth-status-footer';
      footer.style.cssText = 'position: fixed; bottom: 10px; right: 10px; font-size: 12px; color: #666; background-color: rgba(240, 240, 240, 0.8); padding: 5px 10px; border-radius: 5px; z-index: 1000;';
      document.body.appendChild(footer);
    }

    if (this.user) {
      footer.innerHTML = `Connecté: <strong>${this.user.displayName || this.user.email}</strong> | <a href="#" id="logout-link" style="color: #007bff;">Se déconnecter</a>`;
      footer.querySelector('#logout-link').addEventListener('click', async (e) => {
        e.preventDefault();
        const { signOut } = await import("https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js");
        await signOut(auth);
      });
    } else {
      footer.innerHTML = `<a href="#" id="login-link" style="color: #007bff;">Se connecter avec Google</a>`;
      footer.querySelector('#login-link').addEventListener('click', (e) => {
        e.preventDefault();
        this.signInWithGoogle();
      });
    }
  }

  renderError(message, details = '') {
    this.container = this.getQuizContainer();
    if (!this.container) return;
    this.container.innerHTML = `
      <div class="error-message" style="padding: 20px; text-align: center; color: #721c24; background-color: #f8d7da; border: 1px solid #f5c6cb; border-radius: 5px;">
        <h3>Erreur</h3>
        <p>${message}</p>
        <p style="font-size: 12px; color: #6c757d;">${details}</p>
      </div>
    `;
  }

  // Rendering methods
  renderStartScreen() {
    const pendingCount = this.checkPendingResultsCount();
    let pendingNotification = '';
    if (pendingCount > 0) {
      pendingNotification = `<p style="color: #856404; font-size: 14px; margin-bottom: 15px; background-color: #fff3cd; padding: 10px; border-radius: 4px; border: 1px solid #ffeaa7;">⚠️ ${pendingCount} résultat(s) en attente seront envoyés lors du démarrage.</p>`;
    }

    this.container.innerHTML = `
      <div class="quiz-start" style="position: relative;">
        <button class="btn btn-outline btn-sm" id="auto-audio-toggle" style="position: absolute; top: 10px; left: 10px; font-size: 18px; padding: 8px 12px; z-index: 100;" title="${this.autoAudioEnabled ? 'Audio automatique activé' : 'Audio automatique désactivé'}">
          ${this.autoAudioEnabled ? '🔊' : '🔇'}
        </button>
        ${pendingNotification}
        <button class="btn btn-success btn-lg start-button" id="start-quiz-button">
          Commencer le Quiz "${this.quizName}"
        </button>
      </div>
    `;

    document.getElementById('start-quiz-button').addEventListener('click', async () => {
      try {
        await this.uploadPendingResults();
      } catch (error) {
        console.error("Error uploading pending results:", error);
      }
      await this.startQuiz();
    });

    document.getElementById('auto-audio-toggle').addEventListener('click', () => {
      this.setAutoAudioSetting(!this.autoAudioEnabled);
      const toggleButton = document.getElementById('auto-audio-toggle');
      toggleButton.innerHTML = this.autoAudioEnabled ? '🔊' : '🔇';
      toggleButton.title = this.autoAudioEnabled ? 'Audio automatique activé' : 'Audio automatique désactivé';
    });
  }

  renderAdaptiveMenu(categories) {
    const pendingCount = this.checkPendingResultsCount();
    let pendingNotification = '';
    if (pendingCount > 0) {
      pendingNotification = `<p style="color: #856404; font-size: 14px; margin-bottom: 15px; background-color: #fff3cd; padding: 10px; border-radius: 4px; border: 1px solid #ffeaa7;">⚠️ ${pendingCount} résultat(s) en attente seront envoyés lors du démarrage.</p>`;
    }

    const isHistoryMode = this.quizName.includes('Historique') || this.quizName.includes('Adaptatif');
    const masteredOrMasteringCount = (categories.mastered.length + (categories.mastering ? categories.mastering.length : 0));
    const totalWords    = masteredOrMasteringCount + categories.learning.length + categories.struggling.length;

    let subtitle;
    if (isHistoryMode && totalWords === 0) {
      subtitle = "Aucun historique d'apprentissage trouvé. Commencez par faire quelques quiz pour débloquer le mode adaptatif.";
    } else if (isHistoryMode) {
      subtitle = "Basé sur votre historique d'apprentissage complet :";
    } else {
      subtitle = "Choisissez votre mode d'entraînement :";
    }

    this.container.innerHTML = `
      <div class="adaptive-quiz-menu" style="position: relative;">
        <button class="btn btn-outline btn-sm" id="auto-audio-toggle" style="position: absolute; top: 10px; left: 10px; font-size: 18px; padding: 8px 12px; z-index: 100;" title="${this.autoAudioEnabled ? 'Audio automatique activé' : 'Audio automatique désactivé'}">
          ${this.autoAudioEnabled ? '🔊' : '🔇'}
        </button>
        ${pendingNotification}
        <h2 style="color: #007bff; margin-bottom: 30px;">Quiz Adaptatif - ${this.quizName}</h2>
        <p style="margin-bottom: 30px; color: #495057;">${subtitle}</p>

        <div style="display: flex; flex-direction: column; gap: 15px; max-width: 500px; margin: 0 auto;">
          <button class="btn btn-outline btn-lg adaptive-option" data-mode="all" ${this.wordPairs.length === 0 ? 'disabled' : ''}>
            📝 Tous les mots
            <small style="display: block; font-size: 14px; margin-top: 5px; opacity: 0.8;">
              ${this.wordPairs.length === 0 ? 'Aucun mot disponible' : `${this.wordPairs.length} mot(s) • Sélection aléatoire`}
            </small>
          </button>

          <button class="btn btn-success btn-lg adaptive-option" data-mode="mastered" ${masteredOrMasteringCount === 0 ? 'disabled' : ''}>
            🎯 Vérifier les acquis
            <small style="display: block; font-size: 14px; margin-top: 5px; opacity: 0.8;">
              ${(categories.mastering ? categories.mastering.length : 0)} en maîtrise, ${categories.mastered.length} maîtrisés • Taux de réussite >90%
            </small>
          </button>

          <button class="btn btn-primary btn-lg adaptive-option" data-mode="learning" ${categories.learning.length === 0 ? 'disabled' : ''}>
            📚 Consolider l'apprentissage
            <small style="display: block; font-size: 14px; margin-top: 5px; opacity: 0.8;">
              ${categories.learning.length} mot(s) en apprentissage • Taux de réussite 70-90%
            </small>
          </button>

          <button class="btn btn-danger btn-lg adaptive-option" data-mode="struggling" ${categories.struggling.length === 0 && (categories.unencountered || []).length === 0 && (!this.wordPairs || this.wordPairs.length === 0) && (categories.mastered.length + categories.mastering.length + categories.learning.length) === 0 ? 'disabled' : ''}>
            🔥 Corriger les lacunes
            <small style="display: block; font-size: 14px; margin-top: 5px; opacity: 0.8;">
              ${categories.struggling.length} difficiles, ${(categories.unencountered || []).length} nouveaux • Taux de réussite <70%
            </small>
          </button>
        </div>
      </div>
    `;

    // Bind adaptive quiz buttons
    document.querySelectorAll('.adaptive-option').forEach(button => {
      button.addEventListener('click', async (event) => {
        const mode = event.currentTarget.dataset.mode;
        let selectedWordPairs;
        let enabledQuizTypes;
        let selectionPool;

        switch (mode) {
          case 'all':
            // Use all available word pairs
            selectionPool = [...this.wordPairs];
            const maxPairs = Math.min(maxWords, selectionPool.length);
            const shuffledAll = this.shuffleArray(selectionPool);
            selectedWordPairs = shuffledAll.slice(0, maxPairs);
            enabledQuizTypes  = this.enabledQuizTypes; // Use default enabled quiz types
            this.selectionMode = 'all';
            // Keep original quiz name for 'all' mode
            break;
                    case 'mastered':
            // Store the full categories for intelligent re-selection on restart
            this.masteryCategories = {
              mastered: [...(categories.mastered || [])],
              mastering: [...(categories.mastering || [])]
            };

            // Use intelligent selection helper
            selectedWordPairs = this.selectMasteryWords(this.masteryCategories);

            // For restart functionality, store the full pool rather than the selection
            // This ensures fresh random selection on each restart
            selectionPool = [...(categories.mastered || []), ...(categories.mastering || [])];

            // Alternate direction for mastery quizzes
            const currentDirection = this.getMasteryQuizDirection();
            enabledQuizTypes       = [currentDirection];
            this.selectionMode     = 'mastered';
            break;
          case 'learning':
            // For learning mode, prioritize learning words but pad with other words if needed
            const learningWords = [...categories.learning];

            if (learningWords.length >= maxWords) {
              // We have enough learning words
              const shuffledLearning = this.shuffleArray(learningWords);
              selectedWordPairs = shuffledLearning.slice(0, maxWords);
              selectionPool = learningWords;
            } else {
              // We need to pad with additional words
              selectedWordPairs = [...learningWords];
              const slotsToFill = maxWords - learningWords.length;

              if (slotsToFill > 0) {
                let paddingWords;
                if (this.wordPairs && this.wordPairs.length > 0) {
                  // Use words from provided word set that aren't already selected
                  const alreadySelectedKeys = new Set(learningWords.map(w => `${w[0]}|${w[1]}`));
                  paddingWords = this.wordPairs
                    .filter(pair => !alreadySelectedKeys.has(`${pair[0]}|${pair[1]}`))
                    .map(pair => {
                      const wordPair = [pair[0], pair[1]];
                      wordPair.wordSetName = pair.wordSetName || filterWordSet || this.quizName;
                      return wordPair;
                    });
                } else {
                  // Use words from other categories
                  const alreadySelectedKeys = new Set(learningWords.map(w => `${w[0]}|${w[1]}`));
                  paddingWords = [...categories.struggling, ...categories.mastering, ...categories.mastered, ...(categories.unencountered || [])]
                    .filter(pair => !alreadySelectedKeys.has(`${pair[0]}|${pair[1]}`));
                }

                const shuffledPadding = this.shuffleArray(paddingWords);
                const selectedPadding = shuffledPadding.slice(0, slotsToFill);
                selectedWordPairs = [...selectedWordPairs, ...selectedPadding];

                console.log(`Learning mode: Added ${selectedPadding.length} padding words to ${learningWords.length} learning words`);
              }

              // Shuffle the final selection
              selectedWordPairs = this.shuffleArray(selectedWordPairs);

              // Set selection pool for restarts
              if (this.wordPairs && this.wordPairs.length > 0) {
                selectionPool = this.wordPairs.map(pair => {
                  const wordPair = [pair[0], pair[1]];
                  wordPair.wordSetName = pair.wordSetName || filterWordSet || this.quizName;
                  return wordPair;
                });
              } else {
                selectionPool = [...learningWords, ...categories.struggling, ...categories.mastering, ...categories.mastered, ...(categories.unencountered || [])];
              }
            }

            enabledQuizTypes       = this.enabledQuizTypes; // Use default enabled quiz types
            this.selectionMode     = 'learning';
            break;
          case 'struggling':
            // For struggling mode, intelligently select from struggling words and unencountered words
            const strugglingWords = [...categories.struggling];
            const unencounteredWords = [...(categories.unencountered || [])];
            const totalTargetWords = strugglingWords.length + unencounteredWords.length;

                        // Use normal selection logic and pad with additional words if needed
            // Calculate balanced selection (prefer struggling words first, then unencountered)
            const targetStruggling = Math.min(4, strugglingWords.length);
            const remainingSlotsAfterStruggling = Math.max(0, maxWords - targetStruggling);
            const targetUnencountered = Math.min(remainingSlotsAfterStruggling, unencounteredWords.length);

            // Select struggling words first (shuffled)
            const shuffledStruggling = this.shuffleArray(strugglingWords);
            const selectedStruggling = shuffledStruggling.slice(0, targetStruggling);

            // Select unencountered words
            const shuffledUnencountered = this.shuffleArray(unencounteredWords);
            const selectedUnencountered = shuffledUnencountered.slice(0, targetUnencountered);

            // Calculate how many slots we still need to fill
            const currentSelection = selectedStruggling.length + selectedUnencountered.length;
            const slotsToFill = maxWords - currentSelection;

            let additionalWords = [];
            if (slotsToFill > 0) {
              // First try to use remaining words from struggling/unencountered pools
              const remainingStruggling = shuffledStruggling.slice(targetStruggling);
              const remainingUnencountered = shuffledUnencountered.slice(targetUnencountered);
              const combinedRemaining = [...remainingStruggling, ...remainingUnencountered];

              if (combinedRemaining.length >= slotsToFill) {
                // We have enough from the remaining struggling/unencountered words
                const shuffledRemaining = this.shuffleArray(combinedRemaining);
                additionalWords = shuffledRemaining.slice(0, slotsToFill);
              } else {
                // We need to pad with other words to reach maxWords
                additionalWords = [...combinedRemaining]; // Use all remaining from target pools
                const stillNeedToFill = slotsToFill - additionalWords.length;

                if (stillNeedToFill > 0) {
                  // Get additional words from other categories or word set
                  let paddingWords;
                  if (this.wordPairs && this.wordPairs.length > 0) {
                    // Use words from provided word set that aren't already selected
                    const alreadySelectedKeys = new Set([
                      ...selectedStruggling.map(w => `${w[0]}|${w[1]}`),
                      ...selectedUnencountered.map(w => `${w[0]}|${w[1]}`),
                      ...additionalWords.map(w => `${w[0]}|${w[1]}`)
                    ]);

                    paddingWords = this.wordPairs
                      .filter(pair => !alreadySelectedKeys.has(`${pair[0]}|${pair[1]}`))
                      .map(pair => {
                        const wordPair = [pair[0], pair[1]];
                        wordPair.wordSetName = pair.wordSetName || filterWordSet || this.quizName;
                        return wordPair;
                      });
                  } else {
                    // Use words from other categories (learning, mastering, mastered)
                    const alreadySelectedKeys = new Set([
                      ...selectedStruggling.map(w => `${w[0]}|${w[1]}`),
                      ...selectedUnencountered.map(w => `${w[0]}|${w[1]}`),
                      ...additionalWords.map(w => `${w[0]}|${w[1]}`)
                    ]);

                    paddingWords = [...categories.learning, ...categories.mastering, ...categories.mastered]
                      .filter(pair => !alreadySelectedKeys.has(`${pair[0]}|${pair[1]}`));
                  }

                  const shuffledPadding = this.shuffleArray(paddingWords);
                  const selectedPadding = shuffledPadding.slice(0, stillNeedToFill);
                  additionalWords = [...additionalWords, ...selectedPadding];

                  console.log(`Added ${selectedPadding.length} padding words to reach target of ${maxWords}`);
                }
              }
            }

                        // Combine and shuffle the final selection
            const combinedSelection = [...selectedStruggling, ...selectedUnencountered, ...additionalWords];
            selectedWordPairs = this.shuffleArray(combinedSelection);

            // For struggling mode, include all possible words in the selection pool for restarts
            // This ensures restarts can also pad properly
            if (this.wordPairs && this.wordPairs.length > 0) {
              // Use the full provided word set as the selection pool
              selectionPool = this.wordPairs.map(pair => {
                const wordPair = [pair[0], pair[1]];
                wordPair.wordSetName = pair.wordSetName || filterWordSet || this.quizName;
                return wordPair;
              });
            } else {
              // For global adaptive, use all categorized words
              selectionPool = [...strugglingWords, ...unencounteredWords, ...categories.learning, ...categories.mastering, ...categories.mastered];
            }

            console.log(`Struggling quiz selection: ${selectedStruggling.length} struggling words, ${selectedUnencountered.length} unencountered words, ${additionalWords.length} additional words (total: ${selectedWordPairs.length})`);

            // Fallback only if we have no words at all
            if (selectedWordPairs.length === 0) {
              console.warn('No words available for struggling mode, this should not happen');
            }

            enabledQuizTypes         = this.enabledQuizTypes; // Use default enabled quiz types
            this.selectionMode       = 'struggling';
            break;
        }

        console.log(`Adaptive quiz: Selected ${selectedWordPairs.length} words for ${mode} mode with quiz types:`, enabledQuizTypes);

        try {
          await this.uploadPendingResults();
        } catch (error) {
          console.error("Error uploading pending results:", error);
        }

        // Update enabled quiz types for this session
        this.enabledQuizTypes = enabledQuizTypes;
        // Remember current adaptive selection pool for restarts
        this.activeAdaptivePool = Array.isArray(selectionPool) ? selectionPool : null;
        await this.startQuiz(selectedWordPairs);
      });
    });

    // Bind auto audio toggle button for adaptive menu
    document.getElementById('auto-audio-toggle').addEventListener('click', () => {
      this.setAutoAudioSetting(!this.autoAudioEnabled);
      const toggleButton = document.getElementById('auto-audio-toggle');
      toggleButton.innerHTML = this.autoAudioEnabled ? '🔊' : '🔇';
      toggleButton.title = this.autoAudioEnabled ? 'Audio automatique activé' : 'Audio automatique désactivé';
    });
  }

  async renderActiveQuiz() {
    const quizType = this.getCurrentQuizType();
    console.log('renderActiveQuiz called - quizType:', quizType, 'wordQueue length:', this.wordQueue.length, 'currentQuizTypeIndex:', this.currentQuizTypeIndex);

    switch (quizType) {
      case QuizTypes.MATCHING:
        this.unbindReorderKeyboard();
        this.renderMatchingQuiz();
        break;
      case QuizTypes.MULTIPLE_CHOICE:
        this.unbindReorderKeyboard();
        await this.renderMultipleChoiceQuiz();
        break;
      case QuizTypes.REORDER_LETTERS:
        await this.renderReorderQuiz();
        break;
      case QuizTypes.SLOVAK_TO_FRENCH_TYPING:
        this.unbindReorderKeyboard();
        await this.renderTypingQuiz(false);
        break;
      case QuizTypes.FRENCH_TO_SLOVAK_TYPING:
        this.unbindReorderKeyboard();
        await this.renderTypingQuiz(true);
        break;
    }
  }

  renderMatchingQuiz() {
    this.container.innerHTML = `
      <p class="progress">Progrès: Correspondances</p>
      <p class="instruction">Associez les mots français aux mots slovaques</p>
      <div class="matching-container">
        <div class="matching-column left-column"></div>
        <div class="matching-column right-column"></div>
      </div>
      <button class="btn btn-primary submit-button" disabled>Soumettre</button>
    `;

    const leftColumn   = this.container.querySelector('.left-column');
    const rightColumn  = this.container.querySelector('.right-column');
    const submitButton = this.container.querySelector('.submit-button');

    // Create word buttons
    const frenchWords = this.shuffleArray(this.selectedWordPairs.map(pair => pair[0]));
    const slovakWords = this.shuffleArray(this.selectedWordPairs.map(pair => pair[1]));

    frenchWords.forEach(word => {
    const button = document.createElement('button');
      button.textContent      = word;
      button.className        = 'matching-word french-word';
      button.dataset.word     = word;
      button.dataset.language = 'french';
      button.addEventListener('click', () => this.handleMatchingClick(button));
      leftColumn.appendChild(button);
    });

    slovakWords.forEach(word => {
      const button = document.createElement('button');
      button.textContent      = word;
      button.className        = 'matching-word slovak-word';
      button.dataset.word     = word;
      button.dataset.language = 'slovak';
      button.addEventListener('click', () => this.handleMatchingClick(button));

      const audioEmoji = this.createAudioEmoji(word);
      button.appendChild(audioEmoji);
      rightColumn.appendChild(button);
    });

    submitButton.addEventListener('click', () => this.handleMatchingSubmit());

    this.matchingSelections = {};
    this.matchingPairs      = {};
  }

  async renderMultipleChoiceQuiz() {
    console.log('renderMultipleChoiceQuiz called - wordQueue length:', this.wordQueue.length);
    if (this.wordQueue.length === 0) {
      console.log('Multiple choice: wordQueue is empty, calling continue()');
      await this.continue();
    return;
  }

    const questionPair = this.wordQueue[0];
  const isFrenchQuestion = Math.random() < 0.5;
    const questionText  = isFrenchQuestion ? questionPair[0] : questionPair[1];
    const correctAnswer = isFrenchQuestion ? questionPair[1] : questionPair[0];

    // Generate wrong answers
    const wrongAnswers = [];
    while (wrongAnswers.length < 3) {
      const randomPair = this.selectedWordPairs[Math.floor(Math.random() * this.selectedWordPairs.length)];
      const potentialWrong = isFrenchQuestion ? randomPair[1] : randomPair[0];
      if (potentialWrong !== correctAnswer && !wrongAnswers.includes(potentialWrong)) {
        wrongAnswers.push(potentialWrong);
      }
    }

    const allChoices = this.shuffleArray([correctAnswer, ...wrongAnswers]);

    this.currentQuestion = {
      pair:          questionPair,
      direction:     isFrenchQuestion ? 'french_to_slovak' : 'slovak_to_french',
      correctAnswer: correctAnswer
    };

    this.container.innerHTML = `
      <p class="progress">Progrès: ${this.correctAnswers}/${this.selectedWordPairs.length} mots maîtrisés</p>
      <p class="question">${questionText}${!isFrenchQuestion ? '' : ''}</p>
      <div class="choices"></div>
    `;

    if (!isFrenchQuestion) {
      const questionElement = this.container.querySelector('.question');
      const audioEmoji      = this.createAudioEmoji(questionText);
      questionElement.appendChild(audioEmoji);

      // Play auto audio for Slovak questions at the start (with half-second delay)
      this.playAutoAudio(questionText, 500);
    }

    const choicesContainer = this.container.querySelector('.choices');
    allChoices.forEach(choice => {
      const button = document.createElement('button');
      button.textContent = choice;
      button.className   = 'btn btn-outline btn-block choice-button';
      button.addEventListener('click', () => {
        const isCorrect = choice === correctAnswer;

        // Disable all buttons
        choicesContainer.querySelectorAll('button').forEach(btn => btn.disabled = true);

        // Highlight correct answer
        choicesContainer.querySelectorAll('button').forEach(btn => {
          if (btn.textContent === correctAnswer) {
            btn.classList.add('state-correct');
            if (isFrenchQuestion) {
              const audioEmoji = this.createAudioEmoji(correctAnswer);
              btn.appendChild(audioEmoji);
            }
          }
        });

        if (!isCorrect) {
          button.classList.add('state-incorrect');
        }

        this.submitAnswer(choice, isCorrect);
      });
      choicesContainer.appendChild(button);
    });
  }

  async renderTypingQuiz(isFrenchQuestion) {
    console.log('renderTypingQuiz called - wordQueue length:', this.wordQueue.length, 'isFrenchQuestion:', isFrenchQuestion);
    if (this.wordQueue.length === 0) {
      console.log('Typing quiz: wordQueue is empty, calling continue()');
      await this.continue();
      return;
    }

    const questionPair  = this.wordQueue[0];
    const questionText  = isFrenchQuestion ? questionPair[0] : questionPair[1];
    const correctAnswer = this.cleanWordForInput(isFrenchQuestion ? questionPair[1] : questionPair[0]);

    const directionText = isFrenchQuestion ? ' (FR→SK)' : ' (SK→FR)';

    this.currentQuestion = {
      pair: questionPair,
      direction: isFrenchQuestion ? 'french_to_slovak' : 'slovak_to_french',
      correctAnswer: correctAnswer,
      originalCorrectAnswer: isFrenchQuestion ? questionPair[1] : questionPair[0]
    };

    this.container.innerHTML = `
      <p class="progress">Progrès: ${this.correctAnswers}/${this.selectedWordPairs.length} mots maîtrisés${directionText}</p>
      <p class="question">${questionText}</p>
      <div class="typing-container">
        <input type="text" class="form-input typing-input" placeholder="Type your answer here..." autocomplete="off">
        <div class="special-chars-container"></div>
        <button class="btn btn-primary submit-button">Soumettre</button>
      </div>
    `;

    if (!isFrenchQuestion) {
      const questionElement = this.container.querySelector('.question');
      const audioEmoji = this.createAudioEmoji(questionText);
      questionElement.appendChild(audioEmoji);

      // Play auto audio for Slovak questions at the start (with half-second delay)
      this.playAutoAudio(questionText, 500);
    }

    const inputField = this.container.querySelector('.typing-input');
    const submitButton = this.container.querySelector('.submit-button');
    const specialCharsContainer = this.container.querySelector('.special-chars-container');

    // Add special characters
    const specialChars = ['á', 'ä', 'č', 'ď', 'dž', 'é', 'í', 'ĺ', 'ľ', 'ň', 'ó', 'ô', 'ŕ', 'š', 'ť', 'ú', 'ý', 'ž'];
    specialChars.forEach(char => {
      const charButton = document.createElement('button');
      charButton.type = 'button';
      charButton.textContent = char;
      charButton.className = 'btn btn-secondary btn-sm special-char-button';
      charButton.addEventListener('click', () => {
        const cursorPosition = inputField.selectionStart;
        const textBefore = inputField.value.substring(0, cursorPosition);
        const textAfter = inputField.value.substring(inputField.selectionEnd);
        inputField.value = textBefore + char + textAfter;
        const newCursorPosition = cursorPosition + char.length;
        inputField.focus();
        inputField.setSelectionRange(newCursorPosition, newCursorPosition);
      });
      specialCharsContainer.appendChild(charButton);
    });

    const handleSubmit = () => {
      const userAnswer = this.cleanWordForInput(inputField.value.trim());
      const normalizedUserAnswer = this.normalizeLigatures(userAnswer.toLowerCase());
      const normalizedCorrectAnswer = this.normalizeLigatures(correctAnswer.toLowerCase());
      let isCorrect = normalizedUserAnswer === normalizedCorrectAnswer;

      // Compute mistake metric and almost classification for typing
      const mistakeMetric = this.computeMistakeMetric(userAnswer, correctAnswer);
      const threshold = this.getAlmostThreshold(correctAnswer.length);
      const isAlmost = !isCorrect && mistakeMetric <= threshold;

      // For Slovak to French typing, treat "almost" answers as correct
      // This accounts for small typos that don't represent real knowledge gaps
      if (!isFrenchQuestion && isAlmost) {
        isCorrect = true;
      }

      this.currentQuestion.mistakeMetric = mistakeMetric;
      this.currentQuestion.isAlmost = isAlmost;

      inputField.disabled = true;
      submitButton.disabled = true;

      if (isCorrect) {
        inputField.classList.add('state-correct');
      } else if (isAlmost) {
        inputField.classList.add('state-almost');
      } else {
        inputField.classList.add('state-incorrect');
      }

      this.submitAnswer(userAnswer, isCorrect);
    };

    submitButton.addEventListener('click', handleSubmit);
  inputField.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
        event.preventDefault();
        handleSubmit();
    }
  });

  inputField.focus();
  }

  async renderReorderQuiz() {
    console.log('renderReorderQuiz called - wordQueue length:', this.wordQueue.length);
    if (this.wordQueue.length === 0) {
      console.log('Reorder quiz: wordQueue is empty, calling continue()');
      await this.continue();
      return;
    }

    const questionPair = this.wordQueue[0];
    const frenchWord = questionPair[0];
    const slovakWord = this.cleanWordForInput(questionPair[1]);
    const correctLetters = slovakWord.toLowerCase().split('');

    // Generate random letters
    const regularLetters = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z'];
    const slovakSpecialLetters = ['á', 'ä', 'č', 'ď', 'é', 'í', 'ĺ', 'ľ', 'ň', 'ó', 'ô', 'ŕ', 'š', 'ť', 'ú', 'ý', 'ž'];

    const randomLetters = [];
    const numRandomLetters = Math.min(5, Math.max(3, Math.floor(correctLetters.length * 0.8)));

    while (randomLetters.length < numRandomLetters) {
      const useSpecialLetter = Math.random() < 0.3;
      const letterPool = useSpecialLetter ? slovakSpecialLetters : regularLetters;
      const randomLetter = letterPool[Math.floor(Math.random() * letterPool.length)];

      if (!correctLetters.includes(randomLetter.toLowerCase()) && !randomLetters.includes(randomLetter.toLowerCase())) {
        randomLetters.push(randomLetter.toLowerCase());
      }
    }

    const allLetters = [...correctLetters, ...randomLetters];
    this.reorderAvailableLetters = this.shuffleArray(allLetters);
    this.reorderSelectedLetters = [];

    this.currentQuestion = {
      pair: questionPair,
      direction: 'french_to_slovak',
      correctAnswer: slovakWord,
      originalCorrectAnswer: questionPair[1]
    };

    this.container.innerHTML = `
      <p class="progress">Progrès: ${this.correctAnswers}/${this.selectedWordPairs.length} mots maîtrisés (Réorganiser)</p>
      <p class="question">${frenchWord}</p>
      <p class="instruction">Cliquez sur les lettres pour former le mot slovaque</p>
      <div class="reorder-word-container"></div>
      <div class="reorder-letters-container"></div>
      <button class="btn btn-primary submit-button" disabled>Vérifier</button>
    `;

    // Note: Reorder quiz shows French question but doesn't need auto audio at start
    // Auto audio will play the Slovak answer when validating

    this.updateReorderDisplay();

    // Bind keyboard input for faster letter selection
    this.bindReorderKeyboard();

    const submitButton = this.container.querySelector('.submit-button');
    submitButton.addEventListener('click', () => {
      const userAnswer = this.reorderSelectedLetters.join('');
      const isCorrect = userAnswer.toLowerCase() === slovakWord.toLowerCase();
      // Compute mistake metric and almost classification for reorder letters
      const mistakeMetric = this.computeMistakeMetric(userAnswer, slovakWord);
      const threshold = this.getAlmostThreshold(slovakWord.length);
      const isAlmost = !isCorrect && mistakeMetric <= threshold;
      this.currentQuestion.mistakeMetric = mistakeMetric;
      this.currentQuestion.isAlmost = isAlmost;

      submitButton.disabled = true;
      document.querySelectorAll('.reorder-letter-button, .reorder-letter-slot.filled').forEach(btn => btn.disabled = true);

      this.submitAnswer(userAnswer, isCorrect);
    });
  }

  // Map of base letters to preferred accented alternatives for Slovak
  getAccentedAlternatives(baseLetter) {
    const map = {
      'a': ['á', 'ä'],
      'c': ['č'],
      'd': ['ď'],
      'e': ['é'],
      'i': ['í'],
      'l': ['ĺ', 'ľ'],
      'n': ['ň'],
      'o': ['ó', 'ô'],
      'r': ['ŕ'],
      's': ['š'],
      't': ['ť'],
      'u': ['ú'],
      'y': ['ý'],
      'z': ['ž']
    };
    return map[baseLetter] || [];
  }

  bindReorderKeyboard() {
    // Remove previous handler if any
    this.unbindReorderKeyboard();

    this.reorderKeydownHandler = (event) => {
      // Only process when on reorder quiz
      if (this.getCurrentQuizType() !== QuizTypes.REORDER_LETTERS) return;

      // Ignore modifiers
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      // Enter validates (click submit if enabled)
      if (event.key === 'Enter') {
        const submitButton = this.container && this.container.querySelector('.submit-button');
        if (submitButton && !submitButton.disabled) {
          event.preventDefault();
          submitButton.click();
        }
        return;
      }

      // Backspace removes last selected letter
      if (event.key === 'Backspace') {
        if (this.reorderSelectedLetters.length > 0) {
          event.preventDefault();
          this.removeLetterFromWord(this.reorderSelectedLetters.length - 1);
        }
        return;
      }

      // Non-character keys are ignored beyond this point
      if (event.key.length !== 1) return;

      const key = event.key.toLowerCase();

      // Try exact match first among available letters
      let index = this.reorderAvailableLetters.findIndex(l => l.toLowerCase() === key);

      // If not found, try accented alternatives for the base letter
      if (index === -1) {
        const alternatives = this.getAccentedAlternatives(key);
        for (const alt of alternatives) {
          index = this.reorderAvailableLetters.findIndex(l => l.toLowerCase() === alt.toLowerCase());
          if (index !== -1) break;
        }
      }

      if (index !== -1) {
        event.preventDefault();
        this.addLetterToWord(index);
      }
    };

    document.addEventListener('keydown', this.reorderKeydownHandler);
  }

  unbindReorderKeyboard() {
    if (this.reorderKeydownHandler) {
      document.removeEventListener('keydown', this.reorderKeydownHandler);
      this.reorderKeydownHandler = null;
    }
  }

  showInlineFeedback(answer, isCorrect) {
    const quizType = this.getCurrentQuizType();
    console.log('showInlineFeedback called - quizType:', quizType, 'isCorrect:', isCorrect);

    // Add feedback display and next button based on quiz type
    switch (quizType) {
      case QuizTypes.MULTIPLE_CHOICE:
        this.showMultipleChoiceFeedback(answer, isCorrect);
        break;
      case QuizTypes.SLOVAK_TO_FRENCH_TYPING:
      case QuizTypes.FRENCH_TO_SLOVAK_TYPING:
        this.showTypingFeedback(answer, isCorrect);
        break;
      case QuizTypes.REORDER_LETTERS:
        this.showReorderFeedback(answer, isCorrect);
        break;
      case QuizTypes.MATCHING:
        this.showMatchingFeedback(answer, isCorrect);
        break;
    }

    // Add next button
    this.addNextButton();
  }

  addNextButton() {
    console.log('addNextButton called - wordQueue length:', this.wordQueue.length, 'currentQuizTypeIndex:', this.currentQuizTypeIndex);

    // Check if next button already exists
    if (this.container.querySelector('.next-button')) {
      console.log('Next button already exists, returning');
      return;
    }

    const submitButton = this.container.querySelector('.submit-button');
    if (submitButton) {
      // Replace submit button with next button
      const nextButton = document.createElement('button');
      nextButton.className = 'btn btn-primary next-button';
      nextButton.textContent = 'Suivant';
      nextButton.addEventListener('click', async () => await this.continue());
      submitButton.parentNode.replaceChild(nextButton, submitButton);
  } else {
      // No submit button found, append next button to container
      const nextButton = document.createElement('button');
      nextButton.className = 'btn btn-primary next-button';
      nextButton.textContent = 'Suivant';
      nextButton.style.marginTop = '20px';
      nextButton.addEventListener('click', async () => await this.continue());
      this.container.appendChild(nextButton);
    }
  }

  showMultipleChoiceFeedback(answer, isCorrect) {
    // Feedback is already shown by the button highlighting in renderMultipleChoiceQuiz
    // Add auto audio for Slovak answers (only for French→Slovak direction)
    if (this.currentQuestion.direction === 'french_to_slovak') {
      const slovakAnswer = this.currentQuestion.originalCorrectAnswer || this.currentQuestion.correctAnswer;

      // Play auto audio when showing the Slovak answer
      this.playAutoAudio(slovakAnswer);

      // Also add audio emoji for correct answers
      if (isCorrect) {
        const choicesContainer = this.container.querySelector('.choices');
        const correctButton = Array.from(choicesContainer.querySelectorAll('button')).find(btn =>
          btn.textContent.includes(slovakAnswer)
        );
        if (correctButton && !correctButton.querySelector('.audio-emoji')) {
          const audioEmoji = this.createAudioEmoji(slovakAnswer);
          correctButton.appendChild(audioEmoji);
        }
      }
    }
  }

  showTypingFeedback(answer, isCorrect) {
    const inputField = this.container.querySelector('.typing-input');

    // Add feedback message below the input
    const feedbackDiv = document.createElement('div');
    feedbackDiv.className = 'feedback typing-feedback';

    // Play auto audio for Slovak answers (both correct and incorrect) - only for French→Slovak direction
    if (this.currentQuestion.direction === 'french_to_slovak') {
      const slovakAnswer = this.currentQuestion.originalCorrectAnswer || this.currentQuestion.correctAnswer;
      this.playAutoAudio(slovakAnswer);
    }

    if (isCorrect) {
      feedbackDiv.innerHTML = `<span class="feedback-success">✓ Correct!</span>`;

      // Add audio emoji for correct Slovak answers
      if (this.currentQuestion.direction === 'french_to_slovak') {
        const audioEmoji = this.createAudioEmoji(this.currentQuestion.originalCorrectAnswer, '10px');
        feedbackDiv.appendChild(audioEmoji);
      }
    } else {
      const feedbackClass   = this.currentQuestion.isAlmost ? 'feedback-almost' : 'feedback-error';
      const feedbackMessage = this.currentQuestion.isAlmost ? 'Presque' : 'Incorrect';
      const metricInfo      = typeof this.currentQuestion.mistakeMetric === 'number' ? ` (écart: ${this.currentQuestion.mistakeMetric})` : '';
      feedbackDiv.innerHTML = `
        <span class="${feedbackClass}">✗ ${feedbackMessage}${metricInfo}</span><br>
        <span class="feedback-info">Votre réponse: "${answer}"</span><br>
        <span class="feedback-info">Réponse correcte: "${this.currentQuestion.originalCorrectAnswer || this.currentQuestion.correctAnswer}"</span>
      `;

      // Add audio emoji for incorrect Slovak answers
      if (this.currentQuestion.direction === 'french_to_slovak') {
        const audioEmoji = this.createAudioEmoji(this.currentQuestion.originalCorrectAnswer || this.currentQuestion.correctAnswer);
        feedbackDiv.appendChild(audioEmoji);
      }
    }

    inputField.parentNode.insertBefore(feedbackDiv, inputField.parentNode.querySelector('.submit-button'));
  }

  showReorderFeedback(answer, isCorrect) {
    const submitButton = this.container.querySelector('.submit-button');

    // Add feedback message above the submit button
    const feedbackDiv = document.createElement('div');
    feedbackDiv.className = 'feedback reorder-feedback';

    // Play auto audio for reorder answers (always Slovak answers)
    const slovakAnswer = this.currentQuestion.originalCorrectAnswer || this.currentQuestion.correctAnswer;
    this.playAutoAudio(slovakAnswer);

    if (isCorrect) {
      feedbackDiv.innerHTML = `<span class="feedback-success">✓ Correct!</span>`;

      // Add audio emoji for correct answers
      const audioEmoji = this.createAudioEmoji(slovakAnswer, '10px');
      feedbackDiv.appendChild(audioEmoji);
    } else {
      const feedbackClass   = this.currentQuestion.isAlmost ? 'feedback-almost' : 'feedback-error';
      const feedbackMessage = this.currentQuestion.isAlmost ? 'Presque' : 'Incorrect';
      const metricInfo      = typeof this.currentQuestion.mistakeMetric === 'number' ? ` (écart: ${this.currentQuestion.mistakeMetric})` : '';
      feedbackDiv.innerHTML = `
        <span class="${feedbackClass}">✗ ${feedbackMessage}${metricInfo}</span><br>
        <span class="feedback-info">Réponse correcte: "${slovakAnswer}"</span>
      `;

      // Add audio emoji for incorrect answers
      const audioEmoji = this.createAudioEmoji(slovakAnswer);
      feedbackDiv.appendChild(audioEmoji);
    }

    submitButton.parentNode.insertBefore(feedbackDiv, submitButton);
  }

  showMatchingFeedback(answer, isCorrect) {
    console.log('showMatchingFeedback called with isCorrect:', isCorrect);
    // Feedback is already shown by the line colors and button states in handleMatchingSubmit
    // No additional feedback needed
  }

  renderCompletion() {
    const nextQuizType = this.getNextQuizTypeDisplay();

    this.container.innerHTML = `
      <div class="quiz-completion">
        <p>Questions Répondues: <strong>${this.totalQuestions}</strong></p>
        <p>Prochain Quiz: <strong>${nextQuizType}</strong></p>
        <button class="btn btn-primary next-button" id="restart-quiz-button">Commencer</button>
      </div>
    `;

    document.getElementById('restart-quiz-button').addEventListener('click', async () => await this.restart());
  }

  getNextQuizTypeDisplay() {
    const typeDisplayNames = {
      [QuizTypes.MATCHING]: 'Correspondances',
      [QuizTypes.MULTIPLE_CHOICE]: 'Choix Multiple',
      [QuizTypes.REORDER_LETTERS]: 'Réorganiser Lettres',
      [QuizTypes.SLOVAK_TO_FRENCH_TYPING]: 'Saisie SK→FR',
      [QuizTypes.FRENCH_TO_SLOVAK_TYPING]: 'Saisie FR→SK'
    };

    const currentIndex = this.currentQuizTypeIndex;
    const nextIndex = (currentIndex === -1 || currentIndex === this.enabledQuizTypes.length - 1) ? 0 : currentIndex + 1;
    const nextType = this.enabledQuizTypes[nextIndex];

    return typeDisplayNames[nextType] || 'Quiz Suivant';
  }

  getAutoAudioSetting() {
    const saved = localStorage.getItem('autoAudioEnabled');
    return saved === null ? true : saved === 'true'; // Default to enabled
  }

  setAutoAudioSetting(enabled) {
    this.autoAudioEnabled = enabled;
    localStorage.setItem('autoAudioEnabled', enabled.toString());
  }

  async playAutoAudio(slovakWord, delay = 0) {
    if (!this.autoAudioEnabled || !slovakWord) return;

    const playAudio = async () => {
      try {
        await ensureAudioLibLoaded();
        if (window.AudioLib && typeof window.AudioLib.play === 'function') {
          window.AudioLib.play(slovakWord);
        }
      } catch (error) {
        console.error('Auto audio playback failed:', error);
      }
    };

    if (delay > 0) {
      setTimeout(playAudio, delay);
    } else {
      await playAudio();
    }
  }

  // Utility methods
  getQuizContainer() {
    const container = document.querySelector('.quiz');
    if (!container) {
      console.error("Error: Element with class 'quiz' not found.");
      return null;
    }
    return container;
  }

  shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  createAudioEmoji(word, marginLeft = '10px') {
      const audioEmoji = document.createElement('span');
    audioEmoji.textContent = ' 🔊';
    audioEmoji.className = 'audio-emoji';
    audioEmoji.style.cursor = 'pointer';
    audioEmoji.style.marginLeft = marginLeft;
    audioEmoji.addEventListener('click', (event) => {
      event.stopPropagation();
        (async () => {
          try {
            await ensureAudioLibLoaded();
            if (window.AudioLib && typeof window.AudioLib.play === 'function') {
              window.AudioLib.play(word);
            }
          } catch (e) {
            console.error('Audio library failed to load', e);
          }
        })();
    });
    return audioEmoji;
  }

  cleanWordForInput(word) {
    return word.replace(/\s*\([^)]*\)\s*/g, '').trim();
  }

  normalizeLigatures(text) {
    return text
      .replace(/œ/g, 'oe')
      .replace(/æ/g, 'ae');
  }

  // Compute mistake metric using accent-aware Damerau-Levenshtein
  computeMistakeMetric(userInput, correct) {
    const user = this.normalizeLigatures((userInput || '').toLowerCase());
    const target = this.normalizeLigatures((correct || '').toLowerCase());
    if (user === target) return 0;

    const strip = (s) => this.normalizeLigatures(s)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/ľ|ĺ/g, 'l')
      .replace(/ň/g, 'n')
      .replace(/ŕ/g, 'r')
      .replace(/š/g, 's')
      .replace(/ť/g, 't')
      .replace(/ž/g, 'z')
      .replace(/ď/g, 'd')
      .replace(/č/g, 'c')
      .replace(/ý/g, 'y')
      .replace(/á|ä/g, 'a')
      .replace(/ó|ô/g, 'o');

    const userBase = strip(user);
    const targetBase = strip(target);

    // Accent-only differences cost 1 per position
    let accentDifferences = 0;
    const minLen = Math.min(user.length, target.length);
    for (let i = 0; i < minLen; i++) {
      if (strip(user[i]) === strip(target[i]) && user[i] !== target[i]) {
        accentDifferences++;
      }
    }

    // Damerau-Levenshtein distance (unit cost) on base letters
    const m = userBase.length;
    const n = targetBase.length;
    const dist = Array.from({ length: m + 2 }, () => new Array(n + 2).fill(0));
    const maxDist = m + n;
    dist[0][0] = maxDist;
    for (let i = 0; i <= m; i++) {
      dist[i + 1][1] = i;
      dist[i + 1][0] = maxDist;
    }
    for (let j = 0; j <= n; j++) {
      dist[1][j + 1] = j;
      dist[0][j + 1] = maxDist;
    }
    const lastSeen = {};
    for (let i = 1; i <= m; i++) {
      let db = 0;
      for (let j = 1; j <= n; j++) {
        const i1 = lastSeen[targetBase[j - 1]] || 0;
        const j1 = db;
        const cost = userBase[i - 1] === targetBase[j - 1] ? 0 : 1; // substitution cost 1
        if (cost === 0) db = j;
        // substitution, insertion, deletion
        dist[i + 1][j + 1] = Math.min(
          dist[i][j] + cost,
          dist[i + 1][j] + 1,
          dist[i][j + 1] + 1,
          // transposition
          dist[i1][j1] + (i - i1 - 1) + 1 + (j - j1 - 1)
        );
      }
      lastSeen[userBase[i - 1]] = i;
    }
    const baseOps = dist[m + 1][n + 1];

    // Each base op (insert/delete/substitute/transposition) counts as 2; accents count as 1
    return baseOps * 2 + accentDifferences;
  }

  // Determine dynamic threshold for considering an attempt as "almost"
  getAlmostThreshold(correctLength) {
    if (correctLength <= 3) return 1;
    if (correctLength <= 5) return 2;
    if (correctLength <= 8) return 3;
    return 4;
  }

  cleanup() {
    // Remove all event listeners on the container
    if (this.container) {
      const newContainer = this.container.cloneNode(false);
      this.container.parentNode.replaceChild(newContainer, this.container);
      this.container = newContainer;
    }
  }

  // Matching quiz specific methods
  handleMatchingClick(clickedButton) {
    const word = clickedButton.dataset.word;
    const language = clickedButton.dataset.language;

    if (this.matchingSelections[language] === word) {
      delete this.matchingSelections[language];
      clickedButton.classList.remove('selected');
      this.updateMatchingDisplay();
      return;
    }

    if (this.matchingSelections[language]) {
      const previousButton = document.querySelector(`[data-word="${this.matchingSelections[language]}"][data-language="${language}"]`);
      if (previousButton) {
        previousButton.classList.remove('selected');
      }
    }

    this.matchingSelections[language] = word;
    clickedButton.classList.add('selected');

    if (this.matchingSelections.french && this.matchingSelections.slovak) {
      const frenchWord = this.matchingSelections.french;
      const slovakWord = this.matchingSelections.slovak;

      Object.keys(this.matchingPairs).forEach(key => {
        if (this.matchingPairs[key] === slovakWord || key === frenchWord) {
          delete this.matchingPairs[key];
        }
      });

      this.matchingPairs[frenchWord] = slovakWord;
      delete this.matchingSelections.french;
      delete this.matchingSelections.slovak;

      // Play auto audio when creating a French-Slovak link
      this.playAutoAudio(slovakWord);

      document.querySelectorAll('.matching-word').forEach(button => {
        button.classList.remove('selected');
      });
    }

    this.updateMatchingDisplay();
  }

  updateMatchingDisplay() {
    document.querySelectorAll('.matching-line').forEach(line => line.remove());
    document.querySelectorAll('.matching-word').forEach(button => {
      button.classList.remove('paired');
    });

    Object.keys(this.matchingPairs).forEach(frenchWord => {
      const slovakWord = this.matchingPairs[frenchWord];
      const frenchButton = document.querySelector(`[data-word="${frenchWord}"][data-language="french"]`);
      const slovakButton = document.querySelector(`[data-word="${slovakWord}"][data-language="slovak"]`);

      if (frenchButton && slovakButton) {
        frenchButton.classList.add('paired');
        slovakButton.classList.add('paired');
        this.drawMatchingLine(frenchButton, slovakButton);
      }
    });

    const submitButton = document.querySelector('.submit-button');
    if (submitButton) {
      const totalPairs = Object.keys(this.matchingPairs).length;
      const expectedPairs = this.selectedWordPairs.length;
      submitButton.disabled = totalPairs !== expectedPairs;
    }
  }

  drawMatchingLine(button1, button2, color = '#007bff') {
    const container = this.container.querySelector('.matching-container');
    const rect1 = button1.getBoundingClientRect();
    const rect2 = button2.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    const line = document.createElement('div');
    line.className = 'matching-line';

    const x1 = rect1.right - containerRect.left - 2;
    const y1 = rect1.top + rect1.height / 2 - containerRect.top;
    const x2 = rect2.left - containerRect.left + 2;
    const y2 = rect2.top + rect2.height / 2 - containerRect.top;

    const length = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
    const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;

    line.style.position = 'absolute';
    line.style.left = `${x1}px`;
    line.style.top = `${y1}px`;
    line.style.width = `${length}px`;
    line.style.height = '2px';
    line.style.backgroundColor = color;
    line.style.transformOrigin = '0 0';
    line.style.transform = `rotate(${angle}deg)`;
    line.style.zIndex = '-1';

    container.appendChild(line);
  }

  handleMatchingSubmit() {
    let correctPairs = 0;

    this.selectedWordPairs.forEach(correctPair => {
      const frenchWord = correctPair[0];
      const slovakWord = correctPair[1];
      const userSlovakWord = this.matchingPairs[frenchWord];

      const frenchButton = document.querySelector(`[data-word="${frenchWord}"][data-language="french"]`);
      const slovakButton = document.querySelector(`[data-word="${slovakWord}"][data-language="slovak"]`);
      const userSlovakButton = userSlovakWord ? document.querySelector(`[data-word="${userSlovakWord}"][data-language="slovak"]`) : null;

      const isCorrect = userSlovakWord === slovakWord;

      const wordKey = slovakWord;
      this.results[wordKey].attempts.push({
        direction: 'matching',
        isCorrect: isCorrect,
        timestamp: getLocalTimestamp()
      });

      if (isCorrect) {
        frenchButton.classList.add('state-correct');
        slovakButton.classList.add('state-correct');
        correctPairs++;
      } else {
        frenchButton.classList.add('state-incorrect');
        if (userSlovakButton) {
          userSlovakButton.classList.add('state-incorrect');
        }
        slovakButton.classList.add('state-correct');
      }
    });

    this.totalQuestions = 1;
    this.correctAnswers = correctPairs;

    // Matching quiz is always a single round, regardless of correctness
    console.log('Matching quiz: Completed with', correctPairs, 'out of', this.selectedWordPairs.length, 'correct pairs');
    console.log('Matching quiz: Setting wordQueue to empty (single round only)');
    this.wordQueue = [];

    document.querySelectorAll('.matching-line').forEach(line => line.remove());
    Object.keys(this.matchingPairs).forEach(frenchWord => {
      const slovakWord = this.matchingPairs[frenchWord];
      const frenchButton = document.querySelector(`[data-word="${frenchWord}"][data-language="french"]`);
      const slovakButton = document.querySelector(`[data-word="${slovakWord}"][data-language="slovak"]`);

      if (frenchButton && slovakButton) {
        let lineColor;
        if (frenchButton.classList.contains('state-correct') && slovakButton.classList.contains('state-correct') && !slovakButton.classList.contains('show-correct')) {
          lineColor = '#28a745';
    } else {
          lineColor = '#dc3545';
        }
        this.drawMatchingLine(frenchButton, slovakButton, lineColor);
      }
    });

    // Since matching quiz completes immediately, trigger the completion logic
    console.log('Matching quiz: calling showInlineFeedback with isCorrect:', correctPairs === this.selectedWordPairs.length);
    console.log('Matching quiz: currentQuizTypeIndex:', this.currentQuizTypeIndex, 'enabledQuizTypes:', this.enabledQuizTypes);
    this.showInlineFeedback(null, correctPairs === this.selectedWordPairs.length);
  }

  // Reorder quiz specific methods
  updateReorderDisplay() {
    const wordContainer = this.container.querySelector('.reorder-word-container');
    const lettersContainer = this.container.querySelector('.reorder-letters-container');
    const submitButton = this.container.querySelector('.submit-button');

    if (!wordContainer || !lettersContainer || !submitButton) return;

    wordContainer.innerHTML = '';
    lettersContainer.innerHTML = '';

    this.reorderSelectedLetters.forEach((letter, index) => {
      const letterSlot = document.createElement('button');
      letterSlot.textContent = letter;
      letterSlot.className = 'reorder-letter-slot filled';
      letterSlot.addEventListener('click', () => this.removeLetterFromWord(index));
      wordContainer.appendChild(letterSlot);
    });

    const questionPair = this.wordQueue[0];
    const slovakWord = this.cleanWordForInput(questionPair[1]);
    const remainingSlots = slovakWord.length - this.reorderSelectedLetters.length;

    for (let i = 0; i < remainingSlots; i++) {
      const emptySlot = document.createElement('div');
      emptySlot.className = 'reorder-letter-slot empty';
      wordContainer.appendChild(emptySlot);
    }

    this.reorderAvailableLetters.forEach((letter, index) => {
      const letterButton = document.createElement('button');
      letterButton.textContent = letter;
      letterButton.className = 'btn btn-secondary btn-sm reorder-letter-button';
      letterButton.addEventListener('click', () => this.addLetterToWord(index));
      lettersContainer.appendChild(letterButton);
    });

    submitButton.disabled = this.reorderSelectedLetters.length !== slovakWord.length;
  }

  addLetterToWord(letterIndex) {
    const letter = this.reorderAvailableLetters[letterIndex];
    this.reorderSelectedLetters.push(letter);
    this.reorderAvailableLetters.splice(letterIndex, 1);
    this.updateReorderDisplay();
  }

  removeLetterFromWord(letterIndex) {
    const letter = this.reorderSelectedLetters[letterIndex];
    this.reorderAvailableLetters.push(letter);
    this.reorderSelectedLetters.splice(letterIndex, 1);
    this.updateReorderDisplay();
  }

  // Firebase and data methods
  async analyzeWordPairPerformance(originalWordPairs) {
    try {
      await ensureDataHelpersLoaded();
      await this.initializeFirebase();
      const { ref, get } = await import("https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js");

      if (!this.user) {
        console.log("No user logged in, cannot analyze word pair performance");
        return { analysis: {}, extractedWordPairs: [] };
      }

      const resultsRef = ref(database, `results/${this.user.uid}`);
      const snapshot = await get(resultsRef);

      if (!snapshot.exists()) {
        return { analysis: {}, extractedWordPairs: [] };
      }

      const allResults = snapshot.val();
      const perWord = window.SlovakData.buildPerWordAttempts(allResults);

      // Build extractedWordPairs if not provided
      const extractedWordPairs = [];
      if (!originalWordPairs || originalWordPairs.length === 0) {
        perWord.forEach(node => {
          const pair = [node.wordPair[0], node.wordPair[1]]; // Ensure it's a clean array
          // Attach the most specific set name available from database
          const availableSets = Array.from(node.wordSets);
          // Prefer non-default set names
          const preferredSet = availableSets.find(setName =>
            setName !== 'Slovak Language Quiz' && setName !== 'Unknown Set'
          ) || availableSets[0] || 'Unknown Set';
          pair.wordSetName = preferredSet;
          extractedWordPairs.push(pair);
        });
      }

      return { perWord, extractedWordPairs };
  } catch (error) {
      console.error("Error analyzing word pair performance:", error);
      return { analysis: {}, extractedWordPairs: [] };
    }
  }

  categorizeWordPairs(perWord, filterWordSet = null) {
    const categories = { mastered: [], learning: [], struggling: [], mastering: [], unencountered: [] };
    const thresholds = (window.SlovakData && window.SlovakData.defaultThresholds) ? window.SlovakData.defaultThresholds : { masteredStreak: 4, windowSize: 20, minMastering: 5, masteringRate: 90, minStruggling: 1, strugglingRate: 70 };
    const nowTs = Date.now();
    let considered = 0;
    let masteryOnlyTotal = 0;
    let masteryOnlyCorrectStreaks = 0;

    // Track encountered word pairs for unencountered detection
    const encounteredWordPairs = new Set();

    perWord.forEach(node => {
      if (filterWordSet && !node.wordSets.has(filterWordSet)) {
        return; // skip non-matching sets
      }
      const cat = window.SlovakData.categorizeWordByCriteria(node, nowTs, thresholds, filterWordSet);
      if (!cat) return;

      // Create word pair with preserved set name from database
      const pair = [node.wordPair[0], node.wordPair[1]]; // Ensure it's a clean array
      // Use the most appropriate set name: filtered set if specified, otherwise first available set
      const availableSets = Array.from(node.wordSets);
      pair.wordSetName = filterWordSet || availableSets[0] || 'Unknown Set';

      // Track this word pair as encountered
      const wordPairKey = `${node.wordPair[0]}|${node.wordPair[1]}`;
      encounteredWordPairs.add(wordPairKey);

      categories[cat].push(pair);
      considered++;
      // Track mastery-only attempts for debugging parity with results
      masteryOnlyTotal += node.masteryTyping.length;
      const last4 = node.masteryTyping.filter(a => a.t <= nowTs).slice(-4);
      if (last4.length === 4 && last4.every(a => a.ok)) masteryOnlyCorrectStreaks++;
    });

    // For specific word sets (not global adaptive), find unencountered words
    if (filterWordSet && this.wordPairs && this.wordPairs.length > 0) {
      this.wordPairs.forEach(pair => {
        const wordPairKey = `${pair[0]}|${pair[1]}`;
        if (!encounteredWordPairs.has(wordPairKey)) {
          // This word from the provided set hasn't been encountered yet
          const unencounteredPair = [pair[0], pair[1]];
          unencounteredPair.wordSetName = filterWordSet;
          categories.unencountered.push(unencounteredPair);
        }
      });
    }

    console.log('Adaptive categorizeWordPairs:', {
      filterWordSet,
      considered,
      mastered: categories.mastered.length,
      mastering: categories.mastering.length,
      learning: categories.learning.length,
      struggling: categories.struggling.length,
      unencountered: categories.unencountered.length,
      masteryOnlyTotal,
      masteryOnlyCorrectStreaks
    });
    return categories;
  }

  generateQuizResults(specificQuizType = null) {
  const completionTimestamp = getLocalTimestamp();
  const wordResults = [];
    let totalErrors = 0;

    Object.keys(this.results).forEach(wordKey => {
      const wordData = this.results[wordKey];
    const attempts = wordData.attempts;

    const stats = {
      french_to_slovak: { successes: 0, failures: 0, almosts: 0 },
      slovak_to_french: { successes: 0, failures: 0, almosts: 0 },
      matching: { successes: 0, failures: 0, almosts: 0 }
    };

    let wordErrors = 0;
    attempts.forEach(attempt => {
      if (attempt.isCorrect) {
        stats[attempt.direction].successes++;
      } else if (attempt.isAlmost) {
        stats[attempt.direction].almosts++;
        wordErrors += 0.5; // almost counts as half incorrect for mastery
      } else {
        stats[attempt.direction].failures++;
        wordErrors++;
      }
    });

    totalErrors += wordErrors;

    const normalizedSetName = (window.SlovakData && typeof window.SlovakData.normalizeWordSetName === 'function')
      ? window.SlovakData.normalizeWordSetName(wordData.wordSetName || this.quizName)
      : (wordData.wordSetName || this.quizName);

    // Ensure wordPair is always a clean array in results
    const cleanWordPair = Array.isArray(wordData.wordPair)
      ? [wordData.wordPair[0], wordData.wordPair[1]]
      : [wordData.wordPair[0] || wordData.wordPair['0'], wordData.wordPair[1] || wordData.wordPair['1']];

    wordResults.push({
        word: wordKey,
        wordPair: cleanWordPair,
        wordSetName: normalizedSetName,
        french_to_slovak_successes: stats.french_to_slovak.successes,
        french_to_slovak_failures: stats.french_to_slovak.failures,
      french_to_slovak_almosts: stats.french_to_slovak.almosts,
        slovak_to_french_successes: stats.slovak_to_french.successes,
        slovak_to_french_failures: stats.slovak_to_french.failures,
      slovak_to_french_almosts: stats.slovak_to_french.almosts,
        matching_successes: stats.matching.successes,
      matching_failures: stats.matching.failures,
      matching_almosts: stats.matching.almosts,
        totalAttempts: attempts.length,
        totalErrors: wordErrors
    });
  });

    // Use the specific quiz type passed in, or determine from current state
    let databaseQuizType = specificQuizType || this.getCurrentQuizType();

    // Normalize typing quiz types
    if (databaseQuizType === QuizTypes.SLOVAK_TO_FRENCH_TYPING || databaseQuizType === QuizTypes.FRENCH_TO_SLOVAK_TYPING) {
      databaseQuizType = 'typing';
    }

    console.log('Database quiz type:', databaseQuizType, 'from specificQuizType:', specificQuizType);

    const uniqueId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  return {
      uniqueId: uniqueId,
      completionTimestamp: completionTimestamp,
      totalQuestions: this.totalQuestions,
      wordsCount: this.selectedWordPairs.length,
      quizType: databaseQuizType,
      quizName: this.quizName,
      selectionMode: this.selectionMode || 'all', // all, mastered, learning, struggling
      totalErrors: totalErrors,
      words: wordResults
    };
  }

  async initializeFirebase() {
    if (firebaseApp) return;

    try {
      console.log("Initializing Firebase...");
      const { initializeApp } = await import("https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js");
      const { getDatabase } = await import("https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js");
      const { getAuth } = await import("https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js");

      if (!firebaseApp) {
        firebaseApp = initializeApp(firebaseConfig);
        database = getDatabase(firebaseApp);
        auth = getAuth(firebaseApp);
        console.log("Firebase with Auth initialized successfully");
      }
    } catch (error) {
      console.error("Error initializing Firebase:", error);
      throw error;
    }
  }

  async pushQuizResultsToFirebase(results) {
    if (!this.user) {
      console.log("User not logged in, storing results locally.");
      this.storeResultsLocally(results);
      return;
    }

    try {
      await this.uploadPendingResults();
      await this.initializeFirebase();

      const { ref, set, get } = await import("https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js");

      // Store results under the user's UID
      const resultRef = ref(database, `results/${this.user.uid}/${results.uniqueId}`);

      const checkPromise = get(resultRef);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Network too slow')), 3000)
      );

      const snapshot = await Promise.race([checkPromise, timeoutPromise]);
      if (snapshot.exists()) {
        console.log(`Result ${results.uniqueId} already exists in Firebase for user ${this.user.uid}, skipping duplicate`);
        return;
      }

      const uploadPromise = set(resultRef, results);
      const uploadTimeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Upload failed - network timeout')), 8000)
      );

      await Promise.race([uploadPromise, uploadTimeoutPromise]);
      console.log("Quiz results uploaded to Firebase successfully. ID:", results.uniqueId);

    } catch (error) {
      console.error("Error pushing quiz results to Firebase:", error);
      this.storeResultsLocally(results);
    }
  }

  storeResultsLocally(results) {
    try {
      const existingResults = JSON.parse(localStorage.getItem('pendingQuizResults') || '[]');
      const existingIndex = existingResults.findIndex(result => result.uniqueId === results.uniqueId);

      if (existingIndex !== -1) {
        console.log(`Result with uniqueId ${results.uniqueId} already exists in localStorage, skipping duplicate`);
        return;
      }

      const resultWithTimestamp = {
        ...results,
        localStorageTimestamp: getLocalTimestamp()
      };

      existingResults.push(resultWithTimestamp);
      localStorage.setItem('pendingQuizResults', JSON.stringify(existingResults));
      console.log(`Stored quiz results locally. Total pending: ${existingResults.length}`);
    } catch (error) {
      console.error("Error storing results locally:", error);
    }
  }

  async uploadPendingResults() {
    try {
      const pendingResults = JSON.parse(localStorage.getItem('pendingQuizResults') || '[]');
      if (pendingResults.length === 0) return;

      console.log(`Found ${pendingResults.length} pending results to upload`);
      await this.initializeFirebase();

      const { ref, set, get } = await import("https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js");

      // Check if user is available for upload
      if (!this.user) {
        console.log("User not logged in, cannot upload pending results. Keeping them pending.");
        return;
      }

      let processedCount = 0; // Successfully processed (uploaded OR already exists)
      const failedResults = [];

      for (const result of pendingResults) {
        try {
          const cleanResult = { ...result };
          delete cleanResult.localStorageTimestamp;

          // Use correct Firebase path with user ID (same as pushQuizResultsToFirebase)
          const resultRef = ref(database, `results/${this.user.uid}/${cleanResult.uniqueId}`);

          const checkPromise = get(resultRef);
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Network too slow for pending upload')), 3000)
          );

          const snapshot = await Promise.race([checkPromise, timeoutPromise]);
          if (snapshot.exists()) {
            console.log(`Pending result ${cleanResult.uniqueId} already exists in Firebase for user ${this.user.uid}, removing from pending queue`);
            processedCount++;
            continue; // Don't add to failedResults - this should be removed from pending
          }

          const uploadPromise = set(resultRef, cleanResult);
          const uploadTimeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Pending upload failed - network timeout')), 8000)
          );

          await Promise.race([uploadPromise, uploadTimeoutPromise]);
          console.log(`Uploaded pending result. ID: ${cleanResult.uniqueId} for user ${this.user.uid}`);
          processedCount++;
        } catch (uploadError) {
          console.error("Failed to upload individual pending result:", uploadError);
          failedResults.push(result);
        }
      }

      if (failedResults.length > 0) {
        localStorage.setItem('pendingQuizResults', JSON.stringify(failedResults));
        console.log(`${failedResults.length} results remain pending`);
      } else {
        localStorage.removeItem('pendingQuizResults');
        console.log('All pending results uploaded successfully');
      }

      if (processedCount > 0 && pendingResults.length > 0) {
        console.log(`Successfully processed ${processedCount} pending results (uploaded or already existed)`);
      }
    } catch (error) {
      console.error("Error uploading pending results:", error);
    }
  }

  checkPendingResultsCount() {
    try {
      const pendingResults = JSON.parse(localStorage.getItem('pendingQuizResults') || '[]');
      return pendingResults.length;
    } catch (error) {
      console.error("Error checking pending results:", error);
      return 0;
    }
  }
}

// Global quiz instance
let quiz = null;

// Public API functions for backward compatibility
async function generateQuizExercise(wordPairs, quizName, enabledQuizTypes) {
  quiz = new QuizStateMachine();
  await quiz.initialize(wordPairs, quizName, enabledQuizTypes);
}

async function initializeQuiz(wordPairs, quizName, enabledQuizTypes) {
  await generateQuizExercise(wordPairs, quizName, enabledQuizTypes);
}

async function startAdaptiveQuizFromHistory(quizName = 'Quiz Adaptatif - Historique Complet') {
  quiz = new QuizStateMachine();
  await quiz.initialize(null, quizName, [QuizTypes.SLOVAK_TO_FRENCH_TYPING, QuizTypes.FRENCH_TO_SLOVAK_TYPING]);
}
