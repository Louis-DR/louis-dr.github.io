// Quiz state management
let quizState = {
  selectedWordPairs: [],
  incorrectPairs:    [],
  wordQueue:         [], // FIFO queue for word pairs to avoid immediate repetition
  totalQuestions:    0,
  correctAnswers:    0,
  results:           {}, // Track detailed results for each word pair
  quizType:          'matching', // 'matching', 'multiple_choice', 'reorder_letters', 'slovak_to_french_typing', or 'french_to_slovak_typing'
  originalWordPairs: [], // Store original word pairs for restarting
  isInitialized:     false, // Track if quiz has been started
  quizName:          'Slovak Language Quiz', // Default quiz name
  matchingSelections: {}, // Track matching quiz selections
  matchingPairs:     {}, // Track current matching pairs
  reorderSelectedLetters: [], // Track selected letters for reorder quiz
  reorderAvailableLetters: [], // Track available letters for reorder quiz
  isFirstStart:      false // Track if this is the first quiz start
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

// Firebase app and database - will be initialized when needed
let firebaseApp = null;
let database    = null;

// Note: Using Firebase unique keys to prevent duplicates

// Utility functions to reduce code duplication
function getQuizContainer() {
  const quizContainer = document.querySelector('.quiz');
  if (!quizContainer) {
    console.error("Error: Element with class 'quiz' not found.");
    return null;
  }
  return quizContainer;
}

function shuffleArray(array) {
  const shuffled = [...array];
  for (let arrayIndex = shuffled.length - 1; arrayIndex > 0; arrayIndex--) {
    const randomArrayIndex = Math.floor(Math.random() * (arrayIndex + 1));
    [shuffled[arrayIndex], shuffled[randomArrayIndex]] = [shuffled[randomArrayIndex], shuffled[arrayIndex]];
  }
  return shuffled;
}

function createAudioEmoji(word, marginLeft = '10px') {
  const audioEmoji = document.createElement('span');
  audioEmoji.textContent      = ' 🔊';
  audioEmoji.className        = 'audio-emoji';
  audioEmoji.style.cursor     = 'pointer';
  audioEmoji.style.marginLeft = marginLeft;
  audioEmoji.addEventListener('click', (event) => {
    event.stopPropagation();
    if (typeof playAudio === 'function') {
      playAudio(word);
    }
  });
  return audioEmoji;
}

function createProgressElement(text) {
  const progressElement = document.createElement('p');
  progressElement.textContent = text;
  progressElement.className   = 'progress';
  return progressElement;
}

function drawMatchingLine(button1, button2, color = '#007bff') {
  const container     = getQuizContainer().querySelector('.matching-container');
  const rect1         = button1.getBoundingClientRect();
  const rect2         = button2.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();

  const line = document.createElement('div');
  line.className = 'matching-line';

  const x1 = rect1.right                  - containerRect.left - 2;
  const y1 = rect1.top + rect1.height / 2 - containerRect.top;
  const x2 = rect2.left                   - containerRect.left + 2;
  const y2 = rect2.top + rect2.height / 2 - containerRect.top;

  const length = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  const angle  = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;

  line.style.position        = 'absolute';
  line.style.left            = `${x1}px`;
  line.style.top             = `${y1}px`;
  line.style.width           = `${length}px`;
  line.style.height          = '2px';
  line.style.backgroundColor = color;
  line.style.transformOrigin = '0 0';
  line.style.transform       = `rotate(${angle}deg)`;
  line.style.zIndex          = '-1';

  container.appendChild(line);
}

function initializeQuiz(wordPairs, quizName) {
  // Store original word pairs for the very first initialization
  if (wordPairs) {
    quizState.originalWordPairs = wordPairs;
  }

  // Store quiz name only if explicitly provided (not default parameter)
  if (quizName) {
    quizState.quizName = quizName;
  }

  // If not initialized yet, show start screen
  if (!quizState.isInitialized) {
    showStartScreen();
    return;
  }

  // Determine what type of quiz to start and whether to pick new words
  if (quizState.isFirstStart || !quizState.quizType || quizState.quizType === 'french_to_slovak_typing') {
    // Starting a new sequence with matching and new words
    quizState.quizType = 'matching';
    quizState.isFirstStart = false; // Reset flag

    // Select up to maxWords word pairs for the quiz
    const maxPairs = Math.min(maxWords, quizState.originalWordPairs.length);

    // Randomly select word pairs
    const shuffledPairs = shuffleArray(quizState.originalWordPairs);
    quizState.selectedWordPairs = shuffledPairs.slice(0, maxPairs);
  } else if (quizState.quizType === 'matching') {
    // Moving to multiple choice with same words
    quizState.quizType = 'multiple_choice';
  } else if (quizState.quizType === 'multiple_choice') {
    // Moving from multiple choice to reorder letters
    quizState.quizType = 'reorder_letters';
  } else if (quizState.quizType === 'reorder_letters') {
    // Moving from reorder letters to Slovak to French typing
    quizState.quizType = 'slovak_to_french_typing';
  } else if (quizState.quizType === 'slovak_to_french_typing') {
    // Moving from Slovak to French typing to French to Slovak typing
    quizState.quizType = 'french_to_slovak_typing';
  } else {
    // Moving from French to Slovak typing to new matching sequence
    quizState.quizType = 'french_to_slovak_typing';
    // Keep the same selectedWordPairs from the previous quiz
  }

  // Reset quiz state for the new quiz
  // Create a shuffled queue for word pairs to avoid immediate repetition
  quizState.wordQueue = shuffleArray([...quizState.selectedWordPairs]);
  quizState.incorrectPairs = []; // Keep track for completion checking
  quizState.totalQuestions = 0;
  quizState.correctAnswers = 0;
    quizState.results = {};
  quizState.matchingSelections = {};
  quizState.matchingPairs = {};
  quizState.reorderSelectedLetters = [];
  quizState.reorderAvailableLetters = [];

  // Also reset wordQueue for initialization
  if (!quizState.wordQueue) {
    quizState.wordQueue = [];
  }

  // Initialize results tracking for each word pair
  quizState.selectedWordPairs.forEach(pair => {
    const wordKey = pair[1]; // Use second language as the key
    quizState.results[wordKey] = {
      wordPair: pair,
      attempts: []
    };
  });

  // Start the first question based on quiz type
  if (quizState.quizType === 'matching') {
    generateMatchingQuestion();
  } else if (quizState.quizType === 'multiple_choice') {
    generateNextQuestion();
  } else if (quizState.quizType === 'reorder_letters') {
    generateReorderQuestion();
  } else if (quizState.quizType === 'slovak_to_french_typing') {
    generateTypingQuestion(false); // Slovak to French
  } else if (quizState.quizType === 'french_to_slovak_typing') {
    generateTypingQuestion(true); // French to Slovak
  }
}

function showStartScreen() {
  const quizContainer = getQuizContainer();
  if (!quizContainer) return;

  quizContainer.innerHTML = ''; // Clear previous content

  const startElement = document.createElement('div');
  startElement.className = 'quiz-start';

  // Check for pending results
  const pendingCount = checkPendingResultsCount();
  let pendingNotification = '';
  if (pendingCount > 0) {
    pendingNotification = `<p style="color: #856404; font-size: 14px; margin-bottom: 15px; background-color: #fff3cd; padding: 10px; border-radius: 4px; border: 1px solid #ffeaa7;">⚠️ ${pendingCount} résultat(s) en attente seront envoyés lors du démarrage.</p>`;
  }

  startElement.innerHTML = `
    ${pendingNotification}
    <button class="btn btn-success btn-lg start-button" id="start-quiz-button">Commencer le Quiz "${quizState.quizName}"</button>
  `;

  quizContainer.appendChild(startElement);

  // Add event listener for the start button
  setTimeout(() => {
    const startButton = document.getElementById('start-quiz-button');
    if (startButton) {
      startButton.addEventListener('click', startQuiz);
    }
  }, 0);
}

async function startQuiz() {
  quizState.isInitialized = true;
  // Mark this as first quiz start to avoid transition logic
  quizState.isFirstStart = true;

  // Try to upload any pending results when starting the quiz
  try {
    await uploadPendingResults();
  } catch (error) {
    console.error("Error uploading pending results on quiz start:", error);
  }

  initializeQuiz();
}

function generateMatchingQuestion() {
  // Get the quiz container element
  const quizContainer = getQuizContainer();
  if (!quizContainer) return;

  quizContainer.innerHTML = ''; // Clear previous content

  // Add progress indicator
  const progressElement = createProgressElement(`Progrès: Correspondances`);
  quizContainer.appendChild(progressElement);

  // Create instruction
  const instructionElement = document.createElement('p');
  instructionElement.textContent = 'Associez les mots français aux mots slovaques';
  instructionElement.className   = 'instruction';
  quizContainer.appendChild(instructionElement);

  // Create matching container
  const matchingContainer = document.createElement('div');
  matchingContainer.className = 'matching-container';
  quizContainer.appendChild(matchingContainer);

  // Create left column (French)
  const leftColumn = document.createElement('div');
  leftColumn.className = 'matching-column left-column';

  // Create right column (Slovak)
  const rightColumn = document.createElement('div');
  rightColumn.className = 'matching-column right-column';

  // Shuffle the words for each column
  const frenchWords = quizState.selectedWordPairs.map(pair => pair[0]);
  const slovakWords = quizState.selectedWordPairs.map(pair => pair[1]);

  const shuffledFrenchWords = shuffleArray(frenchWords);
  const shuffledSlovakWords = shuffleArray(slovakWords);

  // Create French word buttons
  shuffledFrenchWords.forEach((word, wordIndex) => {
    const wordButton = document.createElement('button');
    wordButton.textContent = word;
    wordButton.className   = 'matching-word french-word';
    wordButton.dataset.word = word;
    wordButton.dataset.language = 'french';
    wordButton.addEventListener('click', () => handleMatchingClick(wordButton));
    leftColumn.appendChild(wordButton);
  });

  // Create Slovak word buttons
  shuffledSlovakWords.forEach((word, wordIndex) => {
    const wordButton = document.createElement('button');
    wordButton.textContent = word;
    wordButton.className   = 'matching-word slovak-word';
    wordButton.dataset.word = word;
    wordButton.dataset.language = 'slovak';
    wordButton.addEventListener('click', () => handleMatchingClick(wordButton));

    // Add audio emoji for Slovak words
    const audioEmoji = createAudioEmoji(word);
    wordButton.appendChild(audioEmoji);

    rightColumn.appendChild(wordButton);
  });

  matchingContainer.appendChild(leftColumn);
  matchingContainer.appendChild(rightColumn);

  // Create submit button (initially disabled)
  const submitButton = document.createElement('button');
  submitButton.textContent = 'Soumettre';
  submitButton.className   = 'btn btn-primary submit-button';
  submitButton.disabled    = true;
  submitButton.addEventListener('click', handleMatchingSubmit);
  quizContainer.appendChild(submitButton);

  quizState.totalQuestions = 1; // Matching is one comprehensive question
}

function handleMatchingClick(clickedButton) {
  const word = clickedButton.dataset.word;
  const language = clickedButton.dataset.language;

  // If this word is already selected, deselect it
  if (quizState.matchingSelections[language] === word) {
    delete quizState.matchingSelections[language];
    clickedButton.classList.remove('selected');
    updateMatchingDisplay();
    return;
  }

  // Clear previous selection in this language
  if (quizState.matchingSelections[language]) {
    const previousButton = document.querySelector(`[data-word="${quizState.matchingSelections[language]}"][data-language="${language}"]`);
    if (previousButton) {
      previousButton.classList.remove('selected');
    }
  }

  // Set new selection
  quizState.matchingSelections[language] = word;
  clickedButton.classList.add('selected');

  // If we have selections from both languages, create a pair
  if (quizState.matchingSelections.french && quizState.matchingSelections.slovak) {
    const frenchWord = quizState.matchingSelections.french;
    const slovakWord = quizState.matchingSelections.slovak;

    // Remove any existing pairs involving these words
    Object.keys(quizState.matchingPairs).forEach(key => {
      if (quizState.matchingPairs[key] === slovakWord) {
        delete quizState.matchingPairs[key];
      }
    });
    Object.keys(quizState.matchingPairs).forEach(key => {
      if (key === frenchWord) {
        delete quizState.matchingPairs[key];
      }
    });

    // Create new pair
    quizState.matchingPairs[frenchWord] = slovakWord;

    // Clear selections
    delete quizState.matchingSelections.french;
    delete quizState.matchingSelections.slovak;

    // Remove selected class from all buttons
    document.querySelectorAll('.matching-word').forEach(button => {
      button.classList.remove('selected');
    });
  }

  updateMatchingDisplay();
}

function updateMatchingDisplay() {
  // Remove existing lines
  document.querySelectorAll('.matching-line').forEach(line => line.remove());

  // Remove paired class from all buttons
  document.querySelectorAll('.matching-word').forEach(button => {
    button.classList.remove('paired');
  });

  // Add paired class and draw lines for current pairs
  Object.keys(quizState.matchingPairs).forEach(frenchWord => {
    const slovakWord = quizState.matchingPairs[frenchWord];

    const frenchButton = document.querySelector(`[data-word="${frenchWord}"][data-language="french"]`);
    const slovakButton = document.querySelector(`[data-word="${slovakWord}"][data-language="slovak"]`);

    if (frenchButton && slovakButton) {
      frenchButton.classList.add('paired');
      slovakButton.classList.add('paired');

      // Draw line between them
      drawMatchingLine(frenchButton, slovakButton);
    }
  });

  // Enable submit button if all words are paired
  const submitButton = document.querySelector('.submit-button');
  if (submitButton) {
    const totalPairs = Object.keys(quizState.matchingPairs).length;
    const expectedPairs = quizState.selectedWordPairs.length;
    submitButton.disabled = totalPairs !== expectedPairs;
  }
}

function handleMatchingSubmit() {
  let correctPairs = 0;
  let totalErrors  = 0;

  // Disable submit button
  const submitButton = document.querySelector('.submit-button');
  if (submitButton) {
    submitButton.disabled = true;
  }

  // Check each pair and mark as correct or incorrect
  quizState.selectedWordPairs.forEach(correctPair => {
    const frenchWord = correctPair[0];
    const slovakWord = correctPair[1];
    const userSlovakWord = quizState.matchingPairs[frenchWord];

    const frenchButton = document.querySelector(`[data-word="${frenchWord}"][data-language="french"]`);
    const slovakButton = document.querySelector(`[data-word="${slovakWord}"][data-language="slovak"]`);
    const userSlovakButton = userSlovakWord ? document.querySelector(`[data-word="${userSlovakWord}"][data-language="slovak"]`) : null;

    // Record the attempt in results
    const wordKey = slovakWord; // Use second language as the key
    const isCorrect = userSlovakWord === slovakWord;

    quizState.results[wordKey].attempts.push({
      direction: 'matching',
      isCorrect: isCorrect,
      timestamp: new Date().toISOString()
    });

    if (isCorrect) {
      // Mark as correct
      frenchButton.classList.add('state-correct');
      slovakButton.classList.add('state-correct');
      correctPairs++;
      console.log(`correct: ${frenchWord} - ${slovakWord}`);
    } else {
      // Mark as incorrect
      frenchButton.classList.add('state-incorrect');
      if (userSlovakButton) {
        userSlovakButton.classList.add('state-incorrect');
      }

      // Show the correct answer
      slovakButton.classList.add('state-correct');

      totalErrors++;
      console.log(`incorrect: ${frenchWord} - ${userSlovakWord || 'none'}, correct: ${slovakWord}`);
    }
  });

  // Update quiz state based on matching results
  if (correctPairs === quizState.selectedWordPairs.length) {
    // All correct - clear the word queue (all words mastered)
    quizState.wordQueue = [];
    quizState.correctAnswers = quizState.selectedWordPairs.length;
  } else {
    // Some incorrect - shuffle the queue for the next quiz types
    // Correct pairs are removed, incorrect pairs go to the back
    const correctWordPairs = [];
    const incorrectWordPairs = [];

    quizState.selectedWordPairs.forEach(correctPair => {
      const frenchWord = correctPair[0];
      const slovakWord = correctPair[1];
      const userSlovakWord = quizState.matchingPairs[frenchWord];

      if (userSlovakWord === slovakWord) {
        correctWordPairs.push(correctPair);
      } else {
        incorrectWordPairs.push(correctPair);
      }
    });

    // Start with a shuffled list of incorrect pairs for the next quiz type
    quizState.wordQueue = shuffleArray(incorrectWordPairs);
    quizState.correctAnswers = correctWordPairs.length;

    // Track incorrect pairs
    quizState.incorrectPairs = incorrectWordPairs;
  }

  // Update line colors
  document.querySelectorAll('.matching-line').forEach(line => line.remove());
  Object.keys(quizState.matchingPairs).forEach(frenchWord => {
    const slovakWord   = quizState.matchingPairs[frenchWord];
    const frenchButton = document.querySelector(`[data-word="${frenchWord}"][data-language="french"]`);
    const slovakButton = document.querySelector(`[data-word="${slovakWord}"][data-language="slovak"]`);

    if (frenchButton && slovakButton) {
      // Determine line color based on correctness
      let lineColor;
      if (frenchButton.classList.contains('state-correct') && slovakButton.classList.contains('state-correct') && !slovakButton.classList.contains('show-correct')) {
        lineColor = '#28a745'; // Green for correct
      } else {
        lineColor = '#dc3545'; // Red for incorrect
      }
      drawMatchingLine(frenchButton, slovakButton, lineColor);
    }
  });

  // Show the next button
  setTimeout(() => {
    showNextButton();
  }, 1000);
}

function generateNextQuestion() {
  // Check if there are any words left in the queue
  if (quizState.wordQueue.length === 0) {
    showQuizCompletion();
    return;
  }

  // Take the first word pair from the queue (FIFO)
  const questionPair = quizState.wordQueue[0];

  // Decide randomly which language is the question and which is the answer
  const isFrenchQuestion = Math.random() < 0.5;
  const questionText     = isFrenchQuestion ? questionPair[0] : questionPair[1];
  const correctAnswer    = isFrenchQuestion ? questionPair[1] : questionPair[0];

  // Generate incorrect answers from all selected word pairs (not just incorrect ones)
  const incorrectAnswers = [];
  while (incorrectAnswers.length < 3) {
    const randomIndex = Math.floor(Math.random() * quizState.selectedWordPairs.length);
    const randomPair  = quizState.selectedWordPairs[randomIndex];
    const potentialIncorrectAnswer = isFrenchQuestion ? randomPair[1] : randomPair[0];

    // Ensure the incorrect answer is not the correct answer and is not already picked
    if (potentialIncorrectAnswer !== correctAnswer && !incorrectAnswers.includes(potentialIncorrectAnswer)) {
      incorrectAnswers.push(potentialIncorrectAnswer);
    }
  }

  // Combine correct and incorrect answers and shuffle them
  const allChoices = shuffleArray([correctAnswer, ...incorrectAnswers]);

  // Get the quiz container element
  const quizContainer = getQuizContainer();
  if (!quizContainer) return;

  quizContainer.innerHTML = ''; // Clear previous content

  // Add progress indicator
  const progressElement = createProgressElement(`Progrès: ${quizState.correctAnswers}/${quizState.selectedWordPairs.length} mots maîtrisés`);
  quizContainer.appendChild(progressElement);

  // Create the HTML for the question and choices
  const questionElement = document.createElement('p');
  questionElement.textContent = questionText;
  questionElement.className   = 'question';

  // Add audio emoji for Slovak words in the question
  if (!isFrenchQuestion) { // Slovak is the question
    const audioEmoji = createAudioEmoji(questionText);
    questionElement.appendChild(audioEmoji);
  }

  quizContainer.appendChild(questionElement);

  const choicesContainer = document.createElement('div');
  choicesContainer.className = 'choices';
  quizContainer.appendChild(choicesContainer);

  const choiceButtons = [];

  allChoices.forEach(choice => {
    const button = document.createElement('button');
    button.textContent = choice;
    button.className   = 'btn btn-outline btn-block choice-button';
    button.addEventListener('click', () => handleAnswerClick(button, choice, correctAnswer, choiceButtons, questionPair, isFrenchQuestion));
    choiceButtons.push(button);
    choicesContainer.appendChild(button);
  });

  quizState.totalQuestions++;
}

function generateTypingQuestion(forceFrenchQuestion = null) {
  // Check if there are any words left in the queue
  if (quizState.wordQueue.length === 0) {
    showQuizCompletion();
    return;
  }

  // Take the first word pair from the queue (FIFO)
  const questionPair = quizState.wordQueue[0];

  // Use forced direction if provided, otherwise decide randomly
  const isFrenchQuestion = forceFrenchQuestion !== null ? forceFrenchQuestion : Math.random() < 0.5;
  const questionText     = isFrenchQuestion ? questionPair[0] : questionPair[1];
  const correctAnswer    = isFrenchQuestion ? questionPair[1] : questionPair[0];

  // Get the quiz container element
  const quizContainer = getQuizContainer();
  if (!quizContainer) return;

  quizContainer.innerHTML = ''; // Clear previous content

  // Add progress indicator with typing direction
  let directionText = '';
  if (quizState.quizType === 'slovak_to_french_typing') {
    directionText = ' (SK→FR)';
  } else if (quizState.quizType === 'french_to_slovak_typing') {
    directionText = ' (FR→SK)';
  }
  const progressElement = createProgressElement(`Progrès: ${quizState.correctAnswers}/${quizState.selectedWordPairs.length} mots maîtrisés${directionText}`);
  quizContainer.appendChild(progressElement);

  // Create the HTML for the question
  const questionElement = document.createElement('p');
  questionElement.textContent = questionText;
  questionElement.className   = 'question';

  // Add audio emoji for Slovak words in the question
  if (!isFrenchQuestion) { // Slovak is the question
    const audioEmoji = createAudioEmoji(questionText);
    questionElement.appendChild(audioEmoji);
  }

  quizContainer.appendChild(questionElement);

  // Create input field and submit button
  const inputContainer = document.createElement('div');
  inputContainer.className = 'typing-container';

  const inputField = document.createElement('input');
  inputField.type         = 'text';
  inputField.className    = 'form-input typing-input';
  inputField.placeholder  = 'Type your answer here...';
  inputField.autocomplete = 'off';

  // Create special characters container
  const specialCharsContainer = document.createElement('div');
  specialCharsContainer.className = 'special-chars-container';

  const specialChars = ['á', 'ä', 'č', 'ď', 'dž', 'é', 'í', 'ĺ', 'ľ', 'ň', 'ó', 'ô', 'ŕ', 'š', 'ť', 'ú', 'ý', 'ž'];

  specialChars.forEach(char => {
    const charButton = document.createElement('button');
    charButton.type        = 'button';
    charButton.textContent = char;
    charButton.className   = 'btn btn-secondary btn-sm special-char-button';
    charButton.addEventListener('click', () => {
      // Insert character at cursor position
      const cursorPosition = inputField.selectionStart;
      const textBefore = inputField.value.substring(0, cursorPosition);
      const textAfter = inputField.value.substring(inputField.selectionEnd);
      inputField.value = textBefore + char + textAfter;

      // Move cursor after inserted character
      const newCursorPosition = cursorPosition + char.length;
      inputField.focus();
      inputField.setSelectionRange(newCursorPosition, newCursorPosition);
    });
    specialCharsContainer.appendChild(charButton);
  });

  const submitButton = document.createElement('button');
  submitButton.textContent = 'Soumettre';
  submitButton.className   = 'btn btn-primary submit-button';
  submitButton.addEventListener('click', () => handleTypingSubmit(inputField, correctAnswer, questionPair, isFrenchQuestion));

  // Allow Enter key to submit
  inputField.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
      handleTypingSubmit(inputField, correctAnswer, questionPair, isFrenchQuestion);
    }
  });

  inputContainer.appendChild(inputField);
  inputContainer.appendChild(specialCharsContainer);
  inputContainer.appendChild(submitButton);
  quizContainer.appendChild(inputContainer);

  // Focus on input field
  inputField.focus();

  quizState.totalQuestions++;
}

function generateReorderQuestion() {
  // Check if there are any words left in the queue
  if (quizState.wordQueue.length === 0) {
    showQuizCompletion();
    return;
  }

  // Take the first word pair from the queue (FIFO)
  const questionPair = quizState.wordQueue[0];

  // Always French to Slovak for reorder quiz
  const frenchWord = questionPair[0];
  const slovakWord = questionPair[1];

  // Split Slovak word into letters
  const correctLetters = slovakWord.split('');

    // Add some random letters to make it challenging
  // More regular alphabet letters, fewer special Slovak characters for better balance
  const regularLetters = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z'];
  const slovakSpecialLetters = ['á', 'ä', 'č', 'ď', 'é', 'í', 'ĺ', 'ľ', 'ň', 'ó', 'ô', 'ŕ', 'š', 'ť', 'ú', 'ý', 'ž'];

  const randomLetters = [];

  // Add 3-5 random letters that are not in the correct word
  const numRandomLetters = Math.min(5, Math.max(3, Math.floor(correctLetters.length * 0.8)));
  while (randomLetters.length < numRandomLetters) {
    // 70% chance for regular letters, 30% chance for Slovak special letters
    const useSpecialLetter = Math.random() < 0.3;
    const letterPool = useSpecialLetter ? slovakSpecialLetters : regularLetters;
    const randomLetter = letterPool[Math.floor(Math.random() * letterPool.length)];

    if (!correctLetters.includes(randomLetter) && !randomLetters.includes(randomLetter)) {
      randomLetters.push(randomLetter);
    }
  }

  // Combine and shuffle all available letters
  const allLetters = [...correctLetters, ...randomLetters];
  quizState.reorderAvailableLetters = shuffleArray(allLetters);
  quizState.reorderSelectedLetters = [];

  // Get the quiz container element
  const quizContainer = getQuizContainer();
  if (!quizContainer) return;

  quizContainer.innerHTML = ''; // Clear previous content

  // Add progress indicator
  const progressElement = createProgressElement(`Progrès: ${quizState.correctAnswers}/${quizState.selectedWordPairs.length} mots maîtrisés (Réorganiser)`);
  quizContainer.appendChild(progressElement);

  // Create the HTML for the French question
  const questionElement = document.createElement('p');
  questionElement.textContent = frenchWord;
  questionElement.className = 'question';
  quizContainer.appendChild(questionElement);

  // Create instruction
  const instructionElement = document.createElement('p');
  instructionElement.textContent = 'Cliquez sur les lettres pour former le mot slovaque';
  instructionElement.className = 'instruction';
  quizContainer.appendChild(instructionElement);

  // Create container for the word being built
  const wordContainer = document.createElement('div');
  wordContainer.className = 'reorder-word-container';
  quizContainer.appendChild(wordContainer);

  // Create container for available letters
  const lettersContainer = document.createElement('div');
  lettersContainer.className = 'reorder-letters-container';
  quizContainer.appendChild(lettersContainer);

  // Create submit button (initially disabled)
  const submitButton = document.createElement('button');
  submitButton.textContent = 'Vérifier';
  submitButton.className = 'btn btn-primary submit-button';
  submitButton.disabled = true;
  submitButton.addEventListener('click', () => handleReorderSubmit(slovakWord, questionPair));
  quizContainer.appendChild(submitButton);

  // Initialize the display
  updateReorderDisplay();

  quizState.totalQuestions++;
}

function updateReorderDisplay() {
  const wordContainer = document.querySelector('.reorder-word-container');
  const lettersContainer = document.querySelector('.reorder-letters-container');
  const submitButton = document.querySelector('.submit-button');

  if (!wordContainer || !lettersContainer || !submitButton) return;

  // Clear containers
  wordContainer.innerHTML = '';
  lettersContainer.innerHTML = '';

  // Create slots for the selected letters
  quizState.reorderSelectedLetters.forEach((letter, index) => {
    const letterSlot = document.createElement('button');
    letterSlot.textContent = letter;
    letterSlot.className = 'reorder-letter-slot filled';
    letterSlot.addEventListener('click', () => removeLetterFromWord(index));
    wordContainer.appendChild(letterSlot);
  });

  // Create empty slots for remaining letters (based on correct word length)
  const questionPair = quizState.wordQueue[0];
  const slovakWord = questionPair[1];
  const remainingSlots = slovakWord.length - quizState.reorderSelectedLetters.length;

  for (let slotIndex = 0; slotIndex < remainingSlots; slotIndex++) {
    const emptySlot = document.createElement('div');
    emptySlot.className = 'reorder-letter-slot empty';
    wordContainer.appendChild(emptySlot);
  }

  // Create buttons for available letters
  quizState.reorderAvailableLetters.forEach((letter, index) => {
    const letterButton = document.createElement('button');
    letterButton.textContent = letter;
    letterButton.className = 'btn btn-secondary btn-sm reorder-letter-button';
    letterButton.addEventListener('click', () => addLetterToWord(index));
    lettersContainer.appendChild(letterButton);
  });

  // Enable submit button only if word is complete
  submitButton.disabled = quizState.reorderSelectedLetters.length !== slovakWord.length;
}

function addLetterToWord(letterIndex) {
  const letter = quizState.reorderAvailableLetters[letterIndex];

  // Move letter from available to selected
  quizState.reorderSelectedLetters.push(letter);
  quizState.reorderAvailableLetters.splice(letterIndex, 1);

  updateReorderDisplay();
}

function removeLetterFromWord(letterIndex) {
  const letter = quizState.reorderSelectedLetters[letterIndex];

  // Move letter from selected back to available
  quizState.reorderAvailableLetters.push(letter);
  quizState.reorderSelectedLetters.splice(letterIndex, 1);

  updateReorderDisplay();
}

function handleReorderSubmit(correctAnswer, questionPair) {
  const userAnswer = quizState.reorderSelectedLetters.join('');
  const isCorrect = userAnswer.toLowerCase() === correctAnswer.toLowerCase();

  // Disable submit button
  const submitButton = document.querySelector('.submit-button');
  if (submitButton) {
    submitButton.disabled = true;
  }

  // Disable all letter buttons
  document.querySelectorAll('.reorder-letter-button, .reorder-letter-slot.filled').forEach(button => {
    button.disabled = true;
  });

  // Show feedback
  const quizContainer = getQuizContainer();
  const feedbackElement = document.createElement('div');
  feedbackElement.className = 'feedback reorder-feedback';

  if (isCorrect) {
    feedbackElement.innerHTML = `<span class="feedback-success">✓ Correct!</span>`;

    // Highlight correct letters
    document.querySelectorAll('.reorder-letter-slot.filled').forEach(slot => {
      slot.classList.add('state-correct');
    });
  } else {
    feedbackElement.innerHTML = `
      <span class="feedback-error">✗ Incorrect</span><br>
      <span class="feedback-info">Réponse correcte: "${correctAnswer}"</span>
    `;

    // Highlight incorrect letters
    document.querySelectorAll('.reorder-letter-slot.filled').forEach(slot => {
      slot.classList.add('state-incorrect');
    });

    // Add audio emoji for Slovak correct answer
    const audioEmoji = createAudioEmoji(correctAnswer);
    feedbackElement.querySelector('.feedback-info').appendChild(audioEmoji);
  }

  quizContainer.appendChild(feedbackElement);

  // Record the attempt in results
  const wordKey = questionPair[1]; // Use Slovak word as the key
  quizState.results[wordKey].attempts.push({
    direction: 'french_to_slovak',
    isCorrect: isCorrect,
    timestamp: new Date().toISOString()
  });

  // Check if the answer is correct
  if (isCorrect) {
    console.log("correct");

    // Remove the word pair from the front of the queue (answered correctly)
    quizState.wordQueue.shift();
    quizState.correctAnswers++;
  } else {
    console.log("incorrect");

    // Move the word pair from front to back of queue (incorrect, will be asked again later)
    const incorrectPair = quizState.wordQueue.shift();
    quizState.wordQueue.push(incorrectPair);

    // Add to incorrect pairs for tracking purposes
    const isInIncorrectPairs = quizState.incorrectPairs.some(pair =>
      (pair[0] === questionPair[0] && pair[1] === questionPair[1]) ||
      (pair[0] === questionPair[1] && pair[1] === questionPair[0])
    );

    if (!isInIncorrectPairs) {
      quizState.incorrectPairs.push(questionPair);
    }
  }

  // Show the next button
  showNextButton();
}

function handleAnswerClick(clickedButton, selectedAnswer, correctAnswer, allButtons, questionPair, isFrenchQuestion) {
  // Disable all buttons to prevent multiple selections
  allButtons.forEach(button => {
    button.disabled = true;
  });

  // Highlight the correct answer in green
  allButtons.forEach(button => {
    if (button.textContent === correctAnswer) {
      button.classList.add('state-correct');

      // Add audio emoji for Slovak correct answers
      if (isFrenchQuestion) { // Correct answer is Slovak
        const audioEmoji = createAudioEmoji(correctAnswer);
        button.appendChild(audioEmoji);
      }
    }
  });

  // Record the attempt in results
  const wordKey = questionPair[1]; // Use second language as the key
  const isCorrect = selectedAnswer === correctAnswer;
  const direction = isFrenchQuestion ? 'french_to_slovak' : 'slovak_to_french';

  quizState.results[wordKey].attempts.push({
    direction: direction,
    isCorrect: isCorrect,
    timestamp: new Date().toISOString()
  });

  // Check if the answer is correct
  if (isCorrect) {
    console.log("correct");

    // Remove the word pair from the front of the queue (answered correctly)
    quizState.wordQueue.shift();
    quizState.correctAnswers++;
  } else {
    // If the clicked answer is wrong, highlight it in red
    clickedButton.classList.add('state-incorrect');
    console.log("incorrect");

    // Move the word pair from front to back of queue (incorrect, will be asked again later)
    const incorrectPair = quizState.wordQueue.shift();
    quizState.wordQueue.push(incorrectPair);

    // Add to incorrect pairs for tracking purposes
    const isInIncorrectPairs = quizState.incorrectPairs.some(pair =>
      (pair[0] === questionPair[0] && pair[1] === questionPair[1]) ||
      (pair[0] === questionPair[1] && pair[1] === questionPair[0])
    );

    if (!isInIncorrectPairs) {
      quizState.incorrectPairs.push(questionPair);
    }
  }

  // Show the next button
  showNextButton();
}

function handleTypingSubmit(inputField, correctAnswer, questionPair, isFrenchQuestion) {
  const userAnswer = inputField.value.trim();
  const isCorrect = userAnswer.toLowerCase() === correctAnswer.toLowerCase(); // Case-insensitive comparison
  const direction = isFrenchQuestion ? 'french_to_slovak' : 'slovak_to_french';

  // Disable input and submit button
  inputField.disabled = true;
  const submitButton = inputField.nextElementSibling;
  if (submitButton && submitButton.classList.contains('submit-button')) {
    submitButton.disabled = true;
  }

  // Show feedback
  const quizContainer = getQuizContainer();
  const feedbackElement = document.createElement('div');
  feedbackElement.className = 'feedback typing-feedback';

  if (isCorrect) {
    feedbackElement.innerHTML = `<span class="feedback-success correct-feedback">✓ Correct!</span>`;
    inputField.classList.add('state-correct');
  } else {
    feedbackElement.innerHTML = `
      <span class="feedback-error wrong-feedback">✗ Incorrect</span><br>
      <span class="feedback-info correct-answer-display">Réponse correcte: "${correctAnswer}"</span>
    `;
    inputField.classList.add('state-incorrect');

    // Add audio emoji for Slovak correct answers
    if (isFrenchQuestion) { // Correct answer is Slovak
      const audioEmoji = createAudioEmoji(correctAnswer);
      feedbackElement.querySelector('.correct-answer-display').appendChild(audioEmoji);
    }
  }

  quizContainer.appendChild(feedbackElement);

  // Record the attempt in results
  const wordKey = questionPair[1]; // Use second language as the key
  quizState.results[wordKey].attempts.push({
    direction: direction,
    isCorrect: isCorrect,
    timestamp: new Date().toISOString()
  });

  // Check if the answer is correct
  if (isCorrect) {
    console.log("correct");

    // Remove the word pair from the front of the queue (answered correctly)
    quizState.wordQueue.shift();
    quizState.correctAnswers++;
  } else {
    console.log("incorrect");

    // Move the word pair from front to back of queue (incorrect, will be asked again later)
    const incorrectPair = quizState.wordQueue.shift();
    quizState.wordQueue.push(incorrectPair);

    // Add to incorrect pairs for tracking purposes
    const isInIncorrectPairs = quizState.incorrectPairs.some(pair =>
      (pair[0] === questionPair[0] && pair[1] === questionPair[1]) ||
      (pair[0] === questionPair[1] && pair[1] === questionPair[0])
    );

    if (!isInIncorrectPairs) {
      quizState.incorrectPairs.push(questionPair);
    }
  }

  // Show the next button
  showNextButton();
}

function showNextButton() {
  const quizContainer = getQuizContainer();
  if (!quizContainer) return;

  // Remove existing next button if any
  const existingNextButton = quizContainer.querySelector('.next-button');
  if (existingNextButton) {
    existingNextButton.remove();
  }

  const nextButton = document.createElement('button');
  nextButton.textContent = 'Suivant';
  nextButton.className   = 'btn btn-primary next-button';
  nextButton.addEventListener('click', () => {
    // Check if current quiz type should continue or transition
    if (quizState.wordQueue.length > 0) {
      // Continue with current quiz type until all words are mastered
      if (quizState.quizType === 'multiple_choice') {
        generateNextQuestion();
      } else if (quizState.quizType === 'reorder_letters') {
        generateReorderQuestion();
      } else if (quizState.quizType === 'slovak_to_french_typing') {
        generateTypingQuestion(false); // Slovak to French
      } else if (quizState.quizType === 'french_to_slovak_typing') {
        generateTypingQuestion(true); // French to Slovak
      } else {
        // Matching is always one question, so show completion (which will upload to DB)
        showQuizCompletion();
      }
    } else {
      // All words mastered, show completion screen (which uploads to database)
      showQuizCompletion();
    }
  });

  quizContainer.appendChild(nextButton);
}

async function showQuizCompletion() {
  const quizContainer = getQuizContainer();
  if (!quizContainer) return;

  quizContainer.innerHTML = '';

  // Generate and print results
  const results = generateQuizResults();
  console.log('Quiz Results:', results);

  // Push results to Firebase
  await pushQuizResultsToFirebase(results);

  const completionElement = document.createElement('div');
  completionElement.className = 'quiz-completion';

  // Determine next quiz type display
  let nextQuizTypeDisplay;
  if (quizState.quizType === 'matching') {
    nextQuizTypeDisplay = 'Choix Multiple';
  } else if (quizState.quizType === 'multiple_choice') {
    nextQuizTypeDisplay = 'Réorganiser Lettres';
  } else if (quizState.quizType === 'reorder_letters') {
    nextQuizTypeDisplay = 'Saisie SK→FR';
  } else if (quizState.quizType === 'slovak_to_french_typing') {
    nextQuizTypeDisplay = 'Saisie FR→SK';
  } else {
    nextQuizTypeDisplay = 'Correspondances';
  }

  completionElement.innerHTML = `
    <p>Questions Répondues: <strong>${quizState.totalQuestions}</strong></p>
    <p>Prochain Quiz: <strong>${nextQuizTypeDisplay}</strong></p>
    <button class="btn btn-primary next-button" id="restart-quiz-button">Commencer</button>
  `;

  // Add event listener for the restart button
  setTimeout(() => {
    const restartButton = document.getElementById('restart-quiz-button');
    if (restartButton) {
      restartButton.addEventListener('click', restartQuiz);
    }
  }, 0);

  quizContainer.appendChild(completionElement);

  console.log(`Quiz completed! Total questions: ${quizState.totalQuestions}, Words mastered: ${quizState.correctAnswers}`);

  // Clear results after completion
  clearQuizResults();
}

async function initializeFirebase() {
  if (firebaseApp) {
    return; // Already initialized
  }

  try {
    // Dynamic imports with timeout to avoid hanging on slow networks
    const importPromise = (async () => {
      const { initializeApp } = await import("https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js");
      const { getDatabase }   = await import("https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js");
      return { initializeApp, getDatabase };
    })();

    const importTimeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Firebase import timeout')), 5000)
    );

    const { initializeApp, getDatabase } = await Promise.race([importPromise, importTimeoutPromise]);

    // Initialize Firebase app and database
    firebaseApp = initializeApp(firebaseConfig);
    database    = getDatabase(firebaseApp);

    console.log("Firebase initialized successfully");
  } catch (error) {
    console.error("Error initializing Firebase:", error);
    throw error;
  }
}

async function pushQuizResultsToFirebase(results) {
  try {
    // Try to upload any pending results from localStorage first
    await uploadPendingResults();

    // Initialize Firebase if not already done
    await initializeFirebase();

    // Dynamic import for database functions
    const { ref, set, get } = await import("https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js");

    // Use the uniqueId as the Firebase key to prevent duplicates
    const resultRef = ref(database, `results/${results.uniqueId}`);

    // Quick existence check with short timeout - if this fails, network is too bad
    const checkPromise = get(resultRef);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Network too slow')), 3000)
    );

    const snapshot = await Promise.race([checkPromise, timeoutPromise]);
    if (snapshot.exists()) {
      console.log(`Result ${results.uniqueId} already exists in Firebase, skipping duplicate`);
      return;
    }

    // Upload using set() with the unique key - with timeout
    const uploadPromise = set(resultRef, results);
    const uploadTimeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Upload failed - network timeout')), 8000)
    );

    await Promise.race([uploadPromise, uploadTimeoutPromise]);
    console.log("Quiz results uploaded to Firebase successfully. ID:", results.uniqueId);

  } catch (error) {
    console.error("Error pushing quiz results to Firebase:", error);

    // Store results locally for retry later
    storeResultsLocally(results);

    // Show user-friendly error message
    const quizContainer = getQuizContainer();
    if (quizContainer) {
      const errorElement = document.createElement('p');
      errorElement.textContent = "Pas de connexion internet. Résultats sauvegardés localement.";
      errorElement.style.color = '#856404';
      errorElement.style.fontSize = '14px';
      errorElement.style.marginTop = '10px';
      quizContainer.appendChild(errorElement);
    }
  }
}



/**
 * Manually trigger upload of pending results (useful for debugging or forcing uploads)
 */
async function forceUploadPendingResults() {
  console.log("Manually triggering upload of pending results...");
  try {
    await uploadPendingResults();
  } catch (error) {
    console.error("Error in manual upload:", error);
  }
}

/**
 * Store quiz results locally when upload fails
 */
function storeResultsLocally(results) {
  try {
    // Get existing pending results
    const existingResults = JSON.parse(localStorage.getItem('pendingQuizResults') || '[]');

    // Check if this uniqueId already exists in localStorage to prevent duplicates
    const existingIndex = existingResults.findIndex(result => result.uniqueId === results.uniqueId);
    if (existingIndex !== -1) {
      console.log(`Result with uniqueId ${results.uniqueId} already exists in localStorage, skipping duplicate`);
      return;
    }

    // Add new results with a timestamp
    const resultWithTimestamp = {
      ...results,
      localStorageTimestamp: new Date().toISOString()
    };

    existingResults.push(resultWithTimestamp);

    // Store back to localStorage
    localStorage.setItem('pendingQuizResults', JSON.stringify(existingResults));

    console.log(`Stored quiz results locally. Total pending: ${existingResults.length}`);
  } catch (error) {
    console.error("Error storing results locally:", error);
  }
}

/**
 * Upload all pending results from localStorage
 */
async function uploadPendingResults() {
  try {
    const pendingResults = JSON.parse(localStorage.getItem('pendingQuizResults') || '[]');

    if (pendingResults.length === 0) {
      return; // No pending results
    }

    console.log(`Found ${pendingResults.length} pending results to upload`);

    // Initialize Firebase if not already done
    await initializeFirebase();

        // Dynamic import for database functions
    const { ref, set, get } = await import("https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js");

    // Upload each pending result
    let successCount = 0;
    const failedResults = [];

    for (const result of pendingResults) {
      try {
        // Remove the local storage timestamp before uploading
        const cleanResult = { ...result };
        delete cleanResult.localStorageTimestamp;

                // Use the uniqueId as the Firebase key to prevent duplicates
        const resultRef = ref(database, `results/${cleanResult.uniqueId}`);

                // Quick existence check - if this fails, network is too bad to upload
        const checkPromise = get(resultRef);
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Network too slow for pending upload')), 3000)
        );

        const snapshot = await Promise.race([checkPromise, timeoutPromise]);
        if (snapshot.exists()) {
          console.log(`Pending result ${cleanResult.uniqueId} already exists in Firebase, skipping duplicate`);
          successCount++; // Count as success since it's already uploaded
          continue;
        }

        // Upload using set() with timeout
        const uploadPromise = set(resultRef, cleanResult);
        const uploadTimeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Pending upload failed - network timeout')), 8000)
        );

        await Promise.race([uploadPromise, uploadTimeoutPromise]);
        console.log(`Uploaded pending result. ID: ${cleanResult.uniqueId}`);
        successCount++;
      } catch (uploadError) {
        console.error("Failed to upload individual pending result:", uploadError);
        failedResults.push(result);
      }
    }



    // Update localStorage with only the failed uploads
    if (failedResults.length > 0) {
      localStorage.setItem('pendingQuizResults', JSON.stringify(failedResults));
      console.log(`${failedResults.length} results remain pending`);
    } else {
      // All uploaded successfully, clear localStorage
      localStorage.removeItem('pendingQuizResults');
      console.log('All pending results uploaded successfully');
    }

    // Only show notification if we actually uploaded some results AND there were pending results to begin with
    if (successCount > 0 && pendingResults.length > 0) {
      console.log(`Successfully uploaded ${successCount} pending results`);

      // Only show UI notification if there's a quiz container and we're not in start screen
      const quizContainer = getQuizContainer();
      if (quizContainer && !quizContainer.querySelector('.quiz-start')) {
        const notificationElement = document.createElement('p');
        notificationElement.textContent = `${successCount} résultat(s) en attente ont été envoyés avec succès.`;
        notificationElement.style.color = '#155724';
        notificationElement.style.fontSize = '14px';
        notificationElement.style.marginTop = '10px';
        notificationElement.style.backgroundColor = '#d4edda';
        notificationElement.style.padding = '8px';
        notificationElement.style.borderRadius = '4px';
        notificationElement.style.border = '1px solid #c3e6cb';
        quizContainer.appendChild(notificationElement);

        // Remove notification after 5 seconds
        setTimeout(() => {
          if (notificationElement.parentNode) {
            notificationElement.parentNode.removeChild(notificationElement);
          }
        }, 5000);
      }
    }

  } catch (error) {
    console.error("Error uploading pending results:", error);
  }
}

/**
 * Check and display the number of pending results
 */
function checkPendingResultsCount() {
  try {
    const pendingResults = JSON.parse(localStorage.getItem('pendingQuizResults') || '[]');
    return pendingResults.length;
  } catch (error) {
    console.error("Error checking pending results:", error);
    return 0;
  }
}

function generateQuizResults() {
  const completionTimestamp = new Date().toISOString();
  const wordResults = [];
  let   totalErrors = 0;

  // Process results for each word
  Object.keys(quizState.results).forEach(wordKey => {
    const wordData = quizState.results[wordKey];
    const attempts = wordData.attempts;

    // Count successes and failures by direction
    const stats = {
      french_to_slovak: { successes: 0, failures: 0 },
      slovak_to_french: { successes: 0, failures: 0 },
      matching:         { successes: 0, failures: 0 }
    };

    let wordErrors = 0;
    attempts.forEach(attempt => {
      if (attempt.isCorrect) {
        stats[attempt.direction].successes++;
      } else {
        stats[attempt.direction].failures++;
        wordErrors++;
      }
    });

    totalErrors += wordErrors;

    wordResults.push({
      word:                        wordKey,
      wordPair:                    wordData.wordPair,
      french_to_slovak_successes:  stats.french_to_slovak.successes,
      french_to_slovak_failures:   stats.french_to_slovak.failures,
      slovak_to_french_successes:  stats.slovak_to_french.successes,
      slovak_to_french_failures:   stats.slovak_to_french.failures,
      matching_successes:          stats.matching.successes,
      matching_failures:           stats.matching.failures,
      totalAttempts:               attempts.length,
      totalErrors:                 wordErrors
    });
  });

  // Normalize quiz type for database storage to maintain backwards compatibility
  let databaseQuizType = quizState.quizType;
  if (quizState.quizType === 'slovak_to_french_typing' || quizState.quizType === 'french_to_slovak_typing') {
    databaseQuizType = 'typing';
  }

  // Generate a unique ID to prevent duplicates from race conditions
  const uniqueId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  return {
    uniqueId:             uniqueId, // Add unique identifier to prevent duplicates
    completionTimestamp:  completionTimestamp,
    totalQuestions:       quizState.totalQuestions,
    wordsCount:           quizState.selectedWordPairs.length,
    quizType:             databaseQuizType,
    quizName:             quizState.quizName,
    totalErrors:          totalErrors,
    words:                wordResults
  };
}

function clearQuizResults() {
  // Clear the results after they have been recorded
  quizState.results = {};
  console.log('Quiz results cleared - ready for database push');
}

function restartQuiz() {
  // Only set isFirstStart to true if we're starting a completely new sequence (after French to Slovak typing)
  if (quizState.quizType === 'french_to_slovak_typing') {
    quizState.isFirstStart = true; // Reset to first start for new sequence
  }
  initializeQuiz();
}
