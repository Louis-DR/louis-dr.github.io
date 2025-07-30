// Quiz state management
let quizState = {
  selectedWordPairs: [],
  incorrectPairs:    [],
  totalQuestions:    0,
  correctAnswers:    0,
  results:           {}, // Track detailed results for each word pair
  quizType:          'matching', // 'matching', 'multiple_choice', or 'typing'
  originalWordPairs: [], // Store original word pairs for restarting
  isInitialized:     false, // Track if quiz has been started
  quizName:          'Slovak Language Quiz', // Default quiz name
  matchingSelections: {}, // Track matching quiz selections
  matchingPairs:     {}, // Track current matching pairs
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
  if (quizState.isFirstStart || !quizState.quizType || quizState.quizType === 'typing') {
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
  } else {
    // Moving from multiple choice to typing with same words
    quizState.quizType = 'typing';
    // Keep the same selectedWordPairs from the previous quiz
  }

  // Reset quiz state for the new quiz
  quizState.incorrectPairs = [...quizState.selectedWordPairs];
  quizState.totalQuestions = 0;
  quizState.correctAnswers = 0;
  quizState.results = {};
  quizState.matchingSelections = {};
  quizState.matchingPairs = {};

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
  } else {
    generateTypingQuestion();
  }
}

function showStartScreen() {
  const quizContainer = getQuizContainer();
  if (!quizContainer) return;

  quizContainer.innerHTML = ''; // Clear previous content

  const startElement = document.createElement('div');
  startElement.className = 'quiz-start';
  startElement.innerHTML = `<button class="start-button" id="start-quiz-button">Commencer le Quiz "${quizState.quizName}"</button>`;

  quizContainer.appendChild(startElement);

  // Add event listener for the start button
  setTimeout(() => {
    const startButton = document.getElementById('start-quiz-button');
    if (startButton) {
      startButton.addEventListener('click', startQuiz);
    }
  }, 0);
}

function startQuiz() {
  quizState.isInitialized = true;
  // Mark this as first quiz start to avoid transition logic
  quizState.isFirstStart = true;
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
  submitButton.className   = 'submit-button';
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
      frenchButton.classList.add('correct-answer');
      slovakButton.classList.add('correct-answer');
      correctPairs++;
      console.log(`correct: ${frenchWord} - ${slovakWord}`);
    } else {
      // Mark as incorrect
      frenchButton.classList.add('wrong-answer');
      if (userSlovakButton) {
        userSlovakButton.classList.add('wrong-answer');
      }

      // Show the correct answer
      slovakButton.classList.add('correct-answer');

      totalErrors++;
      console.log(`incorrect: ${frenchWord} - ${userSlovakWord || 'none'}, correct: ${slovakWord}`);
    }
  });

  // Update quiz state
  if (correctPairs === quizState.selectedWordPairs.length) {
    // All correct - remove from incorrect pairs
    quizState.incorrectPairs = [];
    quizState.correctAnswers = quizState.selectedWordPairs.length;
  } else {
    // Some incorrect - keep all pairs for next quiz types
    quizState.incorrectPairs = [...quizState.selectedWordPairs];
    quizState.correctAnswers = 0;
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
      if (frenchButton.classList.contains('correct-answer') && slovakButton.classList.contains('correct-answer') && !slovakButton.classList.contains('show-correct')) {
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
  // Check if there are any incorrect pairs left
  if (quizState.incorrectPairs.length === 0) {
    showQuizCompletion();
    return;
  }

  // Select a random word pair from the incorrect pairs
  const questionPairIndex = Math.floor(Math.random() * quizState.incorrectPairs.length);
  const questionPair      = quizState.incorrectPairs[questionPairIndex];

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
    button.className   = 'choice-button';
    button.addEventListener('click', () => handleAnswerClick(button, choice, correctAnswer, choiceButtons, questionPair, isFrenchQuestion));
    choiceButtons.push(button);
    choicesContainer.appendChild(button);
  });

  quizState.totalQuestions++;
}

function generateTypingQuestion() {
  // Check if there are any incorrect pairs left
  if (quizState.incorrectPairs.length === 0) {
    showQuizCompletion();
    return;
  }

  // Select a random word pair from the incorrect pairs
  const questionPairIndex = Math.floor(Math.random() * quizState.incorrectPairs.length);
  const questionPair      = quizState.incorrectPairs[questionPairIndex];

  // Decide randomly which language is the question and which is the answer
  const isFrenchQuestion = Math.random() < 0.5;
  const questionText     = isFrenchQuestion ? questionPair[0] : questionPair[1];
  const correctAnswer    = isFrenchQuestion ? questionPair[1] : questionPair[0];

  // Get the quiz container element
  const quizContainer = getQuizContainer();
  if (!quizContainer) return;

  quizContainer.innerHTML = ''; // Clear previous content

  // Add progress indicator
  const progressElement = createProgressElement(`Progrès: ${quizState.correctAnswers}/${quizState.selectedWordPairs.length} mots maîtrisés`);
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
  inputField.className    = 'typing-input';
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
    charButton.className   = 'special-char-button';
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
  submitButton.className   = 'submit-button';
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

function handleAnswerClick(clickedButton, selectedAnswer, correctAnswer, allButtons, questionPair, isFrenchQuestion) {
  // Disable all buttons to prevent multiple selections
  allButtons.forEach(button => {
    button.disabled = true;
  });

  // Highlight the correct answer in green
  allButtons.forEach(button => {
    if (button.textContent === correctAnswer) {
      button.classList.add('correct-answer');

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

    // Remove this pair from incorrect pairs if it's there
    const incorrectPairIndex = quizState.incorrectPairs.findIndex(pair =>
      (pair[0] === questionPair[0] && pair[1] === questionPair[1]) ||
      (pair[0] === questionPair[1] && pair[1] === questionPair[0])
    );

    if (incorrectPairIndex !== -1) {
      quizState.incorrectPairs.splice(incorrectPairIndex, 1);
      quizState.correctAnswers++;
    }
  } else {
    // If the clicked answer is wrong, highlight it in red
    clickedButton.classList.add('wrong-answer');
    console.log("incorrect");

    // Make sure this pair stays in the incorrect pairs (it should already be there)
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
  feedbackElement.className = 'typing-feedback';

  if (isCorrect) {
    feedbackElement.innerHTML = `<span class="correct-feedback">✓ Correct!</span>`;
    inputField.classList.add('correct-input');
  } else {
    feedbackElement.innerHTML = `
      <span class="wrong-feedback">✗ Incorrect</span><br>
      <span class="correct-answer-display">Réponse correcte: "${correctAnswer}"</span>
    `;
    inputField.classList.add('wrong-input');

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

    // Remove this pair from incorrect pairs if it's there
    const incorrectPairIndex = quizState.incorrectPairs.findIndex(pair =>
      (pair[0] === questionPair[0] && pair[1] === questionPair[1]) ||
      (pair[0] === questionPair[1] && pair[1] === questionPair[0])
    );

    if (incorrectPairIndex !== -1) {
      quizState.incorrectPairs.splice(incorrectPairIndex, 1);
      quizState.correctAnswers++;
    }
  } else {
    console.log("incorrect");

    // Make sure this pair stays in the incorrect pairs (it should already be there)
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
  nextButton.className   = 'next-button';
  nextButton.addEventListener('click', () => {
    // Check if current quiz type should continue or transition
    if (quizState.incorrectPairs.length > 0) {
      // Continue with current quiz type until mastery
      if (quizState.quizType === 'multiple_choice') {
        generateNextQuestion();
      } else if (quizState.quizType === 'typing') {
        generateTypingQuestion();
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
    nextQuizTypeDisplay = 'Saisie';
  } else {
    nextQuizTypeDisplay = 'Correspondances';
  }

  completionElement.innerHTML = `
    <p>Questions Répondues: <strong>${quizState.totalQuestions}</strong></p>
    <p>Prochain Quiz: <strong>${nextQuizTypeDisplay}</strong></p>
    <button class="next-button" id="restart-quiz-button">Commencer</button>
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
    // Dynamic imports to avoid CORS issues with file:// protocol
    const { initializeApp } = await import("https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js");
    const { getDatabase }   = await import("https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js");

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
    // Initialize Firebase if not already done
    await initializeFirebase();

    // Dynamic import for database functions
    const { ref, push } = await import("https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js");

    // Define the reference to the 'results' node
    const resultsRef = ref(database, 'results');

    // Push the quiz results. Firebase will generate a unique key for this entry.
    const newEntryRef = await push(resultsRef, results);
    const newKey = newEntryRef.key;
    console.log("Quiz results pushed to Firebase successfully. Entry key:", newKey);
  } catch (error) {
    console.error("Error pushing quiz results to Firebase:", error);

    // Show user-friendly error message
    const quizContainer = getQuizContainer();
    if (quizContainer) {
      const errorElement  = document.createElement('p');
      errorElement.textContent     = "Erreur d'enregistrement dans la base de donnée.";
      errorElement.style.color     = '#dc3545';
      errorElement.style.fontSize  = '14px';
      errorElement.style.marginTop = '10px';
      quizContainer.appendChild(errorElement);
    }
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

  return {
    completionTimestamp:  completionTimestamp,
    totalQuestions:       quizState.totalQuestions,
    wordsCount:           quizState.selectedWordPairs.length,
    quizType:             quizState.quizType,
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
  // Only set isFirstStart to true if we're starting a completely new sequence (after typing)
  if (quizState.quizType === 'typing') {
    quizState.isFirstStart = true; // Reset to first start for new sequence
  }
  initializeQuiz();
}
